/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { BracketElectricCharacterSupport, IElectricAction } from 'vs/editor/common/modes/supports/electricCharacter';
import { createFakeScopedLineTokens, TokenText } from 'vs/editor/test/common/modesTestUtils';
import { RichEditBrackets } from 'vs/editor/common/modes/supports/richEditBrackets';

suite('Editor Modes - Auto Indentation', () => {
	function _testOnElectricCharacter(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], character: string, offset: number): IElectricAction {
		return electricCharacterSupport.onElectricCharacter(character, createFakeScopedLineTokens('test', line), offset);
	}

	function testDoesNothing(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], character: string, offset: number): void {
		let actual = _testOnElectricCharacter(electricCharacterSupport, line, character, offset);
		assert.deepEqual(actual, null);
	}

	function testAppends(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], character: string, offset: number, appendText: string): void {
		let actual = _testOnElectricCharacter(electricCharacterSupport, line, character, offset);
		assert.deepEqual(actual, { appendText: appendText });
	}

	function testMatchBracket(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], character: string, offset: number, matchOpenBracket: string): void {
		let actual = _testOnElectricCharacter(electricCharacterSupport, line, character, offset);
		assert.deepEqual(actual, { matchOpenBracket: matchOpenBracket });
	}

	test('Doc comments', () => {
		var brackets = new BracketElectricCharacterSupport(null, [{ open: '/**', close: ' */' }], null);

		testAppends(brackets, [
			{ text: '/*', type: 'doc' },
		], '*', 3, ' */');

		testDoesNothing(brackets, [
			{ text: '/*', type: 'doc' },
			{ text: ' ', type: 'doc' },
			{ text: '*/', type: 'doc' },
		], '*', 3);
	});

	test('getElectricCharacters uses all sources and dedups', () => {
		var sup = new BracketElectricCharacterSupport(
			new RichEditBrackets('test', [
				['{', '}'],
				['(', ')']
			]), [
				{ open: '{', close: '}', notIn: ['string', 'comment'] },
				{ open: '"', close: '"', notIn: ['string', 'comment'] },
				{ open: 'begin', close: 'end', notIn: ['string'] }
			],
			{ docComment: { open: '/**', close: ' */' } }
		);

		assert.deepEqual(sup.getElectricCharacters(), ['}', ')', 'n', '*']);
	});

	test('auto-close', () => {
		var sup = new BracketElectricCharacterSupport(
			new RichEditBrackets('test', [
				['{', '}'],
				['(', ')']
			]), [
				{ open: '{', close: '}', notIn: ['string', 'comment'] },
				{ open: '"', close: '"', notIn: ['string', 'comment'] },
				{ open: 'begin', close: 'end', notIn: ['string'] }
			],
			{ docComment: { open: '/**', close: ' */' } }
		);

		testDoesNothing(sup, [], 'a', 0);

		testDoesNothing(sup, [{ text: 'egi', type: '' }], 'b', 1);
		testDoesNothing(sup, [{ text: 'bgi', type: '' }], 'e', 2);
		testDoesNothing(sup, [{ text: 'bei', type: '' }], 'g', 3);
		testDoesNothing(sup, [{ text: 'beg', type: '' }], 'i', 4);

		testDoesNothing(sup, [{ text: 'egin', type: '' }], 'b', 1);
		testDoesNothing(sup, [{ text: 'bgin', type: '' }], 'e', 2);
		testDoesNothing(sup, [{ text: 'bein', type: '' }], 'g', 3);
		testDoesNothing(sup, [{ text: 'begn', type: '' }], 'i', 4);
		testAppends(sup, [{ text: 'begi', type: '' }], 'n', 5, 'end');

		testDoesNothing(sup, [{ text: '3gin', type: '' }], 'b', 1);
		testDoesNothing(sup, [{ text: 'bgin', type: '' }], '3', 2);
		testDoesNothing(sup, [{ text: 'b3in', type: '' }], 'g', 3);
		testDoesNothing(sup, [{ text: 'b3gn', type: '' }], 'i', 4);
		testDoesNothing(sup, [{ text: 'b3gi', type: '' }], 'n', 5);

		testDoesNothing(sup, [{ text: 'begi', type: 'string' }], 'n', 5);

		testAppends(sup, [{ text: '"', type: 'string' }, { text: 'begi', type: '' }], 'n', 6, 'end');
		testDoesNothing(sup, [{ text: '"', type: 'string' }, { text: 'begi', type: 'string' }], 'n', 6);

		testAppends(sup, [{ text: '/*', type: 'string' }], '*', 3, ' */');

		testDoesNothing(sup, [{ text: 'begi', type: '' }, { text: 'end', type: '' }], 'n', 5);
	});

	test('matchOpenBracket', () => {
		var sup = new BracketElectricCharacterSupport(
			new RichEditBrackets('test', [
				['{', '}'],
				['(', ')']
			]), [
				{ open: '{', close: '}', notIn: ['string', 'comment'] },
				{ open: '"', close: '"', notIn: ['string', 'comment'] },
				{ open: 'begin', close: 'end', notIn: ['string'] }
			],
			{ docComment: { open: '/**', close: ' */' } }
		);

		testDoesNothing(sup, [{ text: '\t{', type: '' }], '\t', 1);
		testDoesNothing(sup, [{ text: '\t{', type: '' }], '\t', 2);
		testDoesNothing(sup, [{ text: '\t\t', type: '' }], '{', 3);

		testDoesNothing(sup, [{ text: '\t}', type: '' }], '\t', 1);
		testDoesNothing(sup, [{ text: '\t}', type: '' }], '\t', 2);
		testMatchBracket(sup, [{ text: '\t\t', type: '' }], '}', 3, '}');
	});
});
