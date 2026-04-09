/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { decodeBase64 } from '../../../util/vs/base/common/buffer';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';

export const IChatDebugFileLoggerService = createServiceIdentifier<IChatDebugFileLoggerService>('IChatDebugFileLoggerService');

/**
 * Extract the chat session ID string from a session resource URI.
 *
 * - `vscode-chat-session://local/<base64EncodedSessionId>` — decodes base64
 * - `copilotcli:///<sessionId>` and `claude-code:///<sessionId>` — uses raw path segment
 */
export function sessionResourceToId(sessionResource: URI): string {
	const pathSegment = sessionResource.path.replace(/^\//, '').split('/').pop() || '';
	if (!pathSegment) {
		return pathSegment;
	}
	// Only vscode-chat-session URIs use base64-encoded session IDs
	if (sessionResource.scheme === 'vscode-chat-session') {
		try {
			return new TextDecoder().decode(decodeBase64(pathSegment).buffer);
		} catch {
			// Not valid base64 — fall through to raw segment
		}
	}
	return pathSegment;
}

/**
 * Service that writes chat debug events (OTel spans + discovery events) to
 * per-session JSONL files on disk. These files can be read by skills,
 * subagents, etc via `read_file` tool to diagnose chat issues.
 */
export interface IChatDebugFileLoggerService {
	readonly _serviceBrand: undefined;

	/**
	 * Begin logging for a session. Registers the session in memory;
	 * directory creation and file writes are deferred to the first flush.
	 */
	startSession(sessionId: string): Promise<void>;

	/**
	 * Register a child session that should be written under a parent session's directory.
	 * Call this before any spans arrive for the child session to ensure
	 * correct routing of all events (including tool calls that may arrive
	 * before the child's invoke_agent span completes).
	 */
	startChildSession(childSessionId: string, parentSessionId: string, label: string, parentToolSpanId?: string): void;

	/**
	 * Register a span ID → session ID mapping so that child spans
	 * (e.g. hooks) are routed to the correct session before the
	 * parent span completes.
	 */
	registerSpanSession(spanId: string, sessionId: string): void;

	/**
	 * End logging for a session. Performs a final flush and removes the
	 * session from the active set.
	 */
	endSession(sessionId: string): Promise<void>;

	/**
	 * Flush any buffered entries to disk for the given session.
	 */
	flush(sessionId: string): Promise<void>;

	/**
	 * Get the URI of the debug logs directory, or undefined if it cannot be
	 * determined (e.g. no workspace, or an error occurs). The directory may
	 * not actually exist on disk yet if no sessions have been started.
	 */
	readonly debugLogsDir: URI | undefined;

	/**
	 * Get the URI of the debug log file for a session, or undefined if the
	 * session has not been started.
	 */
	getLogPath(sessionId: string): URI | undefined;

	/**
	 * Get the session directory URI for a session. For both parent and child
	 * sessions this returns the parent session's directory
	 * (e.g. `debug-logs/<parentSessionId>/`).
	 */
	getSessionDir(sessionId: string): URI | undefined;

	/**
	 * Returns the session IDs of all currently active logging sessions.
	 */
	getActiveSessionIds(): string[];

	/**
	 * Check whether a URI is under the debug-logs storage directory.
	 * Used by {@link assertFileOkForTool} to allowlist tool reads.
	 */
	isDebugLogUri(uri: URI): boolean;

	/**
	 * Convenience method: decode a session resource URI and return the
	 * session directory, or `undefined` if the session is unknown.
	 */
	getSessionDirForResource(sessionResource: URI): URI | undefined;

	/**
	 * Cache the latest model list snapshot from the API. The data is written
	 * as `models.json` into each session directory when a session starts.
	 */
	setModelSnapshot(models: readonly unknown[]): void;

	/**
	 * Fired synchronously when an entry is buffered, before it is flushed to disk.
	 * Subscribers receive the entry in real-time for live streaming.
	 */
	readonly onDidEmitEntry: Event<{ sessionId: string; entry: IDebugLogEntry }>;

	/**
	 * Read all entries for a session from disk + unflushed buffer.
	 * Returns an empty array if the session has no log file yet.
	 */
	readEntries(sessionId: string): Promise<IDebugLogEntry[]>;

	/**
	 * Read the last `count` entries from a session's JSONL file + unflushed buffer.
	 * Reads only the tail of the file for performance on large files.
	 */
	readTailEntries(sessionId: string, count: number): Promise<IDebugLogEntry[]>;

	/**
	 * Stream entries from a session's JSONL file line by line.
	 * Calls `onEntry` for each parsed entry. Returns when all entries have been streamed.
	 * Uses a streaming parser to avoid loading the entire file into memory.
	 */
	streamEntries(sessionId: string, onEntry: (entry: IDebugLogEntry) => void): Promise<void>;
}

/**
 * A single JSONL debug log entry — the canonical debug event format.
 */
export interface IDebugLogEntry {
	/** Schema version. Absent or 1 = current schema. Bump on breaking changes. */
	readonly v?: number;
	/** Run index within a session. 0 (or absent) = first run; incremented on each VS Code restart that resumes the same session. */
	readonly rIdx?: number;
	/** Epoch ms timestamp */
	readonly ts: number;
	/** Duration in ms (0 for instant events) */
	readonly dur: number;
	/** Chat session ID */
	readonly sid: string;
	/** Event type */
	readonly type: 'session_start' | 'tool_call' | 'llm_request' | 'user_message' | 'agent_response' | 'subagent' | 'discovery' | 'error' | 'generic' | 'child_session_ref' | 'hook' | 'turn_start' | 'turn_end';
	/** Descriptive name */
	readonly name: string;
	/** Span or event ID */
	readonly spanId: string;
	/** Parent span ID for hierarchy */
	readonly parentSpanId?: string;
	/** Status */
	readonly status: 'ok' | 'error';
	/** Type-specific attributes */
	readonly attrs: Record<string, string | number | boolean | undefined>;
}

/**
 * No-op implementation for testing and environments without workspace storage.
 */
export class NullChatDebugFileLoggerService implements IChatDebugFileLoggerService {
	declare readonly _serviceBrand: undefined;

	async startSession(): Promise<void> { }
	startChildSession(): void { }
	registerSpanSession(): void { }
	async endSession(): Promise<void> { }
	async flush(): Promise<void> { }
	getLogPath(_sessionId?: string): URI | undefined { return undefined; }
	getSessionDir(_sessionId?: string): URI | undefined { return undefined; }
	getActiveSessionIds(): string[] { return []; }
	isDebugLogUri(): boolean { return false; }
	getSessionDirForResource(): URI | undefined { return undefined; }
	setModelSnapshot(): void { }
	readonly debugLogsDir: URI | undefined = undefined;
	readonly onDidEmitEntry: Event<{ sessionId: string; entry: IDebugLogEntry }> = Event.None;
	async readEntries(): Promise<IDebugLogEntry[]> { return []; }
	async readTailEntries(): Promise<IDebugLogEntry[]> { return []; }
	async streamEntries(): Promise<void> { }
}
