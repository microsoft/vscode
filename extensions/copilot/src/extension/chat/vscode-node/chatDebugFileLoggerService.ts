/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as vscode from 'vscode';
import { IChatDebugFileLoggerService, IDebugLogEntry, sessionResourceToId } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { createDirectoryIfNotExists, IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../platform/otel/common/index';
import { ICompletedSpanData, IOTelService, ISpanEventData, SpanStatusCode } from '../../../platform/otel/common/otelService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IExtensionContribution } from '../../common/contributions';

const DEBUG_LOGS_DIR_NAME = 'debug-logs';
const DEFAULT_MAX_RETAINED_LOGS = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 4_000;
const MIN_FLUSH_INTERVAL_MS = 2_000;
const MAX_ATTR_VALUE_LENGTH = 5_000;
const MAX_PENDING_CORE_EVENTS = 100;
const DEFAULT_MAX_SESSION_LOG_MB = 100;
const TRUNCATION_RETAIN_RATIO = 0.6; // retain 60% of max on truncation
const MAX_SPAN_SESSION_INDEX = 10_000;


interface IActiveLogSession {
	readonly uri: URI;
	/** The directory containing this session's log files */
	readonly sessionDir: URI;
	readonly buffer: string[];
	flushPromise: Promise<void>;
	dirEnsured: boolean;
	bytesWritten: number;
	/** Parent session ID if this is a child session (e.g., title, categorization) */
	readonly parentSessionId?: string;
	/** Label for child sessions (e.g., 'title', 'categorization') */
	readonly label?: string;
	/** Whether this session has received its own OTel spans (vs being auto-created as a parent ref) */
	hasOwnSpans: boolean;
	/** Whether models.json has already been written to this session's directory */
	modelSnapshotWritten: boolean;
	/** Key identifying the last-written system prompt: model + agent/mode name (undefined = none written yet) */
	systemPromptKey: string | undefined;
	/** Index of the next system_prompt file to write */
	systemPromptIndex: number;
	/** File name of the most recently written system prompt (e.g., 'system_prompt_0.json') */
	currentSystemPromptFile: string | undefined;
	/** Key identifying the last-written tools file: model + agent/mode name (undefined = none written yet) */
	toolsKey: string | undefined;
	/** Index of the next tools file to write */
	toolsIndex: number;
	/** File name of the most recently written tools file (e.g., 'tools_0.json') */
	currentToolsFile: string | undefined;
	/** Pending tool definitions received before the session was promoted to hasOwnSpans */
	pendingToolDefs: string | undefined;
	/** Whether we've already checked disk for a previous session directory (prevents repeated sync FS calls) */
	resumeChecked: boolean;
	/** Run index: 0 for the first run, incremented on each VS Code restart that resumes this session */
	runIndex: number;
}

// IDebugLogEntry is imported from and defined in the platform layer.
// Re-export for consumers that import from this file.
export type { IDebugLogEntry } from '../../../platform/chat/common/chatDebugFileLoggerService';

export class ChatDebugFileLoggerService extends Disposable implements IChatDebugFileLoggerService {
	declare readonly _serviceBrand: undefined;

	public readonly id = 'chatDebugFileLogger';

	private readonly _onDidEmitEntry = this._register(new Emitter<{ sessionId: string; entry: IDebugLogEntry }>());
	readonly onDidEmitEntry = this._onDidEmitEntry.event;

	private readonly _activeSessions = new Map<string, IActiveLogSession>();
	/** Maps child session ID → { parentSessionId, label } for child session routing */
	private readonly _childSessionMap = new Map<string, { parentSessionId: string; label: string; parentToolSpanId?: string }>();
	/** Maps spanId → resolved session ID for parent-span inheritance */
	private readonly _spanSessionIndex = new Map<string, string>();
	private readonly _pendingCoreEvents: IDebugLogEntry[] = [];
	private _modelSnapshot: readonly unknown[] | undefined;
	private _debugLogsDirUri: URI | undefined;
	private _autoFlushTimer: ReturnType<typeof setInterval> | undefined;
	private _autoFlushIntervalMs: number;
	private _maxSessionLogBytes: number;
	private _totalBytesWritten = 0;
	private _totalSessionCount = 0;

	constructor(
		@IOTelService private readonly _otelService: IOTelService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEnvService private readonly _envService: IEnvService,
	) {
		super();

		const enabled = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ChatDebugFileLogging, this._experimentationService);
		if (!enabled) {
			/* __GDPR__
				"chatDebugFileLogger.disabled" : {
					"owner": "vijayupadya",
					"comment": "Chat debug file logging is disabled via experiment or config"
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('chatDebugFileLogger.disabled');
			this._autoFlushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS;
			this._maxSessionLogBytes = DEFAULT_MAX_SESSION_LOG_MB * 1024 * 1024;
			return;
		}

		this._autoFlushIntervalMs = Math.max(MIN_FLUSH_INTERVAL_MS, this._configurationService.getConfig(ConfigKey.Advanced.ChatDebugFileLoggingFlushInterval) ?? DEFAULT_FLUSH_INTERVAL_MS);
		this._maxSessionLogBytes = this._resolveMaxSessionLogBytes();

		// React to changes at runtime
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.Advanced.ChatDebugFileLoggingFlushInterval.fullyQualifiedId)) {
				this._autoFlushIntervalMs = Math.max(MIN_FLUSH_INTERVAL_MS, this._configurationService.getConfig(ConfigKey.Advanced.ChatDebugFileLoggingFlushInterval) ?? DEFAULT_FLUSH_INTERVAL_MS);
				this._restartFlushTimer();
			}
			if (e.affectsConfiguration(ConfigKey.Advanced.ChatDebugFileLoggingMaxSessionLogSizeMB.fullyQualifiedId)) {
				this._maxSessionLogBytes = this._resolveMaxSessionLogBytes();
			}
		}));

		// Subscribe to OTel span completions
		this._register(this._otelService.onDidCompleteSpan(span => {
			this._onSpanCompleted(span);
		}));

		// Subscribe to OTel span events (real-time user messages)
		this._register(this._otelService.onDidEmitSpanEvent(event => {
			this._onSpanEvent(event);
		}));

		// Subscribe to core debug events (discovery, skill loading, etc.)
		if (typeof vscode.chat?.onDidReceiveChatDebugEvent === 'function') {
			this._register(vscode.chat.onDidReceiveChatDebugEvent(event => {
				this._onCoreDebugEvent(event);
			}));
		}
	}

	private _resolveMaxSessionLogBytes(): number {
		const raw = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ChatDebugFileLoggingMaxSessionLogSizeMB, this._experimentationService);
		const mb = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_MAX_SESSION_LOG_MB;
		return Math.max(1, Math.floor(mb)) * 1024 * 1024;
	}

	override dispose(): void {
		if (this._autoFlushTimer) {
			clearInterval(this._autoFlushTimer);
			this._autoFlushTimer = undefined;
		}
		// Accumulate any remaining active session bytes before emitting telemetry
		for (const session of this._activeSessions.values()) {
			this._totalBytesWritten += session.bytesWritten;
		}
		/* __GDPR__
			"chatDebugFileLogger.end" : {
				"owner": "vijayupadya",
				"comment": "Chat debug file logger is being disposed",
				"totalBytesWritten": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Total bytes written across all sessions" },
				"sessionCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Total number of sessions logged" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('chatDebugFileLogger.end', undefined, { totalBytesWritten: this._totalBytesWritten, sessionCount: this._totalSessionCount });
		super.dispose();
	}

	public get debugLogsDir(): URI | undefined {
		return this._getDebugLogsDir();
	}

	private _getDebugLogsDir(): URI | undefined {
		if (this._debugLogsDirUri) {
			return this._debugLogsDirUri;
		}
		const storageUri = this._extensionContext.storageUri as URI | undefined;
		if (!storageUri) {
			return undefined;
		}
		this._debugLogsDirUri = URI.joinPath(storageUri, DEBUG_LOGS_DIR_NAME);
		return this._debugLogsDirUri;
	}

	async startSession(sessionId: string): Promise<void> {
		this._ensureSession(sessionId, /* hasOwnSpans */ true);
	}

	startChildSession(childSessionId: string, parentSessionId: string, label: string, parentToolSpanId?: string): void {
		if (!this._childSessionMap.has(childSessionId)) {
			this._childSessionMap.set(childSessionId, { parentSessionId, label, parentToolSpanId });
		}
	}

	/**
	 * Synchronously ensure a session exists for buffering. Directory creation
	 * and old-log cleanup are deferred to the first flush.
	 *
	 * Sessions are organized in directories:
	 * - Parent session: `debug-logs/<sessionId>/main.jsonl`
	 * - Child session: `debug-logs/<parentSessionId>/<label>-<childSessionId>.jsonl`
	 */
	private _ensureSession(sessionId: string, hasOwnSpans = false): void {
		const existing = this._activeSessions.get(sessionId);
		if (existing) {
			// Mark that this session now has its own spans (upgrades from auto-created parent ref)
			if (hasOwnSpans && !existing.hasOwnSpans) {
				existing.hasOwnSpans = true;
				// Now that we know this is a real session, replay pending core events
				if (!existing.parentSessionId) {
					this._emitSessionStartAndReplay(sessionId, existing);
				}
			}
			return;
		}

		this._totalSessionCount++;

		const dir = this._getDebugLogsDir();
		if (!dir) {
			return;
		}

		const childInfo = this._childSessionMap.get(sessionId);
		let sessionDir: URI;
		let fileUri: URI;

		if (childInfo) {
			// Child session — write under parent's directory
			sessionDir = URI.joinPath(dir, childInfo.parentSessionId);
			const safeLabel = childInfo.label.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').replace(/\.\./g, '_');
			const fileName = `${safeLabel}-${sessionId}.jsonl`;
			fileUri = URI.joinPath(sessionDir, fileName);

			// Ensure parent session exists so we can write a cross-reference.
			// A child referencing a parent proves it is a main user session,
			// so promote it with hasOwnSpans = true.
			this._ensureSession(childInfo.parentSessionId, /* hasOwnSpans */ true);

			// Write a cross-reference entry in the parent's main.jsonl
			this._bufferEntry(childInfo.parentSessionId, {
				ts: Date.now(),
				dur: 0,
				sid: childInfo.parentSessionId,
				type: 'child_session_ref',
				name: childInfo.label,
				spanId: `child-ref-${sessionId}`,
				...(childInfo.parentToolSpanId ? { parentSpanId: childInfo.parentToolSpanId } : {}),
				status: 'ok',
				attrs: {
					childSessionId: sessionId,
					childLogFile: `${safeLabel}-${sessionId}.jsonl`,
					label: childInfo.label,
				},
			});
		} else {
			// Parent session — write as main.jsonl in its own directory
			sessionDir = URI.joinPath(dir, sessionId);
			fileUri = URI.joinPath(sessionDir, 'main.jsonl');
		}

		const session: IActiveLogSession = {
			uri: fileUri,
			sessionDir,
			buffer: [],
			flushPromise: Promise.resolve(),
			dirEnsured: false,
			bytesWritten: 0,
			parentSessionId: childInfo?.parentSessionId,
			label: childInfo?.label,
			hasOwnSpans,
			modelSnapshotWritten: false,
			systemPromptKey: undefined,
			systemPromptIndex: 0,
			currentSystemPromptFile: undefined,
			toolsKey: undefined,
			toolsIndex: 0,
			currentToolsFile: undefined,
			pendingToolDefs: undefined,
			resumeChecked: false,
			runIndex: 0,
		};
		this._activeSessions.set(sessionId, session);

		// Write a session_start entry so every JSONL file has a version header.
		// For parent sessions with their own spans, also replay pending core events.
		if (childInfo) {
			// Child sessions get a minimal session_start (no core event replay)
			this._bufferEntry(sessionId, {
				v: 1,
				ts: Date.now(),
				dur: 0,
				sid: sessionId,
				type: 'session_start',
				name: 'session_start',
				spanId: `session-start-${sessionId}`,
				status: 'ok',
				attrs: {
					copilotVersion: this._envService.getVersion(),
					vscodeVersion: this._envService.vscodeVersion,
					parentSessionId: childInfo.parentSessionId,
					label: childInfo.label,
				},
			});
		} else if (hasOwnSpans) {
			this._emitSessionStartAndReplay(sessionId, session);
		}

		// Start auto-flush timer if this is the first active session
		if (this._activeSessions.size === 1 && !this._autoFlushTimer) {
			this._autoFlushTimer = setInterval(() => this._autoFlushAll(), this._autoFlushIntervalMs);
		}

		// Fire-and-forget cleanup of old logs
		this._cleanupOldLogs().catch(() => { });
	}

	async endSession(sessionId: string): Promise<void> {
		await this.flush(sessionId);
		const session = this._activeSessions.get(sessionId);
		if (session) {
			this._totalBytesWritten += session.bytesWritten;
		}
		this._activeSessions.delete(sessionId);

		// Clean up span→session mappings for this session
		for (const [spanId, sid] of this._spanSessionIndex) {
			if (sid === sessionId) {
				this._spanSessionIndex.delete(spanId);
			}
		}

		// Stop auto-flush timer if no active sessions remain
		if (this._activeSessions.size === 0 && this._autoFlushTimer) {
			clearInterval(this._autoFlushTimer);
			this._autoFlushTimer = undefined;
		}
	}

	async flush(sessionId: string): Promise<void> {
		const session = this._activeSessions.get(sessionId);
		if (!session) {
			return;
		}

		if (session.buffer.length === 0) {
			// No JSONL entries to flush, but still await any pending async work
			// (e.g. model snapshot write) enqueued on flushPromise.
			return session.flushPromise;
		}

		// Skip flushing for sessions not yet confirmed as main sessions.
		// Keep the buffer intact so entries are preserved if the session
		// is promoted later (e.g., when a child span references it).
		if (!session.parentSessionId && !session.hasOwnSpans) {
			return;
		}

		const lines = session.buffer.splice(0);
		const content = lines.join('');

		session.flushPromise = session.flushPromise.then(
			() => this._writeToFile(session, content),
			() => this._writeToFile(session, content),
		);
		return session.flushPromise;
	}

	getLogPath(sessionId: string): URI | undefined {
		const active = this._activeSessions.get(sessionId);
		if (active) {
			return active.uri;
		}
		// For child sessions, construct the correct <label>-<sessionId>.jsonl path
		const childInfo = this._childSessionMap.get(sessionId);
		if (childInfo) {
			const dir = this._getDebugLogsDir();
			if (!dir) { return undefined; }
			const parentDir = URI.joinPath(dir, childInfo.parentSessionId);
			return URI.joinPath(parentDir, `${childInfo.label}-${sessionId}.jsonl`);
		}
		// For historical sessions (after restart), construct the default path
		const sessionDir = this.getSessionDir(sessionId);
		return sessionDir ? URI.joinPath(sessionDir, 'main.jsonl') : undefined;
	}

	getSessionDir(sessionId: string): URI | undefined {
		// If active, use the stored sessionDir (already points to parent dir for children)
		const active = this._activeSessions.get(sessionId);
		if (active) {
			return active.sessionDir;
		}
		// If known as a child, resolve to the parent's directory
		const childInfo = this._childSessionMap.get(sessionId);
		if (childInfo) {
			const dir = this._getDebugLogsDir();
			return dir ? URI.joinPath(dir, childInfo.parentSessionId) : undefined;
		}
		// Unknown session — construct the default path (assuming it's a parent)
		const dir = this._getDebugLogsDir();
		return dir ? URI.joinPath(dir, sessionId) : undefined;
	}

	getActiveSessionIds(): string[] {
		return [...this._activeSessions.keys()];
	}

	isDebugLogUri(uri: URI): boolean {
		const dir = this._getDebugLogsDir();
		if (!dir) {
			return false;
		}
		return extUriBiasedIgnorePathCase.isEqualOrParent(uri, dir);
	}

	getSessionDirForResource(sessionResource: URI): URI | undefined {
		const sessionId = sessionResourceToId(sessionResource);
		return this.getSessionDir(sessionId);
	}

	setModelSnapshot(models: readonly unknown[]): void {
		this._modelSnapshot = models;
		// Write to any active parent sessions that started before the model fetch completed
		for (const [, session] of this._activeSessions) {
			if (!session.parentSessionId && session.hasOwnSpans) {
				this._enqueueModelSnapshotWrite(session);
			}
		}
	}

	private _enqueueModelSnapshotWrite(session: IActiveLogSession): void {
		session.flushPromise = session.flushPromise.then(
			() => this._writeModelSnapshot(session),
			() => this._writeModelSnapshot(session),
		);
	}

	private async _writeModelSnapshot(session: IActiveLogSession): Promise<void> {
		if (!this._modelSnapshot || session.modelSnapshotWritten) {
			return;
		}
		try {
			if (!session.dirEnsured) {
				await createDirectoryIfNotExists(this._fileSystemService, session.sessionDir);
				session.dirEnsured = true;
			}
			const modelsUri = URI.joinPath(session.sessionDir, 'models.json');
			await fs.promises.writeFile(modelsUri.fsPath, JSON.stringify(this._modelSnapshot, null, 2), 'utf-8');
			session.modelSnapshotWritten = true;
		} catch (err) {
			this._logService.error('[ChatDebugFileLogger] Failed to write models.json', err);
		}
	}

	private _enqueueFileWrite(session: IActiveLogSession, content: string, fileName: string): void {
		session.flushPromise = session.flushPromise.then(
			() => this._writeSessionFile(session, content, fileName),
			() => this._writeSessionFile(session, content, fileName),
		);
	}

	private async _writeSessionFile(session: IActiveLogSession, content: string, fileName: string): Promise<void> {
		try {
			if (!session.dirEnsured) {
				await createDirectoryIfNotExists(this._fileSystemService, session.sessionDir);
				session.dirEnsured = true;
			}
			const fileUri = URI.joinPath(session.sessionDir, fileName);
			await fs.promises.writeFile(fileUri.fsPath, fileName.endsWith('.json') ? JSON.stringify({ content }, null, 2) : content, 'utf-8');
		} catch (err) {
			this._logService.error(`[ChatDebugFileLogger] Failed to write ${fileName}`, err);
		}
	}

	/**
	 * Emit a session_start entry, replay cached core events, and write the model snapshot.
	 * Called when a parent session is first promoted to hasOwnSpans.
	 */
	private _emitSessionStartAndReplay(sessionId: string, session: IActiveLogSession): void {
		this._bufferEntry(sessionId, {
			v: 1,
			ts: Date.now(),
			dur: 0,
			sid: sessionId,
			type: 'session_start',
			name: 'session_start',
			spanId: `session-start-${sessionId}`,
			status: 'ok',
			attrs: {
				copilotVersion: this._envService.getVersion(),
				vscodeVersion: this._envService.vscodeVersion,
			},
		});
		for (const entry of this._pendingCoreEvents) {
			this._bufferEntry(sessionId, { ...entry, sid: sessionId });
		}
		if (this._modelSnapshot) {
			this._enqueueModelSnapshotWrite(session);
		}
		// Write pending tool definitions that arrived before the session was promoted
		if (session.pendingToolDefs) {
			const fileName = `tools_${session.toolsIndex}.json`;
			session.toolsIndex++;
			session.currentToolsFile = fileName;
			this._enqueueFileWrite(session, session.pendingToolDefs, fileName);
			session.pendingToolDefs = undefined;
		}
	}

	// ── OTel span handling ──

	private _onSpanCompleted(span: ICompletedSpanData): void {
		const sessionId = this._extractSessionId(span);
		if (!sessionId) {
			return;
		}

		// Record the span→session mapping so child spans can inherit it
		this._spanSessionIndex.set(span.spanId, sessionId);
		if (this._spanSessionIndex.size > MAX_SPAN_SESSION_INDEX) {
			// Evict oldest entries (Map iterates in insertion order)
			const excess = this._spanSessionIndex.size - MAX_SPAN_SESSION_INDEX;
			const iter = this._spanSessionIndex.keys();
			for (let i = 0; i < excess; i++) {
				this._spanSessionIndex.delete(iter.next().value!);
			}
		}

		// Check if this span carries parent session info (e.g., title, categorization)
		const parentChatSessionId = asString(span.attributes[CopilotChatAttr.PARENT_CHAT_SESSION_ID]);
		const debugLogLabel = asString(span.attributes[CopilotChatAttr.DEBUG_LOG_LABEL]);
		if (parentChatSessionId && debugLogLabel && !this._childSessionMap.has(sessionId)) {
			this._childSessionMap.set(sessionId, { parentSessionId: parentChatSessionId, label: debugLogLabel });
		}

		const entry = this._spanToEntry(span, sessionId);
		const opName = asString(span.attributes[GenAiAttr.OPERATION_NAME]);
		const outputMessages = opName === GenAiOperationName.CHAT
			? asString(span.attributes[GenAiAttr.OUTPUT_MESSAGES])
			: undefined;

		// Never auto-promote sessions from OTel spans.  Sub-requests like
		// title generation, categorization, and progress-message generation
		// each carry their own session IDs with real CHAT content but should
		// not create top-level folders.  A session is only promoted to "real"
		// (hasOwnSpans = true) when:
		//   1. startSession() is called explicitly, or
		//   2. A child span references it via PARENT_CHAT_SESSION_ID
		//      (handled in _ensureSession's child branch).
		//   3. The session directory already exists on disk (resumed after restart).
		this._ensureSession(sessionId);

		// Auto-promote resumed sessions: if the session was just created with
		// hasOwnSpans = false but has an existing JSONL directory from a previous
		// extension lifecycle, promote it. This handles sessions continued after
		// VS Code restart where title/categorization won't re-fire.
		const session = this._activeSessions.get(sessionId);
		if (session && !session.hasOwnSpans && !session.parentSessionId && !session.resumeChecked) {
			session.resumeChecked = true;
			const mainJsonl = URI.joinPath(session.sessionDir, 'main.jsonl');
			try {
				fs.accessSync(mainJsonl.fsPath);
				// Directory exists from a previous run — this is a resumed session
				session.hasOwnSpans = true;
				session.dirEnsured = true;

				// Determine the run index: read the max rIdx from the existing file + 1
				try {
					const tail = this._readTailBytes(mainJsonl.fsPath, 8192);
					let maxRIdx = 0;
					for (const line of tail.split('\n')) {
						if (!line.trim()) { continue; }
						try {
							const parsed = JSON.parse(line);
							if (typeof parsed.rIdx === 'number' && parsed.rIdx > maxRIdx) {
								maxRIdx = parsed.rIdx;
							}
						} catch { /* skip malformed lines */ }
					}
					session.runIndex = maxRIdx + 1;
				} catch { /* file read failed — runIndex stays at 0, but that's safe since this is a back-compat path */ }

				// Find the next available indices for companion files to avoid
				// overwriting ones from the previous run. Single readdir + scan.
				try {
					for (const f of fs.readdirSync(session.sessionDir.fsPath)) {
						const spIdx = f.startsWith('system_prompt_') ? parseInt(f.slice(14), 10) : -1;
						if (spIdx >= session.systemPromptIndex) { session.systemPromptIndex = spIdx + 1; }
						const tIdx = f.startsWith('tools_') ? parseInt(f.slice(6), 10) : -1;
						if (tIdx >= session.toolsIndex) { session.toolsIndex = tIdx + 1; }
					}
				} catch { /* readdir failed — indices stay at 0 */ }
			} catch {
				// No existing directory — leave as is
			}
		}

		// Write system_prompt JSON when model or mode changes (before buffering so llm_request gets the file ref)
		if (opName === GenAiOperationName.CHAT) {
			const session = this._activeSessions.get(sessionId);
			if (session && session.hasOwnSpans && !session.parentSessionId) {
				const model = asString(span.attributes[GenAiAttr.REQUEST_MODEL])
					?? asString(span.attributes[GenAiAttr.RESPONSE_MODEL])
					?? 'unknown';
				const systemInstructions = asString(span.attributes[GenAiAttr.SYSTEM_INSTRUCTIONS]);
				if (systemInstructions) {
					const key = `${model}:${systemInstructions.length}`;
					if (key !== session.systemPromptKey) {
						const fileName = `system_prompt_${session.systemPromptIndex}.json`;
						session.systemPromptKey = key;
						session.systemPromptIndex++;
						session.currentSystemPromptFile = fileName;
						this._enqueueFileWrite(session, systemInstructions, fileName);
					}
				}
			}
		}

		if (entry) {
			// Attach current system prompt and tools file references to llm_request entries
			if (entry.type === 'llm_request') {
				const session = this._activeSessions.get(sessionId);
				if (session?.currentSystemPromptFile) {
					entry.attrs.systemPromptFile = session.currentSystemPromptFile;
				}
				if (session?.currentToolsFile) {
					entry.attrs.toolsFile = session.currentToolsFile;
				}
			}
			this._bufferEntry(sessionId, entry);
		}

		// Note: user_message events are captured in real-time via _onSpanEvent
		// (onDidEmitSpanEvent) to avoid duplicates, since span.events also
		// contains them after completion.

		// Extract agent_response from output messages (on chat spans)
		if (opName === GenAiOperationName.CHAT) {
			// Extract agent response summary from output messages
			if (outputMessages) {
				const reasoningContent = asString(span.attributes[CopilotChatAttr.REASONING_CONTENT]);
				this._bufferEntry(sessionId, {
					ts: span.endTime,
					dur: 0,
					sid: sessionId,
					type: 'agent_response',
					name: 'agent_response',
					spanId: `agent-msg-${span.spanId}`,
					parentSpanId: span.parentSpanId,
					status: 'ok',
					attrs: {
						response: truncate(outputMessages, MAX_ATTR_VALUE_LENGTH),
						...(reasoningContent ? { reasoning: truncate(reasoningContent, MAX_ATTR_VALUE_LENGTH) } : {}),
					},
				});
			}
		}
	}

	private _onSpanEvent(event: ISpanEventData): void {
		if (event.eventName === 'turn_start' || event.eventName === 'turn_end') {
			this._onTurnBoundaryEvent(event);
			return;
		}

		if (event.eventName === 'tools_available') {
			this._onToolsAvailableEvent(event);
			return;
		}

		if (event.eventName !== 'user_message') {
			return;
		}
		const content = event.attributes.content;
		if (!content || (typeof content === 'string' && !content.trim())) {
			return;
		}

		// If the event carries a session ID, route to that specific session
		const eventSessionId = event.attributes[CopilotChatAttr.CHAT_SESSION_ID];
		if (typeof eventSessionId === 'string') {
			// Ensure the session buffer exists so early events (before any span completes) are captured
			this._ensureSession(eventSessionId);
			this._bufferEntry(eventSessionId, {
				ts: event.timestamp,
				dur: 0,
				sid: eventSessionId,
				type: 'user_message',
				name: 'user_message',
				spanId: event.spanId,
				parentSpanId: event.parentSpanId,
				status: 'ok',
				attrs: {
					content: truncate(String(content), MAX_ATTR_VALUE_LENGTH),
				},
			});
			return;
		}

		// Fallback: try to inherit session from parent span before broadcasting
		const inheritedSessionId = event.parentSpanId ? this._spanSessionIndex.get(event.parentSpanId) : undefined;
		if (inheritedSessionId && this._activeSessions.has(inheritedSessionId)) {
			this._bufferEntry(inheritedSessionId, {
				ts: event.timestamp,
				dur: 0,
				sid: inheritedSessionId,
				type: 'user_message',
				name: 'user_message',
				spanId: event.spanId,
				parentSpanId: event.parentSpanId,
				status: 'ok',
				attrs: {
					content: truncate(String(content), MAX_ATTR_VALUE_LENGTH),
				},
			});
			return;
		}

		// Last resort: span events without chat_session_id — write to parent sessions that have their own spans
		const parentSessions = [...this._activeSessions.entries()]
			.filter(([, session]) => !session.parentSessionId && session.hasOwnSpans)
			.map(([id]) => id);
		if (parentSessions.length === 0) {
			return;
		}

		for (const sessionId of parentSessions) {
			const entry: IDebugLogEntry = {
				ts: event.timestamp,
				dur: 0,
				sid: sessionId,
				type: 'user_message',
				name: 'user_message',
				spanId: event.spanId,
				parentSpanId: event.parentSpanId,
				status: 'ok',
				attrs: {
					content: truncate(String(content), MAX_ATTR_VALUE_LENGTH),
				},
			};
			this._bufferEntry(sessionId, entry);
		}
	}

	private _onTurnBoundaryEvent(event: ISpanEventData): void {
		const type = event.eventName === 'turn_start' ? 'turn_start' : 'turn_end';
		const turnId = typeof event.attributes.turnId === 'string' ? event.attributes.turnId : String(event.attributes.turnId ?? '');
		const sessionId = typeof event.attributes[CopilotChatAttr.CHAT_SESSION_ID] === 'string'
			? event.attributes[CopilotChatAttr.CHAT_SESSION_ID] as string
			: (event.parentSpanId ? this._spanSessionIndex.get(event.parentSpanId) : undefined);

		if (!sessionId) {
			return;
		}

		// Ensure the session buffer exists so early turn events are captured
		this._ensureSession(sessionId);

		this._bufferEntry(sessionId, {
			ts: event.timestamp,
			dur: 0,
			sid: sessionId,
			type,
			name: `${type}:${turnId}`,
			spanId: `${type}-${event.spanId}-${turnId}`,
			parentSpanId: event.parentSpanId,
			status: 'ok',
			attrs: { turnId },
		});
	}

	private _onToolsAvailableEvent(event: ISpanEventData): void {
		const sessionId = typeof event.attributes[CopilotChatAttr.CHAT_SESSION_ID] === 'string'
			? event.attributes[CopilotChatAttr.CHAT_SESSION_ID] as string
			: (event.parentSpanId ? this._spanSessionIndex.get(event.parentSpanId) : undefined);

		if (!sessionId) {
			return;
		}

		// Do NOT create sessions from tools_available events — they can carry tool call IDs
		// (e.g., toolu_xxx, call_xxx) as conversation IDs, which are not valid session IDs.
		const session = this._activeSessions.get(sessionId);
		if (!session || session.parentSessionId) {
			return;
		}

		// If the session isn't promoted yet, cache the tools for later replay
		if (!session.hasOwnSpans) {
			const toolDefs = typeof event.attributes.toolDefinitions === 'string' ? event.attributes.toolDefinitions : undefined;
			if (toolDefs) {
				session.pendingToolDefs = toolDefs;
			}
			return;
		}

		const toolDefs = typeof event.attributes.toolDefinitions === 'string' ? event.attributes.toolDefinitions : undefined;
		if (!toolDefs) {
			return;
		}

		// Use the content length to detect changes. Different tool sets (from model
		// or mode switches) will have different lengths. A false negative (same length,
		// different content) just means we skip writing a redundant file — harmless.
		const key = `tools:${toolDefs.length}`;
		if (key !== session.toolsKey) {
			const fileName = `tools_${session.toolsIndex}.json`;
			session.toolsKey = key;
			session.toolsIndex++;
			session.currentToolsFile = fileName;
			this._enqueueFileWrite(session, toolDefs, fileName);
		}
	}

	// ── Core debug event handling (discovery, skill loading, etc.) ──

	private _onCoreDebugEvent(event: vscode.ChatDebugEvent): void {
		// Only capture discovery/generic events from core — tool calls, model turns,
		// and subagent invocations come from OTel spans which are the source of truth.
		if (!(event instanceof vscode.ChatDebugGenericEvent)) {
			return;
		}

		const timestamp = event.created.getTime();
		const eventId = event.id;
		const parentEventId = event.parentEventId;

		const entry: IDebugLogEntry = {
			ts: timestamp,
			dur: 0,
			sid: '',
			type: event.category === 'discovery' ? 'discovery' : 'generic',
			name: event.name,
			spanId: eventId ?? `core-${Date.now()}`,
			parentSpanId: parentEventId,
			status: event.level === vscode.ChatDebugLogLevel.Error ? 'error' : 'ok',
			attrs: {
				...(event.details ? { details: truncate(event.details, MAX_ATTR_VALUE_LENGTH) } : {}),
				...(event.category ? { category: event.category } : {}),
				source: 'core',
			},
		};

		// Core events may arrive before any session exists — cache and replay.
		// Cap the buffer to avoid unbounded growth over long-running sessions.
		if (this._pendingCoreEvents.length >= MAX_PENDING_CORE_EVENTS) {
			this._pendingCoreEvents.shift();
		}
		this._pendingCoreEvents.push(entry);
		// Only write to parent sessions that have their own spans
		for (const [sessionId, session] of this._activeSessions.entries()) {
			if (!session.parentSessionId && session.hasOwnSpans) {
				this._bufferEntry(sessionId, { ...entry, sid: sessionId });
			}
		}
	}

	// ── Span to entry conversion ──

	private _spanToEntry(span: ICompletedSpanData, sessionId: string): IDebugLogEntry | undefined {
		const opName = asString(span.attributes[GenAiAttr.OPERATION_NAME]);
		const duration = span.endTime - span.startTime;
		const isError = span.status.code === SpanStatusCode.ERROR;

		switch (opName) {
			case GenAiOperationName.EXECUTE_TOOL: {
				const toolName = asString(span.attributes[GenAiAttr.TOOL_NAME]) ?? span.name;
				return {
					ts: span.startTime,
					dur: duration,
					sid: sessionId,
					type: 'tool_call',
					name: toolName,
					spanId: span.spanId,
					parentSpanId: span.parentSpanId,
					status: isError ? 'error' : 'ok',
					attrs: {
						...(span.attributes[GenAiAttr.TOOL_CALL_ARGUMENTS] !== undefined
							? { args: truncate(String(span.attributes[GenAiAttr.TOOL_CALL_ARGUMENTS]), MAX_ATTR_VALUE_LENGTH) }
							: {}),
						...(span.attributes[GenAiAttr.TOOL_CALL_RESULT] !== undefined
							? { result: truncate(String(span.attributes[GenAiAttr.TOOL_CALL_RESULT]), MAX_ATTR_VALUE_LENGTH) }
							: {}),
						...(isError && span.status.message ? { error: span.status.message } : {}),
					},
				};
			}

			case GenAiOperationName.CHAT: {
				const model = asString(span.attributes[GenAiAttr.REQUEST_MODEL])
					?? asString(span.attributes[GenAiAttr.RESPONSE_MODEL])
					?? 'unknown';
				return {
					ts: span.startTime,
					dur: duration,
					sid: sessionId,
					type: 'llm_request',
					name: `chat:${model}`,
					spanId: span.spanId,
					parentSpanId: span.parentSpanId,
					status: isError ? 'error' : 'ok',
					attrs: {
						model,
						...(span.attributes[GenAiAttr.USAGE_INPUT_TOKENS] !== undefined
							? { inputTokens: asNumber(span.attributes[GenAiAttr.USAGE_INPUT_TOKENS]) }
							: {}),
						...(span.attributes[GenAiAttr.USAGE_OUTPUT_TOKENS] !== undefined
							? { outputTokens: asNumber(span.attributes[GenAiAttr.USAGE_OUTPUT_TOKENS]) }
							: {}),
						...(span.attributes[CopilotChatAttr.TIME_TO_FIRST_TOKEN] !== undefined
							? { ttft: asNumber(span.attributes[CopilotChatAttr.TIME_TO_FIRST_TOKEN]) }
							: {}),
						...(span.attributes[CopilotChatAttr.USER_REQUEST] !== undefined
							? { userRequest: String(span.attributes[CopilotChatAttr.USER_REQUEST]) }
							: {}),
						...(span.attributes[GenAiAttr.INPUT_MESSAGES] !== undefined
							? { inputMessages: String(span.attributes[GenAiAttr.INPUT_MESSAGES]) }
							: {}),
						...(span.attributes[GenAiAttr.REQUEST_MAX_TOKENS] !== undefined
							? { maxTokens: asNumber(span.attributes[GenAiAttr.REQUEST_MAX_TOKENS]) }
							: {}),
						...(span.attributes[GenAiAttr.REQUEST_TEMPERATURE] !== undefined
							? { temperature: asNumber(span.attributes[GenAiAttr.REQUEST_TEMPERATURE]) }
							: {}),
						...(span.attributes[GenAiAttr.REQUEST_TOP_P] !== undefined
							? { topP: asNumber(span.attributes[GenAiAttr.REQUEST_TOP_P]) }
							: {}),
						...(isError && span.status.message ? { error: span.status.message } : {}),
					},
				};
			}

			case GenAiOperationName.INVOKE_AGENT: {
				if (!span.parentSpanId) {
					return undefined; // Top-level agent spans are containers
				}
				const agentName = asString(span.attributes[GenAiAttr.AGENT_NAME]) ?? span.name;
				return {
					ts: span.startTime,
					dur: duration,
					sid: sessionId,
					type: 'subagent',
					name: agentName,
					spanId: span.spanId,
					parentSpanId: span.parentSpanId,
					status: isError ? 'error' : 'ok',
					attrs: {
						agentName,
						...(span.attributes[GenAiAttr.AGENT_DESCRIPTION] !== undefined
							? { description: truncate(String(span.attributes[GenAiAttr.AGENT_DESCRIPTION]), MAX_ATTR_VALUE_LENGTH) }
							: {}),
						...(isError && span.status.message ? { error: span.status.message } : {}),
					},
				};
			}

			case GenAiOperationName.CONTENT_EVENT:
			case 'core_event': {
				const name = asString(span.attributes[CopilotChatAttr.DEBUG_NAME]) ?? span.name;
				return {
					ts: span.startTime,
					dur: duration,
					sid: sessionId,
					type: 'generic',
					name,
					spanId: span.spanId,
					parentSpanId: span.parentSpanId,
					status: isError ? 'error' : 'ok',
					attrs: {
						...(span.attributes['copilot_chat.event_details'] !== undefined
							? { details: truncate(String(span.attributes['copilot_chat.event_details']), MAX_ATTR_VALUE_LENGTH) }
							: {}),
						...(span.attributes['copilot_chat.event_category'] !== undefined
							? { category: String(span.attributes['copilot_chat.event_category']) }
							: {}),
					},
				};
			}

			case GenAiOperationName.EXECUTE_HOOK: {
				const hookType = asString(span.attributes['copilot_chat.hook_type']) ?? span.name;
				return {
					ts: span.startTime,
					dur: duration,
					sid: sessionId,
					type: 'hook',
					name: hookType,
					spanId: span.spanId,
					parentSpanId: span.parentSpanId,
					status: isError ? 'error' : 'ok',
					attrs: {
						...(span.attributes['copilot_chat.hook_command'] !== undefined
							? { command: truncate(String(span.attributes['copilot_chat.hook_command']), MAX_ATTR_VALUE_LENGTH) }
							: {}),
						...(span.attributes['copilot_chat.hook_input'] !== undefined
							? { input: truncate(String(span.attributes['copilot_chat.hook_input']), MAX_ATTR_VALUE_LENGTH) }
							: {}),
						...(span.attributes['copilot_chat.hook_output'] !== undefined
							? { output: truncate(String(span.attributes['copilot_chat.hook_output']), MAX_ATTR_VALUE_LENGTH) }
							: {}),
						...(span.attributes['copilot_chat.hook_result_kind'] !== undefined
							? { resultKind: String(span.attributes['copilot_chat.hook_result_kind']) }
							: {}),
						...(isError && span.status.message ? { error: span.status.message } : {}),
					},
				};
			}

			default:
				return undefined;
		}
	}

	// ── Helpers ──

	/**
	 * Read the last `byteCount` bytes of a file synchronously.
	 * Used during session resume to determine the max rIdx without reading the entire file.
	 */
	private _readTailBytes(filePath: string, byteCount: number): string {
		const fd = fs.openSync(filePath, 'r');
		try {
			const stat = fs.fstatSync(fd);
			const start = Math.max(0, stat.size - byteCount);
			const buf = Buffer.alloc(Math.min(byteCount, stat.size));
			fs.readSync(fd, buf, 0, buf.length, start);
			return buf.toString('utf-8');
		} finally {
			fs.closeSync(fd);
		}
	}

	private _extractSessionId(span: ICompletedSpanData): string | undefined {
		return asString(span.attributes[CopilotChatAttr.CHAT_SESSION_ID])
			?? asString(span.attributes[GenAiAttr.CONVERSATION_ID])
			?? (span.parentSpanId ? this._spanSessionIndex.get(span.parentSpanId) : undefined);
	}

	private _bufferEntry(sessionId: string, entry: IDebugLogEntry): void {
		const session = this._activeSessions.get(sessionId);
		if (!session) {
			return;
		}
		let stamped = entry;
		// Stamp run index for restart scoping (omit when 0 to save bytes)
		if (session.runIndex > 0 && !stamped.rIdx) {
			stamped = { ...stamped, rIdx: session.runIndex };
		}
		session.buffer.push(JSON.stringify(stamped) + '\n');
		this._onDidEmitEntry.fire({ sessionId, entry: stamped });
	}

	async readEntries(sessionId: string): Promise<IDebugLogEntry[]> {
		const entries: IDebugLogEntry[] = [];
		await this.streamEntries(sessionId, entry => entries.push(entry));
		return entries;
	}

	async readTailEntries(sessionId: string, count: number): Promise<IDebugLogEntry[]> {
		const session = this._activeSessions.get(sessionId);
		const logPath = session?.uri ?? this.getLogPath(sessionId);
		let entries: IDebugLogEntry[] = [];

		if (logPath) {
			try {
				const stat = await fs.promises.stat(logPath.fsPath);
				// Start with a read size that should cover `count` entries.
				// Average JSONL entry is ~1-2KB, so count * 4KB is generous.
				const readSize = Math.min(stat.size, count * 4096);
				const startOffset = Math.max(0, stat.size - readSize);

				const fd = await fs.promises.open(logPath.fsPath, 'r');
				try {
					const buffer = Buffer.alloc(stat.size - startOffset);
					const { bytesRead } = await fd.read(buffer, 0, buffer.length, startOffset);

					const text = buffer.subarray(0, bytesRead).toString('utf-8');
					const lines = text.split('\n');
					// Skip the first line if we started mid-file (likely partial)
					const startIdx = startOffset > 0 ? 1 : 0;
					for (let i = startIdx; i < lines.length; i++) {
						if (!lines[i]) { continue; }
						try {
							entries.push(JSON.parse(lines[i]) as IDebugLogEntry);
						} catch { /* skip malformed */ }
					}
				} finally {
					await fd.close();
				}

				// Keep only the last `count` entries
				if (entries.length > count) {
					entries = entries.slice(-count);
				}
			} catch {
				// File may not exist — that's fine
			}
		}

		// Append unflushed buffer entries
		if (session) {
			for (const line of session.buffer) {
				try {
					entries.push(JSON.parse(line) as IDebugLogEntry);
				} catch { /* skip malformed */ }
			}
		}

		// Trim to the last `count` entries (file + buffer combined)
		if (entries.length > count) {
			entries = entries.slice(-count);
		}

		return entries;
	}

	async streamEntries(sessionId: string, onEntry: (entry: IDebugLogEntry) => void): Promise<void> {
		const session = this._activeSessions.get(sessionId);
		const logPath = session?.uri ?? this.getLogPath(sessionId);

		if (logPath) {
			try {
				await new Promise<void>((resolve, reject) => {
					const stream = fs.createReadStream(logPath.fsPath, { encoding: 'utf-8' });
					let partial = '';
					stream.on('data', (chunk) => {
						const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
						partial += text;
						const lines = partial.split('\n');
						// Last element may be a partial line — keep it for next chunk
						partial = lines.pop() ?? '';
						for (const line of lines) {
							if (!line) { continue; }
							try {
								onEntry(JSON.parse(line) as IDebugLogEntry);
							} catch { /* skip malformed */ }
						}
					});
					stream.on('end', () => {
						// Process any remaining partial line
						if (partial) {
							try {
								onEntry(JSON.parse(partial) as IDebugLogEntry);
							} catch { /* skip malformed */ }
						}
						resolve();
					});
					stream.on('error', reject);
				});
			} catch {
				// File may not exist — that's fine
			}
		}

		// Append unflushed buffer entries
		if (session) {
			for (const line of session.buffer) {
				try {
					onEntry(JSON.parse(line) as IDebugLogEntry);
				} catch { /* skip malformed */ }
			}
		}
	}

	private async _writeToFile(session: IActiveLogSession, content: string): Promise<void> {
		try {
			if (!session.dirEnsured) {
				await createDirectoryIfNotExists(this._fileSystemService, session.sessionDir);
				session.dirEnsured = true;
			}
			await fs.promises.appendFile(session.uri.fsPath, content, 'utf-8');
			session.bytesWritten += Buffer.byteLength(content, 'utf-8');
			if (session.bytesWritten > this._maxSessionLogBytes) {
				await this._truncateLogFile(session);
			}
		} catch (err) {
			this._logService.error('[ChatDebugFileLogger] Failed to write debug log entries', err);
		}
	}

	/**
	 * Truncate a log file to retain the newest portion (TRUNCATION_RETAIN_RATIO
	 * of the configured max size) using a streaming approach via a temp file
	 * to avoid loading the entire tail into memory.
	 */
	private async _truncateLogFile(session: IActiveLogSession): Promise<void> {
		try {
			const filePath = session.uri.fsPath;
			const stat = await fs.promises.stat(filePath);
			if (stat.size <= this._maxSessionLogBytes) {
				return;
			}

			const retainBytes = Math.floor(this._maxSessionLogBytes * TRUNCATION_RETAIN_RATIO);
			const skipBytes = stat.size - retainBytes;
			const fd = await fs.promises.open(filePath, 'r');
			try {
				// Read a small probe around the cut point to find the next newline
				const probe = Buffer.alloc(4096);
				const { bytesRead } = await fd.read(probe, 0, probe.length, skipBytes);
				const newlineIdx = probe.indexOf(0x0A, 0); // '\n'
				const cutOffset = skipBytes + (newlineIdx >= 0 && newlineIdx < bytesRead ? newlineIdx + 1 : 0);

				const tailSize = stat.size - cutOffset;
				if (tailSize <= 0) {
					await fd.close();
					return;
				}
				await fd.close();

				// Stream the tail to a temp file, then rename over the original.
				const tmpPath = filePath + '.tmp';
				await new Promise<void>((resolve, reject) => {
					const readStream = fs.createReadStream(filePath, { start: cutOffset });
					const writeStream = fs.createWriteStream(tmpPath);
					const onError = (err: Error) => {
						readStream.destroy();
						writeStream.destroy();
						reject(err);
					};
					readStream.on('error', onError);
					writeStream.on('error', onError);
					writeStream.on('finish', resolve);
					readStream.pipe(writeStream);
				});
				await fs.promises.rename(tmpPath, filePath);
				session.bytesWritten = tailSize;
				/* __GDPR__
					"chatDebugFileLogger.truncated" : {
						"owner": "vijayupadya",
						"comment": "A debug log file was truncated due to size limits",
						"previousSize": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "File size in bytes before truncation" },
						"retainedSize": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "File size in bytes after truncation" }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('chatDebugFileLogger.truncated', undefined, { previousSize: stat.size, retainedSize: tailSize });
			} catch (innerErr) {
				await fd.close().catch(() => { });
				// Clean up temp file if it exists
				await fs.promises.unlink(filePath + '.tmp').catch(() => { });
				throw innerErr;
			}
		} catch (err) {
			this._logService.warn(`[ChatDebugFileLogger] Failed to truncate log file: ${err}`);
			/* __GDPR__
				"chatDebugFileLogger.truncateFailed" : {
					"owner": "vijayupadya",
					"comment": "Failed to truncate a debug log file"
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('chatDebugFileLogger.truncateFailed');
		}
	}

	private _autoFlushAll(): void {
		for (const sessionId of this._activeSessions.keys()) {
			this.flush(sessionId).catch(() => { });
		}
	}

	private _restartFlushTimer(): void {
		if (this._autoFlushTimer) {
			clearInterval(this._autoFlushTimer);
			this._autoFlushTimer = undefined;
		}
		if (this._activeSessions.size > 0) {
			this._autoFlushTimer = setInterval(() => this._autoFlushAll(), this._autoFlushIntervalMs);
		}
	}

	private async _cleanupOldLogs(): Promise<void> {
		const dir = this._getDebugLogsDir();
		if (!dir) {
			return;
		}

		const startTime = Date.now();
		try {
			const entries = await this._fileSystemService.readDirectory(dir);
			// Count both directories (new format) and legacy .jsonl files (old format)
			const sessionEntries = entries.filter(([name, type]) =>
				(type === 2 /* FileType.Directory */) ||
				(name.endsWith('.jsonl') && type === 1 /* FileType.File */)
			);

			const configuredMax = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ChatDebugFileLoggingMaxRetainedSessionLogs, this._experimentationService);
			const maxRetainedSessionLogs = Number.isFinite(configuredMax) && configuredMax >= 1 ? Math.trunc(configuredMax) : DEFAULT_MAX_RETAINED_LOGS;
			if (sessionEntries.length <= maxRetainedSessionLogs) {
				/* __GDPR__
					"chatDebugFileLogger.cleanupOldLogs" : {
						"owner": "vijayupadya",
						"comment": "Old debug log files were cleaned up",
						"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in ms to perform cleanup" },
						"entryCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Total number of log entries found" },
						"deletedCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of log entries deleted" }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('chatDebugFileLogger.cleanupOldLogs', undefined, { durationMs: Date.now() - startTime, entryCount: sessionEntries.length, deletedCount: 0 });
				return;
			}

			const entryStats = await Promise.all(
				sessionEntries.map(async ([name, type]) => {
					const entryUri = URI.joinPath(dir, name);
					const sessionIdFromEntry = name.replace('.jsonl', '');
					try {
						const stat = await this._fileSystemService.stat(entryUri);
						return { name, uri: entryUri, mtime: stat.mtime, sessionId: sessionIdFromEntry, isDir: type === 2 };
					} catch {
						return { name, uri: entryUri, mtime: 0, sessionId: sessionIdFromEntry, isDir: type === 2 };
					}
				}),
			);

			entryStats.sort((a, b) => a.mtime - b.mtime);

			const toDelete = entryStats.length - maxRetainedSessionLogs;
			let deleted = 0;
			for (const entry of entryStats) {
				if (deleted >= toDelete) {
					break;
				}
				if (this._activeSessions.has(entry.sessionId)) {
					continue;
				}
				try {
					await this._fileSystemService.delete(entry.uri, { recursive: true });
					deleted++;
				} catch {
					this._logService.warn(`[ChatDebugFileLogger] Failed to delete old debug log: ${entry.name}`);
				}
			}
			// GDPR comment above covers this event
			this._telemetryService.sendMSFTTelemetryEvent('chatDebugFileLogger.cleanupOldLogs', undefined, { durationMs: Date.now() - startTime, entryCount: sessionEntries.length, deletedCount: deleted });
		} catch {
			// Directory may not exist yet
		}
	}
}

/**
 * Contribution that eagerly instantiates the ChatDebugFileLoggerService
 * so it starts listening to OTel events at activation time.
 */
export class ChatDebugFileLoggerContribution implements IExtensionContribution {
	public readonly id = 'chatDebugFileLoggerContribution';

	constructor(
		@IChatDebugFileLoggerService _service: IChatDebugFileLoggerService,
	) {
		// The DI resolution of IChatDebugFileLoggerService triggers
		// construction of the singleton, which subscribes to events.
	}
}

function asString(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
	return typeof v === 'number' ? v : undefined;
}

function truncate(s: string, maxLen: number): string {
	return s.length > maxLen ? s.slice(0, maxLen) + '[truncated]' : s;
}
