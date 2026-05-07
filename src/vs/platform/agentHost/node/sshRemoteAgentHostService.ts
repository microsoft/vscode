/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type WebSocket from 'ws';
import type { AnyAuthMethod, AuthenticationType, ConnectConfig } from 'ssh2';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { dirname, join, isAbsolute, basename } from '../../../base/common/path.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
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
import {
	buildCLIDownloadUrl,
	cleanupRemoteAgentHost,
	findRunningAgentHost,
	getRemoteCLIBin,
	getRemoteCLIDir,
	redactToken,
	resolveRemotePlatform,
	shellEscape,
	writeAgentHostState,
} from './sshRemoteAgentHostHelpers.js';
import { parseSSHConfigHostEntries, parseSSHGOutput, stripSSHComment } from '../common/sshConfigParsing.js';

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
	removeListener(event: 'close', listener: () => void): SSHClient;
	removeListener(event: 'error', listener: (err: Error) => void): SSHClient;
	connect(config: ConnectConfig): void;
	exec(command: string, callback: (err: Error | undefined, stream: SSHChannel) => void): SSHClient;
	forwardOut(srcIP: string, srcPort: number, dstIP: string, dstPort: number, callback: (err: Error | undefined, channel: SSHChannel) => void): SSHClient;
	end(): void;
}

const LOG_PREFIX = '[SSHRemoteAgentHost]';

/**
 * One entry in the queue of authentication attempts handed to ssh2's
 * `authHandler`. Each attempt corresponds to one of the auth method shapes
 * documented at https://www.npmjs.com/package/ssh2#client-methods.
 *
 * `keyPath` is internal-only metadata for logging — it is stripped before the
 * attempt is returned to ssh2.
 */
export type SSHAuthAttempt =
	| { readonly type: 'publickey'; readonly username: string; readonly key: Buffer; readonly keyPath: string }
	| { readonly type: 'agent'; readonly username: string; readonly agent: string }
	| { readonly type: 'password'; readonly username: string; readonly password: string };

function describeAuthAttempt(attempt: SSHAuthAttempt): string {
	switch (attempt.type) {
		case 'publickey': return `publickey ${attempt.keyPath}`;
		case 'agent': return 'agent';
		case 'password': return 'password';
	}
}

/**
 * Build an ssh2 `authHandler` callback that walks the given attempts in order,
 * filtering by the server-advertised `methodsLeft` when ssh2 provides one.
 * Returns `false` when the queue is exhausted, which causes ssh2 to surface
 * an authentication failure to the caller.
 */
export function makeAuthHandler(
	attempts: readonly SSHAuthAttempt[],
	logService: ILogService,
): (methodsLeft: AuthenticationType[] | null, partialSuccess: boolean, callback: (next: AnyAuthMethod | false) => void) => void {
	let index = 0;
	return (methodsLeft, _partialSuccess, callback) => {
		while (index < attempts.length) {
			const attempt = attempts[index++];
			// `agent` is a publickey-flavored method at the SSH protocol level —
			// servers advertise `publickey`, not `agent`, in `methodsLeft`.
			const protocolMethod: AuthenticationType = attempt.type === 'agent' ? 'publickey' : attempt.type;
			if (methodsLeft && !methodsLeft.includes(protocolMethod)) {
				logService.info(`${LOG_PREFIX} Skipping ${describeAuthAttempt(attempt)} — server only allows ${methodsLeft.join(', ')}`);
				continue;
			}
			logService.info(`${LOG_PREFIX} Trying auth: ${describeAuthAttempt(attempt)}`);
			// Strip our internal `keyPath` metadata before handing to ssh2.
			if (attempt.type === 'publickey') {
				const { keyPath: _kp, ...payload } = attempt;
				callback(payload);
			} else {
				callback(attempt);
			}
			return;
		}
		logService.info(`${LOG_PREFIX} No more auth methods to try; giving up`);
		callback(false);
	};
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

/** Create a bound exec function for the given SSH client. */
function bindSshExec(client: SSHClient): (command: string, opts?: { ignoreExitCode?: boolean }) => Promise<{ stdout: string; stderr: string; code: number }> {
	return (command, opts) => sshExec(client, command, opts);
}

function startRemoteAgentHost(
	client: SSHClient,
	logService: ILogService,
	quality: string,
	commandOverride?: string,
): Promise<{ port: number; connectionToken: string | undefined; pid: number | undefined; stream: SSHChannel }> {
	return new Promise((resolve, reject) => {
		const baseCmd = commandOverride ?? `${getRemoteCLIBin(quality)} agent host --port 0`;
		// Wrap in a login shell so the agent host process inherits the
		// user's PATH and environment from ~/.bash_profile / ~/.bashrc
		// (ssh2 exec runs a non-interactive non-login shell by default).
		// Echo the PID so we can record it for process reuse detection.
		const cmd = `bash -l -c ${shellEscape(`echo VSCODE_PID=$$ && exec ${baseCmd}`)}`;
		logService.info(`${LOG_PREFIX} Starting remote agent host: ${cmd}`);

		client.exec(cmd, (err: Error | undefined, stream: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}

			let resolved = false;
			let outputBuf = '';
			let pid: number | undefined;

			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					reject(new Error(`${LOG_PREFIX} Timed out waiting for agent host to start.\noutput so far: ${redactToken(outputBuf)}`));
				}
			}, 60_000);

			const checkForOutput = () => {
				if (pid === undefined) {
					const pidMatch = outputBuf.match(/VSCODE_PID=(\d+)/);
					if (pidMatch) {
						pid = parseInt(pidMatch[1], 10);
						logService.info(`${LOG_PREFIX} Remote agent host PID: ${pid}`);
					}
				}

				if (!resolved) {
					const match = outputBuf.match(/ws:\/\/(?:127\.0\.0\.1|localhost):(\d+)(?:\?tkn=([^\s&]+))?/);
					if (match) {
						resolved = true;
						clearTimeout(timeout);
						const port = parseInt(match[1], 10);
						const connectionToken = match[2] || undefined;
						logService.info(`${LOG_PREFIX} Remote agent host listening on port ${port}`);
						resolve({ port, connectionToken, pid, stream });
					}
				}
			};

			stream.stderr.on('data', (data: Buffer) => {
				const text = data.toString();
				outputBuf += text;
				logService.trace(`${LOG_PREFIX} remote stderr: ${redactToken(text.trimEnd())}`);
				checkForOutput();
			});

			stream.on('data', (data: Buffer) => {
				const text = data.toString();
				outputBuf += text;
				logService.trace(`${LOG_PREFIX} remote stdout: ${redactToken(text.trimEnd())}`);
				checkForOutput();
			});

			stream.on('error', (streamErr: Error) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					reject(streamErr);
				}
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
	nativeRequire: NodeJS.Require,
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

			const WS = nativeRequire('ws') as typeof WebSocket;
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

/**
 * State for a single active SSH relay connection.
 * Immutable and dispose-once — follows the same pattern as TunnelConnection.
 * On reconnect, the old SSHConnection is disposed and a fresh one is created;
 * the SSH client can be detached first so only the WebSocket relay is torn down.
 */
class SSHConnection extends Disposable {
	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose = this._onDidClose.event;

	readonly config: ISSHAgentHostConfigSanitized;
	private _closed = false;
	private _sshClientDetached = false;
	private readonly _sshCloseListener = () => { this.dispose(); };
	private readonly _sshErrorListener = () => { this.dispose(); };

	constructor(
		fullConfig: ISSHAgentHostConfig,
		readonly connectionId: string,
		readonly address: string,
		readonly name: string,
		readonly connectionToken: string | undefined,
		readonly remotePort: number,
		readonly sshClient: SSHClient,
		private readonly _relay: { send: (data: string) => void; close: () => void },
		private readonly _remoteStream: SSHChannel | undefined,
	) {
		super();

		this.config = sanitizeConfig(fullConfig);

		// Register cleanup first so it fires _onDidClose *before* the Emitter is disposed.
		this._register(toDisposable(() => {
			if (this._closed) {
				return;
			}
			this._closed = true;
			this._relay.close();
			if (!this._sshClientDetached) {
				this._remoteStream?.close();
				sshClient.end();
			}
			this._onDidClose.fire();
		}));

		this._register(this._onDidClose);

		sshClient.on('close', this._sshCloseListener);
		sshClient.on('error', this._sshErrorListener);
	}

	/**
	 * Detach the SSH client from this connection so that `dispose()`
	 * only closes the WebSocket relay without ending the SSH session.
	 * Also removes event listeners from the SSH client so the old
	 * connection object is not retained by the shared client.
	 */
	detachSshClient(): void {
		this._sshClientDetached = true;
		this.sshClient.removeListener('close', this._sshCloseListener);
		this.sshClient.removeListener('error', this._sshErrorListener);
	}

	relaySend(data: string): void {
		this._relay.send(data);
	}
}

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

	private readonly _connections = this._register(new DisposableMap<string, SSHConnection>());

	private _nativeRequire: NodeJS.Require | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();
	}

	/**
	 * Lazily load a `require` function for native modules (`ssh2`, `ws`).
	 * Uses a dynamic `import('node:module')` so the module is only resolved
	 * when actually needed at runtime — not at file-load time. This matters
	 * because tests override the methods that call this and never trigger
	 * the import, avoiding issues with Electron's ESM loader which cannot
	 * resolve `node:` specifiers.
	 */
	private async _getNativeRequire(): Promise<NodeJS.Require> {
		if (!this._nativeRequire) {
			const nodeModule = await import('node:module');
			this._nativeRequire = nodeModule.createRequire(import.meta.url);
		}
		return this._nativeRequire;
	}

	async connect(config: ISSHAgentHostConfig, replaceRelay?: boolean): Promise<ISSHConnectResult> {
		const connectionKey = config.sshConfigHost
			? `ssh:${config.sshConfigHost}`
			: `${config.username}@${config.host}:${config.port ?? 22}`;

		const existing = this._connections.get(connectionKey);
		if (existing) {
			if (replaceRelay) {
				// Tear down the old relay and create a fresh one, following
				// the same dispose-and-recreate pattern as TunnelAgentHostMainService.
				// The SSH client is detached so only the WebSocket relay is closed.
				this._logService.info(`${LOG_PREFIX} Reconnecting relay for existing SSH tunnel ${connectionKey}`);
				const { sshClient, remotePort, connectionToken } = existing;

				// Remove from map and detach SSH client before disposing so
				// the old relay's close handler (conn?.dispose()) is a no-op.
				this._connections.deleteAndLeak(connectionKey);
				existing.detachSshClient();
				existing.dispose();

				// Create fresh relay and connection. If relay creation fails,
				// clean up the detached SSH client so it doesn't leak.
				const connectionId = connectionKey;
				try {
					let conn: SSHConnection | undefined; // eslint-disable-line prefer-const
					const relay = await this._createWebSocketRelay(
						sshClient, '127.0.0.1', remotePort, connectionToken,
						(data: string) => this._onDidRelayMessage.fire({ connectionId, data }),
						() => { conn?.dispose(); },
					);

					conn = new SSHConnection(
						config, connectionId, connectionKey, config.name,
						connectionToken, remotePort, sshClient, relay, undefined,
					);

					Event.once(conn.onDidClose)(() => {
						if (this._connections.get(connectionKey) === conn) {
							this._connections.deleteAndDispose(connectionKey);
							this._onDidRelayClose.fire(connectionId);
							this._onDidCloseConnection.fire(connectionId);
							this._onDidChangeConnections.fire();
						}
					});

					this._connections.set(connectionKey, conn);

					return {
						connectionId: conn.connectionId,
						address: conn.address,
						name: conn.name,
						connectionToken: conn.connectionToken,
						config: conn.config,
						sshConfigHost: config.sshConfigHost,
					};
				} catch (err) {
					sshClient.end();
					this._onDidRelayClose.fire(connectionId);
					this._onDidCloseConnection.fire(connectionId);
					this._onDidChangeConnections.fire();
					throw err;
				}
			}

			return {
				connectionId: existing.connectionId,
				address: existing.address,
				name: existing.name,
				connectionToken: existing.connectionToken,
				config: existing.config,
				sshConfigHost: config.sshConfigHost,
			};
		}

		this._logService.info(`${LOG_PREFIX} ${replaceRelay ? 'Reconnecting' : 'Connecting'} to ${connectionKey}`);
		let sshClient: SSHClient | undefined;

		try {
			const reportProgress = (message: string) => {
				this._onDidReportConnectProgress.fire({ connectionKey, message });
			};

			// 1. Establish SSH connection
			reportProgress(localize('sshProgressConnecting', "Establishing SSH connection..."));
			sshClient = await this._connectSSH(config);

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

			// 4. Check for an already-running agent host on the remote.
			//    This prevents accumulating orphaned processes when the SSH
			//    connection drops and we reconnect.
			let remotePort: number | undefined;
			let connectionToken: string | undefined;
			let agentStream: SSHChannel | undefined;

			reportProgress(localize('sshProgressCheckingAgent', "Checking for existing agent host..."));
			const exec = bindSshExec(sshClient);
			const existingAH = await findRunningAgentHost(exec, this._logService, this._quality);
			if (existingAH) {
				remotePort = existingAH.port;
				connectionToken = existingAH.connectionToken;
			}

			if (remotePort === undefined) {
				// 5. Start agent-host and capture port/token
				reportProgress(localize('sshProgressStartingAgent', "Starting remote agent host..."));
				const result = await this._startRemoteAgentHost(sshClient, this._quality, config.remoteAgentHostCommand);
				remotePort = result.port;
				connectionToken = result.connectionToken;
				agentStream = result.stream;

				// Record state for future reuse
				await writeAgentHostState(exec, this._logService, this._quality, result.pid, remotePort, connectionToken);
			}

			// 6. Connect to remote agent host via WebSocket relay (no local TCP port)
			reportProgress(localize('sshProgressForwarding', "Connecting to remote agent host..."));
			const connectionId = connectionKey;
			let conn: SSHConnection | undefined; // eslint-disable-line prefer-const
			let relay: { send: (data: string) => void; close: () => void };
			try {
				relay = await this._createWebSocketRelay(
					sshClient, '127.0.0.1', remotePort, connectionToken,
					(data: string) => this._onDidRelayMessage.fire({ connectionId, data }),
					() => { conn?.dispose(); },
				);
			} catch (relayErr) {
				if (!existingAH) {
					throw relayErr;
				}
				// The reused agent host is not connectable — kill it and start fresh
				const relayErrorMessage = relayErr instanceof Error ? relayErr.message : String(relayErr);
				this._logService.warn(`${LOG_PREFIX} Failed to connect to reused agent host on port ${remotePort}: ${relayErrorMessage}. Starting fresh`);
				await cleanupRemoteAgentHost(exec, this._logService, this._quality);

				reportProgress(localize('sshProgressStartingAgent', "Starting remote agent host..."));
				const result = await this._startRemoteAgentHost(sshClient, this._quality, config.remoteAgentHostCommand);
				remotePort = result.port;
				connectionToken = result.connectionToken;
				agentStream = result.stream;
				await writeAgentHostState(exec, this._logService, this._quality, result.pid, remotePort, connectionToken);

				reportProgress(localize('sshProgressForwarding', "Connecting to remote agent host..."));
				relay = await this._createWebSocketRelay(
					sshClient, '127.0.0.1', remotePort, connectionToken,
					(data: string) => this._onDidRelayMessage.fire({ connectionId, data }),
					() => { conn?.dispose(); },
				);
			}

			// 7. Create connection object
			const address = connectionKey;
			conn = new SSHConnection(
				config,
				connectionId,
				address,
				config.name,
				connectionToken,
				remotePort,
				sshClient,
				relay,
				agentStream,
			);

			Event.once(conn.onDidClose)(() => {
				if (this._connections.get(connectionKey) === conn) {
					this._connections.deleteAndDispose(connectionKey);
					this._onDidRelayClose.fire(connectionId);
					this._onDidCloseConnection.fire(connectionId);
					this._onDidChangeConnections.fire();
				}
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

	async reconnect(sshConfigHost: string, name: string, remoteAgentHostCommand?: string, agentForward?: boolean): Promise<ISSHConnectResult> {
		this._logService.info(`${LOG_PREFIX} Reconnecting via SSH config host: ${sshConfigHost}`);
		const resolved = await this.resolveSSHConfig(sshConfigHost);

		// Always use Agent auth — the auth handler will walk through the SSH
		// agent and any default identities. If the user pinned a non-default
		// `IdentityFile` in their ssh config, surface it as the explicit key
		// so it gets tried first.
		let privateKeyPath: string | undefined;
		if (resolved.identityFile.length > 0 && !SSHRemoteAgentHostMainService._isDefaultKeyPath(resolved.identityFile[0])) {
			privateKeyPath = resolved.identityFile[0];
		}
		this._logService.info(`${LOG_PREFIX} reconnect: identityFiles=${JSON.stringify(resolved.identityFile)}, explicit key=${privateKeyPath ?? '(none)'}`);

		return this.connect({
			host: resolved.hostname,
			port: resolved.port !== 22 ? resolved.port : undefined,
			username: resolved.user ?? sshConfigHost,
			authMethod: SSHAuthMethod.Agent,
			privateKeyPath,
			name,
			sshConfigHost,
			remoteAgentHostCommand,
			agentForward: agentForward && resolved.forwardAgent ? true : undefined,
		}, /* replaceRelay */ true);
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

	async ensureUserSSHConfig(): Promise<URI> {
		const sshDir = join(os.homedir(), '.ssh');
		const configPath = join(sshDir, 'config');
		const isPosix = process.platform !== 'win32';
		try {
			await fsp.mkdir(sshDir, { recursive: true, mode: isPosix ? 0o700 : undefined });
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} Failed to ensure ~/.ssh directory: ${err}`);
			throw err;
		}
		try {
			await fsp.access(configPath);
		} catch {
			try {
				const handle = await fsp.open(configPath, 'a', isPosix ? 0o600 : undefined);
				await handle.close();
			} catch (err) {
				this._logService.warn(`${LOG_PREFIX} Failed to create ${configPath}: ${err}`);
				throw err;
			}
		}
		return URI.file(configPath);
	}

	async listSSHConfigFiles(): Promise<URI[]> {
		const isWindows = process.platform === 'win32';
		const userConfigPath = join(os.homedir(), '.ssh', 'config');
		const systemConfigPath = isWindows
			? join(process.env['ProgramData'] ?? 'C:\\ProgramData', 'ssh', 'ssh_config')
			: '/etc/ssh/ssh_config';

		const result: URI[] = [URI.file(userConfigPath)];
		try {
			await fsp.access(systemConfigPath);
			result.push(URI.file(systemConfigPath));
		} catch {
			// system config file does not exist — skip
		}
		return result;
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

	protected async _connectSSH(
		config: ISSHAgentHostConfig,
	): Promise<SSHClient> {
		const nativeRequire = await this._getNativeRequire();
		const ssh2Module = nativeRequire('ssh2') as { Client: new () => unknown };
		const SSHClientCtor = ssh2Module.Client;

		const connectConfig: ConnectConfig = {
			host: config.host,
			port: config.port ?? 22,
			username: config.username,
			readyTimeout: 30_000,
			keepaliveInterval: 15_000,
		};

		const attempts = await this._buildAuthAttempts(config);
		this._logService.info(`${LOG_PREFIX} Built ${attempts.length} auth attempt(s): ${attempts.map(a => describeAuthAttempt(a)).join(', ')}`);
		// Cast: the ssh2 @types don't model `false` (give-up) for the
		// callback nor `null` for the first invocation's `methodsLeft`,
		// even though the runtime supports both per the ssh2 docs.
		connectConfig.authHandler = makeAuthHandler(attempts, this._logService) as unknown as ConnectConfig['authHandler'];

		if (config.agentForward) {
			const agentSock = this._isAgentAvailable();
			if (agentSock) {
				// ssh2 needs `connectConfig.agent` set so it knows which local
				// agent socket to forward to. Without it, agent forwarding is a
				// no-op even if `agentForward: true` is set.
				connectConfig.agent = agentSock;
				connectConfig.agentForward = true;
				this._logService.info(`${LOG_PREFIX} SSH agent forwarding enabled`);
			} else {
				this._logService.warn(`${LOG_PREFIX} SSH agent forwarding requested, but SSH_AUTH_SOCK is not set; agent forwarding disabled`);
			}
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

	/**
	 * Build the ordered list of authentication attempts to feed to ssh2's
	 * `authHandler`. Mirrors OpenSSH's behavior: try the explicitly configured
	 * key first (if any), then the SSH agent (if `SSH_AUTH_SOCK` is set), then
	 * each readable default identity file in turn. This means a host that
	 * accepts `~/.ssh/id_rsa` still works even if the agent doesn't have it
	 * loaded — without needing an explicit `IdentityFile` entry in `~/.ssh/config`.
	 */
	protected async _buildAuthAttempts(config: ISSHAgentHostConfig): Promise<SSHAuthAttempt[]> {
		const attempts: SSHAuthAttempt[] = [];
		const username = config.username;

		switch (config.authMethod) {
			case SSHAuthMethod.Agent: {
				if (config.privateKeyPath) {
					const explicit = await this._readKeyFileIfExists(config.privateKeyPath);
					if (explicit) {
						attempts.push({ type: 'publickey', username, key: explicit, keyPath: config.privateKeyPath });
					}
				}
				const agentSock = this._isAgentAvailable();
				if (agentSock) {
					attempts.push({ type: 'agent', username, agent: agentSock });
				}
				for (const keyPath of SSHRemoteAgentHostMainService._defaultKeyPaths) {
					if (config.privateKeyPath === keyPath) {
						continue; // Already added as the explicit attempt above
					}
					const contents = await this._readKeyFileIfExists(keyPath);
					if (contents) {
						attempts.push({ type: 'publickey', username, key: contents, keyPath });
					}
				}
				break;
			}
			case SSHAuthMethod.KeyFile: {
				// KeyFile mode has no fallbacks — fail fast with a clear error if
				// the key is missing or unreadable, rather than letting it surface
				// downstream as a generic auth failure.
				if (!config.privateKeyPath) {
					throw new Error(localize('ssh.keyFileAuthRequiresPath', "Key file authentication requires a private key path."));
				}
				const explicit = await this._readKeyFileIfExists(config.privateKeyPath);
				if (!explicit) {
					throw new Error(localize('ssh.failedToReadPrivateKey', "Failed to read private key file: {0}", config.privateKeyPath));
				}
				attempts.push({ type: 'publickey', username, key: explicit, keyPath: config.privateKeyPath });
				break;
			}
			case SSHAuthMethod.Password: {
				if (config.password !== undefined) {
					attempts.push({ type: 'password', username, password: config.password });
				}
				break;
			}
		}

		return attempts;
	}

	private static readonly _defaultKeyPaths = [
		'~/.ssh/id_ed25519',
		'~/.ssh/id_rsa',
		'~/.ssh/id_ecdsa',
		'~/.ssh/id_dsa',
		'~/.ssh/id_xmss',
	];

	private static _isDefaultKeyPath(keyPath: string): boolean {
		return SSHRemoteAgentHostMainService._defaultKeyPaths.includes(keyPath);
	}

	/** Test seam: returns the SSH agent socket path, or undefined when no agent is available. */
	protected _isAgentAvailable(): string | undefined {
		return process.env['SSH_AUTH_SOCK'];
	}

	/**
	 * Test seam: read a private key file from disk. Returns `undefined` if the
	 * file doesn't exist; logs and returns `undefined` for any other read error
	 * so a single broken key doesn't abort the whole auth flow.
	 */
	protected async _readKeyFileIfExists(keyPath: string): Promise<Buffer | undefined> {
		const resolved = keyPath.replace(/^~/, os.homedir());
		try {
			return await fsp.readFile(resolved);
		} catch (error) {
			const errorCode = (error as NodeJS.ErrnoException).code;
			if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
				return undefined;
			}
			this._logService.warn(`${LOG_PREFIX} Failed to read SSH key file ${resolved}`, error);
			return undefined;
		}
	}

	private get _quality(): string {
		return this._productService.quality || 'insider';
	}

	protected _startRemoteAgentHost(
		client: SSHClient, quality: string, commandOverride?: string,
	): Promise<{ port: number; connectionToken: string | undefined; pid: number | undefined; stream: SSHChannel }> {
		return startRemoteAgentHost(client, this._logService, quality, commandOverride);
	}

	protected async _createWebSocketRelay(
		client: SSHClient, dstHost: string, dstPort: number, connectionToken: string | undefined,
		onMessage: (data: string) => void, onClose: () => void,
	): Promise<{ send: (data: string) => void; close: () => void }> {
		const nativeRequire = await this._getNativeRequire();
		return createWebSocketRelay(nativeRequire, client, dstHost, dstPort, connectionToken, this._logService, onMessage, onClose);
	}

	private async _ensureCLIInstalled(client: SSHClient, platform: { os: string; arch: string }, reportProgress: (message: string) => void): Promise<void> {
		const cliDir = getRemoteCLIDir(this._quality);
		const cliBin = getRemoteCLIBin(this._quality);
		const { code } = await sshExec(client, `${cliBin} --version`, { ignoreExitCode: true });
		if (code === 0) {
			this._logService.info(`${LOG_PREFIX} VS Code CLI already installed on remote`);
			return;
		}

		reportProgress(localize('sshProgressDownloadingCLI', "Installing VS Code CLI on remote..."));
		const url = buildCLIDownloadUrl(platform.os, platform.arch, this._quality);

		const installCmd = [
			`mkdir -p ${cliDir}`,
			`curl -fsSL ${shellEscape(url)} | tar xz -C ${cliDir}`,
			`chmod +x ${cliBin}`,
		].join(' && ');

		await sshExec(client, installCmd);
		this._logService.info(`${LOG_PREFIX} VS Code CLI installed successfully`);
	}
}
