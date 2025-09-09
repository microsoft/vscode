/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * A queue for notebook executions, like SequencerByKey but keyed by URIs and stops the queue when
 * an execution errors.
 */
export class NotebookExecutionQueue {
	/** Map of last queued execution promise, keyed by notebook URI. */
	private readonly _promisesByNotebookUri = new ResourceMap<Promise<unknown>>();

	queue<T>(key: URI, promiseTask: () => Promise<T>): Promise<T> {
		// Get the last queued promise for this notebook, if one exists.
		const lastPromise = this._promisesByNotebookUri.get(key) ?? Promise.resolve();

		// Chain the new promise after the last.
		const newPromise = lastPromise
			.then(promiseTask)
			.finally(() => {
				// If the last promise in the chain ended, delete the entry for the notebook,
				// starting a new chain.
				if (this._promisesByNotebookUri.get(key) === newPromise) {
					this._promisesByNotebookUri.delete(key);
				}
			});

		// Update the last promise for this notebook.
		this._promisesByNotebookUri.set(key, newPromise);

		return newPromise;
	}
}

