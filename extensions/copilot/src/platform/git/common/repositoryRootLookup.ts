/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../util/vs/base/common/async';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { URI } from '../../../util/vs/base/common/uri';

/** How many lookups may run at once. Each one can start a git process. */
const MAX_CONCURRENT_LOOKUPS = 5;

/**
 * Finds the repository root of a folder. Each lookup can start a git process, and callers ask once
 * for every file in the workspace, so at most {@link MAX_CONCURRENT_LOOKUPS} lookups run at once.
 *
 * Callers share a lookup for the same folder only while that lookup waits for a free slot. This class
 * stores no answers. A repository can appear with no open event, and a stored answer would then make
 * content exclusion allow files that the repository excludes.
 */
export class RepositoryRootLookup {

	private readonly _queued = new ResourceMap<Promise<URI | undefined>>();
	// Never dispose this limiter. A disposed limiter drops its queued work, and those callers wait forever.
	private readonly _limiter = new Limiter<URI | undefined>(MAX_CONCURRENT_LOOKUPS);

	constructor(private readonly _findRoot: (folder: URI) => Promise<URI | undefined>) { }

	/** Returns the repository root of a folder, or `undefined` if it is in none. */
	get(folder: URI): Promise<URI | undefined> {
		const queued = this._queued.get(folder);
		if (queued) {
			// Each caller that shared a failed lookup retries alone. One failure then can't make content
			// exclusion allow the whole folder.
			return queued.catch(() => this._limiter.queue(() => this._findRoot(folder)));
		}
		let started = false;
		const lookup = this._limiter.queue(() => {
			started = true;
			// Later callers start a new lookup. This one can miss a repository that appears while it runs.
			this._queued.delete(folder);
			return this._findRoot(folder);
		});
		// With a free slot, the limiter starts the lookup before `queue` returns. Nothing would delete an
		// entry added after that, so every later caller would get this answer.
		if (!started) {
			this._queued.set(folder, lookup);
		}
		return lookup;
	}
}
