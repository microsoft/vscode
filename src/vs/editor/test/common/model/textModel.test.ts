/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { TextModel, ITextModelCreationData } from 'vs/editor/common/model/textModel';
import { DefaultEndOfLine, TextModelResolvedOptions } from 'vs/editor/common/editorCommon';
import { RawTextSource } from 'vs/editor/common/model/textSource';

function testGuessIndentation(defaultInsertSpaces: boolean, defaultTabSize: number, expectedInsertSpaces: boolean, expectedTabSize: number, text: string[], msg?: string): void {
	var m = TextModel.createFromString(
		text.join('\n'),
		{
			tabSize: defaultTabSize,
			insertSpaces: defaultInsertSpaces,
			detectIndentation: true,
			defaultEOL: DefaultEndOfLine.LF,
			trimAutoWhitespace: true
		}
	);
	var r = m.getOptions();
	m.dispose();

	assert.equal(r.insertSpaces, expectedInsertSpaces, msg);
	assert.equal(r.tabSize, expectedTabSize, msg);
}

function assertGuess(expectedInsertSpaces: boolean, expectedTabSize: number, text: string[], msg?: string): void {
	if (typeof expectedInsertSpaces === 'undefined') {
		// cannot guess insertSpaces
		if (typeof expectedTabSize === 'undefined') {
			// cannot guess tabSize
			testGuessIndentation(true, 13370, true, 13370, text, msg);
			testGuessIndentation(false, 13371, false, 13371, text, msg);
		} else {
			// can guess tabSize
			testGuessIndentation(true, 13370, true, expectedTabSize, text, msg);
			testGuessIndentation(false, 13371, false, expectedTabSize, text, msg);
		}
	} else {
		// can guess insertSpaces
		if (typeof expectedTabSize === 'undefined') {
			// cannot guess tabSize
			testGuessIndentation(true, 13370, expectedInsertSpaces, 13370, text, msg);
			testGuessIndentation(false, 13371, expectedInsertSpaces, 13371, text, msg);
		} else {
			// can guess tabSize
			testGuessIndentation(true, 13370, expectedInsertSpaces, expectedTabSize, text, msg);
			testGuessIndentation(false, 13371, expectedInsertSpaces, expectedTabSize, text, msg);
		}
	}
}

suite('TextModelData.fromString', () => {

	function testTextModelDataFromString(text: string, expected: ITextModelCreationData): void {
		const rawTextSource = RawTextSource.fromString(text);
		const actual = TextModel.resolveCreationData(rawTextSource, TextModel.DEFAULT_CREATION_OPTIONS);
		assert.deepEqual(actual, expected);
	}

	test('one line text', () => {
		testTextModelDataFromString('Hello world!', {
			text: {
				BOM: '',
				EOL: '\n',
				length: 12,
				'lines': [
					'Hello world!'
				],
				containsRTL: false,
				isBasicASCII: true
			},
			options: new TextModelResolvedOptions({
				defaultEOL: DefaultEndOfLine.LF,
				insertSpaces: true,
				tabSize: 4,
				trimAutoWhitespace: true,
			})
		});
	});

	test('multiline text', () => {
		testTextModelDataFromString('Hello,\r\ndear friend\nHow\rare\r\nyou?', {
			text: {
				BOM: '',
				EOL: '\r\n',
				length: 33,
				'lines': [
					'Hello,',
					'dear friend',
					'How',
					'are',
					'you?'
				],
				containsRTL: false,
				isBasicASCII: true
			},
			options: new TextModelResolvedOptions({
				defaultEOL: DefaultEndOfLine.LF,
				insertSpaces: true,
				tabSize: 4,
				trimAutoWhitespace: true,
			})
		});
	});

	test('Non Basic ASCII 1', () => {
		testTextModelDataFromString('Hello,\nZürich', {
			text: {
				BOM: '',
				EOL: '\n',
				length: 13,
				'lines': [
					'Hello,',
					'Zürich'
				],
				containsRTL: false,
				isBasicASCII: false
			},
			options: new TextModelResolvedOptions({
				defaultEOL: DefaultEndOfLine.LF,
				insertSpaces: true,
				tabSize: 4,
				trimAutoWhitespace: true,
			})
		});
	});

	test('containsRTL 1', () => {
		testTextModelDataFromString('Hello,\nזוהי עובדה מבוססת שדעתו', {
			text: {
				BOM: '',
				EOL: '\n',
				length: 30,
				'lines': [
					'Hello,',
					'זוהי עובדה מבוססת שדעתו'
				],
				containsRTL: true,
				isBasicASCII: false
			},
			options: new TextModelResolvedOptions({
				defaultEOL: DefaultEndOfLine.LF,
				insertSpaces: true,
				tabSize: 4,
				trimAutoWhitespace: true,
			})
		});
	});

	test('containsRTL 2', () => {
		testTextModelDataFromString('Hello,\nهناك حقيقة مثبتة منذ زمن طويل', {
			text: {
				BOM: '',
				EOL: '\n',
				length: 36,
				'lines': [
					'Hello,',
					'هناك حقيقة مثبتة منذ زمن طويل'
				],
				containsRTL: true,
				isBasicASCII: false
			},
			options: new TextModelResolvedOptions({
				defaultEOL: DefaultEndOfLine.LF,
				insertSpaces: true,
				tabSize: 4,
				trimAutoWhitespace: true,
			})
		});
	});

});

suite('Editor Model - TextModel', () => {

	test('getValueLengthInRange', () => {

		var m = TextModel.createFromString('My First Line\r\nMy Second Line\r\nMy Third Line');
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

		m = TextModel.createFromString('My First Line\nMy Second Line\nMy Third Line');
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

		assertGuess(undefined, undefined, [
			'x',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], 'no clues');

		assertGuess(false, undefined, [
			'\tx',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], 'no spaces, 1xTAB');

		assertGuess(true, 2, [
			'  x',
			'x',
			'x',
			'x',
			'x',
			'x',
			'x'
		], '1x2');

		assertGuess(false, undefined, [
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx',
			'\tx'
		], '7xTAB');

		assertGuess(undefined, 2, [
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
			'\tx',
			'  x',
		], '4x2, 4xTAB');
		assertGuess(false, undefined, [
			'\tx',
			' x',
			'\tx',
			' x',
			'\tx',
			' x',
			'\tx',
			' x'
		], '4x1, 4xTAB');
		assertGuess(false, 2, [
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
		assertGuess(false, 2, [
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
		assertGuess(false, 4, [
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
		assertGuess(false, 2, [
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

		assertGuess(undefined, undefined, [
			'x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x'
		], '7x1 - 1 space is never guessed as an indentation');
		assertGuess(true, undefined, [
			'x',
			'          x',
			' x',
			' x',
			' x',
			' x',
			' x',
			' x'
		], '1x10, 6x1');
		assertGuess(undefined, undefined, [
			'',
			'  ',
			'    ',
			'      ',
			'        ',
			'          ',
			'            ',
			'              ',
		], 'whitespace lines don\'t count');
		assertGuess(true, 4, [
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
		assertGuess(true, 4, [
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
		assertGuess(true, 4, [
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
		assertGuess(true, 2, [
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

		assertGuess(true, 2, [
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
		assertGuess(true, 2, [
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
		assertGuess(true, 2, [
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
		assertGuess(true, 2, [
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
		assertGuess(true, 2, [
			'x',
			'  x',
			'    x',
			'    x',
			'x',
			'  x',
			'    x',
			'    x',
		], '2x2, 4x4');
		assertGuess(true, 4, [
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
		assertGuess(true, 2, [
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
		assertGuess(true, 2, [
			'x',
			'  x',
			'    x',
			'    x',
			'      x',
			'      x',
			'        x',
		], '1x2, 2x4, 2x6, 1x8');
		assertGuess(true, 4, [
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
		assertGuess(true, 4, [
			'x',
			'    x',
			'    x',
			'    x',
			'     x',
			'        x',
			'        x',
		], '3x4, 1x5, 2x8');
		assertGuess(true, 4, [
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
		assertGuess(true, 4, [
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
		assertGuess(false, undefined, [
			'\t x',
			' \t x',
			'\tx'
		], 'mixed whitespace 1');
		assertGuess(false, 4, [
			'\tx',
			'\t    x'
		], 'mixed whitespace 2');
	});

	test('validatePosition', () => {

		let m = TextModel.createFromString('line one\nline two');

		assert.deepEqual(m.validatePosition(new Position(0, 0)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(0, 1)), new Position(1, 1));

		assert.deepEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
		assert.deepEqual(m.validatePosition(new Position(1, 30)), new Position(1, 9));

		assert.deepEqual(m.validatePosition(new Position(2, 0)), new Position(2, 1));
		assert.deepEqual(m.validatePosition(new Position(2, 1)), new Position(2, 1));
		assert.deepEqual(m.validatePosition(new Position(2, 2)), new Position(2, 2));
		assert.deepEqual(m.validatePosition(new Position(2, 30)), new Position(2, 9));

		assert.deepEqual(m.validatePosition(new Position(3, 0)), new Position(2, 9));
		assert.deepEqual(m.validatePosition(new Position(3, 1)), new Position(2, 9));
		assert.deepEqual(m.validatePosition(new Position(3, 30)), new Position(2, 9));

		assert.deepEqual(m.validatePosition(new Position(30, 30)), new Position(2, 9));

		assert.deepEqual(m.validatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(Number.MIN_VALUE, Number.MIN_VALUE)), new Position(1, 1));

		assert.deepEqual(m.validatePosition(new Position(Number.MAX_VALUE, Number.MAX_VALUE)), new Position(2, 9));
		assert.deepEqual(m.validatePosition(new Position(123.23, 47.5)), new Position(2, 9));
	});

	test('validatePosition around high-low surrogate pairs 1', () => {

		let m = TextModel.createFromString('a📚b');

		assert.deepEqual(m.validatePosition(new Position(0, 0)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(0, 1)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(0, 7)), new Position(1, 1));

		assert.deepEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
		assert.deepEqual(m.validatePosition(new Position(1, 3)), new Position(1, 2));
		assert.deepEqual(m.validatePosition(new Position(1, 4)), new Position(1, 4));
		assert.deepEqual(m.validatePosition(new Position(1, 5)), new Position(1, 5));
		assert.deepEqual(m.validatePosition(new Position(1, 30)), new Position(1, 5));

		assert.deepEqual(m.validatePosition(new Position(2, 0)), new Position(1, 5));
		assert.deepEqual(m.validatePosition(new Position(2, 1)), new Position(1, 5));
		assert.deepEqual(m.validatePosition(new Position(2, 2)), new Position(1, 5));
		assert.deepEqual(m.validatePosition(new Position(2, 30)), new Position(1, 5));

		assert.deepEqual(m.validatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(Number.MIN_VALUE, Number.MIN_VALUE)), new Position(1, 1));

		assert.deepEqual(m.validatePosition(new Position(Number.MAX_VALUE, Number.MAX_VALUE)), new Position(1, 5));
		assert.deepEqual(m.validatePosition(new Position(123.23, 47.5)), new Position(1, 5));
	});

	test('validatePosition around high-low surrogate pairs 2', () => {

		let m = TextModel.createFromString('a📚📚b');

		assert.deepEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
		assert.deepEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
		assert.deepEqual(m.validatePosition(new Position(1, 3)), new Position(1, 2));
		assert.deepEqual(m.validatePosition(new Position(1, 4)), new Position(1, 4));
		assert.deepEqual(m.validatePosition(new Position(1, 5)), new Position(1, 4));
		assert.deepEqual(m.validatePosition(new Position(1, 6)), new Position(1, 6));
		assert.deepEqual(m.validatePosition(new Position(1, 7)), new Position(1, 7));

	});

	test('validateRange around high-low surrogate pairs 1', () => {

		let m = TextModel.createFromString('a📚b');

		assert.deepEqual(m.validateRange(new Range(0, 0, 0, 1)), new Range(1, 1, 1, 1));
		assert.deepEqual(m.validateRange(new Range(0, 0, 0, 7)), new Range(1, 1, 1, 1));

		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 1)), new Range(1, 1, 1, 1));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 2)), new Range(1, 1, 1, 2));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 3)), new Range(1, 1, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 4)), new Range(1, 1, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 5)), new Range(1, 1, 1, 5));

		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 2)), new Range(1, 2, 1, 2));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 3)), new Range(1, 2, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 4)), new Range(1, 2, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 5)), new Range(1, 2, 1, 5));

		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 3)), new Range(1, 2, 1, 2));
		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 4)), new Range(1, 2, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 5)), new Range(1, 2, 1, 5));

		assert.deepEqual(m.validateRange(new Range(1, 4, 1, 4)), new Range(1, 4, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 4, 1, 5)), new Range(1, 4, 1, 5));

		assert.deepEqual(m.validateRange(new Range(1, 5, 1, 5)), new Range(1, 5, 1, 5));
	});

	test('validateRange around high-low surrogate pairs 2', () => {

		let m = TextModel.createFromString('a📚📚b');

		assert.deepEqual(m.validateRange(new Range(0, 0, 0, 1)), new Range(1, 1, 1, 1));
		assert.deepEqual(m.validateRange(new Range(0, 0, 0, 7)), new Range(1, 1, 1, 1));

		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 1)), new Range(1, 1, 1, 1));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 2)), new Range(1, 1, 1, 2));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 3)), new Range(1, 1, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 4)), new Range(1, 1, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 5)), new Range(1, 1, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 6)), new Range(1, 1, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 1, 1, 7)), new Range(1, 1, 1, 7));

		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 2)), new Range(1, 2, 1, 2));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 3)), new Range(1, 2, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 4)), new Range(1, 2, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 5)), new Range(1, 2, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 6)), new Range(1, 2, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 2, 1, 7)), new Range(1, 2, 1, 7));

		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 3)), new Range(1, 2, 1, 2));
		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 4)), new Range(1, 2, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 5)), new Range(1, 2, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 6)), new Range(1, 2, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 3, 1, 7)), new Range(1, 2, 1, 7));

		assert.deepEqual(m.validateRange(new Range(1, 4, 1, 4)), new Range(1, 4, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 4, 1, 5)), new Range(1, 4, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 4, 1, 6)), new Range(1, 4, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 4, 1, 7)), new Range(1, 4, 1, 7));

		assert.deepEqual(m.validateRange(new Range(1, 5, 1, 5)), new Range(1, 4, 1, 4));
		assert.deepEqual(m.validateRange(new Range(1, 5, 1, 6)), new Range(1, 4, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 5, 1, 7)), new Range(1, 4, 1, 7));

		assert.deepEqual(m.validateRange(new Range(1, 6, 1, 6)), new Range(1, 6, 1, 6));
		assert.deepEqual(m.validateRange(new Range(1, 6, 1, 7)), new Range(1, 6, 1, 7));

		assert.deepEqual(m.validateRange(new Range(1, 7, 1, 7)), new Range(1, 7, 1, 7));
	});

	test('modifyPosition', () => {

		var m = TextModel.createFromString('line one\nline two');
		assert.deepEqual(m.modifyPosition(new Position(1, 1), 0), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(0, 0), 0), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(30, 1), 0), new Position(2, 9));

		assert.deepEqual(m.modifyPosition(new Position(1, 1), 17), new Position(2, 9));
		assert.deepEqual(m.modifyPosition(new Position(1, 1), 1), new Position(1, 2));
		assert.deepEqual(m.modifyPosition(new Position(1, 1), 3), new Position(1, 4));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), 10), new Position(2, 3));
		assert.deepEqual(m.modifyPosition(new Position(1, 5), 13), new Position(2, 9));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), 16), new Position(2, 9));

		assert.deepEqual(m.modifyPosition(new Position(2, 9), -17), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), -1), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(1, 4), -3), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(2, 3), -10), new Position(1, 2));
		assert.deepEqual(m.modifyPosition(new Position(2, 9), -13), new Position(1, 5));
		assert.deepEqual(m.modifyPosition(new Position(2, 9), -16), new Position(1, 2));

		assert.deepEqual(m.modifyPosition(new Position(1, 2), 17), new Position(2, 9));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), 100), new Position(2, 9));

		assert.deepEqual(m.modifyPosition(new Position(1, 2), -2), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), -100), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(2, 2), -100), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(2, 9), -18), new Position(1, 1));
	});

	test('normalizeIndentation 1', () => {
		let model = TextModel.createFromString('',
			{
				detectIndentation: false,
				tabSize: 4,
				insertSpaces: false,
				trimAutoWhitespace: true,
				defaultEOL: DefaultEndOfLine.LF
			}
		);

		assert.equal(model.normalizeIndentation('\t'), '\t');
		assert.equal(model.normalizeIndentation('    '), '\t');
		assert.equal(model.normalizeIndentation('   '), '   ');
		assert.equal(model.normalizeIndentation('  '), '  ');
		assert.equal(model.normalizeIndentation(' '), ' ');
		assert.equal(model.normalizeIndentation(''), '');
		assert.equal(model.normalizeIndentation(' \t   '), '\t\t');
		assert.equal(model.normalizeIndentation(' \t  '), '\t   ');
		assert.equal(model.normalizeIndentation(' \t '), '\t  ');
		assert.equal(model.normalizeIndentation(' \t'), '\t ');

		assert.equal(model.normalizeIndentation('\ta'), '\ta');
		assert.equal(model.normalizeIndentation('    a'), '\ta');
		assert.equal(model.normalizeIndentation('   a'), '   a');
		assert.equal(model.normalizeIndentation('  a'), '  a');
		assert.equal(model.normalizeIndentation(' a'), ' a');
		assert.equal(model.normalizeIndentation('a'), 'a');
		assert.equal(model.normalizeIndentation(' \t   a'), '\t\ta');
		assert.equal(model.normalizeIndentation(' \t  a'), '\t   a');
		assert.equal(model.normalizeIndentation(' \t a'), '\t  a');
		assert.equal(model.normalizeIndentation(' \ta'), '\t a');

		model.dispose();
	});

	test('normalizeIndentation 2', () => {
		let model = TextModel.createFromString('',
			{
				detectIndentation: false,
				tabSize: 4,
				insertSpaces: true,
				trimAutoWhitespace: true,
				defaultEOL: DefaultEndOfLine.LF
			}
		);

		assert.equal(model.normalizeIndentation('\ta'), '    a');
		assert.equal(model.normalizeIndentation('    a'), '    a');
		assert.equal(model.normalizeIndentation('   a'), '   a');
		assert.equal(model.normalizeIndentation('  a'), '  a');
		assert.equal(model.normalizeIndentation(' a'), ' a');
		assert.equal(model.normalizeIndentation('a'), 'a');
		assert.equal(model.normalizeIndentation(' \t   a'), '        a');
		assert.equal(model.normalizeIndentation(' \t  a'), '       a');
		assert.equal(model.normalizeIndentation(' \t a'), '      a');
		assert.equal(model.normalizeIndentation(' \ta'), '     a');

		model.dispose();
	});
});

suite('TextModel.mightContainRTL', () => {

	test('nope', () => {
		let model = TextModel.createFromString('hello world!');
		assert.equal(model.mightContainRTL(), false);
	});

	test('yes', () => {
		let model = TextModel.createFromString('Hello,\nזוהי עובדה מבוססת שדעתו');
		assert.equal(model.mightContainRTL(), true);
	});

	test('setValue resets 1', () => {
		let model = TextModel.createFromString('hello world!');
		assert.equal(model.mightContainRTL(), false);
		model.setValue('Hello,\nזוהי עובדה מבוססת שדעתו');
		assert.equal(model.mightContainRTL(), true);
	});

	test('setValue resets 2', () => {
		let model = TextModel.createFromString('Hello,\nهناك حقيقة مثبتة منذ زمن طويل');
		assert.equal(model.mightContainRTL(), true);
		model.setValue('hello world!');
		assert.equal(model.mightContainRTL(), false);
	});

});