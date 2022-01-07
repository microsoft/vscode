/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject, CancelableAsyncIterableObject, createCancelableAsyncIterable, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

export interface IHoverComputer<T> {

	/**
	 * This is called after half the hover time
	 */
	computeAsync?: (token: CancellationToken) => AsyncIterableObject<T>;

	/**
	 * This is called after all the hover time
	 */
	computeSync?: () => T[];

	/**
	 * This is called whenever one of the compute* methods returns a truey value
	 */
	onResult: (result: T[], isFromSynchronousComputation: boolean) => void;

	/**
	 * This is what will be sent as progress/complete to the computation promise
	 */
	getResult: () => T[];

	getResultWithLoadingMessage: () => T[];

}

const enum ComputeHoverOperationState {
	IDLE = 0,
	FIRST_WAIT = 1,
	SECOND_WAIT = 2,
	WAITING_FOR_ASYNC_COMPUTATION = 3,
	WAITING_FOR_ASYNC_COMPUTATION_SHOWING_LOADING = 4,
}

export const enum HoverStartMode {
	Delayed = 0,
	Immediate = 1
}

export class HoverResult<T> {
	constructor(
		public readonly value: T[],
		public readonly isComplete: boolean,
		public readonly hasLoadingMessage: boolean,
	) { }
}

/**
 * Computing the hover is very fine tuned.
 *
 * Suppose the hover delay is 300ms (the default). Then, when resting the mouse at an anchor:
 * - at 150ms, the async computation is triggered (i.e. semantic hover)
 *   - if async results already come in, they are not rendered yet.
 * - at 300ms, the sync computation is triggered (i.e. decorations, markers)
 *   - if there are sync or async results, they are rendered.
 * - at 900ms, if the async computation hasn't finished, a "Loading..." result is added.
 */
export class HoverOperation<T> extends Disposable {

	private readonly _onResult = this._register(new Emitter<HoverResult<T>>());
	public readonly onResult = this._onResult.event;

	private readonly _firstWaitScheduler = this._register(new RunOnceScheduler(() => this._triggerAsyncComputation(), 0));
	private readonly _secondWaitScheduler = this._register(new RunOnceScheduler(() => this._triggerSyncComputation(), 0));
	private readonly _loadingMessageScheduler = this._register(new RunOnceScheduler(() => this._showLoadingMessage(), 0));

	private _state = ComputeHoverOperationState.IDLE;
	private _asyncIterable: CancelableAsyncIterableObject<T> | null = null;
	private _asyncIterableDone: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _computer: IHoverComputer<T>
	) {
		super();
	}

	public override dispose(): void {
		if (this._asyncIterable) {
			this._asyncIterable.cancel();
			this._asyncIterable = null;
		}
		super.dispose();
	}

	private get _hoverTime(): number {
		return this._editor.getOption(EditorOption.hover).delay;
	}

	private _firstWaitTime(): number {
		return this._hoverTime / 2;
	}

	private _secondWaitTime(): number {
		return this._hoverTime / 2;
	}

	private _loadingMessageTime(): number {
		return 3 * this._hoverTime;
	}

	private _triggerAsyncComputation(): void {
		this._state = ComputeHoverOperationState.SECOND_WAIT;
		this._secondWaitScheduler.schedule(this._secondWaitTime());

		if (this._computer.computeAsync) {
			this._asyncIterableDone = false;
			this._asyncIterable = createCancelableAsyncIterable(token => this._computer.computeAsync!(token));

			(async () => {
				try {
					for await (const item of this._asyncIterable!) {
						if (item) {
							this._computer.onResult([item], false);
							this._onProgress();
						}
					}
					this._asyncIterableDone = true;
					this._withAsyncResult();
				} catch (e) {
					onUnexpectedError(e);
				}
			})();

		} else {
			this._asyncIterableDone = true;
		}
	}

	private _triggerSyncComputation(): void {
		if (this._computer.computeSync) {
			this._computer.onResult(this._computer.computeSync(), true);
		}

		if (this._asyncIterableDone) {
			this._state = ComputeHoverOperationState.IDLE;
			this._onComplete();
		} else {
			this._state = ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION;
			this._onProgress();
		}
	}

	private _showLoadingMessage(): void {
		if (this._state === ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION) {
			this._state = ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION_SHOWING_LOADING;
			this._onProgress();
		}
	}

	private _withAsyncResult(): void {
		if (this._state === ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION || this._state === ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION_SHOWING_LOADING) {
			this._state = ComputeHoverOperationState.IDLE;
			this._onComplete();
		}
	}

	private _onComplete(): void {
		this._onResult.fire(new HoverResult(this._computer.getResult(), true, false));
	}

	private _onProgress(): void {
		if (this._state === ComputeHoverOperationState.WAITING_FOR_ASYNC_COMPUTATION_SHOWING_LOADING) {
			this._onResult.fire(new HoverResult(this._computer.getResultWithLoadingMessage(), false, true));
		} else {
			this._onResult.fire(new HoverResult(this._computer.getResult(), false, false));
		}
	}

	public start(mode: HoverStartMode): void {
		if (mode === HoverStartMode.Delayed) {
			if (this._state === ComputeHoverOperationState.IDLE) {
				this._state = ComputeHoverOperationState.FIRST_WAIT;
				this._firstWaitScheduler.schedule(this._firstWaitTime());
				this._loadingMessageScheduler.schedule(this._loadingMessageTime());
			}
		} else {
			switch (this._state) {
				case ComputeHoverOperationState.IDLE:
					this._triggerAsyncComputation();
					this._secondWaitScheduler.cancel();
					this._triggerSyncComputation();
					break;
				case ComputeHoverOperationState.SECOND_WAIT:
					this._secondWaitScheduler.cancel();
					this._triggerSyncComputation();
					break;
			}
		}
	}

	public cancel(): void {
		this._firstWaitScheduler.cancel();
		this._secondWaitScheduler.cancel();
		this._loadingMessageScheduler.cancel();
		if (this._asyncIterable) {
			this._asyncIterable.cancel();
			this._asyncIterable = null;
		}
		this._state = ComputeHoverOperationState.IDLE;
	}

}
