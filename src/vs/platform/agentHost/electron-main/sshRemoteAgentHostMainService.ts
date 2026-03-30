/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { dirname, join, isAbsolute, basename } from '../../../base/common/path.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import {
	ISSHRemoteAgentHostMainService,
	SSHAuthMethod,
	type ISSHAgentHostConfig,
	type ISSHAgentHostConfigSanitized,
	type ISSHConnectResult,
	type ISSHResolvedConfig,
} from '../common/sshRemoteAgentHost.js';

const _require = createRequire(import.meta.url);

/** Minimal subset of ssh2.ClientChannel used by this module. */
interface SSHChannel {
	on(event: 'data', listener: (data: Buffer) => void): SSHChannel;
	on(event: 'close', listener: (code: number) => void): SSHChannel;
	on(event: 'error', listener: (err: Error) => void): SSHChannel;
	stderr: { on(event: 'data', listener: (data: Buffer) => void): void };
	close(): void;
	pipe(destination: SSHChannel | net.Socket): SSHChannel | net.Socket;
}

/** Minimal subset of ssh2.Client used by this module. */
interface SSHClient {
	on(event: 'ready', listener: () => void): SSHClient;
	on(event: 'error', listener: (err: Error) => void): SSHClient;
	on(event: 'close', listener: () => void): SSHClient;
	connect(config: Record<string, unknown>): void;
	exec(command: string, callback: (err: Error | undefined, stream: SSHChannel) => void): SSHClient;
	forwardOut(srcIP: string, srcPort: number, dstIP: string, dstPort: number, callback: (err: Error | undefined, channel: SSHChannel) => void): SSHClient;
	end(): void;
}

const LOG_PREFIX = '[SSHRemoteAgentHost]';

/** Install location for the VS Code CLI on the remote machine. */
const REMOTE_CLI_DIR = '~/.vscode-cli';
const REMOTE_CLI_BIN = `${REMOTE_CLI_DIR}/code`;

function resolveRemotePlatform(unameS: string, unameM: string): { os: string; arch: string } | undefined {
	const os = unameS.trim().toLowerCase();
	const machine = unameM.trim().toLowerCase();

	let platformOs: string;
	if (os === 'linux') {
		platformOs = 'linux';
	} else if (os === 'darwin') {
		platformOs = 'darwin';
	} else {
		return undefined;
	}

	let arch: string;
	if (machine === 'x86_64' || machine === 'amd64') {
		arch = 'x64';
	} else if (machine === 'aarch64' || machine === 'arm64') {
		arch = 'arm64';
	} else if (machine === 'armv7l') {
		arch = 'armhf';
	} else {
		return undefined;
	}

	return { os: platformOs, arch };
}

function buildCLIDownloadUrl(os: string, arch: string, quality: string): string {
	return `https://update.code.visualstudio.com/latest/cli-${os}-${arch}/${quality}`;
}

function sshExec(client: SSHClient, command: string, opts?: { ignoreExitCode?: boolean }): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
		client.exec(command, (err: Error | undefined, stream: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}

			let stdout = '';
			let stderr = '';

			stream.on('data', (data: Buffer) => { stdout += data.toString(); });
			stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			stream.on('close', (code: number) => {
				if (code !== 0 && !opts?.ignoreExitCode) {
					reject(new Error(`SSH command failed (exit ${code}): ${command}\nstderr: ${stderr}`));
				} else {
					resolve({ stdout, stderr, code });
				}
			});
		});
	});
}

/** Redact connection tokens from log output. */
function redactToken(text: string): string {
	return text.replace(/\?tkn=[^\s&]+/g, '?tkn=***');
}

function startRemoteAgentHost(
	client: SSHClient,
	logService: ILogService,
): Promise<{ port: number; connectionToken: string | undefined; stream: SSHChannel }> {
	return new Promise((resolve, reject) => {
		const cmd = `${REMOTE_CLI_BIN} agent-host --port 0 --accept-server-license-terms`;
		logService.info(`${LOG_PREFIX} Starting remote agent host: ${cmd}`);

		client.exec(cmd, (err: Error | undefined, stream: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}

			let resolved = false;
			let outputBuf = '';

			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					reject(new Error(`${LOG_PREFIX} Timed out waiting for agent host to start.\noutput so far: ${redactToken(outputBuf)}`));
				}
			}, 60_000);

			const checkForAddress = () => {
				if (!resolved) {
					const match = outputBuf.match(/ws:\/\/127\.0\.0\.1:(\d+)(?:\?tkn=([^\s&]+))?/);
					if (match) {
						resolved = true;
						clearTimeout(timeout);
						const port = parseInt(match[1], 10);
						const connectionToken = match[2] || undefined;
						logService.info(`${LOG_PREFIX} Remote agent host listening on port ${port}`);
						resolve({ port, connectionToken, stream });
					}
				}
			};

			stream.stderr.on('data', (data: Buffer) => {
				const text = data.toString();
				outputBuf += text;
				logService.trace(`${LOG_PREFIX} remote stderr: ${redactToken(text.trimEnd())}`);
				checkForAddress();
			});

			stream.on('data', (data: Buffer) => {
				const text = data.toString();
				outputBuf += text;
				logService.trace(`${LOG_PREFIX} remote stdout: ${redactToken(text.trimEnd())}`);
				checkForAddress();
			});

			stream.on('close', (code: number) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					reject(new Error(`${LOG_PREFIX} Agent host process exited with code ${code} before becoming ready.\noutput: ${redactToken(outputBuf)}`));
				}
			});
		});
	});
}

function createLocalForwarder(
	client: SSHClient,
	dstHost: string,
	dstPort: number,
	logService: ILogService,
): Promise<{ server: net.Server; localPort: number }> {
	return new Promise((resolve, reject) => {
		const server = net.createServer((socket: net.Socket) => {
			client.forwardOut(
				'127.0.0.1',
				socket.localPort ?? 0,
				dstHost,
				dstPort,
				(err: Error | undefined, channel: SSHChannel) => {
					if (err) {
						logService.warn(`${LOG_PREFIX} forwardOut error: ${err.message}`);
						socket.end();
						return;
					}
					socket.pipe(channel as unknown as net.Socket).pipe(socket);
				},
			);
		});

		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			const localPort = typeof addr === 'object' && addr ? addr.port : 0;
			logService.info(`${LOG_PREFIX} Local forwarder listening on 127.0.0.1:${localPort} → remote ${dstHost}:${dstPort}`);
			resolve({ server, localPort });
		});
	});
}

function sanitizeConfig(config: ISSHAgentHostConfig): ISSHAgentHostConfigSanitized {
	const { password: _p, privateKeyPath: _k, ...sanitized } = config;
	return sanitized;
}

class SSHConnection extends Disposable {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	readonly config: ISSHAgentHostConfigSanitized;
	private _closed = false;

	constructor(
		fullConfig: ISSHAgentHostConfig,
		readonly localAddress: string,
		readonly name: string,
		readonly connectionToken: string | undefined,
		sshClient: SSHClient,
		localServer: net.Server,
		remoteStream: SSHChannel,
	) {
		super();

		this.config = sanitizeConfig(fullConfig);

		this._register(toDisposable(() => {
			if (this._closed) {
				return;
			}
			this._closed = true;
			remoteStream.close();
			localServer.close();
			sshClient.end();
			this._onDidClose.fire();
		}));

		sshClient.on('close', () => {
			this.dispose();
		});

		sshClient.on('error', () => {
			this.dispose();
		});
	}
}

export class SSHRemoteAgentHostMainService extends Disposable implements ISSHRemoteAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	private readonly _onDidCloseConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection: Event<string> = this._onDidCloseConnection.event;

	private readonly _connections = new Map<string, SSHConnection>();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async connect(config: ISSHAgentHostConfig): Promise<ISSHConnectResult> {
		const connectionKey = `${config.username}@${config.host}:${config.port ?? 22}`;

		const existing = this._connections.get(connectionKey);
		if (existing) {
			return {
				localAddress: existing.localAddress,
				name: existing.name,
				connectionToken: existing.connectionToken,
				config: existing.config,
			};
		}

		this._logService.info(`${LOG_PREFIX} Connecting to ${connectionKey}...`);
		let sshClient: SSHClient | undefined;

		try {
			const ssh2Module = _require('ssh2') as { Client: new () => unknown };

			// 1. Establish SSH connection
			sshClient = await this._connectSSH(config, ssh2Module.Client);

			// 2. Detect remote platform
			const { stdout: unameS } = await sshExec(sshClient, 'uname -s');
			const { stdout: unameM } = await sshExec(sshClient, 'uname -m');
			const platform = resolveRemotePlatform(unameS, unameM);
			if (!platform) {
				throw new Error(`${LOG_PREFIX} Unsupported remote platform: ${unameS.trim()} ${unameM.trim()}`);
			}
			this._logService.info(`${LOG_PREFIX} Remote platform: ${platform.os}-${platform.arch}`);

			// 3. Install CLI if needed
			await this._ensureCLIInstalled(sshClient, platform);

			// 4. Start agent-host and capture port/token
			const { port: remotePort, connectionToken, stream: agentStream } = await startRemoteAgentHost(sshClient, this._logService);

			// 5. Set up local TCP port forwarding
			const { server, localPort } = await createLocalForwarder(
				sshClient, '127.0.0.1', remotePort, this._logService,
			);

			// 6. Create connection object
			const localAddress = `127.0.0.1:${localPort}`;
			const conn = new SSHConnection(
				config,
				localAddress,
				config.name,
				connectionToken,
				sshClient,
				server,
				agentStream,
			);

			conn.onDidClose(() => {
				this._connections.delete(connectionKey);
				this._onDidCloseConnection.fire(localAddress);
				this._onDidChangeConnections.fire();
			});

			this._connections.set(connectionKey, conn);
			sshClient = undefined; // ownership transferred to SSHConnection

			this._onDidChangeConnections.fire();

			return {
				localAddress,
				name: config.name,
				connectionToken,
				config: conn.config,
				sshConfigHost: config.sshConfigHost,
			};

		} catch (err) {
			sshClient?.end();
			throw err;
		}
	}

	async disconnect(host: string): Promise<void> {
		for (const [key, conn] of this._connections) {
			if (key.includes(host) || conn.localAddress === host) {
				conn.dispose();
				return;
			}
		}
	}

	async reconnect(sshConfigHost: string, name: string): Promise<ISSHConnectResult> {
		this._logService.info(`${LOG_PREFIX} Reconnecting via SSH config host: ${sshConfigHost}`);
		const resolved = await this.resolveSSHConfig(sshConfigHost);

		let authMethod: SSHAuthMethod = SSHAuthMethod.Agent;
		let privateKeyPath: string | undefined;
		const defaultKeys = ['~/.ssh/id_rsa', '~/.ssh/id_ecdsa', '~/.ssh/id_ed25519', '~/.ssh/id_dsa', '~/.ssh/id_xmss'];
		if (resolved.identityFile.length > 0 && !defaultKeys.includes(resolved.identityFile[0])) {
			authMethod = SSHAuthMethod.KeyFile;
			privateKeyPath = resolved.identityFile[0];
		}

		return this.connect({
			host: resolved.hostname,
			port: resolved.port !== 22 ? resolved.port : undefined,
			username: resolved.user ?? sshConfigHost,
			authMethod,
			privateKeyPath,
			name,
			sshConfigHost,
		});
	}

	async listSSHConfigHosts(): Promise<string[]> {
		const configPath = join(os.homedir(), '.ssh', 'config');
		try {
			const content = fs.readFileSync(configPath, 'utf-8');
			return this._parseSSHConfigHosts(content, dirname(configPath));
		} catch {
			this._logService.info(`${LOG_PREFIX} Could not read SSH config at ${configPath}`);
			return [];
		}
	}

	async resolveSSHConfig(host: string): Promise<ISSHResolvedConfig> {
		return new Promise<ISSHResolvedConfig>((resolve, reject) => {
			cp.execFile('ssh', ['-G', host], { timeout: 5000 }, (err, stdout) => {
				if (err) {
					reject(new Error(`${LOG_PREFIX} ssh -G failed for ${host}: ${err.message}`));
					return;
				}
				const config = this._parseSSHGOutput(stdout);
				resolve(config);
			});
		});
	}

	private _parseSSHConfigHosts(content: string, configDir: string, visited?: Set<string>): string[] {
		const seen = visited ?? new Set<string>();
		const hosts: string[] = [];

		/** Strip inline comments (# not inside quotes). */
		const stripComment = (s: string): string => {
			const idx = s.indexOf(' #');
			return idx !== -1 ? s.substring(0, idx).trim() : s;
		};

		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}

			// Follow Include directives
			const includeMatch = trimmed.match(/^Include\s+(.+)$/i);
			if (includeMatch) {
				const rawPattern = stripComment(includeMatch[1]);
				const pattern = rawPattern.replace(/^~/, os.homedir());
				const resolvedPattern = isAbsolute(pattern) ? pattern : join(configDir, pattern);

				// Cycle protection
				const realPath = resolvedPattern;
				if (seen.has(realPath)) {
					continue;
				}
				seen.add(realPath);

				try {
					// Simple glob: if it's a directory, read all files; otherwise read the file
					const stat = fs.statSync(resolvedPattern);
					if (stat.isDirectory()) {
						for (const file of fs.readdirSync(resolvedPattern)) {
							try {
								const sub = fs.readFileSync(join(resolvedPattern, file), 'utf-8');
								hosts.push(...this._parseSSHConfigHosts(sub, resolvedPattern, seen));
							} catch { /* skip unreadable files */ }
						}
					} else {
						const sub = fs.readFileSync(resolvedPattern, 'utf-8');
						hosts.push(...this._parseSSHConfigHosts(sub, dirname(resolvedPattern), seen));
					}
				} catch {
					// Try as a glob pattern with wildcard — read the parent dir and match
					const dir = dirname(resolvedPattern);
					const base = basename(resolvedPattern);
					if (base.includes('*')) {
						try {
							for (const file of fs.readdirSync(dir)) {
								// Simple wildcard match
								const regex = new RegExp('^' + base.replace(/\*/g, '.*') + '$');
								if (regex.test(file)) {
									try {
										const sub = fs.readFileSync(join(dir, file), 'utf-8');
										hosts.push(...this._parseSSHConfigHosts(sub, dir, seen));
									} catch { /* skip */ }
								}
							}
						} catch { /* skip unreadable dirs */ }
					}
				}
				continue;
			}

			const hostMatch = trimmed.match(/^Host\s+(.+)$/i);
			if (hostMatch) {
				const hostValue = stripComment(hostMatch[1]);
				for (const h of hostValue.split(/\s+/)) {
					// Skip wildcards and negations
					if (!h.includes('*') && !h.includes('?') && !h.startsWith('!')) {
						hosts.push(h);
					}
				}
			}
		}
		return hosts;
	}

	private _parseSSHGOutput(stdout: string): ISSHResolvedConfig {
		const map = new Map<string, string>();
		const identityFiles: string[] = [];
		for (const line of stdout.split('\n')) {
			const spaceIdx = line.indexOf(' ');
			if (spaceIdx === -1) {
				continue;
			}
			const key = line.substring(0, spaceIdx).toLowerCase();
			const value = line.substring(spaceIdx + 1).trim();
			if (key === 'identityfile') {
				identityFiles.push(value);
			} else {
				map.set(key, value);
			}
		}

		return {
			hostname: map.get('hostname') ?? '',
			user: map.get('user') || undefined,
			port: parseInt(map.get('port') ?? '22', 10),
			identityFile: identityFiles,
			forwardAgent: map.get('forwardagent') === 'yes',
		};
	}

	private _connectSSH(
		config: ISSHAgentHostConfig,
		SSHClientCtor: new () => unknown,
	): Promise<SSHClient> {
		return new Promise<SSHClient>((resolve, reject) => {
			const client = new SSHClientCtor() as SSHClient;

			client.on('ready', () => {
				this._logService.info(`${LOG_PREFIX} SSH connection established to ${config.host}`);
				resolve(client);
			});

			client.on('error', (err: Error) => {
				this._logService.error(`${LOG_PREFIX} SSH connection error: ${err.message}`);
				reject(err);
			});

			const connectConfig: Record<string, unknown> = {
				host: config.host,
				port: config.port ?? 22,
				username: config.username,
				readyTimeout: 30_000,
				keepaliveInterval: 15_000,
			};

			switch (config.authMethod) {
				case SSHAuthMethod.Agent: {
					const agentSock = process.env['SSH_AUTH_SOCK'];
					this._logService.info(`${LOG_PREFIX} Using SSH agent: ${agentSock ?? '(not set)'}`);
					connectConfig.agent = agentSock;
					break;
				}
				case SSHAuthMethod.KeyFile:
					if (config.privateKeyPath) {
						const keyPath = config.privateKeyPath.replace(/^~/, os.homedir());
						connectConfig.privateKey = fs.readFileSync(keyPath);
					}
					break;
				case SSHAuthMethod.Password:
					connectConfig.password = config.password;
					break;
			}

			client.connect(connectConfig);
		});
	}

	private async _ensureCLIInstalled(client: SSHClient, platform: { os: string; arch: string }): Promise<void> {
		const { code } = await sshExec(client, `${REMOTE_CLI_BIN} --version`, { ignoreExitCode: true });
		if (code === 0) {
			this._logService.info(`${LOG_PREFIX} VS Code CLI already installed on remote`);
			return;
		}

		this._logService.info(`${LOG_PREFIX} Installing VS Code CLI on remote...`);
		const quality = 'stable';
		const url = buildCLIDownloadUrl(platform.os, platform.arch, quality);

		const installCmd = [
			`mkdir -p ${REMOTE_CLI_DIR}`,
			`curl -fsSL '${url}' | tar xz -C ${REMOTE_CLI_DIR}`,
			`chmod +x ${REMOTE_CLI_BIN}`,
		].join(' && ');

		await sshExec(client, installCmd);
		this._logService.info(`${LOG_PREFIX} VS Code CLI installed successfully`);
	}

	override dispose(): void {
		for (const conn of this._connections.values()) {
			conn.dispose();
		}
		this._connections.clear();
		super.dispose();
	}
}
