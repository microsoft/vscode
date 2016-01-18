/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EndOfLinePreference, IEditorRange, IRange, IEditorPosition} from 'vs/editor/common/editorCommon';
import {ISimpleModel, TextAreaState} from 'vs/editor/common/controller/textAreaState';
import {MockTextAreaWrapper} from 'vs/editor/test/common/mocks/mockTextAreaWrapper';

suite('TextAreaState', () => {

	function assertTextAreaState(actual:TextAreaState, value:string, selectionStart:number, selectionEnd:number, isInOverwriteMode:boolean, selectionToken:number): void {
		let desired = new TextAreaState(value, selectionStart, selectionEnd, isInOverwriteMode, selectionToken);
		assert.ok(desired.equals(actual), desired.toString() + ' == ' + actual.toString());
	}

	test('fromTextArea', () => {
		let textArea = new MockTextAreaWrapper();
		textArea._value = 'Hello world!';
		textArea._selectionStart = 1;
		textArea._selectionEnd = 12;
		textArea._isInOverwriteMode = false;
		let actual = TextAreaState.fromTextArea(textArea, 3);

		assertTextAreaState(actual, 'Hello world!', 1, 12, false, 3);
		assert.equal(actual.getValue(), 'Hello world!');
		assert.equal(actual.getSelectionStart(), 1);
		assert.equal(actual.getSelectionToken(), 3);

		actual.resetSelection();
		assertTextAreaState(actual, 'Hello world!', 12, 12, false, 3);

		textArea.dispose();
	});

	test('applyToTextArea', () => {
		let textArea = new MockTextAreaWrapper();
		textArea._value = 'Hello world!';
		textArea._selectionStart = 1;
		textArea._selectionEnd = 12;
		textArea._isInOverwriteMode = false;

		let state = new TextAreaState('Hi world!', 2, 2, false, 0);
		state.applyToTextArea(textArea, false);

		assert.equal(textArea._value, 'Hi world!');
		assert.equal(textArea._selectionStart, 9);
		assert.equal(textArea._selectionEnd, 9);

		state = new TextAreaState('Hi world!', 3, 3, false, 0);
		state.applyToTextArea(textArea, false);

		assert.equal(textArea._value, 'Hi world!');
		assert.equal(textArea._selectionStart, 9);
		assert.equal(textArea._selectionEnd, 9);

		state = new TextAreaState('Hi world!', 0, 2, false, 0);
		state.applyToTextArea(textArea, true);

		assert.equal(textArea._value, 'Hi world!');
		assert.equal(textArea._selectionStart, 0);
		assert.equal(textArea._selectionEnd, 2);

		textArea.dispose();
	});

	function testExtractNewText(prevState:TextAreaState, value:string, selectionStart:number, selectionEnd:number, isInOverwriteMode: boolean, expected:string): void {
		let textArea = new MockTextAreaWrapper();
		textArea._value = value;
		textArea._selectionStart = selectionStart;
		textArea._selectionEnd = selectionEnd;
		textArea._isInOverwriteMode = isInOverwriteMode;

		let newState = TextAreaState.fromTextArea(textArea, prevState ? prevState.getSelectionToken() : 0);

		let actual = newState.extractNewText(prevState);

		assert.equal(actual, expected);

		textArea.dispose();
	}

	test('extractNewText - no previous state with selection', () => {
		testExtractNewText(
			null,
			'a',
			0, 1, false,
			''
		);
	});

	test('extractNewText - no previous state without selection', () => {
		testExtractNewText(
			null,
			'a',
			1, 1, false,
			'a'
		);
	});

	test('extractNewText - typing does not cause a selection', () => {
		testExtractNewText(
			new TextAreaState('', 0, 0, false, 0),
			'a',
			0, 1, false,
			''
		);
	});

	test('extractNewText - had the textarea empty', () => {
		testExtractNewText(
			new TextAreaState('', 0, 0, false, 0),
			'a',
			1, 1, false,
			'a'
		);
	});

	test('extractNewText - had the entire line selected', () => {
		testExtractNewText(
			new TextAreaState('Hello world!', 0, 12, false, 0),
			'H',
			1, 1, false,
			'H'
		);
	});

	test('extractNewText - had previous text 1', () => {
		testExtractNewText(
			new TextAreaState('Hello world!', 12, 12, false, 0),
			'Hello world!a',
			13, 13, false,
			'a'
		);
	});

	test('extractNewText - had previous text 2', () => {
		testExtractNewText(
			new TextAreaState('Hello world!', 0, 0, false, 0),
			'aHello world!',
			1, 1, false,
			'a'
		);
	});

	test('extractNewText - had previous text 3', () => {
		testExtractNewText(
			new TextAreaState('Hello world!', 6, 11, false, 0),
			'Hello other!',
			11, 11, false,
			'other'
		);
	});

	test('extractNewText - IME', () => {
		testExtractNewText(
			new TextAreaState('', 0, 0, false, 0),
			'これは',
			3, 3, false,
			'これは'
		);
	});

	test('extractNewText - isInOverwriteMode', () => {
		testExtractNewText(
			new TextAreaState('Hello world!', 0, 0, false, 0),
			'Aello world!',
			1, 1, true,
			'A'
		);
	});

	function testFromEditorSelectionAndPreviousState(eol:string, lines:string[], range:Range, prevSelectionToken:number): TextAreaState {
		let model = new SimpleModel(lines, eol);
		return TextAreaState.fromEditorSelectionAndPreviousState(model, range, prevSelectionToken);
	}

	test('fromEditorSelectionAndPreviousState - no selection on first line', () => {
		let actual = testFromEditorSelectionAndPreviousState('\n', [
			'Just a line',
			'And another line'
		], new Range(1,1,1,1), 0);
		assertTextAreaState(actual, 'Just a line', 0, 11, false, 1);
	});

	test('fromEditorSelectionAndPreviousState - no selection on second line', () => {
		let actual = testFromEditorSelectionAndPreviousState('\n', [
			'Just a line',
			'And another line',
			'And yet another line',
		], new Range(2,1,2,1), 0);
		assertTextAreaState(actual, 'And another line', 0, 16, false, 2);
	});

	test('fromEditorSelectionAndPreviousState - on a long line with selectionToken mismatch', () => {
		let aLongLine = 'a';
		for (let i = 0; i < 10; i++) {
			aLongLine = aLongLine + aLongLine;
		}
		let actual = testFromEditorSelectionAndPreviousState('\n', [
			'Just a line',
			aLongLine,
			'And yet another line',
		], new Range(2,500,2,500), 0);
		assertTextAreaState(actual, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 0, 201, false, 2);
	});

	test('fromEditorSelectionAndPreviousState - on a long line with same selectionToken', () => {
		let aLongLine = 'a';
		for (let i = 0; i < 10; i++) {
			aLongLine = aLongLine + aLongLine;
		}
		let actual = testFromEditorSelectionAndPreviousState('\n', [
			'Just a line',
			aLongLine,
			'And yet another line',
		], new Range(2,500,2,500), 2);
		assertTextAreaState(actual, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 100, 100, false, 2);
	});
});

class SimpleModel implements ISimpleModel {

	private _lines: string[];
	private _eol: string;

	constructor(lines:string[], eol:string) {
		this._lines = lines;
		this._eol = eol;
	}

	public getLineMaxColumn(lineNumber:number): number {
		return this._lines[lineNumber - 1].length + 1;
	}

	private _getEndOfLine(eol:EndOfLinePreference): string {
		switch (eol) {
			case EndOfLinePreference.LF:
				return '\n';
			case EndOfLinePreference.CRLF:
				return '\r\n';
			case EndOfLinePreference.TextDefined:
				return this._eol;
		}
		throw new Error('Unknown EOL preference');
	}

	public getValueInRange(range:IRange, eol:EndOfLinePreference): string {
		if (Range.isEmpty(range)) {
			return '';
		}

		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		var lineEnding = this._getEndOfLine(eol),
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			resultLines:string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public getModelLineContent(lineNumber:number): string {
		return this._lines[lineNumber - 1];
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): IEditorPosition {
		return new Position(viewLineNumber, viewColumn);
	}
}
