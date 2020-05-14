/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CoreNavigationCommands } from 'vs/editor/browser/controller/coreCommands';
import { Cursor } from 'vs/editor/common/controller/cursor';
import { CursorMove } from 'vs/editor/common/controller/cursorMoveCommands';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { withTestCodeEditor, TestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';

suite('Cursor move command test', () => {

	const TEXT = [
		'    \tMy First Line\t ',
		'\tMy Second Line',
		'    Third Line🐶',
		'',
		'1'
	].join('\n');

	function executeTest(callback: (editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor) => void): void {
		withTestCodeEditor(TEXT, {}, (editor, cursor) => {
			const viewModel = editor._getViewModel();
			if (!viewModel) {
				assert.ok(false);
				return;
			}
			callback(editor, viewModel, cursor);
		});
	}

	test('move left should move to left character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveLeft(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 7);
		});
	});

	test('move left should move to left by n characters', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveLeft(editor, viewModel, cursor, 3);
			cursorEqual(cursor, 1, 5);
		});
	});

	test('move left should move to left by half line', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveLeft(editor, viewModel, cursor, 1, CursorMove.RawUnit.HalfLine);
			cursorEqual(cursor, 1, 1);
		});
	});

	test('move left moves to previous line', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 2, 3);
			moveLeft(editor, viewModel, cursor, 10);
			cursorEqual(cursor, 1, 21);
		});
	});

	test('move right should move to right character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 5);
			moveRight(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 6);
		});
	});

	test('move right should move to right by n characters', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 2);
			moveRight(editor, viewModel, cursor, 6);
			cursorEqual(cursor, 1, 8);
		});
	});

	test('move right should move to right by half line', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 4);
			moveRight(editor, viewModel, cursor, 1, CursorMove.RawUnit.HalfLine);
			cursorEqual(cursor, 1, 14);
		});
	});

	test('move right moves to next line', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveRight(editor, viewModel, cursor, 100);
			cursorEqual(cursor, 2, 1);
		});
	});

	test('move to first character of line from middle', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveToLineStart(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 1);
		});
	});

	test('move to first character of line from first non white space character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 6);
			moveToLineStart(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 1);
		});
	});

	test('move to first character of line from first character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 1);
			moveToLineStart(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 1);
		});
	});

	test('move to first non white space character of line from middle', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveToLineFirstNonWhitespaceCharacter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 6);
		});
	});

	test('move to first non white space character of line from first non white space character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 6);
			moveToLineFirstNonWhitespaceCharacter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 6);
		});
	});

	test('move to first non white space character of line from first character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 1);
			moveToLineFirstNonWhitespaceCharacter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 6);
		});
	});

	test('move to end of line from middle', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveToLineEnd(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 21);
		});
	});

	test('move to end of line from last non white space character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 19);
			moveToLineEnd(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 21);
		});
	});

	test('move to end of line from line end', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 21);
			moveToLineEnd(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 21);
		});
	});

	test('move to last non white space character from middle', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveToLineLastNonWhitespaceCharacter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 19);
		});
	});

	test('move to last non white space character from last non white space character', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 19);
			moveToLineLastNonWhitespaceCharacter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 19);
		});
	});

	test('move to last non white space character from line end', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 21);
			moveToLineLastNonWhitespaceCharacter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 19);
		});
	});

	test('move to center of line not from center', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 8);
			moveToLineCenter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 11);
		});
	});

	test('move to center of line from center', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 11);
			moveToLineCenter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 11);
		});
	});

	test('move to center of line from start', () => {
		executeTest((editor, viewModel, cursor) => {
			moveToLineStart(editor, viewModel, cursor);
			moveToLineCenter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 11);
		});
	});

	test('move to center of line from end', () => {
		executeTest((editor, viewModel, cursor) => {
			moveToLineEnd(editor, viewModel, cursor);
			moveToLineCenter(editor, viewModel, cursor);
			cursorEqual(cursor, 1, 11);
		});
	});

	test('move up by cursor move command', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 3, 5);
			cursorEqual(cursor, 3, 5);

			moveUp(editor, viewModel, cursor, 2);
			cursorEqual(cursor, 1, 5);

			moveUp(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 1, 1);
		});
	});

	test('move up by model line cursor move command', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 3, 5);
			cursorEqual(cursor, 3, 5);

			moveUpByModelLine(editor, viewModel, cursor, 2);
			cursorEqual(cursor, 1, 5);

			moveUpByModelLine(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 1, 1);
		});
	});

	test('move down by model line cursor move command', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 3, 5);
			cursorEqual(cursor, 3, 5);

			moveDownByModelLine(editor, viewModel, cursor, 2);
			cursorEqual(cursor, 5, 2);

			moveDownByModelLine(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 5, 2);
		});
	});

	test('move up with selection by cursor move command', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 3, 5);
			cursorEqual(cursor, 3, 5);

			moveUp(editor, viewModel, cursor, 1, true);
			cursorEqual(cursor, 2, 2, 3, 5);

			moveUp(editor, viewModel, cursor, 1, true);
			cursorEqual(cursor, 1, 5, 3, 5);
		});
	});

	test('move up and down with tabs by cursor move command', () => {
		executeTest((editor, viewModel, cursor) => {
			moveTo(cursor, 1, 5);
			cursorEqual(cursor, 1, 5);

			moveDown(editor, viewModel, cursor, 4);
			cursorEqual(cursor, 5, 2);

			moveUp(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 4, 1);

			moveUp(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 3, 5);

			moveUp(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 2, 2);

			moveUp(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 1, 5);
		});
	});

	test('move up and down with end of lines starting from a long one by cursor move command', () => {
		executeTest((editor, viewModel, cursor) => {
			moveToEndOfLine(cursor);
			cursorEqual(cursor, 1, 21);

			moveToEndOfLine(cursor);
			cursorEqual(cursor, 1, 21);

			moveDown(editor, viewModel, cursor, 2);
			cursorEqual(cursor, 3, 17);

			moveDown(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 4, 1);

			moveDown(editor, viewModel, cursor, 1);
			cursorEqual(cursor, 5, 2);

			moveUp(editor, viewModel, cursor, 4);
			cursorEqual(cursor, 1, 21);
		});
	});

	test('move to view top line moves to first visible line if it is first line', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);

			moveTo(cursor, 2, 2);
			moveToTop(editor, viewModel, cursor);

			cursorEqual(cursor, 1, 6);
		});
	});

	test('move to view top line moves to top visible line when first line is not visible', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 10, 1);

			moveTo(cursor, 4, 1);
			moveToTop(editor, viewModel, cursor);

			cursorEqual(cursor, 2, 2);
		});
	});

	test('move to view top line moves to nth line from top', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);

			moveTo(cursor, 4, 1);
			moveToTop(editor, viewModel, cursor, 3);

			cursorEqual(cursor, 3, 5);
		});
	});

	test('move to view top line moves to last line if n is greater than last visible line number', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 3, 1);

			moveTo(cursor, 2, 2);
			moveToTop(editor, viewModel, cursor, 4);

			cursorEqual(cursor, 3, 5);
		});
	});

	test('move to view center line moves to the center line', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(3, 1, 3, 1);

			moveTo(cursor, 2, 2);
			moveToCenter(editor, viewModel, cursor);

			cursorEqual(cursor, 3, 5);
		});
	});

	test('move to view bottom line moves to last visible line if it is last line', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);

			moveTo(cursor, 2, 2);
			moveToBottom(editor, viewModel, cursor);

			cursorEqual(cursor, 5, 1);
		});
	});

	test('move to view bottom line moves to last visible line when last line is not visible', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 3, 1);

			moveTo(cursor, 2, 2);
			moveToBottom(editor, viewModel, cursor);

			cursorEqual(cursor, 3, 5);
		});
	});

	test('move to view bottom line moves to nth line from bottom', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);

			moveTo(cursor, 4, 1);
			moveToBottom(editor, viewModel, cursor, 3);

			cursorEqual(cursor, 3, 5);
		});
	});

	test('move to view bottom line moves to first line if n is lesser than first visible line number', () => {
		executeTest((editor, viewModel, cursor) => {
			viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 5, 1);

			moveTo(cursor, 4, 1);
			moveToBottom(editor, viewModel, cursor, 5);

			cursorEqual(cursor, 2, 2);
		});
	});
});

// Move command

function move(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, args: any) {
	CoreNavigationCommands.CursorMove.runCoreEditorCommand(editor, viewModel, cursor, args);
}

function moveToLineStart(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.WrappedLineStart });
}

function moveToLineFirstNonWhitespaceCharacter(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.WrappedLineFirstNonWhitespaceCharacter });
}

function moveToLineCenter(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.WrappedLineColumnCenter });
}

function moveToLineEnd(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.WrappedLineEnd });
}

function moveToLineLastNonWhitespaceCharacter(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.WrappedLineLastNonWhitespaceCharacter });
}

function moveLeft(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, value?: number, by?: string, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.Left, by: by, value: value, select: select });
}

function moveRight(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, value?: number, by?: string, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.Right, by: by, value: value, select: select });
}

function moveUp(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.Up, by: CursorMove.RawUnit.WrappedLine, value: noOfLines, select: select });
}

function moveUpByModelLine(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.Up, value: noOfLines, select: select });
}

function moveDown(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.Down, by: CursorMove.RawUnit.WrappedLine, value: noOfLines, select: select });
}

function moveDownByModelLine(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.Down, value: noOfLines, select: select });
}

function moveToTop(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.ViewPortTop, value: noOfLines, select: select });
}

function moveToCenter(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.ViewPortCenter, select: select });
}

function moveToBottom(editor: TestCodeEditor, viewModel: IViewModel, cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(editor, viewModel, cursor, { to: CursorMove.RawDirection.ViewPortBottom, value: noOfLines, select: select });
}

function cursorEqual(cursor: Cursor, posLineNumber: number, posColumn: number, selLineNumber: number = posLineNumber, selColumn: number = posColumn) {
	positionEqual(cursor.getPosition(), posLineNumber, posColumn);
	selectionEqual(cursor.getSelection(), posLineNumber, posColumn, selLineNumber, selColumn);
}

function positionEqual(position: Position, lineNumber: number, column: number) {
	assert.deepEqual(position, new Position(lineNumber, column), 'position equal');
}

function selectionEqual(selection: Selection, posLineNumber: number, posColumn: number, selLineNumber: number, selColumn: number) {
	assert.deepEqual({
		selectionStartLineNumber: selection.selectionStartLineNumber,
		selectionStartColumn: selection.selectionStartColumn,
		positionLineNumber: selection.positionLineNumber,
		positionColumn: selection.positionColumn
	}, {
		selectionStartLineNumber: selLineNumber,
		selectionStartColumn: selColumn,
		positionLineNumber: posLineNumber,
		positionColumn: posColumn
	}, 'selection equal');
}

function moveTo(cursor: Cursor, lineNumber: number, column: number, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.MoveToSelect.runCoreEditorCommand(cursor, {
			position: new Position(lineNumber, column)
		});
	} else {
		CoreNavigationCommands.MoveTo.runCoreEditorCommand(cursor, {
			position: new Position(lineNumber, column)
		});
	}
}

function moveToEndOfLine(cursor: Cursor, inSelectionMode: boolean = false) {
	if (inSelectionMode) {
		CoreNavigationCommands.CursorEndSelect.runCoreEditorCommand(cursor, {});
	} else {
		CoreNavigationCommands.CursorEnd.runCoreEditorCommand(cursor, {});
	}
}
