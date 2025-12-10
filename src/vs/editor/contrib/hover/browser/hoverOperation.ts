/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableProducer, CancelableAsyncIterableProducer, createCancelableAsyncIterableProducer, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';

export interface IHoverComputer<TArgs, TResult> {
	/**
	 * This is called after half the hover time
	 */
	computeAsync?: (args: TArgs, token: CancellationToken) => AsyncIterableProducer<TResult>;
	/**
	 * This is called after all the hover time
	 */
	computeSync?: (args: TArgs) => TResult[];
}

const enum HoverOperationState {
	Idle,
	FirstWait,
	SecondWait,
	WaitingForAsync = 3,
	WaitingForAsyncShowingLoading = 4,
}

export const enum HoverStartMode {
	Delayed = 0,
	Immediate = 1
}

export const enum HoverStartSource {
	Mouse = 0,
	Click = 1,
	Keyboard = 2
}

export class HoverResult<TArgs, TResult> {
	constructor(
		public readonly value: TResult[],
		public readonly isComplete: boolean,
		public readonly hasLoadingMessage: boolean,
		public readonly options: TArgs
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
export class HoverOperation<TArgs, TResult> extends Disposable {

	private readonly _onResult = this._register(new Emitter<HoverResult<TArgs, TResult>>());
	public readonly onResult = this._onResult.event;

	private readonly _asyncComputationScheduler = this._register(new Debouncer((options: TArgs) => this._triggerAsyncComputation(options), 0));
	private readonly _syncComputationScheduler = this._register(new Debouncer((options: TArgs) => this._triggerSyncComputation(options), 0));
	private readonly _loadingMessageScheduler = this._register(new Debouncer((options: TArgs) => this._triggerLoadingMessage(options), 0));

	private _state = HoverOperationState.Idle;
	private _asyncIterable: CancelableAsyncIterableProducer<TResult> | null = null;
	private _asyncIterableDone: boolean = false;
	private _result: TResult[] = [];
	private _options: TArgs | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _computer: IHoverComputer<TArgs, TResult>
	) {
		super();
	}

	public override dispose(): void {
		if (this._asyncIterable) {
			this._asyncIterable.cancel();
			this._asyncIterable = null;
		}
		this._options = undefined;
		super.dispose();
	}

	private get _hoverTime(): number {
		return this._editor.getOption(EditorOption.hover).delay;
	}

	private get _firstWaitTime(): number {
		return this._hoverTime / 2;
	}

	private get _secondWaitTime(): number {
		return this._hoverTime - this._firstWaitTime;
	}

	private get _loadingMessageTime(): number {
		return 3 * this._hoverTime;
	}

	private _setState(state: HoverOperationState, options: TArgs): void {
		this._options = options;
		this._state = state;
		this._fireResult(options);
	}

	private _triggerAsyncComputation(options: TArgs): void {
		this._setState(HoverOperationState.SecondWait, options);
		this._syncComputationScheduler.schedule(options, this._secondWaitTime);

		if (this._computer.computeAsync) {
			this._asyncIterableDone = false;
			this._asyncIterable = createCancelableAsyncIterableProducer(token => this._computer.computeAsync!(options, token));

			(async () => {
				try {
					for await (const item of this._asyncIterable!) {
						if (item) {
							this._result.push(item);
							this._fireResult(options);
						}
					}
					this._asyncIterableDone = true;

					if (this._state === HoverOperationState.WaitingForAsync || this._state === HoverOperationState.WaitingForAsyncShowingLoading) {
						this._setState(HoverOperationState.Idle, options);
					}

				} catch (e) {
					onUnexpectedError(e);
				}
			})();

		} else {
			this._asyncIterableDone = true;
		}
	}

	private _triggerSyncComputation(options: TArgs): void {
		if (this._computer.computeSync) {
			this._result = this._result.concat(this._computer.computeSync(options));
		}
		this._setState(this._asyncIterableDone ? HoverOperationState.Idle : HoverOperationState.WaitingForAsync, options);
	}

	private _triggerLoadingMessage(options: TArgs): void {
		if (this._state === HoverOperationState.WaitingForAsync) {
			this._setState(HoverOperationState.WaitingForAsyncShowingLoading, options);
		}
	}

	private _fireResult(options: TArgs): void {
		if (this._state === HoverOperationState.FirstWait || this._state === HoverOperationState.SecondWait) {
			// Do not send out results before the hover time
			return;
		}
		const isComplete = (this._state === HoverOperationState.Idle);
		const hasLoadingMessage = (this._state === HoverOperationState.WaitingForAsyncShowingLoading);
		this._onResult.fire(new HoverResult(this._result.slice(0), isComplete, hasLoadingMessage, options));
	}

	public start(mode: HoverStartMode, options: TArgs): void {
		if (mode === HoverStartMode.Delayed) {
			if (this._state === HoverOperationState.Idle) {
				this._setState(HoverOperationState.FirstWait, options);
				this._asyncComputationScheduler.schedule(options, this._firstWaitTime);
				this._loadingMessageScheduler.schedule(options, this._loadingMessageTime);
			}
		} else {
			switch (this._state) {
				case HoverOperationState.Idle:
					this._triggerAsyncComputation(options);
					this._syncComputationScheduler.cancel();
					this._triggerSyncComputation(options);
					break;
				case HoverOperationState.SecondWait:
					this._syncComputationScheduler.cancel();
					this._triggerSyncComputation(options);
					break;
			}
		}
	}

	public cancel(): void {
		this._asyncComputationScheduler.cancel();
		this._syncComputationScheduler.cancel();
		this._loadingMessageScheduler.cancel();
		if (this._asyncIterable) {
			this._asyncIterable.cancel();
			this._asyncIterable = null;
		}
		this._result = [];
		this._options = undefined;
		this._state = HoverOperationState.Idle;
	}

	public get options(): TArgs | undefined {
		return this._options;
	}
}

class Debouncer<TArgs> extends Disposable {

	private readonly _scheduler: RunOnceScheduler;

	private _options: TArgs | undefined;

	constructor(runner: (options: TArgs) => void, debounceTimeMs: number) {
		super();
		this._scheduler = this._register(new RunOnceScheduler(() => runner(this._options!), debounceTimeMs));
	}

	schedule(options: TArgs, debounceTimeMs: number): void {
		this._options = options;
		this._scheduler.schedule(debounceTimeMs);
	}

	cancel(): void {
		this._scheduler.cancel();
	}
}
