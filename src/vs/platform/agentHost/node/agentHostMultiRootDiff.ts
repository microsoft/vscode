/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { ISessionFileDiff } from '../common/state/sessionState.js';

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
