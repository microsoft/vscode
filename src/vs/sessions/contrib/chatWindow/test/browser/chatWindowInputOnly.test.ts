/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { decideChatWindowInputOnly } from '../../browser/chatWindowInputOnly.js';

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
});
