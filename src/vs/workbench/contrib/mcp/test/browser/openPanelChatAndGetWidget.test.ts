/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { openPanelChatAndGetWidget } from '../../browser/openPanelChatAndGetWidget.js';

suite('openPanelChatAndGetWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const chatViewWidget = () => upcastPartial<IChatWidget>({ viewContext: { viewId: ChatViewId } });
	const chatEditorWidget = upcastPartial<IChatWidget>({ viewContext: {} });

	/** Reveals with a host that replaces the Chat view or not, which the reveal shows `revealed`, while a chat editor exists already. */
	function setup(options: { readonly replaced: boolean; readonly revealed: Promise<IChatWidget | undefined> }) {
		const calls: string[] = [];
		const added = disposables.add(new Emitter<IChatWidget>());
		const host = { isReplaced: options.replaced };
		const chatWidgetService = upcastPartial<IChatWidgetService>({
			revealChatView: preserveFocus => { calls.push(`revealChatView preserveFocus=${preserveFocus}`); return options.revealed; },
			getWidgetsByLocations: () => { calls.push('getWidgetsByLocations'); return [chatEditorWidget]; },
			onDidAddWidget: added.event,
		});
		return { calls, added, host, open: () => openPanelChatAndGetWidget(upcastPartial<IChatViewHostService>(host), chatWidgetService) };
	}

	test('with the Chat view as the host, returns the Chat view\'s widget, not a chat editor opened before it', async () => {
		const shown = chatViewWidget();
		const { calls, open } = setup({ replaced: false, revealed: Promise.resolve(shown) });
		assert.deepStrictEqual({ shown: await open() === shown, calls }, { shown: true, calls: ['revealChatView preserveFocus=false'] });
	});

	test('with the Chat view as the host, waits for the Chat view\'s widget while it has none, not for a chat editor', async () => {
		const { calls, added, open } = setup({ replaced: false, revealed: Promise.resolve(undefined) });
		const pending = open();
		await Promise.resolve();
		await Promise.resolve();
		added.fire(chatEditorWidget);
		const shown = chatViewWidget();
		added.fire(shown);
		assert.deepStrictEqual({ shown: await pending === shown, calls }, { shown: true, calls: ['revealChatView preserveFocus=false'] });
	});

	test('with a host that replaces the Chat view, returns what it shows, also none, and waits for nothing, also when it is unregistered while it reveals', async () => {
		const reveal = new DeferredPromise<IChatWidget | undefined>();
		const { calls, added, host, open } = setup({ replaced: true, revealed: reveal.p });
		const pending = open();
		host.isReplaced = false;
		reveal.complete(undefined);
		const result = await pending;
		added.fire(chatViewWidget());
		assert.deepStrictEqual({ result, calls }, { result: undefined, calls: ['revealChatView preserveFocus=false'] });
	});
});
