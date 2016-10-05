/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ICompatMirrorModelEvents, CompatMirrorModel} from 'vs/editor/common/model/compatMirrorModel';
import {Position} from 'vs/editor/common/core/position';
import {MirrorModel as SimpleMirrorModel} from 'vs/editor/common/services/editorSimpleWorker';
import {DEFAULT_WORD_REGEXP} from 'vs/editor/common/model/wordHelper';
import {TextModel} from 'vs/editor/common/model/textModel';

function createTestMirrorModelFromString(value:string): CompatMirrorModel {
	return new CompatMirrorModel(0, TextModel.toRawText(value, TextModel.DEFAULT_CREATION_OPTIONS), null);
}

function contentChangedFlushEvent(detail: editorCommon.IRawText): editorCommon.IModelContentChangedFlushEvent {
	return {
		changeType: editorCommon.EventType.ModelRawContentChangedFlush,
		isRedoing: false,
		isUndoing: false,
		versionId: 0,
		detail: detail
	};
}

function contentChangedLinesDeletedEvent(fromLineNumber: number, toLineNumber: number): editorCommon.IModelContentChangedLinesDeletedEvent {
	return {
		changeType: editorCommon.EventType.ModelRawContentChangedLinesDeleted,
		isRedoing: false,
		isUndoing: false,
		versionId: 0,
		fromLineNumber: fromLineNumber,
		toLineNumber: toLineNumber
	};
}

function contentChangedLinesInsertedEvent(fromLineNumber: number, toLineNumber: number, detail: string): editorCommon.IModelContentChangedLinesInsertedEvent {
	return {
		changeType: editorCommon.EventType.ModelRawContentChangedLinesInserted,
		isRedoing: false,
		isUndoing: false,
		versionId: 0,
		fromLineNumber: fromLineNumber,
		toLineNumber: toLineNumber,
		detail: detail
	};
}

function contentChangedLineChanged(lineNumber: number, detail: string): editorCommon.IModelContentChangedLineChangedEvent {
	return {
		changeType: editorCommon.EventType.ModelRawContentChangedLineChanged,
		isRedoing: false,
		isUndoing: false,
		versionId: 0,
		lineNumber: lineNumber,
		detail: detail
	};
}

function mirrorModelEvents(contentChanged:editorCommon.IModelContentChangedEvent[]): ICompatMirrorModelEvents {
	return {
		contentChanged: contentChanged
	};
}

suite('Editor Model - MirrorModel', () => {

	var mirrorModel:CompatMirrorModel;

	setup(() => {
		mirrorModel = createTestMirrorModelFromString('line1\nline2\nline3\nline4');
	});

	teardown(() => {
		mirrorModel.dispose();
		mirrorModel = null;
	});

	test('get line start ', () => {
		assert.equal(mirrorModel.getOffsetAt(new Position(1, 1)), 0);
		assert.equal(mirrorModel.getOffsetAt(new Position(2, 1)), 6);
		assert.equal(mirrorModel.getOffsetAt(new Position(3, 1)), 12);
		assert.equal(mirrorModel.getOffsetAt(new Position(4, 1)), 18);
		assert.equal(mirrorModel.getOffsetAt(new Position(1000, 1)), mirrorModel.getOffsetAt(new Position(mirrorModel.getLineCount(), mirrorModel.getLineMaxColumn(mirrorModel.getLineCount()))));
	});

	test('get line start /flush event/', () => {
		assert.equal(mirrorModel.getOffsetAt(new Position(2, 1)), 6);
		assert.equal(mirrorModel.getOffsetAt(new Position(3, 1)), 12);

		mirrorModel.onEvents(mirrorModelEvents([contentChangedFlushEvent({
			length: -1,
			lines: [
				'foo',
				'bar'
			],
			BOM: '',
			EOL: '\n',
			options: {
				tabSize: 4,
				insertSpaces: true,
				trimAutoWhitespace: true,
				defaultEOL: editorCommon.DefaultEndOfLine.LF
			}
		})]));

		assert.equal(mirrorModel.getOffsetAt(new Position(1, 1)), 0);
		assert.equal(mirrorModel.getOffsetAt(new Position(2, 1)), 4);
	});

	test('get offset', () => {
		assert.equal(mirrorModel.getOffsetAt({lineNumber: 1, column: 1}), 0);
		assert.equal(mirrorModel.getOffsetAt({lineNumber: 1, column: 3}), 2);
		assert.equal(mirrorModel.getOffsetAt({lineNumber: 2, column: 1}), 6);
		assert.equal(mirrorModel.getOffsetAt({lineNumber: 4, column: 6}), 23);
		assert.equal(mirrorModel.getOffsetAt({lineNumber: 4, column: 7}), 23);
	});

	test('get position from offset', () => {
		assert.deepEqual(mirrorModel.getPositionAt(0), {lineNumber: 1, column: 1});
		assert.deepEqual(mirrorModel.getPositionAt(2), {lineNumber: 1, column: 3});
		assert.deepEqual(mirrorModel.getPositionAt(6), {lineNumber: 2, column: 1});
		assert.deepEqual(mirrorModel.getPositionAt(23), {lineNumber: 4, column: 6});
		assert.deepEqual(mirrorModel.getPositionAt(24), {lineNumber: 4, column: 6});
	});

	test('get (all/unique) words', () => {
		let model = new SimpleMirrorModel(null, [ 'foo bar foo bar' ], '\n', 1);
		let uniqueWords = model.getAllUniqueWords(DEFAULT_WORD_REGEXP);
		assert.equal(uniqueWords.length, 2);
		assert.equal(uniqueWords[0], 'foo');
		assert.equal(uniqueWords[1], 'bar');

		model = new SimpleMirrorModel(null, [ 'foo bar', 'foo', 'bar' ], '\n', 1);
		uniqueWords = model.getAllUniqueWords(DEFAULT_WORD_REGEXP);
		assert.equal(uniqueWords.length, 2);
		assert.equal(uniqueWords[0], 'foo');
		assert.equal(uniqueWords[1], 'bar');

		model = new SimpleMirrorModel(null, [ 'toString', 'hasOwnProperty', 'foo' ], '\n', 1);
		uniqueWords = model.getAllUniqueWords(DEFAULT_WORD_REGEXP);
		assert.equal(uniqueWords.length, 3);
		assert.equal(uniqueWords[0], 'toString');
		assert.equal(uniqueWords[1], 'hasOwnProperty');
		assert.equal(uniqueWords[2], 'foo');
	});

	test('word at/until pos', () => {
		var pos = { lineNumber: 1, column: 3 };
		assert.equal(mirrorModel.getWordAtPosition(pos).word, 'line1');

		var model = createTestMirrorModelFromString('foo bar 1234 :";\'');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 1}).word, 'foo');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 2}).word, 'foo');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 3}).word, 'foo');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 4}).word, 'foo');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 5}).word, 'bar');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 6}).word, 'bar');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 7}).word, 'bar');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 8}).word, 'bar');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 9}).word, '1234');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 10}).word, '1234');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 11}).word, '1234');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 12}).word, '1234');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 13}).word, '1234');
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 14}), null);
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 15}), null);
		assert.equal(model.getWordAtPosition({lineNumber: 1, column: 16}), null);

		assert.equal(mirrorModel.getWordUntilPosition(pos).word, 'li');

	});
});

suite('Editor Model - MirrorModel Eventing', () => {

	var mirrorModel:CompatMirrorModel;

	setup(() => {
		mirrorModel = createTestMirrorModelFromString('line one\nline two\nline three\nline four');
	});

	teardown(() => {
		mirrorModel.dispose();
		mirrorModel = null;
	});

	test('delete single line', () => {
		assert.equal(mirrorModel.getLineContent(3), 'line three');

		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesDeletedEvent(3, 3)]));

		assert.equal(mirrorModel.getLineContent(3), 'line four');
	});

	test('delete multiple lines', () => {
		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesDeletedEvent(1, 2)]));

		assert.equal(mirrorModel.getLineContent(1), 'line three');
		assert.equal(mirrorModel.getLineContent(2), 'line four');
	});

	test('delete all lines', () => {
		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesDeletedEvent(1, 4)]));
	});

	test('add single lines', () => {
		assert.equal(mirrorModel.getLineContent(1), 'line one');

		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesInsertedEvent(1, 1, 'foo bar\nbar foo')]));

		assert.equal(mirrorModel.getLineContent(1), 'foo bar');
		assert.equal(mirrorModel.getLineContent(2), 'line one');
	});


	test('add multiple lines', () => {
		assert.equal(mirrorModel.getLineContent(1), 'line one');

		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesInsertedEvent(1, 2, 'foo bar\nbar foo')]));

		assert.equal(mirrorModel.getLineContent(1), 'foo bar');
		assert.equal(mirrorModel.getLineContent(2), 'bar foo');
		assert.equal(mirrorModel.getLineContent(3), 'line one');
	});

	test('change line', () => {
		assert.equal(mirrorModel.getLineContent(1), 'line one');

		mirrorModel.onEvents(mirrorModelEvents([contentChangedLineChanged(1, 'foobar')]));

		assert.equal(mirrorModel.getLineContent(1), 'foobar');
	});

	test('flush model', () => {
		assert.equal(mirrorModel.getLineContent(1), 'line one');
		assert.equal(mirrorModel.getLineContent(2), 'line two');

		mirrorModel.onEvents(mirrorModelEvents([contentChangedFlushEvent({
			length: -1,
			lines: [
				'foo',
				'bar'
			],
			BOM: '',
			EOL: '\n',
			options: {
				tabSize: 4,
				insertSpaces: true,
				trimAutoWhitespace: true,
				defaultEOL: editorCommon.DefaultEndOfLine.LF
			}
		})]));

		assert.equal(mirrorModel.getLineContent(1), 'foo');
		assert.equal(mirrorModel.getLineContent(2), 'bar');
	});

});
