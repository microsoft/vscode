/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as cp from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type CodeGraphState = 'unknown' | 'starting' | 'running' | 'stopped' | 'unavailable' | 'error';

export interface CodeGraphControllerDeps {
	/** Workspace root used to anchor the docker compose file path. */
	workspaceRoot: string | undefined;
	/** Output channel for streaming docker compose stdout/stderr. */
	output: vscode.OutputChannel;
	/** Directory containing the bundled `services/code-graph/` stack. Defaults to `<workspaceRoot>`. */
	repoRoot?: string;
}

/**
 * Manages the lifecycle of the bundled code-graph docker compose stack
 * (FalkorDB + Qdrant + indexer) and the stdio MCP server registration.
 *
 * All Docker-related operations gracefully no-op when `docker` is missing
 * from PATH — the extension must remain functional for users who haven't
 * installed Docker Desktop.
 */
export class CodeGraphController implements vscode.Disposable {
	private readonly deps: CodeGraphControllerDeps;
	private readonly _onDidChangeState = new vscode.EventEmitter<CodeGraphState>();
	readonly onDidChangeState = this._onDidChangeState.event;
	private currentState: CodeGraphState = 'unknown';

	constructor(deps: CodeGraphControllerDeps) {
		this.deps = deps;
	}

	get state(): CodeGraphState {
		return this.currentState;
	}

	/**
	 * Resolve the absolute path to `services/code-graph/`. Returns undefined
	 * if no workspace root is configured or the directory is missing.
	 */
	getStackRoot(): string | undefined {
		// Try the repo root first (where the bundled `services/code-graph/`
		// actually lives), fall back to the user's workspace root (covers the
		// case where the user has cloned the Son of Anton repo as their
		// workspace and didn't pass a separate repoRoot).
		const candidates = [this.deps.repoRoot, this.deps.workspaceRoot].filter((c): c is string => Boolean(c));
		for (const root of candidates) {
			const stack = path.join(root, 'services', 'code-graph');
			try {
				const stat = fs.statSync(stack);
				if (stat.isDirectory()) {
					return stack;
				}
			} catch {
				// not in this candidate, try next
			}
		}
		return undefined;
	}

	/** Check whether `docker` is on PATH. */
	async isDockerAvailable(): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			const child = cp.spawn('docker', ['--version'], { stdio: 'ignore' });
			child.on('error', () => resolve(false));
			child.on('close', code => resolve(code === 0));
		});
	}

	/**
	 * Start the docker compose stack and poll FalkorDB until ready (or 60s).
	 * Streams compose output to the configured output channel.
	 */
	async start(): Promise<{ ok: true } | { ok: false; reason: string }> {
		const stack = this.getStackRoot();
		if (!stack) {
			return { ok: false, reason: 'services/code-graph/ not found in the Son of Anton repo. The bundled stack lives alongside the extensions/ dir; if you forked the repo, ensure the services/ folder is present.' };
		}
		if (!(await this.isDockerAvailable())) {
			this.setState('unavailable');
			return { ok: false, reason: 'Docker is not on PATH' };
		}
		this.setState('starting');
		this.deps.output.appendLine(`[code-graph] starting stack from ${stack}`);

		const composeResult = await this.runCompose(stack, ['up', '-d']);
		if (!composeResult.ok) {
			this.setState('error');
			return composeResult;
		}

		const ready = await this.waitForFalkorDb(60_000);
		if (!ready) {
			this.setState('error');
			return { ok: false, reason: 'FalkorDB did not become ready within 60s' };
		}
		this.setState('running');
		return { ok: true };
	}

	/** Stop the stack (preserves data volumes). */
	async stop(): Promise<{ ok: true } | { ok: false; reason: string }> {
		const stack = this.getStackRoot();
		if (!stack) {
			return { ok: false, reason: 'services/code-graph/ not found' };
		}
		if (!(await this.isDockerAvailable())) {
			this.setState('unavailable');
			return { ok: false, reason: 'Docker is not on PATH' };
		}
		const result = await this.runCompose(stack, ['down']);
		if (result.ok) {
			this.setState('stopped');
		}
		return result;
	}

	/** Restart by stopping then starting. */
	async restart(): Promise<{ ok: true } | { ok: false; reason: string }> {
		const stop = await this.stop();
		if (!stop.ok) {
			return stop;
		}
		return this.start();
	}

	/**
	 * Persist the bundled MCP server registration into User-scope settings so
	 * future sessions auto-discover it. Idempotent — adds only if missing.
	 */
	async registerMcpServer(): Promise<void> {
		const stack = this.getStackRoot();
		if (!stack) {
			return;
		}
		const serverEntryPoint = path.join(stack, 'mcp-server', 'dist', 'index.js');
		const cwd = this.deps.repoRoot ?? this.deps.workspaceRoot ?? stack;

		const config = vscode.workspace.getConfiguration();
		const current = config.get<unknown>('sota.mcp.servers');
		const list: McpServerEntry[] = Array.isArray(current)
			? (current as McpServerEntry[]).filter(e => e && typeof e === 'object')
			: [];

		const existingIdx = list.findIndex(e => e?.name === 'code-graph');
		const entry: McpServerEntry = {
			name: 'code-graph',
			command: 'node',
			args: [serverEntryPoint],
			cwd,
		};
		if (existingIdx >= 0) {
			list[existingIdx] = entry;
		} else {
			list.push(entry);
		}
		await config.update('sota.mcp.servers', list, vscode.ConfigurationTarget.Global);
	}

	/** Append the last 100 lines of compose logs to the output channel. */
	async showLogs(): Promise<void> {
		const stack = this.getStackRoot();
		if (!stack || !(await this.isDockerAvailable())) {
			return;
		}
		this.deps.output.show(true);
		await this.runCompose(stack, ['logs', '--tail', '100']);
	}

	private setState(next: CodeGraphState): void {
		if (next === this.currentState) {
			return;
		}
		this.currentState = next;
		this._onDidChangeState.fire(next);
	}

	private runCompose(stack: string, args: string[]): Promise<{ ok: true } | { ok: false; reason: string }> {
		return new Promise(resolve => {
			const fullArgs = ['compose', '-f', path.join(stack, 'docker-compose.yml'), ...args];
			this.deps.output.appendLine(`> docker ${fullArgs.join(' ')}`);
			const child = cp.spawn('docker', fullArgs, { cwd: stack });
			child.stdout.setEncoding('utf8');
			child.stderr.setEncoding('utf8');
			child.stdout.on('data', (chunk: string) => this.deps.output.append(chunk));
			child.stderr.on('data', (chunk: string) => this.deps.output.append(chunk));
			child.on('error', err => {
				this.deps.output.appendLine(`[code-graph] docker spawn error: ${err.message}`);
				resolve({ ok: false, reason: err.message });
			});
			child.on('close', code => {
				if (code === 0) {
					resolve({ ok: true });
				} else {
					resolve({ ok: false, reason: `docker compose exited with code ${code ?? 'null'}` });
				}
			});
		});
	}

	private async waitForFalkorDb(timeoutMs: number): Promise<boolean> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const ok = await this.probeFalkorDb();
			if (ok) {
				return true;
			}
			await new Promise(r => setTimeout(r, 1_000));
		}
		return false;
	}

	private probeFalkorDb(): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			const child = cp.spawn('docker', [
				'exec', 'son-of-anton-falkordb',
				'redis-cli', 'GRAPH.QUERY', 'son-of-anton', 'RETURN 1',
			], { stdio: 'ignore' });
			child.on('error', () => resolve(false));
			child.on('close', code => resolve(code === 0));
		});
	}

	dispose(): void {
		this._onDidChangeState.dispose();
	}
}

interface McpServerEntry {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}
