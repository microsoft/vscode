/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind } from '../../common/state/protocol/state.js';
import {
	buildAskUserSessionInputQuestions,
	buildExitPlanModeReviewRequest,
	ExitPlanModeAction,
	exitPlanModeQuestionId,
	flattenAskUserAnswers,
	parseAskUserQuestionInput,
	resolveExitPlanModeAnswer,
	type ParsedAskUserQuestionInput,
} from '../../node/claude/claudeInteractiveTools.js';

/**
 * Pure-projection tests for [claudeInteractiveTools.ts](../../node/claude/claudeInteractiveTools.ts).
 * The agent's `_handleExitPlanMode` and `_handleAskUserQuestion` are
 * 4-line orchestrators delegating SDK ↔ workbench projections to these
 * helpers; testing the projections directly avoids the agent harness.
 */
suite('claudeInteractiveTools', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildExitPlanModeReviewRequest', () => {

		test('carries the plan-review payload with three approve actions', () => {
			const planUri = URI.file('/home/u/.claude/plans/plan.md');
			const request = buildExitPlanModeReviewRequest('# step 1', planUri, 'tool_use_42', false);

			assert.strictEqual(request.id, 'tool_use_42');
			assert.strictEqual(readChatInputRequestPurpose(request), ChatInputRequestPurpose.PlanReview);
			const planReview = request.planReview;
			assert.ok(planReview);
			assert.strictEqual(planReview.content, '# step 1');
			assert.strictEqual(planReview.canProvideFeedback, true);
			assert.strictEqual(planReview.planUri, planUri.toString());
			assert.strictEqual(planReview.answerQuestionId, exitPlanModeQuestionId('tool_use_42'));
			assert.deepStrictEqual(planReview.actions.map(a => a.id), ['approve', 'approveAcceptEdits', 'approveBypass']);
			assert.deepStrictEqual(planReview.actions.map(a => a.default), [true, undefined, undefined]);
			assert.deepStrictEqual(planReview.actions.map(a => a.permissionLevel), [undefined, undefined, 'bypass']);
		});

		test('mirrors the actions onto a required single-select question with freeform input; omits planUri when untracked', () => {
			const request = buildExitPlanModeReviewRequest('plan', undefined, 'req-1', false);

			assert.strictEqual(request.planReview?.planUri, undefined);
			assert.strictEqual(request.questions?.length, 1);
			const question = request.questions![0];
			assert.strictEqual(question.id, exitPlanModeQuestionId('req-1'));
			assert.strictEqual(question.required, true);
			assert.ok(question.kind === ChatInputQuestionKind.SingleSelect);
			assert.strictEqual(question.allowFreeformInput, true);
			assert.deepStrictEqual(question.options.map(o => o.id), request.planReview!.actions.map(a => a.id));
		});

		test('offers only the plain Approve action when the auto-approve policy is restricted', () => {
			const request = buildExitPlanModeReviewRequest('plan', undefined, 'req-2', true);

			assert.deepStrictEqual(request.planReview?.actions.map(a => a.id), ['approve']);
			const question = request.questions![0];
			assert.ok(question.kind === ChatInputQuestionKind.SingleSelect);
			assert.deepStrictEqual(question.options.map(o => o.id), ['approve']);
		});
	});

	suite('resolveExitPlanModeAnswer', () => {

		const questionId = 'q1';

		test('maps each action id onto its permission mode', () => {
			for (const [action, mode] of [
				[ExitPlanModeAction.Approve, 'default'],
				[ExitPlanModeAction.ApproveAcceptEdits, 'acceptEdits'],
				[ExitPlanModeAction.ApproveBypass, 'bypassPermissions'],
			] as const) {
				const resolved = resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {
					[questionId]: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: action } },
				}, questionId);
				assert.deepStrictEqual(resolved, { kind: 'approved', mode });
			}
		});

		test('clamps an unknown action id to the default action mode', () => {
			const resolved = resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {
				[questionId]: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'bogus' } },
			}, questionId);
			assert.deepStrictEqual(resolved, { kind: 'approved', mode: 'default' });
		});

		test('freeform feedback wins over a selected action', () => {
			const resolved = resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {
				[questionId]: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: ExitPlanModeAction.ApproveBypass, freeformValues: [' add tests first '] } },
			}, questionId);
			assert.deepStrictEqual(resolved, { kind: 'feedback', feedback: 'add tests first' });
		});

		test('plain text answers resolve to feedback', () => {
			const resolved = resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {
				[questionId]: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'redo it' } },
			}, questionId);
			assert.deepStrictEqual(resolved, { kind: 'feedback', feedback: 'redo it' });
		});

		test('declines when the accepted answer carries neither a selection nor feedback', () => {
			const whitespaceText = resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {
				[questionId]: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: '   ' } },
			}, questionId);
			const emptySelection = resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {
				[questionId]: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: '' } },
			}, questionId);

			assert.deepStrictEqual({ whitespaceText, emptySelection }, {
				whitespaceText: { kind: 'declined' },
				emptySelection: { kind: 'declined' },
			});
		});

		test('declines on cancel, decline, skipped, and missing answers', () => {
			assert.deepStrictEqual(resolveExitPlanModeAnswer(ChatInputResponseKind.Cancel, undefined, questionId), { kind: 'declined' });
			assert.deepStrictEqual(resolveExitPlanModeAnswer(ChatInputResponseKind.Decline, undefined, questionId), { kind: 'declined' });
			assert.deepStrictEqual(resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {}, questionId), { kind: 'declined' });
			assert.deepStrictEqual(resolveExitPlanModeAnswer(ChatInputResponseKind.Accept, {
				[questionId]: { state: ChatInputAnswerState.Skipped },
			}, questionId), { kind: 'declined' });
		});
	});

	suite('parseAskUserQuestionInput', () => {

		test('returns undefined when questions is missing or empty', () => {
			assert.strictEqual(parseAskUserQuestionInput({}), undefined);
			assert.strictEqual(parseAskUserQuestionInput({ questions: [] }), undefined);
		});

		test('narrows non-empty questions array', () => {
			const parsed = parseAskUserQuestionInput({
				questions: [{ question: 'Q?', header: 'h', options: [] }],
			});
			assert.ok(parsed);
			assert.strictEqual(parsed.questions.length, 1);
		});
	});

	suite('buildAskUserSessionInputQuestions', () => {

		test('single-select question maps options 1:1 with header as id', () => {
			const askInput: ParsedAskUserQuestionInput = {
				questions: [{
					question: 'Pick one',
					header: 'pick',
					options: [
						{ label: 'A', description: 'first' },
						{ label: 'B' },
					],
				}],
			};

			const result = buildAskUserSessionInputQuestions(askInput);

			assert.deepStrictEqual(result, [{
				id: 'pick',
				kind: ChatInputQuestionKind.SingleSelect,
				title: 'pick',
				message: 'Pick one',
				options: [
					{ id: 'A', label: 'A', description: 'first' },
					{ id: 'B', label: 'B' },
				],
				allowFreeformInput: false,
			}]);
		});

		test('multi-select flips question kind and honors allowFreeformInput', () => {
			const askInput: ParsedAskUserQuestionInput = {
				questions: [{
					question: 'Pick many',
					header: 'pickMany',
					options: [{ label: 'X' }],
					multiSelect: true,
					allowFreeformInput: true,
				}],
			};

			const result = buildAskUserSessionInputQuestions(askInput);

			const question = result[0];
			assert.strictEqual(question.kind, ChatInputQuestionKind.MultiSelect);
			assert.strictEqual(question.kind === ChatInputQuestionKind.MultiSelect ? question.allowFreeformInput : undefined, true);
		});

		test('falls back to q-{idx} id when header is empty', () => {
			const askInput: ParsedAskUserQuestionInput = {
				questions: [
					{ question: 'first', header: '', options: [] },
					{ question: 'second', header: '', options: [] },
				],
			};

			const result = buildAskUserSessionInputQuestions(askInput);

			assert.strictEqual(result[0].id, 'q-0');
			assert.strictEqual(result[1].id, 'q-1');
		});
	});

	suite('flattenAskUserAnswers', () => {

		const askInput: ParsedAskUserQuestionInput = {
			questions: [
				{ question: 'What is your name?', header: 'name', options: [] },
				{ question: 'Pick one', header: 'one', options: [{ label: 'A' }, { label: 'B' }] },
				{ question: 'Pick many', header: 'many', options: [{ label: 'X' }, { label: 'Y' }] },
				{ question: 'Skipped one', header: 'skipped', options: [] },
			],
		};

		test('flattens text, single-select with freeform, multi-select with freeform; drops skipped', () => {
			const answers = flattenAskUserAnswers(askInput, {
				name: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'Ada' },
				},
				one: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'A', freeformValues: ['extra'] },
				},
				many: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['X', 'Y'], freeformValues: ['Z'] },
				},
				skipped: {
					state: ChatInputAnswerState.Skipped,
				},
			});

			assert.deepStrictEqual(answers, {
				'What is your name?': 'Ada',
				'Pick one': 'A, extra',
				'Pick many': 'X, Y, Z',
			});
		});

		test('returns empty object when every answer is skipped or missing', () => {
			const answers = flattenAskUserAnswers(askInput, {
				skipped: { state: ChatInputAnswerState.Skipped },
			});

			assert.deepStrictEqual(answers, {});
		});

		test('drops single-select answers with no value and no freeform', () => {
			const answers = flattenAskUserAnswers(askInput, {
				one: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: '' },
				},
			});

			assert.deepStrictEqual(answers, {});
		});

		test('keys empty-header questions by positional q-{idx} id (round-trips with buildAskUserSessionInputQuestions)', () => {
			const blankHeaderInput: ParsedAskUserQuestionInput = {
				questions: [
					{ question: 'first?', header: '', options: [] },
					{ question: 'second?', header: 'named', options: [] },
				],
			};
			const answers = flattenAskUserAnswers(blankHeaderInput, {
				'q-0': {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'one' },
				},
				named: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'two' },
				},
			});

			assert.deepStrictEqual(answers, {
				'first?': 'one',
				'second?': 'two',
			});
		});
	});
});
