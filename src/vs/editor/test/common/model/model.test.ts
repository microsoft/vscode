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
	EventType, IModelContentChangedEvent, IModelContentChangedLineChangedEvent,
	IModelContentChangedLinesDeletedEvent, IModelContentChangedLinesInsertedEvent
} from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';

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
