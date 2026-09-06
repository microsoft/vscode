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
	CreateSession = 'create_session',
	CreateChat = 'create_chat',
	RenameChat = 'rename_chat',
	SendMessage = 'send_message',
	GetSessionContext = 'get_session_context',
	DeleteSession = 'delete_session',
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
