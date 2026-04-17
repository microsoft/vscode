/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { type FileRow, type RefRow, type SessionRow, type TurnRow, ISessionStore } from '../../../platform/chronicle/common/sessionStore';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../platform/otel/common/genAiAttributes';
import { type ICompletedSpanData, IOTelService } from '../../../platform/otel/common/otelService';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { autorun } from '../../../util/vs/base/common/observableInternal';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IExtensionContribution } from '../../common/contributions';
import {
	extractFilePath,
	extractRefsFromMcpTool,
	extractRefsFromTerminal,
	extractRepoFromMcpTool,
	isGitHubMcpTool,
} from '../common/sessionStoreTracking';

/** How often to flush buffered writes to SQLite (ms). */
const FLUSH_INTERVAL_MS = 3_000;

/** Minimum interval between session upserts for the same session (ms). */
const SESSION_UPSERT_COOLDOWN_MS = 30_000;

/**
 * Buffered write operations waiting to be flushed to SQLite.
 */
interface WriteBuffer {
	/** Session upserts keyed by session ID — later writes merge into earlier ones. */
	sessions: Map<string, SessionRow>;
	files: FileRow[];
	refs: RefRow[];
	turns: TurnRow[];
}

/**
 * Populates the Chronicle session store from VS Code session lifecycle events.
 *
 * Optimizations:
 * 1. **Write batching**: All writes are buffered and flushed every 3s in a single transaction.
 * 2. **Deferred processing**: Span handling is deferred via queueMicrotask to avoid blocking.
 * 3. **Duplicate suppression**: Session upserts with no new data are skipped via cooldown cache.
 */
export class SessionStoreTracker extends Disposable implements IExtensionContribution {

	/** Track which sessions have been initialized in the store. */
	private readonly _initializedSessions = new Set<string>();

	/** Pending writes waiting for the next flush. */
	private readonly _buffer: WriteBuffer = {
		sessions: new Map(),
		files: [],
		refs: [],
		turns: [],
	};

	/** Flush timer handle. */
	private _flushTimer: ReturnType<typeof setInterval> | undefined;

	/** Last time each session had a timestamp-only upsert flushed (ms since epoch). */
	private readonly _lastSessionTimestamp = new Map<string, number>();

	/** Per-session turn counter to avoid collisions between buffered writes and DB state. */
	private readonly _turnCounters = new Map<string, number>();

	constructor(
		@ISessionStore private readonly _sessionStore: ISessionStore,
		@IOTelService private readonly _otelService: IOTelService,
		@IChatSessionService private readonly _chatSessionService: IChatSessionService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		// Only set up span listener and flush timer when the feature is enabled.
		// Uses autorun to react if the setting changes at runtime.
		const featureEnabled = this._configService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.SessionSearchLocalIndexEnabled, this._expService);
		const spanListenerStore = this._register(new DisposableStore());
		this._register(autorun(reader => {
			spanListenerStore.clear();
			if (!featureEnabled.read(reader)) {
				return;
			}

			// Warm up the DB eagerly so schema issues surface early
			try {
				this._sessionStore.getStats();
			} catch (err) {
				/* __GDPR__
"chronicle.localStore" : {
"owner": "vijayu",
"comment": "Tracks local session store operations (init, write, flush errors)",
"operation": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The operation performed." },
"sessionSource": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The agent name/source for the session, or unknown if unavailable." },
"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the operation succeeded." },
"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Truncated error message if failed." },
"opsCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of buffered operations in a failed flush." }
}
*/
				this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.localStore', {
					operation: 'dbInit',
					success: 'false',
					error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
				}, {});
			}

			// Start periodic flush
			this._flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL_MS);
			spanListenerStore.add({ dispose: () => { if (this._flushTimer) { clearInterval(this._flushTimer); this._flushTimer = undefined; } } });

			// Listen to completed OTel spans for tool calls and session activity
			spanListenerStore.add(this._otelService.onDidCompleteSpan(span => {
				queueMicrotask(() => this._handleSpan(span));
			}));

			// Flush and clean up on session disposal
			spanListenerStore.add(this._chatSessionService.onDidDisposeChatSession(sessionId => {
				this._initializedSessions.delete(sessionId);
				this._lastSessionTimestamp.delete(sessionId);
				this._turnCounters.delete(sessionId);
			}));
		}));
	}

	override dispose(): void {
		// Flush any remaining buffered writes before shutdown
		if (this._flushTimer !== undefined) {
			clearInterval(this._flushTimer);
			this._flushTimer = undefined;
		}
		this._flush();
		super.dispose();
	}

	// ── Span handling (produces buffered writes, no direct DB calls) ─────

	private _handleSpan(span: ICompletedSpanData): void {
		try {
			const sessionId = this._getSessionId(span);
			if (!sessionId) {
				return;
			}

			const operationName = span.attributes[GenAiAttr.OPERATION_NAME] as string | undefined;

			// Only track sessions that have an invoke_agent span (real user interactions).
			// Skip internal LLM calls (title generation, progress messages, etc.)
			if (!this._initializedSessions.has(sessionId)) {
				if (operationName !== GenAiOperationName.INVOKE_AGENT) {
					return;
				}
				this._initSession(sessionId, span);
			}

			// Extract metadata from any span that carries workspace/user info
			this._backfillFromSpanAttributes(sessionId, span);

			// Track turns from invoke_agent spans
			if (operationName === GenAiOperationName.INVOKE_AGENT) {
				this._handleAgentSpan(sessionId, span);
			}

			// Track tool executions
			if (operationName === GenAiOperationName.EXECUTE_TOOL) {
				this._handleToolSpan(sessionId, span);
			}

			// Lightweight timestamp bump — throttled by cooldown
			this._bufferSessionTimestamp(sessionId);
		} catch {
			// Non-fatal — individual span processing failure
		}
	}

	private _getSessionId(span: ICompletedSpanData): string | undefined {
		return (span.attributes[CopilotChatAttr.CHAT_SESSION_ID] as string | undefined)
			?? (span.attributes[GenAiAttr.CONVERSATION_ID] as string | undefined)
			?? (span.attributes[CopilotChatAttr.SESSION_ID] as string | undefined);
	}

	private _initSession(sessionId: string, span: ICompletedSpanData): void {
		this._initializedSessions.add(sessionId);
		this._bufferSessionUpsert({ id: sessionId, host_type: 'vscode' });

		const sessionSource = (span.attributes[GenAiAttr.AGENT_NAME] as string | undefined) ?? 'unknown';

		// Track the source of the very first session for firstWrite telemetry
		if (!this._firstWriteSessionSource) {
			this._firstWriteSessionSource = sessionSource;
		}

		this._telemetryService.sendMSFTTelemetryEvent('chronicle.localStore', {
			operation: 'sessionInit',
			sessionSource,
		}, {});
	}

	private _backfillFromSpanAttributes(sessionId: string, span: ICompletedSpanData): void {
		const branch = span.attributes[CopilotChatAttr.REPO_HEAD_BRANCH_NAME] as string | undefined;
		const remoteUrl = span.attributes[CopilotChatAttr.REPO_REMOTE_URL] as string | undefined;
		const userRequest = span.attributes[CopilotChatAttr.USER_REQUEST] as string | undefined;

		if (branch || remoteUrl || userRequest) {
			const summary = userRequest
				? (userRequest.length > 100 ? userRequest.slice(0, 100).trim() + '...' : userRequest)
				: undefined;

			this._bufferSessionUpsert({
				id: sessionId,
				...(branch ? { branch } : {}),
				...(remoteUrl ? { repository: remoteUrl } : {}),
				...(summary ? { summary } : {}),
			});
		}
	}

	private _handleToolSpan(sessionId: string, span: ICompletedSpanData): void {
		const toolName = span.attributes[GenAiAttr.TOOL_NAME] as string | undefined;
		if (!toolName) {
			return;
		}

		const turnIndex = span.attributes[CopilotChatAttr.TURN_INDEX] as number | undefined;
		const toolArgs = this._extractToolArgs(span);

		// Extract file path
		const filePath = extractFilePath(toolName, toolArgs);
		if (filePath) {
			this._buffer.files.push({
				session_id: sessionId,
				file_path: filePath,
				tool_name: toolName,
				turn_index: turnIndex,
			});
		}

		// Track refs from GitHub MCP server tools
		if (isGitHubMcpTool(toolName)) {
			const refs = extractRefsFromMcpTool(toolName, toolArgs);
			for (const ref of refs) {
				this._buffer.refs.push({ session_id: sessionId, ...ref, turn_index: turnIndex });
			}

			const repo = extractRepoFromMcpTool(toolArgs);
			if (repo) {
				this._bufferSessionUpsert({ id: sessionId, repository: repo });
			}
		}

		// Track refs from terminal/shell tool
		if (toolName === 'runInTerminal' || toolName === 'run_in_terminal') {
			const resultText = span.attributes['gen_ai.tool.result'] as string | undefined;
			const refs = extractRefsFromTerminal(toolArgs, resultText);
			for (const ref of refs) {
				this._buffer.refs.push({ session_id: sessionId, ...ref, turn_index: turnIndex });
			}
		}
	}

	private _handleAgentSpan(sessionId: string, span: ICompletedSpanData): void {
		const userRequest = span.attributes[CopilotChatAttr.USER_REQUEST] as string | undefined;

		// Extract user messages from span events
		const userMessages: { turnIndex: number; content: string }[] = [];
		let turnCounter = 0;

		for (const event of span.events) {
			if (event.name === 'user_message') {
				const content = event.attributes?.['content'] as string | undefined;
				if (content) {
					userMessages.push({ turnIndex: turnCounter, content });
				}
				turnCounter++;
			}
		}

		if (userMessages.length === 0 && userRequest) {
			userMessages.push({ turnIndex: 0, content: userRequest });
		}

		// Extract assistant response from OUTPUT_MESSAGES attribute
		const assistantResponse = this._extractAssistantResponse(span);

		// Use in-memory turn counter to avoid collisions with buffered-but-unflushed turns.
		// Initialize from DB on first use, then increment in memory.
		if (!this._turnCounters.has(sessionId)) {
			this._turnCounters.set(sessionId, this._sessionStore.getMaxTurnIndex(sessionId) + 1);
		}
		for (let i = 0; i < userMessages.length; i++) {
			const msg = userMessages[i];
			const absoluteTurnIndex = this._turnCounters.get(sessionId)!;
			this._turnCounters.set(sessionId, absoluteTurnIndex + 1);
			this._buffer.turns.push({
				session_id: sessionId,
				turn_index: absoluteTurnIndex,
				user_message: msg.content,
				// Attach assistant response to the last turn (the final model output)
				...(i === userMessages.length - 1 && assistantResponse
					? { assistant_response: assistantResponse }
					: {}),
			});
		}
	}

	/**
	 * Extract assistant response text from gen_ai.output.messages attribute.
	 * Format: [{"role":"assistant","parts":[{"type":"text","content":"..."}]}]
	 */
	private _extractAssistantResponse(span: ICompletedSpanData): string | undefined {
		const raw = span.attributes[GenAiAttr.OUTPUT_MESSAGES] as string | undefined;
		if (!raw) {
			return undefined;
		}
		try {
			const messages = JSON.parse(raw) as { role: string; parts: { type: string; content: string }[] }[];
			const parts = messages
				.filter(m => m.role === 'assistant')
				.flatMap(m => m.parts)
				.filter(p => p.type === 'text')
				.map(p => p.content);
			return parts.length > 0 ? parts.join('\n') : undefined;
		} catch {
			return undefined;
		}
	}

	// ── Buffering helpers ────────────────────────────────────────────────

	/**
	 * Merge a session upsert into the buffer. Later writes overwrite earlier
	 * ones for the same field, but null/undefined fields don't overwrite.
	 */
	private _bufferSessionUpsert(session: SessionRow): void {
		const existing = this._buffer.sessions.get(session.id);
		if (existing) {
			// Merge: keep existing values unless new value is non-null
			this._buffer.sessions.set(session.id, {
				...existing,
				...(session.cwd ? { cwd: session.cwd } : {}),
				...(session.repository ? { repository: session.repository } : {}),
				...(session.host_type ? { host_type: session.host_type } : {}),
				...(session.branch ? { branch: session.branch } : {}),
				...(session.summary ? { summary: session.summary } : {}),
			});
		} else {
			this._buffer.sessions.set(session.id, { ...session });
		}
	}

	/**
	 * Buffer a timestamp-only upsert, but skip if we recently flushed one
	 * for this session (cooldown-based dedup).
	 */
	private _bufferSessionTimestamp(sessionId: string): void {
		const now = Date.now();
		const last = this._lastSessionTimestamp.get(sessionId) ?? 0;
		if (now - last < SESSION_UPSERT_COOLDOWN_MS) {
			return; // Skip — too recent
		}
		this._lastSessionTimestamp.set(sessionId, now);
		this._bufferSessionUpsert({ id: sessionId, host_type: 'vscode' });
	}

	/** Whether we've already sent a successful-write telemetry event. */
	private _firstWriteLogged = false;

	/** The session source of the first initialized session (for firstWrite telemetry). */
	private _firstWriteSessionSource: string | undefined;

	// ── Flush: batch all buffered writes into one transaction ────────────

	private _flush(): void {
		const { sessions, files, refs, turns } = this._buffer;
		const totalOps = sessions.size + files.length + refs.length + turns.length;
		if (totalOps === 0) {
			return;
		}

		// Swap out the buffer contents so new writes during flush go to fresh arrays
		const sessionsToFlush = [...sessions.values()];
		const filesToFlush = [...files];
		const refsToFlush = [...refs];
		const turnsToFlush = [...turns];
		sessions.clear();
		files.length = 0;
		refs.length = 0;
		turns.length = 0;

		try {
			this._sessionStore.runInTransaction(() => {
				for (const session of sessionsToFlush) {
					this._sessionStore.upsertSession(session);
				}
				for (const file of filesToFlush) {
					this._sessionStore.insertFile(file);
				}
				for (const ref of refsToFlush) {
					this._sessionStore.insertRef(ref);
				}
				for (const turn of turnsToFlush) {
					this._sessionStore.insertTurn(turn);
				}
			});

			if (!this._firstWriteLogged) {
				this._firstWriteLogged = true;

				this._telemetryService.sendMSFTTelemetryEvent('chronicle.localStore', {
					operation: 'firstWrite',
					sessionSource: this._firstWriteSessionSource ?? 'unknown',
				}, {});
			}
		} catch (err) {

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.localStore', {
				operation: 'flush',
				success: 'false',
				error: err instanceof Error ? err.message.substring(0, 100) : 'unknown',
			}, { opsCount: totalOps });
		}
	}

	// ── Utilities ────────────────────────────────────────────────────────

	private _extractToolArgs(span: ICompletedSpanData): Record<string, unknown> {
		const args: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(span.attributes)) {
			if (key.startsWith('gen_ai.tool.input.')) {
				args[key.slice('gen_ai.tool.input.'.length)] = value;
			}
		}
		const serialized = span.attributes['gen_ai.tool.input'];
		if (typeof serialized === 'string') {
			try {
				return JSON.parse(serialized);
			} catch {
				// ignore parse errors
			}
		}
		return args;
	}
}
