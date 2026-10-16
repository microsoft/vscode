/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Single source of truth for the names of the session server tools (the tools
 * that let an agent list, create, message, inspect, and delete sessions/chats).
 *
 * These names are shared across layers: `common/` code surfaces them (e.g. the
 * open-session link and chat-attachment pointer) but cannot import from `node/`,
 * while the actual tool implementations live under `node/`. Keeping the names
 * here — the lowest common layer — lets both sides reference the same literals
 * instead of duplicating string constants that must be manually kept in sync.
 *
 * This is a `const enum`: it is only ever referenced member-by-member and is
 * never iterated at runtime, so its members inline to plain string literals.
 */
export const enum SessionServerToolName {
	ListSessions = 'list_sessions',
	GetCurrentSession = 'get_current_session',
	SetWorkspace = 'set_workspace',
	IsolateSession = 'isolate_session',
	CreateSession = 'create_session',
	CreateChat = 'create_chat',
	RenameChat = 'rename_chat',
	SendMessage = 'send_message',
	GetSessionContext = 'get_session_context',
	DeleteSession = 'delete_session',
}

/**
 * Whether {@link toolName} (a tool name as seen on a tool call) refers to the
 * server tool {@link bareName}. Accepts both the bare name, as the agent sees it
 * under Copilot, and a transport prefix such as Claude's `mcp__<server>__<name>`
 * (matched as a `__`-delimited suffix).
 */
export function matchesServerToolName(toolName: string, bareName: string): boolean {
	return toolName === bareName || toolName.endsWith(`__${bareName}`);
}

/**
 * Whether {@link toolName} (a tool name as seen on a tool call) refers to
 * {@link SessionServerToolName.RenameChat}.
 */
export function isRenameChatTool(toolName: string): boolean {
	return matchesServerToolName(toolName, SessionServerToolName.RenameChat);
}

/** Names of the artifact server tools, shared between `common/` and `node/`. */
export const enum ArtifactServerToolName {
	AddArtifactOrReference = 'add_artifact_or_reference',
	RemoveArtifactOrReference = 'remove_artifact_or_reference',
	ListArtifactsAndReferences = 'list_artifacts_and_references',
}

/**
 * The names these tools were advertised under before they also recorded
 * references, mapped to their replacement. Restored history and prompts written
 * against the old names keep routing and keep their display.
 */
export const LEGACY_ARTIFACT_SERVER_TOOL_NAMES: ReadonlyMap<string, string> = new Map([
	['add_artifact', ArtifactServerToolName.AddArtifactOrReference as string],
	['remove_artifact', ArtifactServerToolName.RemoveArtifactOrReference as string],
	['list_artifacts', ArtifactServerToolName.ListArtifactsAndReferences as string],
]);

/**
 * Whether {@link toolName} (a tool name as seen on a tool call) refers to
 * {@link ArtifactServerToolName.AddArtifactOrReference}: its bare name, the
 * Claude `mcp__<server>__<name>` prefixed form, or its legacy name.
 */
export function isAddArtifactOrReferenceTool(toolName: string): boolean {
	const separator = toolName.lastIndexOf('__');
	const bareName = separator === -1 ? toolName : toolName.slice(separator + 2);
	return (LEGACY_ARTIFACT_SERVER_TOOL_NAMES.get(bareName) ?? bareName) === ArtifactServerToolName.AddArtifactOrReference;
}

/** Names of the semantic diff server tools, shared between `common/`, `node/`, and clients. */
export const enum SemanticDiffServerToolName {
	ClassifyDiffHunks = 'classify_diff_hunks',
}
