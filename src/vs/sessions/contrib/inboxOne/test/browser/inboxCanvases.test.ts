/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getCanvasDefinitionInstanceId, ICanvas, ICanvasDefinition } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IInboxCanvasHost, IInboxCanvasHostService, UnsupportedInboxCanvasHostService } from '../../browser/inboxCanvasHost.js';
import { InboxCanvases } from '../../browser/inboxCanvases.js';

suite('Inbox extension canvases', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens registered extensions for the selected chat, handles delayed publication, and releases only its own host', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const enabled = observableValue('enabled', false);
		const canvases = observableValue<readonly ICanvas[]>('canvases', []);
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:/selected-child'), canvases });
		const session = upcastPartial<ISession>({ resource: URI.parse('test:/selected'), providerId: 'provider', capabilities: constObservable({ supportsCanvases: true, supportsMultipleChats: true }) });
		const definition: ICanvasDefinition = { canvasId: 'ui-review', extensionId: 'plugin:review', extensionSource: 'plugin', displayName: 'UI review', description: 'Inspect the application', requiresInput: false };
		let listings = 0;
		const opened: object[] = [];
		const hosts: { canvas: ICanvas; disposed: boolean; visible: boolean }[] = [];
		instantiation.stub(ISessionsManagementService, {
			getSession: () => session,
			listCanvases: async (owner, selected) => { assert.strictEqual(owner, session); assert.strictEqual(selected, chat); listings++; return [definition, { ...definition, canvasId: 'input', displayName: 'Needs input', requiresInput: true }]; },
			openCanvas: async (owner, selected, definition, instanceId) => { opened.push({ owner, selected, definition, instanceId }); },
		});
		instantiation.stub(IInboxCanvasHostService, {
			supported: true,
			enabled,
			create: (_container, _viewport, owner, selected, canvas) => {
				assert.strictEqual(owner, session);
				assert.strictEqual(selected, chat);
				const host = { canvas, disposed: false, visible: true };
				hosts.push(host);
				return upcastPartial<IInboxCanvasHost>({ layout: () => { }, setVisible: visible => { host.visible = visible; }, dispose: () => { host.disposed = true; } });
			},
		});
		instantiation.stub(IAccessibleViewService, {});
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(INotificationService, {});
		const widget = store.add(instantiation.createInstance(InboxCanvases, session, chat, document.createElement('div'), () => { }));
		await timeout(0);
		const disabled = { listings, hosts: hosts.length, hidden: widget.element.hidden };
		enabled.set(true, undefined);
		await timeout(0);
		const buttons = () => [...widget.element.querySelectorAll<HTMLElement>('.monaco-button')];
		const inputDisabled = buttons().find(button => button.textContent === 'Needs input')?.getAttribute('aria-disabled');
		buttons().find(button => button.textContent === 'UI review')!.click();
		await timeout(0);
		const canvas: ICanvas = { resource: URI.parse('canvas:/review'), instanceId: getCanvasDefinitionInstanceId(definition), title: 'Review', source: URI.parse('http://127.0.0.1:1234/review') };
		canvases.set([canvas], undefined);
		canvases.set([{ ...canvas, title: 'Review updated' }], undefined);
		widget.setVisible(false);
		const hiddenWithTab = !hosts[0].visible;
		widget.setVisible(true);
		const visibleWithTab = hosts[0].visible;
		const retained = hosts.length;
		buttons().find(button => button.textContent === 'Hide canvas')!.click();
		const hidden = hosts[0].disposed;
		buttons().find(button => button.textContent === 'Review updated')!.click();
		enabled.set(false, undefined);
		assert.deepStrictEqual({
			disabled, inputDisabled, opened, retained, hidden, hiddenWithTab, visibleWithTab,
			disposed: hosts.map(host => host.disposed), canvasStillRegistered: canvases.get().length,
		}, {
			disabled: { listings: 0, hosts: 0, hidden: true }, inputDisabled: 'true',
			opened: [{ owner: session, selected: chat, definition, instanceId: getCanvasDefinitionInstanceId(definition) }],
			retained: 1, hidden: true, hiddenWithTab: true, visibleWithTab: true, disposed: [true, true], canvasStillRegistered: 1,
		});
	});

	test('web explains live canvases without depending on desktop services or listing providers', () => {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IInboxCanvasHostService, new UnsupportedInboxCanvasHostService());
		instantiation.stub(ISessionsManagementService, {});
		instantiation.stub(IAccessibleViewService, {});
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(INotificationService, {});
		const canvas: ICanvas = { resource: URI.parse('canvas:/one'), source: URI.parse('https://example.test/one'), title: 'Preview', instanceId: 'one' };
		const canvases = observableValue<readonly ICanvas[]>('canvases', [canvas]);
		const widget = store.add(instantiation.createInstance(InboxCanvases, upcastPartial<ISession>({}), upcastPartial<IChat>({ canvases }), document.createElement('div'), () => { }));
		const shown = { hidden: widget.element.hidden, text: widget.element.textContent };
		canvases.set([], undefined);
		assert.deepStrictEqual({ shown, emptyHidden: widget.element.hidden }, {
			shown: { hidden: false, text: 'Interactive extension canvases are available in the desktop application.' }, emptyHidden: true,
		});
	});
});
