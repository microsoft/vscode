/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { locateNotebookFileChange, NotebookFileChange, NotebookFileChangeFailure, readNotebookFile } from '../../../browser/agentSessions/agentHost/agentHostNotebookFileChanges.js';

/** An ipynb file as the ipynb extension writes it, with code cells of the given sources. */
function notebook(...sources: (string[] | string)[]): string {
	const cells = sources.map(source => ({ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source }));
	return JSON.stringify({ cells, metadata: {}, nbformat: 4, nbformat_minor: 5 }, undefined, 1) + '\n';
}

/** The lines that the agent host is asked for, with the first and the last of them, or why there are none. */
function locate(baseline: string, current: string, change: NotebookFileChange): string {
	const baselineFile = readNotebookFile(baseline);
	const currentFile = readNotebookFile(current);
	assert.ok(baselineFile && currentFile);
	const located = locateNotebookFileChange(baselineFile, currentFile, change);
	if (located === NotebookFileChangeFailure.Unmatched) {
		return 'unmatched';
	}
	if (located === NotebookFileChangeFailure.Inseparable) {
		return 'inseparable';
	}
	const lines = (located.side === 'before' ? baselineFile : currentFile).lines;
	const first = located.lines.startLineNumber;
	const last = located.lines.endLineNumberExclusive - 1;
	return first === last ? `${located.side} ${first}: ${lines[first - 1].trim()}` : `${located.side} ${first}-${last}: ${lines[first - 1].trim()} … ${lines[last - 1].trim()}`;
}

/** Changes to the source of the cell `cell`, each as the lines it replaced and the lines that replaced them. */
function modified(cell: number, ...hunks: [original: LineRange, modified: LineRange][]): NotebookFileChange {
	return { kind: 'modified', cell, originalCell: cell, hunks: hunks.map(([original, modified]) => ({ original, modified })) };
}

function line(lineNumber: number): LineRange {
	return new LineRange(lineNumber, lineNumber + 1);
}

function before(lineNumber: number): LineRange {
	return new LineRange(lineNumber, lineNumber);
}

suite('AgentHostNotebookFileChanges', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('locates changed lines of the source of a cell', () => {
		const baseline = notebook(['a\n', 'b\n', 'c'], ['x']);
		const long = notebook(['a\n', 'b\n', 'c\n', 'd\n', 'e\n', 'f\n', 'g']);
		const longChanged = notebook(['A\n', 'b\n', 'c\n', 'd\n', 'e\n', 'f\n', 'G']);

		assert.deepStrictEqual({
			changed: locate(baseline, notebook(['a\n', 'B\n', 'c'], ['x']), modified(0, [line(2), line(2)])),
			added: locate(baseline, notebook(['a\n', 'b\n', 'c\n', 'd'], ['x']), modified(0, [before(4), line(4)])),
			removed: locate(baseline, notebook(['a\n', 'c'], ['x']), modified(0, [line(2), before(2)])),
			removedFirst: locate(baseline, notebook(['b\n', 'c'], ['x']), modified(0, [line(1), before(1)])),
			removedLast: locate(baseline, notebook(['a\n', 'b'], ['x']), modified(0, [line(3), before(3)])),
			oneOfTwo: locate(long, longChanged, modified(0, [line(7), line(7)])),
			allOfCell: locate(long, longChanged, modified(0, [line(1), line(1)], [line(7), line(7)])),
			inOtherCell: locate(baseline, notebook(['a\n', 'B\n', 'c'], ['X']), modified(1, [line(1), line(1)])),
			oneString: locate(notebook('a\nb'), notebook('a\nB'), modified(0, [line(2), line(2)])),
			emptied: locate(notebook(['a']), notebook([]), modified(0, [line(1), line(1)])),
			outsideOfSource: locate(baseline, notebook(['a\n', 'B\n', 'c'], ['x']), modified(0, [line(4), line(4)])),
			otherThanChanged: locate(baseline, notebook(['a\n', 'B\n', 'c'], ['x']), modified(0, [line(1), line(1)])),
		}, {
			changed: 'after 10: "B\\n",',
			added: 'after 12: "d"',
			removed: 'after 9-10: "a\\n", … "c"',
			removedFirst: 'after 8-9: "source": [ … "b\\n",',
			removedLast: 'after 10-11: "b" … ]',
			oneOfTwo: 'after 15: "G"',
			allOfCell: 'after 9-15: "A\\n", … "G"',
			inOtherCell: 'after 20: "X"',
			oneString: 'after 8: "source": "a\\nB"',
			emptied: 'after 8: "source": []',
			outsideOfSource: 'unmatched',
			otherThanChanged: 'unmatched',
		});
	});

	test('locates an added or removed cell', () => {
		const baseline = notebook(['a'], ['b'], ['c']);

		assert.deepStrictEqual({
			added: locate(baseline, notebook(['a'], ['new'], ['b'], ['c']), { kind: 'insert', cell: 1 }),
			appended: locate(baseline, notebook(['a'], ['b'], ['c'], ['new']), { kind: 'insert', cell: 3 }),
			removed: locate(baseline, notebook(['a'], ['c']), { kind: 'delete', cell: 1 }),
			removedLast: locate(baseline, notebook(['a'], ['b']), { kind: 'delete', cell: 2 }),
			apartFromOthers: locate(baseline, notebook(['A'], ['b'], ['new'], ['c']), { kind: 'insert', cell: 2 }),
		}, {
			added: 'after 12-20: { … },',
			appended: 'after 30-38: { … }',
			removed: 'before 12-20: { … },',
			removedLast: 'before 21-29: { … }',
			apartFromOthers: 'after 21-29: { … },',
		});
	});

	test('does not locate a change that the agent host would not keep or undo alone', () => {
		const baseline = notebook(['a'], ['b']);
		// The lines of these compare cell by cell: each cell as a change to the one that was in its place.
		const shifted = [notebook(['a'], ['b\n', 'c'], ['d'], ['e']), notebook(['a'], ['new'], ['b\n', 'C'], ['d'])] as const;

		assert.deepStrictEqual({
			addedTogether: locate(baseline, notebook(['a'], ['b'], ['c'], ['d']), { kind: 'insert', cell: 2 }),
			addedAfterChangedLine: locate(baseline, notebook(['a'], ['B'], ['c']), { kind: 'insert', cell: 2 }),
			changedLineBeforeAdded: locate(baseline, notebook(['a'], ['B'], ['c']), modified(1, [line(1), line(1)])),
			replaced: locate(baseline, notebook(['a'], 'other'), { kind: 'insert', cell: 1 }),
			addedBeforeShifted: locate(...shifted, { kind: 'insert', cell: 1 }),
			changedWhenShifted: locate(...shifted, { kind: 'modified', cell: 2, originalCell: 1, hunks: [{ original: line(2), modified: line(2) }] }),
			removedAfterShifted: locate(...shifted, { kind: 'delete', cell: 3 }),
			// Neither version is a notebook with the comma of the cell before, or without the cell after it.
			leavesNoNotebook: locate('{"cells": [\n{"source": "a"}\n\n]}', '{"cells": [\n{"source": "a"},\n\n{"source": "b"}\n]}', { kind: 'insert', cell: 1 }),
		}, {
			addedTogether: 'inseparable',
			addedAfterChangedLine: 'inseparable',
			changedLineBeforeAdded: 'inseparable',
			replaced: 'inseparable',
			addedBeforeShifted: 'inseparable',
			changedWhenShifted: 'inseparable',
			removedAfterShifted: 'inseparable',
			leavesNoNotebook: 'inseparable',
		});
	});

	test('does not read a file whose cells are not located', () => {
		assert.deepStrictEqual([
			readNotebookFile(''),
			readNotebookFile('["a"]'),
			readNotebookFile('{"cells": [{"source": ["a"]},]}'),
			readNotebookFile('{"cells": [{"source": [1]}]}'),
			readNotebookFile('{"cells": [{}]}'),
			readNotebookFile('{"cells": [{"source": "a", "source": "b"}]}'),
			readNotebookFile('{"cells": [], "cells": []}'),
		], [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
	});
});
