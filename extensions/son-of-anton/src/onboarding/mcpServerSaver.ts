/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

/**
 * Shape of a single MCP server entry stored under `sota.mcp.servers`. The
 * runtime `McpClient` reads the same field set from configuration when it
 * spawns the child process, so this interface is the contract between the
 * settings UI and the transport layer.
 */
export interface McpServerConfig {
	readonly name: string;
	readonly command: string;
	readonly args?: ReadonlyArray<string>;
	readonly env?: Record<string, string>;
	readonly cwd?: string;
}

/**
 * Result of a save / delete attempt. `ok` is `false` when validation rejects
 * the request OR when the underlying `config.update` call throws — the chat
 * webview surfaces the message inline as a status pill.
 */
export interface McpServerSaveResult {
	readonly ok: boolean;
	readonly message: string;
}

/**
 * Allowed characters in a server name. The name becomes part of the tool id
 * (`mcp__<name>__<tool>`) so we keep it conservative — alphanumerics with
 * dash and underscore — and reject everything else to avoid surprises in
 * downstream parsers.
 */
const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Read the configured MCP servers, defensively coercing each entry so a
 * malformed `settings.json` doesn't crash the UI. The shape mirrors what
 * `McpClient.readServerConfigs` accepts at runtime.
 */
export async function listMcpServers(config: vscode.WorkspaceConfiguration): Promise<McpServerConfig[]> {
	const raw = config.get<unknown>('mcp.servers', []);
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: McpServerConfig[] = [];
	for (const entry of raw) {
		const coerced = coerceServerConfig(entry);
		if (coerced) {
			out.push(coerced);
		}
	}
	return out;
}

/**
 * Persist a server entry. `mode === 'add'` rejects duplicate names; `'edit'`
 * replaces by name and falls back to appending if the name is no longer in
 * the list (e.g. the user changed it).
 *
 * Validation runs before any write so the settings array is never mutated
 * with an invalid entry.
 */
export async function saveMcpServer(
	server: McpServerConfig,
	mode: 'add' | 'edit',
	config: vscode.WorkspaceConfiguration,
): Promise<McpServerSaveResult> {
	const validation = validateServer(server);
	if (!validation.ok) {
		return validation;
	}
	const existing = await listMcpServers(config);
	const indexByName = existing.findIndex(s => s.name === server.name);
	if (mode === 'add' && indexByName !== -1) {
		return { ok: false, message: `An MCP server named "${server.name}" already exists.` };
	}
	const next = [...existing];
	const normalised = normaliseForStorage(server);
	if (indexByName === -1) {
		next.push(normalised);
	} else {
		next[indexByName] = normalised;
	}
	try {
		await config.update('mcp.servers', next, vscode.ConfigurationTarget.Global);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return { ok: false, message: `Failed to save: ${detail}` };
	}
	return { ok: true, message: 'Saved. MCP server changes apply immediately.' };
}

/**
 * Remove the named server from the configured array. Missing names succeed
 * silently — the UI may have been holding a stale list and the end-state is
 * still "no server with that name exists".
 */
export async function deleteMcpServer(
	name: string,
	config: vscode.WorkspaceConfiguration,
): Promise<McpServerSaveResult> {
	const trimmed = typeof name === 'string' ? name.trim() : '';
	if (!trimmed) {
		return { ok: false, message: 'Server name is required.' };
	}
	const existing = await listMcpServers(config);
	const next = existing.filter(s => s.name !== trimmed);
	try {
		await config.update('mcp.servers', next, vscode.ConfigurationTarget.Global);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return { ok: false, message: `Failed to delete: ${detail}` };
	}
	return { ok: true, message: `Removed "${trimmed}". The server has been disconnected.` };
}

/**
 * Run all field-level checks on a candidate entry. Exported indirectly via
 * `saveMcpServer` so future surfaces (palette command, MCP-marketplace
 * importer) get the same rules without re-deriving them.
 */
function validateServer(server: McpServerConfig): McpServerSaveResult {
	const name = typeof server.name === 'string' ? server.name.trim() : '';
	if (!name) {
		return { ok: false, message: 'Name is required.' };
	}
	if (!NAME_PATTERN.test(name)) {
		return { ok: false, message: 'Name may only contain letters, numbers, dashes and underscores.' };
	}
	const command = typeof server.command === 'string' ? server.command.trim() : '';
	if (!command) {
		return { ok: false, message: 'Command is required.' };
	}
	if (server.args !== undefined && !Array.isArray(server.args)) {
		return { ok: false, message: 'Arguments must be a list of strings.' };
	}
	if (server.args && server.args.some(a => typeof a !== 'string')) {
		return { ok: false, message: 'Arguments must be a list of strings.' };
	}
	if (server.env !== undefined) {
		if (!server.env || typeof server.env !== 'object' || Array.isArray(server.env)) {
			return { ok: false, message: 'Environment variables must be a string-to-string map.' };
		}
		for (const [k, v] of Object.entries(server.env)) {
			if (typeof k !== 'string' || !k.trim()) {
				return { ok: false, message: 'Environment variable names must be non-empty strings.' };
			}
			if (typeof v !== 'string') {
				return { ok: false, message: `Environment variable "${k}" must be a string.` };
			}
		}
	}
	if (server.cwd !== undefined && typeof server.cwd !== 'string') {
		return { ok: false, message: 'Working directory must be a string.' };
	}
	return { ok: true, message: 'Valid.' };
}

/**
 * Normalise a candidate before persisting so the array we write back to
 * settings doesn't carry empty optional fields (which would round-trip as
 * `null` or empty arrays and clutter the user's settings.json).
 */
function normaliseForStorage(server: McpServerConfig): McpServerConfig {
	const out: McpServerConfig = {
		name: server.name.trim(),
		command: server.command.trim(),
	};
	const writable = out as { -readonly [K in keyof McpServerConfig]: McpServerConfig[K] };
	if (server.args && server.args.length > 0) {
		writable.args = server.args.map(a => a).filter(a => a.length > 0);
		if ((writable.args as ReadonlyArray<string>).length === 0) {
			delete writable.args;
		}
	}
	if (server.env && Object.keys(server.env).length > 0) {
		const env: Record<string, string> = {};
		for (const [k, v] of Object.entries(server.env)) {
			const key = k.trim();
			if (!key) {
				continue;
			}
			env[key] = v;
		}
		if (Object.keys(env).length > 0) {
			writable.env = env;
		}
	}
	if (typeof server.cwd === 'string' && server.cwd.trim().length > 0) {
		writable.cwd = server.cwd.trim();
	}
	return out;
}

/**
 * Coerce an unknown `settings.json` entry into a valid `McpServerConfig`,
 * dropping malformed fields rather than failing the whole list. This mirrors
 * the defensive coercion in `McpClient` so the UI always shows everything
 * the runtime would attempt to spawn.
 */
function coerceServerConfig(entry: unknown): McpServerConfig | undefined {
	if (!entry || typeof entry !== 'object') {
		return undefined;
	}
	const candidate = entry as Record<string, unknown>;
	const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
	const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
	if (!name || !command) {
		return undefined;
	}
	const args = Array.isArray(candidate.args)
		? candidate.args.filter((a): a is string => typeof a === 'string')
		: undefined;
	const env = candidate.env && typeof candidate.env === 'object' && !Array.isArray(candidate.env)
		? coerceStringRecord(candidate.env as Record<string, unknown>)
		: undefined;
	const cwd = typeof candidate.cwd === 'string' && candidate.cwd.length > 0 ? candidate.cwd : undefined;
	const result: McpServerConfig = { name, command };
	const writable = result as { -readonly [K in keyof McpServerConfig]: McpServerConfig[K] };
	if (args && args.length > 0) {
		writable.args = args;
	}
	if (env && Object.keys(env).length > 0) {
		writable.env = env;
	}
	if (cwd) {
		writable.cwd = cwd;
	}
	return result;
}

function coerceStringRecord(input: Record<string, unknown>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(input)) {
		if (typeof v === 'string') {
			out[k] = v;
		}
	}
	return out;
}
