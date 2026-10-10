/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Random } from '../../../src/platform/inlineEdits/test/node/random';
import { LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { assertNever } from '../../../src/util/vs/base/common/assert';
import { PivotStrategy } from '../../base/simulationOptions';

/**
 * Choose pivot *times* for a recording according to `strategy`.
 *
 * Continuous slices (from `ContinuousEnhancedTelemetrySender`) have no NES
 * request bookmark, so a pivot must be synthesized. A pivot splits the timeline
 * into *context* (everything at or before the pivot) and the *oracle* (the
 * user's next edits after the pivot).
 *
 * Returns the `time` of each chosen pivot entry (matching the `requestTime`
 * semantics the downstream split expects, see `Processor.splitRecording`).
 * Returns an empty array when no eligible pivot exists.
 *
 * The return type is an array so future strategies (idle-gap, every-edit, ...)
 * can yield multiple pivots per record; `random` yields at most one.
 */
export function selectPivots(entries: readonly LogEntry[], strategy: PivotStrategy, rng: Random): number[] {
	switch (strategy) {
		case PivotStrategy.Random:
			return selectRandomPivot(entries, rng);
		default:
			return assertNever(strategy);
	}
}

function selectRandomPivot(entries: readonly LogEntry[], rng: Random): number[] {
	const candidates = eligiblePivotIndices(entries);
	if (candidates.length === 0) {
		return [];
	}
	const idx = candidates[rng.nextIntRange(0, candidates.length)];
	return [entryTime(entries[idx])!];
}

/**
 * Indices `i` that are valid pivot points. An index is eligible when:
 *
 * - `entries[i].kind` is `changed` or `selectionChanged`. This is the key
 *   constraint and it satisfies two requirements at once:
 *     1. *Replayability.* The replay engine establishes the prefix's active
 *        document only on `changed`/`selectionChanged` (see
 *        `ObservableWorkspaceRecordingReplayer`); pivoting on framing entries
 *        (`documentEncountered`/`setContent`/`opened`) would leave the prefix
 *        with no active document and fail replay. Because the pivot is also the
 *        last entry of the prefix, the split's active document (the last
 *        id-bearing entry) and the replayer's active document coincide.
 *     2. *In-window.* Continuous slices carry self-contained framing whose true
 *        times can pre-date the slice window (see `DebugRecorder.getDocumentLogInRange`),
 *        whereas `changed`/`selectionChanged` only ever come from in-window
 *        activity. Restricting to those kinds keeps the pivot inside the window.
 *   These are also exactly the moments a real NES request fires (after an edit
 *   or a cursor move), so the synthesized sample mirrors production.
 * - `entries[i].time` is *globally unique* across the recording. Uniqueness
 *   guarantees that splitting by time lands deterministically on index `i`
 *   (`binarySearch` returns an arbitrary index among equal-time entries), which
 *   defends the rare case where an in-window event shares a timestamp with
 *   framing or with another document's event.
 * - the active document (`entries[i].id`) was introduced by a
 *   `documentEncountered` somewhere, so its path is resolvable.
 * - the suffix `[i+1..]` holds at least one `changed` event on that active
 *   document — i.e. a non-empty oracle exists.
 *
 * @returns eligible indices in ascending order (possibly empty).
 */
function eligiblePivotIndices(entries: readonly LogEntry[]): number[] {
	const n = entries.length;
	const eligible: number[] = [];
	if (n < 2) {
		return eligible;
	}

	// Single forward pass to compute the set of document ids ever introduced,
	// the last index a `changed` occurred per document id, and time frequencies.
	const encounteredIds = new Set<number>();
	const lastChangedIdxForId = new Map<number, number>();
	const timeFrequency = new Map<number, number>();
	for (let i = 0; i < n; i++) {
		const entry = entries[i];
		if (entry.kind === 'documentEncountered') {
			encounteredIds.add(entry.id);
		} else if (entry.kind === 'changed') {
			lastChangedIdxForId.set(entry.id, i);
		}

		const time = entryTime(entry);
		if (time !== undefined) {
			timeFrequency.set(time, (timeFrequency.get(time) ?? 0) + 1);
		}
	}

	for (let i = 0; i < n - 1; i++) {
		const entry = entries[i];
		if (entry.kind !== 'changed' && entry.kind !== 'selectionChanged') {
			continue; // pivot must establish a replayable, in-window active document
		}
		if (timeFrequency.get(entry.time) !== 1) {
			continue; // need an unambiguous, deterministic split boundary
		}
		if (!encounteredIds.has(entry.id)) {
			continue; // active document must be resolvable to a path
		}
		const lastChangedIdx = lastChangedIdxForId.get(entry.id);
		if (lastChangedIdx === undefined || lastChangedIdx <= i) {
			continue; // a non-empty oracle must follow the pivot on the active doc
		}
		eligible.push(i);
	}

	return eligible;
}

/** The numeric event time of an entry, or `undefined` for `meta` entries. */
function entryTime(entry: LogEntry): number | undefined {
	return 'time' in entry ? entry.time : undefined;
}

/**
 * Derive a per-record seed from a base seed and a record index using a
 * splitmix32-style integer hash. This makes each record's pivot selection
 * depend only on `(baseSeed, globalRecordIndex)` — never on how the input is
 * chunked across parallel workers — so runs are reproducible from `--seed`
 * regardless of `--parallelism`.
 */
export function deriveSeed(baseSeed: number, index: number): number {
	let h = (baseSeed ^ (index + 0x9e3779b9)) >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
	h = (h ^ (h >>> 15)) >>> 0;
	return h;
}
