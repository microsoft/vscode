/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatViewHostDelegate, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { openPanelChatAndGetWidget } from '../../browser/openPanelChatAndGetWidget.js';

suite('openPanelChatAndGetWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createChatWidgetService(delegate: IChatViewHostDelegate | undefined, first: IChatWidget, shown: IChatWidget): IChatWidgetService {
		return upcastPartial<IChatWidgetService>({
			chatViewHostDelegate: delegate,
			revealChatView: async () => shown,
			getWidgetsByLocations: () => [first, shown],
		});
	}

	test('returns the first chat widget after revealing the Chat view, as before, while nothing replaces the Chat view', async () => {
		const first = upcastPartial<IChatWidget>({});
		const shown = upcastPartial<IChatWidget>({});

		assert.strictEqual(await openPanelChatAndGetWidget(createChatWidgetService(undefined, first, shown)), first);
	});

	test('returns the chat widget that what replaces the Chat view shows, not the first chat widget, such as an older tab of the chat part', async () => {
		const older = upcastPartial<IChatWidget>({});
		const shown = upcastPartial<IChatWidget>({});

		assert.strictEqual(await openPanelChatAndGetWidget(createChatWidgetService(upcastPartial<IChatViewHostDelegate>({}), older, shown)), shown);
	});
});
