/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {TextModel} from 'vs/editor/common/model/textModel';

function testGuessIndentation(expectedInsertSpaces:boolean, expectedTabSize:number, text:string[], msg?:string): void {
	var m = new TextModel([], TextModel.toRawText(text.join('\n')));
	var r = m.guessIndentation(1337);
	m.dispose();

	assert.equal(r.insertSpaces, expectedInsertSpaces, msg);
	assert.equal(r.tabSize, expectedTabSize, msg);
}

function guessesTabs(expectedTabSize:number, text:string[], msg?:string): void {
	testGuessIndentation(false, expectedTabSize, text, msg);
}

function guessesSpaces(expectedTabSize:number, text:string[], msg?:string): void {
	testGuessIndentation(true, expectedTabSize, text, msg);
}

suite('Editor Model - TextModel', () => {

	test('getValueLengthInRange', () => {

		var m = new TextModel([], TextModel.toRawText('My First Line\r\nMy Second Line\r\nMy Third Line'));
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1, 1)), ''.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1, 2)), 'M'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 1, 3)), 'y'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1, 14)), 'My First Line'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 2, 1)), 'My First Line\r\n'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 2, 1)), 'y First Line\r\n'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 2, 2)), 'y First Line\r\nM'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 2, 1000)), 'y First Line\r\nMy Second Line'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 3, 1)), 'y First Line\r\nMy Second Line\r\n'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 3, 1000)), 'y First Line\r\nMy Second Line\r\nMy Third Line'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1000, 1000)), 'My First Line\r\nMy Second Line\r\nMy Third Line'.length);

		m = new TextModel([], TextModel.toRawText('My First Line\nMy Second Line\nMy Third Line'));
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1, 1)), ''.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1, 2)), 'M'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 1, 3)), 'y'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1, 14)), 'My First Line'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 2, 1)), 'My First Line\n'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 2, 1)), 'y First Line\n'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 2, 2)), 'y First Line\nM'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 2, 1000)), 'y First Line\nMy Second Line'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 3, 1)), 'y First Line\nMy Second Line\n'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 2, 3, 1000)), 'y First Line\nMy Second Line\nMy Third Line'.length);
		assert.equal(m.getValueLengthInRange(new Range(1, 1, 1000, 1000)), 'My First Line\nMy Second Line\nMy Third Line'.length);
	});

	test('guess indentation 1', () => {

		guessesSpaces(1337, [
			'x',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], 'no clues');

		guessesTabs(1337, [
			'\tx',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], 'no spaces, 1xTAB');

		guessesSpaces(2, [
			'  x',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], '1x2');

		guessesTabs(1337, [
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx'
		], '7xTAB');

		guessesSpaces(2, [
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
		], '4x2, 4xTAB');
		guessesTabs(1337, [
			'\tx',
			' x',
			'\tx',
			' x',
			'\tx',
			' x',
			'\tx',
			' x'
		], '4x1, 4xTAB');
		guessesTabs(2, [
			'\tx',
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
		], '4x2, 5xTAB');
		guessesTabs(2, [
			'\tx',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'  x',
		], '1x2, 5xTAB');
		guessesTabs(4, [
			'\tx',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'    x',
		], '1x4, 5xTAB');
		guessesTabs(2, [
			'\tx',
			'\tx',
			'x',
			'\tx',
			'x',
			'\tx',
			'  x',
			'\tx',
			'    x',
		], '1x2, 1x4, 5xTAB');

		guessesSpaces(1337, [
			'x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x'
		], '7x1 - 1 space is never guessed as an indentation');
		guessesSpaces(1337, [
			'',
			'  ',
			'    ',
			'      ',
			'        ',
			'          ',
			'            ',
			'              ',
		], 'whitespace lines don\'t count');
		guessesSpaces(4, [
			'x',
			'   x',
			'   x',
			'    x',
			'x',
			'   x',
			'   x',
			'    x',
			'x',
			'   x',
			'   x',
			'    x',
		], 'odd number is not allowed: 6x3, 3x4');
		guessesSpaces(4, [
			'x',
			'     x',
			'     x',
			'    x',
			'x',
			'     x',
			'     x',
			'    x',
			'x',
			'     x',
			'     x',
			'    x',
		], 'odd number is not allowed: 6x5, 3x4');
		guessesSpaces(4, [
			'x',
			'       x',
			'       x',
			'    x',
			'x',
			'       x',
			'       x',
			'    x',
			'x',
			'       x',
			'       x',
			'    x',
		], 'odd number is not allowed: 6x7, 3x4');
		guessesSpaces(2, [
			'x',
			'  x',
			'  x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
			'  x',
			'  x',
		], '8x2');

		guessesSpaces(2, [
			'x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
			'x',
			'  x',
			'  x',
		], '8x2');
		guessesSpaces(2, [
			'x',
			'  x',
			'    x',
			'x',
			'  x',
			'    x',
			'x',
			'  x',
			'    x',
			'x',
			'  x',
			'    x',
		], '4x2, 4x4');
		guessesSpaces(2, [
			'x',
			'  x',
			'  x',
			'    x',
			'x',
			'  x',
			'  x',
			'    x',
			'x',
			'  x',
			'  x',
			'    x',
		], '6x2, 3x4');
		guessesSpaces(2, [
			'x',
			'  x',
			'  x',
			'    x',
			'    x',
			'x',
			'  x',
			'  x',
			'    x',
			'    x',
		], '4x2, 4x4');
		guessesSpaces(2, [
			'x',
			'  x',
			'    x',
			'    x',
			'x',
			'  x',
			'    x',
			'    x',
		], '2x2, 4x4');
		guessesSpaces(4, [
			'x',
			'    x',
			'    x',
			'x',
			'    x',
			'    x',
			'x',
			'    x',
			'    x',
			'x',
			'    x',
			'    x',
		], '8x4');
		guessesSpaces(2, [
			'x',
			'  x',
			'    x',
			'    x',
			'      x',
			'x',
			'  x',
			'    x',
			'    x',
			'      x',
		], '2x2, 4x4, 2x6');
		guessesSpaces(2, [
			'x',
			'  x',
			'    x',
			'    x',
			'      x',
			'      x',
			'        x',
		], '1x2, 2x4, 2x6, 1x8');
		guessesSpaces(4, [
			'x',
			'    x',
			'    x',
			'    x',
			'     x',
			'        x',
			'x',
			'    x',
			'    x',
			'    x',
			'     x',
			'        x',
		], '6x4, 2x5, 2x8');
		guessesSpaces(4, [
			'x',
			'    x',
			'    x',
			'    x',
			'     x',
			'        x',
			'        x',
		], '3x4, 1x5, 2x8');
		guessesSpaces(4, [
			'x',
			'x',
			'    x',
			'    x',
			'     x',
			'        x',
			'        x',
			'x',
			'x',
			'    x',
			'    x',
			'     x',
			'        x',
			'        x',
		], '6x4, 2x5, 4x8');
		guessesSpaces(4, [
			'x',
			' x',
			' x',
			' x',
			' x',
			' x',
			'x',
			'   x',
			'    x',
			'    x',
		], '5x1, 2x0, 1x3, 2x4');
	});

	test('modifyPosition', () => {

		var m = new TextModel([], TextModel.toRawText('line one\nline two'));
		assert.deepEqual(m.modifyPosition(new Position(1,1), 0), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(0,0), 0), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(30, 1), 0), new Position(2, 1));

		assert.deepEqual(m.modifyPosition(new Position(1,1), 17), new Position(2, 9));
		assert.deepEqual(m.modifyPosition(new Position(1,1), 1), new Position(1, 2));
		assert.deepEqual(m.modifyPosition(new Position(1,1), 3), new Position(1, 4));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), 10), new Position(2, 3));
		assert.deepEqual(m.modifyPosition(new Position(1, 5), 13), new Position(2, 9));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), 16), new Position(2, 9));

		assert.deepEqual(m.modifyPosition(new Position(2, 9), -17), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(1,2), -1), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(1,4), -3), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(2, 3), -10), new Position(1, 2));
		assert.deepEqual(m.modifyPosition(new Position(2, 9), -13), new Position(1, 5));
		assert.deepEqual(m.modifyPosition(new Position(2, 9), -16), new Position(1, 2));

		assert.throws(() => m.modifyPosition(new Position(1, 2), 17));
		assert.throws(() => m.modifyPosition(new Position(1, 2), 100));

		assert.throws(() => m.modifyPosition(new Position(1, 2), -2));
		assert.throws(() => m.modifyPosition(new Position(1, 2), -100));
		assert.throws(() => m.modifyPosition(new Position(2, 2), -100));
		assert.throws(() => m.modifyPosition(new Position(2, 9), -18));
	});
});
