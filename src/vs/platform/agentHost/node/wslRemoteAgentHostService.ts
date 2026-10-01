/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type WebSocket from 'ws';
import * as cp from 'child_process';
import { Emitter, Event } from '../../../base/common/event.js';
import { autorun } from '../../../base/common/observable.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../base/common/strings.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { telemetryLevelToAgentHostValue } from '../common/agentHostTelemetry.js';
import { redactToken, RemoteAgentHostBootstrapProgressReporter } from '../common/remoteAgentHostBootstrapProgress.js';
import type { IRelayMessage } from '../common/relayTransport.js';
import {
	IWSLRemoteAgentHostMainService,
	type IWSLAgentHostConfig,
	type IWSLConnectProgress,
	type IWSLConnectResult,
	type IWSLDistro,
} from '../common/wslRemoteAgentHost.js';
import { resolveRemotePlatform } from './sshRemoteAgentHostHelpers.js';
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

/**
 * Max time a stopped WSL distro may take to boot and produce the bootstrap's
 * first output. This intentionally includes VM startup and login-shell profile
 * sourcing, which can legitimately exceed the post-output idle budget.
 */
const AGENT_HOST_INITIAL_OUTPUT_TIMEOUT_MS = 3 * 60_000;

/** Max time `code agent host` may be silent after bootstrap output has started. */
const AGENT_HOST_OUTPUT_IDLE_TIMEOUT_MS = 60_000;

/** Absolute upper bound for bootstrap, including CLI and server downloads. */
const AGENT_HOST_READY_OVERALL_TIMEOUT_MS = 10 * 60_000;

/** Max time to wait for the host-side WebSocket to complete its handshake. */
const WEBSOCKET_OPEN_TIMEOUT_MS = 30_000;

/** Max stdout/stderr lines kept buffered for diagnostic context on failure. */
const OUTPUT_BUFFER_LINES = 50;

interface IWSLSession {
	readonly distro: string;
	readonly name: string;
	readonly address: string;
	readonly connectionToken: string | undefined;
	readonly child: cp.ChildProcess;
	readonly url: string;
	readonly disposables: DisposableStore;
}

interface IWSLRelayLease {
	readonly connectionId: string;
	readonly session: IWSLSession;
	readonly ws: WebSocket;
	physicalCloseNotified: boolean;
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

	private readonly _sessions = new Map<string, IWSLSession>();
	private readonly _connections = new Map<string, IWSLRelayLease>();
	private readonly _pendingConnects = new Map<string, Promise<IWSLSession>>();
	private readonly _pendingReconnects = new Map<string, Promise<IWSLConnectResult>>();
	private readonly _pendingRelayAcquisitions = new Map<IWSLSession, number>();
	private readonly _replacements = new Map<string, string>();

	private _nativeRequire: NodeJS.Require | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const id of [...this._connections.keys()]) {
				this._closeRelay(id);
			}
			for (const distro of [...this._sessions.keys()]) {
				this._closeSession(distro);
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
		return this._getOrCreateSession(config, distro).then(session => this._createRelay(session));
	}

	private _getOrCreateSession(config: IWSLAgentHostConfig, distro: string): Promise<IWSLSession> {
		const existing = this._sessions.get(distro);
		if (existing) {
			return Promise.resolve(existing);
		}
		const pending = this._pendingConnects.get(distro);
		if (pending) {
			return pending;
		}
		const create = this._connectUnguarded(config, distro);
		this._pendingConnects.set(distro, create);
		void create.finally(() => {
			if (this._pendingConnects.get(distro) === create) {
				this._pendingConnects.delete(distro);
			}
		}).catch(() => { /* The caller observes the original rejection. */ });
		return create;
	}

	private async _connectUnguarded(config: IWSLAgentHostConfig, distro: string): Promise<IWSLSession> {
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

		const bootstrapProgressDisposables = new DisposableStore();
		const bootstrapProgressReporter = bootstrapProgressDisposables.add(new RemoteAgentHostBootstrapProgressReporter());
		bootstrapProgressDisposables.add(autorun(reader => {
			const progress = bootstrapProgressReporter.progress.read(reader);
			if (progress?.phase === 'serverDownload') {
				reportProgress(localize('wslProgressDownloadingServer', "Downloading server ({0}%)", progress.percentage));
			}
		}));
		const flushBootstrapProgress = () => {
			bootstrapProgressReporter.flush();
		};

		let initialOutputTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
		let outputIdleTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
		let overallTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
		let hasProducedOutput = false;
		let readySettled = false;
		const clearReadyTimeouts = () => {
			if (initialOutputTimeoutHandle !== undefined) {
				clearTimeout(initialOutputTimeoutHandle);
				initialOutputTimeoutHandle = undefined;
			}
			if (outputIdleTimeoutHandle !== undefined) {
				clearTimeout(outputIdleTimeoutHandle);
				outputIdleTimeoutHandle = undefined;
			}
			if (overallTimeoutHandle !== undefined) {
				clearTimeout(overallTimeoutHandle);
				overallTimeoutHandle = undefined;
			}
		};
		const rejectReady = (error: Error) => {
			if (readySettled) {
				return;
			}
			readySettled = true;
			clearReadyTimeouts();
			flushBootstrapProgress();
			urlReject?.(error);
		};
		const rejectForTimeout = (message: string) => {
			rejectReady(new Error(`${LOG_PREFIX} ${message}\nOutput: ${outputLines.join('\n')}`));
		};
		const armOutputIdleTimeout = () => {
			if (readySettled) {
				return;
			}
			if (outputIdleTimeoutHandle !== undefined) {
				clearTimeout(outputIdleTimeoutHandle);
			}
			outputIdleTimeoutHandle = setTimeout(() => {
				rejectForTimeout(`Timed out waiting for agent host in '${distro}' to print its WebSocket URL: exceeded the ${AGENT_HOST_OUTPUT_IDLE_TIMEOUT_MS}ms output-idle budget after output started.`);
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
				if (readySettled) {
					return;
				}
				const line = rawLine.trimEnd();
				if (!line) {
					continue;
				}
				if (!hasProducedOutput) {
					hasProducedOutput = true;
					if (initialOutputTimeoutHandle !== undefined) {
						clearTimeout(initialOutputTimeoutHandle);
						initialOutputTimeoutHandle = undefined;
					}
				}
				armOutputIdleTimeout();
				const redactedLine = redactToken(line);
				appendLine(redactedLine);
				this._logService.trace(`${LOG_PREFIX} [${distro}] ${redactedLine}`);
				bootstrapProgressReporter.acceptLine(line);
				if (!url) {
					const match = extractAgentHostWebSocketURL(line);
					if (match) {
						flushBootstrapProgress();
						url = match.url;
						readySettled = true;
						clearReadyTimeouts();
						urlResolve?.({ url: match.url, token: match.token });
					}
				}
			}
		};

		child.stdout?.on('data', onStreamData);
		child.stderr?.on('data', onStreamData);
		bootstrapProgressDisposables.add(toDisposable(() => {
			child.stdout?.removeListener('data', onStreamData);
			child.stderr?.removeListener('data', onStreamData);
		}));

		// Race the URL parse against the child dying, initial startup silence,
		// post-output silence, and an overall ceiling. Bootstrap downloads
		// regularly report progress, so once output starts only silence indicates
		// that it has become stuck.
		// `outputLines` is already redacted in `appendLine` — no extra wrap needed.
		if (!hasProducedOutput) {
			initialOutputTimeoutHandle = setTimeout(() => {
				rejectForTimeout(`Timed out waiting for agent host in '${distro}' to produce initial output: exceeded the ${AGENT_HOST_INITIAL_OUTPUT_TIMEOUT_MS}ms startup budget.`);
			}, AGENT_HOST_INITIAL_OUTPUT_TIMEOUT_MS);
		}
		overallTimeoutHandle = setTimeout(() => {
			rejectForTimeout(`Timed out waiting for agent host in '${distro}' to print its WebSocket URL: exceeded the overall ${AGENT_HOST_READY_OVERALL_TIMEOUT_MS}ms bootstrap ceiling.`);
		}, AGENT_HOST_READY_OVERALL_TIMEOUT_MS);

		const sessionDisposables = new DisposableStore();
		let session: IWSLSession | undefined = undefined;
		let childError: Error | undefined;
		const onChildFailure = (error: Error) => {
			childError = error;
			if (session) {
				this._logService.warn(error.message);
				this._closeSession(distro, session);
			} else {
				rejectReady(error);
			}
		};
		const onChildExit = (code: number | null, signal: NodeJS.Signals | null) => {
			onChildFailure(new Error(`${LOG_PREFIX} Agent host in '${distro}' exited (code=${code}, signal=${signal}).\nOutput: ${outputLines.join('\n')}`));
		};
		const onChildError = (err: Error) => {
			onChildFailure(new Error(`${LOG_PREFIX} Agent host in '${distro}' failed: ${err.message}\nOutput: ${outputLines.join('\n')}`));
		};
		child.on('exit', onChildExit);
		child.on('error', onChildError);
		sessionDisposables.add(toDisposable(() => {
			child.removeListener('exit', onChildExit);
			child.removeListener('error', onChildError);
		}));

		let resolvedUrl: { url: string; token: string | undefined };
		try {
			resolvedUrl = await urlPromise;
			if (childError) {
				throw childError;
			}
		} catch (err) {
			clearReadyTimeouts();
			flushBootstrapProgress();
			bootstrapProgressDisposables.dispose();
			sessionDisposables.dispose();
			this._killChild(child);
			throw err;
		}
		bootstrapProgressDisposables.dispose();
		clearReadyTimeouts();

		session = {
			distro,
			name: config.name,
			address: connectionKey,
			connectionToken: resolvedUrl.token,
			child,
			url: resolvedUrl.url,
			disposables: sessionDisposables,
		};
		this._sessions.set(distro, session);
		this._onDidChangeConnections.fire();
		return session;
	}

	private async _createRelay(session: IWSLSession): Promise<IWSLConnectResult> {
		this._onDidReportConnectProgress.fire({
			connectionKey: session.address,
			message: localize('wslProgressConnecting', "Connecting to agent host in {0}...", session.distro),
		});
		this._pendingRelayAcquisitions.set(session, (this._pendingRelayAcquisitions.get(session) ?? 0) + 1);
		let ws: WebSocket;
		let connection: IWSLRelayLease | undefined;
		try {
			ws = await this._openWebSocket(session.url);
			if (this._sessions.get(session.distro) !== session) {
				ws.close();
				throw new Error(`${LOG_PREFIX} Agent host session for '${session.distro}' was closed while acquiring a relay.`);
			}
			const connectionId = generateUuid();
			connection = { connectionId, session, ws, physicalCloseNotified: false };
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
				this._handlePhysicalRelayClose(connectionId);
			});

			ws.on('error', (err: unknown) => {
				this._logService.warn(`${LOG_PREFIX} WebSocket error for ${session.address}: ${err instanceof Error ? err.message : String(err)}`);
			});

			this._connections.set(connectionId, connection);
			this._onDidChangeConnections.fire();

			return this._toResult(connection);
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} Failed to acquire relay for ${session.address}`, err);
			this._closeSession(session.distro, session);
			throw err;
		} finally {
			const remaining = (this._pendingRelayAcquisitions.get(session) ?? 1) - 1;
			if (remaining > 0) {
				this._pendingRelayAcquisitions.set(session, remaining);
			} else {
				this._pendingRelayAcquisitions.delete(session);
				if (!connection && this._canCloseSession(session)) {
					this._closeSession(session.distro, session);
				}
			}
		}
	}

	async disconnect(distro: string): Promise<void> {
		for (const [connectionId, connection] of this._connections) {
			if (connection.session.distro === distro) {
				this._closeRelay(connectionId);
			}
		}
		this._closeSession(distro);
	}

	async reconnect(distro: string, name: string, remoteAgentHostCommand?: string, userInitiated?: boolean, expectedConnectionId?: string): Promise<IWSLConnectResult> {
		if (!expectedConnectionId) {
			return this.connect({ distro, name, remoteAgentHostCommand, userInitiated });
		}
		const pending = this._pendingReconnects.get(expectedConnectionId);
		if (pending) {
			return pending;
		}
		const current = this._connections.get(expectedConnectionId);
		if (!current || current.session.distro !== distro) {
			const replacement = this._getCurrentRelay(expectedConnectionId);
			if (replacement?.session.distro === distro) {
				return this._toResult(replacement);
			}
			return this.connect({ distro, name, remoteAgentHostCommand, userInitiated });
		}
		const reconnect = this._createRelay(current.session).then(result => {
			this._replacements.set(expectedConnectionId, result.connectionId);
			this._closeRelay(expectedConnectionId, false);
			return result;
		});
		this._pendingReconnects.set(expectedConnectionId, reconnect);
		void reconnect.finally(() => {
			if (this._pendingReconnects.get(expectedConnectionId) === reconnect) {
				this._pendingReconnects.delete(expectedConnectionId);
			}
		}).catch(() => { /* The caller observes the original rejection. */ });
		return reconnect;
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

	async releaseRelay(connectionId: string): Promise<void> {
		this._closeRelay(connectionId);
	}

	private _toResult(connection: IWSLRelayLease): IWSLConnectResult {
		return {
			connectionId: connection.connectionId,
			address: connection.session.address,
			distro: connection.session.distro,
			name: connection.session.name,
			connectionToken: connection.session.connectionToken,
		};
	}

	private _closeRelay(connectionId: string, notifyRenderer = true): void {
		const conn = this._connections.get(connectionId);
		if (!conn) {
			return;
		}
		this._connections.delete(connectionId);
		this._pruneReplacements();
		try {
			conn.ws.close();
		} catch { /* ignore */ }
		if (notifyRenderer) {
			this._onDidRelayClose.fire(connectionId);
			this._onDidCloseConnection.fire(connectionId);
		}
		if (this._canCloseSession(conn.session)) {
			this._closeSession(conn.session.distro, conn.session);
		}
		this._onDidChangeConnections.fire();
	}

	private _handlePhysicalRelayClose(connectionId: string): void {
		const connection = this._connections.get(connectionId);
		if (!connection || connection.physicalCloseNotified) {
			return;
		}
		connection.physicalCloseNotified = true;
		this._onDidRelayClose.fire(connectionId);
	}

	private _getCurrentRelay(connectionId: string): IWSLRelayLease | undefined {
		let currentId = connectionId;
		const visited = new Set<string>();
		while (!visited.has(currentId)) {
			visited.add(currentId);
			const connection = this._connections.get(currentId);
			if (connection) {
				return connection;
			}
			const replacement = this._replacements.get(currentId);
			if (!replacement) {
				return undefined;
			}
			currentId = replacement;
		}
		return undefined;
	}

	private _pruneReplacements(): void {
		for (const connectionId of this._replacements.keys()) {
			if (!this._getCurrentRelay(connectionId)) {
				this._replacements.delete(connectionId);
			}
		}
	}

	private _closeSession(distro: string, expectedSession?: IWSLSession): void {
		const session = this._sessions.get(distro);
		if (!session || (expectedSession && session !== expectedSession)) {
			return;
		}
		this._sessions.delete(distro);
		session.disposables.dispose();
		for (const [connectionId, connection] of this._connections) {
			if (connection.session === session) {
				this._closeRelay(connectionId);
			}
		}
		this._pruneReplacements();
		this._killChild(session.child);
		this._onDidChangeConnections.fire();
	}

	private _canCloseSession(session: IWSLSession): boolean {
		return !this._pendingRelayAcquisitions.has(session)
			&& ![...this._connections.values()].some(connection => connection.session === session);
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
