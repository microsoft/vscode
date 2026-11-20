/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';

const CHAT_WIDGET_LOAD_TIMEOUT_MS = 10_000;

/** Which widget {@link whenChatWidgetForSession} resolves to, and how long it waits for one. */
export interface IChatWidgetForSessionOptions {
	/**
	 * Only a widget that can host input requests, such as the full chat of a session rather than its row in the Inbox,
	 * which shows the session too but must not take what is sent to it.
	 */
	readonly supportsInputRequests?: boolean;
	readonly timeoutMs?: number;
}

/**
 * Resolves the chat widget once it has loaded the requested session model.
 */
export async function whenChatWidgetForSession(chatWidgetService: IChatWidgetService, sessionResource: URI, options?: IChatWidgetForSessionOptions): Promise<IChatWidget | undefined> {
	const find = () => {
		const widget = chatWidgetService.getWidgetBySessionResource(sessionResource, { preferInputRequests: options?.supportsInputRequests });
		return options?.supportsInputRequests && widget?.supportsInputRequests === false ? undefined : widget;
	};

	const existing = find();
	if (existing) {
		return existing;
	}

	const store = new DisposableStore();
	try {
		const loaded = new Promise<IChatWidget>(resolve => {
			const check = () => {
				const widget = find();
				if (widget) {
					resolve(widget);
				}
			};

			const observe = (candidate: IChatWidget) => store.add(candidate.onDidChangeViewModel(check));

			chatWidgetService.getAllWidgets().forEach(observe);
			store.add(chatWidgetService.onDidAddWidget(added => {
				observe(added);
				check();
			}));

			check();
		});

		return await raceTimeout(loaded, options?.timeoutMs ?? CHAT_WIDGET_LOAD_TIMEOUT_MS);
	} finally {
		store.dispose();
	}
}
