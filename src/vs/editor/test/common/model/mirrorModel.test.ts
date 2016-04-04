/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IMirrorModelEvents, MirrorModel, createTestMirrorModelFromString} from 'vs/editor/common/model/mirrorModel';
import {createMockMode} from 'vs/editor/test/common/modesTestUtils';

function equalRange(left, right) {
	if(left.startLineNumber !== right.startLineNumber) {
		assert.ok(false, 'startLineNumber: actual:' + left.startLineNumber + ' expected:' + right.startLineNumber);
	} else if(left.endLineNumber !== right.endLineNumber){
		assert.ok(false, 'endLineNumber: actual:' + left.endLineNumber + ' expected:' + right.endLineNumber);
	} else if(left.startColumn !== right.startColumn) {
		assert.ok(false, 'startColumn: actual:' + left.startColumn + ' expected:' + right.startColumn);
	} else if(left.endColumn !== right.endColumn){
		assert.ok(false, 'endColumn: actual:' + left.endColumn + ' expected:' + right.endColumn);
	}
	assert.ok(true, 'ranges');
};

function contentChangedFlushEvent(detail: editorCommon.IRawText): editorCommon.IModelContentChangedFlushEvent {
	return {
		changeType: editorCommon.EventType.ModelContentChangedFlush,
		isRedoing: false,
		isUndoing: false,
		versionId: 0,
		detail: detail
	};
}

function contentChangedLinesDeletedEvent(fromLineNumber: number, toLineNumber: number): editorCommon.IModelContentChangedLinesDeletedEvent {
	return {
		changeType: editorCommon.EventType.ModelContentChangedLinesDeleted,
		isRedoing: false,
		isUndoing: false,
		versionId: 0,
		fromLineNumber: fromLineNumber,
		toLineNumber: toLineNumber
	};
}

function contentChangedLinesInsertedEvent(fromLineNumber: number, toLineNumber: number, detail: string): editorCommon.IModelContentChangedLinesInsertedEvent {
	return {
		changeType: editorCommon.EventType.ModelContentChangedLinesInserted,
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
		changeType: editorCommon.EventType.ModelContentChangedLineChanged,
		isRedoing: false,
		isUndoing: false,
		versionId: 0,
		lineNumber: lineNumber,
		detail: detail
	};
}

function mirrorModelEvents(contentChanged:editorCommon.IModelContentChangedEvent[]): IMirrorModelEvents {
	return {
		contentChanged: contentChanged
	};
}

suite('Editor Model - MirrorModel', () => {

	var mirrorModel:MirrorModel;

	setup(() => {
		mirrorModel = createTestMirrorModelFromString('line1\nline2\nline3\nline4');
	});

	teardown(() => {
		mirrorModel.dispose();
		mirrorModel = null;
	});

	test('get line start ', () => {
		assert.equal(mirrorModel.getLineStart(1), 0);
		assert.equal(mirrorModel.getLineStart(2), 6);
		assert.equal(mirrorModel.getLineStart(3), 12);
		assert.equal(mirrorModel.getLineStart(4), 18);
		assert.equal(mirrorModel.getLineStart(1000), mirrorModel.getLineStart(mirrorModel.getLineCount()));
	});

	test('get line start /flush event/', () => {
		assert.equal(mirrorModel.getLineStart(2), 6);
		assert.equal(mirrorModel.getLineStart(3), 12);

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
				defaultEOL: editorCommon.DefaultEndOfLine.LF
			}
		})]));

		assert.equal(mirrorModel.getLineStart(1), 0);
		assert.equal(mirrorModel.getLineStart(2), 4);
	});

	test('get offset', () => {
		assert.equal(mirrorModel.getOffsetFromPosition({lineNumber: 1, column: 1}), 0);
		assert.equal(mirrorModel.getOffsetFromPosition({lineNumber: 1, column: 3}), 2);
		assert.equal(mirrorModel.getOffsetFromPosition({lineNumber: 2, column: 1}), 6);
		assert.equal(mirrorModel.getOffsetFromPosition({lineNumber: 4, column: 7}), 24);
	});

	test('get position from offset', () => {
		assert.deepEqual(mirrorModel.getPositionFromOffset(0), {lineNumber: 1, column: 1});
		assert.deepEqual(mirrorModel.getPositionFromOffset(2), {lineNumber: 1, column: 3});
		assert.deepEqual(mirrorModel.getPositionFromOffset(6), {lineNumber: 2, column: 1});
		assert.deepEqual(mirrorModel.getPositionFromOffset(24), {lineNumber: 4, column: 7});
	});

	test('get (all/unique) words', () => {
		var model = createTestMirrorModelFromString('foo bar foo bar');
		var words = model.getAllWords();
		var uniqueWords = model.getAllUniqueWords();
		assert.equal(words.length, 4);
		assert.equal(words[0], 'foo');
		assert.equal(words[1], 'bar');
		assert.equal(words[2], 'foo');
		assert.equal(words[3], 'bar');
		assert.equal(uniqueWords.length, 2);
		assert.equal(uniqueWords[0], 'foo');
		assert.equal(uniqueWords[1], 'bar');

		model = createTestMirrorModelFromString('foo bar\nfoo\nbar');
		words = model.getAllWords();
		uniqueWords = model.getAllUniqueWords();
		assert.equal(words.length, 4);
		assert.equal(words[0], 'foo');
		assert.equal(words[1], 'bar');
		assert.equal(words[2], 'foo');
		assert.equal(words[3], 'bar');
		assert.equal(uniqueWords.length, 2);
		assert.equal(uniqueWords[0], 'foo');
		assert.equal(uniqueWords[1], 'bar');
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

	test('words with ranges', () => {

		var wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 4);
		assert.equal(wordsWithRanges[0].text, 'line1');
		equalRange(wordsWithRanges[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 });
		assert.equal(wordsWithRanges[1].text, 'line2');
		equalRange(wordsWithRanges[1].range, { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 6 });
		assert.equal(wordsWithRanges[2].text, 'line3');
		equalRange(wordsWithRanges[2].range, { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 6 });
		assert.equal(wordsWithRanges[3].text, 'line4');
		equalRange(wordsWithRanges[3].range, { startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 6 });

		var model = createTestMirrorModelFromString('foo bar\nfoo\nbar');
		wordsWithRanges = model.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 4);
		assert.equal(wordsWithRanges[0].text, 'foo');
		equalRange(wordsWithRanges[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 });
		assert.equal(wordsWithRanges[1].text, 'bar');
		equalRange(wordsWithRanges[1].range, { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 8 });
		assert.equal(wordsWithRanges[2].text, 'foo');
		equalRange(wordsWithRanges[2].range, { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 4 });
		assert.equal(wordsWithRanges[3].text, 'bar');
		equalRange(wordsWithRanges[3].range, { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 4 });
	});
});

suite('Editor Model - MirrorModel Eventing', () => {

	var mirrorModel:MirrorModel;

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
		var words = mirrorModel.getAllWords();
		assert.equal(words.length, 6);
		assert.equal(words[0], 'line');
		assert.equal(words[1], 'one');
		assert.equal(words[2], 'line');
		assert.equal(words[3], 'two');
		assert.equal(words[4], 'line');
		assert.equal(words[5], 'four');
	});

	test('delete multiple lines', () => {
		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesDeletedEvent(1, 2)]));

		assert.equal(mirrorModel.getLineContent(1), 'line three');
		assert.equal(mirrorModel.getLineContent(2), 'line four');
		var words = mirrorModel.getAllWords();
		assert.equal(words.length, 4);
		assert.equal(words[0], 'line');
		assert.equal(words[1], 'three');
		assert.equal(words[2], 'line');
		assert.equal(words[3], 'four');

		var wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 4);
		assert.equal(wordsWithRanges[0].text, 'line');
		equalRange(wordsWithRanges[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
		assert.equal(wordsWithRanges[1].text, 'three');
		equalRange(wordsWithRanges[1].range, { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 11 });
		assert.equal(wordsWithRanges[2].text, 'line');
		equalRange(wordsWithRanges[2].range, { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 5 });
		assert.equal(wordsWithRanges[3].text, 'four');
		equalRange(wordsWithRanges[3].range, { startLineNumber: 2, startColumn: 6, endLineNumber: 2, endColumn: 10 });
	});

	test('delete all lines', () => {
		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesDeletedEvent(1, 4)]));

		var words = mirrorModel.getAllWords();
		assert.equal(words.length, 0);
		var wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 0);
	});

	test('add single lines', () => {
		assert.equal(mirrorModel.getLineContent(1), 'line one');

		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesInsertedEvent(1, 1, 'foo bar\nbar foo')]));

		assert.equal(mirrorModel.getLineContent(1), 'foo bar');
		assert.equal(mirrorModel.getLineContent(2), 'line one');

		var wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 10);
		assert.equal(wordsWithRanges[0].text, 'foo');
		equalRange(wordsWithRanges[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 });
		assert.equal(wordsWithRanges[1].text, 'bar');
		equalRange(wordsWithRanges[1].range, { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 8 });
	});


	test('add multiple lines', () => {
		assert.equal(mirrorModel.getLineContent(1), 'line one');

		mirrorModel.onEvents(mirrorModelEvents([contentChangedLinesInsertedEvent(1, 2, 'foo bar\nbar foo')]));

		assert.equal(mirrorModel.getLineContent(1), 'foo bar');
		assert.equal(mirrorModel.getLineContent(2), 'bar foo');
		assert.equal(mirrorModel.getLineContent(3), 'line one');

		var wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 12);
		assert.equal(wordsWithRanges[0].text, 'foo');
		equalRange(wordsWithRanges[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 });
		assert.equal(wordsWithRanges[1].text, 'bar');
		equalRange(wordsWithRanges[1].range, { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 8 });
		assert.equal(wordsWithRanges[2].text, 'bar');
		equalRange(wordsWithRanges[2].range, { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 4 });
		assert.equal(wordsWithRanges[3].text, 'foo');
		equalRange(wordsWithRanges[3].range, { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 8 });
	});

	test('change line', () => {
		assert.equal(mirrorModel.getLineContent(1), 'line one');
		var wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 8);

		mirrorModel.onEvents(mirrorModelEvents([contentChangedLineChanged(1, 'foobar')]));

		assert.equal(mirrorModel.getLineContent(1), 'foobar');
		wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 7);
		assert.equal(wordsWithRanges[0].text, 'foobar');
		equalRange(wordsWithRanges[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 7 });
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
				defaultEOL: editorCommon.DefaultEndOfLine.LF
			}
		})]));

		assert.equal(mirrorModel.getLineContent(1), 'foo');
		assert.equal(mirrorModel.getLineContent(2), 'bar');
		var wordsWithRanges = mirrorModel.getAllWordsWithRange();
		assert.equal(wordsWithRanges.length, 2);
	});

});
