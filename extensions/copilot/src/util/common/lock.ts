/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A class representing a lock that can be acquired and released.
 */
export class Lock {

	private _locked = false;
	private _queue: (() => void)[] = [];

	get locked(): boolean {
		return this._locked;
	}

	/**
	 * Acquires the lock. If the lock is already acquired, waits until it is released.
	 */
	async acquire(): Promise<void> {
		if (!this._locked) {
			this._locked = true;
			return;
		}

		await new Promise<void>((resolve) => {
			this._queue.push(resolve);
		});
		await this.acquire();
	}

	/**
	 * Releases the lock and allows the next queued function to execute.
	 * If the lock is not currently locked, an error will be thrown.
	 */
	release(): void {
		if (!this._locked) {
			throw new Error('Cannot release an unlocked lock');
		}

		this._locked = false;
		const next = this._queue.shift();
		if (next) {
			next();
		}
	}
}

export class LockMap {

	private _locks: Map<string, Lock> = new Map();

	async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		if (!this._locks.has(key)) {
			this._locks.set(key, new Lock());
		}

		const lock = this._locks.get(key)!;

		await lock.acquire();

		try {
			return await fn();
		} catch (error) {
			throw error;
		} finally {
			lock.release();
		}
	}
}
