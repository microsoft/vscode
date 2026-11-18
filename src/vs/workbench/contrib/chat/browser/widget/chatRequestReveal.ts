/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { isRequestVM } from '../../common/model/chatViewModel.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';

/**
 * How long a link waits for the chat it opened to show the linked request. A remote host's chat opens before its
 * history arrives, so the request can appear well after the chat does.
 */
export const CHAT_REQUEST_REVEAL_TIMEOUT_MS = 30_000;

/** How many frames a request that is in the chat may take to render before revealing it waits for the chat to change. */
const MAX_REVEAL_FRAMES = 10;

export interface IRevealChatRequestOptions {
	/** Moves keyboard focus to the request once it is revealed. */
	readonly focus: boolean;
	readonly token: CancellationToken;
	readonly timeoutMs?: number;
}

/**
 * Scrolls the request `requestId` of the chat `sessionResource` to the top of the widget that shows that chat, waiting
 * for a widget to show the chat and for its history to include the request. Returns whether it was revealed; `false`
 * once the token is cancelled or the timeout passes first.
 */
export function revealChatRequest(chatWidgetService: IChatWidgetService, sessionResource: URI, requestId: string, options: IRevealChatRequestOptions): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		// Settles synchronously, so cancelling through the token releases every listener before it returns.
		const store = new DisposableStore();
		const settle = (revealed: boolean) => {
			store.dispose();
			resolve(revealed);
		};
		if (options.token.isCancellationRequested) {
			return settle(false);
		}
		store.add(options.token.onCancellationRequested(() => settle(false)));
		store.add(disposableTimeout(() => settle(false), options.timeoutMs ?? CHAT_REQUEST_REVEAL_TIMEOUT_MS));
		const pendingFrame = store.add(new MutableDisposable());
		const widgetListeners = store.add(new DisposableStore());
		const watchedWidgets = new Set<IChatWidget>();
		const watchedViewModel = store.add(new MutableDisposable());

		const tryReveal = () => {
			if (store.isDisposed) {
				return;
			}
			const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
			watchedViewModel.value = widget?.viewModel?.onDidChange(() => tryReveal());
			if (!widget || !findRequest(widget, requestId)) {
				return;
			}
			// The widget renders new rows in its own change listeners, which may run after this one, and measures them
			// over the next frames.
			let attempts = 0;
			const reveal = () => {
				if (store.isDisposed) {
					return;
				}
				if (revealRequestInWidget(widget, requestId, options.focus)) {
					settle(true);
				} else if (++attempts < MAX_REVEAL_FRAMES) {
					pendingFrame.value = scheduleAtNextAnimationFrame(getWindow(widget.domNode), reveal);
				}
			};
			pendingFrame.value = scheduleAtNextAnimationFrame(getWindow(widget.domNode), reveal);
		};
		const watchWidget = (widget: IChatWidget) => {
			if (!watchedWidgets.has(widget)) {
				watchedWidgets.add(widget);
				widgetListeners.add(widget.onDidChangeViewModel(() => tryReveal()));
			}
		};
		chatWidgetService.getAllWidgets().forEach(watchWidget);
		store.add(chatWidgetService.onDidAddWidget(widget => {
			watchWidget(widget);
			tryReveal();
		}));
		tryReveal();
	});
}

function findRequest(widget: IChatWidget, requestId: string) {
	return widget.viewModel?.getItems().find(item => isRequestVM(item) && item.id === requestId);
}

/** Scrolls the request to the top of `widget` and returns whether it is there. */
function revealRequestInWidget(widget: IChatWidget, requestId: string, focus: boolean): boolean {
	const item = findRequest(widget, requestId);
	if (!item) {
		return false;
	}
	widget.restoreViewState({ scrollTop: widget.getViewState().scrollTop, isAtBottom: false, scrollAnchor: { requestId, kind: 'request', offset: 0 } });
	if (widget.getViewState().scrollAnchor?.requestId !== requestId && !widget.getViewState().isAtBottom) {
		return false;
	}
	if (focus) {
		widget.focus(item);
	}
	return true;
}
