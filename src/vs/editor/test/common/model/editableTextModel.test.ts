/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {Range} from 'vs/editor/common/core/range';
import Position = require('vs/editor/common/core/position');
import EditorCommon = require('vs/editor/common/editorCommon');
import {EditableTextModel, IValidatedEditOperation} from 'vs/editor/common/model/editableTextModel';
import {TextModel} from 'vs/editor/common/model/textModel';
import {LineMarker, TextModelWithMarkers} from 'vs/editor/common/model/textModelWithMarkers';
import {ILineMarker} from 'vs/editor/common/model/modelLine';
import {ExtHostDocument} from 'vs/workbench/api/common/extHostDocuments';
import {MirrorModel, IMirrorModelEvents} from 'vs/editor/common/model/mirrorModel';

suite('EditorModel - EditableTextModel._getInverseEdits', () => {

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text:string[]): IValidatedEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			lines: text,
			forceMoveMarkers: false
		};
	}

	function inverseEditOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number): Range {
		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}

	function assertInverseEdits(ops:IValidatedEditOperation[], expected:Range[]): void {
		var actual = EditableTextModel._getInverseEditRanges(EditableTextModel._toDeltaOperations(ops));
		assert.deepEqual(actual, expected);
	}

	test('single insert', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, ['hello'])
			],
			[
				inverseEditOp(1, 1, 1, 6)
			]
		);
	});

	test('Bug 19872: Undo is funky', () => {
		assertInverseEdits(
			[
				editOp(2, 1, 2, 2, ['']),
				editOp(3, 1, 4, 2, [''])
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
				editOp(1, 1, 1, 1, ['hello']),
				editOp(2, 1, 2, 1, ['world'])
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
				editOp(1, 1, 1, 1, ['hello']),
				editOp(1, 2, 1, 2, ['world'])
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
				editOp(1, 1, 1, 1, ['hello']),
				editOp(1, 4, 1, 4, ['world'])
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
				editOp(1, 1, 1, 1, ['hello', 'world'])
			],
			[
				inverseEditOp(1, 1, 2, 6)
			]
		);
	});

	test('two unrelated multiline inserts', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 1, ['hello', 'world']),
				editOp(2, 1, 2, 1, ['how', 'are', 'you?']),
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
				editOp(1, 1, 1, 1, ['hello', 'world']),
				editOp(1, 2, 1, 2, ['how', 'are', 'you?']),
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
				editOp(1, 1, 1, 6, null)
			],
			[
				inverseEditOp(1, 1, 1, 1)
			]
		);
	});

	test('two single unrelated deletes', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, null),
				editOp(2, 1, 2, 6, null)
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
				editOp(1, 1, 1, 6, null),
				editOp(1, 7, 1, 12, null)
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
				editOp(1, 1, 1, 6, null),
				editOp(1, 9, 1, 14, null)
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
				editOp(1, 1, 2, 6, null)
			],
			[
				inverseEditOp(1, 1, 1, 1)
			]
		);
	});

	test('two unrelated multiline deletes', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 2, 6, null),
				editOp(3, 1, 5, 5, null),
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
				editOp(1, 1, 2, 6, null),
				editOp(2, 7, 4, 5, null),
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
				editOp(1, 1, 1, 6, ['Hello world'])
			],
			[
				inverseEditOp(1, 1, 1, 12)
			]
		);
	});

	test('two replaces', () => {
		assertInverseEdits(
			[
				editOp(1, 1, 1, 6, ['Hello world']),
				editOp(1, 7, 1, 8, ['How are you?']),
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
				editOp(1, 2, 1, 2, ['', '  ']),
				editOp(1, 5, 1, 6, ['']),
				editOp(1, 9, 1, 9, ['', ''])
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

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text:string[]): IValidatedEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			lines: text,
			forceMoveMarkers: false
		};
	}

	function testApplyEdits(original:string[], edits:IValidatedEditOperation[], expected:IValidatedEditOperation): void {
		let model = new EditableTextModel([], TextModel.toRawText(original.join('\n')), null);
		model.setEOL(EditorCommon.EndOfLineSequence.LF);

		let actual = model._toSingleEditOperation(edits);
		assert.deepEqual(actual, expected);

		model.dispose();
	}

	test('one edit op is unchanged', () => {
		testApplyEdits(
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
			editOp(1, 3, 1, 3, [' new line', 'No longer'])
		);
	});

	test('two edits on one line', () => {
		testApplyEdits([
			'My First Line',
			'\t\tMy Second Line',
			'    Third Line',
			'',
			'1'
		], [
			editOp(1, 1, 1, 3, ['Your']),
			editOp(1, 4, 1, 4, ['Interesting ']),
			editOp(2, 3, 2, 6, null)
		],
		editOp(1, 1, 2, 6, [
			'Your Interesting First Line',
			'\t\t'
		]));
	});

	test('insert multiple newlines', () => {
		testApplyEdits(
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
			editOp(1, 3, 3, 15, [
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
		testApplyEdits(
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
			editOp(1, 1, 1, 1, [''])
		);
	});

	test('two unrelated edits', () => {
		testApplyEdits(
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
			editOp(2, 1, 3, 5, ['\tMy Second Line', ''])
		);
	});

	test('many edits', () => {
		testApplyEdits(
			[
				'{"x" : 1}'
			],
			[
				editOp(1, 2, 1, 2, ['\n  ']),
				editOp(1, 5, 1, 6, ['']),
				editOp(1, 9, 1, 9, ['\n'])
			],
			editOp(1, 2, 1, 9, [
				'',
				'  "x": 1',
				''
			])
		);
	});

	test('many edits reversed', () => {
		testApplyEdits(
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
			editOp(1, 2, 3, 1, ['"x" : 1'])
		);
	});

	test('replacing newlines 1', () => {
		testApplyEdits(
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
			editOp(1, 2, 4, 1, [
				'',
				'\t"a": true,',
				'\t'
			])
		);
	});

	test('replacing newlines 2', () => {
		testApplyEdits(
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
			editOp(1, 5, 6, 16, [
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
		testApplyEdits(
			[
				' {       "d": [',
				'             null',
				'        ] /*comment*/',
				'        ,"e": /*comment*/ [null] }',
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 3, 1, 10, ['','  ']),
				editOp(1, 16, 2, 14, ['','    ']),
				editOp(2, 18, 3, 9, ['','  ']),
				editOp(3, 22, 4, 9, ['']),
				editOp(4, 10, 4, 10, ['','  ']),
				editOp(4, 28, 4, 28, ['','    ']),
				editOp(4, 32, 4, 32, ['','  ']),
				editOp(4, 33, 4, 34, ['',''])
			],
			editOp(1, 1, 4, 34, [
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
		testApplyEdits(
			[
				'   abc',
				' ,def'
			],
			[
				editOp(1, 1, 1, 4, ['']),
				editOp(1, 7, 2, 2, ['']),
				editOp(2, 3, 2, 3, ['', ''])
			],
			editOp(1, 1, 2, 3, [
				'abc,',
				''
			])
		);
	});
});

suite('EditorModel - EditableTextModel.applyEdits', () => {

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text:string[]): EditorCommon.IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			text: text.join('\n'),
			forceMoveMarkers: false
		};
	}

	function testApplyEdits(original:string[], edits:EditorCommon.IIdentifiedSingleEditOperation[], expected:string[]): void {
		var originalStr = original.join('\n');
		var expectedStr = expected.join('\n');

		assertSyncedModels(originalStr, (model, assertMirrorModels) => {
			// Apply edits & collect inverse edits
			var inverseEdits = model.applyEdits(edits);

			// Assert edits produced expected result
			assert.deepEqual(model.getValue(EditorCommon.EndOfLinePreference.LF), expectedStr);

			assertMirrorModels();

			// Apply the inverse edits
			var inverseInverseEdits = model.applyEdits(inverseEdits);

			// Assert the inverse edits brought back model to original state
			assert.deepEqual(model.getValue(EditorCommon.EndOfLinePreference.LF), originalStr);

			// Assert the inverse of the inverse edits are the original edits
			assert.deepEqual(inverseInverseEdits, edits);

			assertMirrorModels();
		});
	}

	test('Bug 19872: Undo is funky', () => {
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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
		testApplyEdits(
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

	test('advanced', () => {
		testApplyEdits(
			[
				' {       "d": [',
				'             null',
				'        ] /*comment*/',
				'        ,"e": /*comment*/ [null] }',
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 3, 1, 10, ['','  ']),
				editOp(1, 16, 2, 14, ['','    ']),
				editOp(2, 18, 3, 9, ['','  ']),
				editOp(3, 22, 4, 9, ['']),
				editOp(4, 10, 4, 10, ['','  ']),
				editOp(4, 28, 4, 28, ['','    ']),
				editOp(4, 32, 4, 32, ['','  ']),
				editOp(4, 33, 4, 34, ['',''])
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
		testApplyEdits(
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
		testApplyEdits(
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

	function assertSyncedModels(text:string, callback:(model:EditableTextModel, assertMirrorModels:()=>void)=>void, setup:(model:EditableTextModel)=>void = null): void {
		var model = new EditableTextModel([], TextModel.toRawText(text), null);
		model.setEOL(EditorCommon.EndOfLineSequence.LF);

		if (setup) {
			setup(model);
		}

		var mirrorModel1 = new MirrorModel(null, model.getVersionId(), model.toRawText(), null);
		var mirrorModel1PrevVersionId = model.getVersionId();

		var mirrorModel2 = new ExtHostDocument(null, null, model.toRawText().lines, model.toRawText().EOL, null, model.getVersionId(), false);
		var mirrorModel2PrevVersionId = model.getVersionId();

		model.addListener(EditorCommon.EventType.ModelContentChanged, (e:EditorCommon.IModelContentChangedEvent) => {
			let versionId = e.versionId;
			if (versionId < mirrorModel1PrevVersionId) {
				console.warn('Model version id did not advance between edits (1)');
			}
			mirrorModel1PrevVersionId = versionId;
			let mirrorModelEvents:IMirrorModelEvents = {
				propertiesChanged: null,
				contentChanged: [e]
			};
			mirrorModel1.onEvents(mirrorModelEvents);
		});

		model.addListener(EditorCommon.EventType.ModelContentChanged2, (e:EditorCommon.IModelContentChangedEvent2) => {
			let versionId = e.versionId;
			if (versionId < mirrorModel2PrevVersionId) {
				console.warn('Model version id did not advance between edits (2)');
			}
			mirrorModel2PrevVersionId = versionId;
			mirrorModel2._acceptEvents([e]);
		});

		var assertMirrorModels = () => {
			model._assertLineNumbersOK();
			assert.equal(mirrorModel2.getText(), model.getValue(), 'mirror model 2 text OK');
			assert.equal(mirrorModel2.version, model.getVersionId(), 'mirror model 2 version OK');
			assert.equal(mirrorModel1.getValue(), model.getValue(), 'mirror model 1 text OK');
			assert.equal(mirrorModel1.getVersionId(), model.getVersionId(), 'mirror model 1 version OK');
		};

		callback(model, assertMirrorModels);

		model.dispose();
		mirrorModel1.dispose();
		mirrorModel2.dispose();
	}

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
			model.addBulkListener((events) => {
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
			model.addListener(EditorCommon.EventType.ModelContentChanged2, (e:EditorCommon.IModelContentChangedEvent2) => {
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
});

interface ILightWeightMarker {
	id: string;
	lineNumber: number;
	column: number;
	stickToPreviousCharacter: boolean;
}

suite('EditorModel - EditableTextModel.applyEdits & markers', () => {

	function editOp(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, text:string[]): EditorCommon.IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			text: text.join('\n'),
			forceMoveMarkers: false
		};
	}

	function marker(id: string, lineNumber:number, column: number, stickToPreviousCharacter: boolean): ILightWeightMarker {
		return {
			id: id,
			lineNumber: lineNumber,
			column: column,
			stickToPreviousCharacter: stickToPreviousCharacter
		};
	}

	function toMarkersMap(markers:ILightWeightMarker[]): {[markerId:string]:ILightWeightMarker} {
		var result: {[markerId:string]:ILightWeightMarker} = {};
		markers.forEach(m => {
			result[m.id] = m;
		});
		return result;
	}

	function testApplyEditsAndMarkers(text:string[], markers:ILightWeightMarker[], edits:EditorCommon.IIdentifiedSingleEditOperation[], changedMarkers:string[], expectedText:string[], expectedMarkers:ILightWeightMarker[]): void {
		var textStr = text.join('\n');
		var expectedTextStr = expectedText.join('\n');
		var markersMap = toMarkersMap(markers);
		// var expectedMarkersMap = toMarkersMap(expectedMarkers);
		var markerId2ModelMarkerId = Object.create(null);

		var model = new EditableTextModel([], TextModel.toRawText(textStr), null);
		model.setEOL(EditorCommon.EndOfLineSequence.LF);

		// Add markers
		markers.forEach((m) => {
			let modelMarkerId = model._addMarker(m.lineNumber, m.column, m.stickToPreviousCharacter);
			markerId2ModelMarkerId[m.id] = modelMarkerId;
		});

		// Apply edits & collect inverse edits
		model.applyEdits(edits);
		model._assertLineNumbersOK();

		// Assert edits produced expected result
		assert.deepEqual(model.getValue(EditorCommon.EndOfLinePreference.LF), expectedTextStr);

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
		)
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
		)
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
			['e','f','g','h'],
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
		)
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
			['e','f','g','h', 'i', 'j', 'k'],
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
		)
	});
});