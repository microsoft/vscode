/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import { DeleteLinesCommand } from 'vs/editor/contrib/linesOperations/common/deleteLinesCommand';
import { testCommand } from 'vs/editor/test/common/commands/commandTestUtils';

function testDeleteLinesCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (sel) => DeleteLinesCommand.createFromSelection(sel), expectedLines, expectedSelection);
}

suite('Editor Contrib - Delete Lines Command', () => {

	test('empty selection in middle of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 3, 2, 3),
			[
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 3, 2, 3)
		);
	});

	test('empty selection at top of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5),
			[
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('empty selection at end of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 2, 5, 2),
			[
				'first',
				'second line',
				'third line',
				'fourth line'
			],
			new Selection(4, 2, 4, 2)
		);
	});

	test('with selection in middle of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(3, 3, 2, 2),
			[
				'first',
				'fourth line',
				'fifth'
			],
			new Selection(2, 2, 2, 2)
		);
	});

	test('with selection at top of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 4, 1, 5),
			[
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('with selection at end of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 1, 5, 2),
			[
				'first',
				'second line',
				'third line',
				'fourth line'
			],
			new Selection(4, 2, 4, 2)
		);
	});

	test('with full line selection in middle of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 1, 2, 1),
			[
				'first',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 2, 1)
		);
	});

	test('with full line selection at top of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 1, 5),
			[
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 5, 1, 5)
		);
	});

	test('with full line selection at end of lines', function () {
		testDeleteLinesCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 1, 5, 2),
			[
				'first',
				'second line',
				'third line'
			],
			new Selection(3, 2, 3, 2)
		);
	});
});

