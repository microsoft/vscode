/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { StandardTokenType } from 'vs/editor/common/modes';
import { CharacterPairSupport } from 'vs/editor/common/modes/supports/characterPair';
import { TokenText, createFakeScopedLineTokens } from 'vs/editor/test/common/modesTestUtils';
import { StandardAutoClosingPairConditional } from 'vs/editor/common/modes/languageConfiguration';

suite('CharacterPairSupport', () => {

	test('only autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [{ open: 'a', close: 'b' }] });
		assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
		assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
	});

	test('only empty autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [] });
		assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('only brackets', () => {
		let characaterPairSupport = new CharacterPairSupport({ brackets: [['a', 'b']] });
		assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
		assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
	});

	test('only empty brackets', () => {
		let characaterPairSupport = new CharacterPairSupport({ brackets: [] });
		assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('only surroundingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ surroundingPairs: [{ open: 'a', close: 'b' }] });
		assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b' }]);
	});

	test('only empty surroundingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ surroundingPairs: [] });
		assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('brackets is ignored when having autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [], brackets: [['a', 'b']] });
		assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	function findAutoClosingPair(characterPairSupport: CharacterPairSupport, character: string): StandardAutoClosingPairConditional | undefined {
		return characterPairSupport.getAutoClosingPairs().find(autoClosingPair => autoClosingPair.open === character);
	}

	function testShouldAutoClose(characterPairSupport: CharacterPairSupport, line: TokenText[], character: string, column: number): boolean {
		const autoClosingPair = findAutoClosingPair(characterPairSupport, character);
		if (!autoClosingPair) {
			return false;
		}
		return CharacterPairSupport.shouldAutoClosePair(autoClosingPair, createFakeScopedLineTokens(line), column);
	}

	test('shouldAutoClosePair in empty line', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.strictEqual(testShouldAutoClose(sup, [], 'a', 1), false);
		assert.strictEqual(testShouldAutoClose(sup, [], '{', 1), true);
	});

	test('shouldAutoClosePair in not interesting line 1', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'do', type: StandardTokenType.Other }], '{', 3), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'do', type: StandardTokenType.Other }], 'a', 3), false);
	});

	test('shouldAutoClosePair in not interesting line 2', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}' }] });
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'do', type: StandardTokenType.String }], '{', 3), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'do', type: StandardTokenType.String }], 'a', 3), false);
	});

	test('shouldAutoClosePair in interesting line 1', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], '{', 1), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], 'a', 1), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], '{', 2), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], 'a', 2), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], '{', 3), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], 'a', 3), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], '{', 4), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: '"a"', type: StandardTokenType.String }], 'a', 4), false);
	});

	test('shouldAutoClosePair in interesting line 2', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], '{', 1), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], 'a', 1), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], '{', 2), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], 'a', 2), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], '{', 3), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], 'a', 3), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], '{', 4), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], 'a', 4), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], '{', 5), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], 'a', 5), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], '{', 6), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], 'a', 6), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], '{', 7), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: 'x=', type: StandardTokenType.Other }, { text: '"a"', type: StandardTokenType.String }, { text: ';', type: StandardTokenType.Other }], 'a', 7), false);
	});

	test('shouldAutoClosePair in interesting line 3', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], '{', 1), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], 'a', 1), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], '{', 2), true);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], 'a', 2), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], '{', 3), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], 'a', 3), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], '{', 4), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], 'a', 4), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], '{', 5), false);
		assert.strictEqual(testShouldAutoClose(sup, [{ text: ' ', type: StandardTokenType.Other }, { text: '//a', type: StandardTokenType.Comment }], 'a', 5), false);
	});

});
