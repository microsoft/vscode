/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatWindowBlurListener } from '../../../browser/widget/chatWindowBlurListener.js';

suite('ChatWindowBlurListener', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('follows a chat that renders detached into the window that it shows in, and listens to that window only', () => {
		const store = disposables.add(new DisposableStore());
		// The other window of a chat, such as a chat window.
		const frame = mainWindow.document.body.appendChild($('iframe')) as HTMLIFrameElement;
		store.add(toDisposable(() => frame.remove()));
		const otherWindow = frame.contentWindow!;
		const blurs: string[] = [];
		const blur = (name: string, targetWindow: Window) => {
			blurs.push(name);
			targetWindow.dispatchEvent(new FocusEvent('blur'));
		};

		// The chat renders before its view attaches, as the view of an editor does.
		const chat = $('.interactive-session');
		const listener = store.add(new ChatWindowBlurListener(chat, () => blurs.push('updated')));
		blur('main', mainWindow);
		otherWindow.document.body.appendChild(chat);
		listener.update();
		blur('main', mainWindow);
		blur('other', otherWindow);
		listener.dispose();
		blur('other', otherWindow);

		assert.deepStrictEqual(blurs, ['main', 'updated', 'main', 'other', 'updated', 'other']);
	});
});
