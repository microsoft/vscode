/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatViewHostDelegate, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { openPanelChatAndGetWidget } from '../../browser/openPanelChatAndGetWidget.js';

suite('openPanelChatAndGetWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createChatWidgetService(delegate: IChatViewHostDelegate | undefined, first: IChatWidget, shown: IChatWidget | undefined): IChatWidgetService {
		return upcastPartial<IChatWidgetService>({
			chatViewHostDelegate: delegate,
			revealChatView: async () => shown,
			getWidgetsByLocations: () => shown ? [first, shown] : [first],
		});
	}

	test('returns the first chat widget after revealing the Chat view, as before, while nothing replaces the Chat view', async () => {
		const first = upcastPartial<IChatWidget>({});
		const shown = upcastPartial<IChatWidget>({});

		assert.strictEqual(await openPanelChatAndGetWidget(createChatWidgetService(undefined, first, shown)), first);
	});

	test('returns the chat widget that what replaces the Chat view shows, not the first chat widget, such as an older tab of the chat part', async () => {
		const older = upcastPartial<IChatWidget>({});
		const shown = upcastPartial<IChatWidget>({});

		assert.strictEqual(await openPanelChatAndGetWidget(createChatWidgetService(upcastPartial<IChatViewHostDelegate>({}), older, shown)), shown);
	});

	test('returns no chat widget when what replaces the Chat view shows none, rather than another chat widget, such as an older chat editor', async () => {
		const older = upcastPartial<IChatWidget>({});

		assert.strictEqual(await openPanelChatAndGetWidget(createChatWidgetService(upcastPartial<IChatViewHostDelegate>({}), older, undefined)), undefined);
	});

	test('returns what the replacement of the Chat view shows, none, also when it is unregistered while it reveals, rather than another chat widget', async () => {
		const calls: string[] = [];
		const reveal = new DeferredPromise<IChatWidget | undefined>();
		const service: { chatViewHostDelegate: IChatViewHostDelegate | undefined } & Partial<IChatWidgetService> = {
			chatViewHostDelegate: upcastPartial<IChatViewHostDelegate>({}),
			revealChatView: () => reveal.p,
			getWidgetsByLocations: () => { calls.push('getWidgetsByLocations'); return [upcastPartial<IChatWidget>({})]; },
			onDidAddWidget: Event.None,
		};

		const pending = openPanelChatAndGetWidget(upcastPartial<IChatWidgetService>(service));
		service.chatViewHostDelegate = undefined;
		reveal.complete(undefined);

		assert.deepStrictEqual({ widget: await pending, calls }, { widget: undefined, calls: [] });
	});
});
