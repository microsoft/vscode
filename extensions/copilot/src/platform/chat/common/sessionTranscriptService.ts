/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { URI } from '../../../util/vs/base/common/uri';

export const ISessionTranscriptService = createServiceIdentifier<ISessionTranscriptService>('ISessionTranscriptService');

// #region Transcript Entry Types

/**
 * Common fields shared by all transcript entries.
 */
interface TranscriptEntryBase {
	/** Entry type discriminator. */
	readonly type: string;
	/** Entry-specific data payload. */
	readonly data: unknown;
	/** Unique entry identifier. */
	readonly id: string;
	/** ISO 8601 timestamp of when this entry was created. */
	readonly timestamp: string;
	/** ID of the previous entry for ordering (null for first entry). */
	readonly parentId: string | null;
}

export interface SessionStartData {
	readonly sessionId: string;
	readonly version: number;
	readonly producer: string;
	readonly copilotVersion: string;
	readonly vscodeVersion: string;
	readonly startTime: string;
	readonly context?: {
		readonly cwd?: string;
	};
}

export interface SessionStartEntry extends TranscriptEntryBase {
	readonly type: 'session.start';
	readonly data: SessionStartData;
}

export interface UserMessageData {
	readonly content: string;
	readonly attachments?: readonly unknown[];
}

export interface UserMessageEntry extends TranscriptEntryBase {
	readonly type: 'user.message';
	readonly data: UserMessageData;
}

export interface AssistantTurnStartData {
	readonly turnId: string;
}

export interface AssistantTurnStartEntry extends TranscriptEntryBase {
	readonly type: 'assistant.turn_start';
	readonly data: AssistantTurnStartData;
}

export interface ToolRequest {
	readonly toolCallId: string;
	readonly name: string;
	readonly arguments: string;
	readonly type: 'function';
}

export interface AssistantMessageData {
	readonly messageId: string;
	readonly content: string;
	readonly toolRequests: readonly ToolRequest[];
	readonly reasoningText?: string;
}

export interface AssistantMessageEntry extends TranscriptEntryBase {
	readonly type: 'assistant.message';
	readonly data: AssistantMessageData;
}

export interface ToolExecutionStartData {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly arguments: unknown;
}

export interface ToolExecutionStartEntry extends TranscriptEntryBase {
	readonly type: 'tool.execution_start';
	readonly data: ToolExecutionStartData;
}

export interface ToolExecutionCompleteData {
	readonly toolCallId: string;
	readonly success: boolean;
	readonly result?: {
		readonly content: string;
	};
}

export interface ToolExecutionCompleteEntry extends TranscriptEntryBase {
	readonly type: 'tool.execution_complete';
	readonly data: ToolExecutionCompleteData;
}

export interface AssistantTurnEndData {
	readonly turnId: string;
}

export interface AssistantTurnEndEntry extends TranscriptEntryBase {
	readonly type: 'assistant.turn_end';
	readonly data: AssistantTurnEndData;
}

/**
 * Token / accounting information reported by the model for a single assistant
 * action or turn. All fields are optional because different runtimes surface
 * different subsets of this data.
 */
export interface UsageData {
	/** Model that produced this turn (e.g. `gpt-4o`). */
	readonly model?: string;
	/** Prompt (input) tokens consumed. */
	readonly inputTokens?: number;
	/** Completion (output) tokens produced. */
	readonly outputTokens?: number;
	/** Total tokens (input + output) when reported directly. */
	readonly totalTokens?: number;
	/** Prompt tokens served from cache. */
	readonly cacheReadTokens?: number;
	/** Prompt tokens written to the cache. */
	readonly cacheCreationInputTokens?: number;
	/** Raw internal Copilot AI-unit accounting, in nano-AIU, if available. */
	readonly copilotUsageNanoAiu?: number;
	/** Set when this turn originates from a subagent nested under a parent tool call. */
	readonly parentToolCallId?: string | null;
}

export interface AssistantUsageEntry extends TranscriptEntryBase {
	readonly type: 'assistant.usage';
	readonly data: UsageData;
}

export type TranscriptEntry =
	| SessionStartEntry
	| UserMessageEntry
	| AssistantTurnStartEntry
	| AssistantMessageEntry
	| ToolExecutionStartEntry
	| ToolExecutionCompleteEntry
	| AssistantUsageEntry
	| AssistantTurnEndEntry;

// #endregion

// #region Historical Replay Types

/**
 * A tool call from a historical round, used when replaying conversation
 * history into a transcript file.
 */
export interface IHistoricalToolCall {
	readonly name: string;
	readonly arguments: string;
	readonly id: string;
}

/**
 * A single assistant round from conversation history.
 * Maps to a `user.message → assistant.turn_start → assistant.message → assistant.turn_end`
 * sequence in the transcript.
 */
export interface IHistoricalToolCallRound {
	/** The assistant's text response for this round. */
	readonly response: string;
	/** Tool calls made by the assistant in this round. */
	readonly toolCalls: readonly IHistoricalToolCall[];
	/** Optional reasoning / thinking text. */
	readonly reasoningText?: string;
	/** Epoch millis (`Date.now()`) when this round started, if known. */
	readonly timestamp?: number;
}

/**
 * A single turn from conversation history, containing the user message
 * and all assistant rounds that followed.
 */
export interface IHistoricalTurn {
	/** The user's prompt text for this turn. */
	readonly userMessage: string;
	/** Epoch millis (`Date.now()`) when this turn started. */
	readonly timestamp: number;
	/** The assistant rounds that occurred during this turn. */
	readonly rounds: readonly IHistoricalToolCallRound[];
}

// #endregion

export interface ISessionTranscriptService {
	readonly _serviceBrand: undefined;

	/**
	 * Start tracking a new session. Creates the transcript file.
	 *
	 * If `history` is provided and no transcript file exists on disk yet,
	 * the historical turns are replayed into the transcript before the
	 * current turn begins. If a file already exists, history is ignored.
	 *
	 * @param sessionId Unique session identifier (typically `conversation.sessionId`).
	 * @param context Optional context about the session environment.
	 * @param history Previous turns to replay if the transcript must be created from scratch.
	 */
	startSession(sessionId: string, context?: { cwd?: string }, history?: readonly IHistoricalTurn[]): Promise<void>;

	/**
	 * Record the user's prompt message.
	 * Entries are buffered; call {@link flush} to write to disk.
	 */
	logUserMessage(sessionId: string, content: string, attachments?: readonly unknown[]): void;

	/**
	 * Record the start of an assistant turn (one iteration of the tool calling loop).
	 * Entries are buffered; call {@link flush} to write to disk.
	 */
	logAssistantTurnStart(sessionId: string, turnId: string): void;

	/**
	 * Record an assistant message containing text and/or tool call requests.
	 * Entries are buffered; call {@link flush} to write to disk.
	 */
	logAssistantMessage(sessionId: string, content: string, toolRequests: readonly ToolRequest[], reasoningText?: string): void;

	/**
	 * Record the start of a tool execution.
	 * Entries are buffered; call {@link flush} to write to disk.
	 */
	logToolExecutionStart(sessionId: string, toolCallId: string, toolName: string, args: unknown): void;

	/**
	 * Record the completion of a tool execution.
	 * Entries are buffered; call {@link flush} to write to disk.
	 */
	logToolExecutionComplete(sessionId: string, toolCallId: string, success: boolean, resultContent?: string): void;

	/**
	 * Record token / accounting usage reported for an assistant action or turn.
	 * Buffered as an append-only `assistant.usage` entry at the moment it is
	 * observed; prior entries are never rewritten to attach usage retrospectively.
	 * Entries are buffered; call {@link flush} to write to disk.
	 */
	logAssistantUsage(sessionId: string, usage: UsageData): void;

	/**
	 * Record the end of an assistant turn.
	 * Entries are buffered; call {@link flush} to write to disk.
	 */
	logAssistantTurnEnd(sessionId: string, turnId: string): void;

	/**
	 * Flush all buffered transcript entries for a session to disk.
	 * Safe to call multiple times; concurrent flushes are serialized.
	 */
	flush(sessionId: string): Promise<void>;

	/**
	 * Mark a session as ended. The transcript file is retained for lazy cleanup.
	 */
	endSession(sessionId: string): Promise<void>;

	/**
	 * Get the URI of the transcript file for a session, if one exists.
	 * Returns `undefined` if the session has no transcript.
	 */
	getTranscriptPath(sessionId: string): URI | undefined;

	/**
	 * Get the current number of lines in the transcript for a session.
	 * Returns `undefined` if the session is not active.
	 */
	getLineCount(sessionId: string): number | undefined;

	/**
	 * Remove transcript files for sessions that are no longer active,
	 * keeping at most `maxRetained` most-recent ended sessions.
	 */
	cleanupOldTranscripts(maxRetained?: number): Promise<void>;

	/**
	 * Check whether a URI is under the transcripts storage directory.
	 * Used by {@link assertFileOkForTool} to allowlist tool reads.
	 */
	isTranscriptUri(uri: URI): boolean;
}

export class NullSessionTranscriptService implements ISessionTranscriptService {
	declare readonly _serviceBrand: undefined;

	// Signatures mirror {@link ISessionTranscriptService} (rather than paramless no-ops) so
	// recording/spy subclasses in tests can `override` individual methods without an arity mismatch.
	async startSession(sessionId: string, context?: { cwd?: string }, history?: readonly IHistoricalTurn[]): Promise<void> { }
	logUserMessage(sessionId: string, content: string, attachments?: readonly unknown[]): void { }
	logAssistantTurnStart(sessionId: string, turnId: string): void { }
	logAssistantMessage(sessionId: string, content: string, toolRequests: readonly ToolRequest[], reasoningText?: string): void { }
	logToolExecutionStart(sessionId: string, toolCallId: string, toolName: string, args: unknown): void { }
	logToolExecutionComplete(sessionId: string, toolCallId: string, success: boolean, resultContent?: string): void { }
	logAssistantUsage(sessionId: string, usage: UsageData): void { }
	logAssistantTurnEnd(sessionId: string, turnId: string): void { }
	async flush(sessionId: string): Promise<void> { }
	async endSession(sessionId: string): Promise<void> { }
	getTranscriptPath(sessionId: string): URI | undefined { return undefined; }
	getLineCount(sessionId: string): number | undefined { return undefined; }
	async cleanupOldTranscripts(maxRetained?: number): Promise<void> { }
	isTranscriptUri(uri: URI): boolean { return false; }
}
