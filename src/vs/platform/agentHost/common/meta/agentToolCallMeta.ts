/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../base/common/types.js';

/** Anything carrying a tool call's `_meta` bag (persisted state or wire actions). */
interface IHasToolCallMeta {
	readonly _meta?: Record<string, unknown>;
}

/**
 * Well-known typed view over a tool call's open `_meta` bag. Producers and
 * consumers agree on these keys here so the two sides can't drift; always read
 * the bag through {@link readToolCallMeta}, which validates each field and drops
 * wrong-typed values.
 */
export interface IToolCallMeta {
	/**
	 * VS Code rendering hint. `terminal` routes the call to the command/output
	 * renderer, `subagent` to the subagent UI, `search` to the search renderer;
	 * everything else falls through to the generic invocation renderer. Set by
	 * the agent adapter, never matched on raw tool name by the renderer.
	 */
	readonly toolKind?: ToolKind;
	/** Shell language for a `terminal` tool call (drives syntax highlighting). */
	readonly language?: string;
	/** Short task description for a `subagent` tool call (e.g. "Find related files"). */
	readonly subagentDescription?: string;
	/** Agent name for a `subagent` tool call (e.g. "explore"). */
	readonly subagentAgentName?: string;
	/** Chat URI of the subagent this tool call spawns, stamped by the host (see {@link buildSubagentChatUri}); the resource may not be registered yet. */
	readonly subagentChatUri?: string;
	/** Raw, pre-stringified tool arguments captured for display/debugging. */
	readonly toolArguments?: unknown;
	/** Originating MCP server name, when the call came from an MCP server. */
	readonly mcpServerName?: string;
	/** Originating MCP tool name, when the call came from an MCP server. */
	readonly mcpToolName?: string;
	/** MCP App render data, when the call exposes an interactive App surface. */
	readonly ui?: IToolCallUiMeta;
	/**
	 * Set by the host's side-effect layer when the call was auto-approved
	 * because of an `autoApprove` session-config setting (rather than an
	 * explicit user action), so the client can render it as setting-driven.
	 */
	readonly autoApproveBySetting?: boolean;
	/** Transient runtime corpus for the local client tool-search invocation. */
	readonly toolSearchCandidates?: readonly IToolSearchCandidate[];
}

/** Minimal metadata needed to embed and rank a deferred tool. */
export interface IToolSearchCandidate {
	readonly name: string;
	readonly description: string;
}

/**
 * The set of VS Code-recognized tool-call rendering kinds. Add a new value here
 * (and teach the renderer to handle it) rather than matching on tool name.
 */
export type ToolKind = 'terminal' | 'subagent' | 'search';

/**
 * MCP App render data carried under {@link IToolCallMeta.ui}. Clients gate
 * mounting the App webview on both a `resourceUri` and a `channel` being
 * present.
 */
export interface IToolCallUiMeta {
	/** The MCP App's UI resource URI (an `ui://` resource the App renders). */
	readonly resourceUri: string;
	/** AHP `mcp://` channel the App's sub-RPCs route back through, when ready. */
	readonly channel?: string;
}

function isToolKind(value: unknown): value is ToolKind {
	return value === 'terminal' || value === 'subagent' || value === 'search';
}

function readToolCallUiMeta(value: unknown): IToolCallUiMeta | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['resourceUri'] !== 'string' || raw['resourceUri'].length === 0) {
		return undefined;
	}
	const result: Mutable<IToolCallUiMeta> = { resourceUri: raw['resourceUri'] };
	if (typeof raw['channel'] === 'string' && raw['channel'].length > 0) {
		result.channel = raw['channel'];
	}
	return result;
}

function readToolSearchCandidates(value: unknown): readonly IToolSearchCandidate[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const result: IToolSearchCandidate[] = [];
	for (const candidate of value) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			return undefined;
		}
		const raw = candidate as Record<string, unknown>;
		if (typeof raw['name'] !== 'string' || typeof raw['description'] !== 'string') {
			return undefined;
		}
		result.push({
			name: raw['name'],
			description: raw['description'],
		});
	}
	return result;
}

/**
 * Reads the well-known {@link IToolCallMeta} keys from a tool call's `_meta`
 * bag, dropping unknown keys and wrong-typed values.
 */
export function readToolCallMeta(source: IHasToolCallMeta): IToolCallMeta {
	const meta = source._meta;
	if (!meta) {
		return {};
	}
	const result: Mutable<IToolCallMeta> = {};
	if (isToolKind(meta['toolKind'])) { result.toolKind = meta['toolKind']; }
	if (typeof meta['language'] === 'string') { result.language = meta['language']; }
	if (typeof meta['subagentDescription'] === 'string') { result.subagentDescription = meta['subagentDescription']; }
	if (typeof meta['subagentAgentName'] === 'string') { result.subagentAgentName = meta['subagentAgentName']; }
	if (typeof meta['subagentChatUri'] === 'string') { result.subagentChatUri = meta['subagentChatUri']; }
	if (meta['toolArguments'] !== undefined) { result.toolArguments = meta['toolArguments']; }
	if (typeof meta['mcpServerName'] === 'string') { result.mcpServerName = meta['mcpServerName']; }
	if (typeof meta['mcpToolName'] === 'string') { result.mcpToolName = meta['mcpToolName']; }
	if (typeof meta['autoApproveBySetting'] === 'boolean') { result.autoApproveBySetting = meta['autoApproveBySetting']; }
	const toolSearchCandidates = readToolSearchCandidates(meta['toolSearchCandidates']);
	if (toolSearchCandidates) { result.toolSearchCandidates = toolSearchCandidates; }
	const ui = readToolCallUiMeta(meta['ui']);
	if (ui) { result.ui = ui; }
	return result;
}

/**
 * Serializes a typed {@link IToolCallMeta} into the `_meta` record, dropping
 * `undefined` entries and returning `undefined` when empty. Build a tool call's
 * `_meta` through this so producers stay in lock-step with
 * {@link readToolCallMeta}.
 */
export function toToolCallMeta(meta: IToolCallMeta): Record<string, unknown> | undefined {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(meta)) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}
