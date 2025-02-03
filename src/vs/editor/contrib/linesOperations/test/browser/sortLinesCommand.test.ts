/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../common/core/selection.js';
import { SortLinesCommand } from '../../browser/sortLinesCommand.js';
import { testCommand } from '../../../../test/browser/testCommand.js';

function testSortLinesAscendingCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new SortLinesCommand(sel, false), expectedLines, expectedSelection);
}

function testSortLinesDescendingCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new SortLinesCommand(sel, true), expectedLines, expectedSelection);
}

suite('Editor Contrib - Sort Lines Command', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('no op unless at least two lines selected 1', function () {
		testSortLinesAscendingCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 1)
		);
	});

	test('no op unless at least two lines selected 2', function () {
		testSortLinesAscendingCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 2, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 2, 1)
		);
	});

	test('sorting two lines ascending', function () {
		testSortLinesAscendingCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(3, 3, 4, 2),
			[
				'first',
				'second line',
				'fourth line',
				'third line',
				'fifth'
			],
			new Selection(3, 3, 4, 1)
		);
	});

	test('sorting first 4 lines ascending', function () {
		testSortLinesAscendingCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 5, 1),
			[
				'first',
				'fourth line',
				'second line',
				'third line',
				'fifth'
			],
			new Selection(1, 1, 5, 1)
		);
	});

	test('sorting all lines ascending', function () {
		testSortLinesAscendingCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 5, 6),
			[
				'fifth',
				'first',
				'fourth line',
				'second line',
				'third line',
			],
			new Selection(1, 1, 5, 11)
		);
	});

	test('sorting first 4 lines descending', function () {
		testSortLinesDescendingCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 5, 1),
			[
				'third line',
				'second line',
				'fourth line',
				'first',
				'fifth'
			],
			new Selection(1, 1, 5, 1)
		);
	});

	test('sorting all lines descending', function () {
		testSortLinesDescendingCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 5, 6),
			[
				'third line',
				'second line',
				'fourth line',
				'first',
				'fifth',
			],
			new Selection(1, 1, 5, 6)
		);
	});
});
