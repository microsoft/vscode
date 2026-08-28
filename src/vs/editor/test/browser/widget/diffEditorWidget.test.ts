/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { UnchangedRegion } from '../../../browser/widget/diffEditor/diffEditorViewModel.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../common/diff/rangeMapping.js';

suite('DiffEditorWidget2', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('UnchangedRegion', () => {
		function serialize(regions: UnchangedRegion[]): unknown {
			return regions.map(r => `${r.originalUnchangedRange} - ${r.modifiedUnchangedRange}`);
		}

		test('Everything changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(1, 10), new LineRange(1, 10), [])],
				10,
				10,
				3,
				3,
			)), []);
		});

		test('Nothing changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[],
				10,
				10,
				3,
				3,
			)), [
				'[1,11) - [1,11)'
			]);
		});

		test('Change in the middle', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(50, 60), new LineRange(50, 60), [])],
				100,
				100,
				3,
				3,
			)), ([
				'[1,47) - [1,47)',
				'[63,101) - [63,101)'
			]));
		});

		test('Change at the end', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(99, 100), new LineRange(100, 100), [])],
				100,
				100,
				3,
				3,
			)), (['[1,96) - [1,96)']));
		});

		test('Preserves visible state when line range shrinks', () => {
			const regions = [
				new UnchangedRegion(1, 1, 10, 3, 5).withUpdatedLineRange(2, 3, 6, undefined),
				new UnchangedRegion(1, 1, 10, 8, 2).withUpdatedLineRange(2, 3, 5, undefined),
			];

			assert.deepStrictEqual(regions.map(region => ({
				originalRange: region.originalUnchangedRange.toString(),
				modifiedRange: region.modifiedUnchangedRange.toString(),
				visibleLineCountTop: region.visibleLineCountTop.get(),
				visibleLineCountBottom: region.visibleLineCountBottom.get(),
			})), [{
				originalRange: '[2,8)',
				modifiedRange: '[3,9)',
				visibleLineCountTop: 3,
				visibleLineCountBottom: 3,
			}, {
				originalRange: '[2,7)',
				modifiedRange: '[3,8)',
				visibleLineCountTop: 5,
				visibleLineCountBottom: 0,
			}]);
		});
	});
});
