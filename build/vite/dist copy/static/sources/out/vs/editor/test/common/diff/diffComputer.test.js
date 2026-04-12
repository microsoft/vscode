/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { DiffComputer } from '../../../common/diff/legacyLinesDiffComputer.js';
import { createTextModel } from '../testTextModel.js';
function assertDiff(originalLines, modifiedLines, expectedChanges, shouldComputeCharChanges = true, shouldPostProcessCharChanges = false, shouldIgnoreTrimWhitespace = false) {
    const diffComputer = new DiffComputer(originalLines, modifiedLines, {
        shouldComputeCharChanges,
        shouldPostProcessCharChanges,
        shouldIgnoreTrimWhitespace,
        shouldMakePrettyDiff: true,
        maxComputationTime: 0
    });
    const changes = diffComputer.computeDiff().changes;
    const mapCharChange = (charChange) => {
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
function getCharEdits(lineChange, modifiedTextModel) {
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
function getLineEdit(lineChange, modifiedTextModel) {
    let originalRange;
    if (lineChange.originalEndLineNumber === 0) {
        // Insertion
        originalRange = new LineRange(lineChange.originalStartLineNumber + 1, 0);
    }
    else {
        originalRange = new LineRange(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1);
    }
    let modifiedRange;
    if (lineChange.modifiedEndLineNumber === 0) {
        // Deletion
        modifiedRange = new LineRange(lineChange.modifiedStartLineNumber + 1, 0);
    }
    else {
        modifiedRange = new LineRange(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1);
    }
    const [r1, r2] = diffFromLineRanges(originalRange, modifiedRange);
    return {
        range: r1,
        text: modifiedTextModel.getValueInRange(r2),
    };
}
function diffFromLineRanges(originalRange, modifiedRange) {
    if (originalRange.startLineNumber === 1 || modifiedRange.startLineNumber === 1) {
        if (!originalRange.isEmpty && !modifiedRange.isEmpty) {
            return [
                new Range(originalRange.startLineNumber, 1, originalRange.endLineNumberExclusive - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
                new Range(modifiedRange.startLineNumber, 1, modifiedRange.endLineNumberExclusive - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */)
            ];
        }
        // When one of them is one and one of them is empty, the other cannot be the last line of the document
        return [
            new Range(originalRange.startLineNumber, 1, originalRange.endLineNumberExclusive, 1),
            new Range(modifiedRange.startLineNumber, 1, modifiedRange.endLineNumberExclusive, 1)
        ];
    }
    return [
        new Range(originalRange.startLineNumber - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */, originalRange.endLineNumberExclusive - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        new Range(modifiedRange.startLineNumber - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */, modifiedRange.endLineNumberExclusive - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */)
    ];
}
class LineRange {
    constructor(startLineNumber, lineCount) {
        this.startLineNumber = startLineNumber;
        this.lineCount = lineCount;
    }
    get isEmpty() {
        return this.lineCount === 0;
    }
    get endLineNumberExclusive() {
        return this.startLineNumber + this.lineCount;
    }
}
function createLineDeletion(startLineNumber, endLineNumber, modifiedLineNumber) {
    return {
        originalStartLineNumber: startLineNumber,
        originalEndLineNumber: endLineNumber,
        modifiedStartLineNumber: modifiedLineNumber,
        modifiedEndLineNumber: 0,
        charChanges: undefined
    };
}
function createLineInsertion(startLineNumber, endLineNumber, originalLineNumber) {
    return {
        originalStartLineNumber: originalLineNumber,
        originalEndLineNumber: 0,
        modifiedStartLineNumber: startLineNumber,
        modifiedEndLineNumber: endLineNumber,
        charChanges: undefined
    };
}
function createLineChange(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges) {
    return {
        originalStartLineNumber: originalStartLineNumber,
        originalEndLineNumber: originalEndLineNumber,
        modifiedStartLineNumber: modifiedStartLineNumber,
        modifiedEndLineNumber: modifiedEndLineNumber,
        charChanges: charChanges
    };
}
function createCharChange(originalStartLineNumber, originalStartColumn, originalEndLineNumber, originalEndColumn, modifiedStartLineNumber, modifiedStartColumn, modifiedEndLineNumber, modifiedEndColumn) {
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
        const expected = [];
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
            createLineChange(1, 27, 1, 27, [
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
            ])
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
            createLineChange(1, 1, 1, 1, [
                createCharChange(1, 9, 1, 19, 1, 9, 1, 9),
                createCharChange(1, 58, 1, 120, 1, 48, 1, 48),
            ])
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
            createLineChange(2, 2, 2, 2, [
                createCharChange(2, 3, 2, 4, 2, 3, 2, 5)
            ])
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
            createLineChange(2, 3, 2, 3)
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
            createLineChange(2, 0, 3, 9),
            createLineChange(25, 55, 31, 0)
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
            createLineChange(2, 2, 1, 0),
            createLineChange(3, 0, 3, 6)
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
            createLineChange(2, 0, 3, 4),
            createLineChange(5, 0, 8, 9)
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
            createLineChange(1, 0, 2, 2),
            createLineChange(2, 0, 4, 4)
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
            createLineChange(1, 0, 2, 2),
            createLineChange(2, 2, 3, 3),
            createLineChange(2, 0, 4, 4)
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
            createLineChange(2, 2, 2, 2, [
                createCharChange(2, 1, 2, 5, 2, 1, 2, 2),
                createCharChange(2, 13, 2, 13, 2, 10, 2, 11),
            ]),
        ];
        assertDiff(original, modified, expected, true, false, false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkNvbXB1dGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vZGlmZi9kaWZmQ29tcHV0ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxZQUFZLEVBQTRCLE1BQU0saURBQWlELENBQUM7QUFFekcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXRELFNBQVMsVUFBVSxDQUFDLGFBQXVCLEVBQUUsYUFBdUIsRUFBRSxlQUE4QixFQUFFLDJCQUFvQyxJQUFJLEVBQUUsK0JBQXdDLEtBQUssRUFBRSw2QkFBc0MsS0FBSztJQUN6TyxNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFO1FBQ25FLHdCQUF3QjtRQUN4Qiw0QkFBNEI7UUFDNUIsMEJBQTBCO1FBQzFCLG9CQUFvQixFQUFFLElBQUk7UUFDMUIsa0JBQWtCLEVBQUUsQ0FBQztLQUNyQixDQUFDLENBQUM7SUFDSCxNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsV0FBVyxFQUFFLENBQUMsT0FBTyxDQUFDO0lBRW5ELE1BQU0sYUFBYSxHQUFHLENBQUMsVUFBdUIsRUFBRSxFQUFFO1FBQ2pELE9BQU87WUFDTix1QkFBdUIsRUFBRSxVQUFVLENBQUMsdUJBQXVCO1lBQzNELG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxtQkFBbUI7WUFDbkQscUJBQXFCLEVBQUUsVUFBVSxDQUFDLHFCQUFxQjtZQUN2RCxpQkFBaUIsRUFBRSxVQUFVLENBQUMs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akIsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtRQUNuQyxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN0QyxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFCLE1BQU0sUUFBUSxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9DLFVBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUNwQyxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUMxRCxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFCLE1BQU0sUUFBUSxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9DLFVBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUNwQyxNQUFNLFFBQVEsR0FBRyxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN0QyxNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFCLE1BQU0sUUFBUSxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9DLFVBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUNwQyxNQUFNLFFBQVEs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Q0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2FBQzVDLENBQ0Q7WUFDRCxnQ0FBZ0M7U0FDaEMsQ0FBQztRQUNGLFVB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