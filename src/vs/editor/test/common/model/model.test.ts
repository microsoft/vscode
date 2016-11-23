/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import {
	EventType, IModelContentChangedEvent, IModelContentChangedFlushEvent, IModelContentChangedLineChangedEvent,
	IModelContentChangedLinesDeletedEvent, IModelContentChangedLinesInsertedEvent
} from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { TextModel } from 'vs/editor/common/model/textModel';

// --------- utils

var LINE1 = 'My First Line';
var LINE2 = '\t\tMy Second Line';
var LINE3 = '    Third Line';
var LINE4 = '';
var LINE5 = '1';

suite('Editor Model - Model', () => {

	var thisModel: Model;

	setup(() => {
		var text =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;
		thisModel = Model.createFromString(text);
	});

	teardown(() => {
		thisModel.dispose();
	});

	// --------- insert text

	test('model getValue', () => {
		assert.equal(thisModel.getValue(), 'My First Line\n\t\tMy Second Line\n    Third Line\n\n1');
	});

	test('model insert empty text', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '')]);
		assert.equal(thisModel.getLineCount(), 5);
		assert.equal(thisModel.getLineContent(1), 'My First Line');
	});

	test('model insert text without newline 1', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'foo ')]);
		assert.equal(thisModel.getLineCount(), 5);
		assert.equal(thisModel.getLineContent(1), 'foo My First Line');
	});

	test('model insert text without newline 2', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' foo')]);
		assert.equal(thisModel.getLineCount(), 5);
		assert.equal(thisModel.getLineContent(1), 'My foo First Line');
	});

	test('model insert text with one newline', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' new line\nNo longer')]);
		assert.equal(thisModel.getLineCount(), 6);
		assert.equal(thisModel.getLineContent(1), 'My new line');
		assert.equal(thisModel.getLineContent(2), 'No longer First Line');
	});

	test('model insert text with two newlines', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' new line\nOne more line in the middle\nNo longer')]);
		assert.equal(thisModel.getLineCount(), 7);
		assert.equal(thisModel.getLineContent(1), 'My new line');
		assert.equal(thisModel.getLineContent(2), 'One more line in the middle');
		assert.equal(thisModel.getLineContent(3), 'No longer First Line');
	});

	test('model insert text with many newlines', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), '\n\n\n\n')]);
		assert.equal(thisModel.getLineCount(), 9);
		assert.equal(thisModel.getLineContent(1), 'My');
		assert.equal(thisModel.getLineContent(2), '');
		assert.equal(thisModel.getLineContent(3), '');
		assert.equal(thisModel.getLineContent(4), '');
		assert.equal(thisModel.getLineContent(5), ' First Line');
	});


	// --------- insert text eventing

	test('model insert empty text does not trigger eventing', () => {
		thisModel.onDidChangeRawContent((e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '')]);
	});

	test('model insert text without newline eventing', () => {
		var listenerCalls = 0;
		thisModel.onDidChangeRawContent((e) => {
			listenerCalls++;
			assert.equal(e.changeType, EventType.ModelRawContentChangedLineChanged);
			assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1);
		});
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'foo ')]);
		assert.equal(listenerCalls, 1, 'listener calls');
	});

	test('model insert text with one newline eventing', () => {
		var listenerCalls = 0;
		var order = 0;

		thisModel.onDidChangeRawContent((e) => {
			listenerCalls++;

			if (e.changeType === EventType.ModelRawContentChangedLineChanged) {
				if (order === 0) {
					assert.equal(++order, 1, 'ModelContentChangedLineChanged first');
					assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1, 'ModelContentChangedLineChanged line number 1');
				} else {
					assert.equal(++order, 2, 'ModelContentChangedLineChanged first');
					assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1, 'ModelContentChangedLineChanged line number 1');
				}
			} else if (e.changeType === EventType.ModelRawContentChangedLinesInserted) {
				assert.equal(++order, 3, 'ModelContentChangedLinesInserted second');
				assert.equal((<IModelContentChangedLinesInsertedEvent>e).fromLineNumber, 2, 'ModelContentChangedLinesInserted fromLineNumber');
				assert.equal((<IModelContentChangedLinesInsertedEvent>e).toLineNumber, 2, 'ModelContentChangedLinesInserted toLineNumber');
			} else {
				assert.ok(false);
			}

		});

		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' new line\nNo longer')]);
		assert.equal(listenerCalls, 3, 'listener calls');
	});


	// --------- delete text

	test('model delete empty text', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
		assert.equal(thisModel.getLineCount(), 5);
		assert.equal(thisModel.getLineContent(1), 'My First Line');
	});

	test('model delete text from one line', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		assert.equal(thisModel.getLineCount(), 5);
		assert.equal(thisModel.getLineContent(1), 'y First Line');
	});

	test('model delete text from one line 2', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'a')]);
		assert.equal(thisModel.getLineContent(1), 'aMy First Line');

		thisModel.applyEdits([EditOperation.delete(new Range(1, 2, 1, 4))]);
		assert.equal(thisModel.getLineCount(), 5);
		assert.equal(thisModel.getLineContent(1), 'a First Line');
	});

	test('model delete all text from a line', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
		assert.equal(thisModel.getLineCount(), 5);
		assert.equal(thisModel.getLineContent(1), '');
	});

	test('model delete text from two lines', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
		assert.equal(thisModel.getLineCount(), 4);
		assert.equal(thisModel.getLineContent(1), 'My Second Line');
	});

	test('model delete text from many lines', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);
		assert.equal(thisModel.getLineCount(), 3);
		assert.equal(thisModel.getLineContent(1), 'My Third Line');
	});

	test('model delete everything', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 5, 2))]);
		assert.equal(thisModel.getLineCount(), 1);
		assert.equal(thisModel.getLineContent(1), '');
	});

	// --------- delete text eventing

	test('model delete empty text does not trigger eventing', () => {
		thisModel.onDidChangeRawContent((e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
	});

	test('model delete text from one line eventing', () => {
		var listenerCalls = 0;
		thisModel.onDidChangeRawContent((e) => {
			listenerCalls++;
			assert.equal(e.changeType, EventType.ModelRawContentChangedLineChanged);
			assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1);
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		assert.equal(listenerCalls, 1, 'listener calls');
	});

	test('model delete all text from a line eventing', () => {
		var listenerCalls = 0;
		thisModel.onDidChangeRawContent((e) => {
			listenerCalls++;
			assert.equal(e.changeType, EventType.ModelRawContentChangedLineChanged);
			assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1);
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
		assert.equal(listenerCalls, 1, 'listener calls');
	});

	test('model delete text from two lines eventing', () => {
		var listenerCalls = 0;
		var order = 0;
		thisModel.onDidChangeRawContent((e) => {
			listenerCalls++;

			if (e.changeType === EventType.ModelRawContentChangedLineChanged) {
				if (order === 0) {
					assert.equal(++order, 1);
					assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1);
				} else {
					assert.equal(++order, 2);
					assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1);
				}
			} else if (e.changeType === EventType.ModelRawContentChangedLinesDeleted) {
				assert.equal(++order, 3);
				assert.equal((<IModelContentChangedLinesDeletedEvent>e).fromLineNumber, 2);
				assert.equal((<IModelContentChangedLinesDeletedEvent>e).toLineNumber, 2);
			} else {
				assert.ok(false);
			}

		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
		assert.equal(listenerCalls, 3, 'listener calls');
	});

	test('model delete text from many lines eventing', () => {
		var listenerCalls = 0;
		var order = 0;

		thisModel.onDidChangeRawContent((e) => {
			listenerCalls++;

			if (e.changeType === EventType.ModelRawContentChangedLineChanged) {
				if (order === 0) {
					assert.equal(++order, 1);
					assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1);
				} else {
					assert.equal(++order, 2);
					assert.equal((<IModelContentChangedLineChangedEvent>e).lineNumber, 1);
				}
			} else if (e.changeType === EventType.ModelRawContentChangedLinesDeleted) {
				assert.equal(++order, 3);
				assert.equal((<IModelContentChangedLinesDeletedEvent>e).fromLineNumber, 2);
				assert.equal((<IModelContentChangedLinesDeletedEvent>e).toLineNumber, 3);
			} else {
				assert.ok(false);
			}

		});

		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);

		assert.equal(listenerCalls, 3, 'listener calls');
	});

	// --------- getValueInRange

	test('getValueInRange', () => {
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 1, 1)), '');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 1, 2)), 'M');
		assert.equal(thisModel.getValueInRange(new Range(1, 2, 1, 3)), 'y');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 1, 14)), 'My First Line');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 2, 1)), 'My First Line\n');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 2, 2)), 'My First Line\n\t');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 2, 3)), 'My First Line\n\t\t');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 2, 17)), 'My First Line\n\t\tMy Second Line');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 3, 1)), 'My First Line\n\t\tMy Second Line\n');
		assert.equal(thisModel.getValueInRange(new Range(1, 1, 4, 1)), 'My First Line\n\t\tMy Second Line\n    Third Line\n');
	});

	// --------- getValueLengthInRange

	test('getValueLengthInRange', () => {
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 1, 1)), ''.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 1, 2)), 'M'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 2, 1, 3)), 'y'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 1, 14)), 'My First Line'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 2, 1)), 'My First Line\n'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 2, 2)), 'My First Line\n\t'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 2, 3)), 'My First Line\n\t\t'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 2, 17)), 'My First Line\n\t\tMy Second Line'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 3, 1)), 'My First Line\n\t\tMy Second Line\n'.length);
		assert.equal(thisModel.getValueLengthInRange(new Range(1, 1, 4, 1)), 'My First Line\n\t\tMy Second Line\n    Third Line\n'.length);
	});

	// --------- setValue
	test('setValue eventing', () => {
		var listenerCalls = 0;
		thisModel.onDidChangeRawContent((e: IModelContentChangedEvent) => {
			listenerCalls++;

			assert.equal(e.changeType, EventType.ModelRawContentChangedFlush);

			assert.deepEqual((<IModelContentChangedFlushEvent>e).detail.lines, ['new value']);
		});
		thisModel.setValue('new value');
		assert.equal(listenerCalls, 1, 'listener calls');
	});

	//	var LINE1 = 'My First Line';
	//	var LINE2 = '\t\tMy Second Line';
	//	var LINE3 = '    Third Line';
	//	var LINE4 = '';
	//	var LINE5 = '1';
});


// --------- Special Unicode LINE SEPARATOR character
suite('Editor Model - Model Line Separators', () => {

	var thisModel: Model;

	setup(() => {
		var text =
			LINE1 + '\u2028' +
			LINE2 + '\n' +
			LINE3 + '\u2028' +
			LINE4 + '\r\n' +
			LINE5;
		thisModel = Model.createFromString(text);
	});

	teardown(() => {
		thisModel.dispose();
	});

	test('model getValue', () => {
		assert.equal(thisModel.getValue(), 'My First Line\u2028\t\tMy Second Line\n    Third Line\u2028\n1');
	});

	test('model lines', () => {
		assert.equal(thisModel.getLineCount(), 3);
	});

	test('Bug 13333:Model should line break on lonely CR too', () => {
		var model = Model.createFromString('Hello\rWorld!\r\nAnother line');
		assert.equal(model.getLineCount(), 3);
		assert.equal(model.getValue(), 'Hello\r\nWorld!\r\nAnother line');
		model.dispose();
	});
});


// --------- Words

suite('Editor Model - Words', () => {

	var thisModel: Model;

	setup(() => {
		var text = ['This text has some  words. '];
		thisModel = Model.createFromString(text.join('\n'));
	});

	teardown(() => {
		thisModel.dispose();
	});

	test('Get word at position', () => {
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 1)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 2)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 4)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 5)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 6)), { word: 'text', startColumn: 6, endColumn: 10 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 19)), { word: 'some', startColumn: 15, endColumn: 19 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 20)), null);
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 21)), { word: 'words', startColumn: 21, endColumn: 26 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 26)), { word: 'words', startColumn: 21, endColumn: 26 });
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 27)), null);
		assert.deepEqual(thisModel.getWordAtPosition(new Position(1, 28)), null);
	});
});


// --------- Find
suite('Editor Model - Find', () => {

	function toArrRange(r: Range): [number, number, number, number] {
		return [r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn];
	}

	function assertFindMatches(text: string, searchString: string, isRegex: boolean, matchCase: boolean, wholeWord: boolean, expected: [number, number, number, number][]): void {
		let model = Model.createFromString(text);

		let actualRanges = model.findMatches(searchString, false, isRegex, matchCase, wholeWord);
		let actual = actualRanges.map(toArrRange);

		assert.deepEqual(actual, expected, 'findMatches OK');

		// test `findNextMatch`
		let startPos = new Position(1, 1);
		let match = model.findNextMatch(searchString, startPos, isRegex, matchCase, wholeWord);
		assert.deepEqual(toArrRange(match), expected[0], `findNextMatch ${startPos}`);
		for (let i = 0; i < expected.length; i++) {
			startPos = new Position(expected[i][0], expected[i][1]);
			match = model.findNextMatch(searchString, startPos, isRegex, matchCase, wholeWord);
			assert.deepEqual(toArrRange(match), expected[i], `findNextMatch ${startPos}`);
		}

		// test `findPrevMatch`
		startPos = new Position(model.getLineCount(), model.getLineMaxColumn(model.getLineCount()));
		match = model.findPreviousMatch(searchString, startPos, isRegex, matchCase, wholeWord);
		assert.deepEqual(toArrRange(match), expected[expected.length - 1], `findPrevMatch ${startPos}`);
		for (let i = 0; i < expected.length; i++) {
			startPos = new Position(expected[i][2], expected[i][3]);
			match = model.findPreviousMatch(searchString, startPos, isRegex, matchCase, wholeWord);
			assert.deepEqual(toArrRange(match), expected[i], `findPrevMatch ${startPos}`);
		}

		model.dispose();
	}

	let regularText = [
		'This is some foo - bar text which contains foo and bar - as in Barcelona.',
		'Now it begins a word fooBar and now it is caps Foo-isn\'t this great?',
		'And here\'s a dull line with nothing interesting in it',
		'It is also interesting if it\'s part of a word like amazingFooBar',
		'Again nothing interesting here'
	];

	test('Simple find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'foo', false, false, false,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25],
				[2, 48, 2, 51],
				[4, 59, 4, 62]
			]
		);
	});

	test('Case sensitive find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'foo', false, true, false,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25]
			]
		);
	});

	test('Whole words find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'foo', false, false, true,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 48, 2, 51]
			]
		);
	});

	test('/^/ find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'^', true, false, false,
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1]
			]
		);
	});

	test('/$/ find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'$', true, false, false,
			[
				[1, 74, 1, 74],
				[2, 69, 2, 69],
				[3, 54, 3, 54],
				[4, 65, 4, 65],
				[5, 31, 5, 31]
			]
		);
	});

	test('/.*/ find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'.*', true, false, false,
			[
				[1, 1, 1, 74],
				[2, 1, 2, 69],
				[3, 1, 3, 54],
				[4, 1, 4, 65],
				[5, 1, 5, 31]
			]
		);
	});

	test('/^$/ find', () => {
		assertFindMatches(
			[
				'This is some foo - bar text which contains foo and bar - as in Barcelona.',
				'',
				'And here\'s a dull line with nothing interesting in it',
				'',
				'Again nothing interesting here'
			].join('\n'),
			'^$', true, false, false,
			[
				[2, 1, 2, 1],
				[4, 1, 4, 1]
			]
		);
	});

	test('multiline find 1', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'text\\n', true, false, false,
			[
				[1, 16, 2, 1],
				[2, 16, 3, 1],
			]
		);
	});

	test('multiline find 2', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'text\\nJust', true, false, false,
			[
				[1, 16, 2, 5]
			]
		);
	});

	test('multiline find 3', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'\\nagain', true, false, false,
			[
				[3, 16, 4, 6]
			]
		);
	});

	test('multiline find 4', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'.*\\nJust.*\\n', true, false, false,
			[
				[1, 1, 3, 1]
			]
		);
	});

	test('multiline find with line beginning regex', () => {
		assertFindMatches(
			[
				'if',
				'else',
				'',
				'if',
				'else'
			].join('\n'),
			'^if\\nelse', true, false, false,
			[
				[1, 1, 2, 5],
				[4, 1, 5, 5]
			]
		);
	});

	test('matching empty lines using boundary expression', () => {
		assertFindMatches(
			[
				'if',
				'',
				'else',
				'  ',
				'if',
				' ',
				'else'
			].join('\n'),
			'^\\s*$\\n', true, false, false,
			[
				[2, 1, 3, 1],
				[4, 1, 5, 1],
				[6, 1, 7, 1]
			]
		);
	});

	test('matching lines starting with A and ending with B', () => {
		assertFindMatches(
			[
				'a if b',
				'a',
				'ab',
				'eb'
			].join('\n'),
			'^a.*b$', true, false, false,
			[
				[1, 1, 1, 7],
				[3, 1, 3, 3]
			]
		);
	});

	test('multiline find with line ending regex', () => {
		assertFindMatches(
			[
				'if',
				'else',
				'',
				'if',
				'elseif',
				'else'
			].join('\n'),
			'if\\nelse$', true, false, false,
			[
				[1, 1, 2, 5],
				[5, 5, 6, 5]
			]
		);
	});

	test('issue #4836 - ^.*$', () => {
		assertFindMatches(
			[
				'Just some text text',
				'',
				'some text again',
				'',
				'again some text'
			].join('\n'),
			'^.*$', true, false, false,
			[
				[1, 1, 1, 20],
				[2, 1, 2, 1],
				[3, 1, 3, 16],
				[4, 1, 4, 1],
				[5, 1, 5, 16],
			]
		);
	});

	test('multiline find for non-regex string', () => {
		assertFindMatches(
			[
				'Just some text text',
				'some text text',
				'some text again',
				'again some text',
				'but not some'
			].join('\n'),
			'text\nsome', false, false, false,
			[
				[1, 16, 2, 5],
				[2, 11, 3, 5],
			]
		);
	});

	test('findNextMatch without regex', () => {
		var testObject = new TextModel([], TextModel.toRawText('line line one\nline two\nthree', TextModel.DEFAULT_CREATION_OPTIONS));

		let actual = testObject.findNextMatch('line', { lineNumber: 1, column: 1 }, false, false, false);
		assert.equal(new Range(1, 1, 1, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('line', actual.getEndPosition(), false, false, false);
		assert.equal(new Range(1, 6, 1, 10).toString(), actual.toString());

		actual = testObject.findNextMatch('line', { lineNumber: 1, column: 3 }, false, false, false);
		assert.equal(new Range(1, 6, 1, 10).toString(), actual.toString());

		actual = testObject.findNextMatch('line', actual.getEndPosition(), false, false, false);
		assert.equal(new Range(2, 1, 2, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('line', actual.getEndPosition(), false, false, false);
		assert.equal(new Range(1, 1, 1, 5).toString(), actual.toString());

		testObject.dispose();
	});

	test('findNextMatch with beginning boundary regex', () => {
		var testObject = new TextModel([], TextModel.toRawText('line one\nline two\nthree', TextModel.DEFAULT_CREATION_OPTIONS));

		let actual = testObject.findNextMatch('^line', { lineNumber: 1, column: 1 }, true, false, false);
		assert.equal(new Range(1, 1, 1, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line', actual.getEndPosition(), true, false, false);
		assert.equal(new Range(2, 1, 2, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line', { lineNumber: 1, column: 3 }, true, false, false);
		assert.equal(new Range(2, 1, 2, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line', actual.getEndPosition(), true, false, false);
		assert.equal(new Range(1, 1, 1, 5).toString(), actual.toString());

		testObject.dispose();
	});

	test('findNextMatch with beginning boundary regex and line has repetitive beginnings', () => {
		var testObject = new TextModel([], TextModel.toRawText('line line one\nline two\nthree', TextModel.DEFAULT_CREATION_OPTIONS));

		let actual = testObject.findNextMatch('^line', { lineNumber: 1, column: 1 }, true, false, false);
		assert.equal(new Range(1, 1, 1, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line', actual.getEndPosition(), true, false, false);
		assert.equal(new Range(2, 1, 2, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line', { lineNumber: 1, column: 3 }, true, false, false);
		assert.equal(new Range(2, 1, 2, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line', actual.getEndPosition(), true, false, false);
		assert.equal(new Range(1, 1, 1, 5).toString(), actual.toString());

		testObject.dispose();
	});

	test('findNextMatch with beginning boundary multiline regex and line has repetitive beginnings', () => {
		var testObject = new TextModel([], TextModel.toRawText('line line one\nline two\nline three\nline four', TextModel.DEFAULT_CREATION_OPTIONS));

		let actual = testObject.findNextMatch('^line.*\\nline', { lineNumber: 1, column: 1 }, true, false, false);
		assert.equal(new Range(1, 1, 2, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line.*\\nline', actual.getEndPosition(), true, false, false);
		assert.equal(new Range(3, 1, 4, 5).toString(), actual.toString());

		actual = testObject.findNextMatch('^line.*\\nline', { lineNumber: 2, column: 1 }, true, false, false);
		assert.equal(new Range(2, 1, 3, 5).toString(), actual.toString());

		testObject.dispose();
	});

	test('findNextMatch with ending boundary regex', () => {
		var testObject = new TextModel([], TextModel.toRawText('one line line\ntwo line\nthree', TextModel.DEFAULT_CREATION_OPTIONS));

		let actual = testObject.findNextMatch('line$', { lineNumber: 1, column: 1 }, true, false, false);
		assert.equal(new Range(1, 10, 1, 14).toString(), actual.toString());

		actual = testObject.findNextMatch('line$', { lineNumber: 1, column: 4 }, true, false, false);
		assert.equal(new Range(1, 10, 1, 14).toString(), actual.toString());

		actual = testObject.findNextMatch('line$', actual.getEndPosition(), true, false, false);
		assert.equal(new Range(2, 5, 2, 9).toString(), actual.toString());

		actual = testObject.findNextMatch('line$', actual.getEndPosition(), true, false, false);
		assert.equal(new Range(1, 10, 1, 14).toString(), actual.toString());

		testObject.dispose();
	});

	function assertParseSearchResult(searchString: string, isRegex: boolean, matchCase: boolean, wholeWord: boolean, expected: RegExp): void {
		let actual = TextModel.parseSearchRequest(searchString, isRegex, matchCase, wholeWord);
		assert.deepEqual(actual, expected);
	}

	test('parseSearchRequest invalid', () => {
		assertParseSearchResult('', true, true, true, null);
		assertParseSearchResult(null, true, true, true, null);
		assertParseSearchResult('(', true, false, false, null);
	});

	test('parseSearchRequest non regex', () => {
		assertParseSearchResult('foo', false, false, false, /foo/gi);
		assertParseSearchResult('foo', false, false, true, /\bfoo\b/gi);
		assertParseSearchResult('foo', false, true, false, /foo/g);
		assertParseSearchResult('foo', false, true, true, /\bfoo\b/g);
		assertParseSearchResult('foo\\n', false, false, false, /foo\\n/gi);
		assertParseSearchResult('foo\\\\n', false, false, false, /foo\\\\n/gi);
		assertParseSearchResult('foo\\r', false, false, false, /foo\\r/gi);
		assertParseSearchResult('foo\\\\r', false, false, false, /foo\\\\r/gi);
	});

	test('parseSearchRequest regex', () => {
		assertParseSearchResult('foo', true, false, false, /foo/gi);
		assertParseSearchResult('foo', true, false, true, /\bfoo\b/gi);
		assertParseSearchResult('foo', true, true, false, /foo/g);
		assertParseSearchResult('foo', true, true, true, /\bfoo\b/g);
		assertParseSearchResult('foo\\n', true, false, false, /foo\n/gim);
		assertParseSearchResult('foo\\\\n', true, false, false, /foo\\n/gi);
		assertParseSearchResult('foo\\r', true, false, false, /foo\r/gim);
		assertParseSearchResult('foo\\\\r', true, false, false, /foo\\r/gi);
	});
});
