/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment, SessionEvent, SessionEventPayload, ToolExecutionCompleteContent } from '@github/copilot-sdk';

// =============================================================================
// Minimal session-event shapes for tests
// =============================================================================
// Production (`node/copilot/mapSessionEvents.ts`) consumes the real SDK
// `SessionEvent` union. The SDK members require envelope fields the mapper
// never reads (`parentId`, `timestamp`, `ephemeral`, …) plus stricter `data`
// shapes, which makes hand-written event literals noisy. These ergonomic
// subsets let tests construct only the fields the mapper actually reads; feed
// them to the production mapper via {@link toSessionEvents}.

export interface ISessionEventToolStart {
	type: 'tool.execution_start';
	/** Envelope-level sub-agent instance id; resolved to the parent tool call id via `subagent.started`. */
	agentId?: string;
	data: {
		toolCallId: string;
		toolName: string;
		arguments?: unknown;
		mcpServerName?: string;
		mcpToolName?: string;
		toolDescription?: unknown;
		/** @deprecated Use the envelope-level {@link ISessionEventToolStart.agentId} instead. */
		parentToolCallId?: string;
	};
}

export interface ISessionEventToolComplete {
	type: 'tool.execution_complete';
	/** Envelope-level sub-agent instance id. See {@link ISessionEventToolStart.agentId}. */
	agentId?: string;
	data: {
		toolCallId: string;
		success: boolean;
		result?: {
			/** `content` is result text; `contents` are typed SDK result blocks such as `shell_exit`. */
			content?: string;
			contents?: ToolExecutionCompleteContent[];
		};
		error?: { message: string; code?: string };
		isUserRequested?: boolean;
		toolTelemetry?: unknown;
		mcpServerName?: string;
		mcpToolName?: string;
		toolDescription?: unknown;
		/** @deprecated Use the envelope-level {@link ISessionEventToolComplete.agentId} instead. */
		parentToolCallId?: string;
	};
}

export interface ISessionEventMessage {
	type: 'assistant.message' | 'user.message';
	/** SDK envelope-level event id, used as the protocol turn id. */
	id?: string;
	/** Envelope-level sub-agent instance id. See {@link ISessionEventToolStart.agentId}. */
	agentId?: string;
	data: {
		messageId?: string;
		interactionId?: string;
		content?: string;
		toolRequests?: readonly { toolCallId: string; name: string; arguments?: unknown; type?: 'function' | 'custom'; mcpServerName?: string; mcpToolName?: string; toolDescription?: unknown }[];
		reasoningOpaque?: string;
		reasoningText?: string;
		encryptedContent?: string;
		/** @deprecated Use the envelope-level {@link ISessionEventMessage.agentId} instead. */
		parentToolCallId?: string;
		/** Origin of the message; a non-`'user'` value marks an SDK-injected message that should be hidden. */
		source?: string;
		attachments?: readonly Attachment[];
	};
}

/** Minimal event shape for `skill.invoked`, used to synthesize a tool-style render. */
export interface ISessionEventSkillInvoked {
	type: 'skill.invoked';
	id?: string;
	/** Envelope-level sub-agent instance id. */
	agentId?: string;
	data: {
		name: string;
		path?: string;
		description?: string;
	};
}

export interface ISessionEventSubagentStarted {
	type: 'subagent.started';
	/** Envelope-level sub-agent instance id resolved back to {@link ISessionEventSubagentStarted.data.toolCallId}. */
	agentId?: string;
	data: {
		toolCallId: string;
		agentName: string;
		agentDisplayName: string;
		agentDescription: string;
	};
}

export interface ISessionEventAbort {
	type: 'abort';
	/** Envelope-level sub-agent instance id. */
	agentId?: string;
	data: {
		reason: string;
	};
}

export interface ISessionEventAssistantTurn {
	type: 'assistant.turn_start' | 'assistant.turn_end';
	agentId?: string;
	data: {
		turnId: string;
		interactionId?: string;
	};
}

export interface ISessionEventSystemNotification {
	type: 'system.notification';
	id?: string;
	data: SessionEventPayload<'system.notification'>['data'];
}

/** Minimal event shape for session history mapping. */
export type ISessionEvent =
	| ISessionEventToolStart
	| ISessionEventToolComplete
	| ISessionEventMessage
	| ISessionEventSubagentStarted
	| ISessionEventSkillInvoked
	| ISessionEventAbort
	| ISessionEventAssistantTurn
	| ISessionEventSystemNotification
	| { type: string; data?: unknown };

/**
 * Widens ergonomic {@link ISessionEvent} test fixtures to the real SDK
 * {@link SessionEvent} union so they can be fed to the production
 * `mapSessionEvents`. The test shapes deliberately omit envelope fields the
 * mapper ignores (`parentId`, `timestamp`, …), so this is a safe deliberate
 * widening rather than a representation of real SDK events.
 */
export function toSessionEvents(events: readonly ISessionEvent[]): SessionEvent[] {
	return events as unknown as SessionEvent[];
}
