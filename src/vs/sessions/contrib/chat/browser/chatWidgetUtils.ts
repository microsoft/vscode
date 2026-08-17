/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';

const CHAT_WIDGET_LOAD_TIMEOUT_MS = 10_000;

/**
 * Resolves the chat widget once it has loaded the requested session model.
 */
export async function whenChatWidgetForSession(chatWidgetService: IChatWidgetService, sessionResource: URI, timeoutMs: number = CHAT_WIDGET_LOAD_TIMEOUT_MS): Promise<IChatWidget | undefined> {
	const existing = chatWidgetService.getWidgetBySessionResource(sessionResource);
	if (existing) {
		return existing;
	}

	const store = new DisposableStore();
	try {
		const loaded = new Promise<IChatWidget>(resolve => {
			const check = () => {
				const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
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

		return await raceTimeout(loaded, timeoutMs);
	} finally {
		store.dispose();
	}
}
