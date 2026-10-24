/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createChatWindowSessionViewHost } from '../../browser/chatWindowEditor.js';

suite('Chat window - focusing its session', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('focuses the window, and the chat only while it shows, so that focusing the session of a window showing only its editor keeps it so', () => {
		const focused: string[] = [];
		let chatVisible = true;
		const host = createChatWindowSessionViewHost(() => focused.push('window'), () => focused.push('chat'), () => chatVisible);

		host.focus();
		chatVisible = false;
		host.focus();

		assert.deepStrictEqual(focused, ['window', 'chat', 'window']);
	});
});
