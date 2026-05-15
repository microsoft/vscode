/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfirmationOptionKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, ToolCallStatus } from '../../common/state/protocol/state.js';
import {
	buildAskUserSessionInputQuestions,
	buildExitPlanModeConfirmationState,
	flattenAskUserAnswers,
	parseAskUserQuestionInput,
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

	suite('buildExitPlanModeConfirmationState', () => {

		test('renders the plan markdown body and Approve/Deny buttons', () => {
			const state = buildExitPlanModeConfirmationState({ plan: '# step 1' }, 'tool_use_42');

			assert.deepStrictEqual(state, {
				status: ToolCallStatus.PendingConfirmation,
				toolCallId: 'tool_use_42',
				toolName: 'ExitPlanMode',
				displayName: 'Ready to code?',
				invocationMessage: { markdown: '# step 1' },
				toolInput: '{"plan":"# step 1"}',
				confirmationTitle: 'Ready to code?',
				options: [
					{ id: 'approve', label: 'Approve', kind: ConfirmationOptionKind.Approve },
					{ id: 'deny', label: 'Deny', kind: ConfirmationOptionKind.Deny },
				],
			});
		});

		test('falls back to empty plan when input.plan is missing or wrong-typed', () => {
			const missing = buildExitPlanModeConfirmationState({}, 'tool_use_1');
			const wrongType = buildExitPlanModeConfirmationState({ plan: 123 }, 'tool_use_2');

			assert.deepStrictEqual(missing.invocationMessage, { markdown: '' });
			assert.deepStrictEqual(wrongType.invocationMessage, { markdown: '' });
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
				kind: SessionInputQuestionKind.SingleSelect,
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

			assert.strictEqual(result[0].kind, SessionInputQuestionKind.MultiSelect);
			assert.strictEqual(result[0].allowFreeformInput, true);
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
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Text, value: 'Ada' },
				},
				one: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: 'A', freeformValues: ['extra'] },
				},
				many: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ['X', 'Y'], freeformValues: ['Z'] },
				},
				skipped: {
					state: SessionInputAnswerState.Skipped,
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
				skipped: { state: SessionInputAnswerState.Skipped },
			});

			assert.deepStrictEqual(answers, {});
		});

		test('drops single-select answers with no value and no freeform', () => {
			const answers = flattenAskUserAnswers(askInput, {
				one: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: '' },
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
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Text, value: 'one' },
				},
				named: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Text, value: 'two' },
				},
			});

			assert.deepStrictEqual(answers, {
				'first?': 'one',
				'second?': 'two',
			});
		});
	});
});
