/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SessionEvent } from '@github/copilot-sdk';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_CHAT_SEARCH_MAX_RESULTS, MAX_SESSION_SEARCH_QUERY_LENGTH, getAgentSessionSearchTerms, validateSessionSearchQuery } from '../../common/agentHostSessionSearch.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { searchCopilotSessionHistory as searchHistory } from '../../node/copilot/copilotSessionSearch.js';
import { SessionSearchDatabase } from '../../node/sessionSearchDatabase.js';
import { type ISessionEvent, toSessionEvents } from './copilotTestEvents.js';

type ReadPage = Parameters<typeof searchHistory>[3];
type ReadOptions = Parameters<ReadPage>[0];

function searchCopilotSessionHistory(databasePath: string, query: string, readPage: ReadPage, sourceKey = 'test-source') {
	const database = new SessionSearchDatabase(databasePath);
	return searchHistory({
		_serviceBrand: undefined,
		searchChat: (chat, text, readSource) => database.searchChat(chat, text, readSource),
		semanticSearch: (sessionUri, chatUris, request) => database.semanticSearch(sessionUri, chatUris, request),
	}, {
		harness: 'copilotcli',
		sessionUri: 'copilotcli:/session',
		chatUri: buildDefaultChatUri('copilotcli:/session'),
		storageUri: 'copilotcli:/session',
		sourceKey,
	}, query, readPage);
}

class TestHistory {
	readonly calls: ReadOptions[] = [];
	events: SessionEvent[];

	constructor(events: ISessionEvent[], private readonly pageSize = 500) {
		this.events = toSessionEvents(events).map((event, index) => ({ ...event, id: event.id ?? `event-${index}` }));
	}

	readonly readPage: ReadPage = async options => {
		this.calls.push(options);
		if (options.direction === 'backward') {
			return { events: this.events.slice(-options.max), cursor: `${this.events.length}`, hasMore: this.events.length > options.max, cursorStatus: 'ok' };
		}
		const start = Number(options.cursor ?? 0);
		const end = Math.min(this.events.length, start + Math.min(options.max, this.pageSize));
		return { events: this.events.slice(start, end), cursor: `${end}`, hasMore: end < this.events.length, cursorStatus: 'ok' };
	};
}

suite('Copilot persisted session search', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let directory: string;
	let databasePath: string;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'copilot-session-search-'));
		databasePath = join(directory, 'index', 'search.db');
	});

	teardown(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	if (!isWindows) {
		test('keeps the derived transcript index private to its owner', async () => {
			const history = new TestHistory([{ type: 'user.message', id: 'turn', data: { content: 'private content' } }]);
			await searchCopilotSessionHistory(databasePath, 'private', history.readPage);
			const [file, folder] = await Promise.all([stat(databasePath), stat(join(directory, 'index'))]);
			assert.deepStrictEqual({ file: file.mode & 0o777, folder: folder.mode & 0o777 }, { file: 0o600, folder: 0o700 });
		});
	}

	test('indexes full user and assistant messages with the user envelope as the turn id', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'user-envelope', data: { interactionId: 'not-the-turn-id', content: 'Find the cobalt problem' } },
			{ type: 'assistant.message', id: 'assistant-envelope', data: { content: 'Resolved the cobalt problem' } },
			{ type: 'user.message', id: 'next-turn', data: { content: 'Another request' } },
			{ type: 'assistant.message', data: { content: 'cobalt' } },
		]);
		const result = await searchCopilotSessionHistory(databasePath, 'cobalt', history.readPage);
		assert.deepStrictEqual({
			...result,
			matches: result.matches.sort((a, b) => a.snippet.localeCompare(b.snippet)),
		}, {
			matches: [
				{ turnId: 'next-turn', role: 'assistant', snippet: 'cobalt' },
				{ turnId: 'user-envelope', role: 'user', snippet: 'Find the cobalt problem' },
				{ turnId: 'user-envelope', role: 'assistant', snippet: 'Resolved the cobalt problem' },
			],
			hasMore: false,
		});
	});

	test('finds text beyond 5000 characters and returns bounded snippets around each match', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'long-turn', data: { content: `${'prefix '.repeat(900)}nearby userneedle context ${'after '.repeat(900)}` } },
			{ type: 'assistant.message', data: { content: `${'prefix '.repeat(900)}nearby assistantneedle context ${'after '.repeat(900)}` } },
		]);
		const user = await searchCopilotSessionHistory(databasePath, 'userneedle', history.readPage);
		const assistant = await searchCopilotSessionHistory(databasePath, 'assistantneedle', history.readPage);
		assert.deepStrictEqual([user, assistant].map(result => ({
			turnId: result.matches[0]?.turnId,
			role: result.matches[0]?.role,
			hasContext: result.matches[0]?.snippet.includes(`nearby ${result.matches[0].role}needle context`),
			bounded: result.matches[0]?.snippet.length <= 220,
			hasMarkers: /[\uFDD0\uFDD1]/u.test(result.matches[0]?.snippet ?? ''),
		})), [
			{ turnId: 'long-turn', role: 'user', hasContext: true, bounded: true, hasMarkers: false },
			{ turnId: 'long-turn', role: 'assistant', hasContext: true, bounded: true, hasMarkers: false },
		]);
	});

	test('uses the assistant envelope as the turn id when persisted history begins with an assistant', async () => {
		const history = new TestHistory([
			{ type: 'assistant.message', id: 'assistant-turn', data: { content: 'orphanword' } },
			{ type: 'assistant.message', data: { content: 'orphanword continued' } },
		]);
		assert.deepStrictEqual((await searchCopilotSessionHistory(databasePath, 'orphanword', history.readPage)).matches, [
			{ turnId: 'assistant-turn', role: 'assistant', snippet: 'orphanword' },
			{ turnId: 'assistant-turn', role: 'assistant', snippet: 'orphanword continued' },
		]);
	});

	test('bounds snippets by characters even when a nearby token is very long', async () => {
		const history = new TestHistory([
			{ type: 'user.message', data: { content: `${'x'.repeat(7000)} needlematch ${'y'.repeat(7000)}` } },
		]);
		const result = await searchCopilotSessionHistory(databasePath, 'needlematch', history.readPage);
		assert.deepStrictEqual({
			matches: result.matches.length,
			hasMatch: result.matches[0]?.snippet.includes('needlematch'),
			bounded: result.matches[0]?.snippet.length <= 220,
		}, { matches: 1, hasMatch: true, bounded: true });
	});

	test('uses canonical synthetic-message and prompt-scaffolding sanitization', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'visible', data: { source: 'USER', content: 'visibleword\n<reminder>hiddenword</reminder><system_reminder>hiddenword</system_reminder><system-reminder>hiddenword</system-reminder><attachments>hiddenword</attachments><context>hiddenword</context><current_datetime>hiddenword</current_datetime><pr_metadata value="hiddenword" /><userRequest>hiddenword</userRequest><user_query>hiddenword</user_query>' } },
			{ type: 'user.message', data: { source: 'skill', content: 'hiddenword' } },
			{ type: 'assistant.message', data: { content: 'visibleword response' } },
			{ type: 'user.message', id: 'wrapped', data: { content: '<userRequest>wrappedword</userRequest><context>hiddenword</context>' } },
			{ type: 'user.message', id: 'wrapped-query', data: { content: '<user_query>wrappedword</user_query>' } },
		]);
		const visible = await searchCopilotSessionHistory(databasePath, 'visibleword', history.readPage);
		const wrapped = await searchCopilotSessionHistory(databasePath, 'wrappedword', history.readPage);
		const hidden = await searchCopilotSessionHistory(databasePath, 'hiddenword', history.readPage);
		assert.deepStrictEqual({ visible: visible.matches, wrapped: wrapped.matches, hidden }, {
			visible: [
				{ turnId: 'visible', role: 'user', snippet: 'visibleword' },
				{ turnId: 'visible', role: 'assistant', snippet: 'visibleword response' },
			],
			wrapped: [
				{ turnId: 'wrapped', role: 'user', snippet: 'wrappedword' },
				{ turnId: 'wrapped-query', role: 'user', snippet: 'wrappedword' },
			],
			hidden: { matches: [], hasMore: false },
		});
	});

	test('excludes subagents, reasoning, attachments, and arbitrary tool payloads', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'parent', data: { content: 'parentword', attachments: [{ type: 'file', path: '/hiddenword.txt' }] } },
			{ type: 'user.message', agentId: 'child', data: { content: 'hiddenword' } },
			{ type: 'assistant.message', agentId: 'child', data: { content: 'hiddenword' } },
			{ type: 'assistant.message', data: { parentToolCallId: 'legacy-child', content: 'hiddenword' } },
			{ type: 'assistant.message', data: { content: 'parentword response', reasoningText: 'hiddenword', reasoningOpaque: 'hiddenword', encryptedContent: 'hiddenword', toolRequests: [{ toolCallId: 'shell', name: 'bash', arguments: { command: 'hiddenword' } }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'shell', toolName: 'bash', arguments: { command: 'hiddenword' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'shell', success: true, result: { content: 'hiddenword' } } },
		]);
		assert.deepStrictEqual({
			hidden: await searchCopilotSessionHistory(databasePath, 'hiddenword', history.readPage),
			parent: (await searchCopilotSessionHistory(databasePath, 'parentword', history.readPage)).matches.map(match => match.turnId),
		}, {
			hidden: { matches: [], hasMore: false },
			parent: ['parent', 'parent'],
		});
	});

	test('indexes rendered task_complete summaries once, including execution-start-only summaries', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'task-turn', data: { content: 'Do the work' } },
			{ type: 'assistant.message', data: { content: '', toolRequests: [{ toolCallId: 'done', name: 'task_complete', arguments: { summary: 'finishedword in the final answer', privateField: 'hiddenword' } }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'done', toolName: 'task_complete', arguments: { summary: 'finishedword in the final answer' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'done', success: true, result: { content: 'hiddenword' } } },
			{ type: 'user.message', id: 'start-only-turn', data: { content: 'More work' } },
			{ type: 'assistant.message', data: { content: '', toolRequests: [{ toolCallId: 'start-only', name: 'task_complete' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'start-only', toolName: 'task_complete', arguments: { summary: 'finishedword in the final answer' } } },
		], 1);
		assert.deepStrictEqual({
			summaries: await searchCopilotSessionHistory(databasePath, 'finishedword', history.readPage),
			toolPayload: await searchCopilotSessionHistory(databasePath, 'hiddenword', history.readPage),
		}, {
			summaries: {
				matches: [
					{ turnId: 'task-turn', role: 'assistant', snippet: '**Task completed:** finishedword in the final answer' },
					{ turnId: 'start-only-turn', role: 'assistant', snippet: '**Task completed:** finishedword in the final answer' },
				],
				hasMore: false,
			},
			toolPayload: { matches: [], hasMore: false },
		});
	});

	test('excludes subagent task summaries and does not fall back to raw completion output', async () => {
		const history = new TestHistory([
			{ type: 'user.message', data: { content: 'Visible prompt' } },
			{ type: 'assistant.message', agentId: 'child', data: { toolRequests: [{ toolCallId: 'child', name: 'task_complete', arguments: { summary: 'hiddenword' } }] } },
			{ type: 'tool.execution_start', agentId: 'child', data: { toolCallId: 'child', toolName: 'task_complete', arguments: { summary: 'hiddenword' } } },
			{ type: 'tool.execution_start', data: { parentToolCallId: 'legacy-child', toolCallId: 'legacy', toolName: 'task_complete', arguments: { summary: 'hiddenword' } } },
			{ type: 'tool.execution_start', data: { toolCallId: 'empty', toolName: 'task_complete', arguments: { summary: { hiddenword: true } } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'empty', success: true, result: { content: 'hiddenword' } } },
		]);
		assert.deepStrictEqual(await searchCopilotSessionHistory(databasePath, 'hiddenword', history.readPage), { matches: [], hasMore: false });
	});

	test('streams forward pages and preserves turn ids across page boundaries', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'first', data: { content: 'First prompt' } },
			{ type: 'assistant.message', data: { content: 'First pagedword' } },
			{ type: 'user.message', id: 'second', data: { content: 'Second prompt' } },
			{ type: 'assistant.message', data: { content: 'Second pagedword' } },
		], 1);
		const result = await searchCopilotSessionHistory(databasePath, 'pagedword', history.readPage);
		assert.deepStrictEqual({
			turns: result.matches.map(match => match.turnId),
			calls: history.calls,
		}, {
			turns: ['first', 'second'],
			calls: [
				{ direction: 'backward', max: 1 },
				{ cursor: undefined, direction: 'forward', max: 500 },
				{ cursor: '1', direction: 'forward', max: 500 },
				{ cursor: '2', direction: 'forward', max: 500 },
				{ cursor: '3', direction: 'forward', max: 500 },
			],
		});
	});

	test('reuses the closed and reopened persisted index when the tail is unchanged', async () => {
		const history = new TestHistory([{ type: 'user.message', data: { content: 'cachedword' } }]);
		const first = await searchCopilotSessionHistory(databasePath, 'cachedword', history.readPage);
		history.calls.length = 0;
		const second = await searchCopilotSessionHistory(databasePath, 'cachedword', history.readPage);
		assert.deepStrictEqual({ result: second, calls: history.calls }, {
			result: first,
			calls: [{ direction: 'backward', max: 1 }],
		});
	});

	test('invalidates on append, truncate, and truncation to empty', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'base', data: { content: 'baseword' } },
			{ type: 'assistant.message', id: 'truncated', data: { content: 'removedword' } },
		]);
		await searchCopilotSessionHistory(databasePath, 'baseword', history.readPage);
		history.events.push(...new TestHistory([{ type: 'assistant.message', id: 'appended', data: { content: 'addedword' } }]).events);
		const appended = await searchCopilotSessionHistory(databasePath, 'addedword', history.readPage);
		history.events.splice(1);
		const removed = await searchCopilotSessionHistory(databasePath, 'removedword', history.readPage);
		const added = await searchCopilotSessionHistory(databasePath, 'addedword', history.readPage);
		history.events.length = 0;
		const empty = await searchCopilotSessionHistory(databasePath, 'baseword', history.readPage);
		assert.deepStrictEqual({ appended, removed, added, empty }, {
			appended: { matches: [{ turnId: 'base', role: 'assistant', snippet: 'addedword' }], hasMore: false },
			removed: { matches: [], hasMore: false },
			added: { matches: [], hasMore: false },
			empty: { matches: [], hasMore: false },
		});
	});

	test('invalidates when the provider backing changes even if its tail id is reused', async () => {
		const first = new TestHistory([{ type: 'user.message', id: 'same-tail', data: { content: 'firstword' } }]);
		const second = new TestHistory([{ type: 'user.message', id: 'same-tail', data: { content: 'secondword' } }]);
		await searchCopilotSessionHistory(databasePath, 'firstword', first.readPage, 'first-backing');
		assert.deepStrictEqual(await searchCopilotSessionHistory(databasePath, 'secondword', second.readPage, 'second-backing'), {
			matches: [{ turnId: 'same-tail', role: 'user', snippet: 'secondword' }],
			hasMore: false,
		});
	});

	test('propagates tail-read errors rather than returning cached success', async () => {
		const history = new TestHistory([{ type: 'user.message', data: { content: 'cachedword' } }]);
		await searchCopilotSessionHistory(databasePath, 'cachedword', history.readPage);
		await assert.rejects(searchCopilotSessionHistory(databasePath, 'cachedword', async () => {
			throw new Error('tail read failed');
		}), /tail read failed/);
	});

	test('rolls back partial rebuilds and preserves the previous index after a read error', async () => {
		const history = new TestHistory([{ type: 'user.message', id: 'old-tail', data: { content: 'oldword' } }], 1);
		const previous = await searchCopilotSessionHistory(databasePath, 'oldword', history.readPage);
		const original = history.events;
		history.events = new TestHistory([
			{ type: 'user.message', id: 'new-first', data: { content: 'newword' } },
			{ type: 'assistant.message', id: 'new-tail', data: { content: 'newword' } },
		]).events;
		await assert.rejects(searchCopilotSessionHistory(databasePath, 'newword', async options => {
			if (options.direction === 'forward' && options.cursor) {
				throw new Error('page read failed');
			}
			return history.readPage(options);
		}), /page read failed/);
		history.events = original;
		history.calls.length = 0;
		assert.deepStrictEqual({
			result: await searchCopilotSessionHistory(databasePath, 'oldword', history.readPage),
			calls: history.calls,
		}, { result: previous, calls: [{ direction: 'backward', max: 1 }] });
	});

	for (const failure of ['expired', 'stalled', 'missing-tail'] as const) {
		test(`rejects ${failure} pagination without returning a partial search result`, async () => {
			const history = new TestHistory([
				{ type: 'user.message', id: 'first', data: { content: 'word' } },
				{ type: 'assistant.message', id: 'tail', data: { content: 'word' } },
			], 1);
			await assert.rejects(searchCopilotSessionHistory(databasePath, 'word', async options => {
				const page = await history.readPage(options);
				if (options.direction === 'backward') {
					return page;
				}
				return {
					...page,
					events: history.events.slice(0, 1),
					cursor: failure === 'stalled' ? '1' : page.cursor,
					cursorStatus: failure === 'expired' ? 'expired' : 'ok',
					hasMore: failure !== 'missing-tail',
				};
			}), /Persisted conversation/);
		});
	}

	test('serializes concurrent searches on the same database and releases the queue after failure', async () => {
		const history = new TestHistory([{ type: 'user.message', data: { content: 'queuedword' } }]);
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let secondEntered = false;
		const first = searchCopilotSessionHistory(databasePath, 'queuedword', async () => {
			await entered.complete();
			await release.p;
			throw new Error('first search failed');
		});
		const rejected = assert.rejects(first, /first search failed/);
		await entered.p;
		const second = searchCopilotSessionHistory(databasePath, 'queuedword', async options => {
			secondEntered = true;
			return history.readPage(options);
		});
		await new Promise<void>(resolve => setImmediate(resolve));
		const overlapped = secondEntered;
		await release.complete();
		await rejected;
		const result = await second;
		assert.deepStrictEqual({ overlapped, result }, {
			overlapped: false,
			result: { matches: [{ turnId: 'event-0', role: 'user', snippet: 'queuedword' }], hasMore: false },
		});
	});

	test('treats punctuation and malformed query syntax as literal words, never SQL or FTS operators', async () => {
		const history = new TestHistory([
			{ type: 'user.message', id: 'literal', data: { content: 'alpha anything beta AND OR NOT NEAR' } },
			{ type: 'assistant.message', data: { content: 'alpha only' } },
		]);
		const results = [];
		for (const query of ['"alpha beta', 'alpha-beta', 'AND OR NOT NEAR', `x' OR '1'='1'; DROP TABLE messages; --`, '() +-*:"', 'alpha']) {
			results.push((await searchCopilotSessionHistory(databasePath, query, history.readPage)).matches.map(match => match.role).sort());
		}
		assert.deepStrictEqual(results, [['user'], ['user'], ['user'], [], [], ['assistant', 'user']]);
	});

	test('matches Unicode words with case and diacritic folding', async () => {
		const history = new TestHistory([{ type: 'user.message', data: { content: 'CAFÉ naïve 日本語' } }]);
		assert.deepStrictEqual(await searchCopilotSessionHistory(databasePath, 'cafe naive 日本語', history.readPage), {
			matches: [{ turnId: 'event-0', role: 'user', snippet: 'CAFÉ naïve 日本語' }],
			hasMore: false,
		});
	});

	test('rejects overlong and empty queries before reading persisted history', async () => {
		const history = new TestHistory([]);
		await assert.rejects(searchCopilotSessionHistory(databasePath, 'x'.repeat(MAX_SESSION_SEARCH_QUERY_LENGTH + 1), history.readPage), /maximum length/);
		await assert.rejects(searchCopilotSessionHistory(databasePath, ' \n\t', history.readPage), /must not be empty/);
		assert.throws(() => validateSessionSearchQuery(''), /must not be empty/);
		assert.deepStrictEqual({
			calls: history.calls,
			terms: getAgentSessionSearchTerms('literal "AND" punctuation:word'),
			maxLengthAccepted: getAgentSessionSearchTerms('x'.repeat(MAX_SESSION_SEARCH_QUERY_LENGTH)).length,
		}, { calls: [], terms: ['literal', 'AND', 'punctuation', 'word'], maxLengthAccepted: 1 });
	});

	for (const count of [AGENT_CHAT_SEARCH_MAX_RESULTS, AGENT_CHAT_SEARCH_MAX_RESULTS + 1]) {
		test(`returns ranked matches and accurate hasMore for ${count} results`, async () => {
			const events: ISessionEvent[] = Array.from({ length: count - 1 }, (_, index) => ({
				type: 'user.message', id: `long-${index}`, data: { content: `rankedword ${'unrelated '.repeat(40)}` },
			}));
			events.push({ type: 'user.message', id: 'most-relevant', data: { content: 'rankedword' } });
			const history = new TestHistory(events);
			const result = await searchCopilotSessionHistory(databasePath, 'rankedword', history.readPage);
			assert.deepStrictEqual({
				count: result.matches.length,
				first: result.matches[0],
				hasMore: result.hasMore,
			}, {
				count: AGENT_CHAT_SEARCH_MAX_RESULTS,
				first: { turnId: 'most-relevant', role: 'user', snippet: 'rankedword' },
				hasMore: count > AGENT_CHAT_SEARCH_MAX_RESULTS,
			});
		});
	}

	test('stops at the captured tail while a session keeps appending', async () => {
		const history = new TestHistory([{ type: 'user.message', id: 'snapshot-tail', data: { content: 'originalword' } }]);
		const appended = new TestHistory([{ type: 'assistant.message', id: 'later-tail', data: { content: 'laterword' } }]).events;
		const snapshot = await searchCopilotSessionHistory(databasePath, 'laterword', async options => {
			if (options.direction === 'forward') {
				history.events.push(...appended);
			}
			return history.readPage(options);
		});
		const next = await searchCopilotSessionHistory(databasePath, 'laterword', history.readPage);
		assert.deepStrictEqual({ snapshot, next }, {
			snapshot: { matches: [], hasMore: false },
			next: { matches: [{ turnId: 'snapshot-tail', role: 'assistant', snippet: 'laterword' }], hasMore: false },
		});
	});
});
