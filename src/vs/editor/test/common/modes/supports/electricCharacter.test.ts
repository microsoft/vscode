/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { BracketElectricCharacterSupport, IElectricAction } from 'vs/editor/common/languages/supports/electricCharacter';
import { RichEditBrackets } from 'vs/editor/common/languages/supports/richEditBrackets';
import { TokenText, createFakeScopedLineTokens } from 'vs/editor/test/common/modesTestUtils';

const fakeLanguageId = 'test';

suite('Editor Modes - Auto Indentation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function _testOnElectricCharacter(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], character: string, offset: number): IElectricAction | null {
		return electricCharacterSupport.onElectricCharacter(character, createFakeScopedLineTokens(line), offset);
	}

	function testDoesNothing(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], character: string, offset: number): void {
		const actual = _testOnElectricCharacter(electricCharacterSupport, line, character, offset);
		assert.deepStrictEqual(actual, null);
	}

	function testMatchBracket(electricCharacterSupport: BracketElectricCharacterSupport, line: TokenText[], character: string, offset: number, matchOpenBracket: string): void {
		const actual = _testOnElectricCharacter(electricCharacterSupport, line, character, offset);
		assert.deepStrictEqual(actual, { matchOpenBracket: matchOpenBracket });
	}

	test('getElectricCharacters uses all sources and dedups', () => {
		const sup = new BracketElectricCharacterSupport(
			new RichEditBrackets(fakeLanguageId, [
				['{', '}'],
				['(', ')']
			])
		);

		assert.deepStrictEqual(sup.getElectricCharacters(), ['}', ')']);
	});

	test('matchOpenBracket', () => {
		const sup = new BracketElectricCharacterSupport(
			new RichEditBrackets(fakeLanguageId, [
				['{', '}'],
				['(', ')']
			])
		);

		testDoesNothing(sup, [{ text: '\t{', type: StandardTokenType.Other }], '\t', 1);
		testDoesNothing(sup, [{ text: '\t{', type: StandardTokenType.Other }], '\t', 2);
		testDoesNothing(sup, [{ text: '\t\t', type: StandardTokenType.Other }], '{', 3);

		testDoesNothing(sup, [{ text: '\t}', type: StandardTokenType.Other }], '\t', 1);
		testDoesNothing(sup, [{ text: '\t}', type: StandardTokenType.Other }], '\t', 2);
		testMatchBracket(sup, [{ text: '\t\t', type: StandardTokenType.Other }], '}', 3, '}');
	});
});
