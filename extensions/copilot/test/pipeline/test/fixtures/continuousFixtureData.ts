/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Fixture data for the continuous-recording nes-datagen pipeline e2e tests.
 *
 * Continuous slices (from `ContinuousEnhancedTelemetrySender`) carry no NES
 * request bookmark, so the pipeline synthesizes a pivot. Each record here is
 * shaped the way the continuous loader expects — a single `recording` column
 * holding the stringified `IContinuousRecording` payload.
 *
 * Both valid recordings are crafted to have **exactly one** eligible pivot, so
 * the produced sample is deterministic regardless of the pivot RNG seed:
 *   - a pre-pivot `changed` (the eligible pivot) gives the NES prompt real edit
 *     history to work from, and is itself eligible because a later `changed`
 *     (the oracle) follows it on the same document;
 *   - the trailing `changed` is the oracle and is itself ineligible (no edit
 *     follows it on the active document).
 * This exercises the real strategy → split → replay → prompt → oracle path.
 */

// ---------------------------------------------------------------------------
// Scenario 1 – TypeScript: rename `add` → `sum`
// ---------------------------------------------------------------------------

const tsDocContent =
	`export function add(a: number, b: number): number {\n` +
	`\treturn a + b;\n` +
	`}\n`;

// `add` occupies offsets [16, 19) in `export function add(...`. The pre-pivot
// edit appends a trailing newline (at the end, so it doesn't shift `add`),
// giving the context some edit history without disturbing the oracle offsets.
const tsEntries = [
	{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
	{ kind: 'documentEncountered', id: 0, time: 1000, relativePath: 'src/math.ts' },
	{ kind: 'setContent', id: 0, time: 1001, content: tsDocContent, v: 0 },
	// Only eligible pivot: an in-context edit that establishes edit history.
	{ kind: 'changed', id: 0, time: 1002, edit: [[tsDocContent.length, tsDocContent.length, '\n']], v: 1 },
	// Oracle (post-pivot): rename `add` → `sum`.
	{ kind: 'changed', id: 0, time: 1004, edit: [[16, 19, 'sum']], v: 2 },
];

const tsRecord = {
	recording: JSON.stringify({
		entries: tsEntries,
		entriesSize: JSON.stringify(tsEntries).length,
		windowStart: 900,
		windowEnd: 1100,
		sessionId: 'sess-ts',
		sequenceNumber: 7,
	}),
};

// ---------------------------------------------------------------------------
// Scenario 2 – Python: add a ` -> str` return annotation
// ---------------------------------------------------------------------------

const pyDocContent =
	`def greet(name):\n` +
	`    return f"Hello, {name}!"\n`;

// The `:` sits at offset 15 in `def greet(name):`. The pre-pivot edit appends a
// trailing newline so the offset-15 insertion offsets stay stable.
const pyEntries = [
	{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
	{ kind: 'documentEncountered', id: 0, time: 2000, relativePath: 'src/greet.py' },
	{ kind: 'setContent', id: 0, time: 2001, content: pyDocContent, v: 0 },
	// Only eligible pivot: an in-context edit that establishes edit history.
	{ kind: 'changed', id: 0, time: 2002, edit: [[pyDocContent.length, pyDocContent.length, '\n']], v: 1 },
	// Oracle (post-pivot): insert ` -> str` before the colon.
	{ kind: 'changed', id: 0, time: 2004, edit: [[15, 15, ' -> str']], v: 2 },
];

const pyRecord = {
	recording: JSON.stringify({
		entries: pyEntries,
		entriesSize: JSON.stringify(pyEntries).length,
		windowStart: 1900,
		windowEnd: 2100,
		sessionId: 'sess-py',
		sequenceNumber: 8,
	}),
};

// ---------------------------------------------------------------------------
// Scenario 3 – Invalid: `entries` dropped because the payload exceeded the cap.
//   The sender still ships the window metadata and `entriesSize`; only `entries`
//   is omitted. Such a slice has no usable history and must be reported as a
//   parse error rather than aborting the run.
// ---------------------------------------------------------------------------

const cappedRecord = {
	recording: JSON.stringify({
		entriesSize: 250_000,
		windowStart: 2900,
		windowEnd: 3100,
		sessionId: 'sess-capped',
		sequenceNumber: 9,
	}),
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const continuousFixtures = {
	ts: { record: tsRecord, docContent: tsDocContent },
	py: { record: pyRecord, docContent: pyDocContent },
	capped: { record: cappedRecord },
} as const;

/** All records in the format the continuous loader expects: a JSON array. */
export const allContinuousRecords = [tsRecord, pyRecord, cappedRecord];
