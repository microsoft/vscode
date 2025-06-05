/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { BracketsUtils } from '../../../../common/languages/supports/richEditBrackets.js';

suite('richEditBrackets', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function findPrevBracketInRange(reversedBracketRegex: RegExp, lineText: string, currentTokenStart: number, currentTokenEnd: number): Range | null {
		return BracketsUtils.findPrevBracketInRange(reversedBracketRegex, 1, lineText, currentTokenStart, currentTokenEnd);
	}

	function findNextBracketInRange(forwardBracketRegex: RegExp, lineText: string, currentTokenStart: number, currentTokenEnd: number): Range | null {
		return BracketsUtils.findNextBracketInRange(forwardBracketRegex, 1, lineText, currentTokenStart, currentTokenEnd);
	}

	test('findPrevBracketInToken one char 1', () => {
		const result = findPrevBracketInRange(/(\{)|(\})/i, '{', 0, 1);
		assert.strictEqual(result!.startColumn, 1);
		assert.strictEqual(result!.endColumn, 2);
	});

	test('findPrevBracketInToken one char 2', () => {
		const result = findPrevBracketInRange(/(\{)|(\})/i, '{{', 0, 1);
		assert.strictEqual(result!.startColumn, 1);
		assert.strictEqual(result!.endColumn, 2);
	});

	test('findPrevBracketInToken one char 3', () => {
		const result = findPrevBracketInRange(/(\{)|(\})/i, '{hello world!', 0, 13);
		assert.strictEqual(result!.startColumn, 1);
		assert.strictEqual(result!.endColumn, 2);
	});

	test('findPrevBracketInToken more chars 1', () => {
		const result = findPrevBracketInRange(/(olleh)/i, 'hello world!', 0, 12);
		assert.strictEqual(result!.startColumn, 1);
		assert.strictEqual(result!.endColumn, 6);
	});

	test('findPrevBracketInToken more chars 2', () => {
		const result = findPrevBracketInRange(/(olleh)/i, 'hello world!', 0, 5);
		assert.strictEqual(result!.startColumn, 1);
		assert.strictEqual(result!.endColumn, 6);
	});

	test('findPrevBracketInToken more chars 3', () => {
		const result = findPrevBracketInRange(/(olleh)/i, ' hello world!', 0, 6);
		assert.strictEqual(result!.startColumn, 2);
		assert.strictEqual(result!.endColumn, 7);
	});

	test('findNextBracketInToken one char', () => {
		const result = findNextBracketInRange(/(\{)|(\})/i, '{', 0, 1);
		assert.strictEqual(result!.startColumn, 1);
		assert.strictEqual(result!.endColumn, 2);
	});

	test('findNextBracketInToken more chars', () => {
		const result = findNextBracketInRange(/(world)/i, 'hello world!', 0, 12);
		assert.strictEqual(result!.startColumn, 7);
		assert.strictEqual(result!.endColumn, 12);
	});

	test('findNextBracketInToken with emoty result', () => {
		const result = findNextBracketInRange(/(\{)|(\})/i, '', 0, 0);
		assert.strictEqual(result, null);
	});

	test('issue #3894: [Handlebars] Curly braces edit issues', () => {
		const result = findPrevBracketInRange(/(\-\-!<)|(>\-\-)|(\{\{)|(\}\})/i, '{{asd}}', 0, 2);
		assert.strictEqual(result!.startColumn, 1);
		assert.strictEqual(result!.endColumn, 3);
	});

});
