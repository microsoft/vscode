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
			transientParagraphs: transient.length,
			transientMentionsCard: transient.some(paragraph => paragraph.includes('answer appears in a card')),
			transientMentionsRecovery: transient.some(paragraph => paragraph.includes('remains recoverable')),
			fullChatParagraphs: fullChat.length,
		}, {
			transientParagraphs: 1,
			transientMentionsCard: true,
			transientMentionsRecovery: true,
			fullChatParagraphs: 0,
		});
	});
});
