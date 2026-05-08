/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wire-level types for the public Agent Client Protocol (ACP) that Zed and
 * other ACP-speaking editors use to talk to agent backends. Methods are
 * slash-namespaced (`session/new`, `session/prompt`, `session/cancel`,
 * `session/update`); the protocol version is a number; transport is
 * newline-delimited JSON-RPC 2.0 over stdio.
 *
 * Source: https://agentclientprotocol.com (public spec, late 2025).
 *
 * We only model the fields we read or emit. Unknown fields on incoming
 * messages flow through as `unknown` and are ignored — agents are free to
 * accept superset payloads from richer clients.
 */

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelopes
// ---------------------------------------------------------------------------

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
	readonly jsonrpc: '2.0';
	readonly id: JsonRpcId;
	readonly method: string;
	readonly params?: unknown;
}

export interface JsonRpcNotification {
	readonly jsonrpc: '2.0';
	readonly method: string;
	readonly params?: unknown;
}

export interface JsonRpcSuccess {
	readonly jsonrpc: '2.0';
	readonly id: JsonRpcId;
	readonly result: unknown;
}

export interface JsonRpcFailure {
	readonly jsonrpc: '2.0';
	readonly id: JsonRpcId | null;
	readonly error: JsonRpcError;
}

export interface JsonRpcError {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}

/**
 * Standard JSON-RPC 2.0 error codes plus a small ACP-specific bucket. The
 * spec doesn't reserve specific codes for protocol-layer failures, so we
 * follow the convention adopted by the Zed reference implementation:
 * server-defined errors live in the `-32000..-32099` range.
 */
export const JsonRpcErrorCode = {
	ParseError: -32700,
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
	/** Auth required / no provider key configured. */
	AuthRequired: -32000,
	/** Operation cancelled by the client. */
	Cancelled: -32001,
	/** The referenced session is unknown or has been replaced. */
	SessionNotFound: -32002,
} as const;

// ---------------------------------------------------------------------------
// ACP method payloads
// ---------------------------------------------------------------------------

/**
 * `initialize` request — the client tells us which protocol version it
 * speaks and what features it supports. We only inspect `protocolVersion`
 * for now; the rest is opaque.
 */
export interface InitializeRequestParams {
	readonly protocolVersion?: number;
	readonly clientCapabilities?: Record<string, unknown>;
}

export interface InitializeResult {
	readonly protocolVersion: number;
	readonly agentCapabilities: AgentCapabilities;
	readonly authMethods: ReadonlyArray<AuthMethod>;
}

export interface AgentCapabilities {
	readonly promptCapabilities: {
		readonly image: boolean;
		readonly audio: boolean;
		readonly embeddedContext: boolean;
	};
	readonly loadSession: boolean;
}

export interface AuthMethod {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
}

export interface AuthenticateRequestParams {
	readonly methodId?: string;
}

export interface NewSessionRequestParams {
	readonly cwd?: string;
	readonly mcpServers?: ReadonlyArray<unknown>;
}

export interface NewSessionResult {
	readonly sessionId: string;
}

/**
 * `session/prompt` request. The client sends an array of content blocks
 * (text, image, etc.); we extract any `text` blocks and concatenate them
 * into the user message handed to the orchestrator.
 */
export interface PromptRequestParams {
	readonly sessionId: string;
	readonly prompt: ReadonlyArray<ContentBlock>;
}

export interface PromptResult {
	readonly stopReason: PromptStopReason;
}

export type PromptStopReason = 'end_turn' | 'cancelled' | 'refusal' | 'max_tokens';

export interface CancelNotificationParams {
	readonly sessionId: string;
}

// ---------------------------------------------------------------------------
// Content blocks (subset — text is all we currently read or emit)
// ---------------------------------------------------------------------------

export type ContentBlock =
	| TextContentBlock
	| { readonly type: string;[key: string]: unknown };

export interface TextContentBlock {
	readonly type: 'text';
	readonly text: string;
}

// ---------------------------------------------------------------------------
// session/update notifications (server -> client)
// ---------------------------------------------------------------------------

export interface SessionNotificationParams {
	readonly sessionId: string;
	readonly update: SessionUpdate;
}

export type SessionUpdate =
	| AgentMessageChunkUpdate
	| ToolCallUpdate
	| ToolCallProgressUpdate
	| PlanUpdate
	| ErrorUpdate;

export interface AgentMessageChunkUpdate {
	readonly sessionUpdate: 'agent_message_chunk';
	readonly content: TextContentBlock;
}

export interface ToolCallUpdate {
	readonly sessionUpdate: 'tool_call';
	readonly toolCallId: string;
	readonly title: string;
	readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
	readonly kind?: string;
	readonly rawInput?: unknown;
}

export interface ToolCallProgressUpdate {
	readonly sessionUpdate: 'tool_call_update';
	readonly toolCallId: string;
	readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
	readonly rawOutput?: unknown;
}

/**
 * `plan` update — the orchestrator's `plan-proposed` event maps onto this
 * so plan-mode editors can render the dispatch tree natively.
 */
export interface PlanUpdate {
	readonly sessionUpdate: 'plan';
	readonly entries: ReadonlyArray<PlanEntry>;
}

export interface PlanEntry {
	readonly content: string;
	readonly priority: 'high' | 'medium' | 'low';
	readonly status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Non-spec convenience update: surfaces orchestrator-level errors to the
 * client without aborting the whole prompt. The public spec doesn't define
 * this kind, so editors that don't know it will ignore the notification —
 * which is the safe behaviour.
 */
export interface ErrorUpdate {
	readonly sessionUpdate: 'error';
	readonly message: string;
}
