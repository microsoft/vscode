/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Fixture data for the cursor-jump end-to-end pipeline tests.
 *
 * Each scenario is built so that after `loadAndParseInput → processAllRows`:
 *  - `cursorAtRequest` is populated (we emit a `selectionChanged` on the active
 *    doc before the request bookmark).
 *  - The pre-request portion ends with the active doc being the last one
 *    touched (`determineCurrentFileId` walks backwards).
 *  - The post-request portion contains a single `changed` event that the
 *    same-file / cross-file detectors should pick up.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produce a file of `n` lines where every line is exactly 6 chars + '\n' = 7 chars. */
function makeFixedWidthDoc(prefix: string, n: number): string {
	const lines: string[] = [];
	for (let i = 0; i < n; i++) {
		lines.push(`${prefix}${String(i).padStart(2, '0')}`); // e.g. "// A02" → 6 chars
	}
	return lines.join('\n') + '\n';
}

/** Byte offset of the first character of line `lineIndex` (0-based) in `makeFixedWidthDoc`. */
function lineStartOffset(lineIndex: number): number {
	return 7 * lineIndex; // 6 chars + '\n'
}

// ---------------------------------------------------------------------------
// Scenario A – Same-file jump
//   Cursor sits on line 2. The user's next edit lands on line 25,
//   well beyond the default ±5-line threshold.
// ---------------------------------------------------------------------------

const sameFileDoc = makeFixedWidthDoc('// A', 30);
const sameFileCursorOffset = lineStartOffset(2);
const sameFileJumpEditOffset = lineStartOffset(25);

const sameFileRecordingEntries = [
	{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
	{ kind: 'documentEncountered', id: 0, time: 3000000, relativePath: 'src/same_file_jump.ts' },
	{ kind: 'setContent', id: 0, time: 3000001, content: sameFileDoc, v: 0 },
	// No-op `changed` so the workspace replayer has a recent user edit on
	// the active doc (the cursor-prediction path is gated on having a
	// non-empty edit history within the request window).
	{ kind: 'changed', id: 0, time: 3000002, edit: [[0, 0, '']], v: 1 },
	// Cursor parked on line 2 (offset 14) — this is what `cursorAtRequest`
	// resolves to (the last `selectionChanged` on the active doc).
	{ kind: 'selectionChanged', id: 0, time: 3000003, selection: [[sameFileCursorOffset, sameFileCursorOffset]] },
	// --- requestTime = 3000004 splits here ---
	// Post-request: user jumps far below and edits line 25.
	{ kind: 'changed', id: 0, time: 3000005, edit: [[sameFileJumpEditOffset, sameFileJumpEditOffset, 'X']], v: 2 },
];

const sameFileAlternativeAction = {
	text: sameFileDoc,
	textLength: sameFileDoc.length,
	selection: [{ start: sameFileCursorOffset, endExclusive: sameFileCursorOffset }],
	edits: [],
	tags: [],
	recording: {
		entries: sameFileRecordingEntries,
		entriesSize: sameFileRecordingEntries.length,
		requestTime: 3000004,
	},
};

const sameFileOutcome = {
	suggestedEdit: `[${sameFileCursorOffset}, ${sameFileCursorOffset}) -> "noop"`,
	isInlineCompletion: false,
};

const sameFileRecord = {
	status: 'notAccepted',
	action: JSON.stringify(sameFileAlternativeAction),
	input: JSON.stringify([]),
	response: '',
	outcome: JSON.stringify(sameFileOutcome),
	language: 'typescript',
};

// ---------------------------------------------------------------------------
// Scenario B – Cross-file jump
//   Cursor sits on line 2 of `src/active.ts`. The user's next edit lands on
//   `src/target.ts` — a different document encountered before the bookmark.
// ---------------------------------------------------------------------------

const activeDoc = makeFixedWidthDoc('// B', 10);
const targetDoc = makeFixedWidthDoc('// C', 10);
const crossFileCursorOffset = lineStartOffset(2);
const crossFileEditOffset = lineStartOffset(4); // somewhere inside the target

const crossFileRecordingEntries = [
	{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
	// Active doc (id 0).
	{ kind: 'documentEncountered', id: 0, time: 4000000, relativePath: 'src/active.ts' },
	{ kind: 'setContent', id: 0, time: 4000001, content: activeDoc, v: 0 },
	// Target doc (id 1) — encountered before the bookmark so `idToRelativePath`
	// and `idToContentAtRequest` both have entries for it.
	{ kind: 'documentEncountered', id: 1, time: 4000002, relativePath: 'src/target.ts' },
	{ kind: 'setContent', id: 1, time: 4000003, content: targetDoc, v: 0 },
	// No-op edit on active doc so the cursor-prediction path has the
	// recent-edit signal it requires.
	{ kind: 'changed', id: 0, time: 4000004, edit: [[0, 0, '']], v: 1 },
	// Make active doc the focus again so `determineCurrentFileId` returns 0.
	{ kind: 'selectionChanged', id: 0, time: 4000005, selection: [[crossFileCursorOffset, crossFileCursorOffset]] },
	// --- requestTime = 4000006 splits here ---
	// Post-request: the user jumps to and edits the target doc.
	{ kind: 'changed', id: 1, time: 4000007, edit: [[crossFileEditOffset, crossFileEditOffset, 'Y']], v: 1 },
];

const crossFileAlternativeAction = {
	text: activeDoc,
	textLength: activeDoc.length,
	selection: [{ start: crossFileCursorOffset, endExclusive: crossFileCursorOffset }],
	edits: [],
	tags: [],
	recording: {
		entries: crossFileRecordingEntries,
		entriesSize: crossFileRecordingEntries.length,
		requestTime: 4000006,
	},
};

const crossFileOutcome = {
	suggestedEdit: `[${crossFileCursorOffset}, ${crossFileCursorOffset}) -> "noop"`,
	isInlineCompletion: false,
};

const crossFileRecord = {
	status: 'notAccepted',
	action: JSON.stringify(crossFileAlternativeAction),
	input: JSON.stringify([]),
	response: '',
	outcome: JSON.stringify(crossFileOutcome),
	language: 'typescript',
};

// ---------------------------------------------------------------------------
// Scenario C – Within-threshold (negative)
//   Cursor sits on line 10. The user's next edit lands on line 12, only 2
//   lines below — within the default ±5-line threshold. Nothing should be
//   emitted for this row regardless of sampleTask.
// ---------------------------------------------------------------------------

const withinThresholdDoc = makeFixedWidthDoc('// D', 30);
const withinThresholdCursorOffset = lineStartOffset(10);
const withinThresholdEditOffset = lineStartOffset(12);

const withinThresholdRecordingEntries = [
	{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
	{ kind: 'documentEncountered', id: 0, time: 5000000, relativePath: 'src/within_threshold.ts' },
	{ kind: 'setContent', id: 0, time: 5000001, content: withinThresholdDoc, v: 0 },
	{ kind: 'changed', id: 0, time: 5000002, edit: [[0, 0, '']], v: 1 },
	{ kind: 'selectionChanged', id: 0, time: 5000003, selection: [[withinThresholdCursorOffset, withinThresholdCursorOffset]] },
	// --- requestTime = 5000004 splits here ---
	{ kind: 'changed', id: 0, time: 5000005, edit: [[withinThresholdEditOffset, withinThresholdEditOffset, 'Z']], v: 2 },
];

const withinThresholdAlternativeAction = {
	text: withinThresholdDoc,
	textLength: withinThresholdDoc.length,
	selection: [{ start: withinThresholdCursorOffset, endExclusive: withinThresholdCursorOffset }],
	edits: [],
	tags: [],
	recording: {
		entries: withinThresholdRecordingEntries,
		entriesSize: withinThresholdRecordingEntries.length,
		requestTime: 5000004,
	},
};

const withinThresholdOutcome = {
	suggestedEdit: `[${withinThresholdCursorOffset}, ${withinThresholdCursorOffset}) -> "noop"`,
	isInlineCompletion: false,
};

const withinThresholdRecord = {
	status: 'notAccepted',
	action: JSON.stringify(withinThresholdAlternativeAction),
	input: JSON.stringify([]),
	response: '',
	outcome: JSON.stringify(withinThresholdOutcome),
	language: 'typescript',
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const cursorJumpFixtures = {
	sameFile: {
		record: sameFileRecord,
		docContent: sameFileDoc,
		relativePath: 'src/same_file_jump.ts',
		fromLine: 2,
		toLine: 25,
	},
	crossFile: {
		record: crossFileRecord,
		activeDocContent: activeDoc,
		targetDocContent: targetDoc,
		activePath: 'src/active.ts',
		targetPath: 'src/target.ts',
		fromLine: 2,
		toLine: 4,
	},
	withinThreshold: {
		record: withinThresholdRecord,
		relativePath: 'src/within_threshold.ts',
	},
} as const;

/** All records, in the order the pipeline will process them. */
export const allCursorJumpRecords = [sameFileRecord, crossFileRecord, withinThresholdRecord];
