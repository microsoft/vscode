/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, runOnChange } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProgressService } from '../../../../../../../platform/progress/common/progress.js';
import { stubChatViewHostServiceDependencies } from '../../../common/chatViewSessionsListServiceTestUtils.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../../../../browser/chat.js';
import { ChatWidget } from '../../../../browser/widget/chatWidget.js';
import { IChatViewHost, IChatViewHostNewChatOptions, IChatViewHostShownSession, IChatViewNewChatTarget } from '../../../../browser/chatViewHost.js';
import { ChatViewHostEvent, ChatViewHostService, IChatViewHostState, stepChatViewHostState } from '../../../../browser/widgetHosts/viewPane/chatViewHostService.js';
import { ChatViewPane } from '../../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { NewChatAction } from '../../../../browser/actions/chatNewActions.js';
import { IChatViewSessionsListProvider } from '../../../../browser/widgetHosts/viewPane/chatViewSessionsList.js';

suite('ChatViewHostService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Registers a contribution of only `host`. */
	function registerHost(service: ChatViewHostService, host: IChatViewHost) {
		return service.register({ host });
	}

	/** The service over a Chat view that records what is asked of it, of the views service and of the layout. */
	function createService(options: { readonly chatVisible?: boolean; readonly widgetCreatedLater?: boolean; readonly firstOpenView?: Promise<void> } = {}) {
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
		// The first open of the view waits for it, such as a view that is slow to create
		let firstOpenView = options.firstOpenView;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async (id: string, focus?: boolean) => {
				calls.push(`openView ${id} focus=${focus}`);
				const opening = firstOpenView;
				firstOpenView = undefined;
				await opening;
				return view;
			}) as IViewsService['openView'],
			isViewVisible: () => !!options.chatVisible,
			onDidChangeViewVisibility: viewVisibility.event,
			getViewWithId: (<T>() => (viewCreated ? view : undefined) as T | null) as IViewsService['getViewWithId'],
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({ getViewLocationById: () => ViewContainerLocation.AuxiliaryBar }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ setPartHidden: (hidden, part) => { calls.push(`setPartHidden ${hidden} ${part}`); } }));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({
			withProgress: (async (_options: unknown, task: () => Promise<void>) => { calls.push('progress'); await task(); calls.push('progress done'); }) as IProgressService['withProgress'],
		}));
		stubChatViewHostServiceDependencies(instantiationService);
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
				`openView ${ChatViewId} focus=true`, 'loadSession test:/session reason=explicitOverride', 'focusInput',
				`openView ${ChatViewId} focus=false`, 'loadSession test:/session reason=undefined restore',
				`openView ${ChatViewId} focus=false`, 'loadSession test:/session reason=undefined commit',
				`setPartHidden false ${Parts.AUXILIARYBAR_PART}`,
				`openView ${ChatViewId} focus=undefined`, 'beforeOpen', 'suppress', 'progress', 'loadSession test:/session reason=explicitOverride', 'focus',
				`openView ${ChatViewId} focus=undefined`, 'loadSession test:/moved reason=undefined commit',
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

		const firstA = registerHost(service, a);
		const registeredB = registerHost(service, b);
		const lastA = registerHost(service, a);
		steps.push(await active());
		lastA.dispose();
		steps.push(await active());
		const c = registerHost(service, host('C'));
		// An earlier registration disposed out of order leaves the one in use
		registeredB.dispose();
		steps.push(await active());
		c.dispose();
		steps.push(await active());
		firstA.dispose();
		steps.push(await active());

		assert.deepStrictEqual(steps, ['A', 'B', 'C', 'A', 'chat view']);
	});

	test('a host replaces the Chat view while registered, and leaves to the Chat view the chats it does not show, which the Chat view then hosts', async () => {
		const { service, view, calls } = createService();
		const shown = URI.parse('agent-host-copilot:/session');
		const left = URI.parse('vscode-chat-session://local/session');
		const opened: string[] = [];
		const replacedBefore = service.replaced.get();
		const chatViewHosts = [service.chatViewHosts.get()];
		const registration = registerHost(service, upcastPartial<IChatViewHost>({
			canShow: resource => resource.scheme !== left.scheme,
			openSession: async resource => { opened.push(resource.toString()); return undefined; },
		}));
		const replacedWhile = service.replaced.get();
		chatViewHosts.push(service.chatViewHosts.get());
		await service.openSession(shown);
		chatViewHosts.push(service.chatViewHosts.get());
		calls.length = 0;
		const chatViewWidget = await service.openSession(left);
		chatViewHosts.push(service.chatViewHosts.get());
		await service.openSession(shown);
		chatViewHosts.push(service.chatViewHosts.get());
		registration.dispose();
		chatViewHosts.push(service.chatViewHosts.get());

		assert.deepStrictEqual({ replacedBefore, replacedWhile, replacedAfter: service.replaced.get(), opened, leftToChatView: calls.some(call => call.startsWith('loadSession')) && chatViewWidget === view.widget, chatViewHosts }, {
			replacedBefore: false,
			replacedWhile: true,
			replacedAfter: false,
			opened: ['agent-host-copilot:/session', 'agent-host-copilot:/session'],
			leftToChatView: true,
			// Before, the left chat, and after; not the host's
			chatViewHosts: [true, false, false, true, false, true],
		});
	});

	test('New Chat is left to the chat widget, unless the host that replaces the Chat view starts it', async () => {
		const { service } = createService();
		let started = 0;
		const withoutNewChat = registerHost(service, upcastPartial<IChatViewHost>({}));
		const results = [await service.newChat()];
		const withNewChat = registerHost(service, upcastPartial<IChatViewHost>({ newChat: async () => { started++; return true; } }));
		results.push(await service.newChat());
		withNewChat.dispose();
		withoutNewChat.dispose();
		results.push(await service.newChat());

		assert.deepStrictEqual({ results, started }, { results: [false, true, false], started: 1 });
	});

	test('a new chat of its own that the host in use leaves to the Chat view starts in the Chat view, which it shows', async () => {
		const { service, view, calls } = createService();
		Object.assign(view, { newChat: async (target: IChatViewNewChatTarget | undefined, options: IChatViewHostNewChatOptions | undefined) => { calls.push(`view.newChat ${target?.folder?.path} ownChat=${options?.ownChat}`); return true; } });
		const registration = registerHost(service, upcastPartial<IChatViewHost>({ newChat: async () => { calls.push('host.newChat'); return false; } }));

		const taken = await service.newChat({ folder: URI.file('/repo') }, { ownChat: true, preserveFocus: true });
		registration.dispose();

		assert.deepStrictEqual({ taken, calls }, { taken: true, calls: ['host.newChat', `openView ${ChatViewId} focus=false`, 'view.newChat /repo ownChat=true'] });
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
		const registration = registerHost(service, { ...upcastPartial<IChatViewHost>({}), shownSession: hostShown });
		steps.registeredHost = shown();
		const silentRegistration = registerHost(service, upcastPartial<IChatViewHost>({}));
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

	test('registering a host that shows no chat yet does not take the chat that the Chat view shows and the host leaves to it', () => {
		const { service, shownSession, showView } = createService();
		const localChat = URI.parse('vscode-chat-session://local/session');
		shownSession.set({ resource: localChat, reason: 'open' }, undefined);
		showView();
		const steps = [service.chatViewHosts.get()];
		const registration = registerHost(service, { ...upcastPartial<IChatViewHost>({}), canShow: resource => resource.scheme !== localChat.scheme });
		steps.push(service.chatViewHosts.get());
		const other = registerHost(service, upcastPartial<IChatViewHost>({}));
		steps.push(service.chatViewHosts.get());
		other.dispose();
		registration.dispose();

		assert.deepStrictEqual(steps, [true, true, false]);
	});

	test('the Chat view restoring a chat that the registered host shows does not make the Chat view the host', () => {
		const { service, shownSession, showView } = createService();
		showView();
		const registration = registerHost(service, { ...upcastPartial<IChatViewHost>({}), canShow: resource => resource.scheme !== 'vscode-chat-session' });
		const steps = [service.chatViewHosts.get()];
		shownSession.set({ resource: URI.parse('agent-host-copilot:/session'), reason: 'restore' }, undefined);
		steps.push(service.chatViewHosts.get());
		shownSession.set({ resource: URI.parse('vscode-chat-session://local/session'), reason: 'restore' }, undefined);
		steps.push(service.chatViewHosts.get());
		registration.dispose();

		assert.deepStrictEqual(steps, [false, false, true]);
	});

	test('a new chat of its own that falls back to the Chat view makes it the host once it commits, also of a chat that the registered host could show', async () => {
		const { service, view, shownSession, showView } = createService();
		showView();
		Object.assign(view, { newChat: async () => true });
		const registration = registerHost(service, { ...upcastPartial<IChatViewHost>({}), canShow: () => true, newChat: async () => false });
		await service.newChat(undefined, { ownChat: true });
		const committed = URI.parse('agent-host-copilot:/committed');
		shownSession.set({ resource: committed, reason: 'commit' }, undefined);
		const result = { chatViewHosts: service.chatViewHosts.get(), shown: service.shownSession.get() && `${service.shownSession.get()!.resource.toString()} ${service.shownSession.get()!.reason}` };
		registration.dispose();

		assert.deepStrictEqual(result, { chatViewHosts: true, shown: `${committed.toString()} commit` });
	});

	test('registering a host that shows no chat yet does not take a new chat of New Chat that the Chat view shows and the host leaves to it, until a chat opens in the host', async () => {
		const { service, view, shownSession, showView } = createService();
		showView();
		const localDraft = URI.parse('vscode-chat-session://local/draft');
		// The Chat view starts a new chat of its own, such as New Session of a sessions list, and shows it
		Object.assign(view, { newChat: async () => { shownSession.set({ resource: localDraft, reason: 'open' }, undefined); return true; } });
		await service.newChat(undefined, { ownChat: true });
		const steps = [service.chatViewHosts.get()];
		const registration = registerHost(service, { ...upcastPartial<IChatViewHost>({}), canShow: resource => resource.scheme !== localDraft.scheme, openSession: async () => undefined });
		steps.push(service.chatViewHosts.get());
		await service.openSession(URI.parse('agent-host-copilot:/session'));
		steps.push(service.chatViewHosts.get());
		registration.dispose();

		assert.deepStrictEqual(steps, [true, true, false]);
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
		const registration = registerHost(service, {
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
		const registration = registerHost(service, {
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
		const a = registerHost(service, createHost('a'));
		const b = registerHost(service, createHost('b'));
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

	test('a host that completes a reveal after it is removed does not become the host whose shown chat the service reports', async () => {
		const { service, shownSession, showView } = createService();
		shownSession.set({ resource: URI.parse('vscode-chat-session://local/chat-view'), reason: 'open' }, undefined);
		showView();
		const revealed = new DeferredPromise<undefined>();
		const registration = registerHost(service, {
			...upcastPartial<IChatViewHost>({}),
			shownSession: constObservable({ resource: URI.parse('agent-host-copilot:/removed'), reason: 'open' as const }),
			reveal: () => revealed.p,
		});
		const revealing = service.reveal();
		registration.dispose();
		await revealed.complete(undefined);
		await revealing;

		assert.deepStrictEqual({ shown: service.shownSession.get()?.resource.path, replaced: service.replaced.get() }, { shown: '/chat-view', replaced: false });
	});

	test('a new chat of its own that the host in use declines after a later open does not fall back to the Chat view, which would replace the opened chat', async () => {
		const { service, view, calls, showView } = createService();
		showView();
		Object.assign(view, { newChat: async () => { calls.push('chat view newChat'); return true; } });
		const declined = new DeferredPromise<boolean>();
		const registration = registerHost(service, { ...upcastPartial<IChatViewHost>({}), newChat: () => declined.p, openSession: async () => undefined });
		const newChat = service.newChat(undefined, { ownChat: true });
		await service.openSession(URI.parse('agent-host-copilot:/opened'));
		await declined.complete(false);
		const taken = await newChat;
		registration.dispose();

		assert.deepStrictEqual({ taken, chatViewNewChat: calls.includes('chat view newChat') }, { taken: true, chatViewNewChat: false });
	});

	test('a New Chat superseded meanwhile is handled whichever host declines it last, so that the chat widget does not start a new chat in place of the opened chat; one not superseded is left to it', async () => {
		const { service, view, showView } = createService();
		showView();
		let declined = new DeferredPromise<boolean>();
		const chatViewDeclined = new DeferredPromise<boolean>();
		Object.assign(view, { newChat: () => chatViewDeclined.p });
		const registration = registerHost(service, { ...upcastPartial<IChatViewHost>({}), newChat: () => declined.p, openSession: async () => undefined });
		const results: Record<string, boolean> = {};

		// The ordinary New Chat command, which the host in use declines after a later open
		const superseded = service.newChat();
		await service.openSession(URI.parse('agent-host-copilot:/opened'));
		await declined.complete(false);
		results.supersededDeclinedByHost = await superseded;

		// Not superseded, it is left to the chat widget
		declined = new DeferredPromise<boolean>();
		const notSuperseded = service.newChat();
		await declined.complete(false);
		results.notSuperseded = await notSuperseded;

		// A new chat of its own that the host declines, which the Chat view then declines after a later open
		declined = new DeferredPromise<boolean>();
		const ownChat = service.newChat(undefined, { ownChat: true });
		await declined.complete(false);
		await timeout(0);
		await service.openSession(URI.parse('agent-host-copilot:/opened-again'));
		await chatViewDeclined.complete(false);
		results.supersededDeclinedByChatView = await ownChat;
		registration.dispose();

		assert.deepStrictEqual(results, { supersededDeclinedByHost: true, notSuperseded: false, supersededDeclinedByChatView: true });
	});

	test('a host that completes a reveal after it is removed does not supersede a New Chat under way', async () => {
		const { service, shownSession, showView } = createService();
		shownSession.set({ resource: URI.parse('vscode-chat-session://local/chat-view'), reason: 'open' }, undefined);
		showView();
		const revealed = new DeferredPromise<undefined>();
		const removed = registerHost(service, { ...upcastPartial<IChatViewHost>({}), reveal: () => revealed.p });
		const revealing = service.reveal();
		removed.dispose();
		const newChatShown = new DeferredPromise<boolean>();
		const registration = registerHost(service, {
			...upcastPartial<IChatViewHost>({}),
			shownSession: constObservable({ resource: URI.parse('agent-host-copilot:/before'), reason: 'open' as const }),
			newChat: () => newChatShown.p,
		});
		const newChat = service.newChat();
		await revealed.complete(undefined);
		await revealing;
		await newChatShown.complete(true);
		const taken = await newChat;
		const shown = service.shownSession.get();
		registration.dispose();

		assert.deepStrictEqual({ taken, shown }, { taken: true, shown: undefined });
	});

	test('the Chat view shows the sessions list of the contribution registered last that gives one, and its own once none does', () => {
		const { service } = createService();
		const provider = (name: string) => upcastPartial<IChatViewSessionsListProvider>({ create: () => { throw new Error(name); } });
		const a = provider('a');
		const b = provider('b');
		const changes: (IChatViewSessionsListProvider | undefined)[] = [];
		const tracking = runOnChange(service.sessionsList, value => changes.push(value));
		const first = service.register({ sessionsList: a });
		const second = service.register({ sessionsList: b });
		// A contribution without a list, and the same list registered again, change nothing
		const withoutList = service.register({ sessionsOnly: true });
		const againB = service.register({ sessionsList: b });
		againB.dispose();
		withoutList.dispose();
		second.dispose();
		first.dispose();
		tracking.dispose();

		assert.deepStrictEqual(changes, [a, b, a, undefined]);
	});

	test('the Chat view shows only its sessions while a contribution asks for it and a host replaces it, unless it hosts the chat shown last', () => {
		const { service, shownSession, showView } = createService();
		showView();
		const localChat = URI.parse('vscode-chat-session://local/session');
		const steps = [service.sessionsOnly.get()];
		const first = service.register({ sessionsOnly: true });
		const second = service.register({ sessionsOnly: true });
		// No host replaces the Chat view
		steps.push(service.sessionsOnly.get());
		const host = service.register({ host: { ...upcastPartial<IChatViewHost>({}), canShow: resource => resource.scheme !== localChat.scheme } });
		steps.push(service.sessionsOnly.get());
		// The Chat view hosts a chat that the host leaves to it
		shownSession.set({ resource: localChat, reason: 'open' }, undefined);
		steps.push(service.sessionsOnly.get());
		shownSession.set(undefined, undefined);
		host.dispose();
		const again = service.register({ host: upcastPartial<IChatViewHost>({}) });
		first.dispose();
		steps.push(service.sessionsOnly.get());
		second.dispose();
		steps.push(service.sessionsOnly.get());
		again.dispose();

		assert.deepStrictEqual(steps, [false, false, true, false, true, false]);
	});

	test('the Chat view shows the composer of a new chat that it started while the chats open elsewhere, until a chat shows', async () => {
		const { service, view, shownSession, showView } = createService();
		showView();
		Object.assign(view, { newChat: async () => true });
		const elsewhere = service.register({ chatsOpenElsewhere: true });
		const steps = [service.sessionsOnly.get()];
		await service.newChat(undefined, { ownChat: true });
		steps.push(service.sessionsOnly.get());
		shownSession.set({ resource: URI.parse('vscode-chat-session://local/session'), reason: 'open' }, undefined);
		await service.openSession(URI.parse('agent-host-copilot:/session-1'));
		steps.push(service.sessionsOnly.get());
		elsewhere.dispose();

		assert.deepStrictEqual(steps, [true, false, true]);
	});

	test('while the chats open elsewhere, consecutive New Chats each start the Chat view\'s own new chat, which keeps showing its composer', async () => {
		const { service, view, shownSession, showView } = createService();
		showView();
		const steps: string[] = [];
		let drafts = 0;
		// As the Chat view does: its new chat shows an untitled chat
		Object.assign(view, { newChat: async (_target: unknown, options?: IChatViewHostNewChatOptions) => { steps.push(`view.newChat ownChat=${options?.ownChat}`); shownSession.set({ resource: URI.parse(`agent-host-copilot:/untitled-${++drafts}`), reason: 'open' }, undefined); return true; } });
		const accessor = upcastPartial<ServicesAccessor>({
			get: (<T>(id: unknown) => (id === IInstantiationService ? { invokeFunction: () => { steps.push('chat widget New Chat'); } } : service) as T) as ServicesAccessor['get'],
		});
		const elsewhere = service.register({ chatsOpenElsewhere: true });

		await new NewChatAction().run(accessor);
		steps.push(`sessionsOnly=${service.sessionsOnly.get()}`);
		await new NewChatAction().run(accessor);
		steps.push(`sessionsOnly=${service.sessionsOnly.get()}`);
		elsewhere.dispose();

		assert.deepStrictEqual(steps, ['view.newChat ownChat=true', 'sessionsOnly=false', 'view.newChat ownChat=true', 'sessionsOnly=false']);
	});

	test('while the chats open elsewhere, the commit of a new chat that was revealed before its request is reported as the Chat view\'s shown chat', async () => {
		const { service, view, shownSession, showView } = createService({ chatVisible: true });
		showView();
		Object.assign(view, { newChat: async () => { shownSession.set({ resource: URI.parse('agent-host-copilot:/untitled-1'), reason: 'open' }, undefined); return true; } });
		const elsewhere = service.register({ chatsOpenElsewhere: true });
		const reported: string[] = [];
		const listener = runOnChange(service.shownSession, shown => reported.push(`${shown?.resource.path} ${shown?.reason}`));

		await service.newChat(undefined, { ownChat: true });
		// Run Prompt in New Chat reveals the Chat view before it sends
		await service.reveal(true);
		const sessionsOnlyRevealed = service.sessionsOnly.get();
		shownSession.set({ resource: URI.parse('agent-host-copilot:/session-1'), reason: 'commit' }, undefined);
		listener.dispose();
		elsewhere.dispose();

		assert.deepStrictEqual({ sessionsOnlyRevealed, reported: reported.at(-1), chatViewHosts: service.chatViewHosts.get() }, {
			sessionsOnlyRevealed: true,
			reported: '/session-1 commit',
			chatViewHosts: true,
		});
	});

	test('the Chat view shows only its sessions while the chats open elsewhere, even with no host, unless it hosts the chat shown last of a host that replaces it', () => {
		const { service, shownSession, showView } = createService();
		showView();
		const localChat = URI.parse('vscode-chat-session://local/session');
		const steps = [service.sessionsOnly.get()];
		const elsewhere = service.register({ chatsOpenElsewhere: true });
		steps.push(service.sessionsOnly.get());
		const host = service.register({ host: { ...upcastPartial<IChatViewHost>({}), canShow: resource => resource.scheme !== localChat.scheme } });
		steps.push(service.sessionsOnly.get());
		shownSession.set({ resource: localChat, reason: 'open' }, undefined);
		steps.push(service.sessionsOnly.get());
		shownSession.set(undefined, undefined);
		host.dispose();
		elsewhere.dispose();
		steps.push(service.sessionsOnly.get());

		assert.deepStrictEqual(steps, [false, true, true, false, false]);
	});

	test('what shows the chats steps: a request takes the host and supersedes a New Chat under way, a host shows a chat on its own, and a host that went changes nothing', () => {
		const chatView = upcastPartial<IChatViewHost>({});
		const a = { ...upcastPartial<IChatViewHost>({}), canShow: (resource: URI) => resource.scheme !== 'vscode-chat-session' };
		const gone = upcastPartial<IChatViewHost>({});
		const context = { chatViewHost: chatView, hostInUse: a, isRegistered: (host: IChatViewHost) => host === a };
		const name = (host: IChatViewHost) => host === chatView ? 'chat view' : 'a';
		let state: IChatViewHostState = { host: chatView, newChat: false, request: 0 };
		const steps: string[] = [];
		const step = (label: string, event: ChatViewHostEvent) => {
			const next = stepChatViewHostState(state, event, context);
			steps.push(`${label}: ${next === state ? 'unchanged' : `${name(next.host)}${next.newChat ? ' new chat' : ''} #${next.request}`}`);
			state = next;
		};

		step('open in a', { kind: 'request', host: a });
		step('New Chat starts', { kind: 'newChatStart' });
		const superseded = state.request;
		step('open in the Chat view meanwhile', { kind: 'request', host: chatView });
		step('a takes the superseded New Chat', { kind: 'newChatTaken', host: a, request: superseded });
		step('New Chat starts again', { kind: 'newChatStart' });
		step('a takes it', { kind: 'newChatTaken', host: a, request: state.request });
		step('a shows its chat', { kind: 'shown', host: a, resource: URI.parse('agent-host-copilot:/one') });
		step('a shows it again', { kind: 'shown', host: a, resource: URI.parse('agent-host-copilot:/one') });
		step('the Chat view shows a chat that a can show', { kind: 'shown', host: chatView, resource: URI.parse('agent-host-copilot:/two') });
		step('the Chat view shows a chat that a leaves to it', { kind: 'shown', host: chatView, resource: URI.parse('vscode-chat-session://local/one') });
		step('a host that went asks', { kind: 'request', host: gone });

		assert.deepStrictEqual(steps, [
			'open in a: a #1',
			'New Chat starts: a #2',
			'open in the Chat view meanwhile: chat view #3',
			'a takes the superseded New Chat: unchanged',
			'New Chat starts again: chat view #4',
			'a takes it: a new chat #4',
			'a shows its chat: a #4',
			'a shows it again: unchanged',
			'the Chat view shows a chat that a can show: unchanged',
			'the Chat view shows a chat that a leaves to it: chat view #4',
			'a host that went asks: unchanged',
		]);
	});

	test('a New Chat of its own waiting for the Chat view to open does not start its new chat once a newer open superseded it', async () => {
		const opening = new DeferredPromise<void>();
		const { service, view, calls } = createService({ firstOpenView: opening.p });
		Object.assign(view, { newChat: async () => { calls.push('view.newChat'); return true; } });
		const newChat = service.newChat(undefined, { ownChat: true });
		await service.openSession(URI.parse('test:/newer'));
		opening.complete();
		const handled = await newChat;

		assert.deepStrictEqual({ handled, calls: calls.filter(call => call === 'view.newChat' || call.startsWith('loadSession')) }, {
			handled: true,
			calls: ['loadSession test:/newer reason=undefined'],
		});
	});
});
