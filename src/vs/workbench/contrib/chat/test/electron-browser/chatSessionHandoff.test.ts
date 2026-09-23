/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatSessionHandoffController } from '../../electron-browser/chatSessionHandoff.js';

suite('ChatSessionHandoff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves hidden state after the first handoff in this window', async () => {
		const openedSessions: string[] = [];
		const visibilityBySession = new Map<string, boolean>();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined {
				const visible = visibilityBySession.get(sessionResource.toString());
				if (visible === undefined) {
					return undefined;
				}
				return createChatWidget(visible);
			}
		}();

		const controller = new ChatSessionHandoffController(chatWidgetService, async sessionResource => {
			openedSessions.push(sessionResource.toString());
		});
		const session = URI.parse('test:/session');

		visibilityBySession.set(session.toString(), false);
		await controller.open(session);
		await controller.open(session);
		visibilityBySession.set(session.toString(), true);
		await controller.open(session);
		await controller.open(URI.parse('test:/new'));

		assert.deepStrictEqual(openedSessions, ['test:/session', 'test:/session', 'test:/new']);
	});
});

function createChatWidget(visible: boolean): IChatWidget {
	return new class extends mock<IChatWidget>() {
		override readonly visible = visible;
	}();
}
