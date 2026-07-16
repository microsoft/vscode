/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getAnchoredScrollTop, UserToggleResizeState } from '../../../browser/widget/chatListWidget.js';

suite('ChatListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps user toggle tracking active until resizing settles', () => {
		const state = new UserToggleResizeState(2);
		const states = [state.isActive];

		state.start();
		states.push(state.isActive);
		state.advanceFrame();
		states.push(state.isActive);
		state.startTransition();
		state.advanceFrame();
		state.advanceFrame();
		states.push(state.isActive);
		state.markResized();
		state.advanceFrame();
		states.push(state.isActive);
		state.endTransition();
		state.advanceFrame();
		states.push(state.isActive);
		state.advanceFrame();
		states.push(state.isActive);

		assert.deepStrictEqual(states, [false, true, true, true, true, true, false]);
	});

	test('adjusts scroll position to keep the toggled title anchored', () => {
		assert.deepStrictEqual({
			titleMovedUp: getAnchoredScrollTop(300, 180, 220),
			titleMovedDown: getAnchoredScrollTop(300, 260, 220),
			titleUnchanged: getAnchoredScrollTop(300, 220, 220),
		}, {
			titleMovedUp: 260,
			titleMovedDown: 340,
			titleUnchanged: 300,
		});
	});
});
