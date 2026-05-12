/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TypedEventEmitter, type Event } from '../eventEmitter';
import type { Disposable } from '../host';
import { McpServerConnection } from './McpServerConnection';
import { McpStdioTransport } from './McpStdioTransport';

/**
 * Host-side hooks the MCP client needs. The extension wraps
 * `vscode.workspace.getConfiguration().get('sota.mcp.servers')` and
 * `vscode.workspace.onDidChangeConfiguration`; the CLI watches a JSON file.
 */
export interface McpClientDeps {
	/** Read the latest `sota.mcp.servers` array (raw, untyped). */
	readonly readServersSetting: () => unknown;
	/** Workspace root used as the default cwd for spawned servers. */
	readonly getWorkspaceRoot: () => string | undefined;
	/** Subscribe to changes that should trigger a reconcile. */
	readonly onSettingChange: (listener: () => void) => Disposable;
}

export interface McpToolCall {
	server: string;
	tool: string;
	inputs: Record<string, unknown>;
}

export interface McpToolResult {
	content: string;
	isError: boolean;
	latencyMs: number;
}

export interface McpServerConfig {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface McpToolListing {
	server: string;
	tool: string;
	description: string;
}

/**
 * Result of diffing the previously-active MCP server set against the
 * new desired set. Exposed for unit testing — `applyServerDelta` uses it
 * directly to drive disconnect / connect cycles.
 */
export interface McpServerDelta {
	added: McpServerConfig[];
	removed: string[];
	modified: McpServerConfig[];
	unchanged: string[];
}

interface ActiveConnection {
	connection: McpServerConnection;
	config: McpServerConfig;
	signature: string;
}

/**
 * Compute a stable signature for a server config so we can decide whether a
 * settings entry was modified (rather than just renamed). Whitespace-insensitive
 * across `args` ordering by way of `JSON.stringify` over a normalised shape.
 */
function signatureOf(cfg: McpServerConfig): string {
	const env = cfg.env ? Object.keys(cfg.env).sort().reduce<Record<string, string>>((acc, k) => {
		acc[k] = cfg.env![k];
		return acc;
	}, {}) : undefined;
	return JSON.stringify({
		command: cfg.command,
		args: cfg.args ?? [],
		env: env ?? {},
		cwd: cfg.cwd ?? '',
	});
}

/**
 * Pure helper that diffs old vs new server lists. Exported for unit testing —
 * the live reconnect path calls this from `onDidChangeConfiguration`.
 *
 * - `added`: in next, not in active.
 * - `removed`: in active, not in next.
 * - `modified`: name unchanged, but command/args/env/cwd differ.
 * - `unchanged`: name and signature both match — left alone.
 */
export function diffServerConfigs(
	active: ReadonlyArray<{ name: string; signature: string }>,
	next: ReadonlyArray<McpServerConfig>,
): McpServerDelta {
	const activeByName = new Map(active.map(a => [a.name, a]));
	const nextByName = new Map(next.map(n => [n.name, n]));

	const added: McpServerConfig[] = [];
	const removed: string[] = [];
	const modified: McpServerConfig[] = [];
	const unchanged: string[] = [];

	for (const cfg of next) {
		const existing = activeByName.get(cfg.name);
		if (!existing) {
			added.push(cfg);
			continue;
		}
		if (existing.signature !== signatureOf(cfg)) {
			modified.push(cfg);
		} else {
			unchanged.push(cfg.name);
		}
	}
	for (const a of active) {
		if (!nextByName.has(a.name)) {
			removed.push(a.name);
		}
	}
	return { added, removed, modified, unchanged };
}

export class McpClient {
	private readonly connections = new Map<string, ActiveConnection>();
	private cachedListing: McpToolListing[] | undefined;
	private initPromise: Promise<void> | undefined;
	private disposed = false;
	private readonly subscriptions: Disposable[] = [];
	private readonly _onDidChangeTools = new TypedEventEmitter<McpToolListing[]>();
	private reconcileChain: Promise<void> = Promise.resolve();
	private readonly deps: McpClientDeps;

	/**
	 * Fires whenever the active set of MCP tools changes (initial discovery
	 * completes, a server is added/removed/modified via settings, or a
	 * disconnect occurs). The payload is the latest tool listing — consumers
	 * can rebuild their view in one shot rather than tracking deltas
	 * themselves. The bridge subscribes to this event to keep the
	 * `ToolRegistry` in lock-step with `sota.mcp.servers`.
	 */
	readonly onDidChangeTools: Event<McpToolListing[]> = this._onDidChangeTools.event;

	constructor(deps: McpClientDeps) {
		this.deps = deps;
		// Watch for changes to the MCP server config so adds / edits / removes
		// take effect without a chat reload. We register the listener
		// immediately, but only act after the lazy initialisation has run at
		// least once — otherwise the first `listTools()` call would race the
		// reconcile flow and we'd risk double-spawning processes.
		this.subscriptions.push(
			this.deps.onSettingChange(() => this.scheduleReconcile()),
		);
	}

	async listTools(): Promise<McpToolListing[]> {
		await this.ensureInitialised();
		return this.cachedListing ?? [];
	}

	async callTool(call: McpToolCall): Promise<McpToolResult> {
		await this.ensureInitialised();
		const active = this.connections.get(call.server);
		if (!active) {
			// Soft-fail when the server isn't configured: throwing here cascades
			// through every helper (BaseAgent.queryFileGraph / querySymbol /
			// dependency_traversal / impact_analysis / find_references and the
			// orchestrator's per-subtask context build) and kills the whole
			// subtask before any LLM call. Callers that already wrap individual
			// queries in try/catch (gatherGraphContext) still get a clean
			// error-result they can branch on; callers that don't (the new
			// per-subtask queryFileGraph fan-out) degrade gracefully to "no
			// graph data" instead of failing the run.
			return {
				content: `(MCP server '${call.server}' not configured. Start the son-of-anton-graph stack with 'docker compose up -d' to enable graph-backed context.)`,
				isError: true,
				latencyMs: 0,
			};
		}
		if (active.connection.state !== 'ready') {
			return {
				content: `(MCP server '${call.server}' is not connected. Check the stack with 'docker compose ps'.)`,
				isError: true,
				latencyMs: 0,
			};
		}
		const start = Date.now();
		const result = await active.connection.callTool(call.tool, call.inputs);
		return {
			content: result.content,
			isError: result.isError,
			latencyMs: Date.now() - start,
		};
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const sub of this.subscriptions) {
			try {
				sub.dispose();
			} catch (err) {
				console.warn('[McpClient] error disposing subscription:', err);
			}
		}
		this.subscriptions.length = 0;
		for (const [, active] of this.connections) {
			try {
				active.connection.dispose();
			} catch (err) {
				console.warn('[McpClient] error disposing connection:', err);
			}
		}
		this.connections.clear();
		this.cachedListing = undefined;
		this._onDidChangeTools.dispose();
	}

	private ensureInitialised(): Promise<void> {
		if (this.disposed) {
			return Promise.reject(new Error('McpClient has been disposed'));
		}
		if (!this.initPromise) {
			this.initPromise = this.initialise();
		}
		return this.initPromise;
	}

	private async initialise(): Promise<void> {
		const configs = this.readServerConfigs();
		if (configs.length === 0) {
			this.cachedListing = [];
			return;
		}

		const cwdFallback = this.deps.getWorkspaceRoot();
		await Promise.all(
			configs.map(cfg => this.bringUpConnection(cfg, cwdFallback)),
		);

		await this.refreshCachedListing();
	}

	private async bringUpConnection(
		cfg: McpServerConfig,
		cwdFallback: string | undefined,
	): Promise<{ connection: McpServerConnection } | undefined> {
		const transport = new McpStdioTransport({
			command: cfg.command,
			args: cfg.args ?? [],
			env: cfg.env,
			cwd: cfg.cwd ?? cwdFallback,
		});
		const connection = new McpServerConnection({ name: cfg.name, transport });
		try {
			await connection.connect();
			this.connections.set(cfg.name, {
				connection,
				config: cfg,
				signature: signatureOf(cfg),
			});
			return { connection };
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			console.warn(`[McpClient] failed to connect to '${cfg.name}': ${reason}`);
			connection.dispose();
			return undefined;
		}
	}

	/**
	 * Re-collect tool listings from every active connection and update the
	 * cache. Best-effort: if a particular server fails to enumerate tools we
	 * log and skip it, rather than aborting the whole refresh.
	 */
	private async refreshCachedListing(): Promise<void> {
		const listing: McpToolListing[] = [];
		for (const [, active] of this.connections) {
			try {
				const tools = await active.connection.listTools();
				for (const tool of tools) {
					listing.push({
						server: active.connection.name,
						tool: tool.name,
						description: tool.description,
					});
				}
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				console.warn(`[McpClient] listTools failed for '${active.connection.name}': ${reason}`);
			}
		}
		this.cachedListing = listing;
	}

	/**
	 * Queue a reconcile so concurrent settings churn (e.g. the user toggling
	 * a value rapidly) collapses into a single linear chain rather than racing
	 * each other. We always read the latest config inside the chained task so
	 * the most recent value wins.
	 */
	private scheduleReconcile(): void {
		if (this.disposed) {
			return;
		}
		this.reconcileChain = this.reconcileChain
			.catch(() => undefined)
			.then(() => this.reconcileNow());
	}

	/**
	 * Apply the diff between the currently active connections and the latest
	 * `sota.mcp.servers` setting. Public-ish so the test suite can drive it
	 * directly with a stubbed config — production code goes through
	 * `scheduleReconcile`.
	 */
	private async reconcileNow(): Promise<void> {
		if (this.disposed) {
			return;
		}
		// If we haven't done the initial connect yet, defer to it — there's no
		// "active set" to diff against and the lazy init will pick up the
		// latest values when triggered. This preserves Phase 27's lazy-init
		// contract.
		if (!this.initPromise) {
			return;
		}
		// Wait for any in-flight initial init so we don't tear it down mid-spawn.
		try {
			await this.initPromise;
		} catch {
			// Initial init failures are already logged; we can still reconcile.
		}

		const next = this.readServerConfigs();
		const active = [...this.connections.values()].map(a => ({
			name: a.config.name,
			signature: a.signature,
		}));
		const delta = diffServerConfigs(active, next);

		if (delta.added.length === 0 && delta.removed.length === 0 && delta.modified.length === 0) {
			return;
		}

		const cwdFallback = this.deps.getWorkspaceRoot();

		// Tear down removed servers first.
		for (const name of delta.removed) {
			this.disposeConnection(name);
		}
		// Tear down + restart modified servers.
		for (const cfg of delta.modified) {
			this.disposeConnection(cfg.name);
		}
		// Spawn new + modified servers.
		const toStart = [...delta.added, ...delta.modified];
		await Promise.all(toStart.map(cfg => this.bringUpConnection(cfg, cwdFallback)));

		await this.refreshCachedListing();
		this._onDidChangeTools.fire(this.cachedListing ?? []);
	}

	private disposeConnection(name: string): void {
		const active = this.connections.get(name);
		if (!active) {
			return;
		}
		this.connections.delete(name);
		try {
			active.connection.dispose();
		} catch (err) {
			console.warn(`[McpClient] error disposing connection '${name}':`, err);
		}
	}

	private readServerConfigs(): McpServerConfig[] {
		const raw = this.deps.readServersSetting();
		if (!Array.isArray(raw)) {
			return [];
		}
		const configs: McpServerConfig[] = [];
		const seenNames = new Set<string>();
		for (const entry of raw) {
			if (!entry || typeof entry !== 'object') {
				continue;
			}
			const candidate = entry as Record<string, unknown>;
			const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
			const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
			if (!name || !command) {
				console.warn('[McpClient] skipping MCP server entry with missing name or command:', entry);
				continue;
			}
			if (seenNames.has(name)) {
				console.warn(`[McpClient] duplicate MCP server name '${name}'; skipping later entry`);
				continue;
			}
			seenNames.add(name);
			const args = Array.isArray(candidate.args)
				? candidate.args.filter((a): a is string => typeof a === 'string')
				: undefined;
			const env = candidate.env && typeof candidate.env === 'object'
				? this.coerceStringRecord(candidate.env as Record<string, unknown>)
				: undefined;
			const cwd = typeof candidate.cwd === 'string' && candidate.cwd.length > 0
				? candidate.cwd
				: undefined;
			configs.push({ name, command, args, env, cwd });
		}
		return configs;
	}

	private coerceStringRecord(input: Record<string, unknown>): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(input)) {
			if (typeof v === 'string') {
				out[k] = v;
			}
		}
		return out;
	}
}
