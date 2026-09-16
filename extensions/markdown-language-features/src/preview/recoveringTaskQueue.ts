/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Serializes optimistic webview edits. Advancing the epoch establishes a new
 * authoritative text baseline and invalidates tasks computed from an older one.
 */
export class RecoveringTaskQueue {
	#queue = Promise.resolve();
	#epoch = 0;
	readonly #onError: (error: unknown, epoch: number) => Promise<void>;
	readonly #onRecoveryError: (error: unknown) => void;

	constructor(
		onError: (error: unknown, epoch: number) => Promise<void>,
		onRecoveryError: (error: unknown) => void,
	) {
		this.#onError = onError;
		this.#onRecoveryError = onRecoveryError;
	}

	get epoch(): number {
		return this.#epoch;
	}

	drain(): Promise<void> {
		return this.#queue;
	}

	invalidate(): number {
		return ++this.#epoch;
	}

	enqueue(epoch: number, task: () => Promise<void>): Promise<void> {
		this.#queue = this.#queue.then(async () => {
			if (epoch !== this.#epoch) {
				return;
			}
			try {
				await task();
			} catch (error) {
				if (epoch !== this.#epoch) {
					return;
				}
				const recoveryEpoch = this.invalidate();
				try {
					await this.#onError(error, recoveryEpoch);
				} catch (recoveryError) {
					this.#onRecoveryError(recoveryError);
				}
			}
		});
		return this.#queue;
	}

	enqueueBarrier(task: (epoch: number) => Promise<void> | void): Promise<void> {
		this.#queue = this.#queue.then(async () => {
			const epoch = this.invalidate();
			try {
				await task(epoch);
			} catch (error) {
				this.#onRecoveryError(error);
			}
		});
		return this.#queue;
	}
}
