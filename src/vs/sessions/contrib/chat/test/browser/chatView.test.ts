/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatView } from '../../browser/chatView.js';

interface IChatViewVisibilityHarness {
	readonly _widget: { setVisible(visible: boolean): void };
}

suite('Sessions - Chat View', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const setVisible = Reflect.get(ChatView.prototype, 'setVisible') as (this: IChatViewVisibilityHarness, visible: boolean) => void;

	test('forwards host visibility to the chat widget', () => {
		const forwarded: boolean[] = [];
		const harness: IChatViewVisibilityHarness = {
			_widget: { setVisible: visible => forwarded.push(visible) },
		};

		setVisible.call(harness, false);
		setVisible.call(harness, true);

		assert.deepStrictEqual(forwarded, [false, true]);
	});
});
