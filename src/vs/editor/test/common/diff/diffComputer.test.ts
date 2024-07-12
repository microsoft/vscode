/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Constants } from 'vs/base/common/uint';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Range } from 'vs/editor/common/core/range';
import { DiffComputer, ICharChange, ILineChange } from 'vs/editor/common/diff/legacyLinesDiffComputer';
import { IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { createTextModel } from 'vs/editor/test/common/testTextModel';

function assertDiff(originalLines: string[], modifiedLines: string[], expectedChanges: ILineChange[], shouldComputeCharChanges: boolean = true, shouldPostProcessCharChanges: boolean = false, shouldIgnoreTrimWhitespace: boolean = false) {
	const diffComputer = new DiffComputer(originalLines, modifiedLines, {
		shouldComputeCharChanges,
		shouldPostProcessCharChanges,
		shouldIgnoreTrimWhitespace,
		shouldMakePrettyDiff: true,
		maxComputationTime: 0
	});
	const changes = diffComputer.computeDiff().changes;

	const mapCharChange = (charChange: ICharChange) => {
		return {
			originalStartLineNumber: charChange.originalStartLineNumber,
			originalStartColumn: charChange.originalStartColumn,
			originalEndLineNumber: charChange.originalEndLineNumber,
			originalEndColumn: charChange.originalEndColumn,
			modifiedStartLineNumber: charChange.modifiedStartLineNumber,
			modifiedStartColumn: charChange.modifiedStartColumn,
			modifiedEndLineNumber: charChange.modifiedEndLineNumber,
			modifiedEndColumn: charChange.modifiedEndColumn,
		};
	};

	const actual = changes.map((lineChange) => {
		return {
			originalStartLineNumber: lineChange.originalStartLineNumber,
			originalEndLineNumber: lineChange.originalEndLineNumber,
			modifiedStartLineNumber: lineChange.modifiedStartLineNumber,
			modifiedEndLineNumber: lineChange.modifiedEndLineNumber,
			charChanges: (lineChange.charChanges ? lineChange.charChanges.map(mapCharChange) : undefined)
		};
	});

	assert.deepStrictEqual(actual, expectedChanges);

	if (!shouldIgnoreTrimWhitespace) {
		// The diffs should describe how to apply edits to the original text model to get to the modified text model.

		const modifiedTextModel = createTextModel(modifiedLines.join('\n'));
		const expectedValue = modifiedTextModel.getValue();

		{
			// Line changes:
			const originalTextModel = createTextModel(originalLines.join('\n'));
			originalTextModel.applyEdits(changes.map(c => getLineEdit(c, modifiedTextModel)));
			assert.deepStrictEqual(originalTextModel.getValue(), expectedValue);
			originalTextModel.dispose();
		}

		if (shouldComputeCharChanges) {
			// Char changes:
			const originalTextModel = createTextModel(originalLines.join('\n'));
			originalTextModel.applyEdits(changes.flatMap(c => getCharEdits(c, modifiedTextModel)));
			assert.deepStrictEqual(originalTextModel.getValue(), expectedValue);
			originalTextModel.dispose();
		}

		modifiedTextModel.dispose();
	}
}

function getCharEdits(lineChange: ILineChange, modifiedTextModel: ITextModel): IIdentifiedSingleEditOperation[] {
	if (!lineChange.charChanges) {
		return [getLineEdit(lineChange, modifiedTextModel)];
	}
	return lineChange.charChanges.map(c => {
		const originalRange = new Range(c.originalStartLineNumber, c.originalStartColumn, c.originalEndLineNumber, c.originalEndColumn);
		const modifiedRange = new Range(c.modifiedStartLineNumber, c.modifiedStartColumn, c.modifiedEndLineNumber, c.modifiedEndColumn);
		return {
			range: originalRange,
			text: modifiedTextModel.getValueInRange(modifiedRange)
		};
	});
}

function getLineEdit(lineChange: ILineChange, modifiedTextModel: ITextModel): IIdentifiedSingleEditOperation {
	let originalRange: LineRange;
	if (lineChange.originalEndLineNumber === 0) {
		// Insertion
		originalRange = new LineRange(lineChange.originalStartLineNumber + 1, 0);
	} else {
		originalRange = new LineRange(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1);
	}

	let modifiedRange: LineRange;
	if (lineChange.modifiedEndLineNumber === 0) {
		// Deletion
		modifiedRange = new LineRange(lineChange.modifiedStartLineNumber + 1, 0);
	} else {
		modifiedRange = new LineRange(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1);
	}

	const [r1, r2] = diffFromLineRanges(originalRange, modifiedRange);
	return {
		range: r1,
		text: modifiedTextModel.getValueInRange(r2),
	};
}

function diffFromLineRanges(originalRange: LineRange, modifiedRange: LineRange): [Range, Range] {
	if (originalRange.startLineNumber === 1 || modifiedRange.startLineNumber === 1) {
		if (!originalRange.isEmpty && !modifiedRange.isEmpty) {
			return [
				new Range(
					originalRange.startLineNumber,
					1,
					originalRange.endLineNumberExclusive - 1,
					Constants.MAX_SAFE_SMALL_INTEGER,
				),
				new Range(
					modifiedRange.startLineNumber,
					1,
					modifiedRange.endLineNumberExclusive - 1,
					Constants.MAX_SAFE_SMALL_INTEGER,
				)
			];
		}

		// When one of them is one and one of them is empty, the other cannot be the last line of the document
		return [
			new Range(
				originalRange.startLineNumber,
				1,
				originalRange.endLineNumberExclusive,
				1,
			),
			new Range(
				modifiedRange.startLineNumber,
				1,
				modifiedRange.endLineNumberExclusive,
				1,
			)
		];
	}

	return [
		new Range(
			originalRange.startLineNumber - 1,
			Constants.MAX_SAFE_SMALL_INTEGER,
			originalRange.endLineNumberExclusive - 1,
			Constants.MAX_SAFE_SMALL_INTEGER,
		),
		new Range(
			modifiedRange.startLineNumber - 1,
			Constants.MAX_SAFE_SMALL_INTEGER,
			modifiedRange.endLineNumberExclusive - 1,
			Constants.MAX_SAFE_SMALL_INTEGER,
		)
	];
}

class LineRange {
	public constructor(
		public readonly startLineNumber: number,
		public readonly lineCount: number
	) { }

	public get isEmpty(): boolean {
		return this.lineCount === 0;
	}

	public get endLineNumberExclusive(): number {
		return this.startLineNumber + this.lineCount;
	}
}

function createLineDeletion(startLineNumber: number, endLineNumber: number, modifiedLineNumber: number): ILineChange {
	return {
		originalStartLineNumber: startLineNumber,
		originalEndLineNumber: endLineNumber,
		modifiedStartLineNumber: modifiedLineNumber,
		modifiedEndLineNumber: 0,
		charChanges: undefined
	};
}

function createLineInsertion(startLineNumber: number, endLineNumber: number, originalLineNumber: number): ILineChange {
	return {
		originalStartLineNumber: originalLineNumber,
		originalEndLineNumber: 0,
		modifiedStartLineNumber: startLineNumber,
		modifiedEndLineNumber: endLineNumber,
		charChanges: undefined
	};
}

function createLineChange(originalStartLineNumber: number, originalEndLineNumber: number, modifiedStartLineNumber: number, modifiedEndLineNumber: number, charChanges?: ICharChange[]): ILineChange {
	return {
		originalStartLineNumber: originalStartLineNumber,
		originalEndLineNumber: originalEndLineNumber,
		modifiedStartLineNumber: modifiedStartLineNumber,
		modifiedEndLineNumber: modifiedEndLineNumber,
		charChanges: charChanges
	};
}

function createCharChange(
	originalStartLineNumber: number, originalStartColumn: number, originalEndLineNumber: number, originalEndColumn: number,
	modifiedStartLineNumber: number, modifiedStartColumn: number, modifiedEndLineNumber: number, modifiedEndColumn: number
) {
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

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- insertions

	test('one inserted line below', () => {
		const original = ['line'];
		const modified = ['line', 'new line'];
		const expected = [createLineInsertion(2, 2, 1)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines below', () => {
		const original = ['line'];
		const modified = ['line', 'new line', 'another new line'];
		const expected = [createLineInsertion(2, 3, 1)];
		assertDiff(original, modified, expected);
	});

	test('one inserted line above', () => {
		const original = ['line'];
		const modified = ['new line', 'line'];
		const expected = [createLineInsertion(1, 1, 0)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines above', () => {
		const original = ['line'];
		const modified = ['new line', 'another new line', 'line'];
		const expected = [createLineInsertion(1, 2, 0)];
		assertDiff(original, modified, expected);
	});

	test('one inserted line in middle', () => {
		const original = ['line1', 'line2', 'line3', 'line4'];
		const modified = ['line1', 'line2', 'new line', 'line3', 'line4'];
		const expected = [createLineInsertion(3, 3, 2)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines in middle', () => {
		const original = ['line1', 'line2', 'line3', 'line4'];
		const modified = ['line1', 'line2', 'new line', 'another new line', 'line3', 'line4'];
		const expected = [createLineInsertion(3, 4, 2)];
		assertDiff(original, modified, expected);
	});

	test('two inserted lines in middle interrupted', () => {
		const original = ['line1', 'line2', 'line3', 'line4'];
		const modified = ['line1', 'line2', 'new line', 'line3', 'another new line', 'line4'];
		const expected = [createLineInsertion(3, 3, 2), createLineInsertion(5, 5, 3)];
		assertDiff(original, modified, expected);
	});

	// ---- deletions

	test('one deleted line below', () => {
		const original = ['line', 'new line'];
		const modified = ['line'];
		const expected = [createLineDeletion(2, 2, 1)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines below', () => {
		const original = ['line', 'new line', 'another new line'];
		const modified = ['line'];
		const expected = [createLineDeletion(2, 3, 1)];
		assertDiff(original, modified, expected);
	});

	test('one deleted lines above', () => {
		const original = ['new line', 'line'];
		const modified = ['line'];
		const expected = [createLineDeletion(1, 1, 0)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines above', () => {
		const original = ['new line', 'another new line', 'line'];
		const modified = ['line'];
		const expected = [createLineDeletion(1, 2, 0)];
		assertDiff(original, modified, expected);
	});

	test('one deleted line in middle', () => {
		const original = ['line1', 'line2', 'new line', 'line3', 'line4'];
		const modified = ['line1', 'line2', 'line3', 'line4'];
		const expected = [createLineDeletion(3, 3, 2)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines in middle', () => {
		const original = ['line1', 'line2', 'new line', 'another new line', 'line3', 'line4'];
		const modified = ['line1', 'line2', 'line3', 'line4'];
		const expected = [createLineDeletion(3, 4, 2)];
		assertDiff(original, modified, expected);
	});

	test('two deleted lines in middle interrupted', () => {
		const original = ['line1', 'line2', 'new line', 'line3', 'another new line', 'line4'];
		const modified = ['line1', 'line2', 'line3', 'line4'];
		const expected = [createLineDeletion(3, 3, 2), createLineDeletion(5, 5, 3)];
		assertDiff(original, modified, expected);
	});

	// ---- changes

	test('one line changed: chars inserted at the end', () => {
		const original = ['line'];
		const modified = ['line changed'];
		const expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 5, 1, 5, 1, 5, 1, 13)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars inserted at the beginning', () => {
		const original = ['line'];
		const modified = ['my line'];
		const expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 1, 1, 1, 1, 1, 1, 4)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars inserted in the middle', () => {
		const original = ['abba'];
		const modified = ['abzzba'];
		const expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 3, 1, 3, 1, 3, 1, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars inserted in the middle (two spots)', () => {
		const original = ['abba'];
		const modified = ['abzzbzza'];
		const expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 3, 1, 3, 1, 3, 1, 5),
				createCharChange(1, 4, 1, 4, 1, 6, 1, 8)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars deleted 1', () => {
		const original = ['abcdefg'];
		const modified = ['abcfg'];
		const expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 4, 1, 6, 1, 4, 1, 4)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('one line changed: chars deleted 2', () => {
		const original = ['abcdefg'];
		const modified = ['acfg'];
		const expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 2, 1, 3, 1, 2, 1, 2),
				createCharChange(1, 4, 1, 6, 1, 3, 1, 3)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('two lines changed 1', () => {
		const original = ['abcd', 'efgh'];
		const modified = ['abcz'];
		const expected = [
			createLineChange(1, 2, 1, 1, [
				createCharChange(1, 4, 2, 5, 1, 4, 1, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('two lines changed 2', () => {
		const original = ['foo', 'abcd', 'efgh', 'BAR'];
		const modified = ['foo', 'abcz', 'BAR'];
		const expected = [
			createLineChange(2, 3, 2, 2, [
				createCharChange(2, 4, 3, 5, 2, 4, 2, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('two lines changed 3', () => {
		const original = ['foo', 'abcd', 'efgh', 'BAR'];
		const modified = ['foo', 'abcz', 'zzzzefgh', 'BAR'];
		const expected = [
			createLineChange(2, 3, 2, 3, [
				createCharChange(2, 4, 2, 5, 2, 4, 2, 5),
				createCharChange(3, 1, 3, 1, 3, 1, 3, 5)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('two lines changed 4', () => {
		const original = ['abc'];
		const modified = ['', '', 'axc', ''];
		const expected = [
			createLineChange(1, 1, 1, 4, [
				createCharChange(1, 1, 1, 1, 1, 1, 3, 1),
				createCharChange(1, 2, 1, 3, 3, 2, 3, 3),
				createCharChange(1, 4, 1, 4, 3, 4, 4, 1)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('empty original sequence in char diff', () => {
		const original = ['abc', '', 'xyz'];
		const modified = ['abc', 'qwe', 'rty', 'xyz'];
		const expected = [
			createLineChange(2, 2, 2, 3)
		];
		assertDiff(original, modified, expected);
	});

	test('three lines changed', () => {
		const original = ['foo', 'abcd', 'efgh', 'BAR'];
		const modified = ['foo', 'zzzefgh', 'xxx', 'BAR'];
		const expected = [
			createLineChange(2, 3, 2, 3, [
				createCharChange(2, 1, 3, 1, 2, 1, 2, 4),
				createCharChange(3, 5, 3, 5, 2, 8, 3, 4),
			])
		];
		assertDiff(original, modified, expected);
	});

	test('big change part 1', () => {
		const original = ['foo', 'abcd', 'efgh', 'BAR'];
		const modified = ['hello', 'foo', 'zzzefgh', 'xxx', 'BAR'];
		const expected = [
			createLineInsertion(1, 1, 0),
			createLineChange(2, 3, 3, 4, [
				createCharChange(2, 1, 3, 1, 3, 1, 3, 4),
				createCharChange(3, 5, 3, 5, 3, 8, 4, 4)
			])
		];
		assertDiff(original, modified, expected);
	});

	test('big change part 2', () => {
		const original = ['foo', 'abcd', 'efgh', 'BAR', 'RAB'];
		const modified = ['hello', 'foo', 'zzzefgh', 'xxx', 'BAR'];
		const expected = [
			createLineInsertion(1, 1, 0),
			createLineChange(2, 3, 3, 4, [
				createCharChange(2, 1, 3, 1, 3, 1, 3, 4),
				createCharChange(3, 5, 3, 5, 3, 8, 4, 4)
			]),
			createLineDeletion(5, 5, 5)
		];
		assertDiff(original, modified, expected);
	});

	test('char change postprocessing merges', () => {
		const original = ['abba'];
		const modified = ['azzzbzzzbzzza'];
		const expected = [
			createLineChange(1, 1, 1, 1, [
				createCharChange(1, 2, 1, 4, 1, 2, 1, 13)
			])
		];
		assertDiff(original, modified, expected, true, true);
	});

	test('ignore trim whitespace', () => {
		const original = ['\t\t foo ', 'abcd', 'efgh', '\t\t BAR\t\t'];
		const modified = ['  hello\t', '\t foo   \t', 'zzzefgh', 'xxx', '   BAR   \t'];
		const expected = [
			createLineInsertion(1, 1, 0),
			createLineChange(2, 3, 3, 4, [
				createCharChange(2, 1, 2, 5, 3, 1, 3, 4),
				createCharChange(3, 5, 3, 5, 4, 1, 4, 4)
			])
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('issue #12122 r.hasOwnProperty is not a function', () => {
		const original = ['hasOwnProperty'];
		const modified = ['hasOwnProperty', 'and another line'];
		const expected = [
			createLineInsertion(2, 2, 1)
		];
		assertDiff(original, modified, expected);
	});

	test('empty diff 1', () => {
		const original = [''];
		const modified = ['something'];
		const expected = [
			createLineChange(1, 1, 1, 1, undefined)
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('empty diff 2', () => {
		const original = [''];
		const modified = ['something', 'something else'];
		const expected = [
			createLineChange(1, 1, 1, 2, undefined)
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('empty diff 3', () => {
		const original = ['something', 'something else'];
		const modified = [''];
		const expected = [
			createLineChange(1, 2, 1, 1, undefined)
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('empty diff 4', () => {
		const original = ['something'];
		const modified = [''];
		const expected = [
			createLineChange(1, 1, 1, 1, undefined)
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('empty diff 5', () => {
		const original = [''];
		const modified = [''];
		const expected: ILineChange[] = [];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('pretty diff 1', () => {
		const original = [
			'suite(function () {',
			'	test1() {',
			'		assert.ok(true);',
			'	}',
			'',
			'	test2() {',
			'		assert.ok(true);',
			'	}',
			'});',
			'',
		];
		const modified = [
			'// An insertion',
			'suite(function () {',
			'	test1() {',
			'		assert.ok(true);',
			'	}',
			'',
			'	test2() {',
			'		assert.ok(true);',
			'	}',
			'',
			'	test3() {',
			'		assert.ok(true);',
			'	}',
			'});',
			'',
		];
		const expected = [
			createLineInsertion(1, 1, 0),
			createLineInsertion(10, 13, 8)
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('pretty diff 2', () => {
		const original = [
			'// Just a comment',
			'',
			'function compute(a, b, c, d) {',
			'	if (a) {',
			'		if (b) {',
			'			if (c) {',
			'				return 5;',
			'			}',
			'		}',
			'		// These next lines will be deleted',
			'		if (d) {',
			'			return -1;',
			'		}',
			'		return 0;',
			'	}',
			'}',
		];
		const modified = [
			'// Here is an inserted line',
			'// and another inserted line',
			'// and another one',
			'// Just a comment',
			'',
			'function compute(a, b, c, d) {',
			'	if (a) {',
			'		if (b) {',
			'			if (c) {',
			'				return 5;',
			'			}',
			'		}',
			'		return 0;',
			'	}',
			'}',
		];
		const expected = [
			createLineInsertion(1, 3, 0),
			createLineDeletion(10, 13, 12),
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('pretty diff 3', () => {
		const original = [
			'class A {',
			'	/**',
			'	 * m1',
			'	 */',
			'	method1() {}',
			'',
			'	/**',
			'	 * m3',
			'	 */',
			'	method3() {}',
			'}',
		];
		const modified = [
			'class A {',
			'	/**',
			'	 * m1',
			'	 */',
			'	method1() {}',
			'',
			'	/**',
			'	 * m2',
			'	 */',
			'	method2() {}',
			'',
			'	/**',
			'	 * m3',
			'	 */',
			'	method3() {}',
			'}',
		];
		const expected = [
			createLineInsertion(7, 11, 6)
		];
		assertDiff(original, modified, expected, true, false, true);
	});

	test('issue #23636', () => {
		const original = [
			'if(!TextDrawLoad[playerid])',
			'{',
			'',
			'	TextDrawHideForPlayer(playerid,TD_AppleJob[3]);',
			'	TextDrawHideForPlayer(playerid,TD_AppleJob[4]);',
			'	if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])',
			'	{',
			'		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[5+i]);',
			'	}',
			'	else',
			'	{',
			'		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[15+i]);',
			'	}',
			'}',
			'else',
			'{',
			'	TextDrawHideForPlayer(playerid,TD_AppleJob[3]);',
			'	TextDrawHideForPlayer(playerid,TD_AppleJob[27]);',
			'	if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])',
			'	{',
			'		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[28+i]);',
			'	}',
			'	else',
			'	{',
			'		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[38+i]);',
			'	}',
			'}',
		];
		const modified = [
			'	if(!TextDrawLoad[playerid])',
			'	{',
			'	',
			'		TextDrawHideForPlayer(playerid,TD_AppleJob[3]);',
			'		TextDrawHideForPlayer(playerid,TD_AppleJob[4]);',
			'		if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])',
			'		{',
			'			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[5+i]);',
			'		}',
			'		else',
			'		{',
			'			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[15+i]);',
			'		}',
			'	}',
			'	else',
			'	{',
			'		TextDrawHideForPlayer(playerid,TD_AppleJob[3]);',
			'		TextDrawHideForPlayer(playerid,TD_AppleJob[27]);',
			'		if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])',
			'		{',
			'			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[28+i]);',
			'		}',
			'		else',
			'		{',
			'			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[38+i]);',
			'		}',
			'	}',
		];
		const expected = [
			createLineChange(
				1, 27, 1, 27,
				[
					createCharChange(1, 1, 1, 1, 1, 1, 1, 2),
					createCharChange(2, 1, 2, 1, 2, 1, 2, 2),
					createCharChange(3, 1, 3, 1, 3, 1, 3, 2),
					createCharChange(4, 1, 4, 1, 4, 1, 4, 2),
					createCharChange(5, 1, 5, 1, 5, 1, 5, 2),
					createCharChange(6, 1, 6, 1, 6, 1, 6, 2),
					createCharChange(7, 1, 7, 1, 7, 1, 7, 2),
					createCharChange(8, 1, 8, 1, 8, 1, 8, 2),
					createCharChange(9, 1, 9, 1, 9, 1, 9, 2),
					createCharChange(10, 1, 10, 1, 10, 1, 10, 2),
					createCharChange(11, 1, 11, 1, 11, 1, 11, 2),
					createCharChange(12, 1, 12, 1, 12, 1, 12, 2),
					createCharChange(13, 1, 13, 1, 13, 1, 13, 2),
					createCharChange(14, 1, 14, 1, 14, 1, 14, 2),
					createCharChange(15, 1, 15, 1, 15, 1, 15, 2),
					createCharChange(16, 1, 16, 1, 16, 1, 16, 2),
					createCharChange(17, 1, 17, 1, 17, 1, 17, 2),
					createCharChange(18, 1, 18, 1, 18, 1, 18, 2),
					createCharChange(19, 1, 19, 1, 19, 1, 19, 2),
					createCharChange(20, 1, 20, 1, 20, 1, 20, 2),
					createCharChange(21, 1, 21, 1, 21, 1, 21, 2),
					createCharChange(22, 1, 22, 1, 22, 1, 22, 2),
					createCharChange(23, 1, 23, 1, 23, 1, 23, 2),
					createCharChange(24, 1, 24, 1, 24, 1, 24, 2),
					createCharChange(25, 1, 25, 1, 25, 1, 25, 2),
					createCharChange(26, 1, 26, 1, 26, 1, 26, 2),
					createCharChange(27, 1, 27, 1, 27, 1, 27, 2),
				]
			)
			// createLineInsertion(7, 11, 6)
		];
		assertDiff(original, modified, expected, true, true, false);
	});

	test('issue #43922', () => {
		const original = [
			' * `yarn [install]` -- Install project NPM dependencies. This is automatically done when you first create the project. You should only need to run this if you add dependencies in `package.json`.',
		];
		const modified = [
			' * `yarn` -- Install project NPM dependencies. You should only need to run this if you add dependencies in `package.json`.',
		];
		const expected = [
			createLineChange(
				1, 1, 1, 1,
				[
					createCharChange(1, 9, 1, 19, 1, 9, 1, 9),
					createCharChange(1, 58, 1, 120, 1, 48, 1, 48),
				]
			)
		];
		assertDiff(original, modified, expected, true, true, false);
	});

	test('issue #42751', () => {
		const original = [
			'    1',
			'  2',
		];
		const modified = [
			'    1',
			'   3',
		];
		const expected = [
			createLineChange(
				2, 2, 2, 2,
				[
					createCharChange(2, 3, 2, 4, 2, 3, 2, 5)
				]
			)
		];
		assertDiff(original, modified, expected, true, true, false);
	});

	test('does not give character changes', () => {
		const original = [
			'    1',
			'  2',
			'A',
		];
		const modified = [
			'    1',
			'   3',
			' A',
		];
		const expected = [
			createLineChange(
				2, 3, 2, 3
			)
		];
		assertDiff(original, modified, expected, false, false, false);
	});

	test('issue #44422: Less than ideal diff results', () => {
		const original = [
			'export class C {',
			'',
			'	public m1(): void {',
			'		{',
			'		//2',
			'		//3',
			'		//4',
			'		//5',
			'		//6',
			'		//7',
			'		//8',
			'		//9',
			'		//10',
			'		//11',
			'		//12',
			'		//13',
			'		//14',
			'		//15',
			'		//16',
			'		//17',
			'		//18',
			'		}',
			'	}',
			'',
			'	public m2(): void {',
			'		if (a) {',
			'			if (b) {',
			'				//A1',
			'				//A2',
			'				//A3',
			'				//A4',
			'				//A5',
			'				//A6',
			'				//A7',
			'				//A8',
			'			}',
			'		}',
			'',
			'		//A9',
			'		//A10',
			'		//A11',
			'		//A12',
			'		//A13',
			'		//A14',
			'		//A15',
			'	}',
			'',
			'	public m3(): void {',
			'		if (a) {',
			'			//B1',
			'		}',
			'		//B2',
			'		//B3',
			'	}',
			'',
			'	public m4(): boolean {',
			'		//1',
			'		//2',
			'		//3',
			'		//4',
			'	}',
			'',
			'}',
		];
		const modified = [
			'export class C {',
			'',
			'	constructor() {',
			'',
			'',
			'',
			'',
			'	}',
			'',
			'	public m1(): void {',
			'		{',
			'		//2',
			'		//3',
			'		//4',
			'		//5',
			'		//6',
			'		//7',
			'		//8',
			'		//9',
			'		//10',
			'		//11',
			'		//12',
			'		//13',
			'		//14',
			'		//15',
			'		//16',
			'		//17',
			'		//18',
			'		}',
			'	}',
			'',
			'	public m4(): boolean {',
			'		//1',
			'		//2',
			'		//3',
			'		//4',
			'	}',
			'',
			'}',
		];
		const expected = [
			createLineChange(
				2, 0, 3, 9
			),
			createLineChange(
				25, 55, 31, 0
			)
		];
		assertDiff(original, modified, expected, false, false, false);
	});

	test('gives preference to matching longer lines', () => {
		const original = [
			'A',
			'A',
			'BB',
			'C',
		];
		const modified = [
			'A',
			'BB',
			'A',
			'D',
			'E',
			'A',
			'C',
		];
		const expected = [
			createLineChange(
				2, 2, 1, 0
			),
			createLineChange(
				3, 0, 3, 6
			)
		];
		assertDiff(original, modified, expected, false, false, false);
	});

	test('issue #119051: gives preference to fewer diff hunks', () => {
		const original = [
			'1',
			'',
			'',
			'2',
			'',
		];
		const modified = [
			'1',
			'',
			'1.5',
			'',
			'',
			'2',
			'',
			'3',
			'',
		];
		const expected = [
			createLineChange(
				2, 0, 3, 4
			),
			createLineChange(
				5, 0, 8, 9
			)
		];
		assertDiff(original, modified, expected, false, false, false);
	});

	test('issue #121436: Diff chunk contains an unchanged line part 1', () => {
		const original = [
			'if (cond) {',
			'    cmd',
			'}',
		];
		const modified = [
			'if (cond) {',
			'    if (other_cond) {',
			'        cmd',
			'    }',
			'}',
		];
		const expected = [
			createLineChange(
				1, 0, 2, 2
			),
			createLineChange(
				2, 0, 4, 4
			)
		];
		assertDiff(original, modified, expected, false, false, true);
	});

	test('issue #121436: Diff chunk contains an unchanged line part 2', () => {
		const original = [
			'if (cond) {',
			'    cmd',
			'}',
		];
		const modified = [
			'if (cond) {',
			'    if (other_cond) {',
			'        cmd',
			'    }',
			'}',
		];
		const expected = [
			createLineChange(
				1, 0, 2, 2
			),
			createLineChange(
				2, 2, 3, 3
			),
			createLineChange(
				2, 0, 4, 4
			)
		];
		assertDiff(original, modified, expected, false, false, false);
	});

	test('issue #169552: Assertion error when having both leading and trailing whitespace diffs', () => {
		const original = [
			'if True:',
			'    print(2)',
		];
		const modified = [
			'if True:',
			'\tprint(2) ',
		];
		const expected = [
			createLineChange(
				2, 2, 2, 2,
				[
					createCharChange(2, 1, 2, 5, 2, 1, 2, 2),
					createCharChange(2, 13, 2, 13, 2, 10, 2, 11),
				]
			),
		];
		assertDiff(original, modified, expected, true, false, false);
	});
});
