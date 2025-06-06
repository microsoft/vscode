/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { CoverageDetailsModel } from '../../browser/codeCoverageDecorations.js';
import { CoverageDetails, DetailType } from '../../common/testTypes.js';

suite('Code Coverage Decorations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const textModel = { getValueInRange: () => '' } as any as ITextModel;
	const assertRanges = async (model: CoverageDetailsModel) => await assertSnapshot(model.ranges.map(r => ({
		range: r.range.toString(),
		count: r.metadata.detail.type === DetailType.Branch ? r.metadata.detail.detail.branches![r.metadata.detail.branch].count : r.metadata.detail.count,
	})));

	test('CoverageDetailsModel#1', async () => {
		// Create some sample coverage details
		const details: CoverageDetails[] = [
			{ location: new Range(1, 0, 5, 0), type: DetailType.Statement, count: 1 },
			{ location: new Range(2, 0, 3, 0), type: DetailType.Statement, count: 2 },
			{ location: new Range(4, 0, 6, 0), type: DetailType.Statement, branches: [{ location: new Range(3, 0, 7, 0), count: 3 }], count: 4 },
		];

		// Create a new CoverageDetailsModel instance
		const model = new CoverageDetailsModel(details, textModel);

		// Verify that the ranges are generated correctly
		await assertRanges(model);
	});

	test('CoverageDetailsModel#2', async () => {
		// Create some sample coverage details
		const details: CoverageDetails[] = [
			{ location: new Range(1, 0, 5, 0), type: DetailType.Statement, count: 1 },
			{ location: new Range(2, 0, 4, 0), type: DetailType.Statement, count: 2 },
			{ location: new Range(3, 0, 3, 5), type: DetailType.Statement, count: 3 },
		];

		// Create a new CoverageDetailsModel instance
		const model = new CoverageDetailsModel(details, textModel);

		// Verify that the ranges are generated correctly
		await assertRanges(model);
	});

	test('CoverageDetailsModel#3', async () => {
		// Create some sample coverage details
		const details: CoverageDetails[] = [
			{ location: new Range(1, 0, 5, 0), type: DetailType.Statement, count: 1 },
			{ location: new Range(2, 0, 3, 0), type: DetailType.Statement, count: 2 },
			{ location: new Range(4, 0, 5, 0), type: DetailType.Statement, count: 3 },
		];

		// Create a new CoverageDetailsModel instance
		const model = new CoverageDetailsModel(details, textModel);

		// Verify that the ranges are generated correctly
		await assertRanges(model);
	});

	test('CoverageDetailsModel#4', async () => {
		// Create some sample coverage details
		const details: CoverageDetails[] = [
			{ location: new Range(1, 0, 5, 0), type: DetailType.Statement, count: 1 },
			{ location: new Position(2, 0), type: DetailType.Statement, count: 2 },
			{ location: new Range(4, 0, 5, 0), type: DetailType.Statement, count: 3 },
			{ location: new Position(4, 3), type: DetailType.Statement, count: 4 },
		];

		// Create a new CoverageDetailsModel instance
		const model = new CoverageDetailsModel(details, textModel);

		// Verify that the ranges are generated correctly
		await assertRanges(model);
	});
});
