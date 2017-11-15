/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';

export interface IHoverComputer<Result> {

	/**
	 * Overwrite the default hover time
	 */
	getHoverTimeMillis?: () => number;

	/**
	 * This is called after half the hover time
	 */
	computeAsync?: () => TPromise<Result>;

	/**
	 * This is called after all the hover time
	 */
	computeSync?: () => Result;

	/**
	 * This is called whenever one of the compute* methods returns a truey value
	 */
	onResult: (result: Result, isFromSynchronousComputation: boolean) => void;

	/**
	 * This is what will be sent as progress/complete to the computation promise
	 */
	getResult: () => Result;

	getResultWithLoadingMessage: () => Result;

}

const enum ComputeHoverOperationState {
	IDLE = 0,
	FIRST_WAIT = 1,
	SECOND_WAIT = 2,
	WAITING_FOR_ASYNC_COMPUTATION = 3
}

export class HoverOperation<Result> {

	static HOVER_TIME = 300;

	private _computer: IHoverComputer<Result>;
	private _state: ComputeHoverOperationState;

	private _firstWaitScheduler: RunOnceScheduler;
	private _secondWaitScheduler: RunOnceScheduler;
	private _loadingMessageScheduler: RunOnceScheduler;
	private _asyncComputationPromise: TPromise<void>;
	private _asyncComputationPromiseDone: boolean;

	private _completeCallback: (r: Result) => void;
	private _errorCallback: (err: any) => void;
	private _progressCallback: (progress: any) => void;

	constructor(computer: IHoverComputer<Result>, success: (r: Result) => void, error: (err: any) => void, progress: (progress: any) => void) {
		this._computer = computer;
		this._state = ComputeHoverOperationState.IDLE;

		this._firstWaitScheduler = new RunOnceScheduler(() => this._triggerAsyncComputation(), this._getHoverTimeMillis() / 2);
		this._secondWaitScheduler = new RunOnceScheduler(() => this._triggerSyncComputation(), this._getHoverTimeMillis() / 2);
		this._loadingMessageScheduler = new RunOnceScheduler(() => this._showLoadingMessage(), 3 * this._getHoverTimeMillis());

		this._asyncComputationPromise = null;
		this._asyncComputationPromiseDone = false;

		this._completeCallback = success;
		this._errorCallback = error;
		this._progressCallback = progress;
	}

	public getComputer(): IHoverComputer<Result> {
		return this._computer;
	}

	private _getHoverTimeMillis(): number {
		if (this._computer.getHoverTimeMillis) {
			return this._computer.getHoverTimeMillis();
		}
		return HoverOperation.HOVER_TIME;
	}

	private _triggerAsyncComputation(): void {
		this._state = ComputeHoverOperationState.SECOND_WAIT;
		this._secondWaitScheduler.schedule();

		if (this._computer.computeAsync) {
			this._asyncComputationPromiseDone = false;
			this._asyncComputationPromise = this._computer.computeAsync().then((asyncResult: Result) => {
				this._asyncComputationPromiseDone = true;
				this._withAsyncResult(asyncResult);
			}, (e) => this._onError(e));
		} else {
			this._asyncComputationPromiseDone = true;
		}
	}

	private _triggerSyncComputation(): void {
		if (this._computer.computeSync) {
			this._computer.onResult(this._computer.computeSync(), true);
		}

		if (this._asyncComputationPromiseDone) {
			this._state = ComputeHoverOperationState.IDLE;
			this._onComplete(this._computer.getResult());
		} else {
			this._state = ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION;
			this._onProgress(this._computer.getResult());
		}
	}

	private _showLoadingMessage(): void {
		if (this._state === ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION) {
			this._onProgress(this._computer.getResultWithLoadingMessage());
		}
	}

	private _withAsyncResult(asyncResult: Result): void {
		if (asyncResult) {
			this._computer.onResult(asyncResult, false);
		}

		if (this._state === ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION) {
			this._state = ComputeHoverOperationState.IDLE;
			this._onComplete(this._computer.getResult());
		}
	}

	private _onComplete(value: Result): void {
		if (this._completeCallback) {
			this._completeCallback(value);
		}
	}

	private _onError(error: any): void {
		if (this._errorCallback) {
			this._errorCallback(error);
		} else {
			onUnexpectedError(error);
		}
	}

	private _onProgress(value: Result): void {
		if (this._progressCallback) {
			this._progressCallback(value);
		}
	}

	public start(): void {
		if (this._state === ComputeHoverOperationState.IDLE) {
			this._state = ComputeHoverOperationState.FIRST_WAIT;
			this._firstWaitScheduler.schedule();
			this._loadingMessageScheduler.schedule();
		}
	}

	public cancel(): void {
		this._loadingMessageScheduler.cancel();
		if (this._state === ComputeHoverOperationState.FIRST_WAIT) {
			this._firstWaitScheduler.cancel();
		}
		if (this._state === ComputeHoverOperationState.SECOND_WAIT) {
			this._secondWaitScheduler.cancel();
			if (this._asyncComputationPromise) {
				this._asyncComputationPromise.cancel();
				this._asyncComputationPromise = null;
			}
		}
		if (this._state === ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION) {
			if (this._asyncComputationPromise) {
				this._asyncComputationPromise.cancel();
				this._asyncComputationPromise = null;
			}
		}
		this._state = ComputeHoverOperationState.IDLE;
	}

}

