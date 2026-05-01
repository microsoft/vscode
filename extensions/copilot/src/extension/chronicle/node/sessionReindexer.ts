/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { IChatDebugFileLoggerService, IDebugLogEntry } from '../../../platform/chat/common/chatDebugFileLoggerService';
import type { ISessionStore, SessionRow, TurnRow, FileRow, RefRow } from '../../../platform/chronicle/common/sessionStore';
import type { CancellationToken } from '../../../util/vs/base/common/cancellation';
import type { SessionEvent } from '../common/cloudSessionTypes';
import type { CloudSessionApiClient } from './cloudSessionApiClient';
import type { CloudSessionIdStore } from './cloudSessionIdStore';
import { createSessionTranslationState, translateDebugLogEntry, makeShutdownEvent } from '../common/eventTranslator';
import { filterSecretsFromObj } from '../common/secretFilter';
import {
	MAX_ASSISTANT_RESPONSE_LENGTH,
	MAX_SUMMARY_LENGTH,
	MAX_USER_MESSAGE_LENGTH,
	extractAssistantResponse,
	extractFilePath,
	extractPlainTextFromContent,
	extractRefsFromMcpTool,
	extractRefsFromTerminal,
	extractRepoFromMcpTool,
	isGitHubMcpTool,
	isTerminalTool,
	truncateForStore,
} from '../common/sessionStoreTracking';

/**
 * Result of a reindex operation.
 */
export interface ReindexResult {
	/** Number of sessions successfully processed. */
	processed: number;
	/** Number of sessions skipped (already indexed or errors). */
	skipped: number;
	/** Whether the operation was cancelled. */
	cancelled: boolean;
}

/**
 * Per-session write buffer. Allocated per-session, freed after the transaction commits.
 * Bounded by the number of events in a single session.
 */
interface PerSessionWriteBuffer {
	session: SessionRow | undefined;
	turns: TurnRow[];
	files: FileRow[];
	refs: RefRow[];
}

/**
 * Safely parse JSON from a string attribute. Returns undefined on failure.
 */
function tryParseArgs(raw: string | number | boolean | undefined): unknown {
	if (typeof raw !== 'string') {
		return undefined;
	}
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

/**
 * Rebuild the local Chronicle session store by re-reading JSONL debug logs from disk.
 */
export async function reindexSessions(
	store: ISessionStore,
	debugLogService: IChatDebugFileLoggerService,
	reportProgress: (message: string) => void,
	token: CancellationToken,
	force: boolean = false,
): Promise<ReindexResult> {
	const sessionIds = await debugLogService.listSessionIds();

	let processed = 0;
	let skipped = 0;

	for (let i = 0; i < sessionIds.length; i++) {
		if (token.isCancellationRequested) {
			return { processed, skipped, cancelled: true };
		}

		const sessionId = sessionIds[i];

		// Fast-path: skip sessions already in the store unless force mode
		if (!force && store.getSession(sessionId)) {
			skipped++;
			continue;
		}

		reportProgress(l10n.t('Reindexing session {0} of {1}...', i + 1, sessionIds.length));

		try {
			await reindexOneSession(store, debugLogService, sessionId);
			processed++;
		} catch {
			// Non-fatal — skip corrupt/unreadable sessions
			skipped++;
		}

		// Yield to event loop between sessions to avoid blocking the extension host
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}

	return { processed, skipped, cancelled: false };
}

/**
 * Reindex a single session from its JSONL debug log.
 * Streams events, builds a bounded per-session buffer, and flushes atomically.
 */
async function reindexOneSession(
	store: ISessionStore,
	debugLogService: IChatDebugFileLoggerService,
	sessionId: string,
): Promise<void> {
	const buffer: PerSessionWriteBuffer = {
		session: undefined,
		turns: [],
		files: [],
		refs: [],
	};

	// State for turn pairing — tracks the pending user message to pair with next assistant response.
	let pendingUserMessage: string | undefined;
	let pendingUserTimestamp: string | undefined;
	let turnIndex = 0;

	await debugLogService.streamEntries(sessionId, (entry: IDebugLogEntry) => {
		processEntry(entry, sessionId, buffer, {
			get pendingUserMessage() { return pendingUserMessage; },
			set pendingUserMessage(v) { pendingUserMessage = v; },
			get pendingUserTimestamp() { return pendingUserTimestamp; },
			set pendingUserTimestamp(v) { pendingUserTimestamp = v; },
			get turnIndex() { return turnIndex; },
			set turnIndex(v) { turnIndex = v; },
		});
	});

	// If there's a trailing user message without a paired assistant response, flush it
	if (pendingUserMessage) {
		buffer.turns.push({
			session_id: sessionId,
			turn_index: turnIndex,
			user_message: truncateForStore(pendingUserMessage, MAX_USER_MESSAGE_LENGTH),
			timestamp: pendingUserTimestamp,
		});
	}

	// Ensure we always have a session row (even if no session_start event was found)
	if (!buffer.session) {
		buffer.session = { id: sessionId, host_type: 'vscode' };
	}

	// Flush all buffered data in a single transaction
	store.runInTransaction(() => {
		store.upsertSession(buffer.session!);

		for (const turn of buffer.turns) {
			store.insertTurn(turn);
		}
		for (const file of buffer.files) {
			store.insertFile(file);
		}
		for (const ref of buffer.refs) {
			store.insertRef(ref);
		}
	});

	// Help GC by clearing references — buffer is a local variable so this
	// is defensive; it becomes unreachable when the function returns.
	buffer.turns.length = 0;
	buffer.files.length = 0;
	buffer.refs.length = 0;
}

interface TurnPairingState {
	pendingUserMessage: string | undefined;
	pendingUserTimestamp: string | undefined;
	turnIndex: number;
}

/**
 * Process a single JSONL entry and update the per-session buffer.
 * This is the streaming callback — called once per line, no accumulation.
 */
function processEntry(
	entry: IDebugLogEntry,
	sessionId: string,
	buffer: PerSessionWriteBuffer,
	state: TurnPairingState,
): void {
	switch (entry.type) {
		case 'session_start':
			processSessionStart(entry, sessionId, buffer);
			break;
		case 'user_message':
		case 'turn_start':
			processUserMessage(entry, state);
			break;
		case 'agent_response':
			processAssistantResponse(entry, sessionId, buffer, state);
			break;
		case 'tool_call':
			processToolCall(entry, sessionId, buffer, state);
			break;
	}
}

function processSessionStart(
	entry: IDebugLogEntry,
	sessionId: string,
	buffer: PerSessionWriteBuffer,
): void {
	const attrs = entry.attrs;
	buffer.session = {
		id: sessionId,
		host_type: 'vscode',
		cwd: typeof attrs.cwd === 'string' ? attrs.cwd : undefined,
		repository: typeof attrs.repository === 'string' ? attrs.repository : undefined,
		branch: typeof attrs.branch === 'string' ? attrs.branch : undefined,
		created_at: new Date(entry.ts).toISOString(),
	};
}

function processUserMessage(
	entry: IDebugLogEntry,
	state: TurnPairingState,
): void {
	const content = typeof entry.attrs.content === 'string'
		? entry.attrs.content
		: typeof entry.attrs.userRequest === 'string'
			? entry.attrs.userRequest
			: undefined;
	if (content) {
		state.pendingUserMessage = content;
		state.pendingUserTimestamp = new Date(entry.ts).toISOString();
	}
}

function processAssistantResponse(
	entry: IDebugLogEntry,
	sessionId: string,
	buffer: PerSessionWriteBuffer,
	state: TurnPairingState,
): void {
	// Extract assistant response from the 'response' attribute (as written by chatDebugFileLoggerService)
	const responseRaw = entry.attrs.response as string | undefined;
	const assistantResponse = extractAssistantResponse(responseRaw);

	// Only create a turn if we have at least a user message or assistant response
	if (!state.pendingUserMessage && !assistantResponse) {
		return;
	}

	buffer.turns.push({
		session_id: sessionId,
		turn_index: state.turnIndex,
		user_message: truncateForStore(state.pendingUserMessage, MAX_USER_MESSAGE_LENGTH),
		assistant_response: truncateForStore(assistantResponse, MAX_ASSISTANT_RESPONSE_LENGTH),
		timestamp: state.pendingUserTimestamp ?? new Date(entry.ts).toISOString(),
	});

	// Use first user message as summary if not yet set
	if (!buffer.session?.summary && state.pendingUserMessage) {
		const summary = truncateForStore(extractPlainTextFromContent(state.pendingUserMessage), MAX_SUMMARY_LENGTH);
		if (!buffer.session) {
			buffer.session = { id: sessionId, host_type: 'vscode' };
		}
		buffer.session.summary = summary;
	}

	state.turnIndex++;
	state.pendingUserMessage = undefined;
	state.pendingUserTimestamp = undefined;
}

function processToolCall(
	entry: IDebugLogEntry,
	sessionId: string,
	buffer: PerSessionWriteBuffer,
	state: TurnPairingState,
): void {
	const toolName = entry.name;
	const toolArgs = tryParseArgs(entry.attrs.args);
	const resultText = typeof entry.attrs.result === 'string' ? entry.attrs.result : undefined;

	// Extract file path
	const filePath = extractFilePath(toolName, toolArgs);
	if (filePath) {
		buffer.files.push({
			session_id: sessionId,
			file_path: filePath,
			tool_name: toolName,
			turn_index: state.turnIndex,
		});
	}

	// Extract refs from GitHub MCP tools
	if (isGitHubMcpTool(toolName)) {
		const refs = extractRefsFromMcpTool(toolName, toolArgs);
		for (const ref of refs) {
			buffer.refs.push({ session_id: sessionId, ...ref, turn_index: state.turnIndex });
		}

		const repo = extractRepoFromMcpTool(toolArgs);
		if (repo) {
			if (!buffer.session) {
				buffer.session = { id: sessionId, host_type: 'vscode' };
			}
			buffer.session.repository = repo;
		}
	}

	// Extract refs from terminal/shell tools
	if (isTerminalTool(toolName)) {
		const refs = extractRefsFromTerminal(toolArgs, resultText);
		for (const ref of refs) {
			buffer.refs.push({ session_id: sessionId, ...ref, turn_index: state.turnIndex });
		}
	}
}

// ── Cloud reindex ────────────────────────────────────────────────────────────────

/** Max events per upload batch. */
const MAX_EVENTS_PER_UPLOAD = 500;

/**
 * Result of the cloud reindex phase.
 */
export interface CloudReindexResult {
	/** Number of cloud sessions created. */
	created: number;
	/** Total number of events uploaded. */
	eventsUploaded: number;
	/** Number of sessions that failed cloud creation or upload. */
	failed: number;
	/** Number of sessions queued for analytics backfill. */
	backfillQueued: number;
	/** Whether the backfill API call failed. */
	backfillFailed?: boolean;
}

/**
 * Upload historical sessions to the cloud for sessions that lack a cloud
 * counterpart. Follows the CLI reindex pattern:
 *
 * 1. For each local session not in {@link cloudSessionIds}: create cloud
 *    session, stream JSONL entries, translate to cloud events, upload in
 *    batches of 500.
 * 2. After all sessions: single `backfillAnalytics()` call.
 *
 * All operations are non-blocking (yields between sessions) and bounded
 * in memory (events are flushed in batches, buffers cleared after upload).
 */
export async function reindexCloudSessions(
	cloudClient: CloudSessionApiClient,
	cloudSessionIds: CloudSessionIdStore,
	debugLogService: IChatDebugFileLoggerService,
	ownerId: number,
	repoId: number,
	indexingLevel: 'user' | 'repo_and_user',
	reportProgress: (message: string) => void,
	token: CancellationToken,
	isRepoExcluded?: (repoNwo: string) => boolean,
): Promise<CloudReindexResult> {
	const result: CloudReindexResult = {
		created: 0,
		eventsUploaded: 0,
		failed: 0,
		backfillQueued: 0,
	};

	await cloudSessionIds.load();
	const sessionIds = await debugLogService.listSessionIds();
	let processed = 0;

	for (const sessionId of sessionIds) {
		if (token.isCancellationRequested) {
			break;
		}

		// Skip sessions already synced to cloud
		if (cloudSessionIds.has(sessionId)) {
			processed++;
			continue;
		}

		processed++;
		if (processed % 10 === 0) {
			reportProgress(l10n.t('Cloud sync: {0}/{1} sessions scanned, {2} created...', processed, sessionIds.length, result.created));
		}

		try {
			await reindexOneCloudSession(sessionId, cloudClient, cloudSessionIds, debugLogService, ownerId, repoId, indexingLevel, result, isRepoExcluded);
		} catch {
			result.failed++;
		}

		// Yield to event loop between sessions
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}

	// Single bulk backfill call for all remote sessions
	if (!token.isCancellationRequested) {
		const backfillResult = await cloudClient.backfillAnalytics(indexingLevel);
		if (backfillResult.ok) {
			result.backfillQueued = backfillResult.sessionsQueued;
		} else {
			result.backfillFailed = true;
		}
	}

	return result;
}

/**
 * Process a single session for cloud reindex: create cloud session,
 * stream entries, translate, upload in batches.
 */
async function reindexOneCloudSession(
	sessionId: string,
	cloudClient: CloudSessionApiClient,
	cloudSessionIds: CloudSessionIdStore,
	debugLogService: IChatDebugFileLoggerService,
	ownerId: number,
	repoId: number,
	indexingLevel: 'user' | 'repo_and_user',
	result: CloudReindexResult,
	isRepoExcluded?: (repoNwo: string) => boolean,
): Promise<void> {
	// Stream entries, check repo exclusion, and translate to cloud events
	const state = createSessionTranslationState();
	const batch: SessionEvent[] = [];
	let sessionRepo: string | undefined;
	let excluded = false;

	await debugLogService.streamEntries(sessionId, (entry: IDebugLogEntry) => {
		// Extract repo from session_start for exclusion check
		if (entry.type === 'session_start' && typeof entry.attrs.repository === 'string') {
			sessionRepo = entry.attrs.repository;
			if (isRepoExcluded) {
				const nwo = extractNwoFromRepoString(sessionRepo);
				if (nwo && isRepoExcluded(nwo)) {
					excluded = true;
				}
			}
		}
		// Skip translation if repo is excluded
		if (excluded) {
			return;
		}
		const events = translateDebugLogEntry(entry, sessionId, state);
		for (const event of events) {
			batch.push(event);
		}
	});

	if (excluded) {
		batch.length = 0;
		return;
	}

	// Create cloud session
	const createResult = await cloudClient.createSession(ownerId, repoId, sessionId, indexingLevel);
	if (!createResult.ok || !createResult.response.task_id) {
		result.failed++;
		batch.length = 0;
		return;
	}

	const cloudSessionId = createResult.response.id;
	const cloudTaskId = createResult.response.task_id;

	// Add shutdown event
	if (state.started) {
		batch.push(makeShutdownEvent(state));
	}

	// Upload in batches
	let uploaded = 0;
	let uploadFailed = false;
	for (let i = 0; i < batch.length; i += MAX_EVENTS_PER_UPLOAD) {
		const chunk = batch.slice(i, i + MAX_EVENTS_PER_UPLOAD);
		const filtered = chunk.map(e => filterSecretsFromObj(e));
		const success = await cloudClient.submitSessionEvents(cloudSessionId, filtered);
		if (success) {
			uploaded += chunk.length;
		} else {
			uploadFailed = true;
			break;
		}
	}

	// Clear batch to release memory
	batch.length = 0;

	// Only persist IDs and count as created when all chunks uploaded successfully.
	// If upload failed, leave the session eligible for retry on next reindex.
	if (uploadFailed) {
		result.failed++;
	} else {
		cloudSessionIds.set(sessionId, { cloudSessionId, cloudTaskId });
		result.created++;
	}
	result.eventsUploaded += uploaded;
}

/**
 * Extract `owner/repo` from a repository string that may be a full URL
 * (e.g. `https://github.com/owner/repo.git`) or already `owner/repo`.
 */
function extractNwoFromRepoString(repo: string): string | undefined {
	// Already in owner/repo format
	if (/^[^/]+\/[^/]+$/.test(repo)) {
		return repo;
	}
	// URL format: extract from path
	try {
		const url = new URL(repo);
		const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[0]}/${parts[1]}`;
		}
	} catch {
		// Not a valid URL
	}
	return undefined;
}
