/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Model} from 'vs/editor/common/model/model';
import {IFoldingRange} from 'vs/editor/contrib/folding/common/foldingRange';
import {computeRanges} from 'vs/editor/contrib/folding/common/indentFoldStrategy';

suite('Folding', () => {
	function assertRanges(lines: string[], tabSize: number, expected:IFoldingRange[]): void {
		let model = new Model(lines.join('\n'), null);
		let actual = computeRanges(model, tabSize);
		actual.sort((r1, r2) => r1.startLineNumber - r2.startLineNumber);
		assert.deepEqual(actual, expected);
		model.dispose();
	}

	function r(startLineNumber: number, endLineNumber: number): IFoldingRange {
		return { startLineNumber, endLineNumber };
	}

	test('t1', () => {
		assertRanges([
			'A',
			'  A',
			'  A',
			'  A'
		], 4, [r(1, 4)]);
	});

	test('t2', () => {
		assertRanges([
			'A',
			'  A',
			'  A',
			'    A',
			'    A'
		], 4, [r(1, 5), r(3, 5)] );
	});

	test('t3', () => {
		assertRanges([
			'A',
			'  A',
			'    A',
			'      A',
			'A'
		], 4, [r(1, 4), r(2, 4), r(3, 4)] );
	});

	test('t4', () => {
		assertRanges([
			'    A',
			'  A',
			'A'
		], 4, [] );
	});

	test('Java', () => {
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
		], 4, [r(1, 9), r(2, 4), r(7, 8), r(11, 12)] );
	});

	test('Javadoc', () => {
		assertRanges([
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'class A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'  }',
		/* 7*/	'}',
		], 4, [r(1, 3), r(4, 6)] );
	});
	test('Whitespace', () => {
		assertRanges([
		/* 1*/	'class A {',
		/* 2*/	'',
		/* 3*/	'  void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     return 0;',
		/* 6*/	'  }',
		/* 7*/	'      ',
		/* 8*/	'}',
		], 4, [r(1, 7), r(3, 5)] );
	});


});