/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {TextModel} from 'vs/editor/common/model/textModel';
import {DefaultEndOfLine} from 'vs/editor/common/editorCommon';

function testGuessIndentation(defaultInsertSpaces:boolean, defaultTabSize:number, expectedInsertSpaces:boolean, expectedTabSize:number, text:string[], msg?:string): void {
	var m = new TextModel([], TextModel.toRawText(text.join('\n'), {
		tabSize: defaultTabSize,
		insertSpaces: defaultInsertSpaces,
		detectIndentation: true,
		defaultEOL: DefaultEndOfLine.LF,
		trimAutoWhitespace: true
	}));
	var r = m.getOptions();
	m.dispose();

	assert.equal(r.insertSpaces, expectedInsertSpaces, msg);
	assert.equal(r.tabSize, expectedTabSize, msg);
}

function assertGuess(expectedInsertSpaces:boolean, expectedTabSize:number, text:string[], msg?:string): void {
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

suite('Editor Model - TextModel', () => {

	test('getValueLengthInRange', () => {

		var m = new TextModel([], TextModel.toRawText('My First Line\r\nMy Second Line\r\nMy Third Line', TextModel.DEFAULT_CREATION_OPTIONS));
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

		m = new TextModel([], TextModel.toRawText('My First Line\nMy Second Line\nMy Third Line', TextModel.DEFAULT_CREATION_OPTIONS));
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

		var m = new TextModel([], TextModel.toRawText('line one\nline two', TextModel.DEFAULT_CREATION_OPTIONS));

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

	});

	test('modifyPosition', () => {

		var m = new TextModel([], TextModel.toRawText('line one\nline two', TextModel.DEFAULT_CREATION_OPTIONS));
		assert.deepEqual(m.modifyPosition(new Position(1,1), 0), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(0,0), 0), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(30, 1), 0), new Position(2, 9));

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

		assert.deepEqual(m.modifyPosition(new Position(1, 2), 17), new Position(2, 9));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), 100), new Position(2, 9));

		assert.deepEqual(m.modifyPosition(new Position(1, 2), -2), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(1, 2), -100), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(2, 2), -100), new Position(1, 1));
		assert.deepEqual(m.modifyPosition(new Position(2, 9), -18), new Position(1, 1));
	});

	test('normalizeIndentation 1', () => {
		let model = new TextModel([], {
			length: 0,
			lines: [],
			BOM: '',
			EOL: '\n',
			options: {
				tabSize: 4,
				insertSpaces: false,
				trimAutoWhitespace: true,
				defaultEOL: DefaultEndOfLine.LF
			}
		});

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
		let model = new TextModel([], {
			length: 0,
			lines: [],
			BOM: '',
			EOL: '\n',
			options: {
				tabSize: 4,
				insertSpaces: true,
				trimAutoWhitespace: true,
				defaultEOL: DefaultEndOfLine.LF
			}
		});

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

suite('TextModel.getLineIndentGuide', () => {
	function assertIndentGuides(lines:[number,string][]): void {
		let text = lines.map(l => l[1]).join('\n');
		let model = new TextModel([], TextModel.toRawText(text, TextModel.DEFAULT_CREATION_OPTIONS));

		let actual: [number,string][] = [];
		for (let line = 1; line <= model.getLineCount(); line++) {
			actual[line - 1] = [model.getLineIndentGuide(line), model.getLineContent(line)];
		}

		// let expected = lines.map(l => l[0]);

		assert.deepEqual(actual, lines);

		model.dispose();
	}

	test('getLineIndentGuide one level', () => {
		assertIndentGuides([
			[0, 'A'],
			[1, '  A'],
			[1, '  A'],
			[1, '  A'],
		]);
	});

	test('getLineIndentGuide two levels', () => {
		assertIndentGuides([
			[0, 'A'],
			[1, '  A'],
			[1, '  A'],
			[1, '    A'],
			[1, '    A'],
		]);
	});

	test('getLineIndentGuide three levels', () => {
		assertIndentGuides([
			[0, 'A'],
			[1, '  A'],
			[1, '    A'],
			[2, '      A'],
			[0, 'A'],
		]);
	});

	test('getLineIndentGuide decreasing indent', () => {
		assertIndentGuides([
			[0, '    A'],
			[0, '  A'],
			[0, 'A'],
		]);
	});

	test('getLineIndentGuide Java', () => {
		assertIndentGuides([
			[0, 'class A {'],
			[1, '  void foo() {'],
			[1, '    console.log(1);'],
			[1, '    console.log(2);'],
			[1, '  }'],
			[1, ''],
			[1, '  void bar() {'],
			[1, '    console.log(3);'],
			[1, '  }'],
			[0, '}'],
			[0, 'interface B {'],
			[1, '  void bar();'],
			[0, '}'],
		]);
	});

	test('getLineIndentGuide Javadoc', () => {
		assertIndentGuides([
			[0, '/**'],
			[1, ' * Comment'],
			[1, ' */'],
			[0, 'class A {'],
			[1, '  void foo() {'],
			[1, '  }'],
			[0, '}'],
		]);
	});

	test('getLineIndentGuide Whitespace', () => {
		assertIndentGuides([
			[0, 'class A {'],
			[1, ''],
			[1, '  void foo() {'],
			[1, '     '],
			[1, '     return 1;'],
			[1, '  }'],
			[1, '      '],
			[0, '}'],
		]);
	});

	test('getLineIndentGuide Tabs', () => {
		assertIndentGuides([
			[0, 'class A {'],
			[1, '\t\t'],
			[1, '\tvoid foo() {'],
			[2, '\t \t//hello'],
			[2, '\t    return 2;'],
			[1, '  \t}'],
			[1, '      '],
			[0, '}'],
		]);
	});

	test('getLineIndentGuide checker.ts', () => {
		assertIndentGuides([
			/* 1*/[ 0, '/// <reference path="binder.ts"/>'],
			/* 2*/[ 0, ''],
			/* 3*/[ 0, '/* @internal */'],
			/* 4*/[ 0, 'namespace ts {'],
			/* 5*/[ 1, '    let nextSymbolId = 1;'],
			/* 6*/[ 1, '    let nextNodeId = 1;'],
			/* 7*/[ 1, '    let nextMergeId = 1;'],
			/* 8*/[ 1, '    let nextFlowId = 1;'],
			/* 9*/[ 1, ''],
			/*10*/[ 1, '    export function getNodeId(node: Node): number {'],
			/*11*/[ 2, '        if (!node.id) {'],
			/*12*/[ 3, '            node.id = nextNodeId;'],
			/*13*/[ 3, '            nextNodeId++;'],
			/*14*/[ 2, '        }'],
			/*15*/[ 2, '        return node.id;'],
			/*16*/[ 1, '    }'],
			/*17*/[ 0, '}'],
		]);
	});
});
