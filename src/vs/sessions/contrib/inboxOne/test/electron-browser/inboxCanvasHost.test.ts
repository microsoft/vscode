/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { WebContentsViewHost } from '../../../../../workbench/contrib/browserView/electron-browser/webContentsViewHost.js';
import { ICanvas, ICanvasService } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CHAT_INBOX_ENABLED_SETTING } from '../../browser/inboxNotificationsConstants.js';
import { InboxCanvasHostService } from '../../electron-browser/inboxCanvasHost.js';

suite('Inbox native canvas presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function harness(inboxEnabled = true) {
		const instantiation = store.add(new TestInstantiationService());
		const enabled = observableValue('canvases enabled', true);
		const canvas: ICanvas = { resource: URI.parse('canvas:/one'), instanceId: 'one', title: 'Preview', source: URI.parse('http://127.0.0.1:1234/private') };
		const canvases = observableValue<readonly ICanvas[]>('canvases', [canvas]);
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:/child'), canvases });
		const session = upcastPartial<ISession>({ resource: URI.parse('session:/one'), isArchived: constObservable(false), capabilities: constObservable({ supportsCanvases: true, supportsMultipleChats: true }), chats: constObservable([chat]) });
		const created = new DeferredPromise<IBrowserViewModel>();
		const calls: object[] = [];
		const visible: boolean[] = [];
		instantiation.stub(IBrowserViewWorkbenchService, { createExternalBrowserView: (url, source, owner) => { calls.push({ url, source, owner }); return created.p; } });
		instantiation.stub(ICanvasService, { enabled });
		instantiation.stub(ISessionsManagementService, { getSession: () => session, onDidChangeSessions: Event.None, onDidDeleteChat: Event.None });
		const config = new TestConfigurationService({ [CHAT_INBOX_ENABLED_SETTING]: inboxEnabled });
		store.add(config.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, config);
		instantiation.stub(IOpenerService, { open: async () => true });
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stubInstance(WebContentsViewHost, {
			screenshotElement: document.createElement('div'), pauseElement: document.createElement('div'),
			onContainerCreated: () => { }, setModel: () => { }, setVisible: value => { visible.push(value); },
			layout: () => { }, dispose: () => { },
		});
		const viewport = document.createElement('div');
		viewport.style.cssText = 'position:fixed;top:0;left:0;width:500px;height:500px';
		const container = viewport.appendChild(document.createElement('div'));
		document.body.appendChild(viewport);
		store.add(toDisposable(() => viewport.remove()));
		const service = instantiation.createInstance(InboxCanvasHostService);
		const host = store.add(service.create(container, viewport, session, chat, canvas));
		let disposed = false;
		const layout = new DeferredPromise<void>();
		const model = upcastPartial<IBrowserViewModel>({
			onDidChangeFocus: Event.None, onDidChangeLoadingState: Event.None, onDidRequestOpenExternal: Event.None,
			layout: () => layout.p, dispose: () => { disposed = true; },
		});
		return { host, canvases, enabled, created, calls, visible, model, layout, get disposed() { return disposed; } };
	}

	test('disabled Inbox never creates native content', () => {
		const test = harness(false);
		assert.deepStrictEqual(test.calls, []);
	});

	test('late creation is disposed when the selected canvas disappears and preserves the network owner', async () => {
		const test = harness();
		test.canvases.set([], undefined);
		await test.created.complete(test.model);
		await timeout(0);
		assert.deepStrictEqual({ calls: test.calls, disposed: test.disposed, revealed: test.visible.includes(true) }, {
			calls: [{ url: 'http://127.0.0.1:1234/private', source: 'canvas', owner: { type: 'agent', sessionId: 'chat:/child' } }],
			disposed: true, revealed: false,
		});
	});

	test('does not reveal a native view after an in-flight layout loses permission', async () => {
		const test = harness();
		await test.created.complete(test.model);
		await timeout(0);
		test.enabled.set(false, undefined);
		await test.layout.complete();
		await timeout(0);
		assert.deepStrictEqual({ disposed: test.disposed, revealed: test.visible.includes(true) }, { disposed: true, revealed: false });
	});
});
