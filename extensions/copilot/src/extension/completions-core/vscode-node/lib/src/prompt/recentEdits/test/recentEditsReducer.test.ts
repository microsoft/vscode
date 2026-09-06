/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { ComplexityData, determineTimeComplexity } from '../../test/determineTimeComplexity';
import { RecentEditsConfig } from '../recentEditsProvider';
import {
	buildIncomingEdit,
	DiffHunk,
	editsOverlap,
	findChangeSpan,
	findReplaceDiff,
	getAllRecentEditsByTimestamp,
	getDiff,
	RecentEdit,
	RecentEditMap,
	recentEditsReducer,
	summarizeEdit,
	trimOldFilesFromState,
	unifiedDiff,
	updateEdits,
} from '../recentEditsReducer';

// Note, that this configuration is only used in testing, and is different from the one used in production.
const config: RecentEditsConfig = {
	maxFiles: 5,
	maxEdits: 5,
	diffContextLines: 3,
	editMergeLineDistance: 3,
	maxCharsPerEdit: 2000,
	debounceTimeout: 500,

	summarizationFormat: 'diff',
	removeDeletedLines: false,
	insertionsBeforeDeletions: false,
	appendNoReplyMarker: false,
	activeDocDistanceLimitFromCursor: 100,
	maxLinesPerEdit: 10,
};

suite('findChangeSpan', function () {
	test('no differences returns null', function () {
		const originalLines = ['a', 'b', 'c'];
		assert.strictEqual(findChangeSpan(originalLines, [...originalLines]), null);
	});

	test('simple replacement span', function () {
		const prevLines = ['a', 'b', 'c'];
		const nextLines = ['a', 'B', 'c'];
		const span = findChangeSpan(prevLines, nextLines)!;
		assert.deepStrictEqual(span, { start: 1, endPrev: 1, endNew: 1 });
	});

	test('insertion at top', function () {
		const prevLines = ['a', 'b', 'c'];
		const nextLines = ['X', 'a', 'b', 'c'];
		const span = findChangeSpan(prevLines, nextLines)!;
		assert.deepStrictEqual(span, { start: 0, endPrev: -1, endNew: 0 });
	});
});

suite('helper: editsOverlap', function () {
	test('overlap when end of incoming is within last start', function () {
		const incoming0 = {
			startLine: 1,
			endLine: 2,
			diff: { added: ['x', 'y'], removed: ['a', 'b'] },
		} as unknown as RecentEdit;
		const last0 = {
			startLine: 2,
			endLine: 3,
			diff: { added: [], removed: [] },
		} as unknown as RecentEdit;

		// Should overlap because lines are adjacent and merge distance is 0
		assert.strictEqual(editsOverlap(incoming0, last0, 0), true);
	});

	test('overlap when start of incoming is within last edit', function () {
		const incoming1 = {
			startLine: 1,
			endLine: 1,
			diff: { added: ['x', 'y'], removed: [] },
		} as unknown as RecentEdit;
		const last1 = {
			startLine: 2,
			endLine: 2,
			diff: { added: ['aaaaa'], removed: [] },
		} as unknown as RecentEdit;

		// Should overlap because lines are adjacent and merge distance is 0
		assert.strictEqual(editsOverlap(incoming1, last1, 0), true);
	});

	test('overlap when incoming is entirely within last edit', function () {
		const incoming2 = {
			startLine: 1,
			endLine: 2,
			diff: { added: ['x', 'y'], removed: [] },
		} as unknown as RecentEdit;
		const last2 = {
			startLine: 0,
			endLine: 3,
			diff: { added: ['a', 'b', 'c'], removed: ['1', '2', '3'] },
		} as unknown as RecentEdit;

		// Should overlap because incoming edit is entirely within last edit
		assert.strictEqual(editsOverlap(incoming2, last2, 0), true);
	});
});

suite('updateEdits (merge & trim)', function () {
	const baseLines = ['a', 'b', 'c', 'd'];
	const baseContent = baseLines.join('\n');
	const v2Lines = ['a', 'B', 'c', 'd'];

	// initial incoming edit: replace b->B
	const firstSpan = { start: 1, endPrev: 1, endNew: 1 } as const;
	const incoming1 = buildIncomingEdit('f', baseLines, v2Lines, firstSpan, config);

	test('merges into empty list', function () {
		const { originalContent, edits } = updateEdits(baseContent, [] as RecentEdit[], incoming1, v2Lines, config);

		assert.strictEqual(edits.length, 1);
		assert.strictEqual(originalContent, baseContent);

		const diffText = unifiedDiff(edits[0].diff);
		const expected =
			`
--- a/f
+++ b/f
@@ -1,4 +1,4 @@
 a
-b
+B
 c
 d
`.trim() + '\n';

		assert.strictEqual(diffText, expected);
	});

	test('coalesces overlap', function () {
		const { edits: existing } = updateEdits(baseContent, [] as RecentEdit[], incoming1, v2Lines, config);

		const v3Lines = ['a', 'B', 'OH NO', 'c', 'd'];
		const span2 = findChangeSpan(v2Lines, v3Lines)!;
		const incoming2 = buildIncomingEdit('f', v2Lines, v3Lines, span2, config);

		const { originalContent: oc2, edits } = updateEdits(baseContent, existing, incoming2, v3Lines, config);
		assert.strictEqual(edits.length, 1, 'should merge two overlapping edits');
		assert.strictEqual(oc2, baseContent);

		const diffText = unifiedDiff(edits[0].diff);
		assert.ok(diffText.includes('-b'));
		assert.ok(diffText.includes('+B'));
		assert.ok(diffText.includes('+OH NO'));
	});

	test('trims and rebases when exceeding MAX_EDITS', function () {
		const initialLines = Array.from({ length: 100 }, (_, i) => `line${i}`);
		let original = initialLines.join('\n');
		let edits: RecentEdit[] = [];

		for (let i = 0; i < 70; i += 10) {
			const prev = original.split('\n');
			const modifiedLine = `new${i}`;
			const next = [...prev];
			next[i] = modifiedLine;
			const span = findChangeSpan(prev, next)!;
			const incoming = buildIncomingEdit('f', prev, next, span, config);
			const result = updateEdits(original, edits, incoming, next, config);
			original = result.originalContent;
			edits = result.edits;
		}

		assert.strictEqual(edits.length, 5, 'should cap edits to MAX_EDITS');
		assert.ok(original.split('\n').includes('new10'), 'original text should include line from 6 edits prior');
		assert.ok(!original.split('\n').includes('new20'), 'snapshot text should not include line from 5 edits prior');
	});
});

suite('updateEdits nearby hunk merging', function () {
	const cases = [
		{ sep: 0, expected: 1 },
		{ sep: 1, expected: 1 },
		{ sep: 2, expected: 1 },
		{ sep: 3, expected: 1 },
		{ sep: 4, expected: 2 },
		{ sep: 5, expected: 2 },
	];

	cases.forEach(({ sep, expected }) => {
		for (const position of ['above', 'below']) {
			test(`edit ${sep} line${sep === 1 ? '' : 's'} ${position} previous edit ${expected === 1 ? 'merges into one hunk' : 'becomes a separate hunk'}`, function () {
				const base = Array.from({ length: 10 }, (_, i) => i.toString());
				let orig = base.join('\n');
				let edits: RecentEdit[] = [];

				// get positions of where each edit will begin
				const editFirstLines = [2, 3 + sep];
				if (position === 'above') {
					// reverse the order of edits when making edits bottom to top
					editFirstLines.reverse();
				}

				// make first edit
				const prev1 = base;
				const next1 = [...prev1];
				next1[editFirstLines[0]] = 'X';
				const span1 = findChangeSpan(prev1, next1)!;
				const h1 = buildIncomingEdit('f', prev1, next1, span1, config);
				({ originalContent: orig, edits } = updateEdits(orig, edits, h1, next1, config));

				// second edit separated by sep lines
				const prev2 = next1;
				const next2 = [...prev2];
				next2[editFirstLines[1]] = 'Y';
				const span2 = findChangeSpan(prev2, next2)!;
				const h2 = buildIncomingEdit('f', prev2, next2, span2, config);
				const res = updateEdits(orig, edits, h2, next2, config);

				assert.strictEqual(
					res.edits.length,
					expected,
					`separated by ${sep} lines should ${expected === 1 ? 'merge' : 'split'}`
				);
			});
		}
	});
});

suite('updateEdits overlapping multi-line edits', function () {
	test('partially overlapping multi-line edits merge into single hunk', function () {
		const base = ['1', '2', '3', '4', '5'];
		const orig = base.join('\n');
		// first edit: change lines 1-2
		const v1 = ['1X', '2X', '3', '4', '5'];
		const span1 = findChangeSpan(base, v1)!;
		let { originalContent, edits } = updateEdits(
			orig,
			[],
			buildIncomingEdit('f', base, v1, span1, config),
			v1,
			config
		);
		// second edit: change lines 2-3 (overlaps at index 1)
		const v2 = ['1X', '2X', '3', '4Y', '5Y'];
		const span2 = findChangeSpan(v1, v2)!;
		({ originalContent, edits } = updateEdits(
			originalContent,
			edits,
			buildIncomingEdit('f', v1, v2, span2, config),
			v2,
			config
		));
		assert.strictEqual(edits.length, 1);
		const diffLines = unifiedDiff(edits[0].diff).split('\n');
		assert.deepEqual(diffLines, [
			'--- a/f',
			'+++ b/f',
			'@@ -1,5 +1,5 @@',
			'-1',
			'-2',
			'-3',
			'-4',
			'-5',
			'+1X',
			'+2X',
			'+3',
			'+4Y',
			'+5Y',
			'',
		]);
	});

	test('multi-line edit containing a smaller multi-line edit merges into original span', function () {
		const base = ['A', 'B', 'C', 'D', 'E'];
		const orig = base.join('\n');
		// large edit: B,C,D -> x,y,z
		const v1 = ['A', 'x', 'y', 'z', 'E'];
		const span1 = findChangeSpan(base, v1)!;
		let { originalContent, edits } = updateEdits(
			orig,
			[],
			buildIncomingEdit('f', base, v1, span1, config),
			v1,
			config
		);
		// smaller edit inside that: y -> Y
		const v2 = ['A', 'x', 'Y', 'z', 'E'];
		const span2 = findChangeSpan(v1, v2)!;
		({ originalContent, edits } = updateEdits(
			originalContent,
			edits,
			buildIncomingEdit('f', v1, v2, span2, config),
			v2,
			config
		));
		assert.strictEqual(edits.length, 1);
		const { diff } = edits[0];
		// removed should be original B,C,D
		assert.deepStrictEqual(diff.removed, ['B', 'C', 'D']);
		// added should reflect x, Y, z
		assert.deepStrictEqual(diff.added, ['x', 'Y', 'z']);
	});

	test('multi-line delete followed by multi-line insert', function () {
		const base = Array.from({ length: 50 }, (_, i) => i.toString());
		const orig = base.join('\n');

		// large deletion
		const v1 = [...base.slice(0, 20), ...base.slice(30)];
		const span1 = findChangeSpan(base, v1)!;
		let { originalContent, edits } = updateEdits(
			orig,
			[],
			buildIncomingEdit('f', base, v1, span1, config),
			v1,
			config
		);

		// insert
		const v2 = [...base.slice(0, 20), 'new line', 'another new line', ...base.slice(30)];
		const span2 = findChangeSpan(v1, v2)!;
		({ originalContent, edits } = updateEdits(
			originalContent,
			edits,
			buildIncomingEdit('f', v1, v2, span2, config),
			v2,
			config
		));

		// should become one replace
		assert.strictEqual(edits.length, 1);
		const { diff } = edits[0];
		assert.deepEqual(diff.added, ['new line', 'another new line']);
		assert.equal(diff.removed.length, 10);
	});
});

suite('unifiedDiff', function () {
	test('formats a simple replacement with 1 line of context by default', function () {
		const before = ['line1', 'line2', 'line3'];
		const after = ['line1', 'line2 modified', 'line3'];

		const span = findChangeSpan(before, after);
		assert.notStrictEqual(span, null);
		const { start, endPrev, endNew } = span!;

		const hunk = getDiff('f', before, after, start, endPrev, endNew, 1);
		const lines = unifiedDiff(hunk).trim().split('\n');

		assert.deepStrictEqual(lines, [
			'--- a/f',
			'+++ b/f',
			'@@ -1,3 +1,3 @@',
			' line1',
			'-line2',
			'+line2 modified',
			' line3',
		]);
	});

	test('still shows removed lines even if you once wanted to "remove" them', function () {
		const before = ['line1', 'line2', 'line3'];
		const after = ['line1', 'line2 modified', 'line3'];

		const span = findChangeSpan(before, after)!;
		const hunk = getDiff('f', before, after, span.start, span.endPrev, span.endNew, 1);
		const lines = unifiedDiff(hunk).trim().split('\n');

		assert.deepStrictEqual(lines, [
			'--- a/f',
			'+++ b/f',
			'@@ -1,3 +1,3 @@',
			' line1',
			'-line2',
			'+line2 modified',
			' line3',
		]);
	});

	test('returns null from findChangeSpan when there are truly no changes', function () {
		const before = ['line1', 'line2', 'line3'];
		const after = ['line1', 'line2', 'line3'];
		assert.strictEqual(findChangeSpan(before, after), null);
	});

	test('detects even pure whitespace changes', function () {
		const before = ['line1', 'line2 ', 'line3'];
		const after = ['line1', 'line2', 'line3'];

		const span = findChangeSpan(before, after);
		assert.notStrictEqual(span, null);
		const { start, endPrev, endNew } = span!;

		const hunk = getDiff('file.txt', before, after, start, endPrev, endNew, 1);
		const lines = unifiedDiff(hunk).trim().split('\n');

		assert.deepStrictEqual(lines, [
			'--- a/file.txt',
			'+++ b/file.txt',
			'@@ -1,3 +1,3 @@',
			' line1',
			'-line2 ',
			'+line2',
			' line3',
		]);
	});
});

suite('findReplaceDiff', function () {
	test('wraps removed lines in the "DO NOT REPLY" marker and shows the replacement', function () {
		const before = ['line1', 'line2', 'line3'];
		const after = ['line1', 'line2 modified', 'line3'];

		const span = findChangeSpan(before, after)!;
		const hunk = getDiff('f', before, after, span.start, span.endPrev, span.endNew, 1);
		const lines = findReplaceDiff(hunk).split('\n');

		assert.deepStrictEqual(lines, [
			'--- User edited code: ---',
			'line1',
			'line2 --- DO NOT REPLY WITH CODE FROM THIS LINE ---',
			'line3',
			'--- and replaced it with: ---',
			'line1',
			'line2 modified',
			'line3',
			'--- End of edit ---',
		]);
	});

	test('insertion-only case shows "added" message', function () {
		const before = ['a', 'b'];
		const after = ['a', 'b', 'c', 'd'];
		const span = { start: 2, endPrev: 1, endNew: 3 } as const;
		const hunk = getDiff('f', before, after, span.start, span.endPrev, span.endNew, 1);
		const lines = findReplaceDiff(hunk).split('\n');
		assert.ok(lines.includes('--- and added 2 lines to make: ---'));
	});

	test('deletion-only case shows "deleted" message', function () {
		const before = ['a', 'b', 'c'];
		const after = ['a', 'c'];
		const span = { start: 1, endPrev: 1, endNew: 0 } as const;
		const hunk = getDiff('f', before, after, span.start, span.endPrev, span.endNew, 1);
		const lines = findReplaceDiff(hunk).split('\n');
		assert.ok(lines.includes('--- and deleted 1 line to make: ---'));
	});
});

suite('recentEditsReducer', function () {
	test('merges replacement + insert into one hunk when adjacent', function () {
		const file = 'ex.txt';
		const v1 = ['a', 'b', 'c'].join('\n');
		const v2 = ['a', 'B', 'c'].join('\n');
		const v3 = ['X', 'a', 'B', 'c'].join('\n');
		let state: RecentEditMap = {};
		state = recentEditsReducer(state, file, v1, config);
		state = recentEditsReducer(state, file, v2, config);
		state = recentEditsReducer(state, file, v3, config);

		assert.strictEqual(state[file].edits.length, 1);

		const diffText = unifiedDiff(state[file].edits[0].diff);
		const expected =
			`
--- a/ex.txt
+++ b/ex.txt
@@ -1,3 +1,4 @@
-a
-b
+X
+a
+B
 c
`.trim() + '\n';
		assert.strictEqual(diffText, expected);
	});

	test('does not merge distant edits into one hunk (separated by 5 lines)', function () {
		const file = 'far.txt';
		// 8-line file so edits at index 1 and 7 are separated by 5 unmodified lines
		const base = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
		const v1 = base.join('\n');
		const v2 = [...base];
		v2[1] = 'B';
		const v3 = [...v2];
		v3[7] = 'H';

		let state: RecentEditMap = {};
		state = recentEditsReducer(state, file, v1, config);
		state = recentEditsReducer(state, file, v2.join('\n'), config);
		state = recentEditsReducer(state, file, v3.join('\n'), config);

		// edits are far enough apart (5 lines), still two hunks
		assert.strictEqual(state[file].edits.length, 2);

		const diffs = state[file].edits.map(e => unifiedDiff(e.diff));

		const expectedDiff1 =
			`
--- a/far.txt
+++ b/far.txt
@@ -1,5 +1,5 @@
 a
-b
+B
 c
 d
 e
`.trim() + '\n';

		const expectedDiff2 =
			`
--- a/far.txt
+++ b/far.txt
@@ -5,4 +5,4 @@
 e
 f
 g
-h
+H
`.trim() + '\n';

		assert.strictEqual(diffs[0], expectedDiff1);
		assert.strictEqual(diffs[1], expectedDiff2);
	});

	test('two consecutive edits in same spot do merge', function () {
		const file = 'test.txt';
		const v0 = ['A', 'B', 'C', 'D', 'E'].join('\n');
		let state: RecentEditMap = {};
		state = recentEditsReducer(state, file, v0, config);
		assert.strictEqual(state[file].edits.length, 0);

		const v1 = ['A', 'B', 'C', 'D', 'e'].join('\n');
		state = recentEditsReducer(state, file, v1, config);
		assert.strictEqual(state[file].edits.length, 1);

		const v2 = ['A', 'B', 'C', 'D', 'E'].join('\n');
		state = recentEditsReducer(state, file, v2, config);
		assert.strictEqual(state[file].edits.length, 1);
	});

	test('maintains a maximum number of files in the state', function () {
		let state: RecentEditMap = {};
		for (let i = 0; i < 10; i++) {
			const file = `file${i}.txt`;
			state = recentEditsReducer(state, file, 'a\nb\nc\n', config);
			state = recentEditsReducer(state, file, 'a\nb\nc\nd\n', config);
		}

		assert.deepEqual(Object.keys(state).sort(), ['file5.txt', 'file6.txt', 'file7.txt', 'file8.txt', 'file9.txt']);
	});

	test('keeps separate edit lists for each file', function () {
		let state: RecentEditMap = {};
		state = recentEditsReducer(state, 'a.txt', 'A', config);
		state = recentEditsReducer(state, 'b.txt', 'B', config);
		state = recentEditsReducer(state, 'a.txt', 'AA', config);
		assert.ok(state['a.txt'].edits.length >= 1);
		assert.strictEqual(state['b.txt'].edits.length, 0);
	});

	test('inserting multiple lines at beginning merges with existing hunk', function () {
		const file = 'start.txt';
		const v0 = ['line1', 'line2', 'line3'].join('\n');
		let state: RecentEditMap = {};
		state = recentEditsReducer(state, file, v0, config);
		// edit in the middle
		const v1arr = ['line1', 'X', 'line2', 'line3'];
		state = recentEditsReducer(state, file, v1arr.join('\n'), config);
		assert.strictEqual(state[file].edits.length, 1);
		// now insert two lines at the top
		const v2arr = ['Y', 'Z', ...v1arr];
		state = recentEditsReducer(state, file, v2arr.join('\n'), config);
		assert.strictEqual(state[file].edits.length, 1);
		const { diff } = state[file].edits[0];
		assert.strictEqual(diff.pre, 0);
		// first two added lines should be Y, Z
		assert.deepStrictEqual(diff.added.slice(0, 2), ['Y', 'Z']);
		// and the middle edit X should still be present
		assert.ok(diff.added.includes('X'));
	});

	test('many sequential line inserts (aka typing) merge into one hunk', function () {
		const file = 'typingtest.txt';
		let state: RecentEditMap = {};
		const fileLines = Array.from({ length: 100 }, (_, i) => `L${i + 1}`);
		state = recentEditsReducer(state, file, fileLines.join('\n'), config);

		const whatToType = 'This is a multi-line bit of text.\nI sure hope everything works as planned.\nAnyways...';
		fileLines[50] = '';
		for (const char of whatToType) {
			fileLines[50] += char;
			state = recentEditsReducer(state, file, fileLines.join('\n'), config);
			assert.strictEqual(state[file].edits.length, 1);
		}

		// All inserts should collapse into a single hunk
		assert.strictEqual(state[file].edits.length, 1);
		const diff = unifiedDiff(state[file].edits[0].diff);

		assert.equal(
			diff,
			`
--- a/typingtest.txt
+++ b/typingtest.txt
@@ -48,7 +48,9 @@
 L48
 L49
 L50
-L51
+This is a multi-line bit of text.
+I sure hope everything works as planned.
+Anyways...
 L52
 L53
 L54
		`
				.replace(/\n {12}/g, '\n')
				.trim() + '\n'
		);
	});

	test('huge change containing tiny change merges into one edit', function () {
		const file = 'file.txt';
		let state: RecentEditMap = {};
		const fileLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		state = recentEditsReducer(state, file, fileLines.join('\n'), config);

		for (let i = 30; i < 60; i++) {
			fileLines[i] = `line ${i + 1} has changed`;
		}
		state = recentEditsReducer(state, file, fileLines.join('\n'), config);
		assert.strictEqual(state[file].edits.length, 1);

		fileLines[50] = 'here comes another edit';
		state = recentEditsReducer(state, file, fileLines.join('\n'), config);
		assert.strictEqual(state[file].edits.length, 1);

		assert.ok(state[file].edits[0].diff.added.includes('here comes another edit'));
		assert.ok(state[file].edits[0].diff.removed.includes('line 51'));
	});

	test('two large overlapping changes merge into one edit', function () {
		// deep copy
		const configCopy = JSON.parse(JSON.stringify(config)) as RecentEditsConfig;
		configCopy.maxCharsPerEdit = 10000; // Set a large enough limit to allow merging
		const file = 'file.txt';
		let state: RecentEditMap = {};
		const fileLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);

		for (let i = 30; i < 60; i++) {
			fileLines[i] = `line ${i + 1} has changed in the first edit`;
		}
		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);
		assert.strictEqual(state[file].edits.length, 1);
		assert.equal(state[file].edits[0].diff.added.length, 30);
		assert.equal(state[file].edits[0].diff.removed.length, 30);

		for (let i = 40; i < 80; i++) {
			fileLines[i] = `line ${i + 1} has changed in the second edit`;
		}
		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);
		assert.strictEqual(state[file].edits.length, 1);

		assert.ok(state[file].edits[0].diff.added.includes('line 31 has changed in the first edit'));
		assert.ok(state[file].edits[0].diff.added.includes('line 50 has changed in the second edit'));
		assert.ok(state[file].edits[0].diff.removed.includes('line 50'));
		assert.equal(state[file].edits[0].diff.added.length, 50);
		assert.equal(state[file].edits[0].diff.removed.length, 50);
	});

	test('two large overlapping changes in reverse order merge into one edit', function () {
		const configCopy = JSON.parse(JSON.stringify(config)) as RecentEditsConfig;
		configCopy.maxCharsPerEdit = 10000; // Set a large enough limit to allow merging
		const file = 'file.txt';
		let state: RecentEditMap = {};
		const fileLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);

		for (let i = 40; i < 80; i++) {
			fileLines[i] = `line ${i + 1} has changed in the first edit`;
		}

		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);
		assert.strictEqual(state[file].edits.length, 1);
		assert.equal(state[file].edits[0].diff.added.length, 40);
		assert.equal(state[file].edits[0].diff.removed.length, 40);

		for (let i = 30; i < 60; i++) {
			fileLines[i] = `line ${i + 1} has changed in the second edit`;
		}
		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);
		assert.strictEqual(state[file].edits.length, 1);

		assert.ok(state[file].edits[0].diff.added.includes('line 31 has changed in the second edit'));
		assert.ok(state[file].edits[0].diff.added.includes('line 50 has changed in the second edit'));
		assert.ok(state[file].edits[0].diff.added.includes('line 70 has changed in the first edit'));
		assert.ok(state[file].edits[0].diff.removed.includes('line 50'));
		assert.equal(state[file].edits[0].diff.added.length, 50);
		assert.equal(state[file].edits[0].diff.removed.length, 50);
	});

	test('edits larger than maxCharsPerEdit get removed', function () {
		const configCopy = JSON.parse(JSON.stringify(config)) as RecentEditsConfig;
		configCopy.maxCharsPerEdit = 100;
		const file = 'file.txt';
		let state: RecentEditMap = {};
		const fileLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);

		for (let i = 40; i < 80; i++) {
			fileLines[i] = `line ${i + 1} has changed in the first edit`;
		}
		state = recentEditsReducer(state, file, fileLines.join('\n'), configCopy);

		assert.equal(state[file].edits.length, 0);
	});
});

suite('getDiff', function () {
	test('insertion builds DiffHunk correctly', function () {
		const prev = ['1', '2'];
		const next = ['1', 'X', '2'];
		const span = { start: 1, endPrev: 1, endNew: 1 } as const;
		const h = getDiff('file', prev, next, span.start, span.endPrev, span.endNew, 0);
		assert.deepStrictEqual(h.removed, ['2']);
		assert.deepStrictEqual(h.added, ['X']);
	});

	test('deletion builds DiffHunk correctly', function () {
		const prev = ['1', 'X', '2'];
		const next = ['1', '2'];
		const span = { start: 1, endPrev: 1, endNew: 0 } as const;
		const h = getDiff('file', prev, next, span.start, span.endPrev, span.endNew, 0);
		assert.deepStrictEqual(h.removed, ['X']);
		assert.deepStrictEqual(h.added, []);
	});

	test('replacement builds DiffHunk correctly', function () {
		const prev = ['1', '2', '3'];
		const next = ['1', 'different', '3'];
		const span = { start: 1, endPrev: 1, endNew: 1 } as const;
		const hunk = getDiff('file', prev, next, span.start, span.endPrev, span.endNew, 0);
		assert.deepEqual(hunk, {
			added: ['different'],
			after: [],
			before: [],
			file: 'file',
			post: 2,
			pre: 1,
			removed: ['2'],
		});
	});
});

suite('getAllRecentEditsByTimestamp', function () {
	test('orders and slices correctly', function () {
		const map: RecentEditMap = {
			a: {
				originalContent: '',
				currentContent: '',
				edits: [
					{
						file: 'a',
						startLine: 0,
						endLine: 0,
						diff: getDiff('a', [], [''], 0, 0, 0, 0),
						timestamp: 5,
					},
				],
			},
			b: {
				originalContent: '',
				currentContent: '',
				edits: [
					{
						file: 'b',
						startLine: 0,
						endLine: 0,
						diff: getDiff('b', [], [''], 0, 0, 0, 0),
						timestamp: 3,
					},
				],
			},
		};
		const all = getAllRecentEditsByTimestamp(map);
		assert.strictEqual(all[0].file, 'b');
		assert.strictEqual(all[1].file, 'a');
	});
});

suite('buildIncomingEdit insertion at top', function () {
	test('incoming hunk pre-populates pre/post and added lines', function () {
		const prev = ['a', 'b'];
		const next = ['X', 'a', 'b'];
		const span = { start: 0, endPrev: 1, endNew: 0 } as const;
		const h = buildIncomingEdit('f', prev, next, span, config);
		assert.deepStrictEqual(h.diff.added, ['X']);
		assert.strictEqual(h.diff.pre, 0);
	});
});

suite('trimOldFilesFromState', function () {
	test('does nothing when modified files count is <= maxFiles', function () {
		const baseDiff = getDiff('f', ['x'], ['y'], 0, 0, 0, 0);
		const state: RecentEditMap = {
			a: { originalContent: '', currentContent: '', edits: [] },
			b: {
				originalContent: '',
				currentContent: '',
				edits: [{ file: 'b', startLine: 0, endLine: 0, diff: baseDiff, timestamp: 1 }],
			},
		};

		const trimmed = trimOldFilesFromState(state, 2);
		// 'a' has no edits, 'b' is within limit, both stay
		assert.deepStrictEqual(Object.keys(trimmed).sort(), ['a', 'b']);
	});

	test('trims oldest modified files beyond maxFiles', function () {
		const baseDiff = getDiff('f', ['x'], ['y'], 0, 0, 0, 0);
		const state: RecentEditMap = {
			one: {
				originalContent: '',
				currentContent: '',
				edits: [{ file: 'one', startLine: 0, endLine: 0, diff: baseDiff, timestamp: 10 }],
			},
			two: {
				originalContent: '',
				currentContent: '',
				edits: [{ file: 'two', startLine: 0, endLine: 0, diff: baseDiff, timestamp: 20 }],
			},
			three: {
				originalContent: '',
				currentContent: '',
				edits: [{ file: 'three', startLine: 0, endLine: 0, diff: baseDiff, timestamp: 30 }],
			},
		};

		const trimmed = trimOldFilesFromState(state, 2);
		// Should drop 'one' (oldest), keep 'two' and 'three'
		assert.deepStrictEqual(Object.keys(trimmed).sort(), ['three', 'two']);
		// Ensure the entries for 'two' and 'three' remain intact
		assert.strictEqual(trimmed.two.edits[0].timestamp, 20);
		assert.strictEqual(trimmed.three.edits[0].timestamp, 30);
	});

	test('keeps unmodified files when trimming', function () {
		const baseDiff = getDiff('f', ['x'], ['y'], 0, 0, 0, 0);
		const state: RecentEditMap = {
			unmodified: {
				originalContent: '',
				currentContent: '',
				edits: [],
			},
			old: {
				originalContent: '',
				currentContent: '',
				edits: [{ file: 'old', startLine: 0, endLine: 0, diff: baseDiff, timestamp: 1 }],
			},
			mid: {
				originalContent: '',
				currentContent: '',
				edits: [{ file: 'mid', startLine: 0, endLine: 0, diff: baseDiff, timestamp: 2 }],
			},
			recent: {
				originalContent: '',
				currentContent: '',
				edits: [{ file: 'recent', startLine: 0, endLine: 0, diff: baseDiff, timestamp: 3 }],
			},
		};

		const trimmed = trimOldFilesFromState(state, 2);
		// 'old' is the oldest modified and should be trimmed;
		// 'mid' and 'recent' stay, and 'unmodified' (no edits) always stays
		assert.deepStrictEqual(Object.keys(trimmed).sort(), ['mid', 'recent', 'unmodified']);

		// verify 'old' was removed
		assert.strictEqual(trimmed.old, undefined);
		// verify timestamps for the kept files
		assert.strictEqual(trimmed.mid.edits[0].timestamp, 2);
		assert.strictEqual(trimmed.recent.edits[0].timestamp, 3);
	});
});

function humanSize(bytes: number): string {
	const sizes = ['b', 'kb', 'mb'];
	let i = 0;
	while (bytes >= 1024 && i < sizes.length - 1) {
		bytes /= 1024;
		i++;
	}
	return `${bytes}${sizes[i]}`;
}

suite('recentEditsReducer performance', function () {
	const initialFileContents = readFileSync(__filename, 'utf8');
	const complexityData: ComplexityData[] = [];

	// use no more than 20% of single core CPU time processing the input of the fastest typers
	// this threshold needs to be pretty generous since this runs on tiny CI boxes
	const fastTypingSpeedWPM = 100;
	const averageWordLength = 5;
	const fastTypingSpeedCPS = (fastTypingSpeedWPM / 60) * averageWordLength; // CPS means characters per second
	const maxCPUTime = 0.2;
	const minCPS = Math.ceil(fastTypingSpeedCPS * (1 / maxCPUTime));

	this.retries(2);

	// 8kb-8mb
	for (let fileSize = 8192; fileSize <= 8192 * 1024; fileSize *= 2) {
		test(`random inserts in a ${humanSize(fileSize)} file`, function () {
			// repeat the fileContents until they hit the desired size
			let fileContents = initialFileContents
				.repeat(Math.ceil(fileSize / initialFileContents.length))
				.slice(0, fileSize);

			const file = 'performantfile.txt';
			let state = recentEditsReducer({}, file, fileContents, config);

			const startTime = performance.now();
			let i = 0;
			while (performance.now() - startTime < 500) {
				const textToInsert = i % 10 === 0 ? '\n' : 'X';
				const randomPoint = Math.floor(Math.random() * fileContents.length);
				fileContents = fileContents.slice(0, randomPoint) + textToInsert + fileContents.slice(randomPoint);
				state = recentEditsReducer(state, file, fileContents, config);
				i++;
			}
			const endTime = performance.now();
			const millisecondsPerCharacter = (endTime - startTime) / i;
			const charactersPerSecond = i / ((endTime - startTime) / 1000);

			if (state[file]) {
				// edits were tracked, log timing
				complexityData.push({
					n: fileSize,
					time: millisecondsPerCharacter,
				});
				const cleanCharactersPerSecond = (Math.round(charactersPerSecond * 100) / 100).toFixed(2);

				assert.ok(
					charactersPerSecond > minCPS,
					`Edits per second (${cleanCharactersPerSecond}) must be at least ${minCPS}`
				);
			} else {
				console.warn(
					`Warning: recentEditsReducer did not track edits for a ${humanSize(fileSize)} file. This may be due to the file being too large.`
				);
			}
		});
	}

	test('must have linear or sublinear time complexity', function () {
		const { model } = determineTimeComplexity(complexityData);
		assert.match(
			model.type,
			/^(sub)?linear$/,
			`Time complexity must be linear or sublinear. Got ${model.name} which is ${model.type}`
		);
	});
});

suite('summarizeEdit function', function () {
	test('return null if diff added and removed lines are all empty after stripping whitespace', function () {
		const edit = {
			startLine: 2,
			endLine: 3,
			diff: {
				removed: ['    ', '\t'],
				added: ['    ', '\n'],
			} as DiffHunk,
		} as RecentEdit;
		const result = summarizeEdit(edit, config);
		assert.strictEqual(result, null);
	});
	test('return null if diff added or diff removed are over 100 lines', function () {
		const edit = {
			startLine: 2,
			endLine: 3,
			diff: {
				removed: Array(101).fill('a') as string[],
				added: Array(101).fill('b') as string[],
			} as DiffHunk,
		} as RecentEdit;
		const configCopy = JSON.parse(JSON.stringify(config)) as RecentEditsConfig;
		configCopy.maxLinesPerEdit = 100;
		const result = summarizeEdit(edit, configCopy);
		assert.strictEqual(result, null);
	});
});
