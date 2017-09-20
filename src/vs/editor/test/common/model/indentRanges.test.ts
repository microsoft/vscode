/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Model } from 'vs/editor/common/model/model';
import { computeRanges } from 'vs/editor/common/model/indentRanges';

export interface IndentRange {
	startLineNumber: number;
	endLineNumber: number;
	indent: number;
}

suite('Indentation Folding', () => {
	function assertRanges(lines: string[], expected: IndentRange[], offside): void {
		let model = Model.createFromString(lines.join('\n'));
		let actual = computeRanges(model, offside);
		actual.sort((r1, r2) => r1.startLineNumber - r2.startLineNumber);
		assert.deepEqual(actual, expected);
		model.dispose();
	}

	function r(startLineNumber: number, endLineNumber: number, indent: number): IndentRange {
		return { startLineNumber, endLineNumber, indent };
	}

	test('Fold one level', () => {
		let range = [
			'A',
			'  A',
			'  A',
			'  A'
		];
		assertRanges(range, [r(1, 4, 0)], true);
		assertRanges(range, [r(1, 4, 0)], false);
	});

	test('Fold two levels', () => {
		let range = [
			'A',
			'  A',
			'  A',
			'    A',
			'    A'
		];
		assertRanges(range, [r(1, 5, 0), r(3, 5, 2)], true);
		assertRanges(range, [r(1, 5, 0), r(3, 5, 2)], false);
	});

	test('Fold three levels', () => {
		let range = [
			'A',
			'  A',
			'    A',
			'      A',
			'A'
		];
		assertRanges(range, [r(1, 4, 0), r(2, 4, 2), r(3, 4, 4)], true);
		assertRanges(range, [r(1, 4, 0), r(2, 4, 2), r(3, 4, 4)], false);
	});

	test('Fold decreasing indent', () => {
		let range = [
			'    A',
			'  A',
			'A'
		];
		assertRanges(range, [], true);
		assertRanges(range, [], false);
	});

	test('Fold Java', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'  void foo() {',
		/* 3*/	'    console.log();',
		/* 4*/	'    console.log();',
		/* 5*/	'  }',
		/* 6*/	'',
		/* 7*/	'  void bar() {',
		/* 8*/	'    console.log();',
		/* 9*/	'  }',
		/*10*/	'}',
		/*11*/	'interface B {',
		/*12*/	'  void bar();',
		/*13*/	'}',
		], [r(1, 9, 0), r(2, 4, 2), r(7, 8, 2), r(11, 12, 0)], false);
	});

	test('Fold Javadoc', () => {
		assertRanges([
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'class A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'  }',
		/* 7*/	'}',
		], [r(1, 3, 0), r(4, 6, 0)], false);
	});
	test('Fold Whitespace Java', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'',
		/* 3*/	'  void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     return 0;',
		/* 6*/	'  }',
		/* 7*/	'      ',
		/* 8*/	'}',
		], [r(1, 7, 0), r(3, 5, 2)], false);
	});

	test('Fold Whitespace Python', () => {
		assertRanges([
		/* 1*/	'def a:',
		/* 2*/	'  pass',
		/* 3*/	'   ',
		/* 4*/	'  def b:',
		/* 5*/	'    pass',
		/* 6*/	'  ',
		/* 7*/	'      ',
		/* 8*/	'def c: # since there was a deintent here'
		], [r(1, 5, 0), r(4, 5, 2)], true);
	});

	test('Fold Tabs', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'\t\t',
		/* 3*/	'\tvoid foo() {',
		/* 4*/	'\t \t//hello',
		/* 5*/	'\t    return 0;',
		/* 6*/	'  \t}',
		/* 7*/	'      ',
		/* 8*/	'}',
		], [r(1, 7, 0), r(3, 5, 4)], false);
	});
});
