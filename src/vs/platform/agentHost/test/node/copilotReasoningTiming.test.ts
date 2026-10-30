/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import sinon from 'sinon';
import { join } from '../../../../base/common/path.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { StoredAssistantResponsePart } from '../../common/sessionDataService.js';
import type { ChatReasoningAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind } from '../../common/state/sessionState.js';
import { CopilotReasoningTiming } from '../../node/copilot/copilotReasoningTiming.js';
import { mapSessionEvents } from '../../node/copilot/mapSessionEvents.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { toSessionEvents, type ISessionEvent } from './copilotTestEvents.js';

suite('CopilotReasoningTiming', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: ReturnType<typeof sinon.useFakeTimers>;

	setup(() => {
		clock = sinon.useFakeTimers({ now: 1000, toFake: ['Date'] });
		sinon.stub(StopWatch, 'create').callsFake(() => new StopWatch(false));
	});

	teardown(() => sinon.restore());

	function createTiming() {
		const actions: { action: ChatReasoningAction; parentToolCallId: string | undefined }[] = [];
		const recorded = new Map<string, readonly StoredAssistantResponsePart[]>();
		const timing = store.add(new CopilotReasoningTiming(
			(action, parentToolCallId) => actions.push({ action, parentToolCallId }),
			(_turnId, responseId, parts) => recorded.set(responseId, parts),
		));
		return { timing, actions, recorded };
	}

	test('keeps 5s and 12s runs separate within one SDK message', () => {
		const { timing, actions, recorded } = createTiming();
		timing.start('turn', 'first', undefined);
		timing.append('First', undefined);
		clock.tick(5000);
		timing.markdown('turn', 'between', 'Between', undefined);
		clock.tick(20_000);
		timing.start('turn', 'second', undefined);
		timing.append('Second', undefined);
		clock.tick(12_000);
		timing.markdown('turn', 'answer', 'Done', undefined);
		timing.completeMessage('message', 'FirstSecond', 'BetweenDone', undefined);

		assert.deepStrictEqual({
			durations: actions.map(({ action }) => ({ id: action.partId, duration: action.duration })),
			parts: recorded.get('message'),
		}, {
			durations: [{ id: 'first', duration: 5000 }, { id: 'second', duration: 12_000 }],
			parts: [
				{ kind: ResponsePartKind.Reasoning, id: 'first', content: 'First', startedAt: '1970-01-01T00:00:01.000Z', duration: 5000 },
				{ kind: ResponsePartKind.Markdown, id: 'between', content: 'Between' },
				{ kind: ResponsePartKind.Reasoning, id: 'second', content: 'Second', startedAt: '1970-01-01T00:00:26.000Z', duration: 12_000 },
				{ kind: ResponsePartKind.Markdown, id: 'answer', content: 'Done' },
			],
		});
	});

	test('SDK messages do not end a run and completed timing updates earlier message fragments', () => {
		const { timing, actions, recorded } = createTiming();
		timing.start('turn', 'run', undefined);
		timing.append('First', undefined);
		clock.tick(5000);
		timing.completeMessage('message-1', 'First', '', undefined);
		const unfinished = recorded.get('message-1');
		const actionCountAtMessageBoundary = actions.length;
		clock.tick(7000);
		timing.append('Second', undefined);
		clock.tick(12_000);
		timing.markdown('turn', 'answer', 'Done', undefined);
		timing.completeMessage('message-2', 'Second', 'Done', undefined);

		assert.deepStrictEqual({
			actionCountAtMessageBoundary,
			unfinished,
			durations: actions.map(({ action }) => action.duration),
			parts: [...recorded.values()].flat().filter(part => part.kind === ResponsePartKind.Reasoning),
		}, {
			actionCountAtMessageBoundary: 0,
			unfinished: [{ kind: ResponsePartKind.Reasoning, id: 'run', content: 'First', startedAt: '1970-01-01T00:00:01.000Z' }],
			durations: [24_000],
			parts: [
				{ kind: ResponsePartKind.Reasoning, id: 'run', content: 'First', startedAt: '1970-01-01T00:00:01.000Z', duration: 24_000 },
				{ kind: ResponsePartKind.Reasoning, id: 'run', content: 'Second', startedAt: '1970-01-01T00:00:01.000Z', duration: 24_000 },
			],
		});
	});

	test('parent and subagent runs stop independently', () => {
		const { timing, actions } = createTiming();
		timing.start('turn', 'parent', undefined);
		timing.append('Parent', undefined);
		clock.tick(1000);
		timing.start('turn', 'child', 'tool');
		timing.append('Child', 'tool');
		clock.tick(2000);
		timing.completeMessage('child-message', 'Child', '', 'tool');
		clock.tick(3000);
		timing.markdown('turn', 'parent-answer', 'Done', undefined);
		clock.tick(4000);
		timing.toolCall('turn', 'child-tool', 'tool');

		assert.deepStrictEqual(actions.map(({ action, parentToolCallId }) => ({ id: action.partId, duration: action.duration, parentToolCallId })), [
			{ id: 'parent', duration: 6000, parentToolCallId: undefined },
			{ id: 'child', duration: 9000, parentToolCallId: 'tool' },
		]);
	});

	test('preserves zero and leaves interrupted or mismatched recordings untimed', () => {
		const { timing, recorded } = createTiming();
		timing.start('turn', 'zero', undefined);
		timing.append('Immediate', undefined);
		timing.markdown('turn', 'answer', 'Done', undefined);
		timing.completeMessage('zero-message', 'Immediate', 'Done', undefined);
		timing.start('turn', 'interrupted', undefined);
		timing.append('Partial', undefined);
		timing.completeMessage('partial-message', 'Partial', '', undefined);
		timing.clear(undefined);
		clock.tick(60_000);
		const unobserved = timing.completeMessage('old-message', 'Old history', '', undefined);
		timing.start('turn', 'mismatch', undefined);
		timing.append('Observed prefix', undefined);
		const mismatch = timing.completeMessage('mismatch-message', 'Different content', '', undefined);
		timing.append('Tail', undefined);
		timing.markdown('turn', 'tail-answer', 'Done', undefined);
		timing.completeMessage('tail-message', 'Tail', 'Done', undefined);

		assert.deepStrictEqual({
			unobserved, mismatch,
			recorded: [...recorded].map(([id, parts]) => ({ id, durations: parts.flatMap(part => part.kind === ResponsePartKind.Reasoning ? [part.duration] : []) })),
		}, {
			unobserved: false, mismatch: false,
			recorded: [
				{ id: 'zero-message', durations: [0] },
				{ id: 'partial-message', durations: [undefined] },
				{ id: 'tail-message', durations: [undefined] },
			],
		});
	});

	for (const boundary of ['markdown', 'tool'] as const) {
		test(`restores separate 5s and 12s runs and their ${boundary} boundary after a database restart`, async () => {
			const directory = await fs.mkdtemp(join(tmpdir(), 'copilot-reasoning-runs-'));
			const path = join(directory, 'session.db');
			const database = store.add(await SessionDatabase.open(path));
			let restored: SessionDatabase | undefined;
			try {
				const writes: Promise<void>[] = [];
				const timing = store.add(new CopilotReasoningTiming(
					() => { },
					(turnId, responseId, parts) => writes.push(database.setAssistantResponseParts(turnId, responseId, parts)),
				));
				timing.start('host-turn', 'first', undefined);
				timing.append('First', undefined);
				clock.tick(5000);
				if (boundary === 'markdown') {
					timing.markdown('host-turn', 'between', 'Between', undefined);
				} else {
					timing.toolCall('host-turn', 'tool', undefined);
				}
				clock.tick(20_000);
				timing.start('host-turn', 'second', undefined);
				timing.append('Second', undefined);
				clock.tick(12_000);
				timing.markdown('host-turn', 'answer', 'Done', undefined);
				timing.completeMessage('assistant-event', 'FirstSecond', boundary === 'markdown' ? 'BetweenDone' : 'Done', undefined);
				await Promise.all(writes);
				await database.close();
				restored = store.add(await SessionDatabase.open(path));
				const session = URI.parse('ahp-session:/opaque-session');
				const events: ISessionEvent[] = [
					{ type: 'user.message', id: 'user', data: { content: 'Request' } },
					{ type: 'assistant.message', id: 'assistant-event', data: { content: boundary === 'markdown' ? 'BetweenDone' : 'Done', reasoningText: 'FirstSecond' } },
				];
				if (boundary === 'tool') {
					events.push(
						{ type: 'tool.execution_start', data: { toolCallId: 'tool', toolName: 'read_file', arguments: { path: '/test/file.ts' } } },
						{ type: 'tool.execution_complete', data: { toolCallId: 'tool', success: true, result: { content: 'Tool result' } } },
					);
				}
				const result = await mapSessionEvents(session, restored, toSessionEvents(events), URI.parse('ahp-chat:/opaque-chat'), session);

				assert.deepStrictEqual(result.turns[0].responseParts.map(part => part.kind === ResponsePartKind.ToolCall
					? { kind: part.kind, id: part.toolCall.toolCallId }
					: part.kind === ResponsePartKind.Reasoning
						? { kind: part.kind, id: part.id, content: part.content, duration: part.duration }
						: part.kind === ResponsePartKind.Markdown ? { kind: part.kind, id: part.id, content: part.content } : { kind: part.kind }), [
					{ kind: ResponsePartKind.Reasoning, id: 'first', content: 'First', duration: 5000 },
					boundary === 'markdown' ? { kind: ResponsePartKind.Markdown, id: 'between', content: 'Between' } : { kind: ResponsePartKind.ToolCall, id: 'tool' },
					{ kind: ResponsePartKind.Reasoning, id: 'second', content: 'Second', duration: 12_000 },
					{ kind: ResponsePartKind.Markdown, id: 'answer', content: 'Done' },
				]);
			} finally {
				await restored?.close();
				await database.close();
				await fs.rm(directory, { recursive: true, force: true });
			}
		});
	}

	test('replay combines fragments of one run across SDK messages without summing their duration', async () => {
		const database = store.add(await SessionDatabase.open(':memory:'));
		try {
			const writes: Promise<void>[] = [];
			const timing = store.add(new CopilotReasoningTiming(
				() => { },
				(turnId, responseId, parts) => writes.push(database.setAssistantResponseParts(turnId, responseId, parts)),
			));
			timing.start('host-turn', 'run', undefined);
			timing.append('First', undefined);
			clock.tick(5000);
			timing.completeMessage('first-message', 'First', '', undefined);
			clock.tick(7000);
			timing.append('Second', undefined);
			clock.tick(12_000);
			timing.markdown('host-turn', 'answer', 'Done', undefined);
			timing.completeMessage('second-message', 'Second', 'Done', undefined);
			await Promise.all(writes);
			const session = URI.parse('ahp-session:/session');
			const result = await mapSessionEvents(session, database, toSessionEvents([
				{ type: 'user.message', id: 'user', data: { content: 'Request' } },
				{ type: 'assistant.message', id: 'first-message', data: { reasoningText: 'First', content: '' } },
				{ type: 'assistant.message', id: 'second-message', data: { reasoningText: 'Second', content: 'Done' } },
			]), URI.parse('ahp-chat:/chat'), session);

			assert.deepStrictEqual(result.turns[0].responseParts, [
				{ kind: ResponsePartKind.Reasoning, id: 'run', content: 'FirstSecond', startedAt: '1970-01-01T00:00:01.000Z', duration: 24_000 },
				{ kind: ResponsePartKind.Markdown, id: 'answer', content: 'Done' },
			]);
		} finally {
			await database.close();
		}
	});
});
