/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { clampStackedChatOnResize, decideStackedChatInputOnly, shouldRestoreStackedChatConversation, stackedChatConversationFits, stackedChatForcedByWindow, stackedChatPersistedInputOnly } from '../../browser/stackedChatInputOnly.js';

suite('decideStackedChatInputOnly', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const base = { collapsedHeight: 100, conversationMinHeight: 120, dragging: false };

	test('snaps to the input or to the conversation, never resting between', () => {
		assert.deepStrictEqual(
			[99, 100, 101, 159, 160, 161, 219, 220, 300].map(groupHeight => decideStackedChatInputOnly({ ...base, groupHeight })),
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
			[130, 180].map(groupHeight => decideStackedChatInputOnly({ ...base, groupHeight, dragging: true })),
			[{ inputOnly: true, settleHeight: undefined }, { inputOnly: false, settleHeight: undefined }]
		);
	});

	suite('clampStackedChatOnResize', () => {

		const resized = { collapsedHeight: 100, conversationMinHeight: 120 };

		test('a conversation shrunk by the window is clamped to its least height, never to the input', () => {
			assert.deepStrictEqual(
				[60, 100, 130, 219, 220, 400].map(groupHeight => clampStackedChatOnResize({ ...resized, groupHeight, inputOnly: false })),
				[220, 220, 220, 220, undefined, undefined]
			);
		});

		test('the input alone stays at its height', () => {
			assert.deepStrictEqual(
				[100, 140].map(groupHeight => clampStackedChatOnResize({ ...resized, groupHeight, inputOnly: true })),
				[undefined, 100]
			);
		});

		test('asks for the least height however short the window, for its neighbours to give way', () => {
			assert.strictEqual(clampStackedChatOnResize({ ...resized, groupHeight: 30, inputOnly: false }), 220);
		});
	});
});

suite('stacked chat forced to its input by the window', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const restore = { collapsedHeight: 100, conversationMinHeight: 120, groupHeight: 100, editorMinimumHeight: 70 };

	test('forced to the input, it returns to the conversation once the editor can give the height', () => {
		assert.deepStrictEqual(
			[70, 150, 189, 190, 400].map(editorHeight => shouldRestoreStackedChatConversation({ ...restore, forcedByWindow: true, editorHeight })),
			[false, false, false, true, true]
		);
	});

	test('the conversation does not fit when the editor is at its minimum', () => {
		assert.deepStrictEqual(
			[{ groupHeight: 100, editorHeight: 70 }, { groupHeight: 100, editorHeight: 200 }, { groupHeight: 250, editorHeight: 70 }].map(c => stackedChatConversationFits({ ...restore, ...c })),
			[false, true, true]
		);
	});

	test('chosen by the user, it stays at the input however the window grows', () => {
		assert.strictEqual(shouldRestoreStackedChatConversation({ ...restore, forcedByWindow: false, editorHeight: 1000 }), false);
	});

	test('the user dragging or toggling clears it', () => {
		assert.deepStrictEqual(
			[
				{ wasForced: false, wasInputOnly: false, inputOnly: true, byUser: false },
				{ wasForced: true, wasInputOnly: true, inputOnly: true, byUser: false },
				{ wasForced: true, wasInputOnly: true, inputOnly: true, byUser: true },
				{ wasForced: false, wasInputOnly: false, inputOnly: true, byUser: true },
				{ wasForced: false, wasInputOnly: true, inputOnly: true, byUser: false },
				{ wasForced: true, wasInputOnly: true, inputOnly: false, byUser: false },
			].map(stackedChatForcedByWindow),
			[true, true, false, false, false, false]
		);
	});
});

suite('stackedChatPersistedInputOnly', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('only what the user chose is remembered', () => {
		assert.deepStrictEqual(
			[
				{ inputOnly: true, forcedByWindow: true, lastUserChoice: false },
				{ inputOnly: false, forcedByWindow: true, lastUserChoice: true },
				{ inputOnly: true, forcedByWindow: false, lastUserChoice: false },
				{ inputOnly: false, forcedByWindow: false, lastUserChoice: true },
			].map(stackedChatPersistedInputOnly),
			[false, true, true, false]
		);
	});
});
