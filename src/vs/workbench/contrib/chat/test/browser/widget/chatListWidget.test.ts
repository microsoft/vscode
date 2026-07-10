/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { UserToggleResizeState } from '../../../browser/widget/chatListWidget.js';

suite('ChatListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps user toggle suppression active until resizing settles', () => {
		const state = new UserToggleResizeState(2);
		const states = [state.isActive];

		state.start();
		states.push(state.isActive);
		state.advanceFrame();
		states.push(state.isActive);
		state.markResized();
		state.advanceFrame();
		states.push(state.isActive);
		state.advanceFrame();
		states.push(state.isActive);

		assert.deepStrictEqual(states, [false, true, true, true, false]);
	});
});
