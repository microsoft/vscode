/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { McpServerConnection } from './McpServerConnection';
import { McpStdioTransport } from './McpStdioTransport';

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

interface McpToolListing {
	server: string;
	tool: string;
	description: string;
}

export class McpClient {
	private readonly connections = new Map<string, McpServerConnection>();
	private cachedListing: McpToolListing[] | undefined;
	private initPromise: Promise<void> | undefined;
	private disposed = false;

	async listTools(): Promise<McpToolListing[]> {
		await this.ensureInitialised();
		return this.cachedListing ?? [];
	}

	async callTool(call: McpToolCall): Promise<McpToolResult> {
		await this.ensureInitialised();
		const connection = this.connections.get(call.server);
		if (!connection) {
			throw new Error(`Unknown MCP server: ${call.server}`);
		}
		if (connection.state !== 'ready') {
			throw new Error(`MCP server '${call.server}' is not connected`);
		}
		const start = Date.now();
		const result = await connection.callTool(call.tool, call.inputs);
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
		for (const [, connection] of this.connections) {
			try {
				connection.dispose();
			} catch (err) {
				console.warn('[McpClient] error disposing connection:', err);
			}
		}
		this.connections.clear();
		this.cachedListing = undefined;
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

		const cwdFallback = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const setupResults = await Promise.all(
			configs.map(cfg => this.bringUpConnection(cfg, cwdFallback)),
		);

		const listing: McpToolListing[] = [];
		for (const result of setupResults) {
			if (!result) {
				continue;
			}
			try {
				const tools = await result.connection.listTools();
				for (const tool of tools) {
					listing.push({
						server: result.connection.name,
						tool: tool.name,
						description: tool.description,
					});
				}
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				console.warn(`[McpClient] listTools failed for '${result.connection.name}': ${reason}`);
			}
		}
		this.cachedListing = listing;
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
			this.connections.set(cfg.name, connection);
			return { connection };
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			console.warn(`[McpClient] failed to connect to '${cfg.name}': ${reason}`);
			connection.dispose();
			return undefined;
		}
	}

	private readServerConfigs(): McpServerConfig[] {
		const raw = vscode.workspace.getConfiguration().get<unknown>('sota.mcp.servers');
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
