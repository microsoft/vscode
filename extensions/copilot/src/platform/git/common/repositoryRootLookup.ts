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
 * Finds the repository root of a folder. Callers that ask about a folder while a lookup for it waits
 * for a free slot share that lookup.
 *
 * Each lookup can start a `git rev-parse` process, and callers such as indexing and content
 * exclusion ask about every file in the workspace. A large folder can start one git process per
 * file, enough to exhaust process limits, so this class runs at most
 * {@link MAX_CONCURRENT_LOOKUPS} lookups at once.
 *
 * It keeps no answers, and a caller never shares a lookup that started before the caller asked. A
 * repository can appear with no open event, and an older answer would then make content exclusion
 * allow files that repository excludes.
 */
export class RepositoryRootLookup {

	private readonly _waiting = new ResourceMap<Promise<URI | undefined>>();
	// Never disposed. Disposing a limiter drops queued work without settling it, so callers would
	// wait forever.
	private readonly _limiter = new Limiter<URI | undefined>(MAX_CONCURRENT_LOOKUPS);

	constructor(private readonly _findRoot: (folder: URI) => Promise<URI | undefined>) { }

	/** Returns the repository root of a folder, or `undefined` if it is in none. */
	get(folder: URI): Promise<URI | undefined> {
		const waiting = this._waiting.get(folder);
		if (waiting) {
			// Content exclusion can treat a failed lookup as "no repository". Each caller that joined
			// tries again alone, so one failure can't reach every file in the folder.
			return waiting.catch(() => this._limiter.queue(() => this._findRoot(folder)));
		}
		let started = false;
		const lookup = this._limiter.queue(() => {
			started = true;
			// A caller that asks after this point starts its own lookup, because this one may miss a
			// repository that appears while it runs.
			this._waiting.delete(folder);
			return this._findRoot(folder);
		});
		// With a free slot, the limiter starts the lookup before `queue` returns. An entry set after
		// that point would never be deleted, so later callers would keep getting this answer.
		if (!started) {
			this._waiting.set(folder, lookup);
		}
		return lookup;
	}
}
