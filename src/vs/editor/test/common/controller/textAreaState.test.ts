/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IENarratorTextAreaState, ISimpleModel, TextAreaState } from 'vs/editor/common/controller/textAreaState';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference } from 'vs/editor/common/editorCommon';
import { MockTextAreaWrapper } from 'vs/editor/test/common/mocks/mockTextAreaWrapper';

suite('TextAreaState', () => {

	function assertTextAreaState(actual: TextAreaState, value: string, selectionStart: number, selectionEnd: number, isInOverwriteMode: boolean, selectionToken: number): void {
		let desired = new IENarratorTextAreaState(null, value, selectionStart, selectionEnd, isInOverwriteMode, selectionToken);
		assert.ok(desired.equals(actual), desired.toString() + ' == ' + actual.toString());
	}

	test('fromTextArea', () => {
		let textArea = new MockTextAreaWrapper();
		textArea._value = 'Hello world!';
		textArea._selectionStart = 1;
		textArea._selectionEnd = 12;
		textArea._isInOverwriteMode = false;
		let actual = IENarratorTextAreaState.EMPTY.fromTextArea(textArea);

		assertTextAreaState(actual, 'Hello world!', 1, 12, false, 0);
		assert.equal(actual.getValue(), 'Hello world!');
		assert.equal(actual.getSelectionStart(), 1);

		actual = actual.resetSelection();
		assertTextAreaState(actual, 'Hello world!', 12, 12, false, 0);

		textArea.dispose();
	});

	test('applyToTextArea', () => {
		let textArea = new MockTextAreaWrapper();
		textArea._value = 'Hello world!';
		textArea._selectionStart = 1;
		textArea._selectionEnd = 12;
		textArea._isInOverwriteMode = false;

		let state = new IENarratorTextAreaState(null, 'Hi world!', 2, 2, false, 0);
		state.applyToTextArea('test', textArea, false);

		assert.equal(textArea._value, 'Hi world!');
		assert.equal(textArea._selectionStart, 9);
		assert.equal(textArea._selectionEnd, 9);

		state = new IENarratorTextAreaState(null, 'Hi world!', 3, 3, false, 0);
		state.applyToTextArea('test', textArea, false);

		assert.equal(textArea._value, 'Hi world!');
		assert.equal(textArea._selectionStart, 9);
		assert.equal(textArea._selectionEnd, 9);

		state = new IENarratorTextAreaState(null, 'Hi world!', 0, 2, false, 0);
		state.applyToTextArea('test', textArea, true);

		assert.equal(textArea._value, 'Hi world!');
		assert.equal(textArea._selectionStart, 0);
		assert.equal(textArea._selectionEnd, 2);

		textArea.dispose();
	});

	function testDeduceInput(prevState: TextAreaState, value: string, selectionStart: number, selectionEnd: number, isInOverwriteMode: boolean, expected: string, expectedCharReplaceCnt: number): void {
		let textArea = new MockTextAreaWrapper();
		textArea._value = value;
		textArea._selectionStart = selectionStart;
		textArea._selectionEnd = selectionEnd;
		textArea._isInOverwriteMode = isInOverwriteMode;

		let newState = (prevState || IENarratorTextAreaState.EMPTY).fromTextArea(textArea);

		let actual = newState.deduceInput();

		assert.equal(actual.text, expected);
		assert.equal(actual.replaceCharCnt, expectedCharReplaceCnt);

		textArea.dispose();
	}

	test('deduceInput - Japanese typing sennsei and accepting', () => {
		// manual test:
		// - choose keyboard layout: Japanese -> Hiragama
		// - type sennsei
		// - accept with Enter
		// - expected: せんせい

		// s
		// PREVIOUS STATE: [ <>, selectionStart: 0, selectionEnd: 0, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <ｓ>, selectionStart: 0, selectionEnd: 1, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, '', 0, 0, false, 0),
			'ｓ',
			0, 1, false,
			'ｓ', 0
		);

		// e
		// PREVIOUS STATE: [ <ｓ>, selectionStart: 0, selectionEnd: 1, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せ>, selectionStart: 0, selectionEnd: 1, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'ｓ', 0, 1, false, 0),
			'せ',
			0, 1, false,
			'せ', 1
		);

		// n
		// PREVIOUS STATE: [ <せ>, selectionStart: 0, selectionEnd: 1, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せｎ>, selectionStart: 0, selectionEnd: 2, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せ', 0, 1, false, 0),
			'せｎ',
			0, 2, false,
			'せｎ', 1
		);

		// n
		// PREVIOUS STATE: [ <せｎ>, selectionStart: 0, selectionEnd: 2, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せん>, selectionStart: 0, selectionEnd: 2, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せｎ', 0, 2, false, 0),
			'せん',
			0, 2, false,
			'せん', 2
		);

		// s
		// PREVIOUS STATE: [ <せん>, selectionStart: 0, selectionEnd: 2, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せんｓ>, selectionStart: 0, selectionEnd: 3, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せん', 0, 2, false, 0),
			'せんｓ',
			0, 3, false,
			'せんｓ', 2
		);

		// e
		// PREVIOUS STATE: [ <せんｓ>, selectionStart: 0, selectionEnd: 3, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せんせ>, selectionStart: 0, selectionEnd: 3, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せんｓ', 0, 3, false, 0),
			'せんせ',
			0, 3, false,
			'せんせ', 3
		);

		// no-op? [was recorded]
		// PREVIOUS STATE: [ <せんせ>, selectionStart: 0, selectionEnd: 3, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せんせ>, selectionStart: 0, selectionEnd: 3, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せんせ', 0, 3, false, 0),
			'せんせ',
			0, 3, false,
			'せんせ', 3
		);

		// i
		// PREVIOUS STATE: [ <せんせ>, selectionStart: 0, selectionEnd: 3, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せんせい>, selectionStart: 0, selectionEnd: 4, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せんせ', 0, 3, false, 0),
			'せんせい',
			0, 4, false,
			'せんせい', 3
		);

		// ENTER (accept)
		// PREVIOUS STATE: [ <せんせい>, selectionStart: 0, selectionEnd: 4, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せんせい>, selectionStart: 4, selectionEnd: 4, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せんせい', 0, 4, false, 0),
			'せんせい',
			4, 4, false,
			'', 0
		);
	});

	test('deduceInput - Japanese typing sennsei and choosing different suggestion', () => {
		// manual test:
		// - choose keyboard layout: Japanese -> Hiragama
		// - type sennsei
		// - arrow down (choose next suggestion)
		// - accept with Enter
		// - expected: せんせい

		// sennsei
		// PREVIOUS STATE: [ <せんせい>, selectionStart: 0, selectionEnd: 4, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <せんせい>, selectionStart: 0, selectionEnd: 4, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せんせい', 0, 4, false, 0),
			'せんせい',
			0, 4, false,
			'せんせい', 4
		);

		// arrow down
		// CURRENT STATE: [ <先生>, selectionStart: 0, selectionEnd: 2, isInOverwriteMode: false, selectionToken: 0]
		// PREVIOUS STATE: [ <せんせい>, selectionStart: 0, selectionEnd: 4, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, 'せんせい', 0, 4, false, 0),
			'先生',
			0, 2, false,
			'先生', 4
		);

		// ENTER (accept)
		// PREVIOUS STATE: [ <先生>, selectionStart: 0, selectionEnd: 2, isInOverwriteMode: false, selectionToken: 0]
		// CURRENT STATE: [ <先生>, selectionStart: 2, selectionEnd: 2, isInOverwriteMode: false, selectionToken: 0]
		testDeduceInput(
			new IENarratorTextAreaState(null, '先生', 0, 2, false, 0),
			'先生',
			2, 2, false,
			'', 0
		);
	});

	test('extractNewText - no previous state with selection', () => {
		testDeduceInput(
			null,
			'a',
			0, 1, false,
			'a', 0
		);
	});

	test('issue #2586: Replacing selected end-of-line with newline locks up the document', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, ']\n', 1, 2, false, 0),
			']\n',
			2, 2, false,
			'\n', 0
		);
	});

	test('extractNewText - no previous state without selection', () => {
		testDeduceInput(
			null,
			'a',
			1, 1, false,
			'a', 0
		);
	});

	test('extractNewText - typing does not cause a selection', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, '', 0, 0, false, 0),
			'a',
			0, 1, false,
			'a', 0
		);
	});

	test('extractNewText - had the textarea empty', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, '', 0, 0, false, 0),
			'a',
			1, 1, false,
			'a', 0
		);
	});

	test('extractNewText - had the entire line selected', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 0, 12, false, 0),
			'H',
			1, 1, false,
			'H', 0
		);
	});

	test('extractNewText - had previous text 1', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 12, 12, false, 0),
			'Hello world!a',
			13, 13, false,
			'a', 0
		);
	});

	test('extractNewText - had previous text 2', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 0, 0, false, 0),
			'aHello world!',
			1, 1, false,
			'a', 0
		);
	});

	test('extractNewText - had previous text 3', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 6, 11, false, 0),
			'Hello other!',
			11, 11, false,
			'other', 0
		);
	});

	test('extractNewText - IME', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, '', 0, 0, false, 0),
			'これは',
			3, 3, false,
			'これは', 0
		);
	});

	test('extractNewText - isInOverwriteMode', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 0, 0, false, 0),
			'Aello world!',
			1, 1, true,
			'A', 0
		);
	});

	test('extractMacReplacedText - does nothing if there is selection', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 5, 5, false, 0),
			'Hellö world!',
			4, 5, false,
			'ö', 0
		);
	});

	test('extractMacReplacedText - does nothing if there is more than one extra char', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 5, 5, false, 0),
			'Hellöö world!',
			5, 5, false,
			'öö', 1
		);
	});

	test('extractMacReplacedText - does nothing if there is more than one changed char', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 5, 5, false, 0),
			'Helöö world!',
			5, 5, false,
			'öö', 2
		);
	});

	test('extractMacReplacedText', () => {
		testDeduceInput(
			new IENarratorTextAreaState(null, 'Hello world!', 5, 5, false, 0),
			'Hellö world!',
			5, 5, false,
			'ö', 1
		);
	});

	function testFromEditorSelectionAndPreviousState(eol: string, lines: string[], range: Range, prevSelectionToken: number): TextAreaState {
		let model = new SimpleModel(lines, eol);
		let previousState = new IENarratorTextAreaState(null, '', 0, 0, false, prevSelectionToken);
		return previousState.fromEditorSelection(model, range);
	}

	test('fromEditorSelectionAndPreviousState - no selection on first line', () => {
		let actual = testFromEditorSelectionAndPreviousState('\n', [
			'Just a line',
			'And another line'
		], new Range(1, 1, 1, 1), 0);
		assertTextAreaState(actual, 'Just a line', 0, 11, false, 1);
	});

	test('fromEditorSelectionAndPreviousState - no selection on second line', () => {
		let actual = testFromEditorSelectionAndPreviousState('\n', [
			'Just a line',
			'And another line',
			'And yet another line',
		], new Range(2, 1, 2, 1), 0);
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
		], new Range(2, 500, 2, 500), 0);
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
		], new Range(2, 500, 2, 500), 2);
		assertTextAreaState(actual, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 100, 100, false, 2);
	});
});

class SimpleModel implements ISimpleModel {

	private _lines: string[];
	private _eol: string;

	constructor(lines: string[], eol: string) {
		this._lines = lines;
		this._eol = eol;
	}

	public getLineMaxColumn(lineNumber: number): number {
		return this._lines[lineNumber - 1].length + 1;
	}

	private _getEndOfLine(eol: EndOfLinePreference): string {
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

	public getEOL(): string {
		return this._eol;
	}

	public getValueInRange(range: Range, eol: EndOfLinePreference): string {
		if (Range.isEmpty(range)) {
			return '';
		}

		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		var lineEnding = this._getEndOfLine(eol),
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public getModelLineContent(lineNumber: number): string {
		return this._lines[lineNumber - 1];
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public convertViewPositionToModelPosition(viewLineNumber: number, viewColumn: number): Position {
		return new Position(viewLineNumber, viewColumn);
	}
}
