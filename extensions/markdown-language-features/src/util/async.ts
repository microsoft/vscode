/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITask<T> {
	(): T;
}

export class Delayer<T> {

	public defaultDelay: number;
	#timeout: any; // Timer
	#cancelTimeout: Promise<T | null> | null;
	#onSuccess: ((value: T | PromiseLike<T> | undefined) => void) | null;
	#task: ITask<T> | null;

	constructor(defaultDelay: number) {
		this.defaultDelay = defaultDelay;
		this.#timeout = null;
		this.#cancelTimeout = null;
		this.#onSuccess = null;
		this.#task = null;
	}

	dispose() {
		this.#doCancelTimeout();
	}

	public trigger(task: ITask<T>, delay: number = this.defaultDelay): Promise<T | null> {
		this.#task = task;
		if (delay >= 0) {
			this.#doCancelTimeout();
		}

		if (!this.#cancelTimeout) {
			this.#cancelTimeout = new Promise<T | undefined>((resolve) => {
				this.#onSuccess = resolve;
			}).then(() => {
				this.#cancelTimeout = null;
				this.#onSuccess = null;
				const result = this.#task?.() ?? null;
				this.#task = null;
				return result;
			});
		}

		if (delay >= 0 || this.#timeout === null) {
			this.#timeout = setTimeout(() => {
				this.#timeout = null;
				this.#onSuccess?.(undefined);
			}, delay >= 0 ? delay : this.defaultDelay);
		}

		return this.#cancelTimeout;
	}

	#doCancelTimeout(): void {
		if (this.#timeout !== null) {
			clearTimeout(this.#timeout);
			this.#timeout = null;
		}
	}
}
