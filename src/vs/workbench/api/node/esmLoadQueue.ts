/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface ISlot<T> {
	readonly pending: Promise<T>;
	readonly turnBoundary: Promise<void>;
}

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

	/**
	 * @param load runs while this slot holds the queue.
	 * @param onSlotEnd runs once, when the slot is handed on, and always before the returned
	 * promise settles. Stop timing the load here rather than when it finishes: a load that
	 * suspends stays pending while later loads run, and their work shouldn't be counted
	 * against it.
	 */
	run<T>(load: () => Promise<T>, onSlotEnd: () => void): Promise<T> {
		const slot = this._chain.then<ISlot<T>>(() => ({
			pending: load(),
			turnBoundary: new Promise<void>(resolve => setImmediate(resolve))
		}));
		const held = this._holdSlot(slot, onSlotEnd);
		this._chain = held;
		// wait on `held` first so `onSlotEnd` has already run once the caller continues
		return held.then(() => slot).then(s => s.pending);
	}

	private async _holdSlot<T>(slot: Promise<ISlot<T>>, onSlotEnd: () => void): Promise<void> {
		try {
			const { pending, turnBoundary } = await slot;
			await Promise.race([pending.then(() => { }, () => { }), turnBoundary]);
		} catch {
			// a load that never started still has to hand the queue on
		} finally {
			onSlotEnd();
		}
	}
}
