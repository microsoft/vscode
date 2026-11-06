/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { IChatQuestion } from '../../common/chatService/chatService.js';
import {
	findQuestionValidationFailure,
	getDisplayedQuestionText,
	getOptionsWithDefaultsFirst,
} from '../../common/chatService/chatQuestionCarouselHelpers.js';

suite('ChatQuestionCarouselHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const single: IChatQuestion = {
		id: 'q_single',
		type: 'singleSelect',
		title: 'Which region?',
		required: true,
		options: [
			{ id: 'o1', label: 'West US', value: 'westus' },
			{ id: 'o2', label: 'East US', value: 'eastus' },
		],
	};

	const multi: IChatQuestion = {
		id: 'q_multi',
		type: 'multiSelect',
		title: 'Which features?',
		allowFreeformInput: true,
		options: [
			{ id: 'o1', label: 'Auth', value: 'auth' },
			{ id: 'o2', label: 'Search', value: 'search' },
			{ id: 'o3', label: 'Billing', value: 'billing' },
		],
	};

	const text: IChatQuestion = { id: 'q_text', type: 'text', title: 'Anything else?' };

	suite('getOptionsWithDefaultsFirst', () => {
		test('preserves declared order when there is no default', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst(single).map(o => o.option.value),
				['westus', 'eastus'],
			);
		});

		test('hoists a single default to the front', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...single, defaultValue: 'o2' }).map(o => o.option.value),
				['eastus', 'westus'],
			);
		});

		test('hoists several defaults, keeping their relative order', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...multi, defaultValue: ['o3', 'o1'] }).map(o => o.option.value),
				['auth', 'billing', 'search'],
			);
		});

		test('matches defaults by option id, not by option value', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...single, defaultValue: 'eastus' }).map(o => o.option.value),
				['westus', 'eastus'],
			);
		});

		test('returns an empty list for a question with no options', () => {
			assert.deepStrictEqual(getOptionsWithDefaultsFirst(text), []);
		});

		test('keeps originalIndex pointing at the declared position', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...single, defaultValue: 'o2' }).map(o => o.originalIndex),
				[1, 0],
			);
		});
	});

	suite('getDisplayedQuestionText', () => {
		test('prefers message, which is where the built-in tool puts the question', () => {
			assert.strictEqual(
				getDisplayedQuestionText({ ...single, message: 'Which region should this deploy to?' }),
				'Which region should this deploy to?',
			);
		});

		test('falls back to title when there is no message', () => {
			assert.strictEqual(getDisplayedQuestionText(single), 'Which region?');
		});

		test('passes a markdown message through untouched', () => {
			const message = { value: '**Which** region?' } as IMarkdownString;
			assert.strictEqual(getDisplayedQuestionText({ ...single, message }), message);
		});
	});

	suite('findQuestionValidationFailure', () => {
		test('accepts a value inside every bound', () => {
			assert.strictEqual(
				findQuestionValidationFailure('42', { minLength: 1, maxLength: 3, minimum: 0, maximum: 99, isInteger: true }),
				undefined,
			);
		});

		test('reports the bound that was broken', () => {
			assert.deepStrictEqual(findQuestionValidationFailure('ab', { minLength: 3 }), { kind: 'minLength', limit: 3 });
			assert.deepStrictEqual(findQuestionValidationFailure('abcd', { maxLength: 3 }), { kind: 'maxLength', limit: 3 });
			assert.deepStrictEqual(findQuestionValidationFailure('1', { minimum: 5 }), { kind: 'minimum', limit: 5 });
			assert.deepStrictEqual(findQuestionValidationFailure('9', { maximum: 5 }), { kind: 'maximum', limit: 5 });
		});

		test('reports a malformed value by format', () => {
			assert.deepStrictEqual(findQuestionValidationFailure('nope', { format: 'email' }), { kind: 'email' });
			assert.deepStrictEqual(findQuestionValidationFailure('nope', { format: 'uri' }), { kind: 'uri' });
			assert.deepStrictEqual(findQuestionValidationFailure('01-02-2026', { format: 'date' }), { kind: 'date' });
			assert.deepStrictEqual(findQuestionValidationFailure('nope', { format: 'date-time' }), { kind: 'dateTime' });
			assert.deepStrictEqual(findQuestionValidationFailure('nope', { minimum: 1 }), { kind: 'number' });
			assert.deepStrictEqual(findQuestionValidationFailure('1.5', { isInteger: true }), { kind: 'integer' });
		});
	});
});
