/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NewChatView } from '../../browser/chatView.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';

suite('Sessions - Chat View', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards new chat visibility to the aquarium host', () => {
		const forwarded: boolean[] = [];
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_widget: Object.assign(Object.create(NewChatWidget.prototype), {
				setHostVisible: (visible: boolean) => forwarded.push(visible),
			}),
		});

		view.setVisible(false);
		view.setVisible(true);

		assert.deepStrictEqual(forwarded, [false, true]);
	});

	test('does not forward aquarium visibility to the peer chat composer', () => {
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_widget: Object.create(NewChatInSessionWidget.prototype),
		});

		assert.doesNotThrow(() => view.setVisible(false));
	});

	test('forwards input animation to the new-session composer', () => {
		const forwarded: { readonly text: string; readonly durationMs: number; readonly placeholder: string | undefined }[] = [];
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_widget: Object.assign(Object.create(NewChatWidget.prototype), {
				animateInput: (text: string, durationMs: number, placeholder: string | undefined) => forwarded.push({ text, durationMs, placeholder }),
			}),
		});

		view.animateInput('prompt', 2_500, '[task]');

		assert.deepStrictEqual(forwarded, [{ text: 'prompt', durationMs: 2_500, placeholder: '[task]' }]);
	});
});
