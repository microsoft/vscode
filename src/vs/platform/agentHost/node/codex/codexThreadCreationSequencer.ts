/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { isDefined } from '../../../../base/common/types.js';

/**
 * Runs Codex thread creations (`thread/start`, `thread/resume`, `thread/fork`) one at a time per workspace root on
 * Linux.
 *
 * Creating a thread loads AGENTS.md through Codex's bubblewrap filesystem helper whenever the permission profile lacks
 * full-disk read access, as ours does, and a failure of that helper fails the thread creation. Each helper mounts a
 * temporary placeholder at every missing protected path of a workspace root (`.git`, `.agents`, `.codex`) and removes
 * it when it exits. A helper set up meanwhile in the same root sees the placeholder, binds it as a readable root, and
 * fails once it is gone ("bwrap: Can't find source path"). Other platforms mount no placeholders, so they run
 * unsequenced.
 */
export class CodexThreadCreationSequencer {

	private readonly _sequencer = new SequencerByKey<string>();

	constructor(private readonly _platform: NodeJS.Platform) { }

	/**
	 * Runs `task` once no other task sharing one of `roots` runs. Roots are acquired in a fixed order, so tasks
	 * sharing several roots can't wait on each other.
	 */
	run<T>(roots: readonly (string | undefined)[], task: () => Promise<T>): Promise<T> {
		if (this._platform !== 'linux') {
			return task();
		}
		const keys = [...new Set(roots.filter(isDefined))].sort();
		return keys.reduceRight<() => Promise<T>>((next, key) => () => this._sequencer.queue(key, next), task)();
	}
}
