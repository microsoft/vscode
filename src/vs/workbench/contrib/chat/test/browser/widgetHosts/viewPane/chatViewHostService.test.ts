/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProgressService } from '../../../../../../../platform/progress/common/progress.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../../../../browser/chat.js';
import { ChatWidget } from '../../../../browser/widget/chatWidget.js';
import { IChatViewHost } from '../../../../browser/chatViewHost.js';
import { ChatViewHostService } from '../../../../browser/widgetHosts/viewPane/chatViewHostService.js';
import { ChatViewPane } from '../../../../browser/widgetHosts/viewPane/chatViewPane.js';

suite('ChatViewHostService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** The service over a Chat view that records what is asked of it, of the views service and of the layout. */
	function createService(options: { readonly chatVisible?: boolean; readonly widgetCreatedLater?: boolean } = {}) {
		const calls: string[] = [];
		const widget = upcastPartial<ChatWidget>({});
		const created = new DeferredPromise<ChatWidget>();
		let accesses = 0;
		const view = upcastPartial<ChatViewPane>({
			widget: options.widgetCreatedLater ? undefined : widget,
			get whenWidget() { accesses++; return created.p; },
			loadSession: async (resource: URI, reason?: string) => { calls.push(`loadSession ${resource.toString()} reason=${reason}`); return undefined; },
			startNewLocalSession: async () => { calls.push('startNewLocalSession'); return undefined; },
			focus: () => { calls.push('focus'); },
			focusInput: () => { calls.push('focusInput'); },
			beginSessionsListSuppression: () => { calls.push('suppress'); return toDisposable(() => calls.push('unsuppress')); },
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async (id: string, focus?: boolean) => { calls.push(`openView ${id} focus=${focus}`); return view; }) as IViewsService['openView'],
			isViewVisible: () => !!options.chatVisible,
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({ getViewLocationById: () => ViewContainerLocation.AuxiliaryBar }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ setPartHidden: (hidden, part) => { calls.push(`setPartHidden ${hidden} ${part}`); } }));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({
			withProgress: (async (_options: unknown, task: () => Promise<void>) => { calls.push('progress'); await task(); calls.push('progress done'); }) as IProgressService['withProgress'],
		}));
		return { service: instantiationService.createInstance(ChatViewHostService), widget, view, created, calls, accesses: () => accesses };
	}

	test('without a host that replaces it, the Chat view shows the chats as before', async () => {
		const { service, widget, calls } = createService();
		const resource = URI.parse('test:/session');
		const results: Record<string, unknown> = {};

		results.reveal = await service.reveal(false) === widget;
		results.revealPreservingFocus = await service.reveal(true) === widget;
		results.openSession = await service.openSession(resource, { sessionTypeSelectionReason: 'explicitOverride' }) === widget;
		results.toggle = await service.toggle();
		const start = await service.startSession(resource, { local: false, importingConversation: true, beforeOpen: () => calls.push('beforeOpen') });
		await start.moved(URI.parse('test:/moved'));
		results.shown = await start.complete(URI.parse('test:/moved'), true);
		results.composer = await start.createComposer();
		await timeout(0);
		const local = await service.startSession(resource, { local: true, importingConversation: false });
		local.dispose();

		assert.deepStrictEqual({ results, calls }, {
			results: { reveal: true, revealPreservingFocus: true, openSession: true, toggle: true, shown: true, composer: undefined },
			calls: [
				`openView ${ChatViewId} focus=true`,
				`openView ${ChatViewId} focus=false`,
				`openView ${ChatViewId} focus=true`, 'loadSession test:/session reason=explicitOverride', 'focusInput',
				`setPartHidden false ${Parts.AUXILIARYBAR_PART}`,
				`openView ${ChatViewId} focus=undefined`, 'beforeOpen', 'suppress', 'progress', 'loadSession test:/session reason=explicitOverride', 'focus',
				`openView ${ChatViewId} focus=undefined`, 'loadSession test:/moved reason=undefined',
				'unsuppress', 'progress done',
				`openView ${ChatViewId} focus=undefined`, 'startNewLocalSession', 'focus',
			],
		});
	});

	test('toggle hides a visible Chat view', async () => {
		const { service, calls } = createService({ chatVisible: true });
		assert.deepStrictEqual({ shows: await service.toggle(), calls }, { shows: false, calls: [`setPartHidden true ${Parts.AUXILIARYBAR_PART}`] });
	});

	test('the host registered last shows the chats, each registration on its own, also of the same host, until it is disposed, in any order', async () => {
		const { service, calls } = createService();
		const reveals: string[] = [];
		const host = (name: string) => upcastPartial<IChatViewHost>({ reveal: async () => { reveals.push(name); return undefined; } });
		const active = async () => {
			reveals.length = 0;
			calls.length = 0;
			await service.reveal();
			return reveals[0] ?? (calls.length ? 'chat view' : 'none');
		};
		const a = host('A');
		const b = host('B');
		const steps: string[] = [];

		const firstA = service.registerHost(a);
		const registeredB = service.registerHost(b);
		const lastA = service.registerHost(a);
		steps.push(await active());
		lastA.dispose();
		steps.push(await active());
		const c = service.registerHost(host('C'));
		// An earlier registration disposed out of order leaves the one in use
		registeredB.dispose();
		steps.push(await active());
		c.dispose();
		steps.push(await active());
		firstA.dispose();
		steps.push(await active());

		assert.deepStrictEqual(steps, ['A', 'B', 'C', 'A', 'chat view']);
	});

	test('reveal waits for the Chat view\'s widget, which its body creates as it first renders, only when asked to', async () => {
		const { service, view, created, accesses } = createService({ widgetCreatedLater: true });
		const unchanged = await service.reveal(false);
		let settled = false;
		const pending = service.reveal(false, { waitForWidget: true }).then(widget => { settled = true; return widget; });
		await timeout(0);
		// It waits for the widget it asked the view for, which the view has not created yet
		const waiting = { accesses: accesses(), settled };
		const widget = upcastPartial<ChatWidget>({});
		Object.assign(view, { widget });
		created.complete(widget);
		assert.deepStrictEqual({ unchanged, waiting, revealed: await pending === widget }, { unchanged: undefined, waiting: { accesses: 1, settled: false }, revealed: true });
	});
});
