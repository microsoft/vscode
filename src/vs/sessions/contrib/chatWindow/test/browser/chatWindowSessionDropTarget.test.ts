/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { IChatWindowOpenOptions, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { DraggedSessionIdentifier, fillSessionChatDragData } from '../../../../../workbench/contrib/sessions/browser/dnd.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChat, ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ChatWindowSessionDropTarget } from '../../browser/chatWindowSessionDropTarget.js';

suite('Chat Window Session Drop Target', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('test-session:/a');
	const chatResource = URI.parse('test-chat:/a');
	const openChatResource = URI.parse('test-chat:/open');

	function createSession(archived: boolean): ISession {
		const chat = new class extends mock<IChat>() {
			override readonly resource = chatResource;
			override readonly isArchived = constObservable(archived);
		}();
		return new class extends mock<ISession>() {
			override readonly sessionId = 'session';
			override readonly resource = sessionResource;
			override readonly loading = constObservable(false);
			override readonly chats = constObservable([chat]);
			override readonly mainChat = constObservable(chat);
		}();
	}

	function setup(archived = false) {
		const opened: { chat: string; tabOf: string | undefined; exactChat: boolean | undefined }[] = [];
		const services = workbenchInstantiationService(undefined, store);
		services.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI) { return resource.toString() === sessionResource.toString() ? createSession(archived) : undefined; }
		}());
		services.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override getWindow() { return {} as ReturnType<IChatWindowService['getWindow']>; }
			override async open(chat: URI, options?: IChatWindowOpenOptions) {
				opened.push({ chat: chat.toString(), tabOf: options?.tabOf?.toString(), exactChat: options?.exactChat });
				return undefined;
			}
		}());
		const element = $('.chat-view');
		element.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;';
		mainWindow.document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		store.add(services.createInstance(ChatWindowSessionDropTarget, element, () => openChatResource));
		return { element, opened };
	}

	const overlaySelector = '.chat-window-session-drop-overlay';

	test('a session row dragged over the chat shows where it opens, and opens its chat beside the chat on drop', async () => {
		const { element, opened } = setup();
		const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
		transfer.setData([new DraggedSessionIdentifier('session', sessionResource)], DraggedSessionIdentifier.prototype);
		store.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));
		const dataTransfer = new DataTransfer();
		dataTransfer.setData('application/vnd.code.session', JSON.stringify({ sessionId: 'session', resource: sessionResource.toString() }));

		element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
		const overlay = element.querySelector<HTMLElement>(overlaySelector);
		assert.ok(overlay, 'shows an indicator that covers the chat');
		overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		await timeout(0);

		assert.deepStrictEqual({ overlayRemoved: !element.querySelector(overlaySelector), opened }, {
			overlayRemoved: true,
			opened: [{ chat: chatResource.toString(), tabOf: openChatResource.toString(), exactChat: true }],
		});
	});

	test('a chat tab dragged over the chat opens that chat beside the chat on drop', async () => {
		const { element, opened } = setup();
		const dataTransfer = new DataTransfer();
		fillSessionChatDragData(new DragEvent('dragstart', { dataTransfer }), 'session', chatResource);

		element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
		const overlay = element.querySelector<HTMLElement>(overlaySelector);
		assert.ok(overlay);
		overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		await timeout(0);

		assert.deepStrictEqual(opened, [{ chat: chatResource.toString(), tabOf: openChatResource.toString(), exactChat: true }]);
	});

	test('an archived session shows no indicator, and a drop opens nothing', async () => {
		const { element, opened } = setup(true);
		const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
		transfer.setData([new DraggedSessionIdentifier('session', sessionResource)], DraggedSessionIdentifier.prototype);
		store.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));
		const dataTransfer = new DataTransfer();
		dataTransfer.setData('application/vnd.code.session', '{}');

		element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
		element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		await timeout(0);

		assert.deepStrictEqual({ overlay: !!element.querySelector(overlaySelector), opened }, { overlay: false, opened: [] });
	});

	test('files dragged over the chat show no indicator', () => {
		const { element } = setup();
		const dataTransfer = new DataTransfer();
		dataTransfer.setData('text/plain', 'x');
		element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
		assert.strictEqual(!!element.querySelector(overlaySelector), false);
	});
});
