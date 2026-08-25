/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runs ESM module loads one at a time.
 *
 * `import()` does its work in the microtask queue, so when several extensions activate
 * together they all run inside each other's timing window and each one gets billed for the
 * others' code. Running them one at a time keeps each extension's `codeLoadingTime` to its
 * own work.
 *
 * The next load starts as soon as the current one finishes, or at the end of the current turn
 * if it hasn't. That second case is what stops an extension using top-level `await` from
 * holding up everyone queued behind it.
 */
export class ESMLoadQueue {

	private _chain: Promise<void> = Promise.resolve();

	run<T>(load: () => Promise<T>): Promise<T> {
		const slot = this._chain.then(() => ({
			pending: load(),
			turnBoundary: new Promise<void>(resolve => setImmediate(resolve))
		}));
		this._chain = slot.then(
			s => Promise.race([s.pending.then(() => { }, () => { }), s.turnBoundary]),
			() => { }
		);
		return slot.then(s => s.pending);
	}
}
