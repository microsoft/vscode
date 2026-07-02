/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { PivotStrategy } from '../../base/simulationOptions';
import { IContinuousRecord } from './continuousRecord';
import { CONTINUOUS_SUGGESTION_STATUS, processContinuousRecord, processContinuousRecords } from './processContinuous';

const doc = Array.from({ length: 30 }, (_, i) => `// L${String(i).padStart(2, '0')}`).join('\n') + '\n';

// Window metadata the sender always ships; irrelevant to pivot/replay logic but
// required by `IContinuousRecording`, so these tests fill it with fixed dummies.
const META = { windowStart: 0, windowEnd: 1, sessionId: 'test', sequenceNumber: 0 };

const entries: LogEntry[] = [
	{ kind: 'meta', data: { repoRootUri: 'file:///ws' } },
	{ kind: 'documentEncountered', id: 0, time: 1000, relativePath: 'src/x.ts' },
	{ kind: 'setContent', id: 0, time: 1001, content: doc, v: 0 },
	{ kind: 'selectionChanged', id: 0, time: 1002, selection: [[14, 14]] },
	{ kind: 'changed', id: 0, time: 1004, edit: [[175, 175, 'Z']], v: 1 },
	{ kind: 'selectionChanged', id: 0, time: 1006, selection: [[175, 175]] },
	{ kind: 'changed', id: 0, time: 1008, edit: [[7, 7, 'Q']], v: 2 },
];

function record(): IContinuousRecord {
	return { originalRowIndex: 0, value: { entries, entriesSize: 100, ...META } };
}

describe('processContinuousRecord', () => {
	it('synthesizes an oracle-only row and resolves language from the active file', () => {
		const result = processContinuousRecord(record(), 1002);
		expect(result.isOk()).toBe(true);
		if (result.isError()) { return; }
		expect(result.val.row.suggestionStatus).toBe(CONTINUOUS_SUGGESTION_STATUS);
		expect(result.val.row.activeDocumentLanguageId).toBe('typescript');
		result.val.replayer.dispose();
	});

	it('errors when the recording has no entries', () => {
		const empty: IContinuousRecord = { originalRowIndex: 0, value: { entries: [], entriesSize: 0, ...META } };
		expect(processContinuousRecord(empty, 0).isError()).toBe(true);
	});
});

describe('processContinuousRecords', () => {
	it('produces identical pivots across runs with the same seed', () => {
		const a = processContinuousRecords([record()], PivotStrategy.Random, 99, 0);
		const b = processContinuousRecords([record()], PivotStrategy.Random, 99, 0);
		expect(a.processed.length).toBe(b.processed.length);
		expect(a.errors).toEqual(b.errors);
		[...a.processed, ...b.processed].forEach(p => p.replayer.dispose());
	});

	it('every selected pivot is replayable (eligible ⟹ replayable)', () => {
		// Regression guard: a pivot that `selectPivots` deems eligible must always
		// produce a real sample, never a replay error. Sweep seeds so different
		// eligible pivots (the in-window selectionChanged/changed entries) are hit.
		for (let seed = 0; seed < 50; seed++) {
			const { processed, errors } = processContinuousRecords([record()], PivotStrategy.Random, seed, 0);
			expect(errors).toEqual([]);
			expect(processed).toHaveLength(1);
			processed.forEach(p => p.replayer.dispose());
		}
	});

	it('reports a no-eligible-pivot error when no oracle follows', () => {
		const noOracle: IContinuousRecord = {
			originalRowIndex: 3,
			value: { entries: entries.slice(0, 4), entriesSize: 50, ...META },
		};
		const { processed, errors } = processContinuousRecords([noOracle], PivotStrategy.Random, 1, 0);
		expect(processed).toHaveLength(0);
		expect(errors[0]).toMatchObject({ originalRowIndex: 3 });
	});

	it('isolates a throwing record so the rest of the batch still produces rows', () => {
		// A malformed oracle edit (overlapping replacements) makes replay throw a
		// `BugIndicatingError` from the `StringEdit` constructor. One bad record
		// must not abort the whole batch: it should surface as a per-record error
		// while its siblings still process — matching the alternative-action path.
		const malformedEntries: LogEntry[] = [
			{ kind: 'meta', data: { repoRootUri: 'file:///ws' } },
			{ kind: 'documentEncountered', id: 0, time: 3000, relativePath: 'src/bad.ts' },
			{ kind: 'setContent', id: 0, time: 3001, content: doc, v: 0 },
			{ kind: 'changed', id: 0, time: 3003, edit: [[5, 5, 'A']], v: 1 },
			{ kind: 'changed', id: 0, time: 3005, edit: [[10, 14, 'X'], [12, 16, 'Y']], v: 2 },
		];
		const malformed: IContinuousRecord = { originalRowIndex: 1, value: { entries: malformedEntries, entriesSize: 80, ...META } };
		const good = (originalRowIndex: number): IContinuousRecord => ({ originalRowIndex, value: { entries, entriesSize: 100, ...META } });

		const { processed, errors } = processContinuousRecords([good(0), malformed, good(2)], PivotStrategy.Random, 7, 0);

		expect(processed).toHaveLength(2);
		expect(errors.map(e => ({ originalRowIndex: e.originalRowIndex, isError: e.value instanceof Error }))).toEqual([{ originalRowIndex: 1, isError: true }]);
		processed.forEach(p => p.replayer.dispose());
	});
});
