/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { DiffComputer } from 'vs/editor/common/diff/diffComputer';
import { IChange, ICharChange, ILineChange } from 'vs/editor/common/editorCommon';

function extractCharChangeRepresentation(change, expectedChange): ICharChange {
	var hasOriginal = expectedChange && expectedChange.originalStartLineNumber > 0;
	var hasModified = expectedChange && expectedChange.modifiedStartLineNumber > 0;
	return {
		originalStartLineNumber: hasOriginal ? change.originalStartLineNumber : 0,
		originalStartColumn: hasOriginal ? change.originalStartColumn : 0,
		originalEndLineNumber: hasOriginal ? change.originalEndLineNumber : 0,
		originalEndColumn: hasOriginal ? change.originalEndColumn : 0,

		modifiedStartLineNumber: hasModified ? change.modifiedStartLineNumber : 0,
		modifiedStartColumn: hasModified ? change.modifiedStartColumn : 0,
		modifiedEndLineNumber: hasModified ? change.modifiedEndLineNumber : 0,
		modifiedEndColumn: hasModified ? change.modifiedEndColumn : 0,
	};
}

function extractLineChangeRepresentation(change, expectedChange): IChange | ILineChange {
	if (change.charChanges) {
		let charChanges: ICharChange[] = [];
		for (let i = 0; i < change.charChanges.length; i++) {
			charChanges.push(
				extractCharChangeRepresentation(
					change.charChanges[i],
					expectedChange && expectedChange.charChanges && i < expectedChange.charChanges.length ? expectedChange.charChanges[i] : null
				)
			);
		}
		return {
			originalStartLineNumber: change.originalStartLineNumber,
			originalEndLineNumber: change.originalEndLineNumber,
			modifiedStartLineNumber: change.modifiedStartLineNumber,
			modifiedEndLineNumber: change.modifiedEndLineNumber,
			charChanges: charChanges
		};
	}
	return {
		originalStartLineNumber: change.originalStartLineNumber,
		originalEndLineNumber: change.originalEndLineNumber,
		modifiedStartLineNumber: change.modifiedStartLineNumber,
		modifiedEndLineNumber: change.modifiedEndLineNumber
	};
}

function assertDiff(originalLines: string[], modifiedLines: string[], expectedChanges: IChange[], shouldPostProcessCharChanges: boolean = false, shouldIgnoreTrimWhitespace: boolean = false) {
	var diffComputer = new DiffComputer(originalLines, modifiedLines, {
		shouldPostProcessCharChanges: shouldPostProcessCharChanges || false,
		shouldIgnoreTrimWhitespace: shouldIgnoreTrimWhitespace || false,
		shouldConsiderTrimWhitespaceInEmptyCase: true
	});
	var changes = diffComputer.computeDiff();

	var extracted = [];
	for (var i = 0; i < changes.length; i++) {
		extracted.push(extractLineChangeRepresentation(changes[i], i < expectedChanges.length ? expectedChanges[i] : null));
	}
	assert.deepEqual(extracted, expectedChanges);
}

function createLineDeletion(startLineNumber, endLineNumber, modifiedLineNumber): IChange {
	return {
		originalStartLineNumber: startLineNumber,
		originalEndLineNumber: endLineNumber,
		modifiedStartLineNumber: modifiedLineNumber,
		modifiedEndLineNumber: 0
	};
}

function createLineInsertion(startLineNumber, endLineNumber, originalLineNumber): IChange {
	return {
		originalStartLineNumber: originalLineNumber,
		originalEndLineNumber: 0,
		modifiedStartLineNumber: startLineNumber,
		modifiedEndLineNumber: endLineNumber
	};
}

function createLineChange(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges): ILineChange {
	return {
		originalStartLineNumber: originalStartLineNumber,
		originalEndLineNumber: originalEndLineNumber,
		modifiedStartLineNumber: modifiedStartLineNumber,
		modifiedEndLineNumber: modifiedEndLineNumber,
		charChanges: charChanges
	};
}

function createCharInsertion(startLineNumber, startColumn, endLineNumber, endColumn) {
	return {
		originalStartLineNumber: 0,
		originalStartColumn: 0,
		originalEndLineNumber: 0,
		originalEndColumn: 0,
		modifiedStartLineNumber: startLineNumber,
		modifiedStartColumn: startColumn,
		modifiedEndLineNumber: endLineNumber,
		modifiedEndColumn: endColumn
	};
}

function createCharDeletion(startLineNumber, startColumn, endLineNumber, endColumn) {
	return {
		originalStartLineNumber: startLineNumber,
		originalStartColumn: startColumn,
		originalEndLineNumber: endLineNumber,
		originalEndColumn: endColumn,
		modifiedStartLineNumber: 0,
		modifiedStartColumn: 0,
		modifiedEndLineNumber: 0,
		modifiedEndColumn: 0
	};
}

function createCharChange(originalStartLineNumber, originalStartColumn, originalEndLineNumber, originalEndColumn,
	modifiedStartLineNumber, modifiedStartColumn, modifiedEndLineNumber, modifiedEndColumn) {
	return {
		originalStartLineNumber: originalStartLineNumber,
		originalStartColumn: originalStartColumn,
		originalEndLineNumber: originalEndLineNumber,
		originalEndColumn: originalEndColumn,
		modifiedStartLineNumber: modifiedStartLineNumber,
		modifiedStartColumn: modifiedStartColumn,
		modifiedEndLineNumber: modifiedEndLineNumber,
		modifiedEndColumn: modifiedEndColumn
	};
}

suite('Editor Diff - DiffComputer', () => {

	// ---- insertions

	test('one inserted line below', () => {
		var original = ['line'];
		var modified = ['line', 'new line'];
		var expected = [createLineInsertion(2, 2, 1)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines below', () => {
		var original = ['line'];
		var modified = ['line', 'new line', 'another new line'];
		var expected = [createLineInsertion(2, 3, 1)];
		assertDiff(original, modified, expected);
	});

	test('one inserted line above', () => {
		var original = ['line'];
		var modified = ['new line', 'line'];
		var expected = [createLineInsertion(1, 1, 0)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines above', () => {
		var original = ['line'];
		var modified = ['new line', 'another new line', 'line'];
		var expected = [createLineInsertion(1, 2, 0)];
		assertDiff(original, modified, expected);
	});

	test('one inserted line in middle', () => {
		var original = ['line1', 'line2', 'line3', 'line4'];
		var modified = ['line1', 'line2', 'new line', 'line3', 'line4'];
		var expected = [createLineInsertion(3, 3, 2)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines in middle', () => {
		var original = ['line1', 'line2', 'line3', 'line4'];
		var modified = ['line1', 'line2', 'new line', 'another new line', 'line3', 'line4'];
		var expected = [createLineInsertion(3, 4, 2)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines in middle interrupted', () => {
		var original = ['line1', 'line2', 'line3', 'line4'];
		var modified = ['line1', 'line2', 'new line', 'line3', 'another new line', 'line4'];
		var expected = [createLineInsertion(3, 3, 2), createLineInsertion(5, 5, 3)];
		assertDiff(original, modified, expected);
	});

	// ---- deletions

	test('one deleted line below', () => {
		var original = ['line', 'new line'];
		var modified = ['line'];
		var expected = [createLineDeletion(2, 2, 1)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines below', () => {
		var original = ['line', 'new line', 'another new line'];
		var modified = ['line'];
		var expected = [createLineDeletion(2, 3, 1)];
		assertDiff(original, modified, expected);
	});

	test('one deleted lines above', () => {
		var original = ['new line', 'line'];
		var modified = ['line'];
		var expected = [createLineDeletion(1, 1, 0)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines above', () => {
		var original = ['new line', 'another new line', 'line'];
		var modified = ['line'];
		var expected = [createLineDeletion(1, 2, 0)];
		assertDiff(original, modified, expected);
	});

	test('one deleted line in middle', () => {
		var original = ['line1', 'line2', 'new line', 'line3', 'line4'];
		var modified = ['line1', 'line2', 'line3', 'line4'];
		var expected = [createLineDeletion(3, 3, 2)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines in middle', () => {
		var original = ['line1', 'line2', 'new line', 'another new line', 'line3', 'line4'];
		var modified = ['line1', 'line2', 'line3', 'line4'];
		var expected = [createLineDeletion(3, 4, 2)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines in middle interrupted', () => {
		var original = ['line1', 'line2', 'new line', 'line3', 'another new line', 'line4'];
		var modified = ['line1', 'line2', 'line3', 'line4'];
		var expected = [createLineDeletion(3, 3, 2), createLineDeletion(5, 5, 3)];
		assertDiff(original, modified, expected);
	});

	// ---- changes

	test('one line changed: chars inserted at the end', () => {
		var original = ['line'];
		var modified = ['line changed'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharInsertion(1, 5, 1, 13)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars inserted at the beginning', () => {
		var original = ['line'];
		var modified = ['my line'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharInsertion(1, 1, 1, 4)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars inserted in the middle', () => {
		var original = ['abba'];
		var modified = ['abzzba'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharInsertion(1, 3, 1, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars inserted in the middle (two spots)', () => {
		var original = ['abba'];
		var modified = ['abzzbzza'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharInsertion(1, 3, 1, 5),
				createCharInsertion(1, 6, 1, 8)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars deleted 1', () => {
		var original = ['abcdefg'];
		var modified = ['abcfg'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharDeletion(1, 4, 1, 6)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars deleted 2', () => {
		var original = ['abcdefg'];
		var modified = ['acfg'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharDeletion(1, 2, 1, 3),
				createCharDeletion(1, 4, 1, 6)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('two lines changed 1', () => {
		var original = ['abcd', 'efgh'];
		var modified = ['abcz'];
		var expected = [
			createLineChange(1, 2, 1, 1, [
				createCharChange(1, 4, 2, 5, 1, 4, 1, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('two lines changed 2', () => {
		var original = ['foo', 'abcd', 'efgh', 'BAR'];
		var modified = ['foo', 'abcz', 'BAR'];
		var expected = [
			createLineChange(2, 3, 2, 2, [
				createCharChange(2, 4, 3, 5, 2, 4, 2, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('two lines changed 3', () => {
		var original = ['foo', 'abcd', 'efgh', 'BAR'];
		var modified = ['foo', 'abcz', 'zzzzefgh', 'BAR'];
		var expected = [
			createLineChange(2, 3, 2, 3, [
				createCharChange(2, 4, 2, 5, 2, 4, 3, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('three lines changed', () => {
		var original = ['foo', 'abcd', 'efgh', 'BAR'];
		var modified = ['foo', 'zzzefgh', 'xxx', 'BAR'];
		var expected = [
			createLineChange(2, 3, 2, 3, [
				createCharChange(2, 1, 2, 5, 2, 1, 2, 4),
				createCharInsertion(3, 1, 3, 4)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('big change part 1', () => {
		var original = ['foo', 'abcd', 'efgh', 'BAR'];
		var modified = ['hello', 'foo', 'zzzefgh', 'xxx', 'BAR'];
		var expected = [
			createLineInsertion(1, 1, 0),
			createLineChange(2, 3, 3, 4, [
				createCharChange(2, 1, 2, 5, 3, 1, 3, 4),
				createCharInsertion(4, 1, 4, 4)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('big change part 2', () => {
		var original = ['foo', 'abcd', 'efgh', 'BAR', 'RAB'];
		var modified = ['hello', 'foo', 'zzzefgh', 'xxx', 'BAR'];
		var expected = [
			createLineInsertion(1, 1, 0),
			createLineChange(2, 3, 3, 4, [
				createCharChange(2, 1, 2, 5, 3, 1, 3, 4),
				createCharInsertion(4, 1, 4, 4)
			]),
			createLineDeletion(5, 5, 5)
		];
		assertDiff(original, modified, expected);
	});

	test('char change postprocessing merges', () => {
		var original = ['abba'];
		var modified = ['azzzbzzzbzzza'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 2, 1, 4, 1, 2, 1, 13)
			])
		];
		assertDiff(original, modified, expected, true);
	});

	test('ignore trim whitespace', () => {
		var original = ['\t\t foo ', 'abcd', 'efgh', '\t\t BAR\t\t'];
		var modified = ['  hello\t', '\t foo   \t', 'zzzefgh', 'xxx', '   BAR   \t'];
		var expected = [
			createLineInsertion(1, 1, 0),
			createLineChange(2, 3, 3, 4, [
				createCharChange(2, 1, 2, 5, 3, 1, 3, 4),
				createCharInsertion(4, 1, 4, 4)
			])
		];
		assertDiff(original, modified, expected, false, true);
	});

	test('issue #12122 r.hasOwnProperty is not a function', () => {
		var original = ['hasOwnProperty'];
		var modified = ['hasOwnProperty', 'and another line'];
		var expected = [
			createLineInsertion(2, 2, 1)
		];
		assertDiff(original, modified, expected);
	});

	test('empty diff 1', () => {
		var original = [''];
		var modified = ['something'];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assertDiff(original, modified, expected, false, true);
	});

	test('empty diff 2', () => {
		var original = [''];
		var modified = ['something', 'something else'];
		var expected = [
			createLineChange(1, 1, 1, 2, [
				createCharChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assertDiff(original, modified, expected, false, true);
	});

	test('empty diff 3', () => {
		var original = ['something', 'something else'];
		var modified = [''];
		var expected = [
			createLineChange(1, 2, 1, 1, [
				createCharChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assertDiff(original, modified, expected, false, true);
	});

	test('empty diff 4', () => {
		var original = ['something'];
		var modified = [''];
		var expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assertDiff(original, modified, expected, false, true);
	});
});
