/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Model} from 'vs/editor/common/model/model';
import {IFoldingRange} from 'vs/editor/contrib/folding/common/foldingRange';
import {computeRanges, limitByIndent, computeIndentLevel} from 'vs/editor/contrib/folding/common/indentFoldStrategy';

suite('Indentation Folding', () => {
	function assertRanges(lines: string[], tabSize: number, expected:IFoldingRange[]): void {
		let model = new Model(lines.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
		let actual = computeRanges(model, tabSize);
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
		], 4, [r(1, 4, 0)]);
	});

	test('Fold two levels', () => {
		assertRanges([
			'A',
			'  A',
			'  A',
			'    A',
			'    A'
		], 4, [r(1, 5, 0), r(3, 5, 2)] );
	});

	test('Fold three levels', () => {
		assertRanges([
			'A',
			'  A',
			'    A',
			'      A',
			'A'
		], 4, [r(1, 4, 0), r(2, 4, 2), r(3, 4, 4)] );
	});

	test('Fold decreasing indent', () => {
		assertRanges([
			'    A',
			'  A',
			'A'
		], 4, [] );
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
		], 4, [r(1, 9, 0), r(2, 4, 2), r(7, 8, 2), r(11, 12, 0)] );
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
		], 4, [r(1, 3, 0), r(4, 6, 0)] );
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
		], 4, [r(1, 7, 0), r(3, 5, 2)] );
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
		], 4, [r(1, 7, 0), r(3, 5, 4)] );
	});

	test('Limit By indent', () => {
		let ranges = [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10), r(11, 12, 2000), r(14, 15, 2000)];
		assert.deepEqual(limitByIndent(ranges, 8), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10), r(11, 12, 2000), r(14, 15, 2000)]);
		assert.deepEqual(limitByIndent(ranges, 7), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10)]);
		assert.deepEqual(limitByIndent(ranges, 6), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10)]);
		assert.deepEqual(limitByIndent(ranges, 5), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0)]);
		assert.deepEqual(limitByIndent(ranges, 4), [r(1, 4, 0), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0)]);
		assert.deepEqual(limitByIndent(ranges, 3), [r(1, 4, 0), r(5, 8, 0), r(9, 15, 0)]);
		assert.deepEqual(limitByIndent(ranges, 2), []);
		assert.deepEqual(limitByIndent(ranges, 1), []);
		assert.deepEqual(limitByIndent(ranges, 0), []);
	});

	test('Compute indent level', () => {
		assert.equal(computeIndentLevel('Hello', 4), 0);
		assert.equal(computeIndentLevel(' Hello', 4), 1);
		assert.equal(computeIndentLevel('   Hello', 4), 3);
		assert.equal(computeIndentLevel('\tHello', 4), 4);
		assert.equal(computeIndentLevel(' \tHello', 4), 4);
		assert.equal(computeIndentLevel('  \tHello', 4), 4);
		assert.equal(computeIndentLevel('   \tHello', 4), 4);
		assert.equal(computeIndentLevel('    \tHello', 4), 8);
		assert.equal(computeIndentLevel('     \tHello', 4), 8);
		assert.equal(computeIndentLevel('\t Hello', 4), 5);
		assert.equal(computeIndentLevel('\t \tHello', 4), 8);
	});

});
