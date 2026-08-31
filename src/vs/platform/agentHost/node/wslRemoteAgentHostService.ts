/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type WebSocket from 'ws';
import * as cp from 'child_process';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../base/common/strings.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { telemetryLevelToAgentHostValue } from '../common/agentHostTelemetry.js';
import type { IRelayMessage } from '../common/relayTransport.js';
import {
	IWSLRemoteAgentHostMainService,
	type IWSLAgentHostConfig,
	type IWSLConnectProgress,
	type IWSLConnectResult,
	type IWSLDistro,
} from '../common/wslRemoteAgentHost.js';
import { redactToken, resolveRemotePlatform } from './sshRemoteAgentHostHelpers.js';
import {
	composeAgentHostBootstrapScript,
	decodeWslOutput,
	extractAgentHostWebSocketURL,
	getWslExePath,
	isWSLSupported,
	parseRunningDistros,
	parseWslListVerbose,
	runWslCommand,
	validateDistroName,
} from './wslRemoteAgentHostHelpers.js';

const LOG_PREFIX = '[WSLRemoteAgentHost]';

/** Max time `code agent host` may be silent before printing its `ws://` URL. */
const AGENT_HOST_OUTPUT_IDLE_TIMEOUT_MS = 60_000;

/** Absolute upper bound for bootstrap, including CLI and server downloads. */
const AGENT_HOST_READY_OVERALL_TIMEOUT_MS = 10 * 60_000;

/** Max time to wait for the host-side WebSocket to complete its handshake. */
const WEBSOCKET_OPEN_TIMEOUT_MS = 30_000;

/** Max stdout/stderr lines kept buffered for diagnostic context on failure. */
const OUTPUT_BUFFER_LINES = 50;

interface IWSLConnection {
	readonly connectionId: string;
	readonly distro: string;
	readonly name: string;
	readonly address: string;
	readonly connectionToken: string | undefined;
	readonly child: cp.ChildProcess;
	readonly ws: WebSocket;
}

export class WSLRemoteAgentHostMainService extends Disposable implements IWSLRemoteAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	private readonly _onDidCloseConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection: Event<string> = this._onDidCloseConnection.event;

	private readonly _onDidReportConnectProgress = this._register(new Emitter<IWSLConnectProgress>());
	readonly onDidReportConnectProgress: Event<IWSLConnectProgress> = this._onDidReportConnectProgress.event;

	private readonly _onDidRelayMessage = this._register(new Emitter<IRelayMessage>());
	readonly onDidRelayMessage: Event<IRelayMessage> = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose: Event<string> = this._onDidRelayClose.event;

	private readonly _connections = new Map<string, IWSLConnection>();
	private readonly _distroToConnectionId = new Map<string, string>();
	private readonly _pendingConnects = new Map<string, Promise<IWSLConnectResult>>();

	private _nativeRequire: NodeJS.Require | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const id of [...this._connections.keys()]) {
				this._closeConnection(id);
			}
		}));
	}

	private get _quality(): string {
		return this._productService.quality || 'insider';
	}

	private get _serverDataFolderName(): string {
		const value = this._productService.serverDataFolderName;
		if (!value) {
			throw new Error(`${LOG_PREFIX} productService.serverDataFolderName is required`);
		}
		return value;
	}

	private get _commit(): string | undefined {
		return this._productService.commit;
	}

	/** Lazily load `require` so the `ws` native module is only resolved at runtime. */
	private async _getNativeRequire(): Promise<NodeJS.Require> {
		if (!this._nativeRequire) {
			const nodeModule = await import('node:module');
			this._nativeRequire = nodeModule.createRequire(import.meta.url);
		}
		return this._nativeRequire;
	}

	async isWSLAvailable(): Promise<boolean> {
		return isWSLSupported();
	}

	async listDistros(): Promise<IWSLDistro[]> {
		try {
			// Run both probes in parallel so we can overlay the locale-free
			// running set on the verbose parse (the `STATE` column from
			// `--verbose` is localized by Windows and reads "Stopped" for
			// every distro on non-English hosts).
			const [verbose, running] = await Promise.all([
				runWslCommand(['--list', '--verbose']),
				runWslCommand(['--list', '--running', '--quiet']),
			]);
			if (verbose.exitCode !== 0) {
				this._logService.info(`${LOG_PREFIX} wsl --list --verbose exited ${verbose.exitCode}: ${verbose.stderr.trim()}`);
				return [];
			}
			const parsed = parseWslListVerbose(verbose.stdout);
			if (running.exitCode !== 0) {
				return parsed;
			}
			const runningSet = new Set(parseRunningDistros(running.stdout));
			return parsed.map(d => ({ ...d, isRunning: runningSet.has(d.name) }));
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} listDistros failed`, err);
			return [];
		}
	}

	async listRunningDistros(): Promise<string[]> {
		try {
			const result = await runWslCommand(['--list', '--running', '--quiet']);
			if (result.exitCode !== 0) {
				return [];
			}
			return parseRunningDistros(result.stdout);
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} listRunningDistros failed`, err);
			return [];
		}
	}

	connect(config: IWSLAgentHostConfig): Promise<IWSLConnectResult> {
		const distro = validateDistroName(config.distro);

		// Idempotent: a second `connect` for an already-live distro returns
		// the existing connection so the renderer-side `_setupConnection`
		// reuses its handle (it dedupes by `connectionId`). Picking
		// "WSL..." → same distro should be a no-op, not an error.
		const existingId = this._distroToConnectionId.get(distro);
		if (existingId) {
			const existing = this._connections.get(existingId);
			if (existing) {
				return Promise.resolve({
					connectionId: existing.connectionId,
					address: existing.address,
					distro: existing.distro,
					name: existing.name,
					connectionToken: existing.connectionToken,
				});
			}
		}

		const existingPendingConnect = this._pendingConnects.get(distro);
		if (existingPendingConnect) {
			return existingPendingConnect;
		}

		// Reserve synchronously, before _connectUnguarded reaches its first
		// await, so simultaneous callers cannot start concurrent downloads.
		const pendingConnect = this._connectUnguarded(config, distro);
		this._pendingConnects.set(distro, pendingConnect);
		void pendingConnect.finally(() => {
			if (this._pendingConnects.get(distro) === pendingConnect) {
				this._pendingConnects.delete(distro);
			}
		}).catch(() => { /* The caller observes the original rejection. */ });
		return pendingConnect;
	}

	private async _connectUnguarded(config: IWSLAgentHostConfig, distro: string): Promise<IWSLConnectResult> {
		const connectionKey = `wsl:${distro}`;
		const reportProgress = (message: string) => {
			this._onDidReportConnectProgress.fire({ connectionKey, message });
		};

		reportProgress(localize('wslProgressDetectingPlatform', "Detecting platform in {0}...", distro));
		const { os: targetOs, arch: targetArch } = await this._resolvePlatform(distro);

		reportProgress(localize('wslProgressPreparingCLI', "Preparing CLI in {0}...", distro));
		const script = composeAgentHostBootstrapScript({
			serverDataFolderName: this._serverDataFolderName,
			quality: this._quality,
			commit: this._commit,
			os: targetOs,
			arch: targetArch,
			telemetryLevel: telemetryLevelToAgentHostValue(this._telemetryService.telemetryLevel),
			remoteAgentHostCommand: config.remoteAgentHostCommand,
		});

		this._logService.info(`${LOG_PREFIX} Spawning agent host in WSL distro '${distro}'`);
		this._logService.trace(`${LOG_PREFIX} bootstrap script: ${script}`);

		// `-e bash -lc <script>` runs a login shell so the user's PATH/profile
		// is sourced before the CLI launches. We deliberately do NOT set
		// `WSL_UTF8` for this spawn: it would force `wsl.exe` to recode the
		// agent host's stdout/stderr, which is already valid UTF-8 from a
		// Linux process. Keeping the bytes untouched also avoids surprising
		// the URL/PID regex.
		const child = this._spawnAgentHost(distro, script);

		let url: string | undefined;
		let urlResolve: ((value: { url: string; token: string | undefined }) => void) | undefined;
		let urlReject: ((err: Error) => void) | undefined;
		const urlPromise = new Promise<{ url: string; token: string | undefined }>((res, rej) => {
			urlResolve = res;
			urlReject = rej;
		});

		// Buffer holds already-redacted lines: connection tokens never sit
		// in shared-process memory unredacted, even on the diagnostic path.
		const outputLines: string[] = [];
		const appendLine = (line: string) => {
			outputLines.push(redactToken(line));
			if (outputLines.length > OUTPUT_BUFFER_LINES) {
				outputLines.shift();
			}
		};

		let outputIdleTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
		let overallTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
		const clearReadyTimeouts = () => {
			if (outputIdleTimeoutHandle !== undefined) {
				clearTimeout(outputIdleTimeoutHandle);
				outputIdleTimeoutHandle = undefined;
			}
			if (overallTimeoutHandle !== undefined) {
				clearTimeout(overallTimeoutHandle);
				overallTimeoutHandle = undefined;
			}
		};
		const rejectForTimeout = (message: string) => {
			clearReadyTimeouts();
			urlReject?.(new Error(`${LOG_PREFIX} ${message}\nOutput: ${outputLines.join('\n')}`));
		};
		const armOutputIdleTimeout = () => {
			if (url) {
				return;
			}
			if (outputIdleTimeoutHandle !== undefined) {
				clearTimeout(outputIdleTimeoutHandle);
			}
			outputIdleTimeoutHandle = setTimeout(() => {
				rejectForTimeout(`Timed out waiting for agent host in '${distro}' to print its WebSocket URL: no output for ${AGENT_HOST_OUTPUT_IDLE_TIMEOUT_MS}ms.`);
			}, AGENT_HOST_OUTPUT_IDLE_TIMEOUT_MS);
		};

		const onStreamData = (data: Buffer) => {
			// `decodeWslOutput` handles both UTF-8 (the agent host's own
			// stdout when running with `WSL_UTF8` unset, which is what we
			// spawn with) and UTF-16LE (which is how `wsl.exe`'s own error
			// messages — "There is no distribution with the supplied name"
			// etc. — arrive on stderr without `WSL_UTF8=1`).
			const cleanText = removeAnsiEscapeCodes(decodeWslOutput(data));
			for (const rawLine of cleanText.split(/\r\n|\r|\n/)) {
				const line = rawLine.trimEnd();
				if (!line) {
					continue;
				}
				armOutputIdleTimeout();
				appendLine(line);
				this._logService.trace(`${LOG_PREFIX} [${distro}] ${redactToken(line)}`);
				if (!url) {
					const match = extractAgentHostWebSocketURL(line);
					if (match) {
						url = match.url;
						urlResolve?.({ url: match.url, token: match.token });
					}
				}
			}
		};

		child.stdout?.on('data', onStreamData);
		child.stderr?.on('data', onStreamData);

		// Race the URL parse against the child dying, output going idle, and
		// an overall ceiling. Bootstrap downloads regularly report progress,
		// so only a period of silence indicates that it has become stuck.
		// `outputLines` is already redacted in `appendLine` — no extra wrap needed.
		armOutputIdleTimeout();
		overallTimeoutHandle = setTimeout(() => {
			rejectForTimeout(`Timed out waiting for agent host in '${distro}' to print its WebSocket URL: exceeded the overall ${AGENT_HOST_READY_OVERALL_TIMEOUT_MS}ms bootstrap ceiling.`);
		}, AGENT_HOST_READY_OVERALL_TIMEOUT_MS);

		child.once('exit', (code, signal) => {
			if (!url) {
				clearReadyTimeouts();
				urlReject?.(new Error(`${LOG_PREFIX} Agent host in '${distro}' exited (code=${code}, signal=${signal}) before printing its WebSocket URL.\nOutput: ${outputLines.join('\n')}`));
			}
		});
		child.once('error', err => {
			if (!url) {
				clearReadyTimeouts();
				urlReject?.(new Error(`${LOG_PREFIX} Failed to start agent host in '${distro}': ${err.message}\nOutput: ${outputLines.join('\n')}`));
			}
		});

		let resolvedUrl: { url: string; token: string | undefined };
		try {
			resolvedUrl = await urlPromise;
		} catch (err) {
			clearReadyTimeouts();
			this._killChild(child);
			throw err;
		}
		clearReadyTimeouts();

		reportProgress(localize('wslProgressConnecting', "Connecting to agent host in {0}...", distro));
		let ws: WebSocket;
		try {
			ws = await this._openWebSocket(resolvedUrl.url);
		} catch (err) {
			this._killChild(child);
			throw err;
		}

		const connectionId = generateUuid();
		const connection: IWSLConnection = {
			connectionId,
			distro,
			name: config.name,
			address: connectionKey,
			connectionToken: resolvedUrl.token,
			child,
			ws,
		};

		ws.on('message', data => {
			let text: string;
			if (typeof data === 'string') {
				text = data;
			} else if (Array.isArray(data)) {
				text = Buffer.concat(data).toString('utf8');
			} else if (data instanceof ArrayBuffer) {
				text = Buffer.from(new Uint8Array(data)).toString('utf8');
			} else {
				text = (data as Buffer).toString('utf8');
			}
			this._onDidRelayMessage.fire({ connectionId, data: text });
		});

		ws.on('close', () => {
			this._closeConnection(connectionId);
		});

		ws.on('error', (err: unknown) => {
			this._logService.warn(`${LOG_PREFIX} WebSocket error for ${connectionKey}: ${err instanceof Error ? err.message : String(err)}`);
		});

		this._connections.set(connectionId, connection);
		this._distroToConnectionId.set(distro, connectionId);

		this._onDidChangeConnections.fire();

		return {
			connectionId,
			address: connectionKey,
			distro,
			name: config.name,
			connectionToken: resolvedUrl.token,
		};
	}

	async disconnect(distro: string): Promise<void> {
		const id = this._distroToConnectionId.get(distro);
		if (id) {
			this._closeConnection(id);
		}
	}

	async reconnect(distro: string, name: string, remoteAgentHostCommand?: string, userInitiated?: boolean): Promise<IWSLConnectResult> {
		const existingId = this._distroToConnectionId.get(distro);
		if (existingId) {
			this._closeConnection(existingId);
		}
		// A pending connection is already a fresh bootstrap. Joining it avoids
		// starting a competing downloader; callers that reconnect after it
		// fails receive that failure and a subsequent reconnect starts anew.
		return this.connect({ distro, name, remoteAgentHostCommand, userInitiated });
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		const conn = this._connections.get(connectionId);
		if (!conn) {
			this._logService.debug(`${LOG_PREFIX} relaySend: no connection ${connectionId}`);
			return;
		}
		try {
			conn.ws.send(message);
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} relaySend failed for ${connectionId}`, err);
		}
	}

	private _closeConnection(connectionId: string): void {
		const conn = this._connections.get(connectionId);
		if (!conn) {
			return;
		}
		this._connections.delete(connectionId);
		if (this._distroToConnectionId.get(conn.distro) === connectionId) {
			this._distroToConnectionId.delete(conn.distro);
		}
		try {
			conn.ws.close();
		} catch { /* ignore */ }
		this._killChild(conn.child);
		this._onDidRelayClose.fire(connectionId);
		this._onDidCloseConnection.fire(connectionId);
		this._onDidChangeConnections.fire();
	}

	private _killChild(child: cp.ChildProcess): void {
		if (child.exitCode !== null || child.signalCode !== null) {
			return;
		}
		// A detached distro-side host relies on the bootstrap's --idle-timeout to exit.
		try {
			child.kill();
		} catch { /* ignore */ }
		// Escalate to SIGKILL if the process is still alive after 2s. The
		// `unref` cast avoids the dom/node `setTimeout` typing collision in
		// strict mode — we only care that escalation never blocks process exit,
		// so it is optional: outside Node (the unit-test renderer) there is no
		// `unref` and keeping the timer referenced is harmless.
		const escalate = setTimeout(() => {
			if (child.exitCode === null && child.signalCode === null) {
				try {
					child.kill('SIGKILL');
				} catch { /* ignore */ }
			}
		}, 2_000) as unknown as NodeJS.Timeout;
		escalate.unref?.();
		child.once('exit', () => clearTimeout(escalate));
	}

	protected _spawnAgentHost(distro: string, script: string): cp.ChildProcess {
		return cp.spawn(getWslExePath(), ['-d', distro, '-e', 'bash', '-lc', script], {
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	}

	protected async _resolvePlatform(distro: string): Promise<{ os: string; arch: string }> {
		const result = await runWslCommand(['-e', 'uname', '-s', '-m'], { distro, timeout: 10_000 });
		if (result.exitCode !== 0) {
			throw new Error(`${LOG_PREFIX} Failed to detect platform in '${distro}' (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
		}
		const tokens = result.stdout.trim().split(/\s+/);
		if (tokens.length < 2) {
			throw new Error(`${LOG_PREFIX} Unexpected uname output from '${distro}': ${JSON.stringify(result.stdout)}`);
		}
		const resolved = resolveRemotePlatform(tokens[0], tokens.slice(1).join(' '));
		if (!resolved) {
			throw new Error(localize('wslUnsupportedPlatform', "Unsupported WSL distro platform: {0}", result.stdout.trim()));
		}
		return resolved;
	}

	protected async _openWebSocket(url: string): Promise<WebSocket> {
		const nativeRequire = await this._getNativeRequire();
		const WS = nativeRequire('ws') as typeof WebSocket;
		const deadline = Date.now() + WEBSOCKET_OPEN_TIMEOUT_MS;
		let lastError: unknown;
		// On the first connect to a freshly-booted distro, the agent host
		// prints its `ws://127.0.0.1:PORT` URL the moment it binds inside
		// WSL — but the Windows-side localhost forward (wslrelay) needs a
		// brief moment more to set up the port forwarding. We see this as
		// an immediate ECONNREFUSED (wrapped in an AggregateError because
		// Node tries IPv4 and IPv6 in parallel). Retry until the overall
		// deadline elapses; once the forward is up the first successful
		// `open` returns immediately.
		for (let attempt = 0; ; attempt++) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				throw new Error(`${LOG_PREFIX} Timed out opening WebSocket to ${redactToken(url)} after ${WEBSOCKET_OPEN_TIMEOUT_MS}ms${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`);
			}
			try {
				return await this._tryOpenWebSocket(new WS(url), url, remaining);
			} catch (err) {
				lastError = err;
				if (!isConnectionRefused(err)) {
					throw err;
				}
				// Linear backoff capped at 500ms; the forward usually comes
				// up within a few hundred ms after the URL is printed.
				const delay = Math.min(100 + attempt * 100, 500);
				await new Promise(res => setTimeout(res, delay));
			}
		}
	}

	private _tryOpenWebSocket(ws: WebSocket, url: string, timeoutMs: number): Promise<WebSocket> {
		return new Promise<WebSocket>((resolve, reject) => {
			const timeoutHandle = setTimeout(() => {
				try {
					ws.close();
				} catch { /* ignore */ }
				reject(new Error(`${LOG_PREFIX} Timed out opening WebSocket to ${redactToken(url)} after ${timeoutMs}ms`));
			}, timeoutMs);
			ws.once('open', () => {
				clearTimeout(timeoutHandle);
				resolve(ws);
			});
			ws.once('error', err => {
				clearTimeout(timeoutHandle);
				try {
					ws.close();
				} catch { /* ignore */ }
				reject(err);
			});
		});
	}
}

/**
 * True for the `ECONNREFUSED` shapes Node surfaces for `ws://127.0.0.1:PORT`
 * before WSL's localhost-forwarding relay has wired up the forward. Node 18+
 * wraps the parallel IPv4/IPv6 attempts in an `AggregateError`, so we have
 * to inspect the inner errors too.
 */
function isConnectionRefused(err: unknown): boolean {
	if (!err || typeof err !== 'object') {
		return false;
	}
	const code = (err as { code?: string }).code;
	if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EADDRNOTAVAIL') {
		return true;
	}
	const errors = (err as { errors?: unknown[] }).errors;
	if (Array.isArray(errors)) {
		return errors.some(isConnectionRefused);
	}
	return false;
}
