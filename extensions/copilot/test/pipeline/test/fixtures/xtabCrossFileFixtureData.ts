/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Fixture data for the `xtab-cross-file` end-to-end pipeline test.
 *
 * Each scenario produces a record in the shape `loadAndParseInput` expects
 * ({ status, action, input, response, outcome, language }). The recordings are
 * built so that the post-request `changed` events land in more than one
 * document, exercising the multi-file edit label.
 *
 * (Synthetic stand-in for real `alternative_action` telemetry — swap in real
 * recordings once the assertions are confirmed.)
 */

// ---------------------------------------------------------------------------
// Scenario A – cross-file
//   The user edits a second file (`otherA.ts`) FIRST, then the anchor file
//   (`anchorA.ts`). First-touch order is therefore [otherA, anchorA], which
//   differs from anchor-first order — letting the test distinguish the two
//   `--patch-order` policies by the block order in the label.
// ---------------------------------------------------------------------------

const anchorAContent = `const a = 1;\nconst keep = 0;\n`;
const otherAContent = `const b = 2;\nconst stay = 9;\n`;

const crossFileRecordingEntries = [
	{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
	{ kind: 'documentEncountered', id: 0, time: 1000000, relativePath: 'src/anchorA.ts' },
	{ kind: 'setContent', id: 0, time: 1000001, content: anchorAContent, v: 0 },
	{ kind: 'documentEncountered', id: 1, time: 1000002, relativePath: 'src/otherA.ts' },
	{ kind: 'setContent', id: 1, time: 1000003, content: otherAContent, v: 0 },
	// No-op edit on the anchor so it is the last pre-request doc touched
	// (`determineCurrentFileId` → 0) and the replayer has a `lastId`.
	{ kind: 'changed', id: 0, time: 1000004, edit: [[0, 0, '']], v: 1 },
	// --- requestTime = 1000005 splits here ---
	// Cross-file edit FIRST (otherA, id 1): rename `b` → `beta`.
	{ kind: 'changed', id: 1, time: 1000006, edit: [[6, 7, 'beta']], v: 1 },
	// Anchor edit SECOND (anchorA, id 0): rename `a` → `alpha`.
	{ kind: 'changed', id: 0, time: 1000007, edit: [[6, 7, 'alpha']], v: 2 },
];

const crossFileAlternativeAction = {
	text: anchorAContent,
	textLength: anchorAContent.length,
	selection: [{ start: 6, endExclusive: 7 }],
	edits: [],
	tags: [],
	recording: {
		entries: crossFileRecordingEntries,
		entriesSize: crossFileRecordingEntries.length,
		requestTime: 1000005,
	},
};

const crossFileRecord = {
	status: 'notAccepted',
	action: JSON.stringify(crossFileAlternativeAction),
	input: JSON.stringify([]),
	response: '',
	outcome: JSON.stringify({ suggestedEdit: '[6, 7) -> "alpha"', isInlineCompletion: false }),
	language: 'typescript',
};

// ---------------------------------------------------------------------------
// Scenario B – anchor-only
//   The only post-request edit is in the anchor file, so the label is
//   single-file and `isCrossFile` is false even for `xtab-cross-file`.
// ---------------------------------------------------------------------------

const soloBContent = `let x = 0;\nlet keep = 1;\n`;

const sameFileRecordingEntries = [
	{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
	{ kind: 'documentEncountered', id: 0, time: 2000000, relativePath: 'src/soloB.ts' },
	{ kind: 'setContent', id: 0, time: 2000001, content: soloBContent, v: 0 },
	{ kind: 'changed', id: 0, time: 2000002, edit: [[0, 0, '']], v: 1 },
	// --- requestTime = 2000003 splits here ---
	// Anchor-only edit: rename `x` → `count`.
	{ kind: 'changed', id: 0, time: 2000004, edit: [[4, 5, 'count']], v: 2 },
];

const sameFileAlternativeAction = {
	text: soloBContent,
	textLength: soloBContent.length,
	selection: [{ start: 4, endExclusive: 5 }],
	edits: [],
	tags: [],
	recording: {
		entries: sameFileRecordingEntries,
		entriesSize: sameFileRecordingEntries.length,
		requestTime: 2000003,
	},
};

const sameFileRecord = {
	status: 'notAccepted',
	action: JSON.stringify(sameFileAlternativeAction),
	input: JSON.stringify([]),
	response: '',
	outcome: JSON.stringify({ suggestedEdit: '[4, 5) -> "count"', isInlineCompletion: false }),
	language: 'typescript',
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const xtabCrossFileFixtures = {
	crossFile: {
		record: crossFileRecord,
		anchorPath: 'src/anchorA.ts',
		otherPath: 'src/otherA.ts',
		anchorDocContent: anchorAContent,
		otherDocContent: otherAContent,
	},
	sameFile: {
		record: sameFileRecord,
		anchorPath: 'src/soloB.ts',
		anchorDocContent: soloBContent,
	},
} as const;

/** All records, in the order the pipeline will process them. */
export const allXtabCrossFileRecords = [crossFileRecord, sameFileRecord];
