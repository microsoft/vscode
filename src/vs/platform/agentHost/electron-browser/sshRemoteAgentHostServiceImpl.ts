/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ssh2 and Node.js net/fs types are declared locally to avoid static
// import-type declarations that violate electron-browser layer rules.
// The actual modules are loaded dynamically at runtime via await import().

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IRemoteAgentHostService } from '../common/remoteAgentHostService.js';
import {
	ISSHRemoteAgentHostService,
	SSHAuthMethod,
	type ISSHAgentHostConfig,
	type ISSHAgentHostConfigSanitized,
	type ISSHAgentHostConnection,
} from '../common/sshRemoteAgentHost.js';

/** Minimal subset of ssh2.ClientChannel used by this module. */
interface SSHChannel {
	on(event: 'data', listener: (data: Buffer) => void): SSHChannel;
	on(event: 'close', listener: (code: number) => void): SSHChannel;
	on(event: 'error', listener: (err: Error) => void): SSHChannel;
	stderr: { on(event: 'data', listener: (data: Buffer) => void): void };
	close(): void;
	pipe(destination: SSHChannel | NetSocket): SSHChannel | NetSocket;
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

/** Minimal subset of net.Server/Socket used by this module. */
interface NetServer {
	on(event: 'error', listener: (err: Error) => void): NetServer;
	listen(port: number, host: string, callback: () => void): NetServer;
	address(): { port: number } | null;
	close(): void;
}

interface NetSocket {
	localPort?: number;
	pipe(destination: SSHChannel | NetSocket): SSHChannel | NetSocket;
	end(): void;
}

const LOG_PREFIX = '[SSHRemoteAgentHost]';

/** Install location for the VS Code CLI on the remote machine. */
const REMOTE_CLI_DIR = '~/.vscode-cli';
const REMOTE_CLI_BIN = `${REMOTE_CLI_DIR}/code`;

/**
 * Maps `uname -s` / `uname -m` output to the VS Code CLI download
 * platform identifiers used by the update server.
 */
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

/** Build the download URL for the VS Code CLI on the update server. */
function buildCLIDownloadUrl(os: string, arch: string, quality: string): string {
	return `https://update.code.visualstudio.com/latest/cli-${os}-${arch}/${quality}`;
}

/**
 * Execute a command on the SSH connection and collect stdout/stderr.
 * Rejects if the exit code is non-zero (unless `ignoreExitCode` is set).
 */
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

/**
 * Start the agent host on the remote and parse its output for the
 * WebSocket address. Returns { port, connectionToken } from the
 * `ws://127.0.0.1:<port>?tkn=<token>` line printed to stderr.
 */
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
			let stderrBuf = '';

			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					reject(new Error(`${LOG_PREFIX} Timed out waiting for agent host to start.\nstderr so far: ${redactToken(stderrBuf)}`));
				}
			}, 60_000);

			stream.stderr.on('data', (data: Buffer) => {
				const text = data.toString();
				stderrBuf += text;
				logService.trace(`${LOG_PREFIX} remote stderr: ${redactToken(text.trimEnd())}`);

				if (!resolved) {
					// Look for the "listening on ws://..." line
					const match = stderrBuf.match(/ws:\/\/127\.0\.0\.1:(\d+)(?:\?tkn=([^\s&]+))?/);
					if (match) {
						resolved = true;
						clearTimeout(timeout);
						const port = parseInt(match[1], 10);
						const connectionToken = match[2] || undefined;
						logService.info(`${LOG_PREFIX} Remote agent host listening on port ${port}`);
						resolve({ port, connectionToken, stream });
					}
				}
			});

			stream.on('data', (data: Buffer) => {
				logService.trace(`${LOG_PREFIX} remote stdout: ${data.toString().trimEnd()}`);
			});

			stream.on('close', (code: number) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					reject(new Error(`${LOG_PREFIX} Agent host process exited with code ${code} before becoming ready.\nstderr: ${redactToken(stderrBuf)}`));
				}
			});
		});
	});
}

/**
 * Create a local TCP server that forwards each incoming connection
 * through an SSH channel to `dstHost:dstPort` on the remote.
 */
function createLocalForwarder(
	client: SSHClient,
	dstHost: string,
	dstPort: number,
	logService: ILogService,
	net: { createServer(connectionListener: (socket: NetSocket) => void): NetServer },
): Promise<{ server: NetServer; localPort: number }> {
	return new Promise((resolve, reject) => {
		const server = net.createServer((socket: NetSocket) => {
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
					socket.pipe(channel).pipe(socket);
				},
			);
		});

		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			const localPort = addr?.port ?? 0;
			logService.info(`${LOG_PREFIX} Local forwarder listening on 127.0.0.1:${localPort} → remote ${dstHost}:${dstPort}`);
			resolve({ server, localPort });
		});
	});
}

/** Strip secret fields from the config before exposing it on the connection. */
function sanitizeConfig(config: ISSHAgentHostConfig): ISSHAgentHostConfigSanitized {
	const { password: _p, privateKeyPath: _k, ...sanitized } = config;
	return sanitized;
}

class SSHAgentHostConnection extends Disposable implements ISSHAgentHostConnection {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	readonly config: ISSHAgentHostConfigSanitized;
	private _closed = false;

	constructor(
		fullConfig: ISSHAgentHostConfig,
		readonly localAddress: string,
		readonly name: string,
		sshClient: SSHClient,
		localServer: NetServer,
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

export class SSHRemoteAgentHostService extends Disposable implements ISSHRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	private readonly _connections = new Map<string, SSHAgentHostConnection>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
	) {
		super();
	}

	get connections(): readonly ISSHAgentHostConnection[] {
		return [...this._connections.values()];
	}

	async connect(config: ISSHAgentHostConfig): Promise<ISSHAgentHostConnection> {
		const connectionKey = `${config.username}@${config.host}:${config.port ?? 22}`;

		const existing = this._connections.get(connectionKey);
		if (existing) {
			return existing;
		}

		this._logService.info(`${LOG_PREFIX} Connecting to ${connectionKey}...`);
		const store = new DisposableStore();

		try {
			// Lazy-load Node.js modules. Cast to our minimal local interfaces
			// to avoid type conflicts with the full module signatures.
			const ssh2Module = await import('ssh2');
			const netModule = await import('net');
			const fsModule = await import('fs');

			// 1. Establish SSH connection
			const sshClient = await this._connectSSH(config, ssh2Module.Client as new () => unknown, fsModule);
			store.add(toDisposable(() => sshClient.end()));

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
			const netAdapter = {
				createServer(cb: (socket: NetSocket) => void): NetServer {
					const srv = netModule.createServer((socket) => cb(socket as unknown as NetSocket));
					return srv as unknown as NetServer;
				}
			};
			const { server, localPort } = await createLocalForwarder(
				sshClient, '127.0.0.1', remotePort, this._logService, netAdapter,
			);

			// 6. Create connection object
			const localAddress = `127.0.0.1:${localPort}`;
			const conn = new SSHAgentHostConnection(
				config,
				localAddress,
				config.name,
				sshClient,
				server,
				agentStream,
			);

			conn.onDidClose(() => {
				this._connections.delete(connectionKey);
				this._remoteAgentHostService.removeRemoteAgentHost(localAddress).catch(() => { /* best effort */ });
				this._onDidChangeConnections.fire();
			});

			this._connections.set(connectionKey, conn);
			store.dispose(); // ownership transferred to SSHAgentHostConnection

			// 7. Register with IRemoteAgentHostService
			this._logService.info(`${LOG_PREFIX} Registering remote agent host at ${localAddress}`);
			await this._remoteAgentHostService.addRemoteAgentHost({
				address: localAddress,
				name: config.name,
				connectionToken,
			});

			this._onDidChangeConnections.fire();
			return conn;

		} catch (err) {
			store.dispose();
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

	private _connectSSH(
		config: ISSHAgentHostConfig,
		SSHClientCtor: new () => unknown,
		fs: { readFileSync(path: string): Buffer },
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
				case SSHAuthMethod.Agent:
					connectConfig.agent = process.env['SSH_AUTH_SOCK'];
					break;
				case SSHAuthMethod.KeyFile:
					if (config.privateKeyPath) {
						connectConfig.privateKey = fs.readFileSync(config.privateKeyPath);
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
