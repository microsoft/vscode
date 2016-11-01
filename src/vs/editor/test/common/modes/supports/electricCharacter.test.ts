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
	function _testOnElectricCharacter(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], offset: number): IElectricAction {
		return electricCharacterSupport.onElectricCharacter(createFakeScopedLineTokens('test', line), offset);
	}

	function testDoesNothing(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], offset: number): void {
		let actual = _testOnElectricCharacter(electricCharacterSupport, line, offset);
		assert.deepEqual(actual, null);
	}

	function testAppends(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], offset: number, appendText: string): void {
		let actual = _testOnElectricCharacter(electricCharacterSupport, line, offset);
		assert.deepEqual(actual, { appendText: appendText });
	}

	function testMatchBracket(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], offset: number, matchOpenBracket: string): void {
		let actual = _testOnElectricCharacter(electricCharacterSupport, line, offset);
		assert.deepEqual(actual, { matchOpenBracket: matchOpenBracket });
	}

	test('Doc comments', () => {
		var brackets = new BracketElectricCharacterSupport(null, [{ open: '/**', close: ' */' }], null);

		testAppends(brackets, [
			{ text: '/**', type: 'doc' },
		], 2, ' */');

		testDoesNothing(brackets, [
			{ text: '/**', type: 'doc' },
			{ text: ' ', type: 'doc' },
			{ text: '*/', type: 'doc' },
		], 2);
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

		testDoesNothing(sup, [], 0);

		testDoesNothing(sup, [{ text: 'begi', type: '' }], 0);
		testDoesNothing(sup, [{ text: 'begi', type: '' }], 1);
		testDoesNothing(sup, [{ text: 'begi', type: '' }], 2);
		testDoesNothing(sup, [{ text: 'begi', type: '' }], 3);
		testDoesNothing(sup, [{ text: 'begi', type: '' }], 4);

		testDoesNothing(sup, [{ text: 'begin', type: '' }], 0);
		testDoesNothing(sup, [{ text: 'begin', type: '' }], 1);
		testDoesNothing(sup, [{ text: 'begin', type: '' }], 2);
		testDoesNothing(sup, [{ text: 'begin', type: '' }], 3);
		testAppends(sup, [{ text: 'begin', type: '' }], 4, 'end');
		testDoesNothing(sup, [{ text: 'begin', type: '' }], 5);

		testDoesNothing(sup, [{ text: 'b3gin', type: '' }], 0);
		testDoesNothing(sup, [{ text: 'b3gin', type: '' }], 1);
		testDoesNothing(sup, [{ text: 'b3gin', type: '' }], 2);
		testDoesNothing(sup, [{ text: 'b3gin', type: '' }], 3);
		testDoesNothing(sup, [{ text: 'b3gin', type: '' }], 4);
		testDoesNothing(sup, [{ text: 'b3gin', type: '' }], 5);

		testDoesNothing(sup, [{ text: 'begin', type: 'string' }], 4);

		testAppends(sup, [{ text: '"', type: 'string' }, { text: 'begin', type: '' }], 5, 'end');
		testDoesNothing(sup, [{ text: '"', type: 'string' }, { text: 'begin', type: 'string' }], 5);

		testAppends(sup, [{ text: '/**', type: 'string' }], 2, ' */');

		testDoesNothing(sup, [{ text: 'begin', type: '' }, { text: 'end', type: '' }], 4);
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

		testDoesNothing(sup, [{ text: '\t\t{', type: '' }], 0);
		testDoesNothing(sup, [{ text: '\t\t{', type: '' }], 1);
		testDoesNothing(sup, [{ text: '\t\t{', type: '' }], 2);

		testDoesNothing(sup, [{ text: '\t\t}', type: '' }], 0);
		testDoesNothing(sup, [{ text: '\t\t}', type: '' }], 1);
		testMatchBracket(sup, [{ text: '\t\t}', type: '' }], 2, '}');
	});
});
