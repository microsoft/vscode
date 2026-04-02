/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type WebSocket from 'ws';
import { createRequire } from 'node:module';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { dirname, join, isAbsolute, basename } from '../../../base/common/path.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import {
	ISSHRemoteAgentHostMainService,
	SSHAuthMethod,
	type ISSHAgentHostConfig,
	type ISSHAgentHostConfigSanitized,
	type ISSHConnectProgress,
	type ISSHConnectResult,
	type ISSHRelayMessage,
	type ISSHResolvedConfig,
} from '../common/sshRemoteAgentHost.js';

const _require = createRequire(import.meta.url);

/** Minimal subset of ssh2.ClientChannel used by this module (duplex stream). */
interface SSHChannel extends NodeJS.ReadWriteStream {
	on(event: 'data', listener: (data: Buffer) => void): this;
	on(event: 'close', listener: (code: number) => void): this;
	on(event: 'error', listener: (err: Error) => void): this;
	on(event: string, listener: (...args: unknown[]) => void): this;
	stderr: { on(event: 'data', listener: (data: Buffer) => void): void };
	close(): void;
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

/** Escape a string for use as a single shell argument (single-quote wrapping). */
function shellEscape(s: string): string {
	// Wrap in single quotes; escape embedded single quotes as: '\''
	const escaped = s.replace(/'/g, '\'\\\'\'');
	return `'${escaped}'`;
}

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
			let settled = false;

			const finish = (error: Error | undefined, code: number | undefined) => {
				if (settled) {
					return;
				}
				settled = true;
				if (error) {
					reject(error);
					return;
				}
				if (code !== 0 && !opts?.ignoreExitCode) {
					reject(new Error(`SSH command failed (exit ${code}): ${command}\nstderr: ${stderr}`));
				} else {
					resolve({ stdout, stderr, code: code ?? 0 });
				}
			};

			stream.on('data', (data: Buffer) => { stdout += data.toString(); });
			stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			stream.on('error', (streamErr: Error) => finish(streamErr, undefined));
			stream.on('close', (code: number) => finish(undefined, code));
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
	commandOverride?: string,
): Promise<{ port: number; connectionToken: string | undefined; stream: SSHChannel }> {
	return new Promise((resolve, reject) => {
		const baseCmd = commandOverride ?? `${REMOTE_CLI_BIN} agent-host --port 0 --accept-server-license-terms`;
		// Wrap in a login shell so the agent host process inherits the
		// user's PATH and environment from ~/.bash_profile / ~/.bashrc
		// (ssh2 exec runs a non-interactive non-login shell by default).
		const cmd = `bash -l -c ${shellEscape(baseCmd)}`;
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

/**
 * Create a WebSocket connection to the remote agent host via an SSH forwarded channel.
 * Uses the `ws` library to speak WebSocket over the SSH channel.
 * Messages are relayed to the renderer via IPC events.
 */
function createWebSocketRelay(
	client: SSHClient,
	dstHost: string,
	dstPort: number,
	connectionToken: string | undefined,
	logService: ILogService,
	onMessage: (data: string) => void,
	onClose: () => void,
): Promise<{ send: (data: string) => void; close: () => void }> {
	return new Promise((resolve, reject) => {
		client.forwardOut('127.0.0.1', 0, dstHost, dstPort, (err: Error | undefined, channel: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}

			const WS = _require('ws') as typeof WebSocket;
			let url = `ws://${dstHost}:${dstPort}`;
			if (connectionToken) {
				url += `?tkn=${encodeURIComponent(connectionToken)}`;
			}

			// The SSH channel is a duplex stream compatible with ws's createConnection,
			// but our minimal SSHChannel interface doesn't carry the full Node Duplex shape.
			const ws = new WS(url, { createConnection: (() => channel) as unknown as WebSocket.ClientOptions['createConnection'] });

			ws.on('open', () => {
				logService.info(`${LOG_PREFIX} WebSocket relay connected to remote agent host`);
				resolve({
					send: (data: string) => {
						if (ws.readyState === ws.OPEN) {
							ws.send(data);
						}
					},
					close: () => ws.close(),
				});
			});

			ws.on('message', (data: WebSocket.RawData) => {
				if (Array.isArray(data)) {
					onMessage(Buffer.concat(data).toString());
				} else if (data instanceof ArrayBuffer) {
					onMessage(Buffer.from(new Uint8Array(data)).toString());
				} else {
					onMessage(data.toString());
				}
			});

			ws.on('close', onClose);

			ws.on('error', (wsErr: unknown) => {
				logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
				reject(wsErr);
			});
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
		readonly connectionId: string,
		readonly address: string,
		readonly name: string,
		readonly connectionToken: string | undefined,
		sshClient: SSHClient,
		private readonly _relay: { send: (data: string) => void; close: () => void },
		remoteStream: SSHChannel,
	) {
		super();

		this.config = sanitizeConfig(fullConfig);

		this._register(toDisposable(() => {
			if (this._closed) {
				return;
			}
			this._closed = true;
			this._relay.close();
			remoteStream.close();
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

	relaySend(data: string): void {
		this._relay.send(data);
	}
}

import { parseSSHConfigHostEntries, parseSSHGOutput, stripSSHComment } from '../common/sshConfigParsing.js';

export class SSHRemoteAgentHostMainService extends Disposable implements ISSHRemoteAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	private readonly _onDidCloseConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection: Event<string> = this._onDidCloseConnection.event;

	private readonly _onDidReportConnectProgress = this._register(new Emitter<ISSHConnectProgress>());
	readonly onDidReportConnectProgress: Event<ISSHConnectProgress> = this._onDidReportConnectProgress.event;

	private readonly _onDidRelayMessage = this._register(new Emitter<ISSHRelayMessage>());
	readonly onDidRelayMessage: Event<ISSHRelayMessage> = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose: Event<string> = this._onDidRelayClose.event;

	private readonly _connections = new Map<string, SSHConnection>();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async connect(config: ISSHAgentHostConfig): Promise<ISSHConnectResult> {
		const connectionKey = config.sshConfigHost
			? `ssh:${config.sshConfigHost}`
			: `${config.username}@${config.host}:${config.port ?? 22}`;

		const existing = this._connections.get(connectionKey);
		if (existing) {
			return {
				connectionId: existing.connectionId,
				address: existing.address,
				name: existing.name,
				connectionToken: existing.connectionToken,
				config: existing.config,
			};
		}

		this._logService.info(`${LOG_PREFIX} Connecting to ${connectionKey}...`);
		let sshClient: SSHClient | undefined;

		try {
			const ssh2Module = _require('ssh2') as { Client: new () => unknown };

			const reportProgress = (message: string) => {
				this._onDidReportConnectProgress.fire({ connectionKey, message });
			};

			// 1. Establish SSH connection
			reportProgress(localize('sshProgressConnecting', "Establishing SSH connection..."));
			sshClient = await this._connectSSH(config, ssh2Module.Client);

			if (config.remoteAgentHostCommand) {
				// Dev override: skip platform detection and CLI install,
				// use the provided command directly.
				this._logService.info(`${LOG_PREFIX} Using custom agent host command: ${config.remoteAgentHostCommand}`);
			} else {
				// 2. Detect remote platform
				const { stdout: unameS } = await sshExec(sshClient, 'uname -s');
				const { stdout: unameM } = await sshExec(sshClient, 'uname -m');
				const platform = resolveRemotePlatform(unameS, unameM);
				if (!platform) {
					throw new Error(`${LOG_PREFIX} Unsupported remote platform: ${unameS.trim()} ${unameM.trim()}`);
				}
				this._logService.info(`${LOG_PREFIX} Remote platform: ${platform.os}-${platform.arch}`);

				// 3. Install CLI if needed
				reportProgress(localize('sshProgressInstallingCLI', "Checking remote CLI installation..."));
				await this._ensureCLIInstalled(sshClient, platform, reportProgress);
			}

			// 4. Start agent-host and capture port/token
			reportProgress(localize('sshProgressStartingAgent', "Starting remote agent host..."));
			const { port: remotePort, connectionToken, stream: agentStream } = await startRemoteAgentHost(sshClient, this._logService, config.remoteAgentHostCommand);

			// 5. Connect to remote agent host via WebSocket relay (no local TCP port)
			reportProgress(localize('sshProgressForwarding', "Connecting to remote agent host..."));
			const connectionId = connectionKey;
			const relay = await createWebSocketRelay(
				sshClient, '127.0.0.1', remotePort, connectionToken, this._logService,
				(data: string) => this._onDidRelayMessage.fire({ connectionId, data }),
				() => this._onDidRelayClose.fire(connectionId),
			);

			// 6. Create connection object
			const address = connectionKey;
			const conn = new SSHConnection(
				config,
				connectionId,
				address,
				config.name,
				connectionToken,
				sshClient,
				relay,
				agentStream,
			);

			conn.onDidClose(() => {
				this._connections.delete(connectionKey);
				this._onDidCloseConnection.fire(connectionId);
				this._onDidChangeConnections.fire();
			});

			this._connections.set(connectionKey, conn);
			sshClient = undefined; // ownership transferred to SSHConnection

			this._onDidChangeConnections.fire();

			return {
				connectionId,
				address,
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
			if (key === host || conn.connectionId === host) {
				conn.dispose();
				return;
			}
		}
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		for (const conn of this._connections.values()) {
			if (conn.connectionId === connectionId) {
				conn.relaySend(message);
				return;
			}
		}
	}

	async reconnect(sshConfigHost: string, name: string, remoteAgentHostCommand?: string): Promise<ISSHConnectResult> {
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
			remoteAgentHostCommand,
		});
	}

	async listSSHConfigHosts(): Promise<string[]> {
		const configPath = join(os.homedir(), '.ssh', 'config');
		try {
			const content = await fsp.readFile(configPath, 'utf-8');
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

	private async _parseSSHConfigHosts(content: string, configDir: string, visited?: Set<string>): Promise<string[]> {
		const seen = visited ?? new Set<string>();
		const hosts: string[] = [];

		// Extract hosts from this file directly
		hosts.push(...parseSSHConfigHostEntries(content));

		// Follow Include directives
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}
			const includeMatch = trimmed.match(/^Include\s+(.+)$/i);
			if (!includeMatch) {
				continue;
			}

			const rawValue = stripSSHComment(includeMatch[1]);
			const patterns = rawValue.split(/\s+/).filter(Boolean);

			for (const rawPattern of patterns) {
				const pattern = rawPattern.replace(/^~/, os.homedir());
				const resolvedPattern = isAbsolute(pattern) ? pattern : join(configDir, pattern);

				if (seen.has(resolvedPattern)) {
					continue;
				}
				seen.add(resolvedPattern);

				try {
					const stat = await fsp.stat(resolvedPattern);
					if (stat.isDirectory()) {
						const files = await fsp.readdir(resolvedPattern);
						for (const file of files) {
							try {
								const sub = await fsp.readFile(join(resolvedPattern, file), 'utf-8');
								hosts.push(...await this._parseSSHConfigHosts(sub, resolvedPattern, seen));
							} catch { /* skip unreadable files */ }
						}
					} else {
						const sub = await fsp.readFile(resolvedPattern, 'utf-8');
						hosts.push(...await this._parseSSHConfigHosts(sub, dirname(resolvedPattern), seen));
					}
				} catch {
					const dir = dirname(resolvedPattern);
					const base = basename(resolvedPattern);
					if (base.includes('*')) {
						try {
							const files = await fsp.readdir(dir);
							for (const file of files) {
								const regex = new RegExp('^' + base.replace(/\*/g, '.*') + '$');
								if (regex.test(file)) {
									try {
										const sub = await fsp.readFile(join(dir, file), 'utf-8');
										hosts.push(...await this._parseSSHConfigHosts(sub, dir, seen));
									} catch { /* skip */ }
								}
							}
						} catch { /* skip unreadable dirs */ }
					}
				}
			}
		}
		return hosts;
	}

	private _parseSSHGOutput(stdout: string): ISSHResolvedConfig {
		return parseSSHGOutput(stdout);
	}

	private async _connectSSH(
		config: ISSHAgentHostConfig,
		SSHClientCtor: new () => unknown,
	): Promise<SSHClient> {
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
					connectConfig.privateKey = await fsp.readFile(keyPath);
				}
				break;
			case SSHAuthMethod.Password:
				connectConfig.password = config.password;
				break;
		}

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

			client.connect(connectConfig);
		});
	}

	private async _ensureCLIInstalled(client: SSHClient, platform: { os: string; arch: string }, reportProgress: (message: string) => void): Promise<void> {
		const { code } = await sshExec(client, `${REMOTE_CLI_BIN} --version`, { ignoreExitCode: true });
		if (code === 0) {
			this._logService.info(`${LOG_PREFIX} VS Code CLI already installed on remote`);
			return;
		}

		reportProgress(localize('sshProgressDownloadingCLI', "Installing VS Code CLI on remote..."));
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
