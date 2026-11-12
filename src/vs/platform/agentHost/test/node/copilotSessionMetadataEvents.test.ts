/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from '../../../../base/common/path.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readCopilotSessionMetadataEvents, toCopilotSessionMetadataEvent } from '../../node/copilot/copilotSessionMetadataEvents.js';

const chat = URI.parse('ahp-session:/native/chat');
const title = { id: 'title', type: 'session.title_changed', timestamp: '2026-10-02T21:00:00Z', data: { title: 'Native title' } };

suite('Copilot session metadata events', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('admits genuine root metadata verbatim but excludes content, auth, config, deltas and subagents', () => {
		const rejected = [
			'assistant.message', 'assistant.reasoning', 'assistant.message_delta', 'assistant.reasoning_delta',
			'assistant.tool_call_delta', 'assistant.streaming_delta', 'mcp.oauth_required',
			'session.managed_settings_resolved', 'session.permissions_changed', 'new.unknown',
			'session.shutdown',
		].map(type => toCopilotSessionMetadataEvent(chat, { ...title, type, data: { token: 'secret' } }));
		rejected.push(toCopilotSessionMetadataEvent(chat, { ...title, agentId: 'worker' }));
		assert.deepStrictEqual({
			admitted: toCopilotSessionMetadataEvent(chat, title),
			rejected,
		}, { admitted: { ...title, chat, persisted: true }, rejected: rejected.map(() => undefined) });
	});

	test('rejects malformed metadata rather than forwarding an untyped wire shape', () => {
		const values = [null, {}, { ...title, data: null }, { ...title, id: '' }, { ...title, timestamp: 'not a time' }];
		assert.deepStrictEqual(values.map(value => toCopilotSessionMetadataEvent(chat, value)), values.map(() => undefined));
	});

	test('replays genuine journal metadata and ignores an unfinished append', async () => {
		const path = join(process.cwd(), '.build', `mc-sdk-journal-${generateUuid()}`);
		await mkdir(path);
		try {
			const journal = join(path, 'events.jsonl');
			await writeFile(journal, `${JSON.stringify(title)}\n${JSON.stringify({ ...title, type: 'assistant.message' })}\n{"unfinished":`);
			const events = [];
			for await (const event of readCopilotSessionMetadataEvents(chat, journal, CancellationToken.None)) {
				events.push(event);
			}
			assert.deepStrictEqual(events, [{ ...title, chat, persisted: true }]);
			await writeFile(journal, '{"malformed":\n');
			const losses = [];
			for await (const event of readCopilotSessionMetadataEvents(chat, journal, CancellationToken.None)) {
				losses.push({ type: event.type, data: event.data });
			}
			assert.deepStrictEqual(losses, [{ type: 'session.events_truncated', data: { dropped_count: 1 } }]);
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('bounds line allocations and fences cancellation', async () => {
		const path = join(process.cwd(), '.build', `mc-sdk-journal-${generateUuid()}`);
		await mkdir(path);
		try {
			const journal = join(path, 'events.jsonl');
			await writeFile(journal, `${'x'.repeat(10 * 1024 * 1024)}\n${JSON.stringify(title)}\n`);
			const events = [];
			for await (const event of readCopilotSessionMetadataEvents(chat, journal, CancellationToken.None)) {
				events.push({ type: event.type, data: event.data });
			}
			assert.deepStrictEqual(events, [
				{ type: 'session.events_truncated', data: { dropped_count: 1 } },
				{ type: 'session.title_changed', data: title.data },
			]);
			const cancellation = store.add(new CancellationTokenSource());
			cancellation.cancel();
			await writeFile(journal, `${JSON.stringify(title)}\n`);
			await assert.rejects(async () => {
				for await (const _event of readCopilotSessionMetadataEvents(chat, journal, cancellation.token)) { }
			}, /Canceled/);
		} finally {
			await rm(path, { recursive: true });
		}
	});

	test('initial reconciliation selects latest genuine facts, while an acknowledged cursor replays only its new tail', async () => {
		const path = join(process.cwd(), '.build', `mc-sdk-journal-${generateUuid()}`);
		await mkdir(path);
		try {
			const journal = join(path, 'events.jsonl');
			const events = Array.from({ length: 15_000 }, (_, index) => ({
				...title, id: `event-${index}`, type: 'assistant.turn_end', data: { turnId: String(index) },
			}));
			await writeFile(journal, `${events.map(event => JSON.stringify(event)).join('\n')}\n${JSON.stringify(title)}\n`);
			const initial = [];
			for await (const event of readCopilotSessionMetadataEvents(chat, journal, CancellationToken.None)) {
				initial.push(event.id);
			}
			const tail = [];
			for await (const event of readCopilotSessionMetadataEvents(chat, journal, CancellationToken.None, 'event-14998')) {
				tail.push(event.id);
			}
			assert.deepStrictEqual({ initial, tail }, {
				initial: ['event-14999', 'title'], tail: ['event-14998', 'event-14999', 'title'],
			});
		} finally {
			await rm(path, { recursive: true });
		}
	});
});
