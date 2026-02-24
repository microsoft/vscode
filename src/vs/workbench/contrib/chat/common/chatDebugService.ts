/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

/**
 * The severity level of a chat debug log event.
 */
export enum ChatDebugLogLevel {
	Trace = 0,
	Info = 1,
	Warning = 2,
	Error = 3
}

/**
 * Common properties shared by all chat debug event types.
 */
export interface IChatDebugEventCommon {
	readonly id?: string;
	readonly sessionResource: URI;
	readonly created: Date;
	readonly parentEventId?: string;
}

/**
 * A tool call event in the chat debug log.
 */
export interface IChatDebugToolCallEvent extends IChatDebugEventCommon {
	readonly kind: 'toolCall';
	readonly toolName: string;
	readonly toolCallId?: string;
	readonly input?: string;
	readonly output?: string;
	readonly result?: 'success' | 'error';
	readonly durationInMillis?: number;
}

/**
 * A model turn event representing an LLM request/response.
 */
export interface IChatDebugModelTurnEvent extends IChatDebugEventCommon {
	readonly kind: 'modelTurn';
	readonly model?: string;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly totalTokens?: number;
	readonly durationInMillis?: number;
}

/**
 * A generic log event for unstructured or miscellaneous messages.
 */
export interface IChatDebugGenericEvent extends IChatDebugEventCommon {
	readonly kind: 'generic';
	readonly name: string;
	readonly details?: string;
	readonly level: ChatDebugLogLevel;
	readonly category?: string;
}

/**
 * A subagent invocation event, representing a spawned sub-agent within a session.
 */
export interface IChatDebugSubagentInvocationEvent extends IChatDebugEventCommon {
	readonly kind: 'subagentInvocation';
	readonly agentName: string;
	readonly description?: string;
	readonly status?: 'running' | 'completed' | 'failed';
	readonly durationInMillis?: number;
	readonly toolCallCount?: number;
	readonly modelTurnCount?: number;
}

/**
 * A named section within a user message or agent response.
 */
export interface IChatDebugMessageSection {
	readonly name: string;
	readonly content: string;
}

/**
 * A user message event, representing the full prompt sent by the user.
 */
export interface IChatDebugUserMessageEvent extends IChatDebugEventCommon {
	readonly kind: 'userMessage';
	readonly message: string;
	readonly sections: readonly IChatDebugMessageSection[];
}

/**
 * An agent response event, representing the agent's response.
 */
export interface IChatDebugAgentResponseEvent extends IChatDebugEventCommon {
	readonly kind: 'agentResponse';
	readonly message: string;
	readonly sections: readonly IChatDebugMessageSection[];
}

/**
 * Union of all internal chat debug event types.
 */
export type IChatDebugEvent = IChatDebugToolCallEvent | IChatDebugModelTurnEvent | IChatDebugGenericEvent | IChatDebugSubagentInvocationEvent | IChatDebugUserMessageEvent | IChatDebugAgentResponseEvent;

export const IChatDebugService = createDecorator<IChatDebugService>('chatDebugService');

/**
 * Service for collecting and exposing chat debug events.
 * Internal components can log events,
 * and the debug editor pane can display them.
 */
export interface IChatDebugService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when a new event is added.
	 */
	readonly onDidAddEvent: Event<IChatDebugEvent>;

	/**
	 * Log a generic event to the debug service.
	 */
	log(sessionResource: URI, name: string, details?: string, level?: ChatDebugLogLevel, options?: { id?: string; category?: string; parentEventId?: string }): void;

	/**
	 * Add a typed event to the debug service.
	 */
	addEvent(event: IChatDebugEvent): void;

	/**
	 * Add an event sourced from an external provider.
	 * These events are cleared before re-invoking providers to avoid duplicates.
	 */
	addProviderEvent(event: IChatDebugEvent): void;

	/**
	 * Get all events for a specific session.
	 */
	getEvents(sessionResource?: URI): readonly IChatDebugEvent[];

	/**
	 * Get all session resources that have logged events.
	 */
	getSessionResources(): readonly URI[];

	/**
	 * The currently active session resource for debugging.
	 */
	activeSessionResource: URI | undefined;

	/**
	 * Clear all logged events.
	 */
	clear(): void;

	/**
	 * Register an external provider that can supply additional debug events.
	 * This is used by the extension API (ChatDebugLogProvider).
	 */
	registerProvider(provider: IChatDebugLogProvider): IDisposable;

	/**
	 * Invoke all registered providers for a given session resource.
	 * Called when the Debug View is opened to fetch events from extensions.
	 */
	invokeProviders(sessionResource: URI): Promise<void>;

	/**
	 * End a debug session: cancels any in-flight provider invocation,
	 * disposes the associated CancellationTokenSource, and removes it.
	 * Called when the chat session is disposed/archived.
	 */
	endSession(sessionResource: URI): void;

	/**
	 * Resolve the full details of an event by its id.
	 * Delegates to the registered provider's resolveChatDebugLogEvent.
	 */
	resolveEvent(eventId: string): Promise<IChatDebugResolvedEventContent | undefined>;
}

/**
 * Plain text content for a resolved debug event.
 */
export interface IChatDebugEventTextContent {
	readonly kind: 'text';
	readonly value: string;
}

/**
 * The status of a file in a file list content.
 */
export type ChatDebugFileStatus = 'loaded' | 'skipped';

/**
 * A single file entry in a file list content.
 */
export interface IChatDebugFileEntry {
	readonly uri: URI;
	readonly name?: string;
	readonly status: ChatDebugFileStatus;
	readonly storage?: string;
	readonly extensionId?: string;
	readonly skipReason?: string;
	readonly errorMessage?: string;
	readonly duplicateOf?: URI;
}

/**
 * A source folder entry in a file list content.
 */
export interface IChatDebugSourceFolderEntry {
	readonly uri: URI;
	readonly storage: string;
	readonly exists: boolean;
	readonly fileCount: number;
	readonly errorMessage?: string;
}

/**
 * Structured file list content for a resolved debug event.
 * Contains resolved files and skipped/failed paths for rich rendering.
 */
export interface IChatDebugEventFileListContent {
	readonly kind: 'fileList';
	readonly discoveryType: string;
	readonly files: readonly IChatDebugFileEntry[];
	readonly sourceFolders?: readonly IChatDebugSourceFolderEntry[];
}

/**
 * Structured message content for a resolved debug event,
 * containing collapsible sections.
 */
export interface IChatDebugEventMessageContent {
	readonly kind: 'message';
	readonly type: 'user' | 'agent';
	readonly message: string;
	readonly sections: readonly IChatDebugMessageSection[];
}

/**
 * Union of all resolved event content types.
 */
export type IChatDebugResolvedEventContent = IChatDebugEventTextContent | IChatDebugEventFileListContent | IChatDebugEventMessageContent;

/**
 * Provider interface for debug events.
 */
export interface IChatDebugLogProvider {
	provideChatDebugLog(sessionResource: URI, token: CancellationToken): Promise<IChatDebugEvent[] | undefined>;
	resolveChatDebugLogEvent?(eventId: string, token: CancellationToken): Promise<IChatDebugResolvedEventContent | undefined>;
}
