/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getOptionsWithDefaultsFirst, resolveQuestionAnswers, toCarouselAnswers } from '../../common/chatService/chatQuestionCarouselHelpers.js';
import { IChatQuestion } from '../../common/chatService/chatService.js';

suite('chatQuestionCarouselHelpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const singleSelect: IChatQuestion = {
		id: 'q1',
		type: 'singleSelect',
		title: 'Project type',
		options: [
			{ id: 'o1', label: 'Full Stack', value: 'fullstack' },
			{ id: 'o2', label: 'React Application', value: 'react' },
			{ id: 'o3', label: 'Node.js Backend', value: 'node' },
		],
		allowFreeformInput: true,
		required: true,
	};

	suite('getOptionsWithDefaultsFirst', () => {
		test('moves the default option(s) to the front, preserving order', () => {
			const ordered = getOptionsWithDefaultsFirst({ ...singleSelect, defaultValue: 'o2' });
			assert.deepStrictEqual(ordered.map(o => o.option.id), ['o2', 'o1', 'o3']);
		});

		test('keeps original order when there is no default', () => {
			const ordered = getOptionsWithDefaultsFirst(singleSelect);
			assert.deepStrictEqual(ordered.map(o => o.option.id), ['o1', 'o2', 'o3']);
		});
	});

	suite('resolveQuestionAnswers', () => {
		test('resolves a single-select answer by option value', () => {
			const { answers, invalid } = resolveQuestionAnswers([singleSelect], [{ question_id: 'q1', value: 'react' }]);
			assert.deepStrictEqual(invalid, []);
			assert.deepStrictEqual(answers['q1'], { selectedValue: 'react' });
		});

		test('resolves a single-select answer by 1-based ordinal in displayed order', () => {
			const { answers } = resolveQuestionAnswers([singleSelect], [{ question_id: 'q1', value: '2' }]);
			assert.deepStrictEqual(answers['q1'], { selectedValue: 'react' });
		});

		test('ordinal resolution honors defaults-first display order', () => {
			const q = { ...singleSelect, defaultValue: 'o3' };
			const { answers } = resolveQuestionAnswers([q], [{ question_id: 'q1', value: '1' }]);
			assert.deepStrictEqual(answers['q1'], { selectedValue: 'node' });
		});

		test('resolves a single-select answer by case-insensitive label', () => {
			const { answers } = resolveQuestionAnswers([singleSelect], [{ question_id: 'q1', value: 'full stack' }]);
			assert.deepStrictEqual(answers['q1'], { selectedValue: 'fullstack' });
		});

		test('falls back to freeform when nothing matches and freeform is allowed', () => {
			const { answers, invalid } = resolveQuestionAnswers([singleSelect], [{ question_id: 'q1', value: 'something else' }]);
			assert.deepStrictEqual(answers['q1'], { freeformValue: 'something else' });
			assert.deepStrictEqual(invalid, []);
		});

		test('reports invalid when nothing matches and freeform is disallowed', () => {
			const q = { ...singleSelect, allowFreeformInput: false };
			const { answers, invalid } = resolveQuestionAnswers([q], [{ question_id: 'q1', value: 'nope' }]);
			assert.strictEqual(answers['q1'], undefined);
			assert.deepStrictEqual(invalid, ['q1']);
		});

		test('passes a text answer through verbatim', () => {
			const textQ: IChatQuestion = { id: 'q2', type: 'text', title: 'Notes', allowFreeformInput: true };
			const { answers } = resolveQuestionAnswers([textQ], [{ question_id: 'q2', value: 'hello world' }]);
			assert.strictEqual(answers['q2'], 'hello world');
		});

		test('resolves multi-select values and keeps an unmatched token as freeform', () => {
			const multi: IChatQuestion = {
				id: 'q3',
				type: 'multiSelect',
				title: 'Features',
				options: [
					{ id: 'a', label: 'Auth', value: 'auth' },
					{ id: 'b', label: 'Billing', value: 'billing' },
				],
				allowFreeformInput: true,
			};
			const { answers } = resolveQuestionAnswers([multi], [{ question_id: 'q3', values: ['auth', '2', 'custom thing'] }]);
			assert.deepStrictEqual(answers['q3'], { selectedValues: ['auth', 'billing'], freeformValue: 'custom thing' });
		});

		test('reports an unknown question id as invalid without throwing', () => {
			const { answers, invalid } = resolveQuestionAnswers([singleSelect], [{ question_id: 'nope', value: 'x' }]);
			assert.deepStrictEqual(answers, {});
			assert.deepStrictEqual(invalid, ['nope']);
		});
	});

	suite('toCarouselAnswers', () => {
		test('returns undefined for an empty record (a skip)', () => {
			assert.strictEqual(toCarouselAnswers({}), undefined);
		});

		test('returns the record unchanged when it has answers', () => {
			const record = { q1: { selectedValue: 'fullstack' } };
			assert.strictEqual(toCarouselAnswers(record), record);
		});
	});
});
