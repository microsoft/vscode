/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Cursor } from 'vs/editor/common/controller/cursor';
import { Position } from 'vs/editor/common/core/position';
import { Handler, IEditorOptions, ITextModelCreationOptions, CursorMovePosition, CursorMoveByUnit, ISelection } from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { IMode } from 'vs/editor/common/modes';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import { viewModelHelper as aViewModelHelper } from 'vs/editor/test/common/editorTestUtils';
import { IViewModelHelper } from 'vs/editor/common/controller/oneCursor';
import { Range } from 'vs/editor/common/core/range';

let H = Handler;

suite('Cursor move command test', () => {

	let thisModel: Model;
	let thisConfiguration: TestConfiguration;
	let thisCursor: Cursor;

	setup(() => {
		let text = [
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1'
		].join('\n');

		thisModel = Model.createFromString(text);
		thisConfiguration = new TestConfiguration(null);
	});

	teardown(() => {
		thisCursor.dispose();
		thisModel.dispose();
		thisConfiguration.dispose();
	});

	test('move left should move to left character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveLeft(thisCursor);

		cursorEqual(thisCursor, 1, 7);
	});

	test('move left should move to left by n characters', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveLeft(thisCursor, 3);

		cursorEqual(thisCursor, 1, 5);
	});

	test('move left should move to left by half line', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveLeft(thisCursor, 1, CursorMoveByUnit.HalfLine);

		cursorEqual(thisCursor, 1, 1);
	});

	test('move left moves to previous line', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 2, 3);

		moveLeft(thisCursor, 10);

		cursorEqual(thisCursor, 1, 21);
	});

	test('move right should move to right character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 5);

		moveRight(thisCursor);

		cursorEqual(thisCursor, 1, 6);
	});

	test('move right should move to right by n characters', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 2);

		moveRight(thisCursor, 6);

		cursorEqual(thisCursor, 1, 8);
	});

	test('move right should move to right by half line', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 4);

		moveRight(thisCursor, 1, CursorMoveByUnit.HalfLine);

		cursorEqual(thisCursor, 1, 14);
	});

	test('move right moves to next line', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveRight(thisCursor, 100);

		cursorEqual(thisCursor, 2, 1);
	});

	test('move to first character of line from middle', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);
		moveToLineStart(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to first character of line from first non white space character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 6);

		moveToLineStart(thisCursor);

		cursorEqual(thisCursor, 1, 1);
	});

	test('move to first character of line from first character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 1);

		moveToLineStart(thisCursor);

		cursorEqual(thisCursor, 1, 1);
	});

	test('move to first non white space character of line from middle', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveToLineFirstNonWhiteSpaceCharacter(thisCursor);

		cursorEqual(thisCursor, 1, 6);
	});

	test('move to first non white space character of line from first non white space character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 6);

		moveToLineFirstNonWhiteSpaceCharacter(thisCursor);

		cursorEqual(thisCursor, 1, 6);
	});

	test('move to first non white space character of line from first character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 1);

		moveToLineFirstNonWhiteSpaceCharacter(thisCursor);

		cursorEqual(thisCursor, 1, 6);
	});

	test('move to end of line from middle', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveToLineEnd(thisCursor);

		cursorEqual(thisCursor, 1, 21);
	});

	test('move to end of line from last non white space character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 19);

		moveToLineEnd(thisCursor);

		cursorEqual(thisCursor, 1, 21);
	});

	test('move to end of line from line end', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 21);

		moveToLineEnd(thisCursor);

		cursorEqual(thisCursor, 1, 21);
	});

	test('move to last non white space character from middle', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveToLineLastNonWhiteSpaceCharacter(thisCursor);

		cursorEqual(thisCursor, 1, 19);
	});

	test('move to last non white space character from last non white space character', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 19);

		moveToLineLastNonWhiteSpaceCharacter(thisCursor);

		cursorEqual(thisCursor, 1, 19);
	});

	test('move to last non white space character from line end', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 21);

		moveToLineLastNonWhiteSpaceCharacter(thisCursor);

		cursorEqual(thisCursor, 1, 19);
	});

	test('move to center of line not from center', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 8);

		moveToLineCenter(thisCursor);

		cursorEqual(thisCursor, 1, 11);
	});

	test('move to center of line from center', () => {
		thisCursor = aCursor();
		moveTo(thisCursor, 1, 11);

		moveToLineCenter(thisCursor);

		cursorEqual(thisCursor, 1, 11);
	});

	test('move to center of line from start', () => {
		thisCursor = aCursor();
		moveToLineStart(thisCursor);

		moveToLineCenter(thisCursor);

		cursorEqual(thisCursor, 1, 11);
	});

	test('move to center of line from end', () => {
		thisCursor = aCursor();
		moveToLineEnd(thisCursor);

		moveToLineCenter(thisCursor);

		cursorEqual(thisCursor, 1, 11);
	});

	test('move up by cursor move command', () => {
		thisCursor = aCursor();

		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveUp(thisCursor, 2);
		cursorEqual(thisCursor, 1, 5);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move up by model line cursor move command', () => {
		thisCursor = aCursor();

		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveUpByModelLine(thisCursor, 2);
		cursorEqual(thisCursor, 1, 5);

		moveUpByModelLine(thisCursor, 1);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move down by model line cursor move command', () => {
		thisCursor = aCursor();

		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveDownByModelLine(thisCursor, 2);
		cursorEqual(thisCursor, 5, 2);

		moveDownByModelLine(thisCursor, 1);
		cursorEqual(thisCursor, 5, 2);
	});

	test('move up with selection by cursor move command', () => {
		thisCursor = aCursor();

		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveUp(thisCursor, 1, true);
		cursorEqual(thisCursor, 2, 2, 3, 5);

		moveUp(thisCursor, 1, true);
		cursorEqual(thisCursor, 1, 5, 3, 5);
	});

	test('move up and down with tabs by cursor move command', () => {
		thisCursor = aCursor();

		moveTo(thisCursor, 1, 5);
		cursorEqual(thisCursor, 1, 5);

		moveDown(thisCursor, 4);
		cursorEqual(thisCursor, 5, 2);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 4, 1);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 3, 5);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 2, 2);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 1, 5);
	});

	test('move up and down with end of lines starting from a long one by cursor move command', () => {
		thisCursor = aCursor();

		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 21);

		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 21);

		moveDown(thisCursor, 2);
		cursorEqual(thisCursor, 3, 17);

		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 4, 1);

		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, 2);

		moveUp(thisCursor, 4);
		cursorEqual(thisCursor, 1, 21);
	});

	test('move to view top line moves to first visible line if it is first line', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 2, 2);
		moveToTop(thisCursor);

		cursorEqual(thisCursor, 1, 6);
	});

	test('move to view top line moves to top visible line when first line is not visible', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(2, 1, 10, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 4, 1);
		moveToTop(thisCursor);

		cursorEqual(thisCursor, 2, 2);
	});

	test('move to view top line moves to nth line from top', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 4, 1);
		moveToTop(thisCursor, 3);

		cursorEqual(thisCursor, 3, 5);
	});

	test('move to view top line moves to last line if n is greater than last visible line number', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(1, 1, 3, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 2, 2);
		moveToTop(thisCursor, 4);

		cursorEqual(thisCursor, 3, 5);
	});

	test('move to view center line moves to the center line', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(3, 1, 3, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 2, 2);
		moveToCenter(thisCursor);

		cursorEqual(thisCursor, 3, 5);
	});

	test('move to view bottom line moves to last visible line if it is last line', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 2, 2);
		moveToBottom(thisCursor);

		cursorEqual(thisCursor, 5, 1);
	});

	test('move to view bottom line moves to last visible line when last line is not visible', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(2, 1, 3, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 2, 2);
		moveToBottom(thisCursor);

		cursorEqual(thisCursor, 3, 5);
	});

	test('move to view bottom line moves to nth line from bottom', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 4, 1);
		moveToBottom(thisCursor, 3);

		cursorEqual(thisCursor, 3, 5);
	});

	test('move to view bottom line moves to first line if n is lesser than first visible line number', () => {
		let viewModelHelper = aViewModelHelper(thisModel);
		viewModelHelper.getCompletelyVisibleViewRange = () => new Range(2, 1, 5, 1);
		thisCursor = aCursor(viewModelHelper);

		moveTo(thisCursor, 4, 1);
		moveToBottom(thisCursor, 5);

		cursorEqual(thisCursor, 2, 2);
	});

	function aCursor(viewModelHelper?: IViewModelHelper): Cursor {
		return new Cursor(thisConfiguration, thisModel, viewModelHelper || aViewModelHelper(thisModel), false);
	}

});

interface ICursorOpts {
	text: string[];
	mode?: IMode;
	modelOpts?: ITextModelCreationOptions;
	editorOpts?: IEditorOptions;
}

// --------- utils

function cursorCommand(cursor: Cursor, command: string, extraData?: any, overwriteSource?: string) {
	cursor.trigger(overwriteSource || 'tests', command, extraData);
}



// Move command

function move(cursor: Cursor, args: any) {
	cursorCommand(cursor, H.CursorMove, args);
}

function moveToLineStart(cursor: Cursor) {
	move(cursor, { to: CursorMovePosition.WrappedLineStart });
}

function moveToLineFirstNonWhiteSpaceCharacter(cursor: Cursor) {
	move(cursor, { to: CursorMovePosition.WrappedLineFirstNonWhitespaceCharacter });
}

function moveToLineCenter(cursor: Cursor) {
	move(cursor, { to: CursorMovePosition.WrappedLineColumnCenter });
}

function moveToLineEnd(cursor: Cursor) {
	move(cursor, { to: CursorMovePosition.WrappedLineEnd });
}

function moveToLineLastNonWhiteSpaceCharacter(cursor: Cursor) {
	move(cursor, { to: CursorMovePosition.WrappedLineLastNonWhitespaceCharacter });
}

function moveLeft(cursor: Cursor, value?: number, by?: string, select?: boolean) {
	move(cursor, { to: CursorMovePosition.Left, by: by, value: value, select: select });
}

function moveRight(cursor: Cursor, value?: number, by?: string, select?: boolean) {
	move(cursor, { to: CursorMovePosition.Right, by: by, value: value, select: select });
}

function moveUp(cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(cursor, { to: CursorMovePosition.Up, by: CursorMoveByUnit.WrappedLine, value: noOfLines, select: select });
}

function moveUpByModelLine(cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(cursor, { to: CursorMovePosition.Up, value: noOfLines, select: select });
}

function moveDown(cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(cursor, { to: CursorMovePosition.Down, by: CursorMoveByUnit.WrappedLine, value: noOfLines, select: select });
}

function moveDownByModelLine(cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(cursor, { to: CursorMovePosition.Down, value: noOfLines, select: select });
}

function moveToTop(cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(cursor, { to: CursorMovePosition.ViewPortTop, value: noOfLines, select: select });
}

function moveToCenter(cursor: Cursor, select?: boolean) {
	move(cursor, { to: CursorMovePosition.ViewPortCenter, select: select });
}

function moveToBottom(cursor: Cursor, noOfLines: number = 1, select?: boolean) {
	move(cursor, { to: CursorMovePosition.ViewPortBottom, value: noOfLines, select: select });
}

function cursorEqual(cursor: Cursor, posLineNumber: number, posColumn: number, selLineNumber: number = posLineNumber, selColumn: number = posColumn) {
	positionEqual(cursor.getPosition(), posLineNumber, posColumn);
	selectionEqual(cursor.getSelection(), posLineNumber, posColumn, selLineNumber, selColumn);
}

function positionEqual(position: Position, lineNumber: number, column: number) {
	assert.deepEqual(position, new Position(lineNumber, column), 'position equal');
}

function selectionEqual(selection: ISelection, posLineNumber: number, posColumn: number, selLineNumber: number, selColumn: number) {
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
	cursorCommand(cursor, inSelectionMode ? H.MoveToSelect : H.MoveTo, { position: new Position(lineNumber, column) });
}

function moveToEndOfLine(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorEndSelect : H.CursorEnd);
}