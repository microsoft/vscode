/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../../base/common/async.js';
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
	function createService(options: { readonly chatVisible?: boolean } = {}) {
		const calls: string[] = [];
		const widget = upcastPartial<ChatWidget>({});
		const view = upcastPartial<ChatViewPane>({
			widget,
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
		return { service: instantiationService.createInstance(ChatViewHostService), widget, calls };
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

	test('the host registered last shows the chats; disposing an earlier one leaves it, and disposing it restores the Chat view', async () => {
		const { service, calls } = createService();
		const host = (name: string) => upcastPartial<IChatViewHost>({ reveal: async () => { calls.push(`reveal ${name}`); return undefined; } });

		const before = service.isReplaced;
		const first = service.registerHost(host('first'));
		await service.reveal();
		const second = service.registerHost(host('second'));
		await service.reveal();
		first.dispose();
		await service.reveal();
		const replaced = service.isReplaced;
		second.dispose();
		await service.reveal();

		assert.deepStrictEqual({ before, replaced, after: service.isReplaced, calls }, {
			before: false, replaced: true, after: false,
			calls: ['reveal first', 'reveal second', 'reveal second', `openView ${ChatViewId} focus=true`],
		});
	});
});
