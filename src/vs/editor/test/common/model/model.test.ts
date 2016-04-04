/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EventType, IModelContentChangedEvent, IModelContentChangedFlushEvent} from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {BracketMode} from 'vs/editor/test/common/testModes';

// --------- utils

function isNotABracket(model, lineNumber, column) {
	var match = model.matchBracket(new Position(lineNumber, column));
	assert.equal(match.isAccurate, true, 'is not matching brackets at ' + lineNumber + ', ' + column);
	assert.equal(match.brackets, null, 'is not matching brackets at ' + lineNumber + ', ' + column);
}

function isBracket(model, lineNumber1, column11, column12, lineNumber2, column21, column22) {
	var match = model.matchBracket(new Position(lineNumber1, column11));
	assert.deepEqual(match, {
		brackets: [
			new Range(lineNumber1, column11, lineNumber1, column12),
			new Range(lineNumber2, column21, lineNumber2, column22)
		],
		isAccurate: true
	}, 'is matching brackets at ' + lineNumber1 + ', ' + column11);
}



function rangeEqual(range, startLineNumber, startColumn, endLineNumber, endColumn) {
	assert.deepEqual(range, new Range(startLineNumber, startColumn, endLineNumber, endColumn));
}


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
		thisModel = new Model(text, Model.DEFAULT_CREATION_OPTIONS, null);
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
		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '')]);
	});

	test('model insert text without newline eventing', () => {
		var listenerCalls = 0;
		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			listenerCalls++;
			assert.equal(e.changeType, EventType.ModelContentChangedLineChanged);
			assert.equal(e.lineNumber, 1);
		});
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'foo ')]);
		assert.equal(listenerCalls, 1, 'listener calls');
	});

	test('model insert text with one newline eventing', () => {
		var listenerCalls = 0;
		var order = 0;

		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			listenerCalls++;

			if (e.changeType === EventType.ModelContentChangedLineChanged) {
				if (order === 0) {
					assert.equal(++order, 1, 'ModelContentChangedLineChanged first');
					assert.equal(e.lineNumber, 1, 'ModelContentChangedLineChanged line number 1');
				} else {
					assert.equal(++order, 2, 'ModelContentChangedLineChanged first');
					assert.equal(e.lineNumber, 1, 'ModelContentChangedLineChanged line number 1');
				}
			} else if (e.changeType === EventType.ModelContentChangedLinesInserted) {
				assert.equal(++order, 3, 'ModelContentChangedLinesInserted second');
				assert.equal(e.fromLineNumber, 2, 'ModelContentChangedLinesInserted fromLineNumber');
				assert.equal(e.toLineNumber, 2, 'ModelContentChangedLinesInserted toLineNumber');
			} else {
				assert.ok (false);
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
		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
	});

	test('model delete text from one line eventing', () => {
		var listenerCalls = 0;
		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			listenerCalls++;
			assert.equal(e.changeType, EventType.ModelContentChangedLineChanged);
			assert.equal(e.lineNumber, 1);
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		assert.equal(listenerCalls, 1, 'listener calls');
	});

	test('model delete all text from a line eventing', () => {
		var listenerCalls = 0;
		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			listenerCalls++;
			assert.equal(e.changeType, EventType.ModelContentChangedLineChanged);
			assert.equal(e.lineNumber, 1);
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
		assert.equal(listenerCalls, 1, 'listener calls');
	});

	test('model delete text from two lines eventing', () => {
		var listenerCalls = 0;
		var order = 0;
		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			listenerCalls++;

			if (e.changeType === EventType.ModelContentChangedLineChanged) {
				if (order === 0) {
					assert.equal(++order, 1);
					assert.equal(e.lineNumber, 1);
				} else {
					assert.equal(++order, 2);
					assert.equal(e.lineNumber, 1);
				}
			} else if (e.changeType === EventType.ModelContentChangedLinesDeleted) {
				assert.equal(++order, 3);
				assert.equal(e.fromLineNumber, 2);
				assert.equal(e.toLineNumber, 2);
			} else {
				assert.ok (false);
			}

		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
		assert.equal(listenerCalls, 3, 'listener calls');
	});

	test('model delete text from many lines eventing', () => {
		var listenerCalls = 0;
		var order = 0;

		thisModel.addListener(EventType.ModelContentChanged, (e) => {
			listenerCalls++;

			if (e.changeType === EventType.ModelContentChangedLineChanged) {
				if (order === 0) {
					assert.equal(++order, 1);
					assert.equal(e.lineNumber, 1);
				} else {
					assert.equal(++order, 2);
					assert.equal(e.lineNumber, 1);
				}
			} else if (e.changeType === EventType.ModelContentChangedLinesDeleted) {
				assert.equal(++order, 3);
				assert.equal(e.fromLineNumber, 2);
				assert.equal(e.toLineNumber, 3);
			} else {
				assert.ok (false);
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
		thisModel.addOneTimeListener(EventType.ModelContentChanged, (e:IModelContentChangedEvent) => {
			listenerCalls++;

			assert.equal(e.changeType, EventType.ModelContentChangedFlush);

			assert.deepEqual((<IModelContentChangedFlushEvent>e).detail.lines, [ 'new value' ]);
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
		thisModel = new Model(text, Model.DEFAULT_CREATION_OPTIONS, null);
	});

	teardown(() => {
		thisModel.destroy();
	});

	test('model getValue', () => {
		assert.equal(thisModel.getValue(), 'My First Line\u2028\t\tMy Second Line\n    Third Line\u2028\n1');
	});

	test('model lines', () => {
		assert.equal(thisModel.getLineCount(), 3);
	});

	test('Bug 13333:Model should line break on lonely CR too', () => {
		var model = new Model('Hello\rWorld!\r\nAnother line', Model.DEFAULT_CREATION_OPTIONS, null);
		assert.equal(model.getLineCount(), 3);
		assert.equal(model.getValue(), 'Hello\r\nWorld!\r\nAnother line');
		model.dispose();
	});
});


// --------- bracket matching

suite('Editor Model - bracket Matching', () => {

	var thisModel: Model;
	var bracketMode = new BracketMode();

	setup(() => {
		var text =
			'var bar = {' + '\n' +
			'foo: {' + '\n' +
			'}, bar: {hallo: [{' + '\n' +
			'}, {' + '\n' +
			'}]}}';
		thisModel = new Model(text, Model.DEFAULT_CREATION_OPTIONS, bracketMode);
	});

	teardown(() => {
		thisModel.destroy();
	});

	test('Model bracket matching 1', () => {

		var brackets = [
			[1, 11, 12, 5, 4, 5],
			[1, 12, 11, 5, 4, 5],
			[5, 5, 4, 1, 11, 12],

			[2, 6, 7, 3, 1, 2],
			[2, 7, 6, 3, 1, 2],
			[3, 1, 2, 2, 6, 7],
			[3, 2, 1, 2, 6, 7],

			[3, 9, 10, 5, 3, 4],
			[3, 10, 9, 5, 3, 4],
			[5, 4, 3, 3, 9, 10],

			[3, 17, 18, 5, 2, 3],
			[3, 18, 17, 5, 2, 3],
			[5, 3, 2, 3, 17, 18],

			[3, 19, 18, 4, 1, 2],
			[4, 2, 1, 3, 18, 19],
			[4, 1, 2, 3, 18, 19],

			[4, 4, 5, 5, 1, 2],
			[4, 5, 4, 5, 1, 2],
			[5, 2, 1, 4, 4, 5],
			[5, 1, 2, 4, 4, 5]
		];
		var i, len, b, isABracket = {1:{}, 2:{}, 3:{}, 4:{}, 5:{}};

		for (i = 0, len = brackets.length; i < len; i++) {
			b = brackets[i];
			isBracket(thisModel, b[0], b[1], b[2], b[3], b[4], b[5]);
			isABracket[b[0]][b[1]] = true;
		}

		for (i = 1, len = thisModel.getLineCount(); i <= len; i++) {
			var line = thisModel.getLineContent(i), j, lenJ;
			for (j = 1, lenJ = line.length + 1; j <= lenJ; j++) {
				if (!isABracket[i].hasOwnProperty(j)) {
					isNotABracket(thisModel, i, j);
				}
			}
		}
	});
});


suite('Editor Model - bracket Matching 2', () => {

	var thisModel: Model;
	var bracketMode = new BracketMode();

	setup(() => {
		var text =
			')]}{[(' + '\n' +
			')]}{[(';
		thisModel = new Model(text, Model.DEFAULT_CREATION_OPTIONS, bracketMode);
	});

	teardown(() => {
		thisModel.destroy();
	});

	test('Model bracket matching', () => {
		isNotABracket(thisModel, 1, 1);
		isNotABracket(thisModel, 1, 2);
		isNotABracket(thisModel, 1, 3);
		isBracket(thisModel, 1, 4, 5, 2, 3, 4);
		isBracket(thisModel, 1, 5, 4, 2, 3, 4);
		isBracket(thisModel, 1, 6, 5, 2, 2, 3);
		isBracket(thisModel, 1, 7, 6, 2, 1, 2);

		isBracket(thisModel, 2, 1, 2, 1, 6, 7);
		isBracket(thisModel, 2, 2, 1, 1, 6, 7);
		isBracket(thisModel, 2, 3, 2, 1, 5, 6);
		isBracket(thisModel, 2, 4, 3, 1, 4, 5);
		isNotABracket(thisModel, 2, 5);
		isNotABracket(thisModel, 2, 6);
		isNotABracket(thisModel, 2, 7);
	});
});


// --------- Words

suite('Editor Model - Words', () => {

	var thisModel: Model;

	setup(() => {
		var text = [ 'This text has some  words. ' ];
		thisModel = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
	});

	teardown(() => {
		thisModel.destroy();
	});

	test('Get all words', () => {
		var words = [
			{ start: 0,		end: 4 },
			{ start: 5,		end: 9 },
			{ start: 10,	end: 13 },
			{ start: 14,	end: 18 },
			{ start: 20,	end: 25 },
			{ start: 25,	end: 26 }
		];

		var modelWords = thisModel.getWords(1);

		for (var i = 0; i < modelWords.length; i++) {
			assert.deepEqual(modelWords[i], words[i]);
		}
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

	var thisModel: Model;

	setup(() => {
		var text = [
			'This is some foo - bar text which contains foo and bar - as in Barcelona.',
			'Now it begins a word fooBar and now it is caps Foo-isn\'t this great?',
			'And here\'s a dull line with nothing interesting in it',
			'It is also interesting if it\'s part of a word like amazingFooBar',
			'Again nothing interesting here'
		];
		thisModel = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
	});

	teardown(() => {
		thisModel.dispose();
	});

	test('Simple find', () => {
		var ranges = [
			[1, 14, 1, 17],
			[1, 44, 1, 47],
			[2, 22, 2, 25],
			[2, 48, 2, 51],
			[4, 59, 4, 62]
		];
		var matches = thisModel.findMatches('foo', false, false, false, false);
		assert.equal(matches.length, ranges.length);
		for (var i = 0; i < matches.length; i++) {
			rangeEqual(matches[i], ranges[i][0], ranges[i][1], ranges[i][2], ranges[i][3]);
		}
	});

	test('Case sensitive find', () => {
		var ranges = [
			[1, 14, 1, 17],
			[1, 44, 1, 47],
			[2, 22, 2, 25]
		];
		var matches = thisModel.findMatches('foo', false, false, true, false);
		assert.equal(matches.length, ranges.length);
		for (var i = 0; i < matches.length; i++) {
			rangeEqual(matches[i], ranges[i][0], ranges[i][1], ranges[i][2], ranges[i][3]);
		}
	});

	test('Whole words find', () => {
		var ranges = [
			[1, 14, 1, 17],
			[1, 44, 1, 47],
			[2, 48, 2, 51]
		];
		var matches = thisModel.findMatches('foo', false, false, false, true);
		assert.equal(matches.length, ranges.length);
		for (var i = 0; i < matches.length; i++) {
			rangeEqual(matches[i], ranges[i][0], ranges[i][1], ranges[i][2], ranges[i][3]);
		}
	});

	test('/^/ find', () => {
		var ranges = [
			[1, 1, 1, 1],
			[2, 1, 2, 1],
			[3, 1, 3, 1],
			[4, 1, 4, 1],
			[5, 1, 5, 1]
		];
		var matches = thisModel.findMatches('^', false, true, false, false);
		assert.equal(matches.length, ranges.length);
		for (var i = 0; i < matches.length; i++) {
			rangeEqual(matches[i], ranges[i][0], ranges[i][1], ranges[i][2], ranges[i][3]);
		}
	});

	test('/$/ find', () => {
		var ranges = [
			[1, 74, 1, 74],
			[2, 69, 2, 69],
			[3, 54, 3, 54],
			[4, 65, 4, 65],
			[5, 31, 5, 31]
		];
		var matches = thisModel.findMatches('$', false, true, false, false);
		assert.equal(matches.length, ranges.length);
		for (var i = 0; i < matches.length; i++) {
			rangeEqual(matches[i], ranges[i][0], ranges[i][1], ranges[i][2], ranges[i][3]);
		}
	});

	test('/^$/ find', () => {
		var text = [
			'This is some foo - bar text which contains foo and bar - as in Barcelona.',
			'',
			'And here\'s a dull line with nothing interesting in it',
			'',
			'Again nothing interesting here'
		];
		var model = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);

		var ranges = [
			[2, 1, 2, 1],
			[4, 1, 4, 1]
		];
		var matches = model.findMatches('^$', false, true, false, false);
		assert.equal(matches.length, ranges.length);
		for (var i = 0; i < matches.length; i++) {
			rangeEqual(matches[i], ranges[i][0], ranges[i][1], ranges[i][2], ranges[i][3]);
		}

		model.dispose();
	});
});
