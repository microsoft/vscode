/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITask<T> {
	(): T;
}

export class Delayer<T> {

	public defaultDelay: number;
	private _timeout: any; // Timer
	private _cancelTimeout: Promise<T | null> | null;
	private _onSuccess: ((value: T | PromiseLike<T> | undefined) => void) | null;
	private _task: ITask<T> | null;

	constructor(defaultDelay: number) {
		this.defaultDelay = defaultDelay;
		this._timeout = null;
		this._cancelTimeout = null;
		this._onSuccess = null;
		this._task = null;
	}

	dispose() {
		this._doCancelTimeout();
	}

	public trigger(task: ITask<T>, delay: number = this.defaultDelay): Promise<T | null> {
		this._task = task;
		if (delay >= 0) {
			this._doCancelTimeout();
		}

		if (!this._cancelTimeout) {
			this._cancelTimeout = new Promise<T | undefined>((resolve) => {
				this._onSuccess = resolve;
			}).then(() => {
				this._cancelTimeout = null;
				this._onSuccess = null;
				const result = this._task?.() ?? null;
				this._task = null;
				return result;
			});
		}

		if (delay >= 0 || this._timeout === null) {
			this._timeout = setTimeout(() => {
				this._timeout = null;
				this._onSuccess?.(undefined);
			}, delay >= 0 ? delay : this.defaultDelay);
		}

		return this._cancelTimeout;
	}

	private _doCancelTimeout(): void {
		if (this._timeout !== null) {
			clearTimeout(this._timeout);
			this._timeout = null;
		}
	}
}
