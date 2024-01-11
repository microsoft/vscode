/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { assertSnapshot } from 'vs/base/test/common/snapshot';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CoverageDetailsModel } from 'vs/workbench/contrib/testing/browser/codeCoverageDecorations';
import { CoverageDetails, DetailType } from 'vs/workbench/contrib/testing/common/testTypes';

suite('Code Coverage Decorations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('CoverageDetailsModel#1', async () => {
		// Create some sample coverage details
		const details: CoverageDetails[] = [
			{ location: new Range(1, 0, 5, 0), type: DetailType.Statement, count: 1 },
			{ location: new Range(2, 0, 3, 0), type: DetailType.Statement, count: 2 },
			{ location: new Range(4, 0, 6, 0), type: DetailType.Statement, branches: [{ location: new Range(3, 0, 7, 0), count: 3 }], count: 4 },
		];

		// Create a new CoverageDetailsModel instance
		const model = new CoverageDetailsModel(details);

		// Verify that the ranges are generated correctly
		await assertSnapshot(model.ranges.map(r => ({
			range: r.range.toString(),
			count: r.metadata.type === DetailType.Branch ? r.metadata.detail.branches![r.metadata.branch].count : r.metadata.count,
		})));
	});

	test('CoverageDetailsModel#2', async () => {
		// Create some sample coverage details
		const details: CoverageDetails[] = [
			{ location: new Range(1, 0, 5, 0), type: DetailType.Statement, count: 1 },
			{ location: new Range(2, 0, 4, 0), type: DetailType.Statement, count: 2 },
			{ location: new Range(3, 0, 3, 5), type: DetailType.Statement, count: 3 },
		];

		// Create a new CoverageDetailsModel instance
		const model = new CoverageDetailsModel(details);

		// Verify that the ranges are generated correctly
		await assertSnapshot(model.ranges.map(r => ({
			range: r.range.toString(),
			count: r.metadata.type === DetailType.Branch ? r.metadata.detail.branches![r.metadata.branch].count : r.metadata.count,
		})));
	});

	test('CoverageDetailsModel#3', async () => {
		// Create some sample coverage details
		const details: CoverageDetails[] = [
			{ location: new Range(1, 0, 5, 0), type: DetailType.Statement, count: 1 },
			{ location: new Range(2, 0, 3, 0), type: DetailType.Statement, count: 2 },
			{ location: new Range(4, 0, 5, 0), type: DetailType.Statement, count: 3 },
		];

		// Create a new CoverageDetailsModel instance
		const model = new CoverageDetailsModel(details);

		// Verify that the ranges are generated correctly
		await assertSnapshot(model.ranges.map(r => ({
			range: r.range.toString(),
			count: r.metadata.type === DetailType.Branch ? r.metadata.detail.branches![r.metadata.branch].count : r.metadata.count,
		})));
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
		const model = new CoverageDetailsModel(details);

		// Verify that the ranges are generated correctly
		await assertSnapshot(model.ranges.map(r => ({
			range: r.range.toString(),
			count: r.metadata.type === DetailType.Branch ? r.metadata.detail.branches![r.metadata.branch].count : r.metadata.count,
		})));
	});
});
