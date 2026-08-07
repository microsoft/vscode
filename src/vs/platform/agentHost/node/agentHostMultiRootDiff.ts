/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { ISessionFileDiff } from '../common/state/sessionState.js';

/**
 * Pure helpers backing the multi-root changeset aggregation. Kept free of any
 * service, git, or ambient state so the aggregation rules (first-wins file
 * dedup and source-availability classification) can be unit tested in
 * isolation, mirroring the pure {@link resolveSessionRepositories} split.
 */

/**
 * Merges several ordered diff lists into one, keeping the FIRST occurrence of
 * each file. The multi-root callers pass their git sources ahead of the
 * DB-tracked (non-git) source, so a git diff always wins over a DB-tracked edit
 * for the same file.
 *
 * Files are keyed by their destination (`after?.uri`, falling back to
 * `before?.uri` for deletions). For `file:` URIs the key is the biased,
 * path-case-aware comparison key ({@link extUriBiasedIgnorePathCase}), so two
 * sources reporting the same file with different casing collapse to one on
 * case-insensitive platforms (macOS/Windows) while staying distinct on Linux —
 * matching how the rest of the agent host compares file paths. Non-`file` URIs
 * keep their exact string identity so unrelated synthetic resources are never
 * folded together.
 */
export function dedupeSessionFileDiffs(orderedDiffLists: readonly (readonly ISessionFileDiff[])[]): ISessionFileDiff[] {
	const merged: ISessionFileDiff[] = [];
	const seenKeys = new Set<string>();
	for (const diffs of orderedDiffLists) {
		for (const diff of diffs) {
			const id = diff.after?.uri ?? diff.before?.uri;
			if (!id) {
				continue;
			}
			const key = dedupeKeyForDiffId(id);
			if (seenKeys.has(key)) {
				continue;
			}
			seenKeys.add(key);
			merged.push(diff);
		}
	}
	return merged;
}

function dedupeKeyForDiffId(id: string): string {
	const resource = URI.parse(id);
	return resource.scheme === Schemas.file
		? extUriBiasedIgnorePathCase.getComparisonKey(resource)
		: id;
}

/**
 * Whether a multi-root summary aggregate could be computed from all, some, or
 * none of its diff sources.
 *
 * - `complete` — every source produced diffs.
 * - `partial` — at least one source produced diffs and at least one did not.
 * - `failed` — no source produced diffs. This covers both a total failure (all
 *   sources errored) and the degenerate case of no sources at all; callers use
 *   it to preserve the previously cached summary rather than overwriting it
 *   with a zero (or under-counted) aggregate.
 */
export type MultiRootDiffOutcome = 'complete' | 'partial' | 'failed';

export interface IMultiRootDiffEvaluation {
	readonly outcome: MultiRootDiffOutcome;
	/**
	 * The sources that produced diffs, in input order. Callers sum only these
	 * so an unavailable source contributes nothing (rather than a spurious
	 * zero) to the aggregate.
	 */
	readonly availableSources: readonly (readonly ISessionFileDiff[])[];
}

/**
 * Classifies an ordered set of diff sources by availability. A source is
 * *available* iff its diffs are defined (`[]` counts as an available,
 * successfully-empty source); an `undefined` entry marks a source that could
 * not be computed. Input order is preserved in {@link IMultiRootDiffEvaluation.availableSources}.
 */
export function evaluateMultiRootDiffSources(orderedSources: readonly (readonly ISessionFileDiff[] | undefined)[]): IMultiRootDiffEvaluation {
	const availableSources = orderedSources.filter((source): source is readonly ISessionFileDiff[] => source !== undefined);
	let outcome: MultiRootDiffOutcome;
	if (availableSources.length === 0) {
		outcome = 'failed';
	} else if (availableSources.length === orderedSources.length) {
		outcome = 'complete';
	} else {
		outcome = 'partial';
	}
	return { outcome, availableSources };
}
