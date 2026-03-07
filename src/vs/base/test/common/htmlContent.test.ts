/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isEmptyMarkdownString, MarkdownString } from '../../common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('htmlContent', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('isEmptyMarkdownString', () => {
		test('null or undefined', () => {
			assert.strictEqual(isEmptyMarkdownString(null), true);
			assert.strictEqual(isEmptyMarkdownString(undefined), true);
		});

		test('single MarkdownString', () => {
			assert.strictEqual(isEmptyMarkdownString(new MarkdownString('')), true);
			assert.strictEqual(isEmptyMarkdownString({ value: '' }), true);
			assert.strictEqual(isEmptyMarkdownString(new MarkdownString('text')), false);
			assert.strictEqual(isEmptyMarkdownString({ value: 'text' }), false);
		});

		test('array of MarkdownStrings', () => {
			assert.strictEqual(isEmptyMarkdownString([]), true);
			assert.strictEqual(isEmptyMarkdownString([new MarkdownString('')]), true);
			assert.strictEqual(isEmptyMarkdownString([{ value: '' }]), true);
			assert.strictEqual(isEmptyMarkdownString([new MarkdownString(''), { value: '' }]), true);

			assert.strictEqual(isEmptyMarkdownString([new MarkdownString('text')]), false);
			assert.strictEqual(isEmptyMarkdownString([{ value: 'text' }]), false);
			assert.strictEqual(isEmptyMarkdownString([new MarkdownString(''), { value: 'text' }]), false);
			assert.strictEqual(isEmptyMarkdownString([new MarkdownString('text'), { value: '' }]), false);
			assert.strictEqual(isEmptyMarkdownString([{ value: 'text1' }, { value: 'text2' }]), false);
		});
	});
});
