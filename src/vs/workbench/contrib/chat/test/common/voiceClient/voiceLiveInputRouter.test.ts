/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IVoiceSessionContext, IVoiceSessionPending } from '../../../common/voiceClient/voiceClientService.js';
import { VoiceLiveInputRouter } from '../../../common/voiceClient/voiceLiveInputRouter.js';

suite('VoiceLiveInputRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const approval: IVoiceSessionPending = { type: 'approval', request_id: 'request', pending_id: 'approval', message: 'Run the command?' };
	const questions: IVoiceSessionPending = {
		type: 'questions', request_id: 'request', pending_id: 'questions', allow_skip: true,
		questions: [
			{ id: 'region', type: 'singleSelect', title: 'Which region?', allow_freeform: false, options: [{ label: 'West', value: 'westus' }, { label: 'East', value: 'eastus' }] },
			{ id: 'name', type: 'text', title: 'What name?', allow_freeform: true, options: [] },
		],
	};

	function context(active: string, pending?: IVoiceSessionPending, displayLocale = 'en-US'): IVoiceSessionContext {
		return {
			display_locale: displayLocale,
			sessions: ['chat-session:/a', 'chat-session:/b'].map(id => ({
				id, is_active: id === active, agent_state: pending ? 'waiting_for_confirmation' : 'idle', pending,
			})),
		};
	}

	test('pins an approval to the captured input even when another session has the identical prompt', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval));
		const target = router.captureTarget();
		router.updateContext(context('chat-session:/b', approval));
		assert.deepStrictEqual(router.resolve('call', 'Yes.', target), {
			toolCall: {
				callId: 'call', name: 'respond_to_session', args: {
					coding_session_id: 'chat-session:/a', request_id: 'request', pending_id: 'approval', response: { type: 'approve' },
				}
			},
		});
	});

	test('does not interpret qualified or ambiguous approval as consent or as a new chat request', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval));
		assert.deepStrictEqual(['yes, but wait', 'do not approve', 'maybe', 'approve both', 'approve?', 'approved?', 'I accept if it is safe', 'I accept, but wait', 'I do not accept'].map(text => {
			const result = router.resolve(text, text, router.captureTarget());
			return result.clarification !== undefined;
		}), [true, true, true, true, true, true, true, true, true]);
	});

	test('accepts complete natural approval phrases without guessing or changing the prompt owner', () => {
		assert.deepStrictEqual(['approve', 'approved.', 'accept', 'accepted!', 'allow', 'yes', 'I approve', 'I  accept.'].map(text => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval));
			const target = router.captureTarget();
			router.updateContext(context('chat-session:/b', approval));
			const result = router.resolve('natural-approval', text, target);
			return { session: result.toolCall?.args.coding_session_id, response: result.toolCall?.args.response };
		}), Array.from({ length: 8 }, () => ({ session: 'chat-session:/a', response: { type: 'approve' } })));
	});

	test('rejects resolved, replaced, or changed pending occurrences', () => {
		assert.deepStrictEqual([undefined, { ...approval, pending_id: 'replacement' }, { ...approval, message: 'Run a different command?' }].map(pending => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval));
			const target = router.captureTarget();
			router.updateContext(context('chat-session:/a', pending));
			return router.resolve('call', 'approve', target).clarification !== undefined;
		}), [true, true, true]);
	});

	test('collects a form sequentially and submits exact option values to its owning pending item', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		const first = router.resolve('first', 'option two', router.captureTarget());
		const final = router.resolve('final', 'My deployment', router.captureTarget());
		assert.deepStrictEqual({ first, final }, {
			first: { clarification: 'What name?' },
			final: {
				toolCall: {
					callId: 'final', name: 'respond_to_session', args: {
						coding_session_id: 'chat-session:/a', request_id: 'request', pending_id: 'questions',
						response: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }, { question_id: 'name', freeform: 'My deployment' }] },
					}
				}
			},
		});
	});

	test('refuses an ordinal captured before the same pending form reordered its options', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		const target = router.captureTarget();
		router.updateContext(context('chat-session:/a', {
			...questions,
			questions: questions.questions?.map(question => ({ ...question, options: [...question.options].reverse() })),
		}));
		assert.strictEqual(router.resolve('old-option-order', 'second', target).clarification !== undefined, true);
	});

	test('clears partial form answers when the same pending occurrence republishes a changed schema', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		router.resolve('old-first', 'first', router.captureTarget());
		const oldSecond = router.captureTarget();
		router.updateContext(context('chat-session:/a', {
			...questions,
			questions: questions.questions?.map(question => ({
				...question,
				options: question.options.map(option => ({ ...option, value: `new-${option.value}` })),
			})),
		}));
		const resetIndex = router.captureTarget().questionIndex;
		const nextPrompt = router.getQuestionPrompt('chat-session:/a', 'questions');
		const stale = router.resolve('old-second', 'Old deployment', oldSecond);
		router.resolve('new-first', 'first', router.captureTarget());
		const final = router.resolve('new-second', 'New deployment', router.captureTarget());
		assert.deepStrictEqual({ resetIndex, nextPrompt, stale: stale.clarification !== undefined, response: final.toolCall?.args.response }, {
			resetIndex: 0, nextPrompt: 'Which region? 1. West 2. East', stale: true,
			response: { type: 'answer', answers: [{ question_id: 'region', value: 'new-westus' }, { question_id: 'name', freeform: 'New deployment' }] },
		});
	});

	test('keeps partial form answers isolated across inputs and refuses a stale question turn', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		const stale = router.captureTarget();
		router.resolve('first-a', 'first', router.captureTarget());
		router.updateContext(context('chat-session:/b', questions));
		const firstB = router.resolve('first-b', 'second', router.captureTarget());
		const staleA = router.resolve('late-a', 'first', stale);
		router.updateContext(context('chat-session:/a', questions));
		const finalA = router.resolve('final-a', 'A deployment', router.captureTarget());
		assert.deepStrictEqual({
			firstB, staleA: staleA.clarification !== undefined,
			answers: finalA.toolCall?.args.response,
		}, {
			firstB: { clarification: 'What name?' }, staleA: true,
			answers: { type: 'answer', answers: [{ question_id: 'region', value: 'westus' }, { question_id: 'name', freeform: 'A deployment' }] },
		});
	});

	test('does not submit the same approval twice and permits a retry after a rejected dispatch', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval));
		const target = router.captureTarget();
		router.resolve('first', 'approve', target);
		const duplicate = router.resolve('duplicate', 'approve', target);
		router.handleResult('first', { ok: false, reason: 'stale_pending' });
		const retry = router.resolve('retry', 'reject', router.captureTarget());
		assert.deepStrictEqual({
			duplicate: duplicate.clarification !== undefined, retry: retry.toolCall?.args.response,
		}, { duplicate: true, retry: { type: 'reject' } });
	});

	test('does not guess an answer for duplicate labels, out-of-range ordinals, or unsupported prompts', () => {
		const duplicate = { ...questions, questions: [{ ...questions.questions![0], options: [{ label: 'Same', value: 'a' }, { label: 'Same', value: 'b' }] }] };
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', duplicate));
		const results = ['Same', 'third'].map(text => router.resolve(text, text, router.captureTarget()).clarification !== undefined);
		router.updateContext({ sessions: [{ id: 'chat-session:/a', is_active: true, agent_state: 'waiting_for_confirmation', confirmation_type: 'elicitation' }], display_locale: 'en-US' });
		results.push(router.resolve('unsupported', 'yes', router.captureTarget()).clarification !== undefined);
		assert.deepStrictEqual(results, [true, true, true]);
	});

	test('pins ordinary dictation and refuses it if a pending prompt appeared during capture', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a'));
		const target = router.captureTarget();
		router.updateContext(context('chat-session:/b'));
		const sent = router.resolve('send', 'Fix tests', target);
		router.updateContext(context('chat-session:/b', approval));
		const blocked = router.resolve('late', 'Fix tests', target);
		assert.deepStrictEqual({ sent, blocked: blocked.clarification !== undefined }, {
			sent: { toolCall: { callId: 'send', name: 'send_to_chat', args: { text: 'Fix tests', coding_session_id: 'chat-session:/a' } } }, blocked: true,
		});
	});

	test('does not bypass an active pending prompt for a navigation-like utterance', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext({
			display_locale: 'en-US',
			sessions: [
				{ id: 'chat-session:/a', label: 'Alpha', is_active: true, agent_state: 'waiting_for_confirmation', pending: approval },
				{ id: 'chat-session:/b', label: 'Favorite chocolate', is_active: false, agent_state: 'idle' },
			],
		});

		assert.strictEqual(router.resolve('switch', 'Switch to the favorite chocolate session.', router.captureTarget()).clarification !== undefined, true);
	});

	test('preserves session-related and non-English utterances as ordinary chat requests', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext({
			display_locale: 'de-DE',
			sessions: [
				{ id: 'chat-session:/a', label: 'Alpha', is_active: true, agent_state: 'idle' },
				{ id: 'chat-session:/b', label: 'Favorite chocolate', is_active: false, agent_state: 'idle' },
			],
		});
		const target = router.captureTarget();
		const utterances = [
			'Which session am I in right now?',
			'How many sessions do I have?',
			'Switch to the session named Favorite chocolate.',
			'Wechsle zur Sitzung Lieblingsschokolade.',
			'Fix the session timeout in the tests.',
		];

		assert.deepStrictEqual(utterances.map((text, index) => router.resolve(`call-${index}`, text, target).toolCall), utterances.map((text, index) => ({
			callId: `call-${index}`,
			name: 'send_to_chat',
			args: { text, coding_session_id: 'chat-session:/a' },
		})));
	});

	test('preserves adversarial long transcripts without intent parsing', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a'));
		const target = router.captureTarget();
		const repeatedDiscourse = `${'okay, '.repeat(50_000)}switch to the favorite chocolate session`;
		const repeatedAnnotations = `${'[mouth noise] '.repeat(50_000)}switch to the favorite chocolate session`;

		assert.deepStrictEqual([
			router.resolve('repeated-discourse', repeatedDiscourse, target).toolCall?.args.text,
			router.resolve('repeated-annotations', repeatedAnnotations, target).toolCall?.args.text,
		], [repeatedDiscourse, repeatedAnnotations]);
	});

	test('does not interpret non-English approval words but accepts localized labels and numeric choices', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval, 'de-DE'));
		const approvalResult = router.resolve('approval', 'ja', router.captureTarget());
		const localizedQuestions: IVoiceSessionPending = {
			...questions,
			questions: [{
				id: 'region',
				type: 'singleSelect',
				title: 'Welche Region?',
				allow_freeform: false,
				options: [{ label: 'Westen', value: 'westus' }, { label: 'Osten', value: 'eastus' }],
			}],
		};
		router.updateContext(context('chat-session:/a', localizedQuestions, 'de-DE'));
		const labelResult = router.resolve('label', 'Osten', router.captureTarget());
		router.handleResult('label', { ok: false, reason: 'invalid_answer' });
		const numericResult = router.resolve('numeric', '2', router.captureTarget());

		assert.deepStrictEqual({
			approvalRequiresChat: approvalResult.clarification !== undefined,
			label: labelResult.toolCall?.args.response,
			numeric: numericResult.toolCall?.args.response,
		}, {
			approvalRequiresChat: true,
			label: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }] },
			numeric: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }] },
		});
	});

	test('supports exact multi-select choices and explicit custom answers without guessing', () => {
		const router = new VoiceLiveInputRouter();
		const pending = { ...questions, questions: [{ ...questions.questions![0], type: 'multiSelect' as const, allow_freeform: true }] };
		router.updateContext(context('chat-session:/a', pending));
		const selected = router.resolve('multi', 'first and East', router.captureTarget());
		router.handleResult('multi', { ok: false, reason: 'invalid_answer' });
		const custom = router.resolve('custom', 'other Central US', router.captureTarget());
		assert.deepStrictEqual([selected, custom].map(result => result.toolCall?.args.response), [
			{ type: 'answer', answers: [{ question_id: 'region', values: ['westus', 'eastus'] }] },
			{ type: 'answer', answers: [{ question_id: 'region', freeform: 'Central US' }] },
		]);
	});

	test('revisiting a form narrates its current question and skipping preserves already supplied answers', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		router.resolve('first', 'West', router.captureTarget());
		const prompt = router.getQuestionPrompt('chat-session:/a', 'questions');
		const skipped = router.resolve('skip', 'skip', router.captureTarget());
		assert.deepStrictEqual({ prompt, response: skipped.toolCall?.args.response }, {
			prompt: 'What name?', response: { type: 'skip', answers: [{ question_id: 'region', value: 'westus' }] },
		});
	});

	test('does not treat skip as a text answer when skipping is disallowed', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', { ...questions, allow_skip: false, questions: [questions.questions![1]] }));
		assert.strictEqual(router.resolve('skip', 'skip', router.captureTarget()).clarification !== undefined, true);
	});

	test('does not confuse a numbered choice with a conflicting label or an unspoken option value', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', {
			...questions, questions: [{
				...questions.questions![0], options: [{ label: 'West', value: 'opaque-one' }, { label: 'One', value: 'opaque-two' }],
			}]
		}));
		assert.deepStrictEqual(['one', '1', 'opaque-one'].map(text => router.resolve(text, text, router.captureTarget()).clarification !== undefined), [true, true, true]);
	});
});
