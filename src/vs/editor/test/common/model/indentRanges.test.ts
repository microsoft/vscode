/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Model } from 'vs/editor/common/model/model';
import { computeRanges } from 'vs/editor/common/model/indentRanges';
import { FoldingMarkers } from 'vs/editor/common/modes/languageConfiguration';

export interface IndentRange {
	startLineNumber: number;
	endLineNumber: number;
	indent: number;
	marker: boolean;
}

function assertRanges(lines: string[], expected: IndentRange[], offside: boolean, markers?: FoldingMarkers): void {
	let model = Model.createFromString(lines.join('\n'));
	let actual = computeRanges(model, offside, markers);
	actual.sort((r1, r2) => r1.startLineNumber - r2.startLineNumber);
	assert.deepEqual(actual, expected);
	model.dispose();
}

function r(startLineNumber: number, endLineNumber: number, indent: number, marker?: boolean): IndentRange {
	return { startLineNumber, endLineNumber, indent, marker };
}

suite('Indentation Folding', () => {

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

let markers: FoldingMarkers = {
	start: /^\s*#region\b/,
	end: /^\s*#endregion\b/
};

suite('Folding with regions', () => {
	test('Inside region, indented', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'  #region',
		/* 3*/	'  void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     return 0;',
		/* 6*/	'  }',
		/* 7*/	'  #endregion',
		/* 8*/	'}',
		], [r(1, 7, 0), r(2, 7, 2, true), r(3, 5, 2)], false, markers);
	});
	test('Inside region, not indented', () => {
		assertRanges([
		/* 1*/	'var x;',
		/* 2*/	'#region',
		/* 3*/	'void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     return 0;',
		/* 6*/	'  }',
		/* 7*/	'#endregion',
		/* 8*/	'',
		], [r(2, 7, 0, true), r(3, 6, 0)], false, markers);
	});
	test('Empty Regions', () => {
		assertRanges([
		/* 1*/	'var x;',
		/* 2*/	'#region',
		/* 3*/	'#endregion',
		/* 4*/	'#region',
		/* 5*/	'',
		/* 6*/	'#endregion',
		/* 7*/	'var y;',
		], [r(2, 3, 0, true), r(4, 6, 0, true)], false, markers);
	});
	test('Nested Regions', () => {
		assertRanges([
		/* 1*/	'var x;',
		/* 2*/	'#region',
		/* 3*/	'#region',
		/* 4*/	'',
		/* 5*/	'#endregion',
		/* 6*/	'#endregion',
		/* 7*/	'var y;',
		], [r(2, 6, 0, true), r(3, 5, 0, true)], false, markers);
	});
	test('Nested Regions 2', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'  #region',
		/* 3*/	'',
		/* 4*/	'  #region',
		/* 5*/	'',
		/* 6*/	'  #endregion',
		/* 7*/	'  // comment',
		/* 8*/	'  #endregion',
		/* 9*/	'}',
		], [r(1, 8, 0), r(2, 8, 2, true), r(4, 6, 2, true)], false, markers);
	});
	test('Incomplete Regions', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'#region',
		/* 3*/	'  // comment',
		/* 4*/	'}',
		], [r(2, 3, 0)], false, markers);
	});
	test('Incomplete Regions 2', () => {
		assertRanges([
		/* 1*/	'',
		/* 2*/	'#region',
		/* 3*/	'#region',
		/* 4*/	'#region',
		/* 5*/	'  // comment',
		/* 6*/	'#endregion',
		/* 7*/	'#endregion',
		/* 8*/	' // hello',
		], [r(3, 7, 0, true), r(4, 6, 0, true)], false, markers);
	});
	test('Indented region before', () => {
		assertRanges([
		/* 1*/	'if (x)',
		/* 2*/	'  return;',
		/* 3*/	'',
		/* 4*/	'#region',
		/* 5*/	'  // comment',
		/* 6*/	'#endregion',
		], [r(1, 3, 0), r(4, 6, 0, true)], false, markers);
	});
	test('Indented region before 2', () => {
		assertRanges([
		/* 1*/	'if (x)',
		/* 2*/	'  log();',
		/* 3*/	'',
		/* 4*/	'    #region',
		/* 5*/	'      // comment',
		/* 6*/	'    #endregion',
		], [r(1, 6, 0), r(2, 6, 2), r(4, 6, 4, true)], false, markers);
	});
	test('Indented region in-between', () => {
		assertRanges([
		/* 1*/	'#region',
		/* 2*/	'  // comment',
		/* 3*/	'  if (x)',
		/* 4*/	'    return;',
		/* 5*/	'',
		/* 6*/	'#endregion',
		], [r(1, 6, 0, true), r(3, 5, 2)], false, markers);
	});
	test('Indented region after', () => {
		assertRanges([
		/* 1*/	'#region',
		/* 2*/	'  // comment',
		/* 3*/	'',
		/* 4*/	'#endregion',
		/* 5*/	'  if (x)',
		/* 6*/	'    return;',
		], [r(1, 4, 0, true), r(5, 6, 2)], false, markers);
	});
	test('With off-side', () => {
		assertRanges([
		/* 1*/	'#region',
		/* 2*/	'  ',
		/* 3*/	'',
		/* 4*/	'#endregion',
		/* 5*/	'',
		], [r(1, 4, 0, true)], true, markers);
	});
	test('Nested with off-side', () => {
		assertRanges([
		/* 1*/	'#region',
		/* 2*/	'  ',
		/* 3*/	'#region',
		/* 4*/	'',
		/* 5*/	'#endregion',
		/* 6*/	'',
		/* 7*/	'#endregion',
		/* 8*/	'',
		], [r(1, 7, 0, true), r(3, 5, 0, true)], true, markers);
	});
	test('Issue 35981', () => {
		assertRanges([
		/* 1*/	'function thisFoldsToEndOfPage() {',
		/* 2*/	'  const variable = []',
		/* 3*/	'    // #region',
		/* 4*/	'    .reduce((a, b) => a,[]);',
		/* 5*/	'}',
		/* 6*/	'',
		/* 7*/	'function thisFoldsProperly() {',
		/* 8*/	'  const foo = "bar"',
		/* 9*/	'}',
		], [r(1, 4, 0), r(2, 4, 2), r(7, 8, 0)], false, markers);
	});
	test('Misspelled Markers', () => {
		assertRanges([
		/* 1*/	'#Region',
		/* 2*/	'#endregion',
		/* 3*/	'#regionsandmore',
		/* 4*/	'#endregion',
		/* 5*/	'#region',
		/* 6*/	'#end region',
		/* 7*/	'#region',
		/* 8*/	'#endregionff',
		], [], true, markers);
	});
});