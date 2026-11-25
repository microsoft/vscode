/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { decideStackedChatInputOnlyWhileDragging, STACKED_CHAT_DRAG_SHOW_CONVERSATION, STACKED_CHAT_DRAG_SHOW_INPUT } from '../../common/chatWindowInputOnly.js';

suite('decideStackedChatInputOnlyWhileDragging', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('while dragged, the conversation shows as soon as the group is dragged up past its input and hides as soon as it is dragged back to it, with a margin between the two so that it does not flicker', () => {
		const collapsedHeight = 100;
		// The heights a drag passes, up from the input and back down, and what shows at each.
		const path = [100, 104, 110, 112, 113, 300, 113, 110, 105, 104, 100];
		let inputOnly = true;
		const shown = path.map(groupHeight => {
			inputOnly = decideStackedChatInputOnlyWhileDragging({ groupHeight, collapsedHeight, inputOnly });
			return `${groupHeight}: ${inputOnly ? 'input' : 'conversation'}`;
		});
		assert.deepStrictEqual({ margins: [STACKED_CHAT_DRAG_SHOW_INPUT, STACKED_CHAT_DRAG_SHOW_CONVERSATION], shown }, {
			margins: [4, 12],
			shown: ['100: input', '104: input', '110: input', '112: input', '113: conversation', '300: conversation', '113: conversation', '110: conversation', '105: conversation', '104: input', '100: input'],
		});
	});
});
