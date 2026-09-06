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
 * Merges several ordered change lists into one, keeping the FIRST diff seen for
 * each file. Priority is purely positional — the earliest list wins; this helper
 * is source-agnostic and never inspects where a diff came from.
 *
 * A file is identified by `after.uri` (or `before.uri` for deletions); diffs
 * with neither are skipped. `file:` paths match per-OS (case-insensitive on
 * macOS/Windows, case-sensitive on Linux); other schemes match by exact string.
 *
 * The multi-root turn caller passes its git-repo diffs before the non-git
 * edit-tracker list, so git wins when both report the same file — e.g. a git
 * repo nested under a non-git folder, where the file appears in both the repo's
 * git diff and the folder's edit-tracker list.
 *
 * Example (macOS/Windows), git list first, edit-tracker list second:
 *   gitRepoA:    [ file:///work/repoA/App.ts, file:///work/repoA/Gone.ts (deleted) ]
 *   editTracker: [ file:///work/repoA/app.ts, file:///work/notes.md ]
 *   ->           [ App.ts (git), Gone.ts (git), notes.md ]
 * `app.ts` is dropped as a case-insensitive duplicate of the git `App.ts`; on
 * Linux both would be kept as distinct files.
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
 * none of its diff sources. A source is "available" when it was computed
 * successfully — including an empty `[]` (a successful "no changes" result);
 * only `undefined` means it could not be computed.
 *
 * - `complete` — every source was computed successfully (an empty result counts).
 * - `partial` — at least one source was computed successfully and at least one
 *   could not be.
 * - `failed` — no source could be computed. This covers both a total failure
 *   (all sources errored) and the degenerate case of no sources at all; callers
 *   use it to preserve the previously cached summary rather than overwriting it
 *   with a zero (or under-counted) aggregate.
 */
export type MultiRootDiffOutcome = 'complete' | 'partial' | 'failed';

export interface IMultiRootDiffEvaluation {
	readonly outcome: MultiRootDiffOutcome;
	/**
	 * The sources that were computed successfully (available), in input order.
	 * Callers sum only these so an unavailable source contributes nothing
	 * (rather than a spurious zero) to the aggregate.
	 */
	readonly availableSources: readonly (readonly ISessionFileDiff[])[];
}

/**
 * Classifies an ordered list of diff sources so the caller knows whether to
 * publish a fresh aggregate or keep the previously cached one.
 *
 * A source is *available* when its diffs are defined; `undefined` means it
 * could not be computed (e.g. a repo's git diff threw). An empty array `[]` is
 * a successful "no changes" result and still counts as available. The returned
 * {@link IMultiRootDiffEvaluation.availableSources} keeps input order and drops
 * the `undefined` entries, so the caller can sum only what was available.
 *
 * Outcome (see {@link MultiRootDiffOutcome}): `complete` = all available,
 * `partial` = some available, `failed` = none available (all errored, or no
 * sources at all — the signal to preserve the cached summary).
 *
 * Note the difference between "successful zero" and "failed": `[[], []]` →
 * `complete` (publish a real zero), but `[undefined, undefined]` and `[]` →
 * `failed` (keep the cached value).
 *
 * @example
 * [[a], [b]]             -> complete, [[a], [b]]
 * [[a], []]              -> complete, [[a], []]     // [] is available
 * [[a], undefined]       -> partial,  [[a]]
 * [undefined, undefined] -> failed,   []            // total failure
 * []                     -> failed,   []            // no sources at all
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
