/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Hand-written subset of the Agent Client Protocol (ACP) v1 wire types.
//
// Mirrors the published JSON schema (`schema/v1/schema.json`, release
// `schema-v1.25.0`) of https://github.com/agentclientprotocol/agent-client-protocol.
// Only the shapes the agent host consumes are modelled; every object may
// carry additional fields (`_meta`, future additions) which callers must
// tolerate. Optional fields that the schema types as `T | null` are typed
// as `T | null | undefined` here because agents emit either form.

/** The only ACP major version this client speaks. */
export const ACP_PROTOCOL_VERSION = 1;

export type AcpSessionId = string;

export interface IAcpImplementation {
	readonly name: string;
	readonly title?: string | null;
	readonly version: string;
}

// #region Initialization

export interface IAcpClientCapabilities {
	readonly fs?: { readonly readTextFile?: boolean; readonly writeTextFile?: boolean };
	readonly terminal?: boolean;
}

export interface IAcpSessionCapabilities {
	/** Presence (`{}`) means `session/list` is supported. */
	readonly list?: object | null;
	/** Presence (`{}`) means `session/resume` is supported. */
	readonly resume?: object | null;
	/** Presence (`{}`) means `session/close` is supported. */
	readonly close?: object | null;
}

export interface IAcpAgentCapabilities {
	readonly loadSession?: boolean;
	readonly promptCapabilities?: {
		readonly image?: boolean;
		readonly audio?: boolean;
		readonly embeddedContext?: boolean;
	};
	readonly sessionCapabilities?: IAcpSessionCapabilities;
}

export interface IAcpAuthMethod {
	readonly id: string;
	readonly name: string;
	readonly description?: string | null;
	/** `terminal` methods describe a CLI login flow; absent for agent-handled auth. */
	readonly type?: string;
}

export interface IAcpInitializeParams {
	readonly protocolVersion: number;
	readonly clientCapabilities: IAcpClientCapabilities;
	readonly clientInfo?: IAcpImplementation;
}

export interface IAcpInitializeResult {
	readonly protocolVersion: number;
	readonly agentCapabilities?: IAcpAgentCapabilities;
	readonly authMethods?: readonly IAcpAuthMethod[];
	readonly agentInfo?: IAcpImplementation | null;
}

// #endregion

// #region Sessions

/** MCP servers are not forwarded in v1 of the provider; always sent as `[]`. */
export type AcpMcpServer = never;

export interface IAcpSessionMode {
	readonly id: string;
	readonly name: string;
	readonly description?: string | null;
}

export interface IAcpSessionModeState {
	readonly currentModeId: string;
	readonly availableModes: readonly IAcpSessionMode[];
}

export interface IAcpConfigSelectOption {
	readonly value: string;
	readonly name: string;
	readonly description?: string | null;
}

export interface IAcpConfigSelectGroup {
	readonly group: string;
	readonly name: string;
	readonly options: readonly IAcpConfigSelectOption[];
}

export interface IAcpSessionConfigOption {
	readonly id: string;
	readonly name: string;
	readonly description?: string | null;
	/** Well-known: `mode`, `model`, `model_config`, `thought_level`; agents may add others. */
	readonly category?: string | null;
	readonly type: 'select' | 'boolean' | string;
	/** For `select` options. */
	readonly currentValue?: string | boolean;
	/** For `select` options: either a flat list or a list of groups. */
	readonly options?: readonly (IAcpConfigSelectOption | IAcpConfigSelectGroup)[];
}

export interface IAcpSessionSetup {
	readonly modes?: IAcpSessionModeState | null;
	readonly configOptions?: readonly IAcpSessionConfigOption[] | null;
}

export interface IAcpNewSessionParams {
	readonly cwd: string;
	readonly additionalDirectories?: readonly string[];
	readonly mcpServers: readonly AcpMcpServer[];
}

export interface IAcpNewSessionResult extends IAcpSessionSetup {
	readonly sessionId: AcpSessionId;
}

export interface IAcpLoadSessionParams {
	readonly sessionId: AcpSessionId;
	readonly cwd: string;
	readonly additionalDirectories?: readonly string[];
	readonly mcpServers: readonly AcpMcpServer[];
}

export type IAcpResumeSessionParams = IAcpLoadSessionParams;

export interface IAcpListSessionsParams {
	readonly cwd?: string | null;
	readonly cursor?: string | null;
}

export interface IAcpSessionInfo {
	readonly sessionId: AcpSessionId;
	readonly cwd: string;
	readonly additionalDirectories?: readonly string[];
	readonly title?: string | null;
	/** ISO 8601 timestamp. */
	readonly updatedAt?: string | null;
}

export interface IAcpListSessionsResult {
	readonly sessions: readonly IAcpSessionInfo[];
	readonly nextCursor?: string | null;
}

export interface IAcpSessionIdParams {
	readonly sessionId: AcpSessionId;
}

export interface IAcpSetModeParams {
	readonly sessionId: AcpSessionId;
	readonly modeId: string;
}

export interface IAcpSetConfigOptionParams {
	readonly sessionId: AcpSessionId;
	readonly configId: string;
	readonly value: string;
}

export interface IAcpSetConfigOptionResult {
	readonly configOptions: readonly IAcpSessionConfigOption[];
}

// #endregion

// #region Prompting

export interface IAcpTextContent {
	readonly type: 'text';
	readonly text: string;
}

export interface IAcpImageContent {
	readonly type: 'image';
	readonly data: string;
	readonly mimeType: string;
	readonly uri?: string | null;
}

export interface IAcpResourceLink {
	readonly type: 'resource_link';
	readonly uri: string;
	readonly name: string;
	readonly title?: string | null;
	readonly mimeType?: string | null;
}

export interface IAcpEmbeddedResource {
	readonly type: 'resource';
	readonly resource: { readonly uri: string; readonly text?: string; readonly blob?: string; readonly mimeType?: string | null };
}

export interface IAcpOtherContent {
	readonly type: 'audio' | string;
}

export type AcpContentBlock = IAcpTextContent | IAcpImageContent | IAcpResourceLink | IAcpEmbeddedResource | IAcpOtherContent;

export interface IAcpPromptParams {
	readonly sessionId: AcpSessionId;
	readonly prompt: readonly AcpContentBlock[];
}

export type AcpStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export interface IAcpPromptResult {
	readonly stopReason: AcpStopReason;
}

// #endregion

// #region Session updates (agent → client notifications)

export type AcpToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other';
export type AcpToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface IAcpToolCallLocation {
	readonly path: string;
	readonly line?: number | null;
}

export type AcpToolCallContent =
	| { readonly type: 'content'; readonly content: AcpContentBlock }
	| { readonly type: 'diff'; readonly path: string; readonly oldText?: string | null; readonly newText: string }
	| { readonly type: 'terminal'; readonly terminalId: string };

export interface IAcpToolCallFields {
	readonly toolCallId: string;
	readonly title?: string | null;
	readonly kind?: AcpToolKind | null;
	readonly status?: AcpToolCallStatus | null;
	readonly content?: readonly AcpToolCallContent[] | null;
	readonly locations?: readonly IAcpToolCallLocation[] | null;
	readonly rawInput?: unknown;
	readonly rawOutput?: unknown;
}

export interface IAcpPlanEntry {
	readonly content: string;
	readonly priority: 'high' | 'medium' | 'low';
	readonly status: 'pending' | 'in_progress' | 'completed';
}

export interface IAcpAvailableCommand {
	readonly name: string;
	readonly description: string;
}

export type AcpSessionUpdate =
	| { readonly sessionUpdate: 'user_message_chunk' | 'agent_message_chunk' | 'agent_thought_chunk'; readonly content: AcpContentBlock; readonly messageId?: string | null }
	| ({ readonly sessionUpdate: 'tool_call'; readonly title: string } & IAcpToolCallFields)
	| ({ readonly sessionUpdate: 'tool_call_update' } & IAcpToolCallFields)
	| { readonly sessionUpdate: 'plan'; readonly entries: readonly IAcpPlanEntry[] }
	| { readonly sessionUpdate: 'available_commands_update'; readonly availableCommands: readonly IAcpAvailableCommand[] }
	| { readonly sessionUpdate: 'current_mode_update'; readonly currentModeId: string }
	| { readonly sessionUpdate: 'config_option_update'; readonly configOptions: readonly IAcpSessionConfigOption[] }
	| { readonly sessionUpdate: 'session_info_update'; readonly title?: string | null; readonly updatedAt?: string | null }
	| { readonly sessionUpdate: 'usage_update'; readonly used: number; readonly size: number };

export interface IAcpSessionNotification {
	readonly sessionId: AcpSessionId;
	readonly update: AcpSessionUpdate | { readonly sessionUpdate: string };
}

// #endregion

// #region Client-side requests (agent → client)

export type AcpPermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

export interface IAcpPermissionOption {
	readonly optionId: string;
	readonly name: string;
	readonly kind: AcpPermissionOptionKind;
}

export interface IAcpRequestPermissionParams {
	readonly sessionId: AcpSessionId;
	readonly toolCall: IAcpToolCallFields;
	readonly options: readonly IAcpPermissionOption[];
}

export interface IAcpRequestPermissionResult {
	readonly outcome: { readonly outcome: 'cancelled' } | { readonly outcome: 'selected'; readonly optionId: string };
}

export interface IAcpReadTextFileParams {
	readonly sessionId: AcpSessionId;
	readonly path: string;
	/** 1-based line to start reading from. */
	readonly line?: number | null;
	/** Maximum number of lines to read. */
	readonly limit?: number | null;
}

export interface IAcpReadTextFileResult {
	readonly content: string;
}

export interface IAcpWriteTextFileParams {
	readonly sessionId: AcpSessionId;
	readonly path: string;
	readonly content: string;
}

// #endregion

// #region Method maps

/** Requests the client sends to the agent: method → [params, result]. */
export interface IAcpAgentRequests {
	'initialize': [IAcpInitializeParams, IAcpInitializeResult];
	'session/new': [IAcpNewSessionParams, IAcpNewSessionResult];
	'session/load': [IAcpLoadSessionParams, IAcpSessionSetup | null];
	'session/resume': [IAcpResumeSessionParams, IAcpSessionSetup | null];
	'session/list': [IAcpListSessionsParams, IAcpListSessionsResult];
	'session/prompt': [IAcpPromptParams, IAcpPromptResult];
	'session/set_mode': [IAcpSetModeParams, unknown];
	'session/set_config_option': [IAcpSetConfigOptionParams, IAcpSetConfigOptionResult];
	'session/close': [IAcpSessionIdParams, unknown];
}

/** Notifications the client sends to the agent. */
export interface IAcpAgentNotifications {
	'session/cancel': IAcpSessionIdParams;
}

/** Requests the agent sends to the client: method → [params, result]. */
export interface IAcpClientRequests {
	'session/request_permission': [IAcpRequestPermissionParams, IAcpRequestPermissionResult];
	'fs/read_text_file': [IAcpReadTextFileParams, IAcpReadTextFileResult];
	'fs/write_text_file': [IAcpWriteTextFileParams, null];
}

/** Notifications the agent sends to the client. */
export interface IAcpClientNotifications {
	'session/update': IAcpSessionNotification;
}

// #endregion

/** ACP error code for "authentication required" (JSON-RPC server error range). */
export const ACP_AUTH_REQUIRED_ERROR_CODE = -32000;
