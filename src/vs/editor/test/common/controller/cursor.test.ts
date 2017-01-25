/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Cursor } from 'vs/editor/common/controller/cursor';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import {
	EndOfLinePreference, EventType, Handler, IEditorOptions,
	DefaultEndOfLine, ITextModelCreationOptions, ICommand,
	ITokenizedModel, IEditOperationBuilder, ICursorStateComputerData,
	ICursorPositionChangedEvent, ICursorSelectionChangedEvent
} from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { IndentAction, IndentationRule } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { MockConfiguration } from 'vs/editor/test/common/mocks/mockConfiguration';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { viewModelHelper } from 'vs/editor/test/common/editorTestUtils';

let H = Handler;

// --------- utils

function cursorCommand(cursor: Cursor, command: string, extraData?: any, overwriteSource?: string) {
	cursor.trigger(overwriteSource || 'tests', command, extraData);
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
		cursorCommand(cursor, inSelectionMode ? H.CursorPageDownSelect : H.CursorPageDown, { pageSize: linesCount });
	}
}

function moveUp(cursor: Cursor, linesCount: number, inSelectionMode: boolean = false) {
	if (linesCount === 1) {
		cursorCommand(cursor, inSelectionMode ? H.CursorUpSelect : H.CursorUp);
	} else {
		cursorCommand(cursor, inSelectionMode ? H.CursorPageUpSelect : H.CursorPageUp, { pageSize: linesCount });
	}
}

function moveToBeginningOfLine(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorHomeSelect : H.CursorHome);
}

function moveToEndOfLine(cursor: Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorEndSelect : H.CursorEnd);
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

function assertCursor(cursor: Cursor, what: Position | Selection | Selection[]): void {
	let selections: Selection[];
	if (what instanceof Position) {
		selections = [new Selection(what.lineNumber, what.column, what.lineNumber, what.column)];
	} else if (what instanceof Selection) {
		selections = [what];
	} else {
		selections = what;
	}
	let actual = cursor.getSelections().map(s => s.toString());
	let expected = selections.map(s => s.toString());

	assert.deepEqual(actual, expected);
}

suite('Editor Controller - Cursor', () => {
	const LINE1 = '    \tMy First Line\t ';
	const LINE2 = '\tMy Second Line';
	const LINE3 = '    Third Line🐶';
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

		thisModel = Model.createFromString(text);
		thisConfiguration = new MockConfiguration(null);
		thisCursor = new Cursor(thisConfiguration, thisModel, viewModelHelper(thisModel), false);
	});

	teardown(() => {
		thisCursor.dispose();
		thisModel.dispose();
		thisConfiguration.dispose();
	});

	test('cursor initialized', () => {
		assertCursor(thisCursor, new Position(1, 1));
	});

	// --------- absolute move

	test('no move', () => {
		moveTo(thisCursor, 1, 1);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move', () => {
		moveTo(thisCursor, 1, 2);
		assertCursor(thisCursor, new Position(1, 2));
	});

	test('move in selection mode', () => {
		moveTo(thisCursor, 1, 2, true);
		assertCursor(thisCursor, new Selection(1, 1, 1, 2));
	});

	test('move beyond line end', () => {
		moveTo(thisCursor, 1, 25);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
	});

	test('move empty line', () => {
		moveTo(thisCursor, 4, 20);
		assertCursor(thisCursor, new Position(4, 1));
	});

	test('move one char line', () => {
		moveTo(thisCursor, 5, 20);
		assertCursor(thisCursor, new Position(5, 2));
	});

	test('selection down', () => {
		moveTo(thisCursor, 2, 1, true);
		assertCursor(thisCursor, new Selection(1, 1, 2, 1));
	});

	test('move and then select', () => {
		moveTo(thisCursor, 2, 3);
		assertCursor(thisCursor, new Position(2, 3));

		moveTo(thisCursor, 2, 15, true);
		assertCursor(thisCursor, new Selection(2, 3, 2, 15));

		moveTo(thisCursor, 1, 2, true);
		assertCursor(thisCursor, new Selection(2, 3, 1, 2));
	});

	// --------- move left

	test('move left on top left position', () => {
		moveLeft(thisCursor);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move left', () => {
		moveTo(thisCursor, 1, 3);
		assertCursor(thisCursor, new Position(1, 3));
		moveLeft(thisCursor);
		assertCursor(thisCursor, new Position(1, 2));
	});

	test('move left with surrogate pair', () => {
		moveTo(thisCursor, 3, 17);
		assertCursor(thisCursor, new Position(3, 17));
		moveLeft(thisCursor);
		assertCursor(thisCursor, new Position(3, 15));
	});

	test('move left goes to previous row', () => {
		moveTo(thisCursor, 2, 1);
		assertCursor(thisCursor, new Position(2, 1));
		moveLeft(thisCursor);
		assertCursor(thisCursor, new Position(1, 21));
	});

	test('move left selection', () => {
		moveTo(thisCursor, 2, 1);
		assertCursor(thisCursor, new Position(2, 1));
		moveLeft(thisCursor, true);
		assertCursor(thisCursor, new Selection(2, 1, 1, 21));
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

		let actualStops: number[][] = [];
		for (let i = 0; i < expectedStops.length; i++) {
			moveWordLeft(thisCursor);
			let pos = thisCursor.getPosition();
			actualStops.push([pos.lineNumber, pos.column]);
		}

		assert.deepEqual(actualStops, expectedStops);
	});

	test('move word left selection', () => {
		moveTo(thisCursor, 5, 2);
		assertCursor(thisCursor, new Position(5, 2));
		moveWordLeft(thisCursor, true);
		assertCursor(thisCursor, new Selection(5, 2, 5, 1));
	});

	// --------- move right

	test('move right on bottom right position', () => {
		moveTo(thisCursor, 5, 2);
		assertCursor(thisCursor, new Position(5, 2));
		moveRight(thisCursor);
		assertCursor(thisCursor, new Position(5, 2));
	});

	test('move right', () => {
		moveTo(thisCursor, 1, 3);
		assertCursor(thisCursor, new Position(1, 3));
		moveRight(thisCursor);
		assertCursor(thisCursor, new Position(1, 4));
	});

	test('move right with surrogate pair', () => {
		moveTo(thisCursor, 3, 15);
		assertCursor(thisCursor, new Position(3, 15));
		moveRight(thisCursor);
		assertCursor(thisCursor, new Position(3, 17));
	});

	test('move right goes to next row', () => {
		moveTo(thisCursor, 1, 21);
		assertCursor(thisCursor, new Position(1, 21));
		moveRight(thisCursor);
		assertCursor(thisCursor, new Position(2, 1));
	});

	test('move right selection', () => {
		moveTo(thisCursor, 1, 21);
		assertCursor(thisCursor, new Position(1, 21));
		moveRight(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 21, 2, 1));
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

		let actualStops: number[][] = [];
		for (let i = 0; i < expectedStops.length; i++) {
			moveWordRight(thisCursor);
			let pos = thisCursor.getPosition();
			actualStops.push([pos.lineNumber, pos.column]);
		}

		assert.deepEqual(actualStops, expectedStops);
	});

	test('move word right selection', () => {
		moveTo(thisCursor, 1, 1);
		assertCursor(thisCursor, new Position(1, 1));
		moveWordRight(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 1, 1, 8));
	});
	// --------- move down

	test('move down', () => {
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(2, 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(3, 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(4, 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(5, 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(5, 2));
	});

	test('move down with selection', () => {
		moveDown(thisCursor, 1, true);
		assertCursor(thisCursor, new Selection(1, 1, 2, 1));
		moveDown(thisCursor, 1, true);
		assertCursor(thisCursor, new Selection(1, 1, 3, 1));
		moveDown(thisCursor, 1, true);
		assertCursor(thisCursor, new Selection(1, 1, 4, 1));
		moveDown(thisCursor, 1, true);
		assertCursor(thisCursor, new Selection(1, 1, 5, 1));
		moveDown(thisCursor, 1, true);
		assertCursor(thisCursor, new Selection(1, 1, 5, 2));
	});

	test('move down with tabs', () => {
		moveTo(thisCursor, 1, 5);
		assertCursor(thisCursor, new Position(1, 5));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(2, 2));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(3, 5));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(4, 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(5, 2));
	});

	// --------- move up

	test('move up', () => {
		moveTo(thisCursor, 3, 5);
		assertCursor(thisCursor, new Position(3, 5));

		moveUp(thisCursor, 1);
		assertCursor(thisCursor, new Position(2, 2));

		moveUp(thisCursor, 1);
		assertCursor(thisCursor, new Position(1, 5));
	});

	test('move up with selection', () => {
		moveTo(thisCursor, 3, 5);
		assertCursor(thisCursor, new Position(3, 5));

		moveUp(thisCursor, 1, true);
		assertCursor(thisCursor, new Selection(3, 5, 2, 2));

		moveUp(thisCursor, 1, true);
		assertCursor(thisCursor, new Selection(3, 5, 1, 5));
	});

	test('move up and down with tabs', () => {
		moveTo(thisCursor, 1, 5);
		assertCursor(thisCursor, new Position(1, 5));
		moveDown(thisCursor, 4);
		assertCursor(thisCursor, new Position(5, 2));
		moveUp(thisCursor, 1);
		assertCursor(thisCursor, new Position(4, 1));
		moveUp(thisCursor, 1);
		assertCursor(thisCursor, new Position(3, 5));
		moveUp(thisCursor, 1);
		assertCursor(thisCursor, new Position(2, 2));
		moveUp(thisCursor, 1);
		assertCursor(thisCursor, new Position(1, 5));
	});

	test('move up and down with end of lines starting from a long one', () => {
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(2, LINE2.length + 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(3, LINE3.length + 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(4, LINE4.length + 1));
		moveDown(thisCursor, 1);
		assertCursor(thisCursor, new Position(5, LINE5.length + 1));
		moveUp(thisCursor, 4);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
	});

	// --------- move to beginning of line

	test('move to beginning of line', () => {
		moveToBeginningOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, 6));
		moveToBeginningOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move to beginning of line from within line', () => {
		moveTo(thisCursor, 1, 8);
		moveToBeginningOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, 6));
		moveToBeginningOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move to beginning of line from whitespace at beginning of line', () => {
		moveTo(thisCursor, 1, 2);
		moveToBeginningOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, 6));
		moveToBeginningOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move to beginning of line from within line selection', () => {
		moveTo(thisCursor, 1, 8);
		moveToBeginningOfLine(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 8, 1, 6));
		moveToBeginningOfLine(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 8, 1, 1));
	});

	test('move to beginning of line with selection multiline forward', () => {
		moveTo(thisCursor, 1, 8);
		moveTo(thisCursor, 3, 9, true);
		moveToBeginningOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 5, 3, 5));
	});

	test('move to beginning of line with selection multiline backward', () => {
		moveTo(thisCursor, 3, 9);
		moveTo(thisCursor, 1, 8, true);
		moveToBeginningOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(1, 6, 1, 6));
	});

	test('move to beginning of line with selection single line forward', () => {
		moveTo(thisCursor, 3, 2);
		moveTo(thisCursor, 3, 9, true);
		moveToBeginningOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 5, 3, 5));
	});

	test('move to beginning of line with selection single line backward', () => {
		moveTo(thisCursor, 3, 9);
		moveTo(thisCursor, 3, 2, true);
		moveToBeginningOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 5, 3, 5));
	});

	test('issue #15401: "End" key is behaving weird when text is selected part 1', () => {
		moveTo(thisCursor, 1, 8);
		moveTo(thisCursor, 3, 9, true);
		moveToBeginningOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 5, 3, 5));
	});

	test('issue #17011: Shift+home/end now go to the end of the selection start\'s line, not the selection\'s end', () => {
		moveTo(thisCursor, 1, 8);
		moveTo(thisCursor, 3, 9, true);
		moveToBeginningOfLine(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 8, 3, 5));
	});

	// --------- move to end of line

	test('move to end of line', () => {
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
	});

	test('move to end of line from within line', () => {
		moveTo(thisCursor, 1, 6);
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
	});

	test('move to end of line from whitespace at end of line', () => {
		moveTo(thisCursor, 1, 20);
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
		moveToEndOfLine(thisCursor);
		assertCursor(thisCursor, new Position(1, LINE1.length + 1));
	});

	test('move to end of line from within line selection', () => {
		moveTo(thisCursor, 1, 6);
		moveToEndOfLine(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 6, 1, LINE1.length + 1));
		moveToEndOfLine(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 6, 1, LINE1.length + 1));
	});

	test('move to end of line with selection multiline forward', () => {
		moveTo(thisCursor, 1, 1);
		moveTo(thisCursor, 3, 9, true);
		moveToEndOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 17, 3, 17));
	});

	test('move to end of line with selection multiline backward', () => {
		moveTo(thisCursor, 3, 9);
		moveTo(thisCursor, 1, 1, true);
		moveToEndOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(1, 21, 1, 21));
	});

	test('move to end of line with selection single line forward', () => {
		moveTo(thisCursor, 3, 1);
		moveTo(thisCursor, 3, 9, true);
		moveToEndOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 17, 3, 17));
	});

	test('move to end of line with selection single line backward', () => {
		moveTo(thisCursor, 3, 9);
		moveTo(thisCursor, 3, 1, true);
		moveToEndOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 17, 3, 17));
	});

	test('issue #15401: "End" key is behaving weird when text is selected part 2', () => {
		moveTo(thisCursor, 1, 1);
		moveTo(thisCursor, 3, 9, true);
		moveToEndOfLine(thisCursor, false);
		assertCursor(thisCursor, new Selection(3, 17, 3, 17));
	});

	// --------- move to beginning of buffer

	test('move to beginning of buffer', () => {
		moveToBeginningOfBuffer(thisCursor);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move to beginning of buffer from within first line', () => {
		moveTo(thisCursor, 1, 3);
		moveToBeginningOfBuffer(thisCursor);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move to beginning of buffer from within another line', () => {
		moveTo(thisCursor, 3, 3);
		moveToBeginningOfBuffer(thisCursor);
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('move to beginning of buffer from within first line selection', () => {
		moveTo(thisCursor, 1, 3);
		moveToBeginningOfBuffer(thisCursor, true);
		assertCursor(thisCursor, new Selection(1, 3, 1, 1));
	});

	test('move to beginning of buffer from within another line selection', () => {
		moveTo(thisCursor, 3, 3);
		moveToBeginningOfBuffer(thisCursor, true);
		assertCursor(thisCursor, new Selection(3, 3, 1, 1));
	});

	// --------- move to end of buffer

	test('move to end of buffer', () => {
		moveToEndOfBuffer(thisCursor);
		assertCursor(thisCursor, new Position(5, LINE5.length + 1));
	});

	test('move to end of buffer from within last line', () => {
		moveTo(thisCursor, 5, 1);
		moveToEndOfBuffer(thisCursor);
		assertCursor(thisCursor, new Position(5, LINE5.length + 1));
	});

	test('move to end of buffer from within another line', () => {
		moveTo(thisCursor, 3, 3);
		moveToEndOfBuffer(thisCursor);
		assertCursor(thisCursor, new Position(5, LINE5.length + 1));
	});

	test('move to end of buffer from within last line selection', () => {
		moveTo(thisCursor, 5, 1);
		moveToEndOfBuffer(thisCursor, true);
		assertCursor(thisCursor, new Selection(5, 1, 5, LINE5.length + 1));
	});

	test('move to end of buffer from within another line selection', () => {
		moveTo(thisCursor, 3, 3);
		moveToEndOfBuffer(thisCursor, true);
		assertCursor(thisCursor, new Selection(3, 3, 5, LINE5.length + 1));
	});

	// --------- delete word left/right

	test('delete word left for non-empty selection', () => {
		moveTo(thisCursor, 3, 7);
		moveRight(thisCursor, true);
		moveRight(thisCursor, true);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Thd Line🐶');
		assertCursor(thisCursor, new Position(3, 7));
	});

	test('delete word left for caret at beginning of document', () => {
		moveTo(thisCursor, 1, 1);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy First Line\t ');
		assertCursor(thisCursor, new Position(1, 1));
	});

	test('delete word left for caret at end of whitespace', () => {
		moveTo(thisCursor, 3, 11);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Line🐶');
		assertCursor(thisCursor, new Position(3, 5));
	});

	test('delete word left for caret just behind a word', () => {
		moveTo(thisCursor, 2, 11);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(2), '\tMy  Line');
		assertCursor(thisCursor, new Position(2, 5));
	});

	test('delete word left for caret inside of a word', () => {
		moveTo(thisCursor, 1, 12);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy st Line\t ');
		assertCursor(thisCursor, new Position(1, 9));
	});

	test('delete word right for non-empty selection', () => {
		moveTo(thisCursor, 3, 7);
		moveRight(thisCursor, true);
		moveRight(thisCursor, true);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Thd Line🐶');
		assertCursor(thisCursor, new Position(3, 7));
	});

	test('delete word right for caret at end of document', () => {
		moveTo(thisCursor, 5, 3);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(5), '1');
		assertCursor(thisCursor, new Position(5, 2));
	});

	test('delete word right for caret at beggining of whitespace', () => {
		moveTo(thisCursor, 3, 1);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(3), 'Third Line🐶');
		assertCursor(thisCursor, new Position(3, 1));
	});

	test('delete word right for caret just before a word', () => {
		moveTo(thisCursor, 2, 5);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(2), '\tMy  Line');
		assertCursor(thisCursor, new Position(2, 5));
	});

	test('delete word right for caret inside of a word', () => {
		moveTo(thisCursor, 1, 11);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy Fi Line\t ');
		assertCursor(thisCursor, new Position(1, 11));
	});

	// --------- misc

	test('select all', () => {
		cursorCommand(thisCursor, H.SelectAll);
		assertCursor(thisCursor, new Selection(1, 1, 5, LINE5.length + 1));
	});

	test('expandLineSelection', () => {
		//              0          1         2
		//              01234 56789012345678 0
		// let LINE1 = '    \tMy First Line\t ';
		moveTo(thisCursor, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 1, LINE1.length + 1));

		moveTo(thisCursor, 1, 2);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 1, LINE1.length + 1));

		moveTo(thisCursor, 1, 5);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 1, LINE1.length + 1));

		moveTo(thisCursor, 1, 19);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 1, LINE1.length + 1));

		moveTo(thisCursor, 1, 20);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 1, LINE1.length + 1));

		moveTo(thisCursor, 1, 21);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 1, LINE1.length + 1));
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 2, LINE2.length + 1));
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 3, LINE3.length + 1));
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 4, LINE4.length + 1));
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 5, LINE5.length + 1));
		cursorCommand(thisCursor, H.ExpandLineSelection);
		assertCursor(thisCursor, new Selection(1, 1, 5, LINE5.length + 1));
	});

	// --------- eventing

	test('no move doesn\'t trigger event', () => {
		thisCursor.addListener2(EventType.CursorPositionChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisCursor.addListener2(EventType.CursorSelectionChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		moveTo(thisCursor, 1, 1);
	});

	test('move eventing', () => {
		let events = 0;
		thisCursor.addListener2(EventType.CursorPositionChanged, (e: ICursorPositionChangedEvent) => {
			events++;
			assert.deepEqual(e.position, new Position(1, 2));
		});
		thisCursor.addListener2(EventType.CursorSelectionChanged, (e: ICursorSelectionChangedEvent) => {
			events++;
			assert.deepEqual(e.selection, new Selection(1, 2, 1, 2));
		});
		moveTo(thisCursor, 1, 2);
		assert.equal(events, 2, 'receives 2 events');
	});

	test('move in selection mode eventing', () => {
		let events = 0;
		thisCursor.addListener2(EventType.CursorPositionChanged, (e: ICursorPositionChangedEvent) => {
			events++;
			assert.deepEqual(e.position, new Position(1, 2));
		});
		thisCursor.addListener2(EventType.CursorSelectionChanged, (e: ICursorSelectionChangedEvent) => {
			events++;
			assert.deepEqual(e.selection, new Selection(1, 1, 1, 2));
		});
		moveTo(thisCursor, 1, 2, true);
		assert.equal(events, 2, 'receives 2 events');
	});

	// --------- state save & restore

	test('saveState & restoreState', () => {
		moveTo(thisCursor, 2, 1, true);
		assertCursor(thisCursor, new Selection(1, 1, 2, 1));

		let savedState = JSON.stringify(thisCursor.saveState());

		moveTo(thisCursor, 1, 1, false);
		assertCursor(thisCursor, new Position(1, 1));

		thisCursor.restoreState(JSON.parse(savedState));
		assertCursor(thisCursor, new Selection(1, 1, 2, 1));
	});

	// --------- updating cursor

	test('Independent model edit 1', () => {
		moveTo(thisCursor, 2, 16, true);

		thisModel.applyEdits([EditOperation.delete(new Range(2, 1, 2, 2))]);
		assertCursor(thisCursor, new Selection(1, 1, 2, 15));
	});

	test('column select 1', () => {
		let model = Model.createFromString([
			'\tprivate compute(a:number): boolean {',
			'\t\tif (a + 3 === 0 || a + 5 === 0) {',
			'\t\t\treturn false;',
			'\t\t}',
			'\t}'
		].join('\n'));
		let cursor = new Cursor(new MockConfiguration(null), model, viewModelHelper(model), true);

		moveTo(cursor, 1, 7, false);
		assertCursor(cursor, new Position(1, 7));

		cursorCommand(cursor, H.ColumnSelect, {
			position: new Position(4, 4),
			viewPosition: new Position(4, 4),
			mouseColumn: 15
		});

		let expectedSelections = [
			new Selection(1, 7, 1, 12),
			new Selection(2, 4, 2, 9),
			new Selection(3, 3, 3, 6),
			new Selection(4, 4, 4, 4),
		];

		assertCursor(cursor, expectedSelections);

		cursor.dispose();
		model.dispose();
	});

	test('issue #4905 - column select is biased to the right', () => {
		let model = Model.createFromString([
			'var gulp = require("gulp");',
			'var path = require("path");',
			'var rimraf = require("rimraf");',
			'var isarray = require("isarray");',
			'var merge = require("merge-stream");',
			'var concat = require("gulp-concat");',
			'var newer = require("gulp-newer");',
		].join('\n'));
		let cursor = new Cursor(new MockConfiguration(null), model, viewModelHelper(model), true);

		moveTo(cursor, 1, 4, false);
		assertCursor(cursor, new Position(1, 4));

		cursorCommand(cursor, H.ColumnSelect, {
			position: new Position(4, 1),
			viewPosition: new Position(4, 1),
			mouseColumn: 1
		});

		assertCursor(cursor, [
			new Selection(1, 4, 1, 1),
			new Selection(2, 4, 2, 1),
			new Selection(3, 4, 3, 1),
			new Selection(4, 4, 4, 1),
		]);

		cursor.dispose();
		model.dispose();
	});

	test('column select with keyboard', () => {
		let model = Model.createFromString([
			'var gulp = require("gulp");',
			'var path = require("path");',
			'var rimraf = require("rimraf");',
			'var isarray = require("isarray");',
			'var merge = require("merge-stream");',
			'var concat = require("gulp-concat");',
			'var newer = require("gulp-newer");',
		].join('\n'));
		let cursor = new Cursor(new MockConfiguration(null), model, viewModelHelper(model), true);

		moveTo(cursor, 1, 4, false);
		assertCursor(cursor, new Position(1, 4));

		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 5)
		]);

		cursorCommand(cursor, H.CursorColumnSelectDown);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 5),
			new Selection(2, 4, 2, 5)
		]);

		cursorCommand(cursor, H.CursorColumnSelectDown);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 5),
			new Selection(2, 4, 2, 5),
			new Selection(3, 4, 3, 5),
		]);

		cursorCommand(cursor, H.CursorColumnSelectDown);
		cursorCommand(cursor, H.CursorColumnSelectDown);
		cursorCommand(cursor, H.CursorColumnSelectDown);
		cursorCommand(cursor, H.CursorColumnSelectDown);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 5),
			new Selection(2, 4, 2, 5),
			new Selection(3, 4, 3, 5),
			new Selection(4, 4, 4, 5),
			new Selection(5, 4, 5, 5),
			new Selection(6, 4, 6, 5),
			new Selection(7, 4, 7, 5),
		]);

		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 6),
			new Selection(2, 4, 2, 6),
			new Selection(3, 4, 3, 6),
			new Selection(4, 4, 4, 6),
			new Selection(5, 4, 5, 6),
			new Selection(6, 4, 6, 6),
			new Selection(7, 4, 7, 6),
		]);

		// 10 times
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 16),
			new Selection(2, 4, 2, 16),
			new Selection(3, 4, 3, 16),
			new Selection(4, 4, 4, 16),
			new Selection(5, 4, 5, 16),
			new Selection(6, 4, 6, 16),
			new Selection(7, 4, 7, 16),
		]);

		// 10 times
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 26),
			new Selection(2, 4, 2, 26),
			new Selection(3, 4, 3, 26),
			new Selection(4, 4, 4, 26),
			new Selection(5, 4, 5, 26),
			new Selection(6, 4, 6, 26),
			new Selection(7, 4, 7, 26),
		]);

		// 2 times => reaching the ending of lines 1 and 2
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 28),
			new Selection(4, 4, 4, 28),
			new Selection(5, 4, 5, 28),
			new Selection(6, 4, 6, 28),
			new Selection(7, 4, 7, 28),
		]);

		// 4 times => reaching the ending of line 3
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 32),
			new Selection(4, 4, 4, 32),
			new Selection(5, 4, 5, 32),
			new Selection(6, 4, 6, 32),
			new Selection(7, 4, 7, 32),
		]);

		// 2 times => reaching the ending of line 4
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 32),
			new Selection(4, 4, 4, 34),
			new Selection(5, 4, 5, 34),
			new Selection(6, 4, 6, 34),
			new Selection(7, 4, 7, 34),
		]);

		// 1 time => reaching the ending of line 7
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 32),
			new Selection(4, 4, 4, 34),
			new Selection(5, 4, 5, 35),
			new Selection(6, 4, 6, 35),
			new Selection(7, 4, 7, 35),
		]);

		// 3 times => reaching the ending of lines 5 & 6
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 32),
			new Selection(4, 4, 4, 34),
			new Selection(5, 4, 5, 37),
			new Selection(6, 4, 6, 37),
			new Selection(7, 4, 7, 35),
		]);

		// cannot go anywhere anymore
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 32),
			new Selection(4, 4, 4, 34),
			new Selection(5, 4, 5, 37),
			new Selection(6, 4, 6, 37),
			new Selection(7, 4, 7, 35),
		]);

		// cannot go anywhere anymore even if we insist
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		cursorCommand(cursor, H.CursorColumnSelectRight);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 32),
			new Selection(4, 4, 4, 34),
			new Selection(5, 4, 5, 37),
			new Selection(6, 4, 6, 37),
			new Selection(7, 4, 7, 35),
		]);

		// can easily go back
		cursorCommand(cursor, H.CursorColumnSelectLeft);
		assertCursor(cursor, [
			new Selection(1, 4, 1, 28),
			new Selection(2, 4, 2, 28),
			new Selection(3, 4, 3, 32),
			new Selection(4, 4, 4, 34),
			new Selection(5, 4, 5, 36),
			new Selection(6, 4, 6, 36),
			new Selection(7, 4, 7, 35),
		]);

		cursor.dispose();
		model.dispose();
	});
});

class SurroundingMode extends MockMode {

	private static _id = new LanguageIdentifier('surroundingMode', 3);

	constructor() {
		super(SurroundingMode._id);
		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			autoClosingPairs: [{ open: '(', close: ')' }]
		}));
	}
}

class OnEnterMode extends MockMode {
	private static _id = new LanguageIdentifier('onEnterMode', 3);

	constructor(indentAction: IndentAction, outdentCurrentLine?: boolean) {
		super(OnEnterMode._id);
		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			onEnterRules: [{
				beforeText: /.*/,
				action: {
					indentAction: indentAction,
					outdentCurrentLine: outdentCurrentLine
				}
			}]
		}));
	}
}

class IndentRulesMode extends MockMode {
	private static _id = new LanguageIdentifier('indentRulesMode', 4);
	constructor(indentationRules: IndentationRule) {
		super(IndentRulesMode._id);
		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			indentationRules: indentationRules
		}));
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
				tabSize: 4,
				trimAutoWhitespace: false
			}
		}, (model, cursor) => {
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n', 'assert1');

			cursorCommand(cursor, H.Tab, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t', 'assert2');

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
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



	test('bug #16543: Tab should indent to correct indentation spot immediately', () => {
		let mode = new OnEnterMode(IndentAction.Indent);
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
				tabSize: 4,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {
			moveTo(cursor, 4, 1, false);
			assertCursor(cursor, new Selection(4, 1, 4, 1));

			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(4), '\t\t');
		});
		mode.dispose();
	});

	test('bug #2938 (1): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		let mode = new OnEnterMode(IndentAction.Indent);
		usingCursor({
			text: [
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'\t',
				'\t\t}',
				'\t}'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {
			moveTo(cursor, 4, 2, false);
			assertCursor(cursor, new Selection(4, 2, 4, 2));

			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(4), '\t\t\t');
		});
		mode.dispose();
	});


	test('bug #2938 (2): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		let mode = new OnEnterMode(IndentAction.Indent);
		usingCursor({
			text: [
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'    ',
				'\t\t}',
				'\t}'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {
			moveTo(cursor, 4, 1, false);
			assertCursor(cursor, new Selection(4, 1, 4, 1));

			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(4), '\t\t\t');
		});
		mode.dispose();
	});

	test('bug #2938 (3): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		let mode = new OnEnterMode(IndentAction.Indent);
		usingCursor({
			text: [
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'\t\t\t',
				'\t\t}',
				'\t}'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {
			moveTo(cursor, 4, 3, false);
			assertCursor(cursor, new Selection(4, 3, 4, 3));

			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(4), '\t\t\t\t');
		});
		mode.dispose();
	});

	test('bug #2938 (4): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)', () => {
		let mode = new OnEnterMode(IndentAction.Indent);
		usingCursor({
			text: [
				'\tfunction baz() {',
				'\t\tfunction hello() { // something here',
				'\t\t',
				'\t\t\t\t',
				'\t\t}',
				'\t}'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {
			moveTo(cursor, 4, 4, false);
			assertCursor(cursor, new Selection(4, 4, 4, 4));

			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(4), '\t\t\t\t\t');
		});
		mode.dispose();
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
				tabSize: 4,
				trimAutoWhitespace: true
			},
		}, (model, cursor) => {
			moveTo(cursor, 1, 2, false);
			assertCursor(cursor, new Selection(1, 2, 1, 2));

			cursorCommand(cursor, H.Indent, null, 'keyboard');
			assert.equal(model.getLineContent(1), '\tfunction baz() {');

			assertCursor(cursor, new Selection(1, 3, 1, 3));
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(1), '\tf\tunction baz() {');
		});
	});

	test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {
		let mode = new OnEnterMode(IndentAction.IndentOutdent);
		usingCursor({
			text: [
				'     function baz() {'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 6, false);
			assertCursor(cursor, new Selection(1, 6, 1, 6));

			cursorCommand(cursor, H.Outdent, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    function baz() {');
			assertCursor(cursor, new Selection(1, 5, 1, 5));
		});
		mode.dispose();
	});

	test('Bug #18293:[regression][editor] Can\'t outdent whitespace line', () => {
		usingCursor({
			text: [
				'      '
			],
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			assertCursor(cursor, new Selection(1, 7, 1, 7));

			cursorCommand(cursor, H.Outdent, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    ');
			assertCursor(cursor, new Selection(1, 5, 1, 5));
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
				tabSize: 4,
				trimAutoWhitespace: true
			},
		}, (model, cursor) => {
			moveTo(cursor, 7, 1, false);
			assertCursor(cursor, new Selection(7, 1, 7, 1));

			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(7), '\t');
			assertCursor(cursor, new Selection(7, 2, 7, 2));
		});
	});

	test('bug #16740: [editor] Cut line doesn\'t quite cut the last line', () => {
		// Part 1 => there is text on the last line
		let text = [
			'asdasd',
			'qwerty'
		];
		let model = Model.createFromString(text.join('\n'));
		let cursor = new Cursor(new MockConfiguration(null), model, viewModelHelper(model), true);

		moveTo(cursor, 2, 1, false);
		assertCursor(cursor, new Selection(2, 1, 2, 1));

		cursorCommand(cursor, H.Cut, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), 'asdasd');

		cursor.dispose();
		model.dispose();

		// Part 2 => there is no text on the last line
		text = [
			'asdasd',
			''
		];
		model = Model.createFromString(text.join('\n'));
		cursor = new Cursor(new MockConfiguration(null), model, viewModelHelper(model), true);

		moveTo(cursor, 2, 1, false);
		assertCursor(cursor, new Selection(2, 1, 2, 1));

		cursorCommand(cursor, H.Cut, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), 'asdasd');

		cursorCommand(cursor, H.Cut, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), '');

		cursor.dispose();
		model.dispose();
	});

	test('Bug #11476: Double bracket surrounding + undo is broken', () => {
		let mode = new SurroundingMode();
		usingCursor({
			text: [
				'hello'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { tabSize: 4, insertSpaces: true, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 3, false);
			moveTo(cursor, 1, 5, true);
			assertCursor(cursor, new Selection(1, 3, 1, 5));

			cursorCommand(cursor, H.Type, { text: '(' }, 'keyboard');
			assertCursor(cursor, new Selection(1, 4, 1, 6));

			cursorCommand(cursor, H.Type, { text: '(' }, 'keyboard');
			assertCursor(cursor, new Selection(1, 5, 1, 7));
		});
		mode.dispose();
	});

	test('issue #1140: Backspace stops prematurely', () => {
		let mode = new SurroundingMode();
		usingCursor({
			text: [
				'function baz() {',
				'  return 1;',
				'};'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { tabSize: 4, insertSpaces: true, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 3, 2, false);
			moveTo(cursor, 1, 14, true);
			assertCursor(cursor, new Selection(3, 2, 1, 14));

			cursorCommand(cursor, H.DeleteLeft);
			assertCursor(cursor, new Selection(1, 14, 1, 14));
			assert.equal(model.getLineCount(), 1);
			assert.equal(model.getLineContent(1), 'function baz(;');
		});
		mode.dispose();
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

	test('issue #10212: Pasting entire line does not replace selection', () => {
		usingCursor({
			text: [
				'line1',
				'line2'
			],
		}, (model, cursor) => {
			moveTo(cursor, 2, 1, false);
			moveTo(cursor, 2, 6, true);

			cursorCommand(cursor, H.Paste, { text: 'line1\n', pasteOnNewLine: true });

			assert.equal(model.getLineContent(1), 'line1');
			assert.equal(model.getLineContent(2), 'line1');
			assert.equal(model.getLineContent(3), '');
		});
	});

	test('issue #3071: Investigate why undo stack gets corrupted', () => {
		usingCursor({
			text: [
				'some lines',
				'and more lines',
				'just some text',
			],
			languageIdentifier: null,
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 1, false);
			moveTo(cursor, 3, 4, true);

			let isFirst = true;
			model.onDidChangeContent(() => {
				if (isFirst) {
					isFirst = false;
					cursorCommand(cursor, H.Type, { text: '\t' }, 'keyboard');
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

	test('issue #12950: Cannot Double Click To Insert Emoji Using OSX Emoji Panel', () => {
		usingCursor({
			text: [
				'some lines',
				'and more lines',
				'just some text',
			],
			languageIdentifier: null,
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 3, 1, false);

			cursorCommand(cursor, H.Type, { text: '😍' }, 'keyboard');

			assert.equal(model.getValue(), [
				'some lines',
				'and more lines',
				'😍just some text',
			].join('\n'));
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
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 3, 2, false);
			cursorCommand(cursor, H.Tab);
			assert.equal(model.getLineContent(3), '\t    \tx: 3');
		});
	});

	test('issue #4312: trying to type a tab character over a sequence of spaces results in unexpected behaviour', () => {
		usingCursor({
			text: [
				'var foo = 123;       // this is a comment',
				'var bar = 4;       // another comment'
			],
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 15, false);
			moveTo(cursor, 1, 22, true);
			cursorCommand(cursor, H.Tab);
			assert.equal(model.getLineContent(1), 'var foo = 123;\t// this is a comment');
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

	test('issue #3882: deleteWordRight', () => {
		usingCursor({
			text: [
				'public void Add( int x,',
				'                 int y )'
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 24, false);
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), 'public void Add( int x,int y )', '001');
		});
	});

	test('issue #3882: deleteWordStartRight', () => {
		usingCursor({
			text: [
				'public void Add( int x,',
				'                 int y )'
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 24, false);
			deleteWordStartRight(cursor); assert.equal(model.getLineContent(1), 'public void Add( int x,int y )', '001');
		});
	});

	test('issue #3882: deleteWordEndRight', () => {
		usingCursor({
			text: [
				'public void Add( int x,',
				'                 int y )'
			],
		}, (model, cursor) => {
			moveTo(cursor, 1, 24, false);
			deleteWordEndRight(cursor); assert.equal(model.getLineContent(1), 'public void Add( int x,int y )', '001');
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

			assertWordRight(1, '   '.length + 1);
			assertWordRight(2, '   '.length + 1);
			assertWordRight(3, '   '.length + 1);
			assertWordRight(4, '   '.length + 1);
			assertWordRight(5, '   /'.length + 1);
			assertWordRight(6, '   /*'.length + 1);
			assertWordRight(7, '   /* '.length + 1);
			assertWordRight(8, '   /* Just'.length + 1);
			assertWordRight(9, '   /* Just'.length + 1);
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
			deleteWordRight(cursor); assert.equal(model.getLineContent(1), 'A line with text.And another one', '001');
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

	test('issue #9675: Undo/Redo adds a stop in between CHN Characters', () => {
		usingCursor({
			text: [
			]
		}, (model, cursor) => {
			assertCursor(cursor, new Position(1, 1));

			// Typing sennsei in Japanese - Hiragana
			cursorCommand(cursor, H.Type, { text: 'ｓ' }, 'keyboard');
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せ', replaceCharCnt: 1 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せｎ', replaceCharCnt: 1 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せん', replaceCharCnt: 2 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せんｓ', replaceCharCnt: 2 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せんせ', replaceCharCnt: 3 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せんせ', replaceCharCnt: 3 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せんせい', replaceCharCnt: 3 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せんせい', replaceCharCnt: 4 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せんせい', replaceCharCnt: 4 });
			cursorCommand(cursor, H.ReplacePreviousChar, { text: 'せんせい', replaceCharCnt: 4 });

			assert.equal(model.getLineContent(1), 'せんせい');
			assertCursor(cursor, new Position(1, 5));

			cursorCommand(cursor, H.Undo);
			assert.equal(model.getLineContent(1), '');
			assertCursor(cursor, new Position(1, 1));
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
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			cursorCommand(cursor, H.MoveTo, { position: new Position(1, 21) }, 'keyboard');
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
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
			modelOpts: { insertSpaces: true, tabSize: 13, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			// Tab on column 1
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 1) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), '             My Second Line123');
			cursorCommand(cursor, H.Undo, null, 'keyboard');

			// Tab on column 2
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 2) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'M            y Second Line123');
			cursorCommand(cursor, H.Undo, null, 'keyboard');

			// Tab on column 3
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 3) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My            Second Line123');
			cursorCommand(cursor, H.Undo, null, 'keyboard');

			// Tab on column 4
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 4) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My           Second Line123');
			cursorCommand(cursor, H.Undo, null, 'keyboard');

			// Tab on column 5
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 5) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My S         econd Line123');
			cursorCommand(cursor, H.Undo, null, 'keyboard');

			// Tab on column 5
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 5) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My S         econd Line123');
			cursorCommand(cursor, H.Undo, null, 'keyboard');

			// Tab on column 13
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 13) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My Second Li ne123');
			cursorCommand(cursor, H.Undo, null, 'keyboard');

			// Tab on column 14
			assert.equal(model.getLineContent(2), 'My Second Line123');
			cursorCommand(cursor, H.MoveTo, { position: new Position(2, 14) }, 'keyboard');
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(2), 'My Second Lin             e123');
		});
	});

	test('Enter auto-indents with insertSpaces setting 1', () => {
		let mode = new OnEnterMode(IndentAction.Indent);
		usingCursor({
			text: [
				'\thello'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			assertCursor(cursor, new Selection(1, 7, 1, 7));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.CRLF), '\thello\r\n        ');
		});
		mode.dispose();
	});

	test('Enter auto-indents with insertSpaces setting 2', () => {
		let mode = new OnEnterMode(IndentAction.None);
		usingCursor({
			text: [
				'\thello'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			assertCursor(cursor, new Selection(1, 7, 1, 7));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.CRLF), '\thello\r\n    ');
		});
		mode.dispose();
	});

	test('Enter auto-indents with insertSpaces setting 3', () => {
		let mode = new OnEnterMode(IndentAction.IndentOutdent);
		usingCursor({
			text: [
				'\thell()'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 7, false);
			assertCursor(cursor, new Selection(1, 7, 1, 7));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.CRLF), '\thell(\r\n        \r\n    )');
		});
		mode.dispose();
	});

	test('Insert line before', () => {
		let testInsertLineBefore = (lineNumber: number, column: number, callback: (model: Model, cursor: Cursor) => void) => {
			usingCursor({
				text: [
					'First line',
					'Second line',
					'Third line'
				],
			}, (model, cursor) => {
				moveTo(cursor, lineNumber, column, false);
				assertCursor(cursor, new Position(lineNumber, column));

				cursorCommand(cursor, H.LineInsertBefore, null, 'keyboard');
				callback(model, cursor);
			});
		};

		testInsertLineBefore(1, 3, (model, cursor) => {
			assertCursor(cursor, new Selection(1, 1, 1, 1));
			assert.equal(model.getLineContent(1), '');
			assert.equal(model.getLineContent(2), 'First line');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineBefore(2, 3, (model, cursor) => {
			assertCursor(cursor, new Selection(2, 1, 2, 1));
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineBefore(3, 3, (model, cursor) => {
			assertCursor(cursor, new Selection(3, 1, 3, 1));
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), 'Third line');
		});
	});

	test('Insert line after', () => {
		let testInsertLineAfter = (lineNumber: number, column: number, callback: (model: Model, cursor: Cursor) => void) => {
			usingCursor({
				text: [
					'First line',
					'Second line',
					'Third line'
				],
			}, (model, cursor) => {
				moveTo(cursor, lineNumber, column, false);
				assertCursor(cursor, new Position(lineNumber, column));

				cursorCommand(cursor, H.LineInsertAfter, null, 'keyboard');
				callback(model, cursor);
			});
		};

		testInsertLineAfter(1, 3, (model, cursor) => {
			assertCursor(cursor, new Selection(2, 1, 2, 1));
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineAfter(2, 3, (model, cursor) => {
			assertCursor(cursor, new Selection(3, 1, 3, 1));
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineAfter(3, 3, (model, cursor) => {
			assertCursor(cursor, new Selection(4, 1, 4, 1));
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), 'Third line');
			assert.equal(model.getLineContent(4), '');
		});
	});

	test('removeAutoWhitespace off', () => {
		usingCursor({
			text: [
				'    some  line abc  '
			],
			modelOpts: {
				insertSpaces: true,
				tabSize: 4,
				detectIndentation: false,
				defaultEOL: DefaultEndOfLine.LF,
				trimAutoWhitespace: false
			}
		}, (model, cursor) => {

			// Move cursor to the end, verify that we do not trim whitespaces if line has values
			moveTo(cursor, 1, model.getLineContent(1).length + 1);
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    some  line abc  ');
			assert.equal(model.getLineContent(2), '    ');

			// Try to enter again, we should trimmed previous line
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    some  line abc  ');
			assert.equal(model.getLineContent(2), '    ');
			assert.equal(model.getLineContent(3), '    ');
		});
	});

	test('removeAutoWhitespace on: removes only whitespace the cursor added 1', () => {
		usingCursor({
			text: [
				'    '
			],
			modelOpts: {
				insertSpaces: true,
				tabSize: 4,
				detectIndentation: false,
				defaultEOL: DefaultEndOfLine.LF,
				trimAutoWhitespace: true
			}
		}, (model, cursor) => {
			moveTo(cursor, 1, model.getLineContent(1).length + 1);
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    ');
			assert.equal(model.getLineContent(2), '    ');

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    ');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), '    ');
		});
	});

	test('issue #6862: Editor removes auto inserted indentation when formatting on type', () => {
		let mode = new OnEnterMode(IndentAction.IndentOutdent);
		usingCursor({
			text: [
				'function foo (params: string) {}'
			],
			modelOpts: {
				insertSpaces: true,
				tabSize: 4,
				detectIndentation: false,
				defaultEOL: DefaultEndOfLine.LF,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {

			moveTo(cursor, 1, 32);
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), 'function foo (params: string) {');
			assert.equal(model.getLineContent(2), '    ');
			assert.equal(model.getLineContent(3), '}');

			class TestCommand implements ICommand {

				private _selectionId: string = null;

				public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
					builder.addEditOperation(new Range(1, 13, 1, 14), '');
					this._selectionId = builder.trackSelection(cursor.getSelection());
				}

				public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
					return helper.getTrackedSelection(this._selectionId);
				}

			}

			cursor.trigger('autoFormat', Handler.ExecuteCommand, new TestCommand());
			assert.equal(model.getLineContent(1), 'function foo(params: string) {');
			assert.equal(model.getLineContent(2), '    ');
			assert.equal(model.getLineContent(3), '}');
		});
		mode.dispose();
	});

	test('removeAutoWhitespace on: removes only whitespace the cursor added 2', () => {
		usingCursor({
			text: [
				'    if (a) {',
				'        ',
				'',
				'',
				'    }'
			],
			modelOpts: {
				insertSpaces: true,
				tabSize: 4,
				detectIndentation: false,
				defaultEOL: DefaultEndOfLine.LF,
				trimAutoWhitespace: true
			}
		}, (model, cursor) => {

			moveTo(cursor, 3, 1);
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    if (a) {');
			assert.equal(model.getLineContent(2), '        ');
			assert.equal(model.getLineContent(3), '    ');
			assert.equal(model.getLineContent(4), '');
			assert.equal(model.getLineContent(5), '    }');

			moveTo(cursor, 4, 1);
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    if (a) {');
			assert.equal(model.getLineContent(2), '        ');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), '    ');
			assert.equal(model.getLineContent(5), '    }');

			moveTo(cursor, 5, model.getLineMaxColumn(5));
			cursorCommand(cursor, H.Type, { text: 'something' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    if (a) {');
			assert.equal(model.getLineContent(2), '        ');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), '');
			assert.equal(model.getLineContent(5), '    }something');
		});
	});

	test('removeAutoWhitespace on: test 1', () => {
		usingCursor({
			text: [
				'    some  line abc  '
			],
			modelOpts: {
				insertSpaces: true,
				tabSize: 4,
				detectIndentation: false,
				defaultEOL: DefaultEndOfLine.LF,
				trimAutoWhitespace: true
			}
		}, (model, cursor) => {

			// Move cursor to the end, verify that we do not trim whitespaces if line has values
			moveTo(cursor, 1, model.getLineContent(1).length + 1);
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    some  line abc  ');
			assert.equal(model.getLineContent(2), '    ');

			// Try to enter again, we should trimmed previous line
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    some  line abc  ');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), '    ');

			// More whitespaces
			cursorCommand(cursor, H.Tab, null, 'keyboard');
			assert.equal(model.getLineContent(1), '    some  line abc  ');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), '        ');

			// Enter and verify that trimmed again
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    some  line abc  ');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), '        ');

			// Trimmed if we will keep only text
			moveTo(cursor, 1, 5);
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    ');
			assert.equal(model.getLineContent(2), '    some  line abc  ');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), '');
			assert.equal(model.getLineContent(5), '');

			// Trimmed if we will keep only text by selection
			moveTo(cursor, 2, 5);
			moveTo(cursor, 3, 1, true);
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(1), '    ');
			assert.equal(model.getLineContent(2), '    ');
			assert.equal(model.getLineContent(3), '    ');
			assert.equal(model.getLineContent(4), '');
			assert.equal(model.getLineContent(5), '');
		});
	});

	test('UseTabStops is off', () => {
		usingCursor({
			text: [
				'    x',
				'        a    ',
				'    '
			],
			modelOpts: {
				insertSpaces: true,
				tabSize: 4,
				detectIndentation: false,
				defaultEOL: DefaultEndOfLine.LF,
				trimAutoWhitespace: true
			},
			editorOpts: {
				useTabStops: false
			}
		}, (model, cursor) => {
			// DeleteLeft removes just one whitespace
			moveTo(cursor, 2, 9);
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(2), '       a    ');
		});
	});

	test('Backspace removes whitespaces with tab size', () => {
		usingCursor({
			text: [
				' \t \t     x',
				'        a    ',
				'    '
			],
			modelOpts: {
				insertSpaces: true,
				tabSize: 4,
				detectIndentation: false,
				defaultEOL: DefaultEndOfLine.LF,
				trimAutoWhitespace: true
			},
			editorOpts: {
				useTabStops: true
			}
		}, (model, cursor) => {
			// DeleteLeft does not remove tab size, because some text exists before
			moveTo(cursor, 2, model.getLineContent(2).length + 1);
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(2), '        a   ');

			// DeleteLeft removes tab size = 4
			moveTo(cursor, 2, 9);
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(2), '    a   ');

			// DeleteLeft removes tab size = 4
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(2), 'a   ');

			// Undo DeleteLeft - get us back to original indentation
			cursorCommand(cursor, H.Undo, {});
			assert.equal(model.getLineContent(2), '        a   ');

			// Nothing is broken when cursor is in (1,1)
			moveTo(cursor, 1, 1);
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(1), ' \t \t     x');

			// DeleteLeft stops at tab stops even in mixed whitespace case
			moveTo(cursor, 1, 10);
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(1), ' \t \t    x');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(1), ' \t \tx');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(1), ' \tx');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(1), 'x');

			// DeleteLeft on last line
			moveTo(cursor, 3, model.getLineContent(3).length + 1);
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(3), '');

			// DeleteLeft with removing new line symbol
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), 'x\n        a   ');

			// In case of selection DeleteLeft only deletes selected text
			moveTo(cursor, 2, 3);
			moveTo(cursor, 2, 4, true);
			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getLineContent(2), '       a   ');
		});
	});

	test('PR #5423: Auto indent + undo + redo is funky', () => {
		usingCursor({
			text: [
				''
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4,
				trimAutoWhitespace: true
			}
		}, (model, cursor) => {
			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n', 'assert1');

			cursorCommand(cursor, H.Tab, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\t', 'assert2');

			cursorCommand(cursor, H.Type, { text: 'y' }, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty', 'assert2');

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty\n\t', 'assert3');

			cursorCommand(cursor, H.Type, { text: 'x' });
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty\n\tx', 'assert4');

			cursorCommand(cursor, H.CursorLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty\n\tx', 'assert5');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty\nx', 'assert6');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\tyx', 'assert7');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\tx', 'assert8');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\nx', 'assert9');

			cursorCommand(cursor, H.DeleteLeft, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), 'x', 'assert10');

			cursorCommand(cursor, H.Undo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\nx', 'assert11');

			cursorCommand(cursor, H.Undo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty\nx', 'assert12');

			cursorCommand(cursor, H.Undo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty\n\tx', 'assert13');

			cursorCommand(cursor, H.Redo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\n\ty\nx', 'assert14');

			cursorCommand(cursor, H.Redo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), '\nx', 'assert15');

			cursorCommand(cursor, H.Redo, {});
			assert.equal(model.getValue(EndOfLinePreference.LF), 'x', 'assert16');
		});
	});
});

suite('Editor Controller - Indentation Rules', () => {
	let mode = new IndentRulesMode({
		decreaseIndentPattern: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
		increaseIndentPattern: /(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
		indentNextLinePattern: /^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
		unIndentedLinePattern: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
	});

	let emptyRulesMode = new OnEnterMode(IndentAction.None);

	test('Enter honors increaseIndentPattern', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 12, false);
			assertCursor(cursor, new Selection(1, 12, 1, 12));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(2, 2, 2, 2));

			moveTo(cursor, 3, 13, false);
			assertCursor(cursor, new Selection(3, 13, 3, 13));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(4, 3, 4, 3));
		});
	});

	test('Enter honors decreaseIndentPattern', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\t}'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 2, 3, false);
			assertCursor(cursor, new Selection(2, 3, 2, 3));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(3, 1, 3, 1));
			assert.equal(model.getLineContent(2), '}', '001');
		});
	});

	test('Enter honors unIndentedLinePattern', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\t\t\treturn true'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 2, 15, false);
			assertCursor(cursor, new Selection(2, 15, 2, 15));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(3, 2, 3, 2));
		});
	});

	test('Enter honors indentNextLinePattern', () => {
		usingCursor({
			text: [
				'if (true)',
				'\treturn true;',
				'if (true)',
				'\t\t\t\treturn true'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 2, 14, false);
			assertCursor(cursor, new Selection(2, 14, 2, 14));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(3, 1, 3, 1));

			moveTo(cursor, 5, 16, false);
			assertCursor(cursor, new Selection(5, 16, 5, 16));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(6, 2, 6, 2));
		});
	});

	test('Enter adjusts indentation of current line 1', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'\t\treturn true;',
				'\t\t}}'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 4, 4, false);
			assertCursor(cursor, new Selection(4, 4, 4, 4));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(5, 1, 5, 1));
			assert.equal(model.getLineContent(4), '\t}', '001');
		});
	});

	test('Enter adjusts indentation of current line 2', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'\t\treturn true;',
				'}}'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 4, 2, false);
			assertCursor(cursor, new Selection(4, 2, 4, 2));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(5, 1, 5, 1));
			assert.equal(model.getLineContent(4), '}', '001');
		});
	});

	test('Enter supports selection 1', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {',
				'\t\treturn true;',
				'\t\t}a}'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 4, 4, false);
			moveTo(cursor, 4, 5, true);
			assertCursor(cursor, new Selection(4, 4, 4, 5));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(5, 1, 5, 1));
			assert.equal(model.getLineContent(4), '\t}', '001');
		});
	});

	test('Enter supports selection 2', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 2, 12, false);
			moveTo(cursor, 2, 13, true);
			assertCursor(cursor, new Selection(2, 12, 2, 13));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(3, 3, 3, 3));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(4, 3, 4, 3));
		});
	});

	test('Enter honors tabSize and insertSpaces 1', () => {
		usingCursor({
			text: [
				'if (true) {',
				'\tif (true) {'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 12, false);
			assertCursor(cursor, new Selection(1, 12, 1, 12));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(2, 5, 2, 5));

			moveTo(cursor, 3, 13, false);
			assertCursor(cursor, new Selection(3, 13, 3, 13));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(4, 9, 4, 9));
		});
	});

	test('Enter honors tabSize and insertSpaces 2', () => {
		usingCursor({
			text: [
				'if (true) {',
				'    if (true) {'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: true, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 12, false);
			assertCursor(cursor, new Selection(1, 12, 1, 12));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(2, 5, 2, 5));

			moveTo(cursor, 3, 16, false);
			assertCursor(cursor, new Selection(3, 16, 3, 16));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(3), '    if (true) {');
			assertCursor(cursor, new Selection(4, 9, 4, 9));
		});
	});

	test('Enter honors tabSize and insertSpaces 3', () => {
		usingCursor({
			text: [
				'if (true) {',
				'    if (true) {'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 1, 12, false);
			assertCursor(cursor, new Selection(1, 12, 1, 12));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(2, 2, 2, 2));

			moveTo(cursor, 3, 16, false);
			assertCursor(cursor, new Selection(3, 16, 3, 16));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(3), '    if (true) {');
			assertCursor(cursor, new Selection(4, 3, 4, 3));
		});
	});

	test('Enter supports intentional indentation', () => {
		usingCursor({
			text: [
				'\tif (true) {',
				'\t\tswitch(true) {',
				'\t\t\tcase true:',
				'\t\t\t\tbreak;',
				'\t\t}',
				'\t}'
			],
			languageIdentifier: mode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 5, 4, false);
			assertCursor(cursor, new Selection(5, 4, 5, 4));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(5), '\t\t}');
			assertCursor(cursor, new Selection(6, 3, 6, 3));
		});
	});

	test('issue Microsoft/monaco-editor#108 part 1/2: Auto indentation on Enter with selection is half broken', () => {
		usingCursor({
			text: [
				'function baz() {',
				'\tvar x = 1;',
				'\t\t\t\t\t\t\treturn x;',
				'}'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {
			moveTo(cursor, 3, 8, false);
			moveTo(cursor, 2, 12, true);
			assertCursor(cursor, new Selection(3, 8, 2, 12));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(3), '\treturn x;');
			assertCursor(cursor, new Position(3, 2));
		});
	});

	test('issue Microsoft/monaco-editor#108 part 2/2: Auto indentation on Enter with selection is half broken', () => {
		usingCursor({
			text: [
				'function baz() {',
				'\tvar x = 1;',
				'\t\t\t\t\t\t\treturn x;',
				'}'
			],
			modelOpts: {
				defaultEOL: DefaultEndOfLine.LF,
				detectIndentation: false,
				insertSpaces: false,
				tabSize: 4,
				trimAutoWhitespace: true
			},
			languageIdentifier: mode.getLanguageIdentifier(),
		}, (model, cursor) => {
			moveTo(cursor, 2, 12, false);
			moveTo(cursor, 3, 8, true);
			assertCursor(cursor, new Selection(2, 12, 3, 8));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(3), '\treturn x;');
			assertCursor(cursor, new Position(3, 2));
		});
	});

	test('onEnter works if there are no indentation rules', () => {
		usingCursor({
			text: [
				'<?',
				'\tif (true) {',
				'\t\techo $hi;',
				'\t\techo $bye;',
				'\t}',
				'?>'
			],
			languageIdentifier: emptyRulesMode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 5, 3, false);
			assertCursor(cursor, new Selection(5, 3, 5, 3));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assert.equal(model.getLineContent(6), '\t');
			assertCursor(cursor, new Selection(6, 2, 6, 2));
			assert.equal(model.getLineContent(5), '\t}');
		});
	});

	test('onEnter works if there are no indentation rules 2', () => {
		usingCursor({
			text: [
				'	if (5)',
				'		return 5;',
				'	'
			],
			languageIdentifier: emptyRulesMode.getLanguageIdentifier(),
			modelOpts: { insertSpaces: false, tabSize: 4, detectIndentation: false, defaultEOL: DefaultEndOfLine.LF, trimAutoWhitespace: true }
		}, (model, cursor) => {
			moveTo(cursor, 3, 2, false);
			assertCursor(cursor, new Selection(3, 2, 3, 2));

			cursorCommand(cursor, H.Type, { text: '\n' }, 'keyboard');
			assertCursor(cursor, new Selection(4, 2, 4, 2));
			assert.equal(model.getLineContent(4), '\t');
		});
	});
});

interface ICursorOpts {
	text: string[];
	languageIdentifier?: LanguageIdentifier;
	modelOpts?: ITextModelCreationOptions;
	editorOpts?: IEditorOptions;
}

function usingCursor(opts: ICursorOpts, callback: (model: Model, cursor: Cursor) => void): void {
	let model = Model.createFromString(opts.text.join('\n'), opts.modelOpts, opts.languageIdentifier);
	let config = new MockConfiguration(opts.editorOpts);
	let cursor = new Cursor(config, model, viewModelHelper(model), false);

	callback(model, cursor);

	cursor.dispose();
	config.dispose();
	model.dispose();
}

class ElectricCharMode extends MockMode {

	private static _id = new LanguageIdentifier('electricCharMode', 3);

	constructor() {
		super(ElectricCharMode._id);
		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			__electricCharacterSupport: {
				docComment: { open: '/**', close: ' */' }
			},
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			]
		}));
	}
}

suite('ElectricCharacter', () => {
	test('does nothing if no electric char', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				''
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 1);
			cursorCommand(cursor, H.Type, { text: '*' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '*');
		});
		mode.dispose();
	});

	test('indents in order to match bracket', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				''
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 1);
			cursorCommand(cursor, H.Type, { text: '}' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '  }');
		});
		mode.dispose();
	});

	test('unindents in order to match bracket', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'    '
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 5);
			cursorCommand(cursor, H.Type, { text: '}' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '  }');
		});
		mode.dispose();
	});

	test('matches with correct bracket', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'    if (b) {',
				'    }',
				'    '
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 4, 1);
			cursorCommand(cursor, H.Type, { text: '}' }, 'keyboard');
			assert.deepEqual(model.getLineContent(4), '  }    ');
		});
		mode.dispose();
	});

	test('does nothing if bracket does not match', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'    if (b) {',
				'    }',
				'  }  '
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 4, 6);
			cursorCommand(cursor, H.Type, { text: '}' }, 'keyboard');
			assert.deepEqual(model.getLineContent(4), '  }  }');
		});
		mode.dispose();
	});

	test('matches bracket even in line with content', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'// hello'
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 1);
			cursorCommand(cursor, H.Type, { text: '}' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '  }// hello');
		});
		mode.dispose();
	});

	test('is no-op if bracket is lined up', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'  '
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 3);
			cursorCommand(cursor, H.Type, { text: '}' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '  }');
		});
		mode.dispose();
	});

	test('is no-op if there is non-whitespace text before', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'a'
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 2);
			cursorCommand(cursor, H.Type, { text: '}' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), 'a}');
		});
		mode.dispose();
	});

	test('is no-op if pairs are all matched before', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'foo(() => {',
				'  ( 1 + 2 ) ',
				'})'
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 13);
			cursorCommand(cursor, H.Type, { text: '*' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '  ( 1 + 2 ) *');
		});
		mode.dispose();
	});

	test('is no-op if matching bracket is on the same line', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'(div',
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 1, 5);
			let changeText: string = null;
			model.onDidChangeContent(e => {
				changeText = e.text;
			});
			cursorCommand(cursor, H.Type, { text: ')' }, 'keyboard');
			assert.deepEqual(model.getLineContent(1), '(div)');
			assert.deepEqual(changeText, ')');
		});
		mode.dispose();
	});

	test('is no-op if the line has other content', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'Math.max(',
				'\t2',
				'\t3'
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 3, 3);
			cursorCommand(cursor, H.Type, { text: ')' }, 'keyboard');
			assert.deepEqual(model.getLineContent(3), '\t3)');
		});
		mode.dispose();
	});

	test('appends text', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'/*'
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 3);
			cursorCommand(cursor, H.Type, { text: '*' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '/** */');
		});
		mode.dispose();
	});

	test('appends text 2', () => {
		let mode = new ElectricCharMode();
		usingCursor({
			text: [
				'  if (a) {',
				'  /*'
			],
			languageIdentifier: mode.getLanguageIdentifier()
		}, (model, cursor) => {
			moveTo(cursor, 2, 5);
			cursorCommand(cursor, H.Type, { text: '*' }, 'keyboard');
			assert.deepEqual(model.getLineContent(2), '  /** */');
		});
		mode.dispose();
	});
});
