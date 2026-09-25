/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface QueuedTask {
	readonly kind: 'task';
	readonly epoch: number;
	readonly run: () => Promise<void>;
	readonly complete: () => void;
}

interface QueuedBarrier {
	readonly kind: 'barrier';
	readonly run: (epoch: number) => Promise<void> | void;
	readonly complete: () => void;
}

/**
 * Serializes tasks against an authoritative epoch and converts task failures into recovery.
 * Current-epoch failures advance the epoch and invoke recovery before later tasks run.
 */
export class RecoveringTaskQueue {
	readonly #pending: (QueuedTask | QueuedBarrier)[] = [];
	#tail = Promise.resolve();
	#processing = false;
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
	 * Resolves after the current queue tail, including its recovery, has completed.
	 * A pending barrier also waits for current-epoch tasks accepted before it starts.
	 */
	drain(): Promise<void> {
		return this.#tail;
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
		let complete!: () => void;
		const completion = new Promise<void>(resolve => complete = resolve);
		const entry = {
			kind: 'task' as const,
			epoch,
			run: task,
			complete,
		};
		const barrierIndex = this.#pending.findIndex(candidate => candidate.kind === 'barrier');
		if (barrierIndex >= 0) {
			this.#pending.splice(barrierIndex, 0, entry);
		} else {
			this.#pending.push(entry);
			this.#tail = completion;
		}
		this.#process();
		return completion;
	}

	/**
	 * Runs once the current epoch has no pending tasks, then advances the epoch before invoking the barrier.
	 * Current-epoch tasks accepted while the barrier waits run before it; later stale tasks are skipped.
	 */
	enqueueBarrier(task: (epoch: number) => Promise<void> | void): Promise<void> {
		let complete!: () => void;
		const completion = new Promise<void>(resolve => complete = resolve);
		this.#pending.push({
			kind: 'barrier',
			run: task,
			complete,
		});
		this.#tail = completion;
		this.#process();
		return completion;
	}

	#process(): void {
		if (this.#processing) {
			return;
		}
		this.#processing = true;
		void this.#processPending();
	}

	async #processPending(): Promise<void> {
		try {
			while (this.#pending.length) {
				const entry = this.#pending.shift()!;
				try {
					if (entry.kind === 'task') {
						await this.#runTask(entry.epoch, entry.run);
					} else {
						const epoch = this.invalidate();
						try {
							await entry.run(epoch);
						} catch (error) {
							this.#onRecoveryError(error);
						}
					}
				} finally {
					entry.complete();
				}
			}
		} finally {
			this.#processing = false;
			if (this.#pending.length) {
				this.#process();
			}
		}
	}

	async #runTask(epoch: number, task: () => Promise<void>): Promise<void> {
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
	}
}
