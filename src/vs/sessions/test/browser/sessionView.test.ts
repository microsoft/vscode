/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SessionView } from '../../browser/parts/sessionView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

suite('Sessions - Session View', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards effective visibility (part and grid leaf) to the hosted chat view', () => {
		const forwarded: boolean[] = [];
		const view = {
			_isPartVisible: true,
			_isLeafVisible: true,
			_lastLayout: undefined,
			_currentView: { value: { setVisible: (visible: boolean) => forwarded.push(visible) } },
		} as unknown as SessionView;

		// A sibling session is maximized, hiding this leaf.
		SessionView.prototype.setVisible.call(view, false);
		// The whole sessions part is hidden while the leaf is still hidden.
		SessionView.prototype.setPartVisible.call(view, false);
		// Leaving the maximized state must not reveal the chat while the part is hidden.
		SessionView.prototype.setVisible.call(view, true);
		// Showing the part again reveals the chat.
		SessionView.prototype.setPartVisible.call(view, true);

		assert.deepStrictEqual(forwarded, [false, true]);
	});
});
