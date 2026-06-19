/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputAnswer } from '../../../common/state/sessionState.js';
import { answerStrings, buildUserInputRequest, emptyUserInputResponse, userInputResponseFromAnswers } from '../../../node/codex/codexUserInputMapper.js';
import type { ToolRequestUserInputQuestion } from '../../../node/codex/protocol/generated/v2/ToolRequestUserInputQuestion.js';

suite('codexUserInputMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const selectQuestion: ToolRequestUserInputQuestion = {
		id: 'q1', header: 'Fruit', question: 'Favorite fruit?', isOther: true, isSecret: false,
		options: [{ label: 'Apple', description: 'a pome' }, { label: 'Banana', description: '' }],
	};
	const textQuestion: ToolRequestUserInputQuestion = {
		id: 'q2', header: 'Name', question: 'Your name?', isOther: false, isSecret: false, options: null,
	};

	test('buildUserInputRequest maps select and text questions', () => {
		assert.deepStrictEqual(buildUserInputRequest('req-1', [selectQuestion, textQuestion]), {
			id: 'req-1',
			questions: [
				{
					kind: ChatInputQuestionKind.SingleSelect,
					id: 'q1', title: 'Fruit', message: 'Favorite fruit?', required: true,
					options: [{ id: 'Apple', label: 'Apple', description: 'a pome' }, { id: 'Banana', label: 'Banana', description: undefined }],
					allowFreeformInput: true,
				},
				{ kind: ChatInputQuestionKind.Text, id: 'q2', title: 'Name', message: 'Your name?', required: true },
			],
		});
	});

	test('userInputResponseFromAnswers flattens answers per question id', () => {
		const answers: Record<string, ChatInputAnswer> = {
			q1: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'Banana' } },
			q2: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'Ada' } },
		};
		assert.deepStrictEqual(
			userInputResponseFromAnswers([selectQuestion, textQuestion], ChatInputResponseKind.Accept, answers),
			{ answers: { q1: { answers: ['Banana'] }, q2: { answers: ['Ada'] } } },
		);
	});

	test('declined/skipped/missing answers yield empty arrays', () => {
		const answers: Record<string, ChatInputAnswer> = {
			q1: { state: ChatInputAnswerState.Skipped },
		};
		assert.deepStrictEqual({
			declined: userInputResponseFromAnswers([selectQuestion], ChatInputResponseKind.Decline, answers),
			skipped: userInputResponseFromAnswers([selectQuestion], ChatInputResponseKind.Accept, answers),
			missing: userInputResponseFromAnswers([textQuestion], ChatInputResponseKind.Accept, {}),
			none: emptyUserInputResponse([selectQuestion, textQuestion]),
		}, {
			declined: { answers: { q1: { answers: [] } } },
			skipped: { answers: { q1: { answers: [] } } },
			missing: { answers: { q2: { answers: [] } } },
			none: { answers: { q1: { answers: [] }, q2: { answers: [] } } },
		});
	});

	test('answerStrings handles every value kind and freeform', () => {
		const accept = ChatInputResponseKind.Accept;
		const submitted = (value: Extract<ChatInputAnswer, { value: unknown }>['value']): ChatInputAnswer => ({ state: ChatInputAnswerState.Submitted, value });
		assert.deepStrictEqual({
			text: answerStrings(submitted({ kind: ChatInputAnswerValueKind.Text, value: 'hi' }), accept),
			number: answerStrings(submitted({ kind: ChatInputAnswerValueKind.Number, value: 42 }), accept),
			boolean: answerStrings(submitted({ kind: ChatInputAnswerValueKind.Boolean, value: true }), accept),
			selectedFreeform: answerStrings(submitted({ kind: ChatInputAnswerValueKind.Selected, value: 'Other', freeformValues: ['custom'] }), accept),
			selectedMany: answerStrings(submitted({ kind: ChatInputAnswerValueKind.SelectedMany, value: ['a', 'b'], freeformValues: ['c'] }), accept),
		}, {
			text: ['hi'],
			number: ['42'],
			boolean: ['true'],
			selectedFreeform: ['Other', 'custom'],
			selectedMany: ['a', 'b', 'c'],
		});
	});
});
