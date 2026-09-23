/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceSet } from '../../../../base/common/map.js';
import type { URI } from '../../../../base/common/uri.js';
import type { IChatWidgetService } from '../browser/chat.js';

/** Preserves hidden chat state after a session has been handed off to this editor window. */
export class ChatSessionHandoffController {

	private readonly openedSessions = new ResourceSet();

	constructor(
		private readonly chatWidgetService: IChatWidgetService,
		private readonly openSession: (sessionResource: URI) => Promise<void>,
	) { }

	async open(sessionResource: URI): Promise<void> {
		const existingWidget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (this.openedSessions.has(sessionResource) && existingWidget && !existingWidget.visible) {
			return;
		}

		await this.openSession(sessionResource);
		this.openedSessions.add(sessionResource);
	}
}
