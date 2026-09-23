/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import type { URI } from '../../../../base/common/uri.js';
import type { IChatWidgetService } from '../browser/chat.js';

/** Preserves hidden chat state after a session has been handed off to this editor window. */
export class ChatSessionHandoffController {

	private readonly openedSessions = new ResourceSet();
	private readonly pendingOpens = new ResourceMap<Promise<void>>();

	constructor(
		private readonly chatWidgetService: IChatWidgetService,
		private readonly openSession: (sessionResource: URI) => Promise<boolean>,
	) { }

	async open(sessionResource: URI): Promise<void> {
		const existingWidget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (this.openedSessions.has(sessionResource) && existingWidget && !existingWidget.visible) {
			return;
		}

		const pendingOpen = this.pendingOpens.get(sessionResource);
		if (pendingOpen) {
			return pendingOpen;
		}

		const open = this.doOpen(sessionResource);
		this.pendingOpens.set(sessionResource, open);
		try {
			await open;
		} finally {
			this.pendingOpens.delete(sessionResource);
		}
	}

	private async doOpen(sessionResource: URI): Promise<void> {
		if (await this.openSession(sessionResource)) {
			this.openedSessions.add(sessionResource);
		}
	}
}
