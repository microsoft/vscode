/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getSessionsChatSideChatAccessibilityContent } from '../../browser/sessionsChatAccessibilityHelp.js';

suite('SessionsChatAccessibilityHelp', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('describes the active side chat presentation', () => {
		const transient = getSessionsChatSideChatAccessibilityContent(true);
		const fullChat = getSessionsChatSideChatAccessibilityContent(false);

		assert.deepStrictEqual({
			transientMentionsCard: transient.some(paragraph => paragraph.includes('answer appears in a card')),
			transientSideChat: transient.some(paragraph => paragraph.includes('after they are opened as full chats')),
			fullChatMentionsCard: fullChat.some(paragraph => paragraph.includes('answer appears in a card')),
			fullChatSideChat: fullChat.some(paragraph => paragraph === 'Side chats appear as first-level chats.'),
		}, {
			transientMentionsCard: true,
			transientSideChat: true,
			fullChatMentionsCard: false,
			fullChatSideChat: true,
		});
	});
});
