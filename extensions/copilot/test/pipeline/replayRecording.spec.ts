/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { LogEntry } from '../../src/platform/workspaceRecorder/common/workspaceLog';
import { IInputRow } from './parseInput';
import { processAllRows } from './replayRecording';

const doc = `const a = 1;\nconst b = 2;\n`;

/**
 * Build an {@link IInputRow} whose recording replays a pre-pivot no-op edit and
 * then applies `oracleEdit` after the pivot. Disjoint replacements replay
 * cleanly; overlapping replacements make replay throw, which is how we exercise
 * the error path without any stubbing.
 */
function makeRowWithPostEntries(originalRowIndex: number, postRequestEntries: LogEntry[]): IInputRow {
	const entries: LogEntry[] = [
		{ kind: 'meta', data: { repoRootUri: 'file:///ws' } },
		{ kind: 'documentEncountered', id: 0, time: 1000, relativePath: 'src/a.ts' },
		{ kind: 'setContent', id: 0, time: 1001, content: doc, v: 0 },
		// Pre-pivot no-op edit so the replayer has a `lastId`.
		{ kind: 'changed', id: 0, time: 1002, edit: [[0, 0, '']], v: 1 },
		// --- requestTime 1003 splits here; the rest is the oracle ---
		...postRequestEntries,
	];
	return {
		originalRowIndex,
		suggestionStatus: 'accepted',
		alternativeAction: {
			text: doc,
			textLength: doc.length,
			selection: [],
			edits: [],
			tags: [],
			recording: { entries, entriesSize: entries.length, requestTime: 1003 },
		},
		prompt: [],
		modelResponse: '',
		postProcessingOutcome: { suggestedEdit: '', isInlineCompletion: false },
		activeDocumentLanguageId: 'typescript',
	};
}

function makeRow(originalRowIndex: number, oracleEdit: [number, number, string][]): IInputRow {
	return makeRowWithPostEntries(originalRowIndex, [
		{ kind: 'changed', id: 0, time: 1004, edit: oracleEdit, v: 2 },
	]);
}

describe('processAllRows', () => {
	it('labels replay errors with the row\'s originalRowIndex, not its filtered array position', () => {
		// Earlier parse failures make `loadAndParseInput` hand back a *sparse*
		// `rows` array: survivors keep their true input-file `originalRowIndex`
		// (0, 3, 5), so the failing row's index (3) differs from its position (1)
		// in the array. The error must be labeled by index, not position.
		const rows = [
			makeRow(0, [[6, 7, 'x']]),                 // valid: rename `a` -> `x`
			makeRow(3, [[0, 4, 'X'], [2, 6, 'Y']]),    // malformed: overlapping -> replay throws
			makeRow(5, [[6, 7, 'y']]),                 // valid: rename `a` -> `y`
		];

		const { processed, errors } = processAllRows(rows);
		try {
			expect(processed.map(p => p.originalRowIndex)).toEqual([0, 5]);
			expect(errors.map(e => ({ originalRowIndex: e.originalRowIndex, isError: e.value instanceof Error }))).toEqual([
				{ originalRowIndex: 3, isError: true },
			]);
		} finally {
			processed.forEach(p => p.replayer.dispose());
		}
	});

	it('composes touching operations before applying the oracle edit limit', () => {
		const insertedText = 'abcdefghijkl';
		const postRequestEntries: LogEntry[] = [...insertedText].map((text, index) => ({
			kind: 'changed',
			id: 0,
			time: 1004 + index,
			edit: [[doc.length + index, doc.length + index, text]],
			v: index + 2,
		}));
		const { processed, errors } = processAllRows([makeRowWithPostEntries(0, postRequestEntries)], 1);
		try {
			expect({
				errors,
				nextUserEdit: processed[0]?.nextUserEdit,
			}).toEqual({
				errors: [],
				nextUserEdit: {
					edit: [[doc.length, doc.length, insertedText]],
					relativePath: 'src/a.ts',
					originalOpIdx: 3,
				},
			});
		} finally {
			processed.forEach(processedRow => processedRow.replayer.dispose());
		}
	});

	it('stops the oracle before a content restore', () => {
		const postRequestEntries: LogEntry[] = [
			{ kind: 'changed', id: 0, time: 1004, edit: [[6, 7, 'x']], v: 2 },
			{ kind: 'restoreContent', id: 0, time: 1005, contentId: 'saved', v: 3 },
			{ kind: 'changed', id: 0, time: 1006, edit: [[19, 20, 'y']], v: 4 },
		];
		const { processed, errors } = processAllRows([makeRowWithPostEntries(0, postRequestEntries)]);
		try {
			expect({
				errors,
				nextUserEdit: processed[0]?.nextUserEdit.edit,
			}).toEqual({
				errors: [],
				nextUserEdit: [[6, 7, 'x']],
			});
		} finally {
			processed.forEach(processedRow => processedRow.replayer.dispose());
		}
	});
});
