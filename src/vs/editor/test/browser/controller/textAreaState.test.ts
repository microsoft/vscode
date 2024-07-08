/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ITextAreaWrapper, PagedScreenReaderStrategy, TextAreaState } from 'vs/editor/browser/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { createTextModel } from 'vs/editor/test/common/testTextModel';

class MockTextAreaWrapper extends Disposable implements ITextAreaWrapper {

	public _value: string;
	public _selectionStart: number;
	public _selectionEnd: number;

	constructor() {
		super();
		this._value = '';
		this._selectionStart = 0;
		this._selectionEnd = 0;
	}

	public getValue(): string {
		return this._value;
	}

	public setValue(reason: string, value: string): void {
		this._value = value;
		this._selectionStart = this._value.length;
		this._selectionEnd = this._value.length;
	}

	public getSelectionStart(): number {
		return this._selectionStart;
	}

	public getSelectionEnd(): number {
		return this._selectionEnd;
	}

	public setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {
		if (selectionStart < 0) {
			selectionStart = 0;
		}
		if (selectionStart > this._value.length) {
			selectionStart = this._value.length;
		}
		if (selectionEnd < 0) {
			selectionEnd = 0;
		}
		if (selectionEnd > this._value.length) {
			selectionEnd = this._value.length;
		}
		this._selectionStart = selectionStart;
		this._selectionEnd = selectionEnd;
	}
}

function equalsTextAreaState(a: TextAreaState, b: TextAreaState): boolean {
	return (
		a.value === b.value
		&& a.selectionStart === b.selectionStart
		&& a.selectionEnd === b.selectionEnd
		&& Range.equalsRange(a.selection, b.selection)
		&& a.newlineCountBeforeSelection === b.newlineCountBeforeSelection
	);
}

suite('TextAreaState', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function assertTextAreaState(actual: TextAreaState, value: string, selectionStart: number, selectionEnd: number): void {
		const desired = new TextAreaState(value, selectionStart, selectionEnd, null, undefined);
		assert.ok(equalsTextAreaState(desired, actual), desired.toString() + ' == ' + actual.toString());
	}

	test('fromTextArea', () => {
		const textArea = new MockTextAreaWrapper();
		textArea._value = 'Hello world!';
		textArea._selectionStart = 1;
		textArea._selectionEnd = 12;
		let actual = TextAreaState.readFromTextArea(textArea, null);

		assertTextAreaState(actual, 'Hello world!', 1, 12);
		assert.strictEqual(actual.value, 'Hello world!');
		assert.strictEqual(actual.selectionStart, 1);

		actual = actual.collapseSelection();
		assertTextAreaState(actual, 'Hello world!', 12, 12);

		textArea.dispose();
	});

	test('applyToTextArea', () => {
		const textArea = new MockTextAreaWrapper();
		textArea._value = 'Hello world!';
		textArea._selectionStart = 1;
		textArea._selectionEnd = 12;

		let state = new TextAreaState('Hi world!', 2, 2, null, undefined);
		state.writeToTextArea('test', textArea, false);

		assert.strictEqual(textArea._value, 'Hi world!');
		assert.strictEqual(textArea._selectionStart, 9);
		assert.strictEqual(textArea._selectionEnd, 9);

		state = new TextAreaState('Hi world!', 3, 3, null, undefined);
		state.writeToTextArea('test', textArea, false);

		assert.strictEqual(textArea._value, 'Hi world!');
		assert.strictEqual(textArea._selectionStart, 9);
		assert.strictEqual(textArea._selectionEnd, 9);

		state = new TextAreaState('Hi world!', 0, 2, null, undefined);
		state.writeToTextArea('test', textArea, true);

		assert.strictEqual(textArea._value, 'Hi world!');
		assert.strictEqual(textArea._selectionStart, 0);
		assert.strictEqual(textArea._selectionEnd, 2);

		textArea.dispose();
	});

	function testDeduceInput(prevState: TextAreaState | null, value: string, selectionStart: number, selectionEnd: number, couldBeEmojiInput: boolean, expected: string, expectedCharReplaceCnt: number): void {
		prevState = prevState || TextAreaState.EMPTY;

		const textArea = new MockTextAreaWrapper();
		textArea._value = value;
		textArea._selectionStart = selectionStart;
		textArea._selectionEnd = selectionEnd;

		const newState = TextAreaState.readFromTextArea(textArea, null);
		const actual = TextAreaState.deduceInput(prevState, newState, couldBeEmojiInput);

		assert.deepStrictEqual(actual, {
			text: expected,
			replacePrevCharCnt: expectedCharReplaceCnt,
			replaceNextCharCnt: 0,
			positionDelta: 0,
		});

		textArea.dispose();
	}

	test('extractNewText - no previous state with selection', () => {
		testDeduceInput(
			null,
			'a',
			0, 1, true,
			'a', 0
		);
	});

	test('issue #2586: Replacing selected end-of-line with newline locks up the document', () => {
		testDeduceInput(
			new TextAreaState(']\n', 1, 2, null, undefined),
			']\n',
			2, 2, true,
			'\n', 0
		);
	});

	test('extractNewText - no previous state without selection', () => {
		testDeduceInput(
			null,
			'a',
			1, 1, true,
			'a', 0
		);
	});

	test('extractNewText - typing does not cause a selection', () => {
		testDeduceInput(
			TextAreaState.EMPTY,
			'a',
			0, 1, true,
			'a', 0
		);
	});

	test('extractNewText - had the textarea empty', () => {
		testDeduceInput(
			TextAreaState.EMPTY,
			'a',
			1, 1, true,
			'a', 0
		);
	});

	test('extractNewText - had the entire line selected', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 0, 12, null, undefined),
			'H',
			1, 1, true,
			'H', 0
		);
	});

	test('extractNewText - had previous text 1', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 12, 12, null, undefined),
			'Hello world!a',
			13, 13, true,
			'a', 0
		);
	});

	test('extractNewText - had previous text 2', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 0, 0, null, undefined),
			'aHello world!',
			1, 1, true,
			'a', 0
		);
	});

	test('extractNewText - had previous text 3', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 6, 11, null, undefined),
			'Hello other!',
			11, 11, true,
			'other', 0
		);
	});

	test('extractNewText - IME', () => {
		testDeduceInput(
			TextAreaState.EMPTY,
			'これは',
			3, 3, true,
			'これは', 0
		);
	});

	test('extractNewText - isInOverwriteMode', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 0, 0, null, undefined),
			'Aello world!',
			1, 1, true,
			'A', 0
		);
	});

	test('extractMacReplacedText - does nothing if there is selection', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 5, 5, null, undefined),
			'Hellö world!',
			4, 5, true,
			'ö', 0
		);
	});

	test('extractMacReplacedText - does nothing if there is more than one extra char', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 5, 5, null, undefined),
			'Hellöö world!',
			5, 5, true,
			'öö', 1
		);
	});

	test('extractMacReplacedText - does nothing if there is more than one changed char', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 5, 5, null, undefined),
			'Helöö world!',
			5, 5, true,
			'öö', 2
		);
	});

	test('extractMacReplacedText', () => {
		testDeduceInput(
			new TextAreaState('Hello world!', 5, 5, null, undefined),
			'Hellö world!',
			5, 5, true,
			'ö', 1
		);
	});

	test('issue #25101 - First key press ignored', () => {
		testDeduceInput(
			new TextAreaState('a', 0, 1, null, undefined),
			'a',
			1, 1, true,
			'a', 0
		);
	});

	test('issue #16520 - Cmd-d of single character followed by typing same character as has no effect', () => {
		testDeduceInput(
			new TextAreaState('x x', 0, 1, null, undefined),
			'x x',
			1, 1, true,
			'x', 0
		);
	});

	function testDeduceAndroidCompositionInput(
		prevState: TextAreaState | null,
		value: string, selectionStart: number, selectionEnd: number,
		expected: string, expectedReplacePrevCharCnt: number, expectedReplaceNextCharCnt: number, expectedPositionDelta: number): void {
		prevState = prevState || TextAreaState.EMPTY;

		const textArea = new MockTextAreaWrapper();
		textArea._value = value;
		textArea._selectionStart = selectionStart;
		textArea._selectionEnd = selectionEnd;

		const newState = TextAreaState.readFromTextArea(textArea, null);
		const actual = TextAreaState.deduceAndroidCompositionInput(prevState, newState);

		assert.deepStrictEqual(actual, {
			text: expected,
			replacePrevCharCnt: expectedReplacePrevCharCnt,
			replaceNextCharCnt: expectedReplaceNextCharCnt,
			positionDelta: expectedPositionDelta,
		});

		textArea.dispose();
	}

	test('Android composition input 1', () => {
		testDeduceAndroidCompositionInput(
			new TextAreaState('Microsoft', 4, 4, null, undefined),
			'Microsoft',
			4, 4,
			'', 0, 0, 0,
		);
	});

	test('Android composition input 2', () => {
		testDeduceAndroidCompositionInput(
			new TextAreaState('Microsoft', 4, 4, null, undefined),
			'Microsoft',
			0, 9,
			'', 0, 0, 5,
		);
	});

	test('Android composition input 3', () => {
		testDeduceAndroidCompositionInput(
			new TextAreaState('Microsoft', 0, 9, null, undefined),
			'Microsoft\'s',
			11, 11,
			'\'s', 0, 0, 0,
		);
	});

	test('Android backspace', () => {
		testDeduceAndroidCompositionInput(
			new TextAreaState('undefinedVariable', 2, 2, null, undefined),
			'udefinedVariable',
			1, 1,
			'', 1, 0, 0,
		);
	});

	suite('PagedScreenReaderStrategy', () => {

		function testPagedScreenReaderStrategy(lines: string[], selection: Selection, expected: TextAreaState): void {
			const model = createTextModel(lines.join('\n'));
			const actual = PagedScreenReaderStrategy.fromEditorSelection(model, selection, 10, true);
			assert.ok(equalsTextAreaState(actual, expected));
			model.dispose();
		}

		test('simple', () => {
			testPagedScreenReaderStrategy(
				[
					'Hello world!'
				],
				new Selection(1, 13, 1, 13),
				new TextAreaState('Hello world!', 12, 12, new Range(1, 13, 1, 13), 0)
			);

			testPagedScreenReaderStrategy(
				[
					'Hello world!'
				],
				new Selection(1, 1, 1, 1),
				new TextAreaState('Hello world!', 0, 0, new Range(1, 1, 1, 1), 0)
			);

			testPagedScreenReaderStrategy(
				[
					'Hello world!'
				],
				new Selection(1, 1, 1, 6),
				new TextAreaState('Hello world!', 0, 5, new Range(1, 1, 1, 6), 0)
			);
		});

		test('multiline', () => {
			testPagedScreenReaderStrategy(
				[
					'Hello world!',
					'How are you?'
				],
				new Selection(1, 1, 1, 1),
				new TextAreaState('Hello world!\nHow are you?', 0, 0, new Range(1, 1, 1, 1), 0)
			);

			testPagedScreenReaderStrategy(
				[
					'Hello world!',
					'How are you?'
				],
				new Selection(2, 1, 2, 1),
				new TextAreaState('Hello world!\nHow are you?', 13, 13, new Range(2, 1, 2, 1), 1)
			);
		});

		test('page', () => {
			testPagedScreenReaderStrategy(
				[
					'L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21'
				],
				new Selection(1, 1, 1, 1),
				new TextAreaState('L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\n', 0, 0, new Range(1, 1, 1, 1), 0)
			);

			testPagedScreenReaderStrategy(
				[
					'L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21'
				],
				new Selection(11, 1, 11, 1),
				new TextAreaState('L11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\n', 0, 0, new Range(11, 1, 11, 1), 0)
			);

			testPagedScreenReaderStrategy(
				[
					'L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21'
				],
				new Selection(12, 1, 12, 1),
				new TextAreaState('L11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\n', 4, 4, new Range(12, 1, 12, 1), 1)
			);

			testPagedScreenReaderStrategy(
				[
					'L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21'
				],
				new Selection(21, 1, 21, 1),
				new TextAreaState('L21', 0, 0, new Range(21, 1, 21, 1), 0)
			);
		});

	});
});
