/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {Model} from 'vs/editor/common/model/model';
import {IFoldingRange} from 'vs/editor/contrib/folding/common/foldingRange';
import {computeRanges} from 'vs/editor/common/model/indentRanges';

suite('Indentation Folding', () => {
	function assertRanges(lines: string[], expected:IFoldingRange[]): void {
		let model = Model.createFromString(lines.join('\n'));
		let actual = computeRanges(model);
		actual.sort((r1, r2) => r1.startLineNumber - r2.startLineNumber);
		assert.deepEqual(actual, expected);
		model.dispose();
	}

	function r(startLineNumber: number, endLineNumber: number, indent: number): IFoldingRange {
		return { startLineNumber, endLineNumber, indent };
	}

	test('Fold one level', () => {
		assertRanges([
			'A',
			'  A',
			'  A',
			'  A'
		], [r(1, 4, 0)]);
	});

	test('Fold two levels', () => {
		assertRanges([
			'A',
			'  A',
			'  A',
			'    A',
			'    A'
		], [r(1, 5, 0), r(3, 5, 2)] );
	});

	test('Fold three levels', () => {
		assertRanges([
			'A',
			'  A',
			'    A',
			'      A',
			'A'
		], [r(1, 4, 0), r(2, 4, 2), r(3, 4, 4)] );
	});

	test('Fold decreasing indent', () => {
		assertRanges([
			'    A',
			'  A',
			'A'
		], [] );
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
		], [r(1, 9, 0), r(2, 4, 2), r(7, 8, 2), r(11, 12, 0)] );
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
		], [r(1, 3, 0), r(4, 6, 0)] );
	});
	test('Fold Whitespace', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'',
		/* 3*/	'  void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     return 0;',
		/* 6*/	'  }',
		/* 7*/	'      ',
		/* 8*/	'}',
		], [r(1, 7, 0), r(3, 5, 2)] );
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
		], [r(1, 7, 0), r(3, 5, 4)] );
	});
});
