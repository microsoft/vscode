/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Selection } from 'vs/editor/common/core/selection';
import { MoveCaretCommand } from 'vs/editor/contrib/caretOperations/browser/moveCaretCommand';
import { testCommand } from 'vs/editor/test/browser/testCommand';


function testMoveCaretLeftCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new MoveCaretCommand(sel, true), expectedLines, expectedSelection);
}

function testMoveCaretRightCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new MoveCaretCommand(sel, false), expectedLines, expectedSelection);
}

suite('Editor Contrib - Move Caret Command', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('move selection to left', function () {
		testMoveCaretLeftCommand(
			[
				'012345'
			],
			new Selection(1, 3, 1, 5),
			[
				'023145'
			],
			new Selection(1, 2, 1, 4)
		);
	});
	test('move selection to right', function () {
		testMoveCaretRightCommand(
			[
				'012345'
			],
			new Selection(1, 3, 1, 5),
			[
				'014235'
			],
			new Selection(1, 4, 1, 6)
		);
	});
	test('move selection to left - from first column - no change', function () {
		testMoveCaretLeftCommand(
			[
				'012345'
			],
			new Selection(1, 1, 1, 1),
			[
				'012345'
			],
			new Selection(1, 1, 1, 1)
		);
	});
	test('move selection to right - from last column - no change', function () {
		testMoveCaretRightCommand(
			[
				'012345'
			],
			new Selection(1, 5, 1, 7),
			[
				'012345'
			],
			new Selection(1, 5, 1, 7)
		);
	});
});
