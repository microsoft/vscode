/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Serializes tasks against an authoritative epoch and converts task failures into recovery.
 * Current-epoch failures advance the epoch and invoke recovery before later tasks run.
 */
export class RecoveringTaskQueue {
	#queue = Promise.resolve();
	#epoch = 0;
	readonly #onError: (error: unknown, epoch: number) => Promise<void>;
	readonly #onRecoveryError: (error: unknown) => void;

	/**
	 * @param onError Restores authoritative state after a task failure; its supplied epoch is already current.
	 * @param onRecoveryError Reports errors from recovery or barrier tasks and must not throw.
	 */
	constructor(
		onError: (error: unknown, epoch: number) => Promise<void>,
		onRecoveryError: (error: unknown) => void,
	) {
		this.#onError = onError;
		this.#onRecoveryError = onRecoveryError;
	}

	/**
	 * The epoch identifying the current authoritative state.
	 */
	get epoch(): number {
		return this.#epoch;
	}

	/**
	 * Resolves after all work queued before this call, including any recovery it triggers, has completed.
	 */
	drain(): Promise<void> {
		return this.#queue;
	}

	/**
	 * Advances the epoch so tasks computed from the previous authoritative state are skipped.
	 */
	invalidate(): number {
		return ++this.#epoch;
	}

	/**
	 * Enqueues a task for an epoch, skipping it if that epoch is no longer current.
	 * A current-epoch failure advances the epoch and awaits recovery before later work runs.
	 */
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

	/**
	 * Runs after previously queued work and advances the epoch immediately before invoking the task.
	 * This preserves accepted work while invalidating later tasks computed from the previous state.
	 */
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
