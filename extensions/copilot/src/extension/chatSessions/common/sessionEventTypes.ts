/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Copilot agent session events that VS Code renders as chat response parts.
 *
 * The Copilot CLI runtime emits these events locally, and the cloud agent's Task API
 * returns the same payloads. These types declare only the fields the renderers read,
 * so the cloud agent does not depend on the Copilot CLI SDK. Each type must stay
 * assignable from the corresponding SDK event.
 */

export interface ToolExecutionStartEvent {
	readonly type: 'tool.execution_start';
	readonly data: {
		readonly toolCallId: string;
		readonly toolName: string;
		readonly arguments?: unknown;
		readonly mcpServerName?: string;
		readonly mcpToolName?: string;
		readonly parentToolCallId?: string;
	};
}

export interface ToolExecutionCompleteEvent {
	readonly type: 'tool.execution_complete';
	readonly data: ToolExecutionCompleteData;
}

export interface ToolExecutionCompleteData {
	readonly toolCallId: string;
	readonly success: boolean;
	readonly error?: {
		readonly code?: string;
		readonly message: string;
	};
	readonly result?: {
		readonly content: string;
		/** Structured content blocks (text, images, audio, resources) returned by the tool. */
		readonly contents?: readonly { readonly type: string }[];
		readonly detailedContent?: string;
	};
	readonly parentToolCallId?: string;
}

interface SessionErrorEvent {
	readonly type: 'session.error';
	readonly data: {
		readonly errorType: string;
		readonly message: string;
	};
}

interface AssistantMessageDeltaEvent {
	readonly type: 'assistant.message_delta';
	readonly data: {
		readonly messageId: string;
		readonly deltaContent: string;
		readonly parentToolCallId?: string;
	};
}

interface AssistantMessageEvent {
	readonly type: 'assistant.message';
	readonly data: {
		readonly messageId: string;
		readonly content: string;
		readonly parentToolCallId?: string;
	};
}

interface SubagentStartedEvent {
	readonly type: 'subagent.started';
	readonly data: {
		readonly toolCallId: string;
		readonly agentDisplayName: string;
		readonly agentDescription?: string;
	};
}

interface SubagentFinishedEvent {
	readonly type: 'subagent.completed' | 'subagent.failed';
}

interface AbortEvent {
	readonly type: 'abort';
	readonly data: {
		readonly reason: string;
	};
}

/** A session event that renders into chat response parts. */
export type RenderedSessionEvent =
	| SessionErrorEvent
	| AssistantMessageDeltaEvent
	| AssistantMessageEvent
	| ToolExecutionStartEvent
	| ToolExecutionCompleteEvent
	| SubagentStartedEvent
	| SubagentFinishedEvent
	| AbortEvent;

/** Any session event; only {@link RenderedSessionEvent}s produce response parts. */
export interface SessionEventLike {
	readonly type: string;
}
