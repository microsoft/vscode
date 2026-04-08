/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as vscode from 'vscode';
import { IChatDebugFileLoggerService, IDebugLogEntry, sessionResourceToId } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Disposable, type IDisposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { IExtensionContribution } from '../../common/contributions';
import {
	debugLogEntryToDebugEvent,
	entryDedupKey,
	extractSessionId,
	resolveDebugLogEntry,
} from './otelSpanToChatDebugEvent';
import {
	parseResourceSpans,
	wrapInResourceSpans,
	type ChatDebugLogExport,
} from './otlpFormatConversion';

/**
 * Stateless ChatDebugLogProvider backed by JSONL files.
 *
 * Historical data: reads from JSONL via IChatDebugFileLoggerService.readEntries().
 * Live events: subscribes to IChatDebugFileLoggerService.onDidEmitEntry.
 * No in-memory span storage, no eviction, no compaction.
 */
export class OTelChatDebugLogProviderContribution extends Disposable implements IExtensionContribution {
	public readonly id = 'otelChatDebugLogProvider';

	/** Max entries to keep in the detail resolution cache */
	private static readonly MAX_ENTRY_CACHE = 1000;

	/** Currently active VS Code session ID */
	private _activeSessionId: string | undefined;

	/** Active progress callback for streaming events */
	private _activeProgress: vscode.Progress<vscode.ChatDebugEvent> | undefined;

	/** Track dedup keys already sent to prevent duplicates */
	private readonly _sentDedupKeys = new Set<string>();

	/** Per-session LRU cache of entries for detail resolution (only while panel is open) */
	private _activeEntryCache = new Map<string, IDebugLogEntry>();

	/** Imported sessions stored in memory (import is rare, sessions are small) */
	private readonly _importedSessions = new Map<string, IDebugLogEntry[]>();

	/** Map of child session IDs → scoped parent event ID for the active session.
	 *  Used by the live handler to route child entries under the correct parent node. */
	private readonly _activeChildSessions = new Map<string, string>();

	/** Whether to skip core-sourced events (discovery, generic with source=core).
	 *  True for live sessions (core already displays them), false for historical. */
	private _skipCoreEvents = true;

	/** Subscription to live entry events (disposed on panel close) */
	private _liveSubscription: IDisposable | undefined;

	constructor(
		@IChatDebugFileLoggerService private readonly _fileLogger: IChatDebugFileLoggerService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		if (!this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ChatDebugFileLogging, this._experimentationService)) {
			return;
		}

		// Register as the debug log provider (guard for proposed API availability)
		if (typeof vscode.chat?.registerChatDebugLogProvider !== 'function') {
			this._logService.info('[OTelDebug] Chat debug API not available, skipping registration');
			return;
		}

		try {
			this._register(vscode.chat.registerChatDebugLogProvider({
				provideChatDebugLog: (sessionResource, progress, token) =>
					this._provideChatDebugLog(sessionResource, progress, token),
				resolveChatDebugLogEvent: (eventId, token) =>
					this._resolveChatDebugLogEvent(eventId, token),
				provideChatDebugLogExport: (sessionResource, options, token) =>
					this._provideChatDebugLogExport(sessionResource, options, token),
				resolveChatDebugLogImport: (data, token) =>
					this._resolveChatDebugLogImport(data, token),
			}));
		} catch (e) {
			this._logService.warn(`[OTelDebug] Failed to register debug log provider: ${e}`);
		}
	}

	/**
	 * Scope an event's IDs with the current run index to prevent collisions
	 * across VS Code restarts (OTel resets its span counter on restart).
	 */
	private _scopeEventIds(evt: vscode.ChatDebugEvent, runIndex: number): void {
		if (runIndex === 0) { return; } // First run — no suffix needed
		const suffix = `:r${runIndex}`;
		const evtWithId = evt as { id?: string; parentEventId?: string };
		if (evtWithId.id) { evtWithId.id += suffix; }
		if (evtWithId.parentEventId) { evtWithId.parentEventId += suffix; }
	}

	private _streamEvent(evt: vscode.ChatDebugEvent, dedupKey?: string): void {
		if (!this._activeProgress) { return; }
		if (dedupKey) {
			if (this._sentDedupKeys.has(dedupKey)) { return; }
			this._sentDedupKeys.add(dedupKey);
		}
		this._activeProgress.report(evt);
	}

	/**
	 * Add an entry to the detail resolution cache with LRU eviction.
	 */
	private _cacheEntry(evtId: string, entry: IDebugLogEntry): void {
		// Delete + re-insert to move to end (most recently used)
		this._activeEntryCache.delete(evtId);
		this._activeEntryCache.set(evtId, entry);
		// Evict oldest entries if over cap
		if (this._activeEntryCache.size > OTelChatDebugLogProviderContribution.MAX_ENTRY_CACHE) {
			const excess = this._activeEntryCache.size - OTelChatDebugLogProviderContribution.MAX_ENTRY_CACHE;
			const iter = this._activeEntryCache.keys();
			for (let i = 0; i < excess; i++) {
				this._activeEntryCache.delete(iter.next().value!);
			}
		}
	}

	private async _provideChatDebugLog(
		sessionResource: vscode.Uri,
		progress: vscode.Progress<vscode.ChatDebugEvent>,
		token: vscode.CancellationToken,
	): Promise<vscode.ChatDebugEvent[]> {
		const sessionId = sessionResourceToId(sessionResource);

		// Set this as the active session
		this._activeProgress = progress;
		this._activeSessionId = sessionId;
		this._sentDedupKeys.clear();
		this._activeEntryCache.clear();
		this._activeChildSessions.clear();
		// For live sessions, core already displays discovery/customization events.
		// For historical sessions, we need to render them from JSONL.
		this._skipCoreEvents = this._fileLogger.getActiveSessionIds().includes(sessionId);

		// Clean up on cancellation
		token.onCancellationRequested(() => {
			if (this._activeSessionId === sessionId) {
				this._activeProgress = undefined;
				this._activeSessionId = undefined;
				this._activeEntryCache.clear();
				this._sentDedupKeys.clear();
				this._activeChildSessions.clear();
				this._liveSubscription?.dispose();
				this._liveSubscription = undefined;
			}
		});

		// Subscribe to live events from the file logger bridge
		this._liveSubscription?.dispose();
		this._liveSubscription = this._fileLogger.onDidEmitEntry(({ sessionId: sid, entry }) => {
			// Accept entries from the active parent session OR a known child session
			const childParentId = this._activeChildSessions.get(sid);
			if (sid !== this._activeSessionId && !childParentId) { return; }

			// Entries from a child session: reparent under the child_session_ref node
			if (childParentId) {
				const evt = debugLogEntryToDebugEvent(entry, this._skipCoreEvents);
				if (evt) {
					this._scopeEventIds(evt, entry.rIdx ?? 0);
					if ('parentEventId' in evt) {
						(evt as { parentEventId?: string }).parentEventId = childParentId;
					}
					const evtId = 'id' in evt ? (evt as { id?: string }).id : undefined;
					if (evtId) {
						this._cacheEntry(evtId, entry);
					}
					this._streamEvent(evt, entryDedupKey(entry));
				}
				return;
			}

			// Parent session entry
			const evt = debugLogEntryToDebugEvent(entry, this._skipCoreEvents);
			if (evt) {
				this._scopeEventIds(evt, entry.rIdx ?? 0);
				const evtId = 'id' in evt ? (evt as { id?: string }).id : undefined;
				if (evtId) {
					this._cacheEntry(evtId, entry);
				}
				this._streamEvent(evt, entryDedupKey(entry));
			}

			// When a child_session_ref arrives, register the child session
			// so subsequent live entries from it are routed here
			if (entry.type === 'child_session_ref' && evt) {
				const childSessionId = entry.attrs.childSessionId as string | undefined;
				if (childSessionId) {
					const parentRunIndex = entry.rIdx ?? 0;
					const scopedParentId = parentRunIndex > 0 ? `${entry.spanId}:r${parentRunIndex}` : entry.spanId;
					this._activeChildSessions.set(childSessionId, scopedParentId);
					// Also load any entries already written before we registered
					this._streamChildSessionEntries(childSessionId, scopedParentId, entry).catch(() => {
						// Expected for live scenarios — child file may not exist yet
					});
				}
			}
		});

		// Read historical entries — from imported cache or from JSONL on disk
		const startTime = Date.now();
		const importedEntries = this._importedSessions.get(sessionId);

		// For imported sessions, return all entries directly
		if (importedEntries) {
			return await this._processEntries(importedEntries, startTime);
		}

		// Read the latest entries from the tail of the JSONL file for fast initial load.
		// Remaining older entries are streamed in the background via progress.report().
		const INITIAL_TAIL_COUNT = 500;
		try {
			const tailEntries = await this._fileLogger.readTailEntries(sessionId, INITIAL_TAIL_COUNT);
			const events = await this._processEntries(tailEntries, startTime);

			// Background-stream the full file to backfill older events.
			// Core's addEvent uses binary-insert by timestamp, so older events
			// will be placed at the correct position in the tree/list.
			// Dedup keys prevent the tail entries from being reported twice.
			this._streamOlderEntries(sessionId, token);

			return events;
		} catch (err) {
			this._logService.error(`[OTelDebug] Error in _provideChatDebugLog: ${err}`);
			return [];
		}
	}

	/**
	 * Process a batch of entries: scope event IDs by run index, convert to events,
	 * cache for detail resolution, load child session entries, and mark as sent.
	 */
	private async _processEntries(entries: readonly IDebugLogEntry[], startTime: number): Promise<vscode.ChatDebugEvent[]> {
		const events: vscode.ChatDebugEvent[] = [];

		for (const entry of entries) {
			const dedupKey = entryDedupKey(entry);
			// Skip entries already sent by the live handler during the async tail read
			if (this._sentDedupKeys.has(dedupKey)) { continue; }

			const evt = debugLogEntryToDebugEvent(entry, this._skipCoreEvents);
			if (evt) {
				this._scopeEventIds(evt, entry.rIdx ?? 0);
				const evtId = 'id' in evt ? (evt as { id?: string }).id : undefined;
				if (evtId) {
					this._cacheEntry(evtId, entry);
				}
				events.push(evt);
			}
			this._sentDedupKeys.add(dedupKey);

			// When we see a non-filtered child_session_ref, load its child session's entries
			if (entry.type === 'child_session_ref' && evt) {
				const childSessionId = entry.attrs.childSessionId as string | undefined;
				if (childSessionId) {
					// Compute the scoped parent ID (with :rN suffix if applicable)
					const parentRunIndex = entry.rIdx ?? 0;
					const scopedParentId = parentRunIndex > 0 ? `${entry.spanId}:r${parentRunIndex}` : entry.spanId;
					// Register so the live handler routes future child entries here
					this._activeChildSessions.set(childSessionId, scopedParentId);
					try {
						const childEntries = await this._readChildEntries(entry);
						for (const childEntry of childEntries) {
							const childEvt = debugLogEntryToDebugEvent(childEntry, this._skipCoreEvents);
							if (childEvt) {
								this._scopeEventIds(childEvt, childEntry.rIdx ?? 0);
								// Set parent to the child_session_ref entry (with run-index scope)
								if ('parentEventId' in childEvt) {
									(childEvt as { parentEventId?: string }).parentEventId = scopedParentId;
								}
								const childEvtId = 'id' in childEvt ? (childEvt as { id?: string }).id : undefined;
								if (childEvtId) {
									this._cacheEntry(childEvtId, childEntry);
								}
								events.push(childEvt);
							}
							this._sentDedupKeys.add(entryDedupKey(childEntry));
						}
					} catch (err) {
						// Silent fail on child session read errors
					}
				}
			}
		}

		// Sort by timestamp
		events.sort((a, b) => {
			const aTime = 'created' in a ? (a as { created: Date }).created.getTime() : 0;
			const bTime = 'created' in b ? (b as { created: Date }).created.getTime() : 0;
			return aTime - bTime;
		});

		/* __GDPR__
			"otelDebug.convertEntriesToEvents" : {
				"owner": "vijayupadya",
				"comment": "Timing telemetry for converting JSONL entries to chat debug events",
				"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in ms to read and convert entries" },
				"entryCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of JSONL entries read" },
				"eventCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of output events" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('otelDebug.convertEntriesToEvents', undefined, {
			durationMs: Date.now() - startTime,
			entryCount: entries.length,
			eventCount: events.length,
		});

		return events;
	}

	/**
	 * Stream all entries from the JSONL file in the background, reporting
	 * older events that weren't included in the initial tail read via
	 * progress.report(). The dedup keys prevent double-reporting entries
	 * that were already returned in the initial batch.
	 */
	private _streamOlderEntries(sessionId: string, token: vscode.CancellationToken): void {
		const childRefs: { childSessionId: string; scopedParentId: string }[] = [];

		this._fileLogger.streamEntries(sessionId, entry => {
			if (token.isCancellationRequested) { return; }

			const dedupKey = entryDedupKey(entry);
			if (this._sentDedupKeys.has(dedupKey)) { return; } // Already sent in tail batch

			const evt = debugLogEntryToDebugEvent(entry, this._skipCoreEvents);
			if (evt) {
				this._scopeEventIds(evt, entry.rIdx ?? 0);
				const evtId = 'id' in evt ? (evt as { id?: string }).id : undefined;
				if (evtId) {
					this._cacheEntry(evtId, entry);
				}
				this._streamEvent(evt, dedupKey);
			}

			// Collect non-filtered child_session_ref entries for post-stream loading
			if (entry.type === 'child_session_ref' && evt) {
				const childSessionId = entry.attrs.childSessionId as string | undefined;
				if (childSessionId) {
					const parentRunIndex = entry.rIdx ?? 0;
					const scopedParentId = parentRunIndex > 0 ? `${entry.spanId}:r${parentRunIndex}` : entry.spanId;
					childRefs.push({ childSessionId, scopedParentId });
					// Register so the live handler routes future child entries here
					this._activeChildSessions.set(childSessionId, scopedParentId);
				}
			}
		}).then(async () => {
			// Load child session entries that weren't already loaded by _processEntries
			for (const { childSessionId, scopedParentId } of childRefs) {
				if (token.isCancellationRequested) { break; }
				await this._streamChildSessionEntries(childSessionId, scopedParentId);
			}
		}).catch(() => { /* streaming failed — tail events are still shown */ });
	}

	/**
	 * Load entries from a child session and stream them to the debug panel,
	 * setting their parentEventId to the child_session_ref event.
	 * Dedup keys prevent double-reporting if entries were already sent.
	 */
	private async _streamChildSessionEntries(childSessionId: string, scopedParentId: string, childSessionRefEntry?: IDebugLogEntry): Promise<void> {
		try {
			const childEntries = childSessionRefEntry
				? await this._readChildEntries(childSessionRefEntry)
				: await this._fileLogger.readEntries(childSessionId);
			for (const childEntry of childEntries) {
				const childEvt = debugLogEntryToDebugEvent(childEntry, this._skipCoreEvents);
				if (childEvt) {
					this._scopeEventIds(childEvt, childEntry.rIdx ?? 0);
					if ('parentEventId' in childEvt) {
						(childEvt as { parentEventId?: string }).parentEventId = scopedParentId;
					}
					const childEvtId = 'id' in childEvt ? (childEvt as { id?: string }).id : undefined;
					if (childEvtId) {
						this._cacheEntry(childEvtId, childEntry);
					}
					this._streamEvent(childEvt, entryDedupKey(childEntry));
				}
			}
		} catch {
			// Silent fail on child session read errors
		}
	}

	/**
	 * Read entries from a child session file. Tries readEntries() first
	 * (which includes unflushed buffer entries for active sessions), then
	 * falls back to direct file read using the childLogFile attribute
	 * (for historical sessions where the child session mapping is lost).
	 */
	private async _readChildEntries(childSessionRefEntry: IDebugLogEntry): Promise<IDebugLogEntry[]> {
		const childSessionId = childSessionRefEntry.attrs.childSessionId as string | undefined;

		// Try readEntries first — handles active sessions with file + unflushed buffer
		if (childSessionId) {
			const entries = await this._fileLogger.readEntries(childSessionId);
			if (entries.length > 0) {
				return entries;
			}
		}

		// Fallback: direct file read using the known filename from the entry
		// (for historical sessions where _childSessionMap may be empty after restart)
		const childLogFile = childSessionRefEntry.attrs.childLogFile as string | undefined;
		const parentSessionId = childSessionRefEntry.sid;
		if (childLogFile) {
			const parentDir = this._fileLogger.getSessionDir(parentSessionId);
			if (parentDir) {
				const childFilePath = URI.joinPath(parentDir, childLogFile).fsPath;
				try {
					const entries: IDebugLogEntry[] = [];
					const stream = fs.createReadStream(childFilePath, { encoding: 'utf-8' });
					let remainder = '';
					await new Promise<void>((resolve, reject) => {
						stream.on('data', (chunk) => {
							remainder += String(chunk);
							const lines = remainder.split('\n');
							remainder = lines.pop()!;
							for (const line of lines) {
								if (!line.trim()) { continue; }
								try { entries.push(JSON.parse(line) as IDebugLogEntry); } catch { /* skip */ }
							}
						});
						stream.on('end', () => {
							if (remainder.trim()) {
								try { entries.push(JSON.parse(remainder) as IDebugLogEntry); } catch { /* skip */ }
							}
							resolve();
						});
						stream.on('error', reject);
					});
					return entries;
				} catch {
					// Expected for live scenarios — file hasn't been flushed yet.
					// The live handler will pick up child entries via _activeChildSessions.
				}
			}
		}

		return [];
	}

	private _resolveChatDebugLogEvent(
		eventId: string,
		_token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.ChatDebugResolvedEventContent> {
		const entry = this._activeEntryCache.get(eventId);
		if (entry) {
			// Touch for LRU: delete + re-insert moves to end
			this._activeEntryCache.delete(eventId);
			this._activeEntryCache.set(eventId, entry);
			return this._resolveEntry(entry);
		}

		// Cache miss — scan JSONL on disk to find the entry.
		// This happens when the entry was evicted from the LRU cache.
		if (this._activeSessionId) {
			const sessionId = this._activeSessionId;
			return this._findEntryOnDisk(sessionId, eventId).then(found => {
				if (found) {
					this._cacheEntry(eventId, found);
					return this._resolveEntry(found);
				}
				return undefined;
			});
		}
		return undefined;
	}

	private _resolveEntry(entry: IDebugLogEntry): vscode.ProviderResult<vscode.ChatDebugResolvedEventContent> {
		const sessionDir = this._fileLogger.getSessionDir(entry.sid);
		const readCompanionFile = sessionDir
			? async (fileName: string): Promise<string | undefined> => {
				// Validate fileName to prevent path traversal
				if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
					return undefined;
				}
				try {
					const fileUri = URI.joinPath(sessionDir, fileName);
					const raw = await fs.promises.readFile(fileUri.fsPath, 'utf-8');
					try {
						const parsed = JSON.parse(raw);
						return typeof parsed.content === 'string' ? parsed.content : raw;
					} catch {
						return raw;
					}
				} catch {
					return undefined;
				}
			}
			: undefined;
		return resolveDebugLogEntry(entry, readCompanionFile);
	}

	/**
	 * Scan the JSONL file on disk to find an entry by event ID.
	 * Used as a fallback when the entry was evicted from the LRU cache.
	 */
	private async _findEntryOnDisk(sessionId: string, eventId: string): Promise<IDebugLogEntry | undefined> {
		// The eventId may have a run suffix (e.g., "0000000000000001:r1").
		const runMatch = /:r(\d+)$/.exec(eventId);
		const rawSpanId = runMatch ? eventId.slice(0, runMatch.index) : eventId;
		const targetRunIndex = runMatch ? parseInt(runMatch[1], 10) : 0;

		let found: IDebugLogEntry | undefined;
		const childSessionIds: string[] = [];

		await this._fileLogger.streamEntries(sessionId, entry => {
			if (found) { return; }

			if (entry.spanId === rawSpanId && (entry.rIdx ?? 0) === targetRunIndex) {
				found = entry;
			}

			// Collect child session IDs for fallback search
			if (entry.type === 'child_session_ref') {
				const childSessionId = entry.attrs.childSessionId as string | undefined;
				if (childSessionId) {
					childSessionIds.push(childSessionId);
				}
			}
		});

		if (found) {
			return found;
		}

		// Search child session JSONL files
		for (const childSessionId of childSessionIds) {
			try {
				const childEntries = await this._fileLogger.readEntries(childSessionId);
				for (const childEntry of childEntries) {
					if (childEntry.spanId === rawSpanId && (childEntry.rIdx ?? 0) === targetRunIndex) {
						return childEntry;
					}
				}
			} catch {
				// Skip unreadable child sessions
			}
		}

		return undefined;
	}

	// ── Export / Import ──

	private async _provideChatDebugLogExport(
		sessionResource: vscode.Uri,
		options: vscode.ChatDebugLogExportOptions,
		_token: vscode.CancellationToken,
	): Promise<Uint8Array | undefined> {
		const sessionId = sessionResourceToId(sessionResource);

		// Read entries and convert to spans for OTLP export (backward compat)
		const entries = await this._fileLogger.readEntries(sessionId);

		// Convert core events to IDebugLogEntry-compatible entries.
		// Deduplicate against JSONL entries (file logger already captures core events).
		const existingSpanIds = new Set(entries.map(e => e.spanId));
		let coreIdx = 0;
		const coreEntries = options.coreEvents
			.filter(e => e instanceof vscode.ChatDebugGenericEvent)
			.filter(e => {
				const id = (e as vscode.ChatDebugGenericEvent).id;
				return !id || !existingSpanIds.has(id);
			})
			.map((e): IDebugLogEntry => {
				const ge = e as vscode.ChatDebugGenericEvent;
				return {
					ts: ge.created.getTime(),
					dur: 0,
					sid: sessionId,
					type: ge.category === 'discovery' ? 'discovery' : 'generic',
					name: ge.name,
					spanId: ge.id ?? `core-${Date.now()}-${coreIdx++}`,
					parentSpanId: ge.parentEventId,
					status: ge.level === vscode.ChatDebugLogLevel.Error ? 'error' : 'ok',
					attrs: {
						...(ge.details ? { details: ge.details } : {}),
						...(ge.category ? { category: ge.category } : {}),
						source: 'core',
					},
				};
			});

		const allEntries = [...entries, ...coreEntries];
		if (allEntries.length === 0) {
			this._logService.warn(`[OTelDebug] No entries found for session ${sessionId}`);
			return undefined;
		}

		// Convert entries to spans for OTLP format
		const spans = allEntries.map(entry => entryToExportSpan(entry));

		const otlpExport = wrapInResourceSpans(spans, {
			'service.name': 'copilot-chat',
			'session.id': sessionId,
		});

		const exportData: ChatDebugLogExport = {
			...otlpExport,
			copilotChat: {
				exportedAt: new Date().toISOString(),
				exporterVersion: '',
				sessionId,
				sessionTitle: options.sessionTitle ?? deriveSessionTitleFromEntries(allEntries),
			},
		};

		const json = JSON.stringify(exportData, null, 2);
		return new TextEncoder().encode(json);
	}

	private _resolveChatDebugLogImport(
		data: Uint8Array,
		_token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.ChatDebugLogImportResult> {
		try {
			const jsonString = new TextDecoder().decode(data);

			// Parse spans from OTLP format
			const spans = parseResourceSpans(jsonString);
			if (spans.length === 0) {
				this._logService.warn('[OTelDebug] No spans found in imported file');
				return undefined;
			}

			// Extract session ID and title
			let sourceSessionId: string | undefined;
			let sessionTitle: string | undefined;
			try {
				const parsed = JSON.parse(jsonString);
				sourceSessionId = parsed.copilotChat?.sessionId;
				sessionTitle = parsed.copilotChat?.sessionTitle;
			} catch { /* JSONL format — no top-level object */ }
			sourceSessionId ??= extractSessionId(spans[0]) ?? `imported-${Date.now()}`;
			sessionTitle ??= deriveSessionTitleFromSpans(spans);

			// Convert imported spans to IDebugLogEntry format and store in memory
			const importedSessionId = `import:${sourceSessionId}:${Date.now()}`;
			const entries: IDebugLogEntry[] = spans.map(span => spanToImportEntry(span, importedSessionId));
			this._importedSessions.set(importedSessionId, entries);

			const encoded = Buffer.from(importedSessionId).toString('base64');
			const uri = vscode.Uri.parse(`vscode-chat-session://imported/${encoded}`);
			return { uri, sessionTitle };
		} catch (err) {
			this._logService.error(`[OTelDebug] Failed to parse import file: ${err}`);
			return undefined;
		}
	}
}

// ── Helpers ──

import type { ICompletedSpanData } from '../../../platform/otel/common/otelService';

/**
 * Convert an IDebugLogEntry to a synthetic ICompletedSpanData for OTLP export.
 */
function entryToExportSpan(entry: IDebugLogEntry): ICompletedSpanData {
	const attributes: Record<string, string | number | boolean | string[]> = {};

	// Map entry type back to OTel operation name
	switch (entry.type) {
		case 'tool_call':
			attributes['gen_ai.operation.name'] = 'execute_tool';
			attributes['gen_ai.tool.name'] = entry.name;
			if (entry.attrs.args !== undefined) { attributes['gen_ai.tool.call.arguments'] = String(entry.attrs.args); }
			if (entry.attrs.result !== undefined) { attributes['gen_ai.tool.call.result'] = String(entry.attrs.result); }
			break;
		case 'llm_request':
			attributes['gen_ai.operation.name'] = 'chat';
			if (entry.attrs.model !== undefined) { attributes['gen_ai.request.model'] = String(entry.attrs.model); }
			if (entry.attrs.inputTokens !== undefined) { attributes['gen_ai.usage.input_tokens'] = entry.attrs.inputTokens as number; }
			if (entry.attrs.outputTokens !== undefined) { attributes['gen_ai.usage.output_tokens'] = entry.attrs.outputTokens as number; }
			break;
		case 'subagent':
			attributes['gen_ai.operation.name'] = 'invoke_agent';
			if (entry.attrs.agentName !== undefined) { attributes['gen_ai.agent.name'] = String(entry.attrs.agentName); }
			break;
		case 'hook':
			attributes['gen_ai.operation.name'] = 'execute_hook';
			break;
		case 'discovery':
		case 'generic':
			attributes['gen_ai.operation.name'] = 'core_event';
			if (entry.attrs.details !== undefined) { attributes['copilot_chat.event_details'] = String(entry.attrs.details); }
			if (entry.attrs.category !== undefined) { attributes['copilot_chat.event_category'] = String(entry.attrs.category); }
			break;
		default:
			attributes['gen_ai.operation.name'] = 'core_event';
			break;
	}

	return {
		name: entry.name,
		spanId: entry.spanId,
		traceId: 'exported-trace',
		parentSpanId: entry.parentSpanId,
		startTime: entry.ts,
		endTime: entry.ts + entry.dur,
		status: { code: entry.status === 'error' ? 2 : 0 },
		attributes,
		events: [],
	};
}

function deriveSessionTitleFromEntries(entries: readonly IDebugLogEntry[]): string | undefined {
	for (const entry of entries) {
		if (entry.type === 'user_message') {
			const content = entry.attrs.content;
			if (typeof content === 'string' && content.trim()) {
				const title = content.trim();
				return title.length > 80 ? title.slice(0, 80) + '...' : title;
			}
		}
	}
	return undefined;
}

function deriveSessionTitleFromSpans(spans: readonly ICompletedSpanData[]): string | undefined {
	for (const span of spans) {
		for (const event of span.events) {
			if (event.name === 'user_message') {
				const content = event.attributes?.content;
				if (typeof content === 'string' && content.trim()) {
					const title = content.trim();
					return title.length > 80 ? title.slice(0, 80) + '...' : title;
				}
			}
		}
	}
	return undefined;
}

/**
 * Convert an imported OTel span into an IDebugLogEntry for in-memory import cache.
 */
function spanToImportEntry(span: ICompletedSpanData, sessionId: string): IDebugLogEntry {
	const opName = (span.attributes['gen_ai.operation.name'] as string) ?? '';
	const duration = span.endTime - span.startTime;
	const isError = span.status.code === 2;

	let type: IDebugLogEntry['type'] = 'generic';
	const attrs: Record<string, string | number | boolean | undefined> = {};

	switch (opName) {
		case 'execute_tool':
			type = 'tool_call';
			if (span.attributes['gen_ai.tool.call.arguments'] !== undefined) { attrs.args = String(span.attributes['gen_ai.tool.call.arguments']); }
			if (span.attributes['gen_ai.tool.call.result'] !== undefined) { attrs.result = String(span.attributes['gen_ai.tool.call.result']); }
			break;
		case 'chat':
			type = 'llm_request';
			if (span.attributes['gen_ai.request.model'] !== undefined) { attrs.model = String(span.attributes['gen_ai.request.model']); }
			if (span.attributes['gen_ai.usage.input_tokens'] !== undefined) { attrs.inputTokens = span.attributes['gen_ai.usage.input_tokens'] as number; }
			if (span.attributes['gen_ai.usage.output_tokens'] !== undefined) { attrs.outputTokens = span.attributes['gen_ai.usage.output_tokens'] as number; }
			break;
		case 'invoke_agent':
			type = 'subagent';
			if (span.attributes['gen_ai.agent.name'] !== undefined) { attrs.agentName = String(span.attributes['gen_ai.agent.name']); }
			break;
		case 'execute_hook':
			type = 'hook';
			break;
		case 'core_event':
			type = (span.attributes['copilot_chat.event_category'] === 'discovery') ? 'discovery' : 'generic';
			if (span.attributes['copilot_chat.event_details'] !== undefined) { attrs.details = String(span.attributes['copilot_chat.event_details']); }
			if (span.attributes['copilot_chat.event_category'] !== undefined) { attrs.category = String(span.attributes['copilot_chat.event_category']); }
			break;
	}

	if (isError && span.status.message) { attrs.error = span.status.message; }

	return {
		ts: span.startTime,
		dur: duration,
		sid: sessionId,
		type,
		name: span.name,
		spanId: span.spanId,
		parentSpanId: span.parentSpanId,
		status: isError ? 'error' : 'ok',
		attrs,
	};
}
