/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { LogDocumentId, LogEntry } from '../logRecordingTypes';
import { detectCrossFileJump, detectSameFileJump, normalizeRelativePathForModel } from './detectJump';
import { generateCrossFileResponse, generateSameFileResponse } from './cursorJumpResponseStep';
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

	it('detects a far-below edit', () => {
		const r = detectSameFileJump([changed(ACTIVE, 999, 999, 'x')], baseOpts(_ => 30));
		expect(r.isOk()).toBe(true);
		if (r.isOk()) {
			expect(r.val).toEqual({ kind: 'sameFile', fromLine: 10, toLine: 30, toOffset: 999 });
		}
	});

	it('rejects an edit within threshold', () => {
		const r = detectSameFileJump([changed(ACTIVE, 50, 50, 'x')], baseOpts(_ => 12));
		expect(r.isError() && r.err).toBe('jumpWithinThreshold');
	});

	it('ignores selection-only events; uses the first edit as ground truth', () => {
		// Cursor wanders far via navigation (selectionChanged) but no edit
		// happens there; the actual edit is local — within threshold.
		const r = detectSameFileJump(
			[selChanged(ACTIVE, 9999), changed(ACTIVE, 100, 100, 'x')],
			baseOpts(off => off === 100 ? 10 : 999),
		);
		expect(r.isError() && r.err).toBe('jumpWithinThreshold');
	});

	it('uses the first edit of a multi-edit changed event', () => {
		const r = detectSameFileJump(
			[changedMulti(ACTIVE, [[800, 800, 'a'], [50, 50, 'b']])],
			baseOpts(off => off === 800 ? 40 : 5),
		);
		expect(r.isOk()).toBe(true);
		if (r.isOk()) {
			expect(r.val.toOffset).toBe(800);
			expect(r.val.toLine).toBe(40);
		}
	});

	it('bails with editsAnotherFileFirst when another doc is edited first', () => {
		const r = detectSameFileJump(
			[changed(OTHER, 0, 0, 'x'), changed(ACTIVE, 999, 999, 'x')],
			baseOpts(_ => 30),
		);
		expect(r.isError() && r.err).toBe('editsAnotherFileFirst');
	});

	it('returns leftActiveDocBeforeJump when focus moves away first', () => {
		const r = detectSameFileJump([focused(OTHER), changed(ACTIVE, 999, 999, 'x')], baseOpts(_ => 50));
		expect(r.isError() && r.err).toBe('leftActiveDocBeforeJump');
	});

	it('returns noPostRequestActivity for empty input', () => {
		const r = detectSameFileJump([], baseOpts(_ => 0));
		expect(r.isError() && r.err).toBe('noPostRequestActivity');
	});
});

describe('detectCrossFileJump', () => {
	const noPriorContent = () => undefined;

	it('detects a cross-file edit with a fresh setContent in post-request slice', () => {
		const r = detectCrossFileJump(
			[setContent(OTHER, 'line0\nline1\nline2'), changed(OTHER, 12, 12, 'x')],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map([[OTHER, 'src/foo.ts']]), getDocContentAtRequest: noPriorContent },
		);
		expect(r.isOk()).toBe(true);
		if (r.isOk()) {
			expect(r.val.toRelativePath).toBe('src/foo.ts');
			expect(r.val.toLine).toBe(2);
		}
	});

	it('resolves target line from pre-request snapshot when no post-request setContent', () => {
		const r = detectCrossFileJump(
			[changed(OTHER, 12, 12, 'x')],
			{
				activeDocLogId: ACTIVE,
				idToRelativePath: new Map([[OTHER, 'foo.ts']]),
				getDocContentAtRequest: (id) => (id === OTHER ? 'line0\nline1\nline2' : undefined),
			},
		);
		expect(r.isOk()).toBe(true);
		if (r.isOk()) {
			expect(r.val.toLine).toBe(2);
		}
	});

	it('reports crossFileTargetLineUnresolved when neither snapshot nor setContent exist', () => {
		const r = detectCrossFileJump(
			[changed(OTHER, 12, 12, 'x')],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map([[OTHER, 'foo.ts']]), getDocContentAtRequest: noPriorContent },
		);
		expect(r.isError() && r.err).toBe('crossFileTargetLineUnresolved');
	});

	it('applies prior multi-replacement changed events in offset-descending order', () => {
		// base "0123456789"; prior edit on OTHER inserts AAAA + a newline. The
		// later changed event at offset 7 then sees the newline at index 8,
		// so line 0.
		const r = detectCrossFileJump(
			[changedMulti(OTHER, [[1, 2, 'AAAA'], [5, 6, '\n']]), changed(OTHER, 7, 7, 'x')],
			{
				activeDocLogId: ACTIVE,
				idToRelativePath: new Map([[OTHER, 'foo.ts']]),
				getDocContentAtRequest: (id) => (id === OTHER ? '0123456789' : undefined),
			},
		);
		expect(r.isOk()).toBe(true);
		if (r.isOk()) {
			expect(r.val.toLine).toBe(0);
		}
	});

	it('uses the first edit of a multi-edit changed event', () => {
		const r = detectCrossFileJump(
			[changedMulti(OTHER, [[6, 6, 'a'], [0, 0, 'b']])],
			{
				activeDocLogId: ACTIVE,
				idToRelativePath: new Map([[OTHER, 'foo.ts']]),
				getDocContentAtRequest: (id) => (id === OTHER ? '012\n456\n89' : undefined),
			},
		);
		expect(r.isOk()).toBe(true);
		if (r.isOk()) {
			expect(r.val.toLine).toBe(1); // offset 6 on '012\n456\n89' = line 1
		}
	});

	it('ignores cross-file focused / selectionChanged without a changed', () => {
		const r = detectCrossFileJump(
			[focused(OTHER), selChanged(OTHER, 0)],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map([[OTHER, 'foo.ts']]), getDocContentAtRequest: noPriorContent },
		);
		expect(r.isError() && r.err).toBe('noCrossFileEdit');
	});

	it('skips active-doc edits and picks the first non-active-doc edit', () => {
		const r = detectCrossFileJump(
			[changed(ACTIVE, 0, 0, 'a'), changed(OTHER, 5, 5, 'b')],
			{
				activeDocLogId: ACTIVE,
				idToRelativePath: new Map([[OTHER, 'foo.ts']]),
				getDocContentAtRequest: (id) => (id === OTHER ? 'line0\nline1' : undefined),
			},
		);
		expect(r.isOk()).toBe(true);
		if (r.isOk()) {
			expect(r.val.toLine).toBe(0);
		}
	});

	it('rejects when no other doc is edited', () => {
		const r = detectCrossFileJump(
			[changed(ACTIVE, 0, 0, 'a')],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map(), getDocContentAtRequest: noPriorContent },
		);
		expect(r.isError() && r.err).toBe('noCrossFileEdit');
	});

	it('rejects when target path is not in mapping', () => {
		const r = detectCrossFileJump(
			[changed(OTHER, 0, 0, 'x')],
			{ activeDocLogId: ACTIVE, idToRelativePath: new Map(), getDocContentAtRequest: noPriorContent },
		);
		expect(r.isError() && r.err).toBe('crossFileTargetNotEncountered');
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

describe('cursor-jump response formatting', () => {
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
});
