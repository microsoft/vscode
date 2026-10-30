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
import type { IReasoningTiming } from '../../common/sessionDataService.js';
import { ActionType, type ChatReasoningAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind } from '../../common/state/sessionState.js';
import { CopilotReasoningTiming } from '../../node/copilot/copilotReasoningTiming.js';
import { mapSessionEvents } from '../../node/copilot/mapSessionEvents.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { toSessionEvents } from './copilotTestEvents.js';

suite('CopilotReasoningTiming', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let elapsed = 0;

	setup(() => {
		elapsed = 0;
		sinon.useFakeTimers({ now: 1000, toFake: ['Date'] });
		sinon.stub(StopWatch.prototype, 'elapsed').callsFake(() => elapsed);
	});

	teardown(() => sinon.restore());

	function createTiming() {
		const actions: { action: ChatReasoningAction; parentToolCallId: string | undefined }[] = [];
		const recorded: { turnId: string; responseId: string; timing: IReasoningTiming }[] = [];
		const timing = store.add(new CopilotReasoningTiming(
			(action, parentToolCallId) => actions.push({ action, parentToolCallId }),
			(turnId, responseId, value) => recorded.push({ turnId, responseId, timing: value }),
		));
		return { timing, actions, recorded };
	}

	test('records 45 seconds against the durable assistant message without a reasoning completion event', () => {
		const { timing, actions, recorded } = createTiming();
		timing.start('turn', 'sdk-reasoning', 'part', undefined);
		timing.append('Thinking', undefined);
		elapsed = 45_000;
		timing.completeMessage('assistant-event', 'Thinking', undefined);
		timing.finish(undefined);

		assert.deepStrictEqual({ actions, recorded }, {
			actions: [{ parentToolCallId: undefined, action: { type: ActionType.ChatReasoning, turnId: 'turn', partId: 'part', content: '', startedAt: '1970-01-01T00:00:01.000Z', duration: 45_000 } }],
			recorded: [{ turnId: 'turn', responseId: 'assistant-event', timing: { startedAt: '1970-01-01T00:00:01.000Z', duration: 45_000 } }],
		});
	});

	test('sums split reasoning fragments without including the gaps or timing another chat', () => {
		const { timing, actions, recorded } = createTiming();
		timing.start('turn', 'reasoning-1', 'first', undefined);
		timing.append('First', undefined);
		timing.start('turn', 'child-reasoning', 'child', 'tool');
		timing.append('Child', 'tool');
		elapsed = 30_000;
		timing.finish(undefined);
		elapsed = 1500;
		timing.completeMessage('child-message', 'Child', 'tool');
		timing.start('turn', 'reasoning-2', 'second', undefined);
		timing.append(' second', undefined);
		elapsed = 15_000;
		timing.completeMessage('parent-message', 'First second', undefined);

		assert.deepStrictEqual({
			fragments: actions.map(({ action, parentToolCallId }) => ({ part: action.partId, duration: action.duration, parentToolCallId })),
			totals: recorded.map(record => ({ response: record.responseId, duration: record.timing.duration })),
		}, {
			fragments: [
				{ part: 'first', duration: 30_000, parentToolCallId: undefined },
				{ part: 'child', duration: 1500, parentToolCallId: 'tool' },
				{ part: 'second', duration: 15_000, parentToolCallId: undefined },
			],
			totals: [{ response: 'child-message', duration: 1500 }, { response: 'parent-message', duration: 45_000 }],
		});
	});

	test('preserves zero but does not invent timing for unobserved, mismatched, or interrupted reasoning', () => {
		const { timing, recorded } = createTiming();
		const unobserved = timing.completeMessage('unobserved', 'Thinking', undefined);
		timing.start('turn', 'sdk', 'part', undefined);
		timing.append('Thinking', undefined);
		const zero = timing.completeMessage('zero', 'Thinking', undefined);
		timing.start('turn', 'sdk-next', 'next', undefined);
		timing.append('Observed prefix', undefined);
		const mismatched = timing.completeMessage('mismatch', 'Different full response', undefined);
		timing.start('turn', 'sdk-interrupted', 'interrupted', undefined);
		timing.append('Partial', undefined);
		timing.clear(undefined);
		const interrupted = timing.completeMessage('interrupted', 'Partial', undefined);

		assert.deepStrictEqual({ unobserved, zero, mismatched, interrupted, recorded }, {
			unobserved: false, zero: true, mismatched: false, interrupted: false,
			recorded: [{ turnId: 'turn', responseId: 'zero', timing: { startedAt: '1970-01-01T00:00:01.000Z', duration: 0 } }],
		});
	});

	test('restores timing after closing and reopening the database without timing identical historical text', async () => {
		const directory = await fs.mkdtemp(join(tmpdir(), 'copilot-reasoning-timing-'));
		const path = join(directory, 'session.db');
		const database = store.add(await SessionDatabase.open(path));
		let restored: SessionDatabase | undefined;
		try {
			const writes: Promise<void>[] = [];
			const timing = store.add(new CopilotReasoningTiming(
				() => { },
				(turnId, responseId, value) => writes.push(database.setReasoningTiming(turnId, responseId, value)),
			));
			timing.start('host-turn', 'sdk-reasoning', 'live-part', undefined);
			timing.append('Thinking', undefined);
			elapsed = 45_000;
			timing.completeMessage('assistant-timed', 'Thinking', undefined);
			await Promise.all(writes);
			await database.close();
			restored = store.add(await SessionDatabase.open(path));
			const session = URI.parse('ahp-session:/opaque-session');
			const result = await mapSessionEvents(session, restored, toSessionEvents([
				{ type: 'user.message', id: 'user-timed', data: { content: 'First request' } },
				{ type: 'assistant.message', id: 'assistant-timed', data: { content: 'Done', reasoningText: 'Thinking' } },
				{ type: 'user.message', id: 'user-older', data: { content: 'Older request' } },
				{ type: 'assistant.message', id: 'assistant-older', data: { content: 'Done', reasoningText: 'Thinking' } },
			]), URI.parse('ahp-chat:/opaque-chat'), session);

			assert.deepStrictEqual(result.turns.flatMap(turn => turn.responseParts.flatMap(part => part.kind === ResponsePartKind.Reasoning
				? [{ content: part.content, startedAt: part.startedAt, duration: part.duration }] : [])), [
				{ content: 'Thinking', startedAt: '1970-01-01T00:00:01.000Z', duration: 45_000 },
				{ content: 'Thinking', startedAt: undefined, duration: undefined },
			]);
		} finally {
			await restored?.close();
			await database.close();
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
