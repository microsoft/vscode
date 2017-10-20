/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { FoldingModel, FoldingRegion, setCollapseStateDown, setCollapseStateAtLevel, setCollapseStateLevelsDown, setCollapseStateLevelsUp } from 'vs/editor/contrib/folding/common/foldingModel';
import { Model } from 'vs/editor/common/model/model';
import { computeRanges } from 'vs/editor/common/model/indentRanges';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { TrackedRangeStickiness } from 'vs/editor/common/editorCommon';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';


interface ExpectedRegion {
	startLineNumber: number;
	endLineNumber: number;
	isCollapsed: boolean;
}

export class TestDecorationProvider {

	private testDecorator = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		linesDecorationsClassName: 'folding'
	});

	getDecorationOption(region: FoldingRegion): ModelDecorationOptions {
		return this.testDecorator;
	}
}

suite('Folding Model', () => {
	function r(startLineNumber: number, endLineNumber: number, isCollapsed: boolean = false): ExpectedRegion {
		return { startLineNumber, endLineNumber, isCollapsed };
	}

	function assertRegion(actual: FoldingRegion, expected: ExpectedRegion, message?: string) {
		assert.equal(!!actual, !!expected, message);
		if (actual) {
			assert.equal(actual.range.startLineNumber, expected.startLineNumber, message);
			assert.equal(actual.range.endLineNumber, expected.endLineNumber, message);
			assert.equal(actual.isCollapsed, expected.isCollapsed, message);
		}
	}

	function assertFoldedRegions(foldingModel: FoldingModel, expectedRegions: ExpectedRegion[], message?: string) {
		assert.deepEqual(foldingModel.regions.filter(r => r.isCollapsed).map(r => ({ startLineNumber: r.range.startLineNumber, endLineNumber: r.range.endLineNumber, isCollapsed: false })), expectedRegions, message);
	}

	function assertRegions(actual: FoldingRegion[], expectedRegions: ExpectedRegion[], message?: string) {
		assert.deepEqual(actual.map(r => ({ startLineNumber: r.range.startLineNumber, endLineNumber: r.range.endLineNumber, isCollapsed: r.isCollapsed })), expectedRegions, message);
	}

	test('getRegionAtLine', () => {
		let lines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'class A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, null);
		foldingModel.update(ranges);

		let r1 = r(1, 3, false);
		let r2 = r(4, 7, false);
		let r3 = r(5, 6, false);

		assertRegions(foldingModel.regions, [r1, r2, r3]);

		assertRegion(foldingModel.getRegionAtLine(1), r1, '1');
		assertRegion(foldingModel.getRegionAtLine(2), r1, '2');
		assertRegion(foldingModel.getRegionAtLine(3), r1, '3');
		assertRegion(foldingModel.getRegionAtLine(4), r2, '4');
		assertRegion(foldingModel.getRegionAtLine(5), r3, '5');
		assertRegion(foldingModel.getRegionAtLine(6), r3, '5');
		assertRegion(foldingModel.getRegionAtLine(7), r2, '6');
		assertRegion(foldingModel.getRegionAtLine(8), null, '7');
	});

	test('collapse', () => {
		let lines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'class A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, null);
		foldingModel.update(ranges);

		let r1 = r(1, 3, false);
		let r2 = r(4, 7, false);
		let r3 = r(5, 6, false);

		assertRegions(foldingModel.regions, [r1, r2, r3]);

		foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1)]);
		foldingModel.update(ranges);

		assertRegions(foldingModel.regions, [r(1, 3, true), r2, r3]);

		foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(5)]);
		foldingModel.update(ranges);

		assertRegions(foldingModel.regions, [r(1, 3, true), r2, r(5, 6, true)]);

		foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(7)]);
		foldingModel.update(ranges);

		assertRegions(foldingModel.regions, [r(1, 3, true), r(4, 7, true), r(5, 6, true)]);

	});

	test('update', () => {
		let lines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'class A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, null);
		foldingModel.update(ranges);

		let r1 = r(1, 3, false);
		let r2 = r(4, 7, false);
		let r3 = r(5, 6, false);

		assertRegions(foldingModel.regions, [r1, r2, r3]);
		foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(2), foldingModel.getRegionAtLine(5)]);

		textModel.applyEdits([EditOperation.insert(new Position(4, 1), '//hello\n')]);

		foldingModel.update(computeRanges(textModel, false, null));

		assertRegions(foldingModel.regions, [r(1, 3, true), r(5, 8, false), r(6, 7, true)]);
	});

	test('getRegionsInside', () => {
		let lines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'class A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, null);
		foldingModel.update(ranges);

		let r1 = r(1, 3, false);
		let r2 = r(4, 7, false);
		let r3 = r(5, 6, false);

		assertRegions(foldingModel.regions, [r1, r2, r3]);

		assertRegions(foldingModel.getRegionsInside(r(1, 8)), [r1, r2, r3], '1');
		assertRegions(foldingModel.getRegionsInside(r(1, 3)), [r1], '2');
		assertRegions(foldingModel.getRegionsInside(r(4, 7)), [r2, r3], '3');
		assertRegions(foldingModel.getRegionsInside(r(4, 6)), [r3], '4');
		assertRegions(foldingModel.getRegionsInside(r(2, 5)), [], '5');
		assertRegions(foldingModel.getRegionsInside(r(6, 8)), [], '6');

	});

	test('getRegionsInsideWithLevel', () => {
		let lines = [
			/* 1*/	'//#region',
			/* 2*/	'//#endregion',
			/* 3*/	'class A {',
			/* 4*/	'  void foo() {',
			/* 5*/	'    if (true) {',
			/* 6*/	'        return;',
			/* 7*/	'    }',
			/* 8*/	'    if (true) {',
			/* 9*/	'      return;',
			/* 10*/	'    }',
			/* 11*/	'  }',
			/* 12*/	'}'];

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
		foldingModel.update(ranges);

		let r1 = r(1, 2, false);
		let r2 = r(3, 11, false);
		let r3 = r(4, 10, false);
		let r4 = r(5, 6, false);
		let r5 = r(8, 9, false);

		assertRegions(foldingModel.regions, [r1, r2, r3, r4, r5]);

		assertRegions(foldingModel.getRegionsInside(r(1, 12), (r, level) => level === 1), [r1, r2], '1');
		assertRegions(foldingModel.getRegionsInside(r(1, 12), (r, level) => level === 2), [r3], '2');
		assertRegions(foldingModel.getRegionsInside(r(1, 12), (r, level) => level === 3), [r4, r5], '3');

		assertRegions(foldingModel.getRegionsInside(r(4, 11), (r, level) => level === 1), [r3], '4');
		assertRegions(foldingModel.getRegionsInside(r(4, 11), (r, level) => level === 2), [r4, r5], '5');

		assertRegions(foldingModel.getRegionsInside(r(1, 10), (r) => !r.hidesLine(9)), [r1, r4], '6');

	});

	test('getRegionAtLine', () => {
		let lines = [
		/* 1*/	'//#region',
		/* 2*/	'class A {',
		/* 3*/	'  void foo() {',
		/* 4*/	'    if (true) {',
		/* 5*/	'      //hello',
		/* 6*/	'    }',
		/* 7*/	'',
		/* 8*/	'  }',
		/* 9*/	'}',
		/* 10*/	'//#endregion',
		/* 11*/	''];

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
		foldingModel.update(ranges);

		let r1 = r(1, 10, false);
		let r2 = r(2, 8, false);
		let r3 = r(3, 7, false);
		let r4 = r(4, 5, false);

		assertRegions(foldingModel.regions, [r1, r2, r3, r4]);

		assertRegions(foldingModel.getAllRegionsAtLine(1), [r1], '1');
		assertRegions(foldingModel.getAllRegionsAtLine(2), [r1, r2], '2');
		assertRegions(foldingModel.getAllRegionsAtLine(3), [r1, r2, r3], '3');
		assertRegions(foldingModel.getAllRegionsAtLine(4), [r1, r2, r3, r4], '4');
		assertRegions(foldingModel.getAllRegionsAtLine(5), [r1, r2, r3, r4], '5');
		assertRegions(foldingModel.getAllRegionsAtLine(6), [r1, r2, r3], '6');
		assertRegions(foldingModel.getAllRegionsAtLine(7), [r1, r2, r3], '7');
		assertRegions(foldingModel.getAllRegionsAtLine(8), [r1, r2], '8');
		assertRegions(foldingModel.getAllRegionsAtLine(9), [r1], '9');
		assertRegions(foldingModel.getAllRegionsAtLine(10), [r1], '10');
		assertRegions(foldingModel.getAllRegionsAtLine(11), [], '10');
	});

	test('setCollapseStateRecursivly', () => {
		let lines = [
		/* 1*/	'//#region',
		/* 2*/	'//#endregion',
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

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
		foldingModel.update(ranges);

		let r1 = r(1, 2, false);
		let r2 = r(3, 12, false);
		let r3 = r(4, 11, false);
		let r4 = r(5, 6, false);
		let r5 = r(9, 10, false);
		assertRegions(foldingModel.regions, [r1, r2, r3, r4, r5]);

		setCollapseStateDown(foldingModel, true, [4]);
		assertFoldedRegions(foldingModel, [r3, r4, r5], '1');

		setCollapseStateDown(foldingModel, false, [8]);
		assertFoldedRegions(foldingModel, [], '2');

		setCollapseStateDown(foldingModel, true, [12]);
		assertFoldedRegions(foldingModel, [r2, r3, r4, r5], '1');

		setCollapseStateDown(foldingModel, false, [7]);
		assertFoldedRegions(foldingModel, [r2], '1');

		setCollapseStateDown(foldingModel, false);
		assertFoldedRegions(foldingModel, [], '1');

		setCollapseStateDown(foldingModel, true);
		assertFoldedRegions(foldingModel, [r1, r2, r3, r4, r5], '1');

	});

	test('setCollapseStateAtLevel', () => {
		let lines = [
		/* 1*/	'//#region',
		/* 2*/	'//#endregion',
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

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
		foldingModel.update(ranges);

		let r1 = r(1, 2, false);
		let r2 = r(3, 12, false);
		let r3 = r(4, 11, false);
		let r4 = r(5, 6, false);
		let r5 = r(9, 10, false);
		assertRegions(foldingModel.regions, [r1, r2, r3, r4, r5]);

		setCollapseStateAtLevel(foldingModel, 1, true, []);
		assertFoldedRegions(foldingModel, [r1, r2], '1');

		setCollapseStateAtLevel(foldingModel, 1, false, [5]);
		assertFoldedRegions(foldingModel, [r2], '1');

		setCollapseStateAtLevel(foldingModel, 1, false, [1]);
		assertFoldedRegions(foldingModel, [], '1');

		setCollapseStateAtLevel(foldingModel, 2, true, []);
		assertFoldedRegions(foldingModel, [r3], '1');

		setCollapseStateAtLevel(foldingModel, 3, true, [4, 9]);
		assertFoldedRegions(foldingModel, [r3, r4], '1');

		setCollapseStateAtLevel(foldingModel, 3, false, [4, 9]);
		assertFoldedRegions(foldingModel, [r3], '1');

	});

	test('setCollapseStateLevelsDown', () => {
		let lines = [
		/* 1*/	'//#region',
		/* 2*/	'//#endregion',
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

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
		foldingModel.update(ranges);

		let r1 = r(1, 2, false);
		let r2 = r(3, 12, false);
		let r3 = r(4, 11, false);
		let r4 = r(5, 6, false);
		let r5 = r(9, 10, false);
		assertRegions(foldingModel.regions, [r1, r2, r3, r4, r5]);

		setCollapseStateLevelsDown(foldingModel, 1, true, [4]);
		assertFoldedRegions(foldingModel, [r3], '1');

		setCollapseStateLevelsDown(foldingModel, 2, true, [4]);
		assertFoldedRegions(foldingModel, [r3, r4, r5], '2');

		setCollapseStateLevelsDown(foldingModel, 2, false, [3]);
		assertFoldedRegions(foldingModel, [r4, r5], '3');

		setCollapseStateLevelsDown(foldingModel, 2, false, [2]);
		assertFoldedRegions(foldingModel, [r4, r5], '4');

		setCollapseStateLevelsDown(foldingModel, 4, true, [2]);
		assertFoldedRegions(foldingModel, [r1, r4, r5], '5');

		setCollapseStateLevelsDown(foldingModel, 4, false, [2, 3]);
		assertFoldedRegions(foldingModel, [], '6');

	});

	test('setCollapseStateLevelsUp', () => {
		let lines = [
		/* 1*/	'//#region',
		/* 2*/	'//#endregion',
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

		let textModel = Model.createFromString(lines.join('\n'));
		let foldingModel = new FoldingModel(textModel, new TestDecorationProvider());

		let ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
		foldingModel.update(ranges);

		let r1 = r(1, 2, false);
		let r2 = r(3, 12, false);
		let r3 = r(4, 11, false);
		let r4 = r(5, 6, false);
		let r5 = r(9, 10, false);
		assertRegions(foldingModel.regions, [r1, r2, r3, r4, r5]);

		setCollapseStateLevelsUp(foldingModel, 1, true, [4]);
		assertFoldedRegions(foldingModel, [r3], '1');

		setCollapseStateLevelsUp(foldingModel, 2, true, [4]);
		assertFoldedRegions(foldingModel, [r2, r3], '2');

		setCollapseStateLevelsUp(foldingModel, 4, false, [1, 3, 4]);
		assertFoldedRegions(foldingModel, [], '3');

		setCollapseStateLevelsUp(foldingModel, 2, true, [10]);
		assertFoldedRegions(foldingModel, [r3, r5], '4');


	});

});