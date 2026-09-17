/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputRequest } from '../../../common/state/sessionState.js';
import { CodexAsyncQuestions } from '../../../node/codex/codexAsyncQuestions.js';
import type { TurnCompletedNotification } from '../../../node/codex/protocol/generated/v2/TurnCompletedNotification.js';

suite('CodexAsyncQuestions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function setup(send?: (text: string) => Promise<string | void>) {
		const shown: ChatInputRequest[] = [];
		const sent: string[] = [];
		const finished: TurnCompletedNotification[] = [];
		const cancelled: string[] = [];
		const errors: unknown[] = [];
		const controller = new CodexAsyncQuestions({
			show: request => shown.push(request),
			cancel: id => cancelled.push(id),
			send: async text => { sent.push(text); return await send?.(text) ?? 'native-1'; },
			finish: completion => finished.push(completion),
			reportError: error => errors.push(error),
		});
		return { controller, shown, sent, finished, cancelled, errors };
	}

	const questions = [{ title: 'Which format?', options: ['PDF', 'Text'] }];
	const answers = { '0': { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'PDF' } } } as const;
	const completed = (id = 'native-1'): TurnCompletedNotification => ({ threadId: 'thread', turn: { id, items: [], status: 'completed', error: null, itemsView: 'full', startedAt: null, completedAt: null, durationMs: null } });
	const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

	test('renders choices with freeform and deduplicates item events', () => {
		const h = setup();
		h.controller.ask('item', questions);
		h.controller.ask('item', questions);
		assert.deepStrictEqual(h.shown.map(r => r.questions), [[{ kind: ChatInputQuestionKind.SingleSelect, id: '0', title: '', message: 'Which format?', required: true, options: [{ id: 'PDF', label: 'PDF', description: undefined }, { id: 'Text', label: 'Text', description: undefined }], allowFreeformInput: true }]]);
	});

	test('supports multiple questions and free text', () => {
		const h = setup();
		h.controller.ask('item', [...questions, { title: 'Details?', options: null }]);
		assert.deepStrictEqual(h.shown[0].questions?.map(q => [q.id, q.kind]), [['0', ChatInputQuestionKind.SingleSelect], ['1', ChatInputQuestionKind.Text]]);
	});

	test('asking does not send or wait for a native response', () => {
		const h = setup();
		h.controller.ask('item', questions);
		assert.deepStrictEqual([h.sent, h.finished], [[], []]);
	});

	test('explicit answer is delivered with its question', async () => {
		const h = setup();
		h.controller.ask('item', questions);
		assert.strictEqual(h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers), true);
		await tick();
		assert.deepStrictEqual(h.sent, ['> Which format?\n\nPDF']);
	});

	test('skip never submits the default option and releases held completion', () => {
		const h = setup();
		h.controller.ask('item', questions);
		assert.strictEqual(h.controller.holdCompletion(completed()), true);
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Cancel);
		assert.deepStrictEqual([h.sent, h.finished], [[], [completed()]]);
	});

	test('late answer starts continuation without completing the host turn', async () => {
		const h = setup(async () => { h.controller.turnStarted('native-2'); return 'native-2'; });
		h.controller.ask('item', questions);
		h.controller.holdCompletion(completed());
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers);
		await tick();
		assert.deepStrictEqual(h.finished, []);
		assert.strictEqual(h.controller.holdCompletion(completed('native-2')), false);
	});

	test('completion racing an answer waits for accepted delivery', async () => {
		const gate = new DeferredPromise<void>();
		const h = setup(() => gate.p);
		h.controller.ask('item', questions);
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers);
		assert.strictEqual(h.controller.holdCompletion(completed()), true);
		await gate.complete();
		await tick();
		assert.deepStrictEqual(h.finished, [completed()]);
	});

	test('failed delivery reopens questions and preserves held completion', async () => {
		const h = setup(async () => { throw new Error('disconnected'); });
		h.controller.ask('item', questions);
		h.controller.holdCompletion(completed());
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers);
		await tick();
		assert.deepStrictEqual([h.shown.length, h.errors.length, h.finished.length], [2, 1, 0]);
		assert.notStrictEqual(h.shown[0].id, h.shown[1].id);
	});

	test('stop prevents an in-flight failure from reopening questions', async () => {
		const gate = new DeferredPromise<void>();
		const h = setup(() => gate.p);
		h.controller.ask('item', questions);
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers);
		h.controller.clear();
		await gate.error(new Error('stopped'));
		await tick();
		assert.deepStrictEqual([h.shown.length, h.errors.length, h.finished.length], [1, 0, 0]);
	});

	test('failure or interruption cancels pending controls without holding the turn', () => {
		const h = setup();
		h.controller.ask('item', questions);
		const notification = completed();
		notification.turn.status = 'interrupted';
		assert.strictEqual(h.controller.holdCompletion(notification), false);
		assert.deepStrictEqual(h.cancelled, [h.shown[0].id]);
	});

	test('duplicate answers and unknown request ids cannot send input', async () => {
		const h = setup();
		h.controller.ask('item', questions);
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers);
		assert.strictEqual(h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers), false);
		assert.strictEqual(h.controller.respond('unknown', ChatInputResponseKind.Accept, answers), false);
		await tick();
		assert.strictEqual(h.sent.length, 1);
	});

	test('Stop can await an in-flight continuation before interrupting', async () => {
		const gate = new DeferredPromise<void>();
		const h = setup(() => gate.p);
		h.controller.ask('item', questions);
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers);
		h.controller.clear();
		let idle = false;
		const waiting = h.controller.whenIdle().then(() => { idle = true; });
		await tick();
		assert.strictEqual(idle, false);
		await gate.complete();
		await waiting;
		assert.strictEqual(idle, true);
	});

	test('multiple outstanding requests all remain answerable after native completion', () => {
		const h = setup();
		h.controller.ask('first', questions);
		h.controller.ask('second', [{ title: 'Any details?', options: null }]);
		h.controller.holdCompletion(completed());
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Cancel);
		assert.deepStrictEqual(h.finished, []);
		h.controller.respond(h.shown[1].id, ChatInputResponseKind.Cancel);
		assert.deepStrictEqual(h.finished, [completed()]);
	});


	test('stale answer acknowledgement cannot clear replacement question completion', async () => {
		const gate = new DeferredPromise<string>();
		const h = setup(() => gate.p);
		h.controller.ask('old', questions);
		h.controller.respond(h.shown[0].id, ChatInputResponseKind.Accept, answers);
		h.controller.clear();
		h.controller.ask('replacement', questions);
		h.controller.holdCompletion(completed('replacement-turn'));
		await gate.complete('old-turn');
		await h.controller.whenIdle();
		h.controller.respond(h.shown[1].id, ChatInputResponseKind.Cancel);
		assert.deepStrictEqual(h.finished, [completed('replacement-turn')]);
	});

});
