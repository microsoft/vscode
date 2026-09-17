/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { Random } from '../../../src/platform/inlineEdits/test/node/random';
import { LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { PivotStrategy } from '../../base/simulationOptions';
import { deriveSeed, selectPivots } from './pivotStrategy';

const ID = 0;

function meta(): LogEntry {
	return { kind: 'meta', data: { repoRootUri: 'file:///ws' } };
}
function encountered(time: number): LogEntry {
	return { kind: 'documentEncountered', id: ID, time, relativePath: 'a.ts' };
}
function setContent(time: number): LogEntry {
	return { kind: 'setContent', id: ID, time, content: 'x', v: 0 };
}
function changed(time: number): LogEntry {
	return { kind: 'changed', id: ID, time, edit: [[0, 0, 'y']], v: 1 };
}
function selection(time: number): LogEntry {
	return { kind: 'selectionChanged', id: ID, time, selection: [[0, 0]] };
}

/** A well-formed recording: meta, encounter, content, selection, then 2 later edits. */
const recording: LogEntry[] = [meta(), encountered(1), setContent(2), selection(3), changed(4), changed(5)];

describe('selectPivots (random)', () => {
	it('selects only changed/selectionChanged entries (never framing)', () => {
		// Indices: 0 meta, 1 documentEncountered, 2 setContent, 3 selectionChanged,
		// 4 changed, 5 changed. Only 3 and 4 are eligible (5 is last → no oracle;
		// 1 and 2 are framing). Sweep seeds to exercise the random choice.
		const chosen = new Set<number>();
		for (let seed = 0; seed < 50; seed++) {
			const pivots = selectPivots(recording, PivotStrategy.Random, Random.create(seed));
			expect(pivots).toHaveLength(1);
			chosen.add(pivots[0]);
		}
		expect([...chosen].sort()).toEqual([3, 4]);
	});

	it('is deterministic for a given seed', () => {
		const a = selectPivots(recording, PivotStrategy.Random, Random.create(42));
		const b = selectPivots(recording, PivotStrategy.Random, Random.create(42));
		expect(a).toEqual(b);
	});

	it('rejects records whose only unique-time entries are framing', () => {
		// documentEncountered + setContent have unique times but are framing;
		// the single changed is last, so no oracle follows it.
		const framingOnly: LogEntry[] = [encountered(1), setContent(2), changed(3)];
		expect(selectPivots(framingOnly, PivotStrategy.Random, Random.create(1))).toEqual([]);
	});

	it('rejects records with duplicate times (ambiguous split boundary)', () => {
		const dup: LogEntry[] = [encountered(1), changed(1), changed(1)];
		expect(selectPivots(dup, PivotStrategy.Random, Random.create(1))).toEqual([]);
	});

	it('rejects records with no edit after any candidate', () => {
		const noOracle: LogEntry[] = [encountered(1), setContent(2), selection(3)];
		expect(selectPivots(noOracle, PivotStrategy.Random, Random.create(1))).toEqual([]);
	});

	it('rejects an empty recording', () => {
		expect(selectPivots([], PivotStrategy.Random, Random.create(1))).toEqual([]);
	});
});

describe('deriveSeed', () => {
	it('is deterministic and index-dependent', () => {
		expect(deriveSeed(100, 5)).toBe(deriveSeed(100, 5));
		expect(deriveSeed(100, 5)).not.toBe(deriveSeed(100, 6));
		expect(deriveSeed(100, 5)).not.toBe(deriveSeed(101, 5));
	});
});
