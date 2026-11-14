/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
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
import { IChatViewHost, IChatViewHostShownSession } from '../../../../browser/chatViewHost.js';
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
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined);
		const viewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		let viewCreated = false;
		const view = upcastPartial<ChatViewPane>({
			shownSession,
			widget: options.widgetCreatedLater ? undefined : widget,
			get whenWidget() { accesses++; return created.p; },
			loadSession: async (resource: URI, reason?: string, showReason?: string) => { calls.push(`loadSession ${resource.toString()} reason=${reason}${showReason && showReason !== 'open' ? ` ${showReason}` : ''}`); return undefined; },
			startNewLocalSession: async () => { calls.push('startNewLocalSession'); return undefined; },
			focus: () => { calls.push('focus'); },
			focusInput: () => { calls.push('focusInput'); },
			reportShown: (resource: URI, reason: string) => { calls.push(`reportShown ${resource.toString()} ${reason}`); },
			beginSessionsListSuppression: () => { calls.push('suppress'); return toDisposable(() => calls.push('unsuppress')); },
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async (id: string, focus?: boolean) => { calls.push(`openView ${id} focus=${focus}`); return view; }) as IViewsService['openView'],
			isViewVisible: () => !!options.chatVisible,
			onDidChangeViewVisibility: viewVisibility.event,
			getViewWithId: (<T>() => (viewCreated ? view : undefined) as T | null) as IViewsService['getViewWithId'],
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({ getViewLocationById: () => ViewContainerLocation.AuxiliaryBar }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ setPartHidden: (hidden, part) => { calls.push(`setPartHidden ${hidden} ${part}`); } }));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({
			withProgress: (async (_options: unknown, task: () => Promise<void>) => { calls.push('progress'); await task(); calls.push('progress done'); }) as IProgressService['withProgress'],
		}));
		const showView = () => { viewCreated = true; viewVisibility.fire({ id: ChatViewId, visible: true }); };
		return { service: disposables.add(instantiationService.createInstance(ChatViewHostService)), widget, view, created, calls, accesses: () => accesses, shownSession, showView };
	}

	test('without a host that replaces it, the Chat view shows the chats as before', async () => {
		const { service, widget, calls } = createService();
		const resource = URI.parse('test:/session');
		const results: Record<string, unknown> = {};

		results.reveal = await service.reveal(false) === widget;
		results.revealPreservingFocus = await service.reveal(true) === widget;
		results.openSession = await service.openSession(resource, { sessionTypeSelectionReason: 'explicitOverride' }) === widget;
		// One to restore is not reported as opened
		await service.openSession(resource, { preserveFocus: true, restore: true });
		// The session that the first request of the chat it shows made is reported as such
		await service.openSession(resource, { preserveFocus: true, commit: true });
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
				`openView ${ChatViewId} focus=true`, 'loadSession test:/session reason=explicitOverride', 'reportShown test:/session open', 'focusInput',
				`openView ${ChatViewId} focus=false`, 'loadSession test:/session reason=undefined restore', 'reportShown test:/session restore',
				`openView ${ChatViewId} focus=false`, 'loadSession test:/session reason=undefined commit', 'reportShown test:/session commit',
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

	test('a host replaces the Chat view while registered, and leaves to the Chat view the chats it does not show', async () => {
		const { service, view, calls } = createService();
		const shown = URI.parse('agent-host-copilot:/session');
		const left = URI.parse('vscode-chat-session://local/session');
		const opened: string[] = [];
		const replacedBefore = service.replaced.get();
		const registration = service.registerHost(upcastPartial<IChatViewHost>({
			canShow: resource => resource.scheme !== left.scheme,
			openSession: async resource => { opened.push(resource.toString()); return undefined; },
		}));
		const replacedWhile = service.replaced.get();
		await service.openSession(shown);
		calls.length = 0;
		const chatViewWidget = await service.openSession(left);
		registration.dispose();

		assert.deepStrictEqual({ replacedBefore, replacedWhile, replacedAfter: service.replaced.get(), opened, leftToChatView: calls.some(call => call.startsWith('loadSession')) && chatViewWidget === view.widget }, {
			replacedBefore: false,
			replacedWhile: true,
			replacedAfter: false,
			opened: ['agent-host-copilot:/session'],
			leftToChatView: true,
		});
	});

	test('New Chat is left to the chat widget, unless the host that replaces the Chat view starts it', async () => {
		const { service } = createService();
		let started = 0;
		const withoutNewChat = service.registerHost(upcastPartial<IChatViewHost>({}));
		const results = [await service.newChat()];
		const withNewChat = service.registerHost(upcastPartial<IChatViewHost>({ newChat: async () => { started++; return true; } }));
		results.push(await service.newChat());
		withNewChat.dispose();
		withoutNewChat.dispose();
		results.push(await service.newChat());

		assert.deepStrictEqual({ results, started }, { results: [false, true, false], started: 1 });
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

	test('the shown chat is the one of the host in use: the Chat view\'s once it exists, a registered host\'s while it is registered, if it reports one', () => {
		const { service, shownSession, showView } = createService();
		const shown = () => service.shownSession.get()?.resource.path ?? service.shownSession.get();
		const steps: Record<string, unknown> = {};
		const chat = URI.parse('test:/chat');
		const other = URI.parse('test:/other');

		shownSession.set({ resource: chat, reason: 'restore' }, undefined);
		steps.beforeTheViewExists = shown();
		showView();
		steps.view = service.shownSession.get();
		const hostShown = observableValue<IChatViewHostShownSession | undefined>('hostShown', { resource: other, reason: 'open' });
		const registration = service.registerHost({ ...upcastPartial<IChatViewHost>({}), shownSession: hostShown });
		steps.registeredHost = shown();
		const silentRegistration = service.registerHost(upcastPartial<IChatViewHost>({}));
		steps.hostWithoutOne = shown();
		silentRegistration.dispose();
		registration.dispose();
		steps.backToTheView = shown();

		assert.deepStrictEqual(steps, {
			beforeTheViewExists: undefined,
			view: { resource: chat, reason: 'restore' },
			registeredHost: '/other',
			hostWithoutOne: undefined,
			backToTheView: '/chat',
		});
	});

	test('the shown chat is the one of the host that shows the chat: the Chat view\'s for the chats a registered host leaves to it, until a host restores another', async () => {
		const { service, widget, shownSession, showView } = createService();
		const shown = () => { const value = service.shownSession.get(); return value && `${value.resource.scheme} ${value.reason}`; };
		const agentHostChat = URI.parse('agent-host-copilot:/session');
		const localChat = URI.parse('vscode-chat-session://local/session');
		Object.assign(widget, { viewModel: { sessionResource: localChat } });
		shownSession.set({ resource: localChat, reason: 'open' }, undefined);
		showView();
		const hostShown = observableValue<IChatViewHostShownSession | undefined>('hostShown', { resource: agentHostChat, reason: 'open' });
		const registration = service.registerHost({
			...upcastPartial<IChatViewHost>({}),
			shownSession: hostShown,
			canShow: resource => resource.scheme !== localChat.scheme,
			openSession: async () => undefined,
		});
		const steps: Record<string, string | undefined> = {};
		steps.registered = shown();
		await service.openSession(localChat);
		steps.openLeft = shown();
		await service.openSession(agentHostChat);
		steps.openShown = shown();
		(await service.startSession(localChat, { local: false, importingConversation: false })).dispose();
		steps.startLeft = shown();
		await service.openSession(agentHostChat);
		await service.revealIfShowing(localChat, { preserveFocus: true });
		steps.revealLeft = shown();
		hostShown.set({ resource: agentHostChat, reason: 'restore' }, undefined);
		steps.hostRestores = shown();
		shownSession.set({ resource: localChat, reason: 'restore' }, undefined);
		steps.chatViewRestores = shown();
		registration.dispose();

		assert.deepStrictEqual(steps, {
			registered: 'agent-host-copilot open',
			openLeft: 'vscode-chat-session open',
			openShown: 'agent-host-copilot open',
			startLeft: 'vscode-chat-session open',
			revealLeft: 'vscode-chat-session open',
			hostRestores: 'agent-host-copilot restore',
			chatViewRestores: 'vscode-chat-session restore',
		});
	});

	test('revealing a host, or New Chat that it takes, makes it the host whose shown chat the service reports, none while it shows a new chat', async () => {
		const { service, shownSession, showView } = createService();
		const shown = () => service.shownSession.get()?.resource.scheme ?? 'none';
		const agentHostChat = URI.parse('agent-host-copilot:/session');
		const localChat = URI.parse('vscode-chat-session://local/session');
		shownSession.set({ resource: localChat, reason: 'open' }, undefined);
		showView();
		const hostShown = observableValue<IChatViewHostShownSession | undefined>('hostShown', { resource: agentHostChat, reason: 'open' });
		let takesNewChat = false;
		const registration = service.registerHost({
			...upcastPartial<IChatViewHost>({}),
			shownSession: hostShown,
			canShow: resource => resource.scheme !== localChat.scheme,
			openSession: async () => undefined,
			reveal: async () => undefined,
			newChat: async () => takesNewChat,
		});
		const steps: string[] = [];
		await service.openSession(localChat);
		steps.push(shown());
		// The host shows again, also with the chat it showed before
		await service.reveal();
		steps.push(shown());
		await service.openSession(localChat);
		// New Chat that the host does not take changes nothing
		await service.newChat();
		steps.push(shown());
		takesNewChat = true;
		await service.newChat();
		steps.push(shown());
		// The new chat starts a session
		hostShown.set({ resource: agentHostChat.with({ path: '/started' }), reason: 'open' }, undefined);
		steps.push(shown());
		registration.dispose();

		assert.deepStrictEqual(steps, ['vscode-chat-session', 'agent-host-copilot', 'vscode-chat-session', 'none', 'agent-host-copilot']);
	});

	test('the host that showed a chat last reports it until it is no longer registered, also as other hosts are removed', async () => {
		const { service, shownSession, showView } = createService();
		const shown = () => service.shownSession.get()?.resource.path ?? 'none';
		const localChat = URI.parse('vscode-chat-session://local/chat-view');
		shownSession.set({ resource: localChat, reason: 'open' }, undefined);
		showView();
		const createHost = (name: string) => ({
			...upcastPartial<IChatViewHost>({}),
			shownSession: constObservable({ resource: URI.parse(`agent-host-copilot:/${name}`), reason: 'open' as const }),
			canShow: (resource: URI) => resource.scheme !== localChat.scheme,
			openSession: async () => undefined,
		});
		const a = service.registerHost(createHost('a'));
		const b = service.registerHost(createHost('b'));
		const steps: string[] = [];
		// The Chat view shows a chat that B leaves to it
		await service.openSession(localChat);
		steps.push(shown());
		a.dispose();
		steps.push(shown());
		await service.openSession(URI.parse('agent-host-copilot:/b'));
		steps.push(shown());
		b.dispose();
		steps.push(shown());

		assert.deepStrictEqual(steps, ['/chat-view', '/chat-view', '/b', '/chat-view']);
	});
});
