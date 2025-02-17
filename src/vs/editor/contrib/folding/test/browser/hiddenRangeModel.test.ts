/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { IRange } from '../../../../common/core/range.js';
import { FoldingModel } from '../../browser/foldingModel.js';
import { HiddenRangeModel } from '../../browser/hiddenRangeModel.js';
import { computeRanges } from '../../browser/indentRangeProvider.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { TestDecorationProvider } from './foldingModel.test.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';


interface ExpectedRange {
	startLineNumber: number;
	endLineNumber: number;
}

suite('Hidden Range Model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function r(startLineNumber: number, endLineNumber: number): ExpectedRange {
		return { startLineNumber, endLineNumber };
	}

	function assertRanges(actual: IRange[], expectedRegions: ExpectedRange[], message?: string) {
		assert.deepStrictEqual(actual.map(r => ({ startLineNumber: r.startLineNumber, endLineNumber: r.endLineNumber })), expectedRegions, message);
	}

	test('hasRanges', () => {
		const lines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'class A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    if (true) {',
		/* 7*/	'      //hello',
		/* 8*/	'    }',
		/* 9*/	'  }',
		/* 10*/	'}'];

		const textModel = createTextModel(lines.join('\n'));
		const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
		const hiddenRangeModel = new HiddenRangeModel(foldingModel);
		try {
			assert.strictEqual(hiddenRangeModel.hasRanges(), false);

			const ranges = computeRanges(textModel, false, undefined);
			foldingModel.update(ranges);

			foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1)!, foldingModel.getRegionAtLine(6)!]);
			assertRanges(hiddenRangeModel.hiddenRanges, [r(2, 3), r(7, 7)]);

			assert.strictEqual(hiddenRangeModel.hasRanges(), true);
			assert.strictEqual(hiddenRangeModel.isHidden(1), false);
			assert.strictEqual(hiddenRangeModel.isHidden(2), true);
			assert.strictEqual(hiddenRangeModel.isHidden(3), true);
			assert.strictEqual(hiddenRangeModel.isHidden(4), false);
			assert.strictEqual(hiddenRangeModel.isHidden(5), false);
			assert.strictEqual(hiddenRangeModel.isHidden(6), false);
			assert.strictEqual(hiddenRangeModel.isHidden(7), true);
			assert.strictEqual(hiddenRangeModel.isHidden(8), false);
			assert.strictEqual(hiddenRangeModel.isHidden(9), false);
			assert.strictEqual(hiddenRangeModel.isHidden(10), false);

			foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(4)!]);
			assertRanges(hiddenRangeModel.hiddenRanges, [r(2, 3), r(5, 9)]);

			assert.strictEqual(hiddenRangeModel.hasRanges(), true);
			assert.strictEqual(hiddenRangeModel.isHidden(1), false);
			assert.strictEqual(hiddenRangeModel.isHidden(2), true);
			assert.strictEqual(hiddenRangeModel.isHidden(3), true);
			assert.strictEqual(hiddenRangeModel.isHidden(4), false);
			assert.strictEqual(hiddenRangeModel.isHidden(5), true);
			assert.strictEqual(hiddenRangeModel.isHidden(6), true);
			assert.strictEqual(hiddenRangeModel.isHidden(7), true);
			assert.strictEqual(hiddenRangeModel.isHidden(8), true);
			assert.strictEqual(hiddenRangeModel.isHidden(9), true);
			assert.strictEqual(hiddenRangeModel.isHidden(10), false);

			foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1)!, foldingModel.getRegionAtLine(6)!, foldingModel.getRegionAtLine(4)!]);
			assertRanges(hiddenRangeModel.hiddenRanges, []);
			assert.strictEqual(hiddenRangeModel.hasRanges(), false);
			assert.strictEqual(hiddenRangeModel.isHidden(1), false);
			assert.strictEqual(hiddenRangeModel.isHidden(2), false);
			assert.strictEqual(hiddenRangeModel.isHidden(3), false);
			assert.strictEqual(hiddenRangeModel.isHidden(4), false);
			assert.strictEqual(hiddenRangeModel.isHidden(5), false);
			assert.strictEqual(hiddenRangeModel.isHidden(6), false);
			assert.strictEqual(hiddenRangeModel.isHidden(7), false);
			assert.strictEqual(hiddenRangeModel.isHidden(8), false);
			assert.strictEqual(hiddenRangeModel.isHidden(9), false);
			assert.strictEqual(hiddenRangeModel.isHidden(10), false);
		} finally {
			textModel.dispose();
			hiddenRangeModel.dispose();
		}
	});
});
