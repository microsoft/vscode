/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServerType, type IMcpServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import { McpServerStatus, type McpServerState } from '../../common/state/protocol/channels-session/state.js';
import type { ISdkMcpServer } from '../shared/mcpCustomizationController.js';
import type { McpServerStartupState } from './protocol/generated/v2/McpServerStartupState.js';
import type { McpServerStatus as CodexMcpServerStatus } from './protocol/generated/v2/McpServerStatus.js';
import type { Resource } from './protocol/generated/Resource.js';
import type { ResourceTemplate } from './protocol/generated/ResourceTemplate.js';
import type { Tool } from './protocol/generated/Tool.js';

/**
 * Cached inventory entry for a single MCP server reported by the codex
 * app-server. {@link state} drives the AHP customization surface while
 * {@link tools} / {@link resources} / {@link resourceTemplates} back the
 * read-only `tools/list`, `resources/list` and `resources/templates/list`
 * MCP methods so the host can answer them from cache without
 * round-tripping to codex.
 */
export interface ICodexMcpServerEntry {
	readonly state: McpServerState;
	readonly tools: readonly Tool[];
	readonly resources: readonly Resource[];
	readonly resourceTemplates: readonly ResourceTemplate[];
}

/**
 * Translates a codex `mcpServer/startupStatus/updated` lifecycle state
 * into the AHP {@link McpServerState} union.
 *
 * V1 scope: codex's auth states are not surfaced as
 * {@link McpServerStatus.AuthRequired}; a connected server is reported as
 * {@link McpServerStatus.Ready} regardless of `authStatus`.
 */
export function translateCodexMcpStartupState(status: McpServerStartupState, error: string | null | undefined): McpServerState {
	switch (status) {
		case 'ready':
			return { kind: McpServerStatus.Ready };
		case 'starting':
			return { kind: McpServerStatus.Starting };
		case 'failed':
			return {
				kind: McpServerStatus.Error,
				error: { errorType: 'mcp-server-failed', message: error ?? 'MCP server failed to start' },
			};
		case 'cancelled':
			return { kind: McpServerStatus.Stopped };
		default:
			return { kind: McpServerStatus.Stopped };
	}
}

/**
 * Flattens the codex `McpServerStatus.tools` map (`{ [name]: Tool }`)
 * into a name-sorted array, dropping any holes the map type allows.
 */
export function codexToolMapToArray(tools: CodexMcpServerStatus['tools']): Tool[] {
	const out: Tool[] = [];
	for (const key of Object.keys(tools)) {
		const tool = tools[key];
		if (tool) {
			out.push(tool);
		}
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/**
 * Builds an {@link ICodexMcpServerEntry} from a codex `mcpServerStatus/list`
 * entry. Servers returned by `mcpServerStatus/list` are connected and
 * serving, so they map to {@link McpServerStatus.Ready}.
 */
export function codexMcpStatusToEntry(status: CodexMcpServerStatus): ICodexMcpServerEntry {
	return {
		state: { kind: McpServerStatus.Ready },
		tools: codexToolMapToArray(status.tools),
		resources: status.resources,
		resourceTemplates: status.resourceTemplates,
	};
}

/**
 * Builds a name-keyed inventory snapshot from a codex `mcpServerStatus/list`
 * response page (or the concatenation of all paginated pages).
 */
export function codexMcpListToInventory(data: readonly CodexMcpServerStatus[]): Map<string, ICodexMcpServerEntry> {
	const inventory = new Map<string, ICodexMcpServerEntry>();
	for (const status of data) {
		inventory.set(status.name, codexMcpStatusToEntry(status));
	}
	return inventory;
}

/**
 * Projects an inventory snapshot to the SDK-neutral
 * {@link ISdkMcpServer} list the {@link McpCustomizationController}
 * consumes (name + state only — tool/resource payloads stay in the
 * inventory and back {@link buildCodexMcpReadResult}).
 */
export function inventoryToSdkServers(inventory: ReadonlyMap<string, ICodexMcpServerEntry>): ISdkMcpServer[] {
	const out: ISdkMcpServer[] = [];
	for (const [name, entry] of inventory) {
		out.push({ name, state: entry.state });
	}
	return out;
}

/**
 * Answers the read-only MCP methods (`tools/list`, `resources/list`,
 * `resources/templates/list`) from a cached inventory entry without a
 * round-trip to codex. Returns `{ handled: false }` for any other method
 * so the caller can forward it as an RPC (`tools/call`, `resources/read`)
 * or reject it.
 */
export function buildCodexMcpReadResult(method: string, entry: ICodexMcpServerEntry): { readonly handled: true; readonly result: unknown } | { readonly handled: false } {
	switch (method) {
		case 'tools/list':
			return { handled: true, result: { tools: entry.tools } };
		case 'resources/list':
			return { handled: true, result: { resources: entry.resources } };
		case 'resources/templates/list':
			return { handled: true, result: { resourceTemplates: entry.resourceTemplates } };
		default:
			return { handled: false };
	}
}

/**
 * Whether two inventory entries expose a different tool set (compared by
 * name). Drives the decision to fire `notifications/tools/list_changed`.
 */
export function codexMcpToolsChanged(previous: ICodexMcpServerEntry | undefined, next: ICodexMcpServerEntry | undefined): boolean {
	const a = (previous?.tools ?? []).map(t => t.name).sort();
	const b = (next?.tools ?? []).map(t => t.name).sort();
	if (a.length !== b.length) {
		return true;
	}
	return a.some((name, i) => name !== b[i]);
}

// #region MCP server config → codex per-thread `config.mcp_servers`
//
// Codex's `thread/start.config` dict is applied as per-thread config overrides
// that *merge* with (rather than replace) the user's global
// `~/.codex/config.toml` (verified against the real app-server). We inject the
// workbench's configured MCP servers (the root `mcpServers` config, keyed by
// server name) via `config.mcp_servers` so codex launches them for that
// thread — the same set Copilot passes to its SDK via
// `toSdkMcpServersFromConfigMap`. Feeding them per-thread (rather than as
// process-global `-c` spawn overrides) means each new session picks up the
// current config without restarting the shared app-server.
//
// The codex MCP config schema (`codex-rs/config/src/mcp_types.rs`,
// `RawMcpServerConfig`) infers the transport from the presence of `command`
// (stdio) vs `url` (streamable http) and has no `type` field, so we drop the
// workbench `type` discriminator and map `headers` → `http_headers`.

/**
 * The codex JSON shape for one MCP server inside `thread/start.config.mcp_servers`.
 */
export interface ICodexMcpServerConfigJson {
	command?: string;
	args?: readonly string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	http_headers?: Record<string, string>;
}

/**
 * Narrows an untrusted root-config value to a supported
 * {@link IMcpServerConfiguration}: a `stdio` server with a string `command`,
 * or an `http` server with a string `url`. Mirrors Copilot's
 * `isSupportedMcpServerConfiguration` so a malformed entry can't surface as a
 * `command`/`url: undefined` server.
 */
export function isSupportedMcpServerConfiguration(value: unknown): value is IMcpServerConfiguration {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as { type?: unknown; command?: unknown; url?: unknown };
	if (candidate.type === McpServerType.LOCAL) {
		return typeof candidate.command === 'string';
	}
	if (candidate.type === McpServerType.REMOTE) {
		return typeof candidate.url === 'string';
	}
	return false;
}

/**
 * Coerces a record's values to strings (codex's `env`/`http_headers` are
 * `Map<string, string>`), dropping `null`/`undefined`. The root `mcpServers`
 * config is user-authored and only loosely schema-validated, so a stray
 * non-string (e.g. a numeric header value) is coerced here rather than passed
 * through — an un-coerced value can make codex reject the whole per-thread
 * config, disabling every server for the session.
 */
function toCodexStringRecord(record: Record<string, unknown> | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	if (!record) {
		return result;
	}
	for (const [key, value] of Object.entries(record)) {
		if (value !== null && value !== undefined) {
			result[key] = String(value);
		}
	}
	return result;
}

/** Coerces command args to a string array (codex's `args` is `Vec<String>`), dropping `null`/`undefined`. */
function toCodexStringArray(values: readonly unknown[] | undefined): string[] {
	if (!Array.isArray(values)) {
		return [];
	}
	return values.filter(v => v !== null && v !== undefined).map(v => String(v));
}

/**
 * Converts one supported MCP server configuration into codex's JSON shape.
 * Optional fields (`args`, `env`, `cwd`, `headers`) come from user-authored
 * config that the root schema does not deeply validate, so each is sanitized
 * (coerced to the string shapes codex requires, dropping holes) rather than
 * trusted, so a single malformed entry can't make codex reject the config.
 */
export function toCodexMcpServerJson(config: IMcpServerConfiguration): ICodexMcpServerConfigJson {
	if (config.type === McpServerType.LOCAL) {
		const out: ICodexMcpServerConfigJson = { command: config.command };
		const args = toCodexStringArray(config.args);
		if (args.length > 0) {
			out.args = args;
		}
		const env = toCodexStringRecord(config.env);
		if (Object.keys(env).length > 0) {
			out.env = env;
		}
		if (typeof config.cwd === 'string') {
			out.cwd = config.cwd;
		}
		return out;
	}
	const out: ICodexMcpServerConfigJson = { url: config.url };
	const headers = toCodexStringRecord(config.headers);
	if (Object.keys(headers).length > 0) {
		out.http_headers = headers;
	}
	return out;
}

/**
 * Converts the workbench root `mcpServers` config (server name →
 * {@link IMcpServerConfiguration}) into the `mcp_servers` object codex accepts
 * in `thread/start.config`. Unsupported/malformed entries are skipped so a bad
 * entry can't surface as a `command`/`url: undefined` server. Returns an empty
 * object when nothing is configured.
 */
export function codexMcpServersFromConfig(servers: Record<string, unknown> | undefined): Record<string, ICodexMcpServerConfigJson> {
	const out: Record<string, ICodexMcpServerConfigJson> = {};
	for (const [name, config] of Object.entries(servers ?? {})) {
		if (isSupportedMcpServerConfiguration(config)) {
			out[name] = toCodexMcpServerJson(config);
		}
	}
	return out;
}

// #endregion

// #region MCP server authentication (reuse the workbench OAuth path)
//
// codex won't expose an OAuth-gated http MCP server's tools until it is
// authenticated (it reports a `failed` startup with a "not logged in" error).
// Rather than drive codex's own `mcpServer/oauth/login` browser flow, we reuse
// the *same* mechanism the Copilot agent uses: report the server as
// `McpServerStatus.AuthRequired` so the workbench acquires an OAuth bearer
// token (VS Code dynamic client registration), then inject that token into the
// server's per-thread `http_headers.Authorization`. Verified against the real
// codex binary: it forwards `http_headers` on every MCP HTTP request, so a
// workbench-acquired bearer authenticates the connection.

/**
 * Canonicalizes an MCP server URL for matching a workbench-acquired token
 * (keyed by the OAuth `resource`) against a configured server. Mirrors the
 * Copilot agent's normalization: strips the fragment and any trailing slashes
 * from the path. Returns `undefined` for a non-URL value (e.g. a stdio server).
 */
export function normalizeCodexMcpResourceUrl(value: string): string | undefined {
	if (!URL.canParse(value)) {
		return undefined;
	}
	const url = new URL(value);
	url.hash = '';
	url.pathname = url.pathname.replace(/\/+$/, '');
	return url.href;
}

/**
 * Whether a codex `mcpServer/startupStatus/updated` `failed` error indicates
 * the server needs authentication (rather than a generic crash), so it should
 * surface as {@link McpServerStatus.AuthRequired} (workbench "Authenticate"
 * affordance) instead of a fatal error. codex has no structured auth state on
 * this notification, so this matches its human-readable "not logged in" /
 * "run `codex mcp login`" phrasing and the standard OAuth challenge vocabulary.
 */
export function codexStartupErrorNeedsAuth(error: string | null | undefined): boolean {
	if (!error) {
		return false;
	}
	return /not logged in|mcp login|log in to|unauthori[sz]ed|requires? (?:authentication|authorization|login)|\b401\b/i.test(error);
}

/**
 * Returns a copy of `servers` with `Authorization: Bearer <token>` injected
 * into the `http_headers` of every http server whose (normalized) URL has a
 * token in `tokensByNormalizedUrl`. stdio servers and servers without a token
 * are passed through unchanged. Any existing authorization header is removed
 * first -- case-insensitively, since HTTP header names are case-insensitive and
 * a configured lowercase `authorization` would otherwise coexist with the
 * injected value and leave a stale credential in the payload.
 */
export function injectCodexMcpAuthTokens(
	servers: Record<string, ICodexMcpServerConfigJson>,
	tokensByNormalizedUrl: ReadonlyMap<string, string>,
): Record<string, ICodexMcpServerConfigJson> {
	if (tokensByNormalizedUrl.size === 0) {
		return servers;
	}
	const out: Record<string, ICodexMcpServerConfigJson> = {};
	for (const [name, server] of Object.entries(servers)) {
		const normalized = server.url !== undefined ? normalizeCodexMcpResourceUrl(server.url) : undefined;
		const token = normalized !== undefined ? tokensByNormalizedUrl.get(normalized) : undefined;
		out[name] = token !== undefined
			? { ...server, http_headers: { ...withoutAuthorizationHeaders(server.http_headers), Authorization: `Bearer ${token}` } }
			: server;
	}
	return out;
}

/** Drops any header whose name is `authorization` (case-insensitive). */
function withoutAuthorizationHeaders(headers: Record<string, string> | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (headers) {
		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() !== 'authorization') {
				out[key] = value;
			}
		}
	}
	return out;
}

// #endregion

