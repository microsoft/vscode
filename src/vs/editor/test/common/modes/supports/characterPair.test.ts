/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { CharacterPairSupport } from 'vs/editor/common/modes/supports/characterPair';
import { TokenText, createFakeScopedLineTokens } from 'vs/editor/test/common/modesTestUtils';

suite('CharacterPairSupport', () => {

	test('only autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [{ open: 'a', close: 'b' }] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), [{ open: 'a', close: 'b', _standardTokenMask: 0 }]);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b', _standardTokenMask: 0 }]);
	});

	test('only empty autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('only brackets', () => {
		let characaterPairSupport = new CharacterPairSupport({ brackets: [['a', 'b']] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), [{ open: 'a', close: 'b', _standardTokenMask: 0 }]);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b', _standardTokenMask: 0 }]);
	});

	test('only empty brackets', () => {
		let characaterPairSupport = new CharacterPairSupport({ brackets: [] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('only surroundingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ surroundingPairs: [{ open: 'a', close: 'b' }] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b' }]);
	});

	test('only empty surroundingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ surroundingPairs: [] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('brackets is ignored when having autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [], brackets: [['a', 'b']] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	function testShouldAutoClose(characterPairSupport: CharacterPairSupport, line: TokenText[], character: string, column: number): boolean {
		return characterPairSupport.shouldAutoClosePair(character, createFakeScopedLineTokens('test', line), column);
	}

	test('shouldAutoClosePair in empty line', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [], 'a', 1), true);
		assert.equal(testShouldAutoClose(sup, [], '{', 1), true);
	});

	test('shouldAutoClosePair in not interesting line 1', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'keyword' }], '{', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'keyword' }], 'a', 3), true);
	});

	test('shouldAutoClosePair in not interesting line 2', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}' }] });
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'string' }], '{', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'string' }], 'a', 3), true);
	});

	test('shouldAutoClosePair in interesting line 1', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 1), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 2), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 3), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 4), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 4), true);
	});

	test('shouldAutoClosePair in interesting line 2', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 4), false);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 4), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 5), false);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 5), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 6), false);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 6), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 7), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 7), true);
	});

	test('shouldAutoClosePair in interesting line 3', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 3), false);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 4), false);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 4), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 5), false);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 5), true);
	});

});
