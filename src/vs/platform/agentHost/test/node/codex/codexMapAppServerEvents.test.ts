/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createCodexSessionMapState, mapAgentMessageDelta, mapItemCompleted, mapItemStarted, mapTurnCompleted, mapTurnStarted } from '../../../node/codex/codexMapAppServerEvents.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ResponsePartKind, TurnState } from '../../../common/state/sessionState.js';
import { turnStateFromStatus } from '../../../node/codex/codexMapAppServerEvents.js';

suite('codexMapAppServerEvents', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('turn/started emits SessionTurnStarted with user message text', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnStarted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [{
					type: 'userMessage',
					id: 'item_user',
					content: [{ type: 'text', text: 'hello', text_elements: [] }],
				}],
				itemsView: { type: 'full' } as never,
				status: 'inProgress' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
		}, 'fallback');
		assert.strictEqual(state.currentTurnId, 'turn_a');
		assert.deepStrictEqual(actions, [{
			type: ActionType.SessionTurnStarted,
			turnId: 'turn_a',
			userMessage: { text: 'hello' },
		}]);
	});

	test('turn/started falls back to provided text when items has no userMessage', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnStarted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_b',
				items: [],
				itemsView: { type: 'full' } as never,
				status: 'inProgress' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
		}, 'the prompt');
		assert.strictEqual((actions[0] as { userMessage: { text: string } }).userMessage.text, 'the prompt');
	});

	test('item/started for agentMessage seeds a markdown part', () => {
		const state = createCodexSessionMapState();
		const actions = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: '', phase: null, memoryCitation: null },
			threadId: 'thr_1',
			turnId: 'turn_a',
			startedAtMs: 0,
		});
		assert.strictEqual(actions.length, 1);
		const a = actions[0] as { type: ActionType; turnId: string; part: { kind: ResponsePartKind; id: string; content: string } };
		assert.strictEqual(a.type, ActionType.SessionResponsePart);
		assert.strictEqual(a.turnId, 'turn_a');
		assert.strictEqual(a.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual(typeof a.part.id, 'string');
		assert.ok(a.part.id.length > 0);
		assert.strictEqual(state.itemToPartId.get('item_x'), a.part.id);
	});

	test('item/started for non-agentMessage item is ignored (Phase 2)', () => {
		const state = createCodexSessionMapState();
		const actions = mapItemStarted(state, {
			item: { type: 'plan', id: 'item_p', text: 'plan text' } as never,
			threadId: 'thr_1',
			turnId: 'turn_a',
			startedAtMs: 0,
		});
		assert.deepStrictEqual(actions, []);
		assert.strictEqual(state.itemToPartId.size, 0);
	});

	test('item/agentMessage/delta emits SessionDelta for known itemId', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: '', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const partId = state.itemToPartId.get('item_x')!;
		const actions = mapAgentMessageDelta(state, {
			threadId: 'thr_1',
			turnId: 'turn_a',
			itemId: 'item_x',
			delta: 'chunk',
		});
		assert.deepStrictEqual(actions, [{
			type: ActionType.SessionDelta,
			turnId: 'turn_a',
			partId,
			content: 'chunk',
		}]);
	});

	test('item/agentMessage/delta for unknown itemId is dropped', () => {
		const state = createCodexSessionMapState();
		const actions = mapAgentMessageDelta(state, {
			threadId: 'thr_1', turnId: 'turn_a', itemId: 'unknown', delta: 'orphan',
		});
		assert.deepStrictEqual(actions, []);
	});

	test('item/completed for agentMessage clears the mapping', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: '', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		assert.strictEqual(state.itemToPartId.size, 1);
		mapItemCompleted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: 'final', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.strictEqual(state.itemToPartId.size, 0);
	});

	test('turn/completed with status=completed emits SessionTurnComplete', () => {
		const state = createCodexSessionMapState();
		state.currentTurnId = 'turn_a';
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [], itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			},
		});
		assert.deepStrictEqual(actions, [{ type: ActionType.SessionTurnComplete, turnId: 'turn_a' }]);
		assert.strictEqual(state.currentTurnId, undefined);
	});

	test('turn/completed with status=failed emits SessionError + SessionTurnComplete', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a', items: [], itemsView: { type: 'full' } as never,
				status: 'failed' as never,
				error: { message: 'boom' } as never,
				startedAt: null, completedAt: null, durationMs: null,
			},
		});
		assert.strictEqual(actions.length, 2);
		assert.strictEqual((actions[0] as { type: ActionType }).type, ActionType.SessionError);
		assert.strictEqual((actions[1] as { type: ActionType }).type, ActionType.SessionTurnComplete);
	});

	test('turn/completed with status=interrupted emits SessionTurnCancelled', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a', items: [], itemsView: { type: 'full' } as never,
				status: 'interrupted' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			},
		});
		assert.strictEqual(actions.length, 1);
		assert.strictEqual((actions[0] as { type: ActionType }).type, ActionType.SessionTurnCancelled);
	});

	test('turnStateFromStatus maps strings correctly', () => {
		assert.strictEqual(turnStateFromStatus('completed'), TurnState.Complete);
		assert.strictEqual(turnStateFromStatus('interrupted'), TurnState.Cancelled);
		assert.strictEqual(turnStateFromStatus('failed'), TurnState.Error);
		assert.strictEqual(turnStateFromStatus('weird'), TurnState.Complete);
	});
});
