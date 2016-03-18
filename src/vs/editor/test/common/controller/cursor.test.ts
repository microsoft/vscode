/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Cursor} from 'vs/editor/common/controller/cursor';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {EndOfLinePreference, EventType, Handler, IPosition, ISelection, DefaultEndOfLine, ITextModelCreationOptions} from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {IMode, IRichEditSupport, IndentAction} from 'vs/editor/common/modes';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {MockConfiguration} from 'vs/editor/test/common/mocks/mockConfiguration';
import {BracketMode} from 'vs/editor/test/common/testModes';

let H = Handler;

// --------- utils

function cursorCommand(cursor: Cursor, command: string, extraData?: any, sizeProvider?: { pageSize: number; }, overwriteSource?: string) {
	if (sizeProvider) {
		cursor.configuration.editor.pageSize = sizeProvider.pageSize;
	}
	cursor.configuration.handlerDispatcher.trigger(overwriteSource || 'tests', command, extraData);
}

function moveTo(cursor: Cursor, lineNumber: number, column: number, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.MoveToSelect : H.MoveTo, { position: new Position(lineNumber, column) });
}

function moveLeft(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorLeftSelect : H.CursorLeft);
}

function moveWordLeft(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordLeftSelect : H.CursorWordLeft);
}
function moveWordStartLeft(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordStartLeftSelect : H.CursorWordStartLeft);
}
function moveWordEndLeft(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordEndLeftSelect : H.CursorWordEndLeft);
}

function moveRight(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorRightSelect : H.CursorRight);
}

function moveWordRight(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordRightSelect : H.CursorWordRight);
}
function moveWordEndRight(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordEndRightSelect : H.CursorWordEndRight);
}
function moveWordStartRight(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordStartRightSelect : H.CursorWordStartRight);
}

function moveDown(cursor: Cursor, linesCount: number, inSelectionMode: boolean = false) {
	if (linesCount === 1) {
		cursorCommand(cursor, inSelectionMode ? H.CursorDownSelect : H.CursorDown);
	} else {
		cursorCommand(cursor, inSelectionMode ? H.CursorPageDownSelect : H.CursorPageDown, null, { pageSize: linesCount });
	}
}

function moveUp(cursor: Cursor, linesCount: number, inSelectionMode: boolean = false) {
	if (linesCount === 1) {
		cursorCommand(cursor, inSelectionMode ? H.CursorUpSelect : H.CursorUp);
	} else {
		cursorCommand(cursor, inSelectionMode ? H.CursorPageUpSelect : H.CursorPageUp, null, { pageSize: linesCount });
	}
}

function moveToBeginningOfLine(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorHomeSelect : H.CursorHome);
}

function moveToEndOfLine(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ?  H.CursorEndSelect : H.CursorEnd);
}

function moveToBeginningOfBuffer(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorTopSelect : H.CursorTop);
}

function moveToEndOfBuffer(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorBottomSelect : H.CursorBottom);
}

function deleteWordLeft(cursor: Cursor) {
	cursorCommand(cursor, H.DeleteWordLeft);
}
function deleteWordStartLeft(cursor: Cursor) {
	cursorCommand(cursor, H.DeleteWordStartLeft);
}
function deleteWordEndLeft(cursor: Cursor) {
	cursorCommand(cursor, H.DeleteWordEndLeft);
}

function deleteWordRight(cursor: Cursor) {
	cursorCommand(cursor, H.DeleteWordRight);
}
function deleteWordStartRight(cursor: Cursor) {
	cursorCommand(cursor, H.DeleteWordStartRight);
}
function deleteWordEndRight(cursor: Cursor) {
	cursorCommand(cursor, H.DeleteWordEndRight);
}

function positionEqual(position:IPosition, lineNumber: number, column: number) {
	assert.deepEqual({
		lineNumber: position.lineNumber,
		column: position.column
	}, {
		lineNumber: lineNumber,
		column: column
	}, 'position equal');
}

function selectionEqual(selection:ISelection, posLineNumber: number, posColumn: number, selLineNumber: number, selColumn: number) {
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

function cursorEqual(cursor: Cursor, posLineNumber: number, posColumn: number, selLineNumber: number = posLineNumber, selColumn: number = posColumn) {
	positionEqual(cursor.getPosition(), posLineNumber, posColumn);
	selectionEqual(cursor.getSelection(), posLineNumber, posColumn, selLineNumber, selColumn);
}

function cursorEquals(cursor: Cursor, selections: Selection[]): void {
	let actual = cursor.getSelections().map(s => s.toString());
	let expected = selections.map(s => s.toString());

	assert.deepEqual(actual, expected);
}

suite('Editor Controller - Cursor', () => {
	const LINE1 = '    \tMy First Line\t ';
	const LINE2 = '\tMy Second Line';
	const LINE3 = '    Third Line💩';
	const LINE4 = '';
	const LINE5 = '1';

	let thisModel: Model;
	let thisConfiguration: MockConfiguration;
	let thisCursor: Cursor;

	setup(() => {
		let text =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;

		thisModel = new Model(text, Model.DEFAULT_CREATION_OPTIONS, null);
		thisConfiguration = new MockConfiguration(null);
		thisCursor = new Cursor(1, thisConfiguration, thisModel, null, false);
	});

	teardown(() => {
		thisCursor.dispose();
		thisModel.dispose();
		thisConfiguration.dispose();
	});

	test('cursor initialized', () => {
		cursorEqual(thisCursor, 1, 1);
	});

	// --------- absolute move

	test('no move', () => {
		moveTo(thisCursor, 1, 1);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move', () => {
		moveTo(thisCursor, 1, 2);
		cursorEqual(thisCursor, 1, 2);
	});

	test('move in selection mode', () => {
		moveTo(thisCursor, 1, 2, true);
		cursorEqual(thisCursor, 1, 2, 1, 1);
	});

	test('move beyond line end', () => {
		moveTo(thisCursor, 1, 25);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	test('move empty line', () => {
		moveTo(thisCursor, 4, 20);
		cursorEqual(thisCursor, 4, 1);
	});

	test('move one char line', () => {
		moveTo(thisCursor, 5, 20);
		cursorEqual(thisCursor, 5, 2);
	});

	test('selection down', () => {
		moveTo(thisCursor, 2, 1, true);
		cursorEqual(thisCursor, 2, 1, 1, 1);
	});

	test('move and then select', () => {
		moveTo(thisCursor, 2, 3);
		cursorEqual(thisCursor, 2, 3);

		moveTo(thisCursor, 2, 15, true);
		cursorEqual(thisCursor, 2, 15, 2, 3);

		moveTo(thisCursor, 1, 2, true);
		cursorEqual(thisCursor, 1, 2, 2, 3);
	});

	// --------- move left

	test('move left on top left position', () => {
		moveLeft(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move left', () => {
		moveTo(thisCursor, 1, 3);
		cursorEqual(thisCursor, 1, 3);
		moveLeft(thisCursor);
		cursorEqual(thisCursor, 1, 2);
	});

	test('move left with surrogate pair', () => {
		moveTo(thisCursor, 3, 17);
		cursorEqual(thisCursor, 3, 17);
		moveLeft(thisCursor);
		cursorEqual(thisCursor, 3, 15);
	});

	test('move left goes to previous row', () => {
		moveTo(thisCursor, 2, 1);
		cursorEqual(thisCursor, 2, 1);
		moveLeft(thisCursor);
		cursorEqual(thisCursor, 1, 21);
	});

	test('move left selection', () => {
		moveTo(thisCursor, 2, 1);
		cursorEqual(thisCursor, 2, 1);
		moveLeft(thisCursor, true);
		cursorEqual(thisCursor, 1, 21, 2, 1);
	});

	// --------- move word left

	test('move word left', () => {
		moveTo(thisCursor, 5, 2);
		let expectedStops = [
			[5, 1],
			[4, 1],
			[3, 11],
			[3, 5],
			[3, 1],
			[2, 12],
			[2, 5],
			[2, 2],
			[2, 1],
			[1, 15],
			[1, 9],
			[1, 6],
			[1, 1],
			[1, 1],
		];

		let actualStops:number[][] = [];
		for (let i = 0; i < expectedStops.length; i++) {
			moveWordLeft(thisCursor);
			let pos = thisCursor.getPosition();
			actualStops.push([pos.lineNumber, pos.column]);
		}

		assert.deepEqual(actualStops, expectedStops);
	});

	test('move word left selection', () => {
		moveTo(thisCursor, 5, 2);
		cursorEqual(thisCursor, 5, 2);
		moveWordLeft(thisCursor, true);
		cursorEqual(thisCursor, 5, 1, 5, 2);
	});

	// --------- move right

	test('move right on bottom right position', () => {
		moveTo(thisCursor, 5, 2);
		cursorEqual(thisCursor, 5, 2);
		moveRight(thisCursor);
		cursorEqual(thisCursor, 5, 2);
	});

	test('move right', () => {
		moveTo(thisCursor, 1, 3);
		cursorEqual(thisCursor, 1, 3);
		moveRight(thisCursor);
		cursorEqual(thisCursor, 1, 4);
	});

	test('move right with surrogate pair', () => {
		moveTo(thisCursor, 3, 15);
		cursorEqual(thisCursor, 3, 15);
		moveRight(thisCursor);
		cursorEqual(thisCursor, 3, 17);
	});

	test('move right goes to next row', () => {
		moveTo(thisCursor, 1, 21);
		cursorEqual(thisCursor, 1, 21);
		moveRight(thisCursor);
		cursorEqual(thisCursor, 2, 1);
	});

	test('move right selection', () => {
		moveTo(thisCursor, 1, 21);
		cursorEqual(thisCursor, 1, 21);
		moveRight(thisCursor, true);
		cursorEqual(thisCursor, 2, 1, 1, 21);
	});

	// --------- move word right

	test('move word right', () => {
		moveTo(thisCursor, 1, 1);
		let expectedStops = [
			[1, 8],
			[1, 14],
			[1, 19],
			[1, 21],
			[2, 4],
			[2, 11],
			[2, 16],
			[3, 10],
			[3, 17],
			[4, 1],
			[5, 2],
			[5, 2],
		];

		let actualStops:number[][] = [];
		for (let i = 0; i < expectedStops.length; i++) {
			moveWordRight(thisCursor);
			let pos = thisCursor.getPosition();
			actualStops.push([pos.lineNumber, pos.column]);
		}

		assert.deepEqual(actualStops, expectedStops);
	});

	test('move word right selection', () => {
		moveTo(thisCursor, 1, 1);
		cursorEqual(thisCursor, 1, 1);
		moveWordRight(thisCursor, true);
		cursorEqual(thisCursor, 1, 8, 1, 1);
	});
	// --------- move down

	test('move down', () => {
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 2, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 3, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 4, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, 2);
	});

	test('move down with selection', () => {
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 2, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 3, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 4, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 5, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 5, 2, 1, 1);
	});

	test('move down with tabs', () => {
		moveTo(thisCursor, 1, 5);
		cursorEqual(thisCursor, 1, 5);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 2, 2);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 3, 5);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 4, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, 2);
	});

	// --------- move up

	test('move up', () => {
		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 2, 2);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 1, 5);
	});

	test('move up with selection', () => {
		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveUp(thisCursor, 1, true);
		cursorEqual(thisCursor, 2, 2, 3, 5);

		moveUp(thisCursor, 1, true);
		cursorEqual(thisCursor, 1, 5, 3, 5);
	});

	test('move up and down with tabs', () => {
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

	test('move up and down with end of lines starting from a long one', () => {
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 2, LINE2.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 3, LINE3.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 4, LINE4.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
		moveUp(thisCursor, 4);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	// --------- move to beginning of line

	test('move to beginning of line', () => {
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 6);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of line from within line', () => {
		moveTo(thisCursor, 1, 8);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 6);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of line from whitespace at beginning of line', () => {
		moveTo(thisCursor, 1, 2);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 1);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 6);
	});

	test('move to beginning of line from within line selection', () => {
		moveTo(thisCursor, 1, 8);
		moveToBeginningOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, 6, 1, 8);
		moveToBeginningOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, 1, 1, 8);
	});

	// --------- move to end of line

	test('move to end of line', () => {
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	test('move to end of line from within line', () => {
		moveTo(thisCursor, 1, 6);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	test('move to end of line from whitespace at end of line', () => {
		moveTo(thisCursor, 1, 20);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
	});

	test('move to end of line from within line selection', () => {
		moveTo(thisCursor, 1, 6);
		moveToEndOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, LINE1.length - 1, 1, 6);
		moveToEndOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 6);
	});

	// --------- move to beginning of buffer

	test('move to beginning of buffer', () => {
		moveToBeginningOfBuffer(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of buffer from within first line', () => {
		moveTo(thisCursor, 1, 3);
		moveToBeginningOfBuffer(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of buffer from within another line', () => {
		moveTo(thisCursor, 3, 3);
		moveToBeginningOfBuffer(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of buffer from within first line selection', () => {
		moveTo(thisCursor, 1, 3);
		moveToBeginningOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 1, 1, 1, 3);
	});

	test('move to beginning of buffer from within another line selection', () => {
		moveTo(thisCursor, 3, 3);
		moveToBeginningOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 1, 1, 3, 3);
	});

	// --------- move to end of buffer

	test('move to end of buffer', () => {
		moveToEndOfBuffer(thisCursor);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
	});

	test('move to end of buffer from within last line', () => {
		moveTo(thisCursor, 5, 1);
		moveToEndOfBuffer(thisCursor);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
	});

	test('move to end of buffer from within another line', () => {
		moveTo(thisCursor, 3, 3);
		moveToEndOfBuffer(thisCursor);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
	});

	test('move to end of buffer from within last line selection', () => {
		moveTo(thisCursor, 5, 1);
		moveToEndOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 5, 1);
	});

	test('move to end of buffer from within another line selection', () => {
		moveTo(thisCursor, 3, 3);
		moveToEndOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 3, 3);
	});

	// --------- delete word left/right

	test('delete word left for non-empty selection', () => {
		moveTo(thisCursor, 3, 7);
		moveRight(thisCursor, true);
		moveRight(thisCursor, true);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Thd Line💩');
		cursorEqual(thisCursor, 3, 7);
	});

	test('delete word left for caret at beginning of document', () => {
		moveTo(thisCursor, 1, 1);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy First Line\t ');
		cursorEqual(thisCursor, 1, 1);
	});

	test('delete word left for caret at end of whitespace', () => {
		moveTo(thisCursor, 3, 11);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Line💩');
		cursorEqual(thisCursor, 3, 5);
	});

	test('delete word left for caret just behind a word', () => {
		moveTo(thisCursor, 2, 11);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(2), '\tMy  Line');
		cursorEqual(thisCursor, 2, 5);
	});

	test('delete word left for caret inside of a word', () => {
		moveTo(thisCursor, 1, 12);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy st Line\t ');
		cursorEqual(thisCursor, 1, 9);
	});

	test('delete word right for non-empty selection', () => {
		moveTo(thisCursor, 3, 7);
		moveRight(thisCursor, true);
		moveRight(thisCursor, true);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Thd Line💩');
		cursorEqual(thisCursor, 3, 7);
	});

	test('delete word right for caret at end of document', () => {
		moveTo(thisCursor, 5, 3);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(5), '1');
		cursorEqual(thisCursor, 5, 2);
	});

	test('delete word right for caret at beggining of whitespace', () => {
		moveTo(thisCursor, 3, 1);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(3), 'Third Line💩');
		cursorEqual(thisCursor, 3, 1);
	});

	test('delete word right for caret just before a word', () => {
		moveTo(thisCursor, 2, 5);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(2), '\tMy  Line');
		cursorEqual(thisCursor, 2, 5);
	});

	test('delete word right for caret inside of a word', () => {
		moveTo(thisCursor, 1, 11);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy Fi Line\t ');
		cursorEqual(thisCursor, 1, 11);
	});

	// --------- misc

	test('select all', () => {
		cursorCommand(thisCursor, H.SelectAll);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 1, 1);
	});

	test('expandLineSelection', () => {
		//              0          1         2
		//              01234 56789012345678 0
		// let LINE1 = '    \tMy First Line\t ';
		moveTo(thisCursor, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 2);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 5);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 19);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 20);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 21);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 2, LINE2.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 3, LINE3.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 4, LINE4.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 1, 1);
	});

	// --------- eventing

	test('no move doesn\'t trigger event', () => {
		thisCursor.addListener(EventType.CursorPositionChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisCursor.addListener(EventType.CursorSelectionChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		moveTo(thisCursor, 1, 1);
	});

	test('move eventing', () => {
		let events = 0;
		thisCursor.addListener(EventType.CursorPositionChanged, (e) => {
			events++;
			positionEqual(e.position, 1, 2);
		});
		thisCursor.addListener(EventType.CursorSelectionChanged, (e) => {
			events++;
			selectionEqual(e.selection, 1, 2, 1, 2);
		});
		moveTo(thisCursor, 1, 2);
		assert.equal(events, 2, 'receives 2 events');
	});

	test('move in selection mode eventing', () => {
		let events = 0;
		thisCursor.addListener(EventType.CursorPositionChanged, (e) => {
			events++;
			positionEqual(e.position, 1, 2);
		});
		thisCursor.addListener(EventType.CursorSelectionChanged, (e) => {
			events++;
			selectionEqual(e.selection, 1, 2, 1, 1);
		});
		moveTo(thisCursor, 1, 2, true);
		assert.equal(events, 2, 'receives 2 events');
	});

	// --------- state save & restore

	test('saveState & restoreState', () => {
		moveTo(thisCursor, 2, 1, true);
		cursorEqual(thisCursor, 2, 1, 1, 1);

		let savedState = JSON.stringify(thisCursor.saveState());

		moveTo(thisCursor, 1, 1, false);
		cursorEqual(thisCursor, 1, 1);

		thisCursor.restoreState(JSON.parse(savedState));
		cursorEqual(thisCursor, 2, 1, 1, 1);
	});

	// --------- updating cursor

	test('Independent model edit 1', () => {
		moveTo(thisCursor, 2, 16, true);

		thisModel.applyEdits([EditOperation.delete(new Range(2, 1, 2, 2))]);
		cursorEqual(thisCursor, 2, 15, 1, 1);
	});

	test('column select 1', () => {
		let model = new Model([
			'\tprivate compute(a:number): boolean {',
			'\t\tif (a + 3 === 0 || a + 5 === 0) {',
			'\t\t\treturn false;',
			'\t\t}',
			'\t}'
		].join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
		let cursor = new Cursor(1, new MockConfiguration(null), model, null, true);

		moveTo(cursor, 1, 7, false);
		cursorEqual(cursor, 1, 7);

		cursorCommand(cursor, H.ColumnSelect, {
			position: new Position(4, 4),
			viewPosition: new Position(4, 4),
			mouseColumn: 15
		});

		let expectedSelections = [
			new Selection(1, 7, 1, 13),
			new Selection(2, 4, 2, 10),
			new Selection(3, 3, 3, 7),
			new Selection(4, 4, 4, 4),
		];

		cursorEquals(cursor, expectedSelections);

		cursor.dispose();
		model.dispose();
	});
});

class TestMode {
	public getId():string {
		return 'testing';
	}

	public toSimplifiedMode(): IMode {
		return this;
	}
}

class SurroundingMode extends TestMode {
	public richEditSupport: IRichEditSupport;

	constructor() {
		super();
		this.richEditSupport = new RichEditSupport(this.getId(), null, {
			__characterPairSupport: {
				autoClosingPairs: [{ open: '(', close: ')' }]
			}
		});
	}
}

class OnEnterMode extends TestMode {
	public richEditSupport: IRichEditSupport;

	constructor(indentAction: IndentAction) {
		super();
		this.richEditSupport = {
			onEnter: {
				onEnter: (model, position) => {
					return {
						indentAction: indentAction
					};
				}
			}
		};
	}
}

suite('Editor Controller - Regression tests', () => {
	test('Bug 9121: Auto indent + undo + redo is funky', () => {
		usingCursor({
			text: [
				''
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4
			}
		}, (model, cursor) => {
			cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n', 'assert1');

			cursorCommand(cursor, H.Tab, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t', 'assert2');

			cursorCommand(cursor, H.Type, { text: '\n'}, null, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t\n\t', 'assert3');

			cursorCommand(cursor, H.Type, { text: 'x' });
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t\n\tx', 'assert4');

			cursorCommand(cursor, H.CursorLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t\n\tx', 'assert5');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t\nx', 'assert6');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\tx', 'assert7');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\nx', 'assert8');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), 'x', 'assert9');

			cursorCommand(cursor, H.Undo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\nx', 'assert10');

			cursorCommand(cursor, H.Undo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t\nx', 'assert11');

			cursorCommand(cursor, H.Undo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t\n\tx', 'assert12');

			cursorCommand(cursor, H.Redo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t\nx', 'assert13');

			cursorCommand(cursor, H.Redo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\nx', 'assert14');

			cursorCommand(cursor, H.Redo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), 'x', 'assert15');
		});
	});

	test('issue #183: jump to matching bracket position', () => {
		usingCursor({
			text: [
				'var x = (3 + (5-7));'
			],
			mode: new BracketMode()
		}, (model, cursor) => {
			// ensure is tokenized
			model.getLineContext(1);

			moveTo(cursor, 1, 20);

			cursorCommand(cursor, H.JumpToBracket, null, null, 'keyboard');
			cursorEqual(cursor, 1, 10);

			cursorCommand(cursor, H.JumpToBracket, null, null, 'keyboard');
			cursorEqual(cursor, 1, 20);

			cursorCommand(cursor, H.JumpToBracket, null, null, 'keyboard');
			cursorEqual(cursor, 1, 10);
		});
	});

	test('bug #16543: Tab should indent to correct indentation spot immediately', () => {
		usingCursor({
			text: [
				'function baz() {',
				'\tfunction hello() { // something here',
				'\t',
				'',
				'\t}',
				'}'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4
			},
			mode: new OnEnterMode(IndentAction.Indent),
		}, (model, cursor) => {
			moveTo(cursor, 4, 1, false);
			cursorEqual(cursor, 4, 1, 4, 1);

			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(4), '\t\t');
		});
	});

	test('Bug 18276:[editor] Indentation broken when selection is empty', () => {
		usingCursor({
			text: [
				'function baz() {'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4
			},
		}, (model, cursor) => {
			moveTo(cursor, 1, 2, false);
			cursorEqual(cursor, 1, 2, 1, 2);

			cursorCommand(cursor, H.Indent, null, null, 'keyboard');
			assert.equal(model.getLineContent(1), '\tfunction baz() {');

			cursorEqual(cursor, 1, 3, 1, 3);
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(1), '\tf\tunction baz() {');
		});
	});

	test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {
		usingCursor({
			text: [
				'     function baz() {'
			],
			mode: new OnEnterMode(IndentAction.IndentOutdent),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 1, 6, false);
			cursorEqual(cursor, 1, 6, 1, 6);

			cursorCommand(cursor, H.Outdent, null, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    function baz() {');
			cursorEqual(cursor, 1, 5, 1, 5);
		});
	});

	test('Bug #18293:[regression][editor] Can\'t outdent whitespace line', () => {
		usingCursor({
			text: [
				'      '
			],
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			cursorEqual(cursor, 1, 7, 1, 7);

			cursorCommand(cursor, H.Outdent, null, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    ');
			cursorEqual(cursor, 1, 5, 1, 5);
		});
	});

	test('Bug #16657: [editor] Tab on empty line of zero indentation moves cursor to position (1,1)', () => {
		usingCursor({
			text: [
				'function baz() {',
				'\tfunction hello() { // something here',
				'\t',
				'',
				'\t}',
				'}',
				''
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4
			},
		}, (model, cursor) => {
			moveTo(cursor, 7, 1, false);
			cursorEqual(cursor, 7, 1, 7, 1);

			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(7), '\t');
			cursorEqual(cursor, 7, 2, 7, 2);
		});
	});

	test('bug #16740: [editor] Cut line doesn\'t quite cut the last line', () => {
		// Part 1 => there is text on the last line
		let text = [
			'asdasd',
			'qwerty'
		];
		let model = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
		let cursor = new Cursor(1, new MockConfiguration(null), model, null, true);

		moveTo(cursor, 2, 1, false);
		cursorEqual(cursor, 2, 1, 2, 1);

		cursorCommand(cursor, H.Cut, null, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), 'asdasd');

		cursor.dispose();
		model.dispose();

		// Part 2 => there is no text on the last line
		text = [
			'asdasd',
			''
		];
		model = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
		cursor = new Cursor(1, new MockConfiguration(null), model, null, true);

		moveTo(cursor, 2, 1, false);
		cursorEqual(cursor, 2, 1, 2, 1);

		cursorCommand(cursor, H.Cut, null, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), 'asdasd');

		cursorCommand(cursor, H.Cut, null, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), '');

		cursor.dispose();
		model.dispose();
	});

	test('Bug #11476: Double bracket surrounding + undo is broken', () => {
		usingCursor({
			text: [
				'hello'
			],
			mode: new SurroundingMode(),
			modelOpts: { tabSize: 4, insertSpaces: true, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 1, 3, false);
			moveTo(cursor, 1, 5, true);
			cursorEqual(cursor, 1, 5, 1, 3);

			cursorCommand(cursor, H.Type, { text: '(' }, null, 'keyboard');
			cursorEqual(cursor, 1, 6, 1, 4);

			cursorCommand(cursor, H.Type, { text: '(' }, null, 'keyboard');
			cursorEqual(cursor, 1, 7, 1, 5);
		});
	});

	test('issue #1140: Backspace stops prematurely', () => {
		usingCursor({
			text: [
				'function baz() {',
				'  return 1;',
				'};'
			],
			mode: new SurroundingMode(),
			modelOpts: { tabSize: 4, insertSpaces: true, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 3, 2, false);
			moveTo(cursor, 1, 14, true);
			cursorEqual(cursor, 1, 14, 3, 2);

			cursorCommand(cursor, H.DeleteLeft);
			cursorEqual(cursor, 1, 14, 1, 14);
			assert.equal(model.getLineCount(), 1);
			assert.equal(model.getLineContent(1), 'function baz(;');
		});
	});

	test('issue #1336: Insert cursor below on last line adds a cursor to the end of the current line', () => {
		usingCursor({
			text: [
				'abc'
			],
		}, (model, cursor) => {
			cursorCommand(cursor, H.AddCursorDown);
			assert.equal(cursor.getSelections().length, 1);
		});
	});

	test('issue #2205: Multi-cursor pastes in reverse order', () => {
		usingCursor({
			text: [
				'abc',
				'def'
			],
		}, (model, cursor) => {
			moveTo(cursor, 2, 1, false);
			cursorCommand(cursor, H.AddCursorUp);
			assert.equal(cursor.getSelections().length, 2);

			cursorCommand(cursor, H.Paste, { text: '1\n2' });
			assert.equal(model.getLineContent(1), '1abc');
			assert.equal(model.getLineContent(2), '2def');
		});
	});

	test('issue #3071: Investigate why undo stack gets corrupted', () => {
		usingCursor({
			text: [
				'some lines',
				'and more lines',
				'just some text',
			],
			mode: null,
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);
			moveTo(cursor, 3, 4, true);

			let isFirst = true;
			model.addListener2(EventType.ModelContentChanged, (e) => {
				if (isFirst) {
					isFirst = false;
					cursorCommand(cursor, H.Type, { text: '\t' }, null, 'keyboard');
				}
			});

			cursorCommand(cursor, H.Tab);
			assert.equal(model.getValue(), [
				'\t just some text'
			].join('\n'), '001');

			cursorCommand(cursor, H.Undo);
			assert.equal(model.getValue(), [
				'some lines',
				'and more lines',
				'just some text',
			].join('\n'), '002');

			cursorCommand(cursor, H.Undo);
			assert.equal(model.getValue(), [
				'some lines',
				'and more lines',
				'just some text',
			].join('\n'), '003');
		});
	});

	test('issue #3463: pressing tab adds spaces, but not as many as for a tab', () => {
		usingCursor({
			text: [
				'function a() {',
				'\tvar a = {',
				'\t\tx: 3',
				'\t};',
				'}',
			],
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF	}
		}, (model, cursor) => {
			moveTo(cursor, 3, 2, false);
			cursorCommand(cursor, H.Tab);
			assert.equal(model.getLineContent(3), '\t    \tx: 3');
		});
	});

	test('issue #832: deleteWordLeft', () => {
		usingCursor({
			text: [
				'   /* Just some text a+= 3 +5 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 37, false);
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 */', '001');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 ', '002');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '003');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 ', '004');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= ', '005');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a', '006');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text ', '007');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some ', '008');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just ', '009');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   /* ', '010');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '   ', '011');
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), '', '012');
		});
	});

	test('deleteWordStartLeft', () => {
		usingCursor({
			text: [
				'   /* Just some text a+= 3 +5 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 37, false);

			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 ', '001');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '002');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 ', '003');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= ', '004');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a', '005');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text ', '006');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some ', '007');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just ', '008');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   /* ', '009');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '   ', '010');
			deleteWordStartLeft(cursor); assert.equal(model.getLineContent(1), '', '011');
		});
	});

	test('deleteWordEndLeft', () => {
		usingCursor({
			text: [
				'   /* Just some text a+= 3 +5 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 37, false);
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 */', '001');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5', '002');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '003');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3', '004');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a+=', '005');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text a', '006');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some text', '007');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just some', '008');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /* Just', '009');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '   /*', '010');
			deleteWordEndLeft(cursor); assert.equal(model.getLineContent(1), '', '011');
		});
	});

	test('issue #832: deleteWordRight', () => {
		usingCursor({
			text: [
				'   /* Just some text a+= 3 +5-3 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), '/* Just some text a+= 3 +5-3 */  ', '001');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), ' Just some text a+= 3 +5-3 */  ', '002');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), ' some text a+= 3 +5-3 */  ', '003');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), ' text a+= 3 +5-3 */  ', '004');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), ' a+= 3 +5-3 */  ', '005');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  ', '006');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), ' 3 +5-3 */  ', '007');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), ' +5-3 */  ', '008');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), '5-3 */  ', '009');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), '-3 */  ', '010');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), '3 */  ', '011');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), ' */  ', '012');
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), '  ', '013');
		});
	});

	test('deleteWordStartRight', () => {
		usingCursor({
			text: [
				'   /* Just some text a+= 3 +5-3 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);

			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '/* Just some text a+= 3 +5-3 */  ', '001');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), 'Just some text a+= 3 +5-3 */  ', '002');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), 'some text a+= 3 +5-3 */  ', '003');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), 'text a+= 3 +5-3 */  ', '004');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), 'a+= 3 +5-3 */  ', '005');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  ', '006');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '3 +5-3 */  ', '007');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '+5-3 */  ', '008');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '5-3 */  ', '009');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '-3 */  ', '010');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '3 */  ', '011');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '*/  ', '012');
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), '', '013');
		});
	});

	test('deleteWordEndRight', () => {
		usingCursor({
			text: [
				'   /* Just some text a+= 3 +5-3 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), ' Just some text a+= 3 +5-3 */  ', '001');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), ' some text a+= 3 +5-3 */  ', '002');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), ' text a+= 3 +5-3 */  ', '003');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), ' a+= 3 +5-3 */  ', '004');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  ', '005');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), ' 3 +5-3 */  ', '006');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), ' +5-3 */  ', '007');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), '5-3 */  ', '008');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), '-3 */  ', '009');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), '3 */  ', '010');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), ' */  ', '011');
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), '  ', '012');
		});
	});

	test('issue #832: moveWordLeft', () => {
		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 50, false);

			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1, '001');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1, '002');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 '.length + 1, '003');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '004');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '005');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '006');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 '.length + 1, '007');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= '.length + 1, '008');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a'.length + 1, '009');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text '.length + 1, '010');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   '.length + 1, '011');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   '.length + 1, '012');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just '.length + 1, '013');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   /* '.length + 1, '014');
			moveWordLeft(cursor); assert.equal(cursor.getPosition().column, '   '.length + 1, '015');
		});
	});

	test('moveWordStartLeft', () => {
		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 50, false);

			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1, '001');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1, '002');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 '.length + 1, '003');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '004');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '005');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '006');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 '.length + 1, '007');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= '.length + 1, '008');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a'.length + 1, '009');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text '.length + 1, '010');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   '.length + 1, '011');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   '.length + 1, '012');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just '.length + 1, '013');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   /* '.length + 1, '014');
			moveWordStartLeft(cursor); assert.equal(cursor.getPosition().column, '   '.length + 1, '015');
		});
	});

	test('moveWordEndLeft', () => {
		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 50, false);

			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1, '001');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1, '002');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1, '003');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3'.length + 1, '004');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '005');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '006');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '007');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3'.length + 1, '008');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+='.length + 1, '009');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a'.length + 1, '010');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text'.length + 1, '011');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more'.length + 1, '012');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just some'.length + 1, '013');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /* Just'.length + 1, '014');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, '   /*'.length + 1, '015');
			moveWordEndLeft(cursor); assert.equal(cursor.getPosition().column, ''.length + 1, '016');
		});
	});

	test('issue #832: moveWordRight', () => {
		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);

			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /*'.length + 1, '001');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just'.length + 1, '003');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some'.length + 1, '004');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more'.length + 1, '005');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text'.length + 1, '006');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a'.length + 1, '007');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+='.length + 1, '008');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3'.length + 1, '009');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '010');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '011');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '012');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3'.length + 1, '013');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1, '014');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1, '015');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1, '016');
			moveWordRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1, '016');

		});
	});

	test('moveWordEndRight', () => {
		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);

			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /*'.length + 1, '001');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just'.length + 1, '003');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some'.length + 1, '004');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more'.length + 1, '005');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text'.length + 1, '006');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a'.length + 1, '007');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+='.length + 1, '008');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3'.length + 1, '009');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '010');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '011');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '012');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3'.length + 1, '013');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1, '014');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1, '015');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1, '016');
			moveWordEndRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1, '016');

		});
	});

	test('moveWordStartRight', () => {
		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);

			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   '.length + 1, '001');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* '.length + 1, '002');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just '.length + 1, '003');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   '.length + 1, '004');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   '.length + 1, '005');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text '.length + 1, '006');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a'.length + 1, '007');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= '.length + 1, '008');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 '.length + 1, '009');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '010');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '011');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '012');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 '.length + 1, '013');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1, '014');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1, '015');
			moveWordStartRight(cursor); assert.equal(cursor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1, '016');
		});
	});

	test('issue #832: word right', () => {

		usingCursor({
			text: [
				'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);

			function assertWordRight(col, expectedCol) {
				cursorCommand(cursor, col === 1 ? H.WordSelect : H.WordSelectDrag, {
					position: {
						lineNumber: 1,
						column: col
					},
					preference: 'right'
				});

				assert.equal(cursor.getSelection().startColumn, 1, 'TEST FOR ' + col);
				assert.equal(cursor.getSelection().endColumn, expectedCol, 'TEST FOR ' + col);
			}

			assertWordRight( 1, '   '.length + 1);
			assertWordRight( 2, '   '.length + 1);
			assertWordRight( 3, '   '.length + 1);
			assertWordRight( 4, '   '.length + 1);
			assertWordRight( 5, '   /'.length + 1);
			assertWordRight( 6, '   /*'.length + 1);
			assertWordRight( 7, '   /* '.length + 1);
			assertWordRight( 8, '   /* Just'.length + 1);
			assertWordRight( 9, '   /* Just'.length + 1);
			assertWordRight(10, '   /* Just'.length + 1);
			assertWordRight(11, '   /* Just'.length + 1);
			assertWordRight(12, '   /* Just '.length + 1);
			assertWordRight(13, '   /* Just some'.length + 1);
			assertWordRight(14, '   /* Just some'.length + 1);
			assertWordRight(15, '   /* Just some'.length + 1);
			assertWordRight(16, '   /* Just some'.length + 1);
			assertWordRight(17, '   /* Just some '.length + 1);
			assertWordRight(18, '   /* Just some  '.length + 1);
			assertWordRight(19, '   /* Just some   '.length + 1);
			assertWordRight(20, '   /* Just some   more'.length + 1);
			assertWordRight(21, '   /* Just some   more'.length + 1);
			assertWordRight(22, '   /* Just some   more'.length + 1);
			assertWordRight(23, '   /* Just some   more'.length + 1);
			assertWordRight(24, '   /* Just some   more '.length + 1);
			assertWordRight(25, '   /* Just some   more  '.length + 1);
			assertWordRight(26, '   /* Just some   more   '.length + 1);
			assertWordRight(27, '   /* Just some   more   text'.length + 1);
			assertWordRight(28, '   /* Just some   more   text'.length + 1);
			assertWordRight(29, '   /* Just some   more   text'.length + 1);
			assertWordRight(30, '   /* Just some   more   text'.length + 1);
			assertWordRight(31, '   /* Just some   more   text '.length + 1);
			assertWordRight(32, '   /* Just some   more   text a'.length + 1);
			assertWordRight(33, '   /* Just some   more   text a+'.length + 1);
			assertWordRight(34, '   /* Just some   more   text a+='.length + 1);
			assertWordRight(35, '   /* Just some   more   text a+= '.length + 1);
			assertWordRight(36, '   /* Just some   more   text a+= 3'.length + 1);
			assertWordRight(37, '   /* Just some   more   text a+= 3 '.length + 1);
			assertWordRight(38, '   /* Just some   more   text a+= 3 +'.length + 1);
			assertWordRight(39, '   /* Just some   more   text a+= 3 +5'.length + 1);
			assertWordRight(40, '   /* Just some   more   text a+= 3 +5-'.length + 1);
			assertWordRight(41, '   /* Just some   more   text a+= 3 +5-3'.length + 1);
			assertWordRight(42, '   /* Just some   more   text a+= 3 +5-3 '.length + 1);
			assertWordRight(43, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1);
			assertWordRight(44, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1);
			assertWordRight(45, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1);
			assertWordRight(46, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1);
			assertWordRight(47, '   /* Just some   more   text a+= 3 +5-3 + 7 *'.length + 1);
			assertWordRight(48, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1);
			assertWordRight(49, '   /* Just some   more   text a+= 3 +5-3 + 7 */ '.length + 1);
			assertWordRight(50, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1);
		});
	});

	test('issue #3882 (1): Ctrl+Delete removing entire line when used at the end of line', () => {
		usingCursor({
			text: [
				'A line with text.',
				'   And another one'
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 18, false);
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), 'A line with text.   And another one', '001');
		});
	});

	test('issue #3882 (2): Ctrl+Delete removing entire line when used at the end of line', () => {
		usingCursor({
			text: [
				'A line with text.',
				'   And another one'
			],
		}, (model, cursor) => {
			moveTo(cursor, 2, 1, false);
			deleteWordLeft(cursor); assert.equal(model.getLineContent(1), 'A line with text.   And another one', '001');
		});
	});
});

suite('Editor Controller - Cursor Configuration', () => {

	test('Cursor honors insertSpaces configuration on new line', () => {
		usingCursor({
			text: [
				'    \tMy First Line\t ',
				'\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			cursorCommand(cursor, H.MoveTo, { position: new Position(1, 21) }, null, 'keyboard');
			cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    \tMy First Line\t ');
			assert.equal(model.getLineContent(2), '        ');
		});
	});

	test('Cursor honors insertSpaces configuration on tab', () => {
		usingCursor({
			text: [
				'    \tMy First Line\t ',
				'My Second Line123',
				'    Third Line',
				'',
				'1'
			],
			modelOpts: { insertSpaces: true, tabSize: 13, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			// Tab on column 1
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 1) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), '             My Second Line123');
			cursorCommand(cursor, H.Undo, null, null, 'keyboard');

			// Tab on column 2
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 2) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'M            y Second Line123');
			cursorCommand(cursor, H.Undo, null, null, 'keyboard');

			// Tab on column 3
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 3) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My            Second Line123');
			cursorCommand(cursor, H.Undo, null, null, 'keyboard');

			// Tab on column 4
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 4) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My           Second Line123');
			cursorCommand(cursor, H.Undo, null, null, 'keyboard');

			// Tab on column 5
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 5) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My S         econd Line123');
			cursorCommand(cursor, H.Undo, null, null, 'keyboard');

			// Tab on column 5
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 5) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My S         econd Line123');
			cursorCommand(cursor, H.Undo, null, null, 'keyboard');

			// Tab on column 13
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 13) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My Second Li ne123');
			cursorCommand(cursor, H.Undo, null, null, 'keyboard');

			// Tab on column 14
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 14) }, null, 'keyboard');
			cursorCommand(cursor, H.Tab, null, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My Second Lin             e123');
		});
	});

	test('Enter auto-indents with insertSpaces setting 1', () => {
		usingCursor({
			text: [
				'\thello'
			],
			mode: new OnEnterMode(IndentAction.Indent),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			cursorEqual(cursor, 1, 7, 1, 7);

			cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.CRLF), '\thello\r\n        ');
		});
	});

	test('Enter auto-indents with insertSpaces setting 2', () => {
		usingCursor({
			text: [
				'\thello'
			],
			mode: new OnEnterMode(IndentAction.None),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			cursorEqual(cursor, 1, 7, 1, 7);

			cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.CRLF), '\thello\r\n    ');
		});
	});

	test('Enter auto-indents with insertSpaces setting 3', () => {
		usingCursor({
			text: [
				'\thell()'
			],
			mode: new OnEnterMode(IndentAction.IndentOutdent),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			cursorEqual(cursor, 1, 7, 1, 7);

			cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.CRLF), '\thell(\r\n        \r\n    )');
		});
	});

	test('Insert line before', () => {
		let testInsertLineBefore = (lineNumber:number, column:number, callback:(model:Model, cursor:Cursor) => void) => {
			usingCursor({
				text: [
					'First line',
					'Second line',
					'Third line'
				],
			}, (model, cursor) => {
				moveTo(cursor, lineNumber, column, false);
				cursorEqual(cursor, lineNumber, column, lineNumber, column);

				cursorCommand(cursor, H.LineInsertBefore, null, null, 'keyboard');
				callback(model, cursor);
			});
		};

		testInsertLineBefore(1, 3, (model, cursor) => {
			cursorEqual(cursor, 1, 1, 1, 1);
			assert.equal(model.getLineContent(1), '');
			assert.equal(model.getLineContent(2), 'First line');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineBefore(2, 3, (model, cursor) => {
			cursorEqual(cursor, 2, 1, 2, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineBefore(3, 3, (model, cursor) => {
			cursorEqual(cursor, 3, 1, 3, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), 'Third line');
		});
	});

	test('Insert line after', () => {
		let testInsertLineAfter = (lineNumber:number, column:number, callback:(model:Model, cursor:Cursor) => void) => {
			usingCursor({
				text: [
					'First line',
					'Second line',
					'Third line'
				],
			}, (model, cursor) => {
				moveTo(cursor, lineNumber, column, false);
				cursorEqual(cursor, lineNumber, column, lineNumber, column);

				cursorCommand(cursor, H.LineInsertAfter, null, null, 'keyboard');
				callback(model, cursor);
			});
		};

		testInsertLineAfter(1, 3, (model, cursor) => {
			cursorEqual(cursor, 2, 1, 2, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineAfter(2, 3, (model, cursor) => {
			cursorEqual(cursor, 3, 1, 3, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineAfter(3, 3, (model, cursor) => {
			cursorEqual(cursor, 4, 1, 4, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), 'Third line');
			assert.equal(model.getLineContent(4), '');
		});
	});
});

interface ICursorOpts {
	text: string[];
	mode?: IMode;
	modelOpts?: ITextModelCreationOptions;
}

function usingCursor(opts:ICursorOpts, callback:(model:Model, cursor:Cursor)=>void): void {
	let model = new Model(opts.text.join('\n'), opts.modelOpts || Model.DEFAULT_CREATION_OPTIONS, opts.mode);
	let config = new MockConfiguration(null);
	let cursor = new Cursor(1, config, model, null, false);

	callback(model, cursor);

	cursor.dispose();
	config.dispose();
	model.dispose();
}
