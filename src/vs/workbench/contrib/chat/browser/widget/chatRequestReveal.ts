/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, IntervalTimer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isRequestVM } from '../../common/model/chatViewModel.js';
import type { IChatWidget, IChatWidgetService } from '../chat.js';

/** How long a link waits for its chat to show the linked request: a chat that is not loaded restores its history first. */
export const REVEAL_CHAT_REQUEST_TIMEOUT = 15_000;
const REVEAL_CHAT_REQUEST_POLL_INTERVAL = 100;

/**
 * Focuses the request `requestId` in the widget `getWidget` returns and scrolls it to the top of the transcript, once
 * that widget exists and renders the request. Resolves `false` when that does not happen before
 * {@link REVEAL_CHAT_REQUEST_TIMEOUT} or cancellation, for example because the request was removed from the chat, or
 * when focus moves to another chat first, so a slow chat never takes focus from the one the user went on to.
 */
export function revealChatRequest(chatWidgetService: Pick<IChatWidgetService, 'onDidChangeFocusedWidget'>, getWidget: () => IChatWidget | undefined, requestId: string, token: CancellationToken = CancellationToken.None): Promise<boolean> {
	const tryReveal = (): boolean => {
		const widget = getWidget();
		const request = widget?.viewModel?.getItems().find(item => isRequestVM(item) && item.id === requestId);
		if (!widget || !request) {
			return false;
		}
		// Focusing only succeeds once the transcript renders the request, which can lag its view model.
		widget.focus(request);
		if (widget.getFocus() !== request) {
			return false;
		}
		widget.reveal(request, 0);
		return true;
	};
	if (token.isCancellationRequested) {
		return Promise.resolve(false);
	}
	if (tryReveal()) {
		return Promise.resolve(true);
	}
	return new Promise<boolean>(resolve => {
		const store = new DisposableStore();
		const finish = (revealed: boolean) => {
			store.dispose();
			resolve(revealed);
		};
		store.add(new IntervalTimer()).cancelAndSet(() => {
			if (tryReveal()) {
				finish(true);
			}
		}, REVEAL_CHAT_REQUEST_POLL_INTERVAL);
		store.add(token.onCancellationRequested(() => finish(false)));
		store.add(chatWidgetService.onDidChangeFocusedWidget(focused => {
			// A widget without a chat may be the linked one still loading it.
			if (focused?.viewModel && focused !== getWidget()) {
				finish(false);
			}
		}));
		disposableTimeout(() => finish(false), REVEAL_CHAT_REQUEST_TIMEOUT, store);
	});
}
