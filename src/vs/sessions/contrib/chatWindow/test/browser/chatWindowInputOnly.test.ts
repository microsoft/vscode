/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { clampChatWindowOnResize, decideChatWindowInputOnly, shouldDecideChatWindowInputOnly } from '../../browser/chatWindowInputOnly.js';

suite('decideChatWindowInputOnly', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const base = { collapsedHeight: 100, conversationMinHeight: 120, dragging: false };

	test('snaps to the input or to the conversation, never resting between', () => {
		assert.deepStrictEqual(
			[99, 100, 101, 159, 160, 161, 219, 220, 300].map(groupHeight => decideChatWindowInputOnly({ ...base, groupHeight })),
			[
				{ inputOnly: true, settleHeight: 100 },
				{ inputOnly: true, settleHeight: undefined },
				{ inputOnly: true, settleHeight: 100 },
				{ inputOnly: true, settleHeight: 100 },
				{ inputOnly: false, settleHeight: 220 },
				{ inputOnly: false, settleHeight: 220 },
				{ inputOnly: false, settleHeight: 220 },
				{ inputOnly: false, settleHeight: undefined },
				{ inputOnly: false, settleHeight: undefined },
			]
		);
	});

	test('does not settle while dragging', () => {
		assert.deepStrictEqual(
			[130, 180].map(groupHeight => decideChatWindowInputOnly({ ...base, groupHeight, dragging: true })),
			[{ inputOnly: true, settleHeight: undefined }, { inputOnly: false, settleHeight: undefined }]
		);
	});

	suite('clampChatWindowOnResize', () => {

		const resized = { collapsedHeight: 100, conversationMinHeight: 120 };

		test('a conversation shrunk by the window is clamped to its least height, never to the input', () => {
			assert.deepStrictEqual(
				[60, 100, 130, 219, 220, 400].map(groupHeight => clampChatWindowOnResize({ ...resized, groupHeight, inputOnly: false })),
				[220, 220, 220, 220, undefined, undefined]
			);
		});

		test('the input alone stays at its height', () => {
			assert.deepStrictEqual(
				[100, 140].map(groupHeight => clampChatWindowOnResize({ ...resized, groupHeight, inputOnly: true })),
				[undefined, 100]
			);
		});

		test('asks for the least height however short the window, for its neighbours to give way', () => {
			assert.strictEqual(clampChatWindowOnResize({ ...resized, groupHeight: 30, inputOnly: false }), 220);
		});
	});
});

suite('shouldDecideChatWindowInputOnly', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('only a press on the sash decides after a window resize', () => {
		assert.deepStrictEqual(
			[
				{ afterWindowResize: false, pointerDown: false },
				{ afterWindowResize: false, pointerDown: true },
				{ afterWindowResize: true, pointerDown: false },
				{ afterWindowResize: true, pointerDown: true },
			].map(shouldDecideChatWindowInputOnly),
			[true, true, false, true]
		);
	});
});
