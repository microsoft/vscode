/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as stream from 'stream';
import { SocksClient, SocksClientOptions } from 'socks';
import * as vscode from 'vscode';
import * as ssh2 from 'ssh2';
import type { ParsedKey } from 'ssh2-streams';
import Log from './common/logger';
import SSHDestination from './ssh/sshDestination';
import SSHConnection, { SSHTunnelConfig } from './ssh/sshConnection';
import SSHConfiguration from './ssh/sshConfig';
import { gatherIdentityFiles } from './ssh/identityFiles';
import { untildify, exists as fileExists } from './common/files';
import { findRandomPort } from './common/ports';
import { disposeAll } from './common/disposable';
import { installCodeServer, ServerInstallError } from './serverSetup';
import { isWindows } from './common/platform';
import * as os from 'os';

const PASSWORD_RETRY_COUNT = 3;
const PASSPHRASE_RETRY_COUNT = 3;

export const REMOTE_SSH_AUTHORITY = 'ssh-remote';

export function getRemoteAuthority(host: string) {
	return `${REMOTE_SSH_AUTHORITY}+${host}`;
}

class TunnelInfo implements vscode.Disposable {
	constructor(
		readonly localPort: number,
		readonly remotePortOrSocketPath: number | string,
		private disposables: vscode.Disposable[]
	) {
	}

	dispose() {
		disposeAll(this.disposables);
	}
}

interface SSHKey {
	filename: string;
	parsedKey: ParsedKey;
	fingerprint: string;
	agentSupport?: boolean;
	isPrivate?: boolean;
}

export class RemoteSSHResolver implements vscode.RemoteAuthorityResolver, vscode.Disposable {

	private proxyConnections: SSHConnection[] = [];
	private sshConnection: SSHConnection | undefined;
	private sshAgentSock: string | undefined;
	private proxyCommandProcess: cp.ChildProcessWithoutNullStreams | undefined;

	private socksTunnel: SSHTunnelConfig | undefined;
	private tunnels: TunnelInfo[] = [];

	private labelFormatterDisposable: vscode.Disposable | undefined;

	constructor(
		readonly context: vscode.ExtensionContext,
		readonly logger: Log
	) {
	}

	resolve(authority: string, context: vscode.RemoteAuthorityResolverContext): Thenable<vscode.ResolverResult> {
		const [type, dest] = authority.split('+');
		if (type !== REMOTE_SSH_AUTHORITY) {
			throw new Error(`Invalid authority type for SSH resolver: ${type}`);
		}

		this.logger.info(`Resolving ssh remote authority '${authority}' (attemp #${context.resolveAttempt})`);

		const sshDest = SSHDestination.parseEncoded(dest);

		// It looks like default values are not loaded yet when resolving a remote,
		// so let's hardcode the default values here
		const remoteSSHconfig = vscode.workspace.getConfiguration('remote.SSH');
		const enableDynamicForwarding = remoteSSHconfig.get<boolean>('enableDynamicForwarding', true)!;
		const enableAgentForwarding = remoteSSHconfig.get<boolean>('enableAgentForwarding', true)!;
		const serverDownloadUrlTemplate = remoteSSHconfig.get<string>('serverDownloadUrlTemplate');
		const defaultExtensions = remoteSSHconfig.get<string[]>('defaultExtensions', []);
		const remotePlatformMap = remoteSSHconfig.get<Record<string, string>>('remotePlatform', {});
		const remoteServerListenOnSocket = remoteSSHconfig.get<boolean>('remoteServerListenOnSocket', false)!;
		const connectTimeout = remoteSSHconfig.get<number>('connectTimeout', 60)!;

		return vscode.window.withProgress({
			title: `Setting up SSH Host ${sshDest.hostname}`,
			location: vscode.ProgressLocation.Notification,
			cancellable: false
		}, async () => {
			try {
				const sshconfig = await SSHConfiguration.loadFromFS();
				const sshHostConfig = sshconfig.getHostConfiguration(sshDest.hostname);
				const sshHostName = sshHostConfig['HostName'] ? sshHostConfig['HostName'].replace('%h', sshDest.hostname) : sshDest.hostname;
				const sshUser = sshHostConfig['User'] || sshDest.user || os.userInfo().username || ''; // https://github.com/openssh/openssh-portable/blob/5ec5504f1d328d5bfa64280cd617c3efec4f78f3/sshconnect.c#L1561-L1562
				const sshPort = sshHostConfig['Port'] ? parseInt(sshHostConfig['Port'], 10) : (sshDest.port || 22);

				this.sshAgentSock = sshHostConfig['IdentityAgent'] || process.env['SSH_AUTH_SOCK'] || (isWindows ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined);
				this.sshAgentSock = this.sshAgentSock ? untildify(this.sshAgentSock) : undefined;
				const agentForward = enableAgentForwarding && (sshHostConfig['ForwardAgent'] || 'no').toLowerCase() === 'yes';
				const agent = agentForward && this.sshAgentSock ? new ssh2.OpenSSHAgent(this.sshAgentSock) : undefined;

				const preferredAuthentications = sshHostConfig['PreferredAuthentications'] ? sshHostConfig['PreferredAuthentications'].split(',').map(s => s.trim()) : ['publickey', 'password', 'keyboard-interactive'];

				const identityFiles: string[] = (sshHostConfig['IdentityFile'] as unknown as string[]) || [];
				const identitiesOnly = (sshHostConfig['IdentitiesOnly'] || 'no').toLowerCase() === 'yes';
				const identityKeys = await gatherIdentityFiles(identityFiles, this.sshAgentSock, identitiesOnly, this.logger);

				// Create proxy jump connections if any
				let proxyStream: ssh2.ClientChannel | stream.Duplex | undefined;
				if (sshHostConfig['ProxyJump']) {
					const proxyJumps = sshHostConfig['ProxyJump'].split(',').filter(i => !!i.trim())
						.map(i => {
							const proxy = SSHDestination.parse(i);
							const proxyHostConfig = sshconfig.getHostConfiguration(proxy.hostname);
							return [proxy, proxyHostConfig] as [SSHDestination, Record<string, string>];
						});
					for (let i = 0; i < proxyJumps.length; i++) {
						const [proxy, proxyHostConfig] = proxyJumps[i];
						const proxyHostName = proxyHostConfig['HostName'] || proxy.hostname;
						const proxyUser = proxyHostConfig['User'] || proxy.user || sshUser;
						const proxyPort = proxyHostConfig['Port'] ? parseInt(proxyHostConfig['Port'], 10) : (proxy.port || sshPort);

						const proxyAgentForward = enableAgentForwarding && (proxyHostConfig['ForwardAgent'] || 'no').toLowerCase() === 'yes';
						const proxyAgent = proxyAgentForward && this.sshAgentSock ? new ssh2.OpenSSHAgent(this.sshAgentSock) : undefined;

						const proxyIdentityFiles: string[] = (proxyHostConfig['IdentityFile'] as unknown as string[]) || [];
						const proxyIdentitiesOnly = (proxyHostConfig['IdentitiesOnly'] || 'no').toLowerCase() === 'yes';
						const proxyIdentityKeys = await gatherIdentityFiles(proxyIdentityFiles, this.sshAgentSock, proxyIdentitiesOnly, this.logger);

						const proxyAuthHandler = this.getSSHAuthHandler(proxyUser, proxyHostName, proxyIdentityKeys, preferredAuthentications);
						const proxyConnection = new SSHConnection({
							host: !proxyStream ? proxyHostName : undefined,
							port: !proxyStream ? proxyPort : undefined,
							sock: proxyStream,
							username: proxyUser,
							readyTimeout: connectTimeout * 1000,
							strictVendor: false,
							agentForward: proxyAgentForward,
							agent: proxyAgent,
							authHandler: (arg0, arg1, arg2) => (proxyAuthHandler(arg0, arg1, arg2), undefined)
						});
						this.proxyConnections.push(proxyConnection);

						const nextProxyJump = i < proxyJumps.length - 1 ? proxyJumps[i + 1] : undefined;
						const destIP = nextProxyJump ? (nextProxyJump[1]['HostName'] || nextProxyJump[0].hostname) : sshHostName;
						const destPort = nextProxyJump ? ((nextProxyJump[1]['Port'] && parseInt(nextProxyJump[1]['Port'], 10)) || nextProxyJump[0].port || 22) : sshPort;
						proxyStream = await proxyConnection.forwardOut('127.0.0.1', 0, destIP, destPort);
					}
				} else if (sshHostConfig['ProxyCommand']) {
					let proxyArgs = (sshHostConfig['ProxyCommand'] as unknown as string[])
						.map((arg) => arg.replace('%h', sshHostName).replace('%n', sshDest.hostname).replace('%p', sshPort.toString()).replace('%r', sshUser));
					let proxyCommand = proxyArgs.shift()!;

					let options = {};
					if (isWindows && /\.(bat|cmd)$/.test(proxyCommand)) {
						proxyCommand = `"${proxyCommand}"`;
						proxyArgs = proxyArgs.map((arg) => arg.includes(' ') ? `"${arg}"` : arg);
						options = { shell: true, windowsHide: true, windowsVerbatimArguments: true };
					}

					this.logger.trace(`Spawning ProxyCommand: ${proxyCommand} ${proxyArgs.join(' ')}`);

					const child = cp.spawn(proxyCommand, proxyArgs, options);
					proxyStream = stream.Duplex.from({ readable: child.stdout, writable: child.stdin });
					this.proxyCommandProcess = child;
				}

				// Create final shh connection
				const sshAuthHandler = this.getSSHAuthHandler(sshUser, sshHostName, identityKeys, preferredAuthentications);

				this.sshConnection = new SSHConnection({
					host: !proxyStream ? sshHostName : undefined,
					port: !proxyStream ? sshPort : undefined,
					sock: proxyStream,
					username: sshUser,
					readyTimeout: connectTimeout * 1000,
					strictVendor: false,
					agentForward,
					agent,
					authHandler: (arg0, arg1, arg2) => (sshAuthHandler(arg0, arg1, arg2), undefined),
				});
				await this.sshConnection.connect();

				const envVariables: Record<string, string | null> = {};
				if (agentForward) {
					envVariables['SSH_AUTH_SOCK'] = null;
				}

				const installResult = await installCodeServer(this.sshConnection, serverDownloadUrlTemplate, defaultExtensions, Object.keys(envVariables), remotePlatformMap[sshDest.hostname], remoteServerListenOnSocket, this.logger);

				for (const key of Object.keys(envVariables)) {
					if (installResult[key] !== undefined) {
						envVariables[key] = installResult[key];
					}
				}

				// Update terminal env variables
				this.context.environmentVariableCollection.persistent = false;
				for (const [key, value] of Object.entries(envVariables)) {
					if (value) {
						this.context.environmentVariableCollection.replace(key, value);
					}
				}

				if (enableDynamicForwarding) {
					const socksPort = await findRandomPort();
					this.socksTunnel = await this.sshConnection!.addTunnel({
						name: `ssh_tunnel_socks_${socksPort}`,
						localPort: socksPort,
						socks: true
					});
				}

				const tunnelConfig = await this.openTunnel(0, installResult.listeningOn);
				this.tunnels.push(tunnelConfig);

				// Enable ports view
				vscode.commands.executeCommand('setContext', 'forwardedPortsViewEnabled', true);

				this.labelFormatterDisposable?.dispose();
				this.labelFormatterDisposable = vscode.workspace.registerResourceLabelFormatter({
					scheme: 'vscode-remote',
					authority: `${REMOTE_SSH_AUTHORITY}+*`,
					formatting: {
						label: '${path}',
						separator: '/',
						tildify: true,
						workspaceSuffix: `SSH: ${sshDest.hostname}` + (sshDest.port && sshDest.port !== 22 ? `:${sshDest.port}` : '')
					}
				});

				const resolvedResult: vscode.ResolverResult = new vscode.ResolvedAuthority('127.0.0.1', tunnelConfig.localPort, installResult.connectionToken);
				resolvedResult.extensionHostEnv = envVariables;
				return resolvedResult;
			} catch (e: unknown) {
				this.logger.error(`Error resolving authority`, e);

				// Initial connection
				if (context.resolveAttempt === 1) {
					this.logger.show();

					const closeRemote = 'Close Remote';
					const retry = 'Retry';
					const result = await vscode.window.showErrorMessage(`Could not establish connection to "${sshDest.hostname}"`, { modal: true }, closeRemote, retry);
					if (result === closeRemote) {
						await vscode.commands.executeCommand('workbench.action.remote.close');
					} else if (result === retry) {
						await vscode.commands.executeCommand('workbench.action.reloadWindow');
					}
				}

				if (e instanceof ServerInstallError || !(e instanceof Error)) {
					throw vscode.RemoteAuthorityResolverError.NotAvailable(e instanceof Error ? e.message : String(e));
				} else {
					throw vscode.RemoteAuthorityResolverError.TemporarilyNotAvailable(e.message);
				}
			}
		});
	}

	private async openTunnel(localPort: number, remotePortOrSocketPath: number | string) {
		localPort = localPort > 0 ? localPort : await findRandomPort();

		const disposables: vscode.Disposable[] = [];
		const remotePort = typeof remotePortOrSocketPath === 'number' ? remotePortOrSocketPath : undefined;
		const remoteSocketPath = typeof remotePortOrSocketPath === 'string' ? remotePortOrSocketPath : undefined;
		if (this.socksTunnel && remotePort) {
			const forwardingServer = await new Promise<net.Server>((resolve, reject) => {
				this.logger.trace(`Creating forwarding server ${localPort}(local) => ${this.socksTunnel!.localPort!}(socks) => ${remotePort}(remote)`);
				const socksOptions: SocksClientOptions = {
					proxy: {
						host: '127.0.0.1',
						port: this.socksTunnel!.localPort!,
						type: 5
					},
					command: 'connect',
					destination: {
						host: '127.0.0.1',
						port: remotePort
					}
				};
				const server: net.Server = net.createServer()
					.on('error', reject)
					.on('connection', async (socket: net.Socket) => {
						try {
							const socksConn = await SocksClient.createConnection(socksOptions);
							socket.pipe(socksConn.socket);
							socksConn.socket.pipe(socket);
						} catch (error) {
							this.logger.error(`Error while creating SOCKS connection`, error);
						}
					})
					.on('listening', () => resolve(server))
					.listen(localPort);
			});
			disposables.push({
				dispose: () => forwardingServer.close(() => {
					this.logger.trace(`SOCKS forwading server closed`);
				}),
			});
		} else {
			this.logger.trace(`Opening tunnel ${localPort}(local) => ${remotePortOrSocketPath}(remote)`);
			const tunnelConfig = await this.sshConnection!.addTunnel({
				name: `ssh_tunnel_${localPort}_${remotePortOrSocketPath}`,
				remoteAddr: '127.0.0.1',
				remotePort,
				remoteSocketPath,
				localPort
			});
			disposables.push({
				dispose: () => {
					this.sshConnection?.closeTunnel(tunnelConfig.name);
					this.logger.trace(`Tunnel ${tunnelConfig.name} closed`);
				}
			});
		}

		return new TunnelInfo(localPort, remotePortOrSocketPath, disposables);
	}

	private getSSHAuthHandler(sshUser: string, sshHostName: string, identityKeys: SSHKey[], preferredAuthentications: string[]) {
		let passwordRetryCount = PASSWORD_RETRY_COUNT;
		let keyboardRetryCount = PASSWORD_RETRY_COUNT;
		identityKeys = identityKeys.slice();
		return async (methodsLeft: string[] | null, _partialSuccess: boolean | null, callback: (nextAuth: ssh2.AuthHandlerResult) => void) => {
			if (methodsLeft === null) {
				this.logger.info(`Trying no-auth authentication`);

				return callback({
					type: 'none',
					username: sshUser,
				});
			}
			if (methodsLeft.includes('publickey') && identityKeys.length && preferredAuthentications.includes('publickey')) {
				const identityKey = identityKeys.shift()!;

				this.logger.info(`Trying publickey authentication: ${identityKey.filename} ${identityKey.parsedKey.type} SHA256:${identityKey.fingerprint}`);

				if (identityKey.agentSupport) {
					return callback({
						type: 'agent',
						username: sshUser,
						agent: new class extends ssh2.OpenSSHAgent {
							// Only return the current key
							override getIdentities(callback: (err: Error | undefined, publicKeys?: ParsedKey[]) => void): void {
								callback(undefined, [identityKey.parsedKey]);
							}
						}(this.sshAgentSock!)
					});
				}
				if (identityKey.isPrivate) {
					return callback({
						type: 'publickey',
						username: sshUser,
						key: identityKey.parsedKey
					});
				}
				if (!await fileExists(identityKey.filename)) {
					// Try next identity file
					return callback(null as any);
				}

				const keyBuffer = await fs.promises.readFile(identityKey.filename);
				let result = ssh2.utils.parseKey(keyBuffer); // First try without passphrase
				if (result instanceof Error && result.message === 'Encrypted private OpenSSH key detected, but no passphrase given') {
					let passphraseRetryCount = PASSPHRASE_RETRY_COUNT;
					while (result instanceof Error && passphraseRetryCount > 0) {
						const passphrase = await vscode.window.showInputBox({
							title: `Enter passphrase for ${identityKey.filename}`,
							password: true,
							ignoreFocusOut: true
						});
						if (!passphrase) {
							break;
						}
						result = ssh2.utils.parseKey(keyBuffer, passphrase);
						passphraseRetryCount--;
					}
				}
				if (!result || result instanceof Error) {
					// Try next identity file
					return callback(null as any);
				}

				const key = Array.isArray(result) ? result[0] : result;
				return callback({
					type: 'publickey',
					username: sshUser,
					key
				});
			}
			if (methodsLeft.includes('password') && passwordRetryCount > 0 && preferredAuthentications.includes('password')) {
				if (passwordRetryCount === PASSWORD_RETRY_COUNT) {
					this.logger.info(`Trying password authentication`);
				}

				const password = await vscode.window.showInputBox({
					title: `Enter password for ${sshUser}@${sshHostName}`,
					password: true,
					ignoreFocusOut: true
				});
				passwordRetryCount--;

				return callback(password
					? {
						type: 'password',
						username: sshUser,
						password
					}
					: false);
			}
			if (methodsLeft.includes('keyboard-interactive') && keyboardRetryCount > 0 && preferredAuthentications.includes('keyboard-interactive')) {
				if (keyboardRetryCount === PASSWORD_RETRY_COUNT) {
					this.logger.info(`Trying keyboard-interactive authentication`);
				}

				return callback({
					type: 'keyboard-interactive',
					username: sshUser,
					prompt: async (_name, _instructions, _instructionsLang, prompts, finish) => {
						const responses: string[] = [];
						for (const prompt of prompts) {
							const response = await vscode.window.showInputBox({
								title: `(${sshUser}@${sshHostName}) ${prompt.prompt}`,
								password: !prompt.echo,
								ignoreFocusOut: true
							});
							if (response === undefined) {
								keyboardRetryCount = 0;
								break;
							}
							responses.push(response);
						}
						keyboardRetryCount--;
						finish(responses);
					}
				});
			}

			callback(false);
		};
	}

	dispose() {
		disposeAll(this.tunnels);
		// If there's proxy connections then just close the parent connection
		if (this.proxyConnections.length) {
			this.proxyConnections[0].close();
		} else {
			this.sshConnection?.close();
		}
		this.proxyCommandProcess?.kill();
		this.labelFormatterDisposable?.dispose();
	}
}
