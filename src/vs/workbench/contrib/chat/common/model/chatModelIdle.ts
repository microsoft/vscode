/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { IChatModel } from './chatModel.js';

/** State needed to decide whether a chat model is idle. */
export interface IChatModelIdleState {
	readonly requestInProgress: boolean;
	readonly requestNeedsInput: boolean;
	readonly pendingRequestCount: number;
	readonly lastResponseIsCanceled: boolean;
	readonly lastResponseHasError: boolean;
}

/** Returns whether a session has no running, blocked, or runnable queued work. */
export function computeChatModelIsIdle(state: IChatModelIdleState): boolean {
	if (state.requestInProgress || state.requestNeedsInput) {
		return false;
	}
	if (state.pendingRequestCount === 0) {
		return true;
	}

	return state.lastResponseIsCanceled || state.lastResponseHasError;
}

/** Returns the current idle state of a chat model. */
export function isChatModelIdle(model: IChatModel): boolean {
	const response = model.lastRequest?.response;
	return computeChatModelIsIdle({
		requestInProgress: model.requestInProgress.get(),
		requestNeedsInput: !!model.requestNeedsInput.get(),
		pendingRequestCount: model.getPendingRequests().length,
		lastResponseIsCanceled: !!response?.isCanceled,
		lastResponseHasError: !!response?.result?.errorDetails,
	});
}

/** Observes whether a chat model has no running, blocked, or runnable queued work. */
export function observeChatModelIsIdle(model: IChatModel): IObservable<boolean> {
	const pendingRequestCount = observableFromEvent(model.onDidChangePendingRequests, () => model.getPendingRequests().length);
	return derived(reader => {
		const response = model.lastRequestObs.read(reader)?.response;
		return computeChatModelIsIdle({
			requestInProgress: model.requestInProgress.read(reader),
			requestNeedsInput: !!model.requestNeedsInput.read(reader),
			pendingRequestCount: pendingRequestCount.read(reader),
			lastResponseIsCanceled: !!response?.isCanceled,
			lastResponseHasError: !!response?.result?.errorDetails,
		});
	});
}
