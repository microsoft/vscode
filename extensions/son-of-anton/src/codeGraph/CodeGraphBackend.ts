/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as cp from 'node:child_process';

/**
 * High-level state of the code-graph backend. Drives the status bar item
 * and is observable via `onDidChangeState`.
 *
 * - `off`        — the user disabled the backend (`sota.codeGraph.backend = 'off'`).
 * - `starting`   — child process spawn in flight, or detection in progress.
 * - `embedded`   — bundled MCP server is alive and serving requests.
 * - `docker`     — the legacy `services/{indexer,lsif,mcp-gateway}` Docker
 *                  stack was detected on its published ports; we deferred to
 *                  it instead of spawning our own server.
 * - `failed`     — child process exited or never came up after retries.
 */
export type CodeGraphBackendState = 'off' | 'starting' | 'embedded' | 'docker' | 'failed';

/**
 * Embedder configuration for `semantic_search`. `none` is the default — the
 * server still loads but `semantic_search` returns empty results. The user
 * opts in to a local model download (`local`) or an OpenAI-compatible
 * provider endpoint (`provider`).
 */
export type CodeGraphEmbedderMode = 'none' | 'local' | 'provider';

/**
 * Resolved backend preference. `auto` resolves to `docker` if the legacy
 * stack is detected, otherwise `embedded`. `off` disables the backend
 * entirely. `embedded` / `docker` force the corresponding path.
 */
export type CodeGraphBackendChoice = 'auto' | 'embedded' | 'docker' | 'off';

export interface CodeGraphBackendOptions {
	/** Workspace root used as the index target and child cwd. Undefined if no folder is open. */
	readonly workspaceRoot: string | undefined;
	/** Repo root — where the bundled `services/code-graph/` lives. Defaults to extensionPath/../..   */
	readonly repoRoot: string;
	/** Extension's globalStorageUri.fsPath — used for the SQLite db path. */
	readonly storageDir: string;
	/** Output channel for child stdout/stderr + lifecycle logs. */
	readonly output: vscode.OutputChannel;
	/** Read latest configuration. Defaults to `vscode.workspace.getConfiguration('sota.codeGraph')`. */
	readonly getConfiguration?: () => vscode.WorkspaceConfiguration;
}

interface BackoffSchedule {
	readonly attempt: number;
	readonly delayMs: number;
}

const RESTART_DELAYS_MS: ReadonlyArray<number> = [1_000, 4_000, 16_000];
const LEGACY_DOCKER_PORTS: ReadonlyArray<number> = [
	// `services/indexer` published port (gRPC stub).
	7090,
	// `services/lsif` (HTTP).
	7091,
	// `services/mcp-gateway` (stdio shim exposed as TCP for the IDE host).
	7092,
];
const LEGACY_PROBE_TIMEOUT_MS = 250;

/**
 * Owns the lifecycle of the bundled code-graph MCP server child process.
 *
 * Responsibilities:
 *  - On `start()`: detect whether a legacy `services/{indexer,lsif,mcp-gateway}`
 *    Docker stack is already running. If so, defer to it (no child spawn).
 *  - Otherwise spawn `node services/code-graph/mcp-server/dist/index.js`
 *    with `--db`, `--index-root`, and embedder flags derived from settings.
 *  - Auto-restart with exponential backoff (1s / 4s / 16s, max 3 attempts).
 *  - Expose an MCP server entry (`getMcpServerEntry()`) that the extension
 *    merges into `sota.mcp.servers` so the existing `McpClient` discovers it
 *    automatically.
 *  - Cleanly tear down the child on `dispose()`.
 *
 * The class is intentionally decoupled from the older `CodeGraphController`
 * which manages the *new* (FalkorDB+Qdrant) bundled docker compose stack —
 * the two paths coexist while the embedded backend is stabilised.
 */
export class CodeGraphBackend implements vscode.Disposable {
	private readonly options: CodeGraphBackendOptions;
	private readonly _onDidChangeState = new vscode.EventEmitter<CodeGraphBackendState>();
	readonly onDidChangeState: vscode.Event<CodeGraphBackendState> = this._onDidChangeState.event;

	private state: CodeGraphBackendState = 'off';
	private child: cp.ChildProcess | undefined;
	private disposed = false;
	private restartAttempt = 0;
	private restartTimer: NodeJS.Timeout | undefined;
	private lastIndexAt: number | undefined;
	private lastSymbolCount: number | undefined;
	private lastFileCount: number | undefined;
	private lastFailureReason: string | undefined;

	constructor(options: CodeGraphBackendOptions) {
		this.options = options;
	}

	get currentState(): CodeGraphBackendState {
		return this.state;
	}

	get lastIndexedAt(): number | undefined {
		return this.lastIndexAt;
	}

	get symbolCount(): number | undefined {
		return this.lastSymbolCount;
	}

	get fileCount(): number | undefined {
		return this.lastFileCount;
	}

	get failureReason(): string | undefined {
		return this.lastFailureReason;
	}

	/**
	 * Begin the activation flow. Resolves the user's `backend` setting,
	 * probes for an existing Docker stack if needed, then either spawns
	 * the embedded server or remains in `docker` mode (no spawn).
	 *
	 * Idempotent — calling `start()` on an already-running backend tears
	 * the existing child down first.
	 */
	async start(): Promise<void> {
		if (this.disposed) {
			return;
		}
		this.killChild();
		this.restartAttempt = 0;
		this.lastFailureReason = undefined;

		const choice = this.resolveBackendChoice();
		this.log(`backend=${choice} (resolved from setting)`);

		if (choice === 'off') {
			this.setState('off');
			return;
		}

		this.setState('starting');

		if (choice === 'docker') {
			const legacy = await this.detectLegacyDockerStack();
			if (legacy) {
				this.log('legacy docker stack detected — deferring to it (no embedded spawn)');
				this.setState('docker');
				return;
			}
			this.log('docker backend requested but no legacy stack detected — falling back to embedded');
		}

		if (choice === 'auto') {
			const legacy = await this.detectLegacyDockerStack();
			if (legacy) {
				this.log('legacy docker stack detected on probe ports — deferring to it');
				this.setState('docker');
				return;
			}
		}

		this.spawnEmbedded();
	}

	/**
	 * Tear down the child and start fresh. Used by the `restart` palette
	 * command and the "Restart" quick-pick action.
	 */
	async restart(): Promise<void> {
		this.log('restart requested');
		await this.start();
	}

	/**
	 * Trigger an initial / full re-index. The current MCP server is a
	 * placeholder that doesn't support a reindex RPC — we kill the child
	 * and respawn with `--index-root` to force a fresh build. Once the
	 * server grows a reindex RPC this can switch to a tools/call.
	 */
	async indexWorkspace(): Promise<void> {
		this.log('reindex requested — respawning with fresh --index-root');
		await this.start();
	}

	/**
	 * Build an MCP server entry that the extension merges into the
	 * effective `sota.mcp.servers` list. Returns `undefined` when the
	 * backend is off or in `docker` mode (the user is expected to have
	 * configured the legacy stack manually, so we don't double-register).
	 */
	getMcpServerEntry(): McpServerEntry | undefined {
		if (this.state === 'off' || this.state === 'docker') {
			return undefined;
		}
		const serverEntry = this.serverEntryPath();
		if (!serverEntry) {
			return undefined;
		}
		const args: string[] = [serverEntry, '--backend=sqlite'];
		const indexRoot = this.resolveIndexRoot();
		if (indexRoot) {
			args.push(`--index-root=${indexRoot}`);
		}
		const dbPath = path.join(this.options.storageDir, 'codegraph.db');
		args.push(`--db=${dbPath}`);

		const embedder = this.resolveEmbedderMode();
		if (embedder === 'local') {
			args.push('--local-embedder');
		} else if (embedder === 'provider') {
			const cfg = this.options.getConfiguration?.() ?? vscode.workspace.getConfiguration('sota.codeGraph');
			const endpoint = cfg.get<string>('providerEmbedder.endpoint', '');
			const model = cfg.get<string>('providerEmbedder.model', '');
			const dims = cfg.get<number>('providerEmbedder.dims', 1536);
			if (endpoint && model) {
				args.push(`--provider-embedder=${endpoint}|${model}|${dims}`);
			} else {
				this.log('provider embedder configured but endpoint/model missing — running with no embedder');
			}
		}

		return {
			name: 'code-graph',
			command: 'node',
			args,
			cwd: this.options.workspaceRoot ?? this.options.repoRoot,
		};
	}

	/**
	 * Path to the bundled MCP server's compiled entry point. Returns
	 * `undefined` when the file is missing (e.g. the server hasn't been
	 * built in this checkout).
	 */
	serverEntryPath(): string | undefined {
		const candidate = path.join(
			this.options.repoRoot,
			'services', 'code-graph', 'mcp-server', 'dist', 'index.js',
		);
		try {
			if (fs.statSync(candidate).isFile()) {
				return candidate;
			}
		} catch {
			// File missing — server not built. Caller treats this as a no-op.
		}
		return undefined;
	}

	/**
	 * Open the output channel that streams child stdout/stderr. Wired to
	 * the `sota.codeGraph.openLogs` palette command.
	 */
	openLogs(): void {
		this.options.output.show(true);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = undefined;
		}
		this.killChild();
		this._onDidChangeState.dispose();
	}

	private setState(next: CodeGraphBackendState, reason?: string): void {
		if (reason) {
			this.lastFailureReason = reason;
		}
		if (this.state === next) {
			return;
		}
		this.state = next;
		this._onDidChangeState.fire(next);
	}

	private resolveBackendChoice(): CodeGraphBackendChoice {
		const cfg = this.options.getConfiguration?.() ?? vscode.workspace.getConfiguration('sota.codeGraph');
		const raw = cfg.get<string>('backend', 'auto');
		if (raw === 'embedded' || raw === 'docker' || raw === 'off' || raw === 'auto') {
			return raw;
		}
		return 'auto';
	}

	private resolveEmbedderMode(): CodeGraphEmbedderMode {
		const cfg = this.options.getConfiguration?.() ?? vscode.workspace.getConfiguration('sota.codeGraph');
		const raw = cfg.get<string>('embedder', 'none');
		if (raw === 'local' || raw === 'provider' || raw === 'none') {
			return raw;
		}
		return 'none';
	}

	private resolveIndexRoot(): string | undefined {
		const cfg = this.options.getConfiguration?.() ?? vscode.workspace.getConfiguration('sota.codeGraph');
		const explicit = cfg.get<string>('indexRoot', '');
		if (explicit && explicit.trim().length > 0) {
			return explicit;
		}
		return this.options.workspaceRoot;
	}

	private spawnEmbedded(): void {
		const entry = this.serverEntryPath();
		if (!entry) {
			this.log(
				'embedded server entry missing — services/code-graph/mcp-server/dist/index.js not found. ' +
				'Run `npm run build` inside services/code-graph/mcp-server/ to build it.',
			);
			this.setState('failed', 'mcp-server not built');
			return;
		}

		const serverEntry = this.getMcpServerEntry();
		if (!serverEntry) {
			this.setState('failed', 'could not build server entry');
			return;
		}

		this.log(`spawning: ${serverEntry.command} ${serverEntry.args?.join(' ') ?? ''}`);
		const child = cp.spawn(serverEntry.command, serverEntry.args ?? [], {
			cwd: serverEntry.cwd ?? this.options.repoRoot,
			env: { ...process.env, ...serverEntry.env },
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		this.child = child;

		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');

		// stdout is the JSON-RPC channel; in production the McpClient owns it.
		// We don't have stdio here (the spawn is owned by us, not McpClient),
		// so the on-disk child here is purely a probe / status feed. The real
		// JSON-RPC connection is brought up by McpClient when it reads the
		// merged `sota.mcp.servers` and spawns its own child.
		//
		// We keep this probe-spawn alive only long enough to confirm the
		// server reaches "ready" — then we tear it down and let McpClient
		// own the production child. Keeping two children alive
		// simultaneously double-binds the SQLite database.
		child.stdout?.on('data', chunk => {
			this.options.output.append(`[stdout] ${chunk}`);
		});

		child.stderr?.on('data', chunk => {
			const text = String(chunk);
			this.options.output.append(`[stderr] ${text}`);
			const indexed = text.match(/indexed (\d+) files, (\d+) symbols/);
			if (indexed) {
				this.lastFileCount = Number(indexed[1]);
				this.lastSymbolCount = Number(indexed[2]);
				this.lastIndexAt = Date.now();
			}
			if (/mcp server ready/i.test(text)) {
				this.setState('embedded');
				this.restartAttempt = 0;
				// Probe child has done its job — tear it down so McpClient
				// can take ownership of the JSON-RPC channel without double
				// binding the SQLite database.
				this.killChild();
			}
		});

		child.on('exit', (code, signal) => {
			this.log(`mcp server exited (code=${code}, signal=${signal})`);
			this.child = undefined;
			if (this.disposed) {
				return;
			}
			// If we exited cleanly after reaching 'embedded' (probe shutdown),
			// stay in the embedded state — the McpClient owns its own child.
			if (this.state === 'embedded') {
				return;
			}
			this.scheduleRestart(`server exited (code=${code ?? 'null'})`);
		});

		child.on('error', err => {
			this.log(`mcp server failed to start: ${err.message}`);
			this.scheduleRestart(err.message);
		});
	}

	private scheduleRestart(reason: string): void {
		if (this.disposed) {
			return;
		}
		const schedule = this.nextRestartDelay();
		if (!schedule) {
			this.setState('failed', `gave up after ${RESTART_DELAYS_MS.length} attempts: ${reason}`);
			this.log(`max restart attempts reached: ${reason}`);
			return;
		}
		this.log(`restart in ${schedule.delayMs}ms (attempt ${schedule.attempt}/${RESTART_DELAYS_MS.length}): ${reason}`);
		this.setState('starting', reason);
		this.restartTimer = setTimeout(() => {
			this.restartTimer = undefined;
			this.spawnEmbedded();
		}, schedule.delayMs);
	}

	private nextRestartDelay(): BackoffSchedule | undefined {
		if (this.restartAttempt >= RESTART_DELAYS_MS.length) {
			return undefined;
		}
		const delayMs = RESTART_DELAYS_MS[this.restartAttempt];
		const attempt = this.restartAttempt + 1;
		this.restartAttempt = attempt;
		return { attempt, delayMs };
	}

	private killChild(): void {
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = undefined;
		}
		const child = this.child;
		if (!child || child.killed) {
			return;
		}
		try {
			child.kill('SIGTERM');
		} catch (err) {
			this.log(`error killing child: ${(err as Error).message}`);
		}
		this.child = undefined;
	}

	private async detectLegacyDockerStack(): Promise<boolean> {
		// Each of the legacy services published a distinct port. We
		// short-circuit on the first hit — if *any* of them are bound, the
		// user is clearly running the legacy stack and we should not
		// silently steal control by spawning our own server.
		for (const port of LEGACY_DOCKER_PORTS) {
			const open = await probeLocalPort(port, LEGACY_PROBE_TIMEOUT_MS);
			if (open) {
				return true;
			}
		}
		return false;
	}

	private log(message: string): void {
		this.options.output.appendLine(`[${new Date().toISOString()}] ${message}`);
	}
}

/**
 * MCP server entry shape mirroring the JSON shape of `sota.mcp.servers`
 * items. Re-exported so the extension can merge our entry with the user's
 * configured servers without an extra import from `son-of-anton-core`.
 */
export interface McpServerEntry {
	readonly name: string;
	readonly command: string;
	readonly args?: ReadonlyArray<string>;
	readonly env?: Readonly<Record<string, string>>;
	readonly cwd?: string;
}

/** Open a TCP connection to `127.0.0.1:<port>` with a tight timeout. */
function probeLocalPort(port: number, timeoutMs: number): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		const socket = new net.Socket();
		let settled = false;
		const settle = (result: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			resolve(result);
		};
		socket.setTimeout(timeoutMs);
		socket.once('connect', () => settle(true));
		socket.once('timeout', () => settle(false));
		socket.once('error', () => settle(false));
		try {
			socket.connect(port, '127.0.0.1');
		} catch {
			settle(false);
		}
	});
}
