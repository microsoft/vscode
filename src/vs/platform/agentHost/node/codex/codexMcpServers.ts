/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
