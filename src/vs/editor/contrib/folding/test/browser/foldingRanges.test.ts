/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FoldingMarkers } from 'vs/editor/common/languages/languageConfiguration';
import { MAX_FOLDING_REGIONS, FoldRange, FoldingRegions, FoldSource } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { computeRanges } from 'vs/editor/contrib/folding/browser/indentRangeProvider';
import { createTextModel } from 'vs/editor/test/common/testTextModel';

const markers: FoldingMarkers = {
	start: /^\s*#region\b/,
	end: /^\s*#endregion\b/
};

suite('FoldingRanges', () => {

	const foldRange = (from: number, to: number, collapsed: boolean | undefined = undefined, source: FoldSource = FoldSource.provider, type: string | undefined = undefined, collapsedText: string | undefined = undefined, startColumn: number | undefined = undefined) =>
		<FoldRange>{
			startLineNumber: from,
			endLineNumber: to,
			type: type,
			collapsedText: collapsedText,
			isCollapsed: collapsed || false,
			source,
			startColumn
		};
	const assertEqualRanges = (range1: FoldRange, range2: FoldRange, msg: string) => {
		assert.strictEqual(range1.startLineNumber, range2.startLineNumber, msg + ' start');
		assert.strictEqual(range1.endLineNumber, range2.endLineNumber, msg + ' end');
		assert.strictEqual(range1.type, range2.type, msg + ' type');
		assert.strictEqual(range1.collapsedText, range2.collapsedText, msg + ' collapsedText');
		assert.strictEqual(range1.isCollapsed, range2.isCollapsed, msg + ' collapsed');
		assert.strictEqual(range1.source, range2.source, msg + ' source');
		assert.strictEqual(range1.startColumn, range2.startColumn, msg + ' startColumn');
	};

	test('test max folding regions', () => {
		const lines: string[] = [];
		const nRegions = MAX_FOLDING_REGIONS;
		for (let i = 0; i < nRegions; i++) {
			lines.push('#region');
		}
		for (let i = 0; i < nRegions; i++) {
			lines.push('#endregion');
		}
		const model = createTextModel(lines.join('\n'));
		const actual = computeRanges(model, false, markers, { limit: MAX_FOLDING_REGIONS, report: () => { } });
		assert.strictEqual(actual.length, nRegions, 'len');
		for (let i = 0; i < nRegions; i++) {
			assert.strictEqual(actual.getStartLineNumber(i), i + 1, 'start' + i);
			assert.strictEqual(actual.getEndLineNumber(i), nRegions * 2 - i, 'end' + i);
			assert.strictEqual(actual.getParentIndex(i), i - 1, 'parent' + i);
		}
		model.dispose();

	});

	test('findRange', () => {
		const lines = [
		/* 1*/	'#region',
		/* 2*/	'#endregion',
		/* 3*/	'class A {',
		/* 4*/	'  void foo() {',
		/* 5*/	'    if (true) {',
		/* 6*/	'        return;',
		/* 7*/	'    }',
		/* 8*/	'',
		/* 9*/	'    if (true) {',
		/* 10*/	'      return;',
		/* 11*/	'    }',
		/* 12*/	'  }',
		/* 13*/	'}'];

		const textModel = createTextModel(lines.join('\n'));
		try {
			const actual = computeRanges(textModel, false, markers);
			// let r0 = r(1, 2);
			// let r1 = r(3, 12);
			// let r2 = r(4, 11);
			// let r3 = r(5, 6);
			// let r4 = r(9, 10);

			assert.strictEqual(actual.findRange(1), 0, '1');
			assert.strictEqual(actual.findRange(2), 0, '2');
			assert.strictEqual(actual.findRange(3), 1, '3');
			assert.strictEqual(actual.findRange(4), 2, '4');
			assert.strictEqual(actual.findRange(5), 3, '5');
			assert.strictEqual(actual.findRange(6), 3, '6');
			assert.strictEqual(actual.findRange(7), 2, '7');
			assert.strictEqual(actual.findRange(8), 2, '8');
			assert.strictEqual(actual.findRange(9), 4, '9');
			assert.strictEqual(actual.findRange(10), 4, '10');
			assert.strictEqual(actual.findRange(11), 2, '11');
			assert.strictEqual(actual.findRange(12), 1, '12');
			assert.strictEqual(actual.findRange(13), -1, '13');
		} finally {
			textModel.dispose();
		}


	});

	test('setCollapsed', () => {
		const lines: string[] = [];
		const nRegions = 500;
		for (let i = 0; i < nRegions; i++) {
			lines.push('#region');
		}
		for (let i = 0; i < nRegions; i++) {
			lines.push('#endregion');
		}
		const model = createTextModel(lines.join('\n'));
		const actual = computeRanges(model, false, markers);
		assert.strictEqual(actual.length, nRegions, 'len');
		for (let i = 0; i < nRegions; i++) {
			actual.setCollapsed(i, i % 3 === 0);
		}
		for (let i = 0; i < nRegions; i++) {
			assert.strictEqual(actual.isCollapsed(i), i % 3 === 0, 'line' + i);
		}
		model.dispose();
	});

	test('sanitizeAndMerge1', () => {
		const regionSet1: FoldRange[] = [
			foldRange(0, 100),			// invalid, should be removed
			foldRange(1, 100, false, FoldSource.provider, 'A', 'A ct'),		// valid
			foldRange(1, 100, false, FoldSource.provider, 'Z', 'Z ct'),		// invalid, duplicate start
			foldRange(10, 10, false),						// invalid, should be removed
			foldRange(20, 80, false, FoldSource.provider, 'C1', 'C1 ct'),		// valid inside 'B'
			foldRange(22, 80, true, FoldSource.provider, 'D1', 'D1 ct'),		// valid inside 'C1'
			foldRange(90, 101),								// invalid, should be removed
		];
		const regionSet2: FoldRange[] = [
			foldRange(20, 80, true),			    		// should merge with C1
			foldRange(18, 80, true),						// invalid, out of order
			foldRange(21, 81, true, FoldSource.provider, 'Z', 'Z ct'),		// invalid, overlapping
			foldRange(22, 80, true, FoldSource.provider, 'D2', 'D2 ct'),		// should merge with D1
		];
		const result = FoldingRegions.sanitizeAndMerge(regionSet1, regionSet2, null);
		console.log(JSON.stringify(result, null, '\t'));
		assert.strictEqual(result.length, 3, 'result length1');
		assertEqualRanges(result[0], foldRange(1, 100, false, FoldSource.provider, 'A', 'A ct'), 'A1');
		assertEqualRanges(result[1], foldRange(20, 80, true, FoldSource.provider, 'C1', 'C1 ct'), 'C1');
		assertEqualRanges(result[2], foldRange(22, 80, true, FoldSource.provider, 'D1', 'D1 ct'), 'D1');
	});

	test('sanitizeAndMerge2', () => {
		const regionSet1: FoldRange[] = [
			foldRange(1, 100, false, FoldSource.provider, 'a1', 'a1 ct'),			// valid
			foldRange(2, 100, false, FoldSource.provider, 'a2', 'a2 ct'),			// valid
			foldRange(3, 19, false, FoldSource.provider, 'a3', 'a3 ct'),			// valid
			foldRange(20, 71, false, FoldSource.provider, 'a4', 'a4 ct'),			// overlaps b3
			foldRange(21, 29, false, FoldSource.provider, 'a5', 'a5 ct'),			// valid
			foldRange(81, 91, false, FoldSource.provider, 'a6', 'a6 ct'),			// overlaps b4
		];
		const regionSet2: FoldRange[] = [
			foldRange(30, 39, true, FoldSource.provider, 'b1', 'b1 ct'),			// valid, will be recovered
			foldRange(40, 49, true, FoldSource.userDefined, 'b2', 'b2 ct'),	// valid
			foldRange(50, 100, true, FoldSource.userDefined, 'b3', 'b3 ct'),	// overlaps a4
			foldRange(80, 90, true, FoldSource.userDefined, 'b4', 'b4 ct'),	// overlaps a6
			foldRange(92, 100, true, FoldSource.userDefined, 'b5', 'b5 ct'),	// valid
		];
		const result = FoldingRegions.sanitizeAndMerge(regionSet1, regionSet2, null);
		assert.strictEqual(result.length, 9, 'result length1');
		assertEqualRanges(result[0], foldRange(1, 100, false, FoldSource.provider, 'a1', 'a1 ct'), 'P1');
		assertEqualRanges(result[1], foldRange(2, 100, false, FoldSource.provider, 'a2', 'a2 ct'), 'P2');
		assertEqualRanges(result[2], foldRange(3, 19, false, FoldSource.provider, 'a3', 'a3 ct'), 'P3');
		assertEqualRanges(result[3], foldRange(21, 29, false, FoldSource.provider, 'a5', 'a5 ct'), 'P4');
		assertEqualRanges(result[4], foldRange(30, 39, true, FoldSource.recovered, 'b1', 'b1 ct'), 'P5');
		assertEqualRanges(result[5], foldRange(40, 49, true, FoldSource.userDefined, 'b2', 'b2 ct'), 'P6');
		assertEqualRanges(result[6], foldRange(50, 100, true, FoldSource.userDefined, 'b3', 'b3 ct'), 'P7');
		assertEqualRanges(result[7], foldRange(80, 90, true, FoldSource.userDefined, 'b4', 'b4 ct'), 'P8');
		assertEqualRanges(result[8], foldRange(92, 100, true, FoldSource.userDefined, 'b5', 'b5 ct'), 'P9');
	});

	test('sanitizeAndMerge3', () => {
		const regionSet1: FoldRange[] = [
			foldRange(1, 100, false, FoldSource.provider, 'a1', 'a1 ct'),			// valid
			foldRange(10, 29, false, FoldSource.provider, 'a2', 'a2 ct'),			// matches manual hidden
			foldRange(35, 39, true, FoldSource.recovered, 'a3', 'a3 ct'),		// valid
		];
		const regionSet2: FoldRange[] = [
			foldRange(10, 29, true, FoldSource.recovered, 'b1', 'b1 ct'),		// matches a
			foldRange(20, 28, true, FoldSource.provider, 'b2', 'b2 ct'),			// should remain
			foldRange(30, 39, true, FoldSource.recovered, 'b3', 'b3 ct'),		// should remain
		];
		const result = FoldingRegions.sanitizeAndMerge(regionSet1, regionSet2, null);
		assert.strictEqual(result.length, 5, 'result length3');
		assertEqualRanges(result[0], foldRange(1, 100, false, FoldSource.provider, 'a1', 'a1 ct'), 'R1');
		assertEqualRanges(result[1], foldRange(10, 29, true, FoldSource.provider, 'a2', 'a2 ct'), 'R2');
		assertEqualRanges(result[2], foldRange(20, 28, true, FoldSource.recovered, 'b2', 'b2 ct'), 'R3');
		assertEqualRanges(result[3], foldRange(30, 39, true, FoldSource.recovered, 'b3', 'b3 ct'), 'R3');
		assertEqualRanges(result[4], foldRange(35, 39, true, FoldSource.recovered, 'a3', 'a3 ct'), 'R4');
	});

	test('sanitizeAndMerge4', () => {
		const regionSet1: FoldRange[] = [
			foldRange(1, 100, false, FoldSource.provider, 'a1', 'a1 ct'),			// valid
		];
		const regionSet2: FoldRange[] = [
			foldRange(20, 28, true, FoldSource.provider, 'b1', 'b1 ct'),			// hidden
			foldRange(30, 38, true, FoldSource.provider, 'b2', 'b2 ct'),			// hidden
		];
		const result = FoldingRegions.sanitizeAndMerge(regionSet1, regionSet2, null);
		assert.strictEqual(result.length, 3, 'result length4');
		assertEqualRanges(result[0], foldRange(1, 100, false, FoldSource.provider, 'a1', 'a1 ct'), 'R1');
		assertEqualRanges(result[1], foldRange(20, 28, true, FoldSource.recovered, 'b1', 'b1 ct'), 'R2');
		assertEqualRanges(result[2], foldRange(30, 38, true, FoldSource.recovered, 'b2', 'b2 ct'), 'R3');
	});

	test('sanitizeAndMerge5', () => {
		const regionSet1: FoldRange[] = [
			foldRange(0, 100, false, FoldSource.provider, 'Z1', 'Z1 ct', 1),		// invalid, invalid start
			foldRange(2, 100, false, FoldSource.provider, 'A', 'A ct', 2),		// valid
			foldRange(2, 100, false, FoldSource.provider, 'B', 'B ct', 3),		// valid inside 'A'
			foldRange(2, 100, false, FoldSource.provider, 'Z2', 'Z2 ct', 3),		// invalid, duplicate start
			foldRange(2, 100, false, FoldSource.provider, 'C', 'C ct'),		// valid inside 'B', no startColumn => end of line
			foldRange(3, 80, true, FoldSource.provider, 'D', 'D ct', 1),		// valid inside 'C'
		];
		const regionSet2: FoldRange[] = [
			foldRange(2, 100, true, undefined, undefined, undefined, 3),		// should merge with 'B'
			foldRange(1, 80, true),						// invalid, out of order
			foldRange(2, 80, true, undefined, undefined, undefined, 2),			// invalid, out of order
			foldRange(3, 81, true, FoldSource.provider, 'Z3', 'Z3 ct'),		// invalid, overlapping
		];
		const result = FoldingRegions.sanitizeAndMerge(regionSet1, regionSet2, null);
		assert.strictEqual(result.length, 4, 'result length1');
		assertEqualRanges(result[0], foldRange(2, 100, false, FoldSource.provider, 'A', 'A ct', 2), 'A');
		assertEqualRanges(result[1], foldRange(2, 100, true, FoldSource.provider, 'B', 'B ct', 3), 'B');
		assertEqualRanges(result[2], foldRange(2, 100, false, FoldSource.provider, 'C', 'C ct'), 'C');
		assertEqualRanges(result[3], foldRange(3, 80, true, FoldSource.provider, 'D', 'D ct', 1), 'D');
	});

});
