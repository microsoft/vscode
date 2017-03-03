/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference, EndOfLineSequence, IIdentifiedSingleEditOperation, IModelContentChangedEvent2 } from 'vs/editor/common/editorCommon';
import { EditableTextModel, IValidatedEditOperation } from 'vs/editor/common/model/editableTextModel';
import { MirrorModel2 } from 'vs/editor/common/model/mirrorModel2';
import { assertSyncedModels, testApplyEditsWithSyncedModels } from 'vs/editor/test/common/model/editableTextModelTestUtils';

suite('EditorModel - EditableTextModel._getInverseEdits', () => {

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, rangeLength: number, text: string[]): IValidatedEditOperation {
		return {
			sortIndex: 0,
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			rangeLength: rangeLength,
			lines: text,
			forceMoveMarkers: false,
			isAutoWhitespaceEdit: false
		};
	}

	function inverseEditOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number): Range {
		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}

	function assertInverseEdits(ops: IValidatedEditOperation[], expected: Range[]): void {
		var actual = EditableTextModel._getInverseEditRanges(ops);
		assert.deepEqual(actual, expected);
	}

	test('single insert', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, 0, ['hello'])
			],
			[
				inverseEditOp(1, 1, 1, 6)
			]
		);
	});

	test('Bug 19872: Undo is funky', () => {
		assertInverseEdits(
			[
				editOp(2, 1, 2, 2, 0, ['']),
				editOp(3, 1, 4, 2, 0, [''])
			],
			[
				inverseEditOp(2, 1, 2, 1),
				inverseEditOp(3, 1, 3, 1)
			]
		);
	});

	test('two single unrelated inserts', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, 0, ['hello']),
				editOp(2, 1, 2, 1, 0, ['world'])
			],
			[
				inverseEditOp(1, 1, 1, 6),
				inverseEditOp(2, 1, 2, 6)
			]
		);
	});

	test('two single inserts 1', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, 0, ['hello']),
				editOp(1, 2, 1, 2, 0, ['world'])
			],
			[
				inverseEditOp(1, 1, 1, 6),
				inverseEditOp(1, 7, 1, 12)
			]
		);
	});

	test('two single inserts 2', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, 0, ['hello']),
				editOp(1, 4, 1, 4, 0, ['world'])
			],
			[
				inverseEditOp(1, 1, 1, 6),
				inverseEditOp(1, 9, 1, 14)
			]
		);
	});

	test('multiline insert', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, 0, ['hello', 'world'])
			],
			[
				inverseEditOp(1, 1, 2, 6)
			]
		);
	});

	test('two unrelated multiline inserts', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, 0, ['hello', 'world']),
				editOp(2, 1, 2, 1, 0, ['how', 'are', 'you?']),
			],
			[
				inverseEditOp(1, 1, 2, 6),
				inverseEditOp(3, 1, 5, 5),
			]
		);
	});

	test('two multiline inserts 1', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, 0, ['hello', 'world']),
				editOp(1, 2, 1, 2, 0, ['how', 'are', 'you?']),
			],
			[
				inverseEditOp(1, 1, 2, 6),
				inverseEditOp(2, 7, 4, 5),
			]
		);
	});

	test('single delete', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, 0, null)
			],
			[
				inverseEditOp(1, 1, 1, 1)
			]
		);
	});

	test('two single unrelated deletes', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, 0, null),
				editOp(2, 1, 2, 6, 0, null)
			],
			[
				inverseEditOp(1, 1, 1, 1),
				inverseEditOp(2, 1, 2, 1)
			]
		);
	});

	test('two single deletes 1', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, 0, null),
				editOp(1, 7, 1, 12, 0, null)
			],
			[
				inverseEditOp(1, 1, 1, 1),
				inverseEditOp(1, 2, 1, 2)
			]
		);
	});

	test('two single deletes 2', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, 0, null),
				editOp(1, 9, 1, 14, 0, null)
			],
			[
				inverseEditOp(1, 1, 1, 1),
				inverseEditOp(1, 4, 1, 4)
			]
		);
	});

	test('multiline delete', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 2, 6, 0, null)
			],
			[
				inverseEditOp(1, 1, 1, 1)
			]
		);
	});

	test('two unrelated multiline deletes', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 2, 6, 0, null),
				editOp(3, 1, 5, 5, 0, null),
			],
			[
				inverseEditOp(1, 1, 1, 1),
				inverseEditOp(2, 1, 2, 1),
			]
		);
	});

	test('two multiline deletes 1', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 2, 6, 0, null),
				editOp(2, 7, 4, 5, 0, null),
			],
			[
				inverseEditOp(1, 1, 1, 1),
				inverseEditOp(1, 2, 1, 2),
			]
		);
	});

	test('single replace', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, 0, ['Hello world'])
			],
			[
				inverseEditOp(1, 1, 1, 12)
			]
		);
	});

	test('two replaces', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, 0, ['Hello world']),
				editOp(1, 7, 1, 8, 0, ['How are you?']),
			],
			[
				inverseEditOp(1, 1, 1, 12),
				inverseEditOp(1, 13, 1, 25)
			]
		);
	});

	test('many edits', () => {
		assertInverseEdits(
			[
				editOp(1, 2, 1, 2, 0, ['', '  ']),
				editOp(1, 5, 1, 6, 0, ['']),
				editOp(1, 9, 1, 9, 0, ['', ''])
			],
			[
				inverseEditOp(1, 2, 2, 3),
				inverseEditOp(2, 6, 2, 6),
				inverseEditOp(2, 9, 3, 1)
			]
		);
	});
});

suite('EditorModel - EditableTextModel._toSingleEditOperation', () => {

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, rangeLength: number, text: string[]): IValidatedEditOperation {
		return {
			sortIndex: 0,
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			rangeLength: rangeLength,
			lines: text,
			forceMoveMarkers: false,
			isAutoWhitespaceEdit: false
		};
	}

	function testSimpleApplyEdits(original: string[], edits: IValidatedEditOperation[], expected: IValidatedEditOperation): void {
		let model = EditableTextModel.createFromString(original.join('\n'));
		model.setEOL(EndOfLineSequence.LF);

		let actual = model._toSingleEditOperation(edits);
		assert.deepEqual(actual, expected);

		model.dispose();
	}

	test('one edit op is unchanged', () => {
		testSimpleApplyEdits(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, 0, [' new line', 'No longer'])
			],
			editOp(1, 3, 1, 3, 0, [' new line', 'No longer'])
		);
	});

	test('two edits on one line', () => {
		testSimpleApplyEdits([
			'My First Line',
			'\t\tMy Second Line',
			'    Third Line',
			'',
			'1'
		], [
				editOp(1, 1, 1, 3, 0, ['Your']),
				editOp(1, 4, 1, 4, 0, ['Interesting ']),
				editOp(2, 3, 2, 6, 0, null)
			],
			editOp(1, 1, 2, 6, 19, [
				'Your Interesting First Line',
				'\t\t'
			]));
	});

	test('insert multiple newlines', () => {
		testSimpleApplyEdits(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, 0, ['', '', '', '', '']),
				editOp(3, 15, 3, 15, 0, ['a', 'b'])
			],
			editOp(1, 3, 3, 15, 43, [
				'',
				'',
				'',
				'',
				' First Line',
				'\t\tMy Second Line',
				'    Third Linea',
				'b'
			])
		);
	});

	test('delete empty text', () => {
		testSimpleApplyEdits(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, 0, [''])
			],
			editOp(1, 1, 1, 1, 0, [''])
		);
	});

	test('two unrelated edits', () => {
		testSimpleApplyEdits(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			[
				editOp(2, 1, 2, 3, 0, ['\t']),
				editOp(3, 1, 3, 5, 0, [''])
			],
			editOp(2, 1, 3, 5, 21, ['\tMy Second Line', ''])
		);
	});

	test('many edits', () => {
		testSimpleApplyEdits(
			[
				'{"x" : 1}'
			],
			[
				editOp(1, 2, 1, 2, 0, ['\n  ']),
				editOp(1, 5, 1, 6, 0, ['']),
				editOp(1, 9, 1, 9, 0, ['\n'])
			],
			editOp(1, 2, 1, 9, 7, [
				'',
				'  "x": 1',
				''
			])
		);
	});

	test('many edits reversed', () => {
		testSimpleApplyEdits(
			[
				'{',
				'  "x": 1',
				'}'
			],
			[
				editOp(1, 2, 2, 3, 0, ['']),
				editOp(2, 6, 2, 6, 0, [' ']),
				editOp(2, 9, 3, 1, 0, [''])
			],
			editOp(1, 2, 3, 1, 10, ['"x" : 1'])
		);
	});

	test('replacing newlines 1', () => {
		testSimpleApplyEdits(
			[
				'{',
				'"a": true,',
				'',
				'"b": true',
				'}'
			],
			[
				editOp(1, 2, 2, 1, 0, ['', '\t']),
				editOp(2, 11, 4, 1, 0, ['', '\t'])
			],
			editOp(1, 2, 4, 1, 13, [
				'',
				'\t"a": true,',
				'\t'
			])
		);
	});

	test('replacing newlines 2', () => {
		testSimpleApplyEdits(
			[
				'some text',
				'some more text',
				'now comes an empty line',
				'',
				'after empty line',
				'and the last line'
			],
			[
				editOp(1, 5, 3, 1, 0, [' text', 'some more text', 'some more text']),
				editOp(3, 2, 4, 1, 0, ['o more lines', 'asd', 'asd', 'asd']),
				editOp(5, 1, 5, 6, 0, ['zzzzzzzz']),
				editOp(5, 11, 6, 16, 0, ['1', '2', '3', '4'])
			],
			editOp(1, 5, 6, 16, 78, [
				' text',
				'some more text',
				'some more textno more lines',
				'asd',
				'asd',
				'asd',
				'zzzzzzzz empt1',
				'2',
				'3',
				'4'
			])
		);
	});

	test('advanced', () => {
		testSimpleApplyEdits(
			[
				' {       "d": [',
				'             null',
				'        ] /*comment*/',
				'        ,"e": /*comment*/ [null] }',
			],
			[
				editOp(1, 1, 1, 2, 0, ['']),
				editOp(1, 3, 1, 10, 0, ['', '  ']),
				editOp(1, 16, 2, 14, 0, ['', '    ']),
				editOp(2, 18, 3, 9, 0, ['', '  ']),
				editOp(3, 22, 4, 9, 0, ['']),
				editOp(4, 10, 4, 10, 0, ['', '  ']),
				editOp(4, 28, 4, 28, 0, ['', '    ']),
				editOp(4, 32, 4, 32, 0, ['', '  ']),
				editOp(4, 33, 4, 34, 0, ['', ''])
			],
			editOp(1, 1, 4, 34, 89, [
				'{',
				'  "d": [',
				'    null',
				'  ] /*comment*/,',
				'  "e": /*comment*/ [',
				'    null',
				'  ]',
				''
			])
		);
	});

	test('advanced simplified', () => {
		testSimpleApplyEdits(
			[
				'   abc',
				' ,def'
			],
			[
				editOp(1, 1, 1, 4, 0, ['']),
				editOp(1, 7, 2, 2, 0, ['']),
				editOp(2, 3, 2, 3, 0, ['', ''])
			],
			editOp(1, 1, 2, 3, 9, [
				'abc,',
				''
			])
		);
	});
});

suite('EditorModel - EditableTextModel.applyEdits updates mightContainRTL', () => {

	function testApplyEdits(original: string[], edits: IIdentifiedSingleEditOperation[], before: boolean, after: boolean): void {
		let model = EditableTextModel.createFromString(original.join('\n'));
		model.setEOL(EndOfLineSequence.LF);

		assert.equal(model.mightContainRTL(), before);

		model.applyEdits(edits);
		assert.equal(model.mightContainRTL(), after);
		model.dispose();
	}

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text: string[]): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			text: text.join('\n'),
			forceMoveMarkers: false
		};
	}

	test('start with RTL, insert LTR', () => {
		testApplyEdits(['Hello,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 1, 1, ['hello'])], true, true);
	});

	test('start with RTL, delete RTL', () => {
		testApplyEdits(['Hello,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 10, 10, [''])], true, true);
	});

	test('start with RTL, insert RTL', () => {
		testApplyEdits(['Hello,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 1, 1, ['هناك حقيقة مثبتة منذ زمن طويل'])], true, true);
	});

	test('start with LTR, insert LTR', () => {
		testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['hello'])], false, false);
	});

	test('start with LTR, insert RTL 1', () => {
		testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['هناك حقيقة مثبتة منذ زمن طويل'])], false, true);
	});

	test('start with LTR, insert RTL 2', () => {
		testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['זוהי עובדה מבוססת שדעתו'])], false, true);
	});
});


suite('EditorModel - EditableTextModel.applyEdits updates mightContainNonBasicASCII', () => {

	function testApplyEdits(original: string[], edits: IIdentifiedSingleEditOperation[], before: boolean, after: boolean): void {
		let model = EditableTextModel.createFromString(original.join('\n'));
		model.setEOL(EndOfLineSequence.LF);

		assert.equal(model.mightContainNonBasicASCII(), before);

		model.applyEdits(edits);
		assert.equal(model.mightContainNonBasicASCII(), after);
		model.dispose();
	}

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text: string[]): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			text: text.join('\n'),
			forceMoveMarkers: false
		};
	}

	test('start with NON-ASCII, insert ASCII', () => {
		testApplyEdits(['Hello,\nZürich'], [editOp(1, 1, 1, 1, ['hello', 'second line'])], true, true);
	});

	test('start with NON-ASCII, delete NON-ASCII', () => {
		testApplyEdits(['Hello,\nZürich'], [editOp(1, 1, 10, 10, [''])], true, true);
	});

	test('start with NON-ASCII, insert NON-ASCII', () => {
		testApplyEdits(['Hello,\nZürich'], [editOp(1, 1, 1, 1, ['Zürich'])], true, true);
	});

	test('start with ASCII, insert ASCII', () => {
		testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['hello', 'second line'])], false, false);
	});

	test('start with ASCII, insert NON-ASCII', () => {
		testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['Zürich', 'Zürich'])], false, true);
	});

});

suite('EditorModel - EditableTextModel.applyEdits', () => {

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text: string[]): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			text: text.join('\n'),
			forceMoveMarkers: false
		};
	}

	test('high-low surrogates 1', () => {
		testApplyEditsWithSyncedModels(
			[
				'📚some',
				'very nice',
				'text'
			],
			[
				editOp(1, 2, 1, 2, ['a'])
			],
			[
				'a📚some',
				'very nice',
				'text'
			],
/*inputEditsAreInvalid*/true
		);
	});
	test('high-low surrogates 2', () => {
		testApplyEditsWithSyncedModels(
			[
				'📚some',
				'very nice',
				'text'
			],
			[
				editOp(1, 2, 1, 3, ['a'])
			],
			[
				'asome',
				'very nice',
				'text'
			],
/*inputEditsAreInvalid*/true
		);
	});
	test('high-low surrogates 3', () => {
		testApplyEditsWithSyncedModels(
			[
				'📚some',
				'very nice',
				'text'
			],
			[
				editOp(1, 1, 1, 2, ['a'])
			],
			[
				'asome',
				'very nice',
				'text'
			],
/*inputEditsAreInvalid*/true
		);
	});
	test('high-low surrogates 4', () => {
		testApplyEditsWithSyncedModels(
			[
				'📚some',
				'very nice',
				'text'
			],
			[
				editOp(1, 1, 1, 3, ['a'])
			],
			[
				'asome',
				'very nice',
				'text'
			],
/*inputEditsAreInvalid*/true
		);
	});

	test('Bug 19872: Undo is funky', () => {
		testApplyEditsWithSyncedModels(
			[
				'something',
				' A',
				'',
				' B',
				'something else'
			],
			[
				editOp(2, 1, 2, 2, ['']),
				editOp(3, 1, 4, 2, [''])
			],
			[
				'something',
				'A',
				'B',
				'something else'
			]
		);
	});

	test('Bug 19872: Undo is funky', () => {
		testApplyEditsWithSyncedModels(
			[
				'something',
				'A',
				'B',
				'something else'
			],
			[
				editOp(2, 1, 2, 1, [' ']),
				editOp(3, 1, 3, 1, ['', ' '])
			],
			[
				'something',
				' A',
				'',
				' B',
				'something else'
			]
		);
	});

	test('insert empty text', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, [''])
			],
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('last op is no-op', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(4, 1, 4, 1, [''])
			],
			[
				'y First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('insert text without newline 1', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, ['foo '])
			],
			[
				'foo My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('insert text without newline 2', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, [' foo'])
			],
			[
				'My foo First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('insert one newline', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 4, 1, 4, ['', ''])
			],
			[
				'My ',
				'First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('insert text with one newline', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, [' new line', 'No longer'])
			],
			[
				'My new line',
				'No longer First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('insert text with two newlines', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, [' new line', 'One more line in the middle', 'No longer'])
			],
			[
				'My new line',
				'One more line in the middle',
				'No longer First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('insert text with many newlines', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, ['', '', '', '', ''])
			],
			[
				'My',
				'',
				'',
				'',
				' First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('insert multiple newlines', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, ['', '', '', '', '']),
				editOp(3, 15, 3, 15, ['a', 'b'])
			],
			[
				'My',
				'',
				'',
				'',
				' First Line',
				'\t\tMy Second Line',
				'    Third Linea',
				'b',
				'',
				'1'
			]
		);
	});

	test('delete empty text', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, [''])
			],
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('delete text from one line', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 2, [''])
			],
			[
				'y First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('delete text from one line 2', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 3, ['a'])
			],
			[
				'a First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('delete all text from a line', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 14, [''])
			],
			[
				'',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('delete text from two lines', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 4, 2, 6, [''])
			],
			[
				'My Second Line',
				'    Third Line',
				'',
				'1'
			]
		);
	});

	test('delete text from many lines', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 4, 3, 5, [''])
			],
			[
				'My Third Line',
				'',
				'1'
			]
		);
	});

	test('delete everything', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'1'
			],
			[
				editOp(1, 1, 5, 2, [''])
			],
			[
				''
			]
		);
	});

	test('two unrelated edits', () => {
		testApplyEditsWithSyncedModels(
			[
				'My First Line',
				'\t\tMy Second Line',
				'    Third Line',
				'',
				'123'
			],
			[
				editOp(2, 1, 2, 3, ['\t']),
				editOp(3, 1, 3, 5, [''])
			],
			[
				'My First Line',
				'\tMy Second Line',
				'Third Line',
				'',
				'123'
			]
		);
	});

	test('two edits on one line', () => {
		testApplyEditsWithSyncedModels(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			[
				editOp(5, 3, 5, 7, ['']),
				editOp(5, 12, 5, 16, [''])
			],
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\tfifth\t\t'
			]
		);
	});

	test('many edits', () => {
		testApplyEditsWithSyncedModels(
			[
				'{"x" : 1}'
			],
			[
				editOp(1, 2, 1, 2, ['\n  ']),
				editOp(1, 5, 1, 6, ['']),
				editOp(1, 9, 1, 9, ['\n'])
			],
			[
				'{',
				'  "x": 1',
				'}'
			]
		);
	});

	test('many edits reversed', () => {
		testApplyEditsWithSyncedModels(
			[
				'{',
				'  "x": 1',
				'}'
			],
			[
				editOp(1, 2, 2, 3, ['']),
				editOp(2, 6, 2, 6, [' ']),
				editOp(2, 9, 3, 1, [''])
			],
			[
				'{"x" : 1}'
			]
		);
	});

	test('replacing newlines 1', () => {
		testApplyEditsWithSyncedModels(
			[
				'{',
				'"a": true,',
				'',
				'"b": true',
				'}'
			],
			[
				editOp(1, 2, 2, 1, ['', '\t']),
				editOp(2, 11, 4, 1, ['', '\t'])
			],
			[
				'{',
				'\t"a": true,',
				'\t"b": true',
				'}'
			]
		);
	});

	test('replacing newlines 2', () => {
		testApplyEditsWithSyncedModels(
			[
				'some text',
				'some more text',
				'now comes an empty line',
				'',
				'after empty line',
				'and the last line'
			],
			[
				editOp(1, 5, 3, 1, [' text', 'some more text', 'some more text']),
				editOp(3, 2, 4, 1, ['o more lines', 'asd', 'asd', 'asd']),
				editOp(5, 1, 5, 6, ['zzzzzzzz']),
				editOp(5, 11, 6, 16, ['1', '2', '3', '4'])
			],
			[
				'some text',
				'some more text',
				'some more textno more lines',
				'asd',
				'asd',
				'asd',
				'zzzzzzzz empt1',
				'2',
				'3',
				'4ne'
			]
		);
	});

	test('advanced 1', () => {
		testApplyEditsWithSyncedModels(
			[
				' {       "d": [',
				'             null',
				'        ] /*comment*/',
				'        ,"e": /*comment*/ [null] }',
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 3, 1, 10, ['', '  ']),
				editOp(1, 16, 2, 14, ['', '    ']),
				editOp(2, 18, 3, 9, ['', '  ']),
				editOp(3, 22, 4, 9, ['']),
				editOp(4, 10, 4, 10, ['', '  ']),
				editOp(4, 28, 4, 28, ['', '    ']),
				editOp(4, 32, 4, 32, ['', '  ']),
				editOp(4, 33, 4, 34, ['', ''])
			],
			[
				'{',
				'  "d": [',
				'    null',
				'  ] /*comment*/,',
				'  "e": /*comment*/ [',
				'    null',
				'  ]',
				'}',
			]
		);
	});

	test('advanced simplified', () => {
		testApplyEditsWithSyncedModels(
			[
				'   abc',
				' ,def'
			],
			[
				editOp(1, 1, 1, 4, ['']),
				editOp(1, 7, 2, 2, ['']),
				editOp(2, 3, 2, 3, ['', ''])
			],
			[
				'abc,',
				'def'
			]
		);
	});

	test('issue #144', () => {
		testApplyEditsWithSyncedModels(
			[
				'package caddy',
				'',
				'func main() {',
				'\tfmt.Println("Hello World! :)")',
				'}',
				''
			],
			[
				editOp(1, 1, 6, 1, [
					'package caddy',
					'',
					'import "fmt"',
					'',
					'func main() {',
					'\tfmt.Println("Hello World! :)")',
					'}',
					''
				])
			],
			[
				'package caddy',
				'',
				'import "fmt"',
				'',
				'func main() {',
				'\tfmt.Println("Hello World! :)")',
				'}',
				''
			]
		);
	});

	test('issue #2586 Replacing selected end-of-line with newline locks up the document', () => {
		testApplyEditsWithSyncedModels(
			[
				'something',
				'interesting'
			],
			[
				editOp(1, 10, 2, 1, ['', ''])
			],
			[
				'something',
				'interesting'
			]
		);
	});

	test('issue #3980', () => {
		testApplyEditsWithSyncedModels(
			[
				'class A {',
				'    someProperty = false;',
				'    someMethod() {',
				'    this.someMethod();',
				'    }',
				'}',
			],
			[
				editOp(1, 8, 1, 9, ['', '']),
				editOp(3, 17, 3, 18, ['', '']),
				editOp(3, 18, 3, 18, ['    ']),
				editOp(4, 5, 4, 5, ['    ']),
			],
			[
				'class A',
				'{',
				'    someProperty = false;',
				'    someMethod()',
				'    {',
				'        this.someMethod();',
				'    }',
				'}',
			]
		);
	});

	function testApplyEditsFails(original: string[], edits: IIdentifiedSingleEditOperation[]): void {
		let model = EditableTextModel.createFromString(original.join('\n'));

		let hasThrown = false;
		try {
			model.applyEdits(edits);
		} catch (err) {
			hasThrown = true;
		}
		assert.ok(hasThrown, 'expected model.applyEdits to fail.');

		model.dispose();
	}

	test('touching edits: two inserts at the same position', () => {
		testApplyEditsWithSyncedModels(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 1, ['a']),
				editOp(1, 1, 1, 1, ['b']),
			],
			[
				'abhello world'
			]
		);
	});

	test('touching edits: insert and replace touching', () => {
		testApplyEditsWithSyncedModels(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 1, ['b']),
				editOp(1, 1, 1, 3, ['ab']),
			],
			[
				'babllo world'
			]
		);
	});

	test('overlapping edits: two overlapping replaces', () => {
		testApplyEditsFails(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 2, ['b']),
				editOp(1, 1, 1, 3, ['ab']),
			]
		);
	});

	test('overlapping edits: two overlapping deletes', () => {
		testApplyEditsFails(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 1, 1, 3, ['']),
			]
		);
	});

	test('touching edits: two touching replaces', () => {
		testApplyEditsWithSyncedModels(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 2, ['H']),
				editOp(1, 2, 1, 3, ['E']),
			],
			[
				'HEllo world'
			]
		);
	});

	test('touching edits: two touching deletes', () => {
		testApplyEditsWithSyncedModels(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 2, 1, 3, ['']),
			],
			[
				'llo world'
			]
		);
	});

	test('touching edits: insert and replace', () => {
		testApplyEditsWithSyncedModels(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 1, ['H']),
				editOp(1, 1, 1, 3, ['e']),
			],
			[
				'Hello world'
			]
		);
	});

	test('touching edits: replace and insert', () => {
		testApplyEditsWithSyncedModels(
			[
				'hello world'
			],
			[
				editOp(1, 1, 1, 3, ['H']),
				editOp(1, 3, 1, 3, ['e']),
			],
			[
				'Hello world'
			]
		);
	});

	test('change while emitting events 1', () => {

		assertSyncedModels('Hello', (model, assertMirrorModels) => {
			model.applyEdits([{
				identifier: null,
				range: new Range(1, 6, 1, 6),
				text: ' world!',
				forceMoveMarkers: false
			}]);

			assertMirrorModels();

		}, (model) => {
			var isFirstTime = true;
			model.addBulkListener2((events) => {
				if (!isFirstTime) {
					return;
				}
				isFirstTime = false;

				model.applyEdits([{
					identifier: null,
					range: new Range(1, 13, 1, 13),
					text: ' How are you?',
					forceMoveMarkers: false
				}]);
			});
		});
	});

	test('change while emitting events 2', () => {

		assertSyncedModels('Hello', (model, assertMirrorModels) => {
			model.applyEdits([{
				identifier: null,
				range: new Range(1, 6, 1, 6),
				text: ' world!',
				forceMoveMarkers: false
			}]);

			assertMirrorModels();

		}, (model) => {
			var isFirstTime = true;
			model.onDidChangeContent((e: IModelContentChangedEvent2) => {
				if (!isFirstTime) {
					return;
				}
				isFirstTime = false;

				model.applyEdits([{
					identifier: null,
					range: new Range(1, 13, 1, 13),
					text: ' How are you?',
					forceMoveMarkers: false
				}]);
			});
		});
	});

	test('issue #1580: Changes in line endings are not correctly reflected in the extension host, leading to invalid offsets sent to external refactoring tools', () => {
		let model = EditableTextModel.createFromString('Hello\nWorld!');
		assert.equal(model.getEOL(), '\n');

		let mirrorModel2 = new MirrorModel2(null, model.getLinesContent(), model.getEOL(), model.getVersionId());
		let mirrorModel2PrevVersionId = model.getVersionId();

		model.onDidChangeContent((e: IModelContentChangedEvent2) => {
			let versionId = e.versionId;
			if (versionId < mirrorModel2PrevVersionId) {
				console.warn('Model version id did not advance between edits (2)');
			}
			mirrorModel2PrevVersionId = versionId;
			mirrorModel2.onEvents([e]);
		});

		let assertMirrorModels = () => {
			model._assertLineNumbersOK();
			assert.equal(mirrorModel2.getText(), model.getValue(), 'mirror model 2 text OK');
			assert.equal(mirrorModel2.version, model.getVersionId(), 'mirror model 2 version OK');
		};

		model.setEOL(EndOfLineSequence.CRLF);
		assertMirrorModels();

		model.dispose();
		mirrorModel2.dispose();
	});
});

interface ILightWeightMarker {
	id: string;
	lineNumber: number;
	column: number;
	stickToPreviousCharacter: boolean;
}

suite('EditorModel - EditableTextModel.applyEdits & markers', () => {

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text: string[]): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			text: text.join('\n'),
			forceMoveMarkers: false
		};
	}

	function marker(id: string, lineNumber: number, column: number, stickToPreviousCharacter: boolean): ILightWeightMarker {
		return {
			id: id,
			lineNumber: lineNumber,
			column: column,
			stickToPreviousCharacter: stickToPreviousCharacter
		};
	}

	function toMarkersMap(markers: ILightWeightMarker[]): { [markerId: string]: ILightWeightMarker } {
		var result: { [markerId: string]: ILightWeightMarker } = {};
		markers.forEach(m => {
			result[m.id] = m;
		});
		return result;
	}

	function testApplyEditsAndMarkers(text: string[], markers: ILightWeightMarker[], edits: IIdentifiedSingleEditOperation[], changedMarkers: string[], expectedText: string[], expectedMarkers: ILightWeightMarker[]): void {
		var textStr = text.join('\n');
		var expectedTextStr = expectedText.join('\n');
		var markersMap = toMarkersMap(markers);
		// var expectedMarkersMap = toMarkersMap(expectedMarkers);
		var markerId2ModelMarkerId = Object.create(null);

		var model = EditableTextModel.createFromString(textStr);
		model.setEOL(EndOfLineSequence.LF);

		// Add markers
		markers.forEach((m) => {
			let modelMarkerId = model._addMarker(0, m.lineNumber, m.column, m.stickToPreviousCharacter);
			markerId2ModelMarkerId[m.id] = modelMarkerId;
		});

		// Apply edits & collect inverse edits
		model.applyEdits(edits);
		model._assertLineNumbersOK();

		// Assert edits produced expected result
		assert.deepEqual(model.getValue(EndOfLinePreference.LF), expectedTextStr);

		let actualChangedMarkers: string[] = [];
		for (let i = 0, len = expectedMarkers.length; i < len; i++) {
			let expectedMarker = expectedMarkers[i];
			let initialMarker = markersMap[expectedMarker.id];
			let expectedMarkerModelMarkerId = markerId2ModelMarkerId[expectedMarker.id];
			let actualMarker = model._getMarker(expectedMarkerModelMarkerId);

			if (actualMarker.lineNumber !== initialMarker.lineNumber || actualMarker.column !== initialMarker.column) {
				actualChangedMarkers.push(initialMarker.id);
			}

			assert.equal(actualMarker.lineNumber, expectedMarker.lineNumber, 'marker lineNumber of marker ' + expectedMarker.id);
			assert.equal(actualMarker.column, expectedMarker.column, 'marker column of marker ' + expectedMarker.id);
		}

		changedMarkers.sort();
		actualChangedMarkers.sort();
		assert.deepEqual(actualChangedMarkers, changedMarkers, 'changed markers');

		model.dispose();
	}

	test('no markers changed', () => {
		testApplyEditsAndMarkers(
			[
				'Hello world,',
				'this is a short text',
				'that is used in testing'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 2, 1, false),
				marker('f', 2, 16, true),
				marker('g', 2, 21, true),
				marker('h', 3, 24, false)
			],
			[
				editOp(1, 13, 1, 13, [' how are you?'])
			],
			[],
			[
				'Hello world, how are you?',
				'this is a short text',
				'that is used in testing'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 2, 1, false),
				marker('f', 2, 16, true),
				marker('g', 2, 21, true),
				marker('h', 3, 24, false)
			]
		);
	});

	test('first line changes', () => {
		testApplyEditsAndMarkers(
			[
				'Hello world,',
				'this is a short text',
				'that is used in testing'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 2, 1, false),
				marker('f', 2, 16, true),
				marker('g', 2, 21, true),
				marker('h', 3, 24, false)
			],
			[
				editOp(1, 7, 1, 12, ['friends'])
			],
			[],
			[
				'Hello friends,',
				'this is a short text',
				'that is used in testing'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 2, 1, false),
				marker('f', 2, 16, true),
				marker('g', 2, 21, true),
				marker('h', 3, 24, false)
			]
		);
	});

	test('inserting lines', () => {
		testApplyEditsAndMarkers(
			[
				'Hello world,',
				'this is a short text',
				'that is used in testing'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 2, 1, false),
				marker('f', 2, 16, true),
				marker('g', 2, 21, true),
				marker('h', 3, 24, false)
			],
			[
				editOp(1, 7, 1, 12, ['friends']),
				editOp(1, 13, 1, 13, ['', 'this is an inserted line', 'and another one. By the way,'])
			],
			['e', 'f', 'g', 'h'],
			[
				'Hello friends,',
				'this is an inserted line',
				'and another one. By the way,',
				'this is a short text',
				'that is used in testing'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 4, 1, false),
				marker('f', 4, 16, true),
				marker('g', 4, 21, true),
				marker('h', 5, 24, false)
			]
		);
	});

	test('replacing a lot', () => {
		testApplyEditsAndMarkers(
			[
				'Hello world,',
				'this is a short text',
				'that is used in testing',
				'more lines...',
				'more lines...',
				'more lines...',
				'more lines...'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 2, 1, false),
				marker('f', 2, 16, true),
				marker('g', 2, 21, true),
				marker('h', 3, 24, false),
				marker('i', 5, 1, false),
				marker('j', 6, 1, false),
				marker('k', 7, 14, false),
			],
			[
				editOp(1, 7, 1, 12, ['friends']),
				editOp(1, 13, 1, 13, ['', 'this is an inserted line', 'and another one. By the way,', 'This is another line']),
				editOp(2, 1, 7, 14, ['Some new text here'])
			],
			['e', 'f', 'g', 'h', 'i', 'j', 'k'],
			[
				'Hello friends,',
				'this is an inserted line',
				'and another one. By the way,',
				'This is another line',
				'Some new text here'
			],
			[
				marker('a', 1, 1, true),
				marker('b', 1, 1, false),
				marker('c', 1, 7, false),
				marker('d', 1, 12, true),
				marker('e', 5, 1, false),
				marker('f', 5, 16, true),
				marker('g', 5, 19, true),
				marker('h', 5, 19, false),
				marker('i', 5, 19, false),
				marker('j', 5, 19, false),
				marker('k', 5, 19, false),
			]
		);
	});
});
