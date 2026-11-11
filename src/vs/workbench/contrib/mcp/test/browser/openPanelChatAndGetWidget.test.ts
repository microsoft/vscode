/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { openPanelChatAndGetWidget } from '../../browser/openPanelChatAndGetWidget.js';

suite('openPanelChatAndGetWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the chat widget it shows, not the first chat widget, such as an older tab of the chat part', async () => {
		const older = upcastPartial<IChatWidget>({});
		const shown = upcastPartial<IChatWidget>({});
		const chatWidgetService = upcastPartial<IChatWidgetService>({
			revealChatView: async () => shown,
			getWidgetsByLocations: () => [older, shown],
		});

		assert.strictEqual(await openPanelChatAndGetWidget(chatWidgetService), shown);
	});
});
