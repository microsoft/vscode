/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ChatEditorOverflowWidgetsHost } from '../../../browser/widget/chatEditorOverflowWidgetsHost.js';
import { registerTestIframe } from '../../../../../../base/test/browser/testWindow.js';

suite('ChatEditorOverflowWidgetsHost', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('follows a chat that renders detached into the window that it shows in', () => {
		const store = disposables.add(new DisposableStore());
		const mainContainer = mainWindow.document.body.appendChild($('.monaco-workbench'));
		store.add(toDisposable(() => mainContainer.remove()));
		// The other window of a chat, such as a chat window.
		const frame = mainWindow.document.body.appendChild($('iframe')) as HTMLIFrameElement;
		store.add(toDisposable(() => frame.remove()));
		store.add(registerTestIframe(frame));
		const otherWindow = frame.contentWindow!;
		const otherContainer = otherWindow.document.body.appendChild(otherWindow.document.createElement('div'));
		const layoutService = { getContainer: (window: Window) => window === otherWindow ? otherContainer : mainContainer } as Pick<ILayoutService, 'getContainer'> as ILayoutService;

		// The chat renders before its view attaches, as the view of an editor does.
		const chat = $('.interactive-session');
		const host = store.add(new ChatEditorOverflowWidgetsHost(chat, layoutService));
		const beforeAttached = host.element.parentElement === mainContainer;
		host.update();
		const whileDetached = host.element.parentElement === mainContainer;

		otherContainer.appendChild(chat);
		host.update();

		assert.deepStrictEqual({
			beforeAttached,
			whileDetached,
			inOtherWindow: host.element.parentElement === otherContainer,
			window: getWindow(host.element) === otherWindow,
		}, {
			beforeAttached: true,
			whileDetached: true,
			inOtherWindow: true,
			window: true,
		});

		host.dispose();
		assert.strictEqual(host.element.isConnected, false);
	});
});
