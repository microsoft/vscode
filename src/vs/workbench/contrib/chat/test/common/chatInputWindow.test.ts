/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getCenteredChatInputWindowBounds } from '../../common/chatInputWindow.js';

suite('ChatInputWindow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('centers the initial bounds in the invoking window', () => {
		assert.deepStrictEqual(
			getCenteredChatInputWindowBounds({ x: 1200, y: 200, width: 1001, height: 801 }, 421, 111),
			{ x: 1490, y: 545, width: 421, height: 111 },
		);
	});
});
