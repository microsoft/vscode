/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {BracketsUtils} from 'vs/editor/common/modes/supports/richEditBrackets';
import {IEditorRange} from 'vs/editor/common/editorCommon';

suite('richEditBrackets', () => {

	function findPrevBracketInToken(reversedBracketRegex:RegExp, lineText:string, currentTokenStart:number, currentTokenEnd:number): IEditorRange {
		return BracketsUtils.findPrevBracketInToken(reversedBracketRegex, 1, lineText, currentTokenStart, currentTokenEnd);
	}

	function findNextBracketInToken(forwardBracketRegex:RegExp, lineText:string, currentTokenStart:number, currentTokenEnd:number): IEditorRange {
		return BracketsUtils.findNextBracketInToken(forwardBracketRegex, 1, lineText, currentTokenStart, currentTokenEnd);
	}

	test('findPrevBracketInToken one char 1', () => {
		let result = findPrevBracketInToken(/(\{)|(\})/i, '{', 0, 1);
		assert.equal(result.startColumn, 1);
		assert.equal(result.endColumn, 2);
	});

	test('findPrevBracketInToken one char 2', () => {
		let result = findPrevBracketInToken(/(\{)|(\})/i, '{{', 0, 1);
		assert.equal(result.startColumn, 1);
		assert.equal(result.endColumn, 2);
	});

	test('findPrevBracketInToken one char 3', () => {
		let result = findPrevBracketInToken(/(\{)|(\})/i, '{hello world!', 0, 13);
		assert.equal(result.startColumn, 1);
		assert.equal(result.endColumn, 2);
	});

	test('findPrevBracketInToken more chars 1', () => {
		let result = findPrevBracketInToken(/(olleh)/i, 'hello world!', 0, 12);
		assert.equal(result.startColumn, 1);
		assert.equal(result.endColumn, 6);
	});

	test('findPrevBracketInToken more chars 2', () => {
		let result = findPrevBracketInToken(/(olleh)/i, 'hello world!', 0, 5);
		assert.equal(result.startColumn, 1);
		assert.equal(result.endColumn, 6);
	});

	test('findPrevBracketInToken more chars 3', () => {
		let result = findPrevBracketInToken(/(olleh)/i, ' hello world!', 0, 6);
		assert.equal(result.startColumn, 2);
		assert.equal(result.endColumn, 7);
	});

	test('findNextBracketInToken one char', () => {
		let result = findNextBracketInToken(/(\{)|(\})/i, '{', 0, 1);
		assert.equal(result.startColumn, 1);
		assert.equal(result.endColumn, 2);
	});

	test('findNextBracketInToken more chars', () => {
		let result = findNextBracketInToken(/(world)/i, 'hello world!', 0, 12);
		assert.equal(result.startColumn, 7);
		assert.equal(result.endColumn, 12);
	});

	test('issue #3894: [Handlebars] Curly braces edit issues', () => {
		let result = findPrevBracketInToken(/(\-\-!<)|(>\-\-)|(\{\{)|(\}\})/i, '{{asd}}', 0, 2);
		assert.equal(result.startColumn, 1);
		assert.equal(result.endColumn, 3);
	});

});