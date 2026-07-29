/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeScrollDownState, createUserToggleScrollAnchor, UserToggleResizeState } from '../../../browser/widget/chatListWidget.js';

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

	test('adjusts scroll position to keep the toggled title anchored at any scroll position', () => {
		let scrollTop = 150;
		let targetTop = 220;
		const restoreScrollAnchor = createUserToggleScrollAnchor(
			() => scrollTop,
			value => scrollTop = value,
			() => targetTop,
		);

		targetTop = 180;
		restoreScrollAnchor();

		assert.strictEqual(scrollTop, 110);
	});

	// Regression test for https://github.com/microsoft/vscode/issues/326952: the scroll-down
	// button must reflect the actual scroll position (shown whenever not at the bottom) even while
	// the scroll lock is engaged during an agent turn, while the `chat-list-at-bottom` padding
	// state stays coupled to the scroll lock.
	test('scroll-down button is decoupled from the at-bottom padding state', () => {
		assert.deepStrictEqual([
			computeScrollDownState(/*isScrolledToBottom*/ true, /*scrollLock*/ true),
			computeScrollDownState(/*isScrolledToBottom*/ true, /*scrollLock*/ false),
			computeScrollDownState(/*isScrolledToBottom*/ false, /*scrollLock*/ true),
			computeScrollDownState(/*isScrolledToBottom*/ false, /*scrollLock*/ false),
		], [
			{ showButton: false, atBottom: true },
			{ showButton: false, atBottom: true },
			{ showButton: true, atBottom: true },
			{ showButton: true, atBottom: false },
		]);
	});
});
