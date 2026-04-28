/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import type { IChatDebugFileLoggerService, IDebugLogEntry } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import type { ISessionStore, SessionRow, TurnRow, FileRow, RefRow } from '../../../../platform/chronicle/common/sessionStore';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { reindexSessions } from '../sessionReindexer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<IDebugLogEntry>): IDebugLogEntry {
	return {
		ts: Date.now(),
		dur: 0,
		sid: 'session-1',
		type: 'generic',
		name: '',
		spanId: 'span-1',
		status: 'ok',
		attrs: {},
		...overrides,
	};
}

interface MockSessionStore extends ISessionStore {
	upsertedSessions: SessionRow[];
	insertedTurns: TurnRow[];
	insertedFiles: FileRow[];
	insertedRefs: RefRow[];
	existingSessions: Set<string>;
}

function createMockStore(): MockSessionStore {
	const mock: MockSessionStore = {
		_serviceBrand: undefined as any,
		upsertedSessions: [] as SessionRow[],
		insertedTurns: [] as TurnRow[],
		insertedFiles: [] as FileRow[],
		insertedRefs: [] as RefRow[],
		existingSessions: new Set<string>(),

		getPath: () => '/tmp/test.db',
		upsertSession: (s: SessionRow) => mock.upsertedSessions.push(s),
		insertTurn: (t: TurnRow) => mock.insertedTurns.push(t),
		insertCheckpoint: () => { },
		insertFile: (f: FileRow) => mock.insertedFiles.push(f),
		insertRef: (r: RefRow) => mock.insertedRefs.push(r),
		indexWorkspaceArtifact: () => { },
		search: () => [],
		getSession: (id: string) => mock.existingSessions.has(id) ? { id } as SessionRow : undefined,
		getTurns: () => [],
		getFiles: () => [],
		getRefs: () => [],
		getMaxTurnIndex: () => -1,
		getStats: () => ({ sessions: 0, turns: 0, checkpoints: 0, files: 0, refs: 0 }),
		executeReadOnly: () => [],
		executeReadOnlyFallback: () => [],
		runInTransaction: (fn: () => void) => fn(),
		close: () => { },
	};
	return mock;
}

function createMockDebugLogService(
	sessionIds: string[],
	entriesMap: Map<string, IDebugLogEntry[]>,
): IChatDebugFileLoggerService {
	return {
		_serviceBrand: undefined as any,
		listSessionIds: async () => sessionIds,
		streamEntries: async (sessionId: string, onEntry: (entry: IDebugLogEntry) => void) => {
			const entries = entriesMap.get(sessionId) ?? [];
			for (const entry of entries) {
				onEntry(entry);
			}
		},
		// Stubs for unused methods
		startSession: async () => { },
		startChildSession: () => { },
		registerSpanSession: () => { },
		endSession: async () => { },
		flush: async () => { },
		getLogPath: () => undefined,
		getSessionDir: () => undefined,
		getActiveSessionIds: () => [],
		isDebugLogUri: () => false,
		getSessionDirForResource: () => undefined,
		setModelSnapshot: () => { },
		debugLogsDir: undefined,
		onDidEmitEntry: undefined as any,
		readEntries: async () => [],
		readTailEntries: async () => [],
	} as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('reindexSessions', () => {
	it('processes a session with user + assistant turns', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({ type: 'session_start', name: 'session_start', sid: 'session-1', attrs: { cwd: '/workspace' } }),
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-1', attrs: { content: 'Fix the bug' } }),
			makeEntry({ type: 'agent_response', name: 'agent_response', sid: 'session-1', attrs: { response: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'I fixed the bug by changing X' }] }]) } }),
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-1', attrs: { content: 'Now add tests' } }),
			makeEntry({ type: 'agent_response', name: 'agent_response', sid: 'session-1', attrs: { response: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'Added tests for X' }] }]) } }),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();
		const progress = vi.fn();

		const result = await reindexSessions(store, debugLog, progress, cts.token);

		expect(result).toEqual({ processed: 1, skipped: 0, cancelled: false });
		expect(store.upsertedSessions).toHaveLength(1);
		expect(store.upsertedSessions[0].cwd).toBe('/workspace');
		expect(store.insertedTurns).toHaveLength(2);
		expect(store.insertedTurns[0].user_message).toBe('Fix the bug');
		expect(store.insertedTurns[0].assistant_response).toBe('I fixed the bug by changing X');
		expect(store.insertedTurns[1].user_message).toBe('Now add tests');
		expect(store.insertedTurns[1].assistant_response).toBe('Added tests for X');
	});

	it('extracts file paths from tool_call events', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({ type: 'tool_call', name: 'read_file', sid: 'session-1', attrs: { args: JSON.stringify({ filePath: '/src/foo.ts', startLine: 1, endLine: 10 }) } }),
			makeEntry({ type: 'tool_call', name: 'create_file', sid: 'session-1', attrs: { args: JSON.stringify({ filePath: '/src/bar.ts', content: '// new' }) } }),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(store.insertedFiles).toHaveLength(2);
		expect(store.insertedFiles[0].file_path).toBe('/src/foo.ts');
		expect(store.insertedFiles[1].file_path).toBe('/src/bar.ts');
	});

	it('extracts refs from GitHub MCP tool calls', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({
				type: 'tool_call',
				name: 'mcp_github_pull_request_read',
				sid: 'session-1',
				attrs: { args: JSON.stringify({ owner: 'microsoft', repo: 'vscode', pullNumber: 42 }) },
			}),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(store.insertedRefs).toHaveLength(1);
		expect(store.insertedRefs[0]).toEqual(expect.objectContaining({ ref_type: 'pr', ref_value: '42' }));
		expect(store.upsertedSessions[0].repository).toBe('microsoft/vscode');
	});

	it('extracts refs from terminal tool calls', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({
				type: 'tool_call',
				name: 'run_in_terminal',
				sid: 'session-1',
				attrs: {
					args: JSON.stringify({ command: 'gh pr create --title "Fix" --body "desc"' }),
					result: 'https://github.com/microsoft/vscode/pull/123',
				},
			}),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(store.insertedRefs).toHaveLength(1);
		expect(store.insertedRefs[0]).toEqual(expect.objectContaining({ ref_type: 'pr', ref_value: '123' }));
	});

	it('skips already-indexed sessions unless force=true', async () => {
		const store = createMockStore();
		store.existingSessions.add('session-1');
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-1', attrs: { content: 'hello' } }),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		// Default: skip
		const result = await reindexSessions(store, debugLog, vi.fn(), cts.token);
		expect(result).toEqual({ processed: 0, skipped: 1, cancelled: false });
		expect(store.insertedTurns).toHaveLength(0);

		// Force: process
		const result2 = await reindexSessions(store, debugLog, vi.fn(), cts.token, true);
		expect(result2.processed).toBe(1);
	});

	it('respects cancellation token', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [makeEntry({ type: 'session_start', name: 'session_start', sid: 'session-1' })]);
		entries.set('session-2', [makeEntry({ type: 'session_start', name: 'session_start', sid: 'session-2' })]);

		const debugLog = createMockDebugLogService(['session-1', 'session-2'], entries);
		const cts = new CancellationTokenSource();

		// Cancel immediately
		cts.cancel();

		const result = await reindexSessions(store, debugLog, vi.fn(), cts.token);
		expect(result.cancelled).toBe(true);
		expect(result.processed).toBe(0);
	});

	it('skips corrupt sessions and continues', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-good', [
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-good', attrs: { content: 'hello' } }),
			makeEntry({ type: 'agent_response', name: 'agent_response', sid: 'session-good', attrs: { response: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'hi' }] }]) } }),
		]);

		// Create a debug log service where session-bad throws
		const debugLog = createMockDebugLogService(['session-bad', 'session-good'], entries);
		const originalStream = debugLog.streamEntries.bind(debugLog);
		(debugLog as any).streamEntries = async (sessionId: string, onEntry: any) => {
			if (sessionId === 'session-bad') {
				throw new Error('corrupt file');
			}
			return originalStream(sessionId, onEntry);
		};

		const cts = new CancellationTokenSource();
		const result = await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(result.processed).toBe(1);
		expect(result.skipped).toBe(1);
		expect(store.insertedTurns).toHaveLength(1);
	});

	it('truncates long user messages and assistant responses', async () => {
		const store = createMockStore();
		const longUserMsg = 'a'.repeat(200);
		const longAssistantMsg = 'b'.repeat(2000);
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-1', attrs: { content: longUserMsg } }),
			makeEntry({ type: 'agent_response', name: 'agent_response', sid: 'session-1', attrs: { response: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: longAssistantMsg }] }]) } }),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(store.insertedTurns[0].user_message!.length).toBeLessThanOrEqual(100);
		expect(store.insertedTurns[0].assistant_response!.length).toBeLessThanOrEqual(1000);
	});

	it('handles sessions with no session_start event', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-1', attrs: { content: 'hello' } }),
			makeEntry({ type: 'agent_response', name: 'agent_response', sid: 'session-1', attrs: { response: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'hi' }] }]) } }),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(store.upsertedSessions).toHaveLength(1);
		expect(store.upsertedSessions[0].id).toBe('session-1');
		expect(store.upsertedSessions[0].host_type).toBe('vscode');
	});

	it('handles trailing user message without assistant response', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-1', attrs: { content: 'hello' } }),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(store.insertedTurns).toHaveLength(1);
		expect(store.insertedTurns[0].user_message).toBe('hello');
		expect(store.insertedTurns[0].assistant_response).toBeUndefined();
	});

	it('reports progress for each session', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('s1', [makeEntry({ type: 'session_start', name: 'session_start', sid: 's1' })]);
		entries.set('s2', [makeEntry({ type: 'session_start', name: 'session_start', sid: 's2' })]);

		const debugLog = createMockDebugLogService(['s1', 's2'], entries);
		const cts = new CancellationTokenSource();
		const progress = vi.fn();

		await reindexSessions(store, debugLog, progress, cts.token);

		expect(progress).toHaveBeenCalledTimes(2);
	});

	it('sets summary from first user message', async () => {
		const store = createMockStore();
		const entries = new Map<string, IDebugLogEntry[]>();
		entries.set('session-1', [
			makeEntry({ type: 'user_message', name: 'user_message', sid: 'session-1', attrs: { content: 'Implement a login page' } }),
			makeEntry({ type: 'agent_response', name: 'agent_response', sid: 'session-1', attrs: { response: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'Done' }] }]) } }),
		]);

		const debugLog = createMockDebugLogService(['session-1'], entries);
		const cts = new CancellationTokenSource();

		await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(store.upsertedSessions[0].summary).toBe('Implement a login page');
	});

	it('returns empty result for no sessions', async () => {
		const store = createMockStore();
		const debugLog = createMockDebugLogService([], new Map());
		const cts = new CancellationTokenSource();

		const result = await reindexSessions(store, debugLog, vi.fn(), cts.token);

		expect(result).toEqual({ processed: 0, skipped: 0, cancelled: false });
	});
});
