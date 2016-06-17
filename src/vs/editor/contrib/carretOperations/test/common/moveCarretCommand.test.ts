/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Selection} from 'vs/editor/common/core/selection';
import {MoveCarretCommand} from 'vs/editor/contrib/carretOperations/common/moveCarretCommand';
import {testCommand} from 'vs/editor/test/common/commands/commandTestUtils';


function testMoveCarretLeftCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (sel) => new MoveCarretCommand(sel, true), expectedLines, expectedSelection);
}

function testMoveCarretRightCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (sel) => new MoveCarretCommand(sel, false), expectedLines, expectedSelection);
}

suite('Editor Contrib - Move Carret Command', () => {

	test('move selection to left', function () {
		testMoveCarretLeftCommand(
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
		testMoveCarretRightCommand(
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
		testMoveCarretLeftCommand(
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
		testMoveCarretRightCommand(
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