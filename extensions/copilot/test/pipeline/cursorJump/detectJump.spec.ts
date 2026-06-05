/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { LogDocumentId, LogEntry } from '../logRecordingTypes';
import { detectCrossFileJump, detectSameFileJump, normalizeRelativePathForModel } from './detectJump';
import { generateCrossFileResponse, generateSameFileResponse } from './nclpResponseStep';
import { OffsetRange } from '../../../src/util/vs/editor/common/core/ranges/offsetRange';

const ACTIVE: LogDocumentId = 1 as LogDocumentId;
const OTHER: LogDocumentId = 2 as LogDocumentId;

function selChanged(id: LogDocumentId, offset: number): LogEntry {
	return { id, time: 0, kind: 'selectionChanged', selection: [[offset, offset]] };
}

function changed(id: LogDocumentId, start: number, endEx: number, text: string): LogEntry {
	return { id, time: 0, kind: 'changed', edit: [[start, endEx, text]], v: 0 };
}

function changedMulti(id: LogDocumentId, edits: readonly (readonly [number, number, string])[]): LogEntry {
	return { id, time: 0, kind: 'changed', edit: edits.map(e => [...e] as [number, number, string]), v: 0 };
}

function focused(id: LogDocumentId): LogEntry {
	return { id, time: 0, kind: 'focused' };
}

function setContent(id: LogDocumentId, content: string): LogEntry {
	return { id, time: 0, kind: 'setContent', v: 0, content };
}

describe('detectSameFileJump', () => {
	const baseOpts = (lineFor: (offset: number) => number) => ({
		activeDocLogId: ACTIVE,
		cursorAtRequest: { offset: 100, lineNumber: 10 },
		minLinesAbove: 5,
		minLinesBelow: 5,
		resolveActiveDocLineAt: (_i: number, offset: number) => lineFor(offset),
	});

	it('detects a far-below jump', () => {
		const r = detectSameFileJump([selChanged(ACTIVE, 999)], baseOpts(_ => 30));
		expect(r).toEqual({ ok: true, value: { kind: 'sameFile', fromLine: 10, toLine: 30, toOffset: 999 } });
	});

	it('rejects a jump within threshold', () => {
		const r = detectSameFileJump([selChanged(ACTIVE, 50)], baseOpts(_ => 12));
		expect(r).toEqual({ ok: false, reason: 'jumpWithinThreshold' });
	});

	it('filters settle-after-edit and continues to next event', () => {
		const r = detectSameFileJump(
			[
				changed(ACTIVE, 50, 50, 'abc'),
				selChanged(ACTIVE, 53), // settle at end of insert (50+3)
				selChanged(ACTIVE, 999), // real jump
			],
			baseOpts(off => off === 999 ? 50 : 5),
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.toLine).toBe(50);
		}
	});

	it('returns leftActiveDocBeforeJump when focus moves away first', () => {
		const r = detectSameFileJump([focused(OTHER), selChanged(ACTIVE, 999)], baseOpts(_ => 50));
		expect(r).toEqual({ ok: false, reason: 'leftActiveDocBeforeJump' });
	});

	it('returns noPostRequestActivity for empty input', () => {
		const r = detectSameFileJump([], baseOpts(_ => 0));
		expect(r).toEqual({ ok: false, reason: 'noPostRequestActivity' });
	});
});

describe('detectCrossFileJump', () => {
	const noPriorContent = () => undefined;

	it('detects a cross-file selection with a fresh setContent in post-request slice', () => {
		const r = detectCrossFileJump(
			[setContent(OTHER, 'line0\nline1\nline2'), selChanged(OTHER, 12)],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map([[OTHER, 'src/foo.ts']]), getDocContentAtRequest: noPriorContent },
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.toRelativePath).toBe('src/foo.ts');
			expect(r.value.toLine).toBe(2);
		}
	});

	it('resolves target line from pre-request snapshot when no post-request setContent', () => {
		const r = detectCrossFileJump(
			[selChanged(OTHER, 12)],
			{
				activeDocLogId: ACTIVE,
				idToRelativePath: new Map([[OTHER, 'foo.ts']]),
				getDocContentAtRequest: (id) => (id === OTHER ? 'line0\nline1\nline2' : undefined),
			},
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.toLine).toBe(2);
		}
	});

	it('reports crossFileTargetLineUnresolved when neither snapshot nor setContent exist', () => {
		const r = detectCrossFileJump(
			[selChanged(OTHER, 12)],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map([[OTHER, 'foo.ts']]), getDocContentAtRequest: noPriorContent },
		);
		expect(r).toEqual({ ok: false, reason: 'crossFileTargetLineUnresolved' });
	});

	it('applies multi-replacement post-request changed events in offset-descending order', () => {
		// base "0123456789"; recorder emits replacements relative to the same
		// base, ascending. Applying them ascending in-place would mis-place the
		// inserted newline (→ line 1 at offset 7); the correct descending order
		// yields the newline at index 8 (→ line 0 at offset 7).
		const r = detectCrossFileJump(
			[changedMulti(OTHER, [[1, 2, 'AAAA'], [5, 6, '\n']]), selChanged(OTHER, 7)],
			{
				activeDocLogId: ACTIVE,
				idToRelativePath: new Map([[OTHER, 'foo.ts']]),
				getDocContentAtRequest: (id) => (id === OTHER ? '0123456789' : undefined),
			},
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.toLine).toBe(0);
		}
	});

	it('rejects when no other doc is touched', () => {
		const r = detectCrossFileJump(
			[selChanged(ACTIVE, 0)],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map(), getDocContentAtRequest: noPriorContent },
		);
		expect(r).toEqual({ ok: false, reason: 'noCrossFileJump' });
	});

	it('rejects when target path is not in mapping', () => {
		const r = detectCrossFileJump(
			[selChanged(OTHER, 0)],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map(), getDocContentAtRequest: noPriorContent },
		);
		expect(r).toEqual({ ok: false, reason: 'crossFileTargetNotEncountered' });
	});
});

describe('normalizeRelativePathForModel', () => {
	it('converts backslashes to forward slashes', () => {
		expect(normalizeRelativePathForModel('src\\foo\\bar.ts')).toBe('src/foo/bar.ts');
	});

	it('drops leading ./', () => {
		expect(normalizeRelativePathForModel('./src/foo.ts')).toBe('src/foo.ts');
	});

	it('collapses repeated slashes', () => {
		expect(normalizeRelativePathForModel('src//foo///bar.ts')).toBe('src/foo/bar.ts');
	});

	it('preserves notebook cell fragments', () => {
		expect(normalizeRelativePathForModel('nb.ipynb#cell3')).toBe('nb.ipynb#cell3');
	});
});

describe('nclp response formatting', () => {
	it('formats a same-file jump as line number', () => {
		const r = generateSameFileResponse(
			{ kind: 'sameFile', fromLine: 10, toLine: 30, toOffset: 999 },
			new OffsetRange(0, 100),
		);
		expect(r).toEqual({ assistant: '30', jump: { fromLine: 10, toLine: 30, distance: 20 } });
	});

	it('rejects same-file jump outside kept range', () => {
		const r = generateSameFileResponse(
			{ kind: 'sameFile', fromLine: 10, toLine: 200, toOffset: 999 },
			new OffsetRange(0, 100),
		);
		expect('error' in r).toBe(true);
	});

	it('formats a cross-file jump as path:line', () => {
		const r = generateCrossFileResponse(
			{ kind: 'crossFile', toDocLogId: OTHER, toRelativePath: 'src\\foo.ts', toLine: 7 },
			3,
		);
		expect(r).toEqual({
			assistant: 'src/foo.ts:7',
			jump: { fromLine: 3, toLine: 7, toFilePath: 'src/foo.ts', distance: 0 },
		});
	});

	it('rejects cross-file jump with unresolved target line', () => {
		const r = generateCrossFileResponse(
			{ kind: 'crossFile', toDocLogId: OTHER, toRelativePath: 'foo.ts', toLine: undefined },
			3,
		);
		expect(r).toEqual({ error: 'crossFileTargetLineUnresolved' });
	});
});
