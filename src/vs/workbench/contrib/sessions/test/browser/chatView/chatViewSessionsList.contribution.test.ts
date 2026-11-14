/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { FindAgentSessionInViewerAction, RefreshAgentSessionsViewerAction } from '../../../../chat/browser/agentSessions/agentSessionsActions.js';
import { ChatViewPane } from '../../../../chat/browser/widgetHosts/viewPane/chatViewPane.js';
import { ChatViewContainerId, ChatViewId } from '../../../../chat/browser/chat.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../chat/browser/chatViewHost.js';
import { constObservable, ISettableObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { EditorWindowMainSessionHost } from '../../../browser/agentsView/editorWindowMainSessionHost.js';
import { ChatConfiguration, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, surfacesAllLocalAgentHostAgents } from '../../../../chat/common/constants.js';
import { ChatViewSessionsGate } from '../../../browser/chatView/chatViewSessionsList.contribution.js';
import { IChatViewSessionsListService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { Menus } from '../../../browser/menus.js';
import { SessionGroupToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { EditorWindowSessionsPresenterService, IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { EditorWindowSessionsService } from '../../../browser/agentsView/editorWindowSessionsService.js';
import { EditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';
import { createChatViewComposerHolder, createChatViewComposerModel, getChatViewComposerTarget } from '../../../browser/agentsView/chatViewSessionsList.js';
import { ChatWindowComposerModel, IChatWindowComposerInit } from '../../../browser/chatEditor/chatWindowComposer.js';
import { IEditorWindowSessionsRuntime } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';

/** How many items the context menu of a session has: the actions of the sessions list add theirs. */
function sessionItemMenuItems(): number {
	return MenuRegistry.getMenuItems(SessionItemContextMenuId).length;
}

/** The pane of the Chat view, as the chat contributions register it: unless they are loaded, a stand-in. */
class ChatViewPaneStandIn extends ViewPane { }

suite('ChatViewSessionsGate', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// The Chat view and its container are registered by the chat contributions: unless they are loaded, stand-ins
	let standIn: { readonly container?: ViewContainer; readonly view?: IViewDescriptor } = {};
	setup(() => {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const container = viewContainersRegistry.get(ChatViewContainerId) ? undefined : viewContainersRegistry.registerViewContainer({ id: ChatViewContainerId, title: { value: 'Chat', original: 'Chat' }, ctorDescriptor: new SyncDescriptor(ViewPaneContainer) }, ViewContainerLocation.AuxiliaryBar);
		let view: IViewDescriptor | undefined;
		if (!viewsRegistry.getView(ChatViewId)) {
			view = { id: ChatViewId, name: { value: 'Chat', original: 'Chat' }, ctorDescriptor: new SyncDescriptor(ChatViewPaneStandIn) };
			viewsRegistry.registerViews([view], viewContainersRegistry.get(ChatViewContainerId)!);
		}
		standIn = { container, view };
	});
	teardown(() => {
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		if (standIn.view) {
			viewsRegistry.deregisterViews([standIn.view], viewsRegistry.getViewContainer(ChatViewId)!);
		}
		if (standIn.container) {
			Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).deregisterViewContainer(standIn.container);
		}
		standIn = {};
	});

	/** The sessions lists given to the Chat view. */
	let providers: number;
	/** The holds of the sessions providers of the window. */
	let runtimeHolds: number;
	/** The sessions that the list opened, through the presenter of the window. */
	let opened: string[];
	/** Whether a host, such as the chat part, replaces the Chat view. */
	let replaced: ISettableObservable<boolean>;
	/** Whether the Chat view hosts the chat opened last, such as one that the host that replaces it leaves to it. */
	let chatViewHosts: ISettableObservable<boolean>;
	let contextKeyService: MockContextKeyService;
	let viewVisibility: Emitter<{ id: string; visible: boolean }>;

	function createGate(enabled: boolean, remoteAuthority?: string, configuration?: Record<string, unknown>, stub?: (instantiationService: TestInstantiationService) => void): ChatViewSessionsGate {
		providers = 0;
		runtimeHolds = 0;
		opened = [];
		replaced = observableValue('replaced', false);
		chatViewHosts = observableValue('chatViewHosts', true);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled, ...configuration }));
		viewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: viewVisibility.event, isViewVisible: () => false }));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority }));
		contextKeyService = new MockContextKeyService();
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IChatViewSessionsListService, upcastPartial<IChatViewSessionsListService>({ registerProvider: () => { providers++; return toDisposable(() => providers--); } }));
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ replaced, chatViewHosts, shownSession: constObservable(undefined) }));
		instantiationService.stub(IEditorWindowSessionsRuntime, upcastPartial<IEditorWindowSessionsRuntime>({ enable: () => { runtimeHolds++; return toDisposable(() => runtimeHolds--); } }));
		instantiationService.stub(IEditorWindowSessionsPresenterService, upcastPartial<IEditorWindowSessionsPresenterService>({ presenter: constObservable(upcastPartial<IEditorWindowSessionsPresenter>({ openChat: async session => { opened.push(session.sessionId); } })) }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) }));
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: Event.None, isVisible: () => false }));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }));
		stub?.(instantiationService);
		return disposables.add(instantiationService.createInstance(ChatViewSessionsGate));
	}

	/** The views of the Chat view container, which it keeps, the view containers of its own, which it registers none of, and whether local chats are on by default. */
	function registered() {
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const chatViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(ChatViewContainerId)!;
		return {
			chatContainerViews: viewsRegistry.getViews(chatViewContainer).map(view => view.id),
			agentsContainers: Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).all.filter(container => container.id === 'workbench.view.agents').length,
			localChatDefault: Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationDefaultsOverrides().get(ChatConfiguration.EditorLocalAgentEnabled)?.value,
		};
	}

	test('reads only its setting and registers nothing while the setting is off', () => {
		const reads: string[] = [];
		const configurationService = new class extends TestConfigurationService {
			override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
				reads.push(String(arg1));
				return super.getValue<T>(arg1, arg2);
			}
		}({ [ChatConfiguration.ChatViewSessionsListEnabled]: false });
		const before = registered();
		// Any use of the instantiation service fails: with the setting off, the gate creates and invokes nothing
		disposables.add(new ChatViewSessionsGate(configurationService, upcastPartial<IInstantiationService>({})));

		assert.deepStrictEqual({ ...registered(), reads }, { ...before, reads: [ChatConfiguration.ChatViewSessionsListEnabled] });
	});

	test('gives the Chat view its sessions list, without local chats by default, holding the sessions providers, and the actions of the list only once it shows, while the setting is on', () => {
		const before = registered();
		const listActionsBefore = sessionItemMenuItems();
		const gate = createGate(true);
		const whileOn = { ...registered(), providers, runtimeHolds, listActionsBeforeShown: sessionItemMenuItems() - listActionsBefore };
		gate.dispose();

		assert.deepStrictEqual({ whileOn, afterDispose: { ...registered(), providers, runtimeHolds } }, {
			whileOn: { ...before, localChatDefault: false, providers: 1, runtimeHolds: 1, listActionsBeforeShown: 0 },
			afterDispose: { ...before, providers: 0, runtimeHolds: 0 },
		});
	});

	test('the Chat view shows only its sessions while a host, such as the chat part, replaces it, but a chat that the host leaves to it', () => {
		createGate(true);
		const sessionsOnly = () => contextKeyService.getContextKeyValue('chatViewSessionsOnly');
		const steps = [sessionsOnly()];
		// The host registers, and hosts the chats
		transaction(tx => { replaced.set(true, tx); chatViewHosts.set(false, tx); });
		steps.push(sessionsOnly());
		// It leaves a chat that it cannot show, such as a local chat, to the Chat view, which shows it
		chatViewHosts.set(true, undefined);
		steps.push(sessionsOnly());
		chatViewHosts.set(false, undefined);
		steps.push(sessionsOnly());
		transaction(tx => { replaced.set(false, tx); chatViewHosts.set(true, tx); });
		steps.push(sessionsOnly());

		assert.deepStrictEqual(steps, [false, true, false, true, false]);
	});

	test('registers nothing while the Agents view of #347688 is on too, which takes precedence', () => {
		createGate(true, undefined, { 'chat.sessionsView.enabled': true });

		assert.deepStrictEqual({ providers, runtimeHolds }, { providers: 0, runtimeHolds: 0 });
	});

	test('registers the actions of the list once the Chat view first shows', () => {
		const before = sessionItemMenuItems();
		const gate = createGate(true);

		viewVisibility.fire({ id: ChatViewId, visible: true });
		const afterShown = sessionItemMenuItems() > before;
		gate.dispose();

		assert.deepStrictEqual({ afterShown, afterDispose: sessionItemMenuItems() - before }, { afterShown: true, afterDispose: 0 });
	});

	test('surfaces every local agent host agent in a local editor window with the setting on, as the Agents window does, but not in a remote one', () => {
		const surfaces = (enabled: boolean, remoteAuthority?: string, isSessionsWindow = false) =>
			surfacesAllLocalAgentHostAgents({ isSessionsWindow, remoteAuthority }, new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled }));

		assert.deepStrictEqual({
			local: surfaces(true),
			remote: surfaces(true, 'ssh-remote+host'),
			off: surfaces(false),
			agentsWindow: surfaces(false, undefined, true),
		}, { local: true, remote: false, off: false, agentsWindow: true });
	});

	test('leaves the Chat view as it is in a remote window, with local chats on by default', () => {
		const before = registered();
		createGate(true, 'ssh-remote+host');

		assert.deepStrictEqual({ providers, runtimeHolds, localChatDefault: registered().localChatDefault }, { providers: 0, runtimeHolds: 0, localChatDefault: before.localChatDefault });
	});

	test('the chat that the Chat view shows is the chat of the window, marked read while it shows, unless a host such as the chat part replaces the Chat view', () => {
		const marked: string[] = [];
		const createSession = (id: string) => {
			const chat = upcastPartial<IChat>({ resource: URI.parse(`agent-host-copilot:/${id}`), isRead: observableValue(`${id}.isRead`, false), updatedAt: constObservable(new Date(1)) });
			return upcastPartial<ISession>({ sessionId: id, mainChat: constObservable(chat), loading: constObservable(false), status: constObservable(SessionStatus.Completed) });
		};
		const inView = createSession('inView');
		const inChatPart = createSession('inChatPart');
		// A peer chat, whose session outside the list's scope is known only later
		const peer = createSession('peer');
		let peerKnown = false;
		const sessionChanged = disposables.add(new Emitter<readonly ISessionChange[]>());
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined);
		let mainHost: EditorWindowMainSessionHost | undefined;
		createGate(true, undefined, undefined, instantiationService => {
			instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: viewVisibility.event, isViewVisible: id => id === ChatViewId }));
			instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
			instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ shownSession, replaced, chatViewHosts }));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				onDidChangeSessions: Event.None,
				onDidChangeSession: sessionChanged.event,
				getSessionForChatResource: resource => [inView, inChatPart, ...(peerKnown ? [peer] : [])].map(session => ({ session, chat: session.mainChat.get() })).find(shown => extUri.isEqual(shown.chat.resource, resource)),
				markRead: async session => { marked.push(session.sessionId); (session.mainChat.get().isRead as ISettableObservable<boolean>).set(true, undefined); return true; },
			}));
			const host = mainHost = instantiationService.createInstance(EditorWindowMainSessionHost);
			instantiationService.stub(ISessionHost, host);
		});
		// The chat part, as its service is created, such as for the folders of the composer, binds its active tab's chat
		disposables.add(mainHost!.bindShownChat(constObservable({ session: inChatPart, chat: inChatPart.mainChat.get() })));
		const steps: Record<string, string | undefined> = {};
		shownSession.set({ resource: inView.mainChat.get().resource, reason: 'open' }, undefined);
		steps.inView = mainHost!.session.get()?.sessionId;
		// The chat part replaces the Chat view, and then no longer
		transaction(tx => { replaced.set(true, tx); chatViewHosts.set(false, tx); });
		steps.inChatPart = mainHost!.session.get()?.sessionId;
		transaction(tx => { replaced.set(false, tx); chatViewHosts.set(true, tx); });
		steps.backInView = mainHost!.session.get()?.sessionId;
		shownSession.set({ resource: peer.mainChat.get().resource, reason: 'open' }, undefined);
		steps.peerUnknown = mainHost!.session.get()?.sessionId;
		peerKnown = true;
		sessionChanged.fire([{ session: peer, kind: 'added' }]);
		steps.peerKnown = mainHost!.session.get()?.sessionId;

		assert.deepStrictEqual({ steps, marked }, { steps: { inView: 'inView', inChatPart: 'inChatPart', backInView: 'inView', peerUnknown: undefined, peerKnown: 'peer' }, marked: ['inView', 'peer'] });
	});

	test('Refresh and Find of the Chat view act on the shared sessions list that the Chat view shows in place of its own', async () => {
		const commands: string[] = [];
		const accessor = upcastPartial<ServicesAccessor>({
			get: (<T>(id: unknown) => (id === IViewsService
				// A Chat view with a provided list has no sessions control of its own
				? upcastPartial<IViewsService>({ getActiveViewWithId: (<V>() => upcastPartial<ChatViewPane>({ agentSessionsControl: undefined }) as V) as IViewsService['getActiveViewWithId'] })
				: upcastPartial<ICommandService>({ executeCommand: (async (command: string) => { commands.push(command); return undefined; }) as ICommandService['executeCommand'] })) as T) as ServicesAccessor['get'],
		});
		await new RefreshAgentSessionsViewerAction().run(accessor);
		await new FindAgentSessionInViewerAction().run(accessor);

		assert.deepStrictEqual(commands, ['sessionsViewPane.refresh', 'sessionsViewPane.find']);
	});

	test('offers no action of the sessions that opens the Agents window', () => {
		createGate(true);
		viewVisibility.fire({ id: ChatViewId, visible: true });

		const menus = [Menus.SidebarSessionsHeader, Menus.SessionsViewFilter, Menus.SessionItemToolbar, SessionItemContextMenuId, Menus.SessionChatItemContext, Menus.SessionChatItemToolbar, Menus.SessionSectionContext, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, MenuId.ViewTitle, MenuId.AgentSessionsToolbar];
		const commands = menus.flatMap(menu => MenuRegistry.getMenuItems(menu)).filter(isIMenuItem).map(item => item.command.id);
		assert.deepStrictEqual(commands.filter(id => id === OPEN_AGENTS_WINDOW_COMMAND_ID || id === OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID), []);
	});

	test('a session of the list opens where the window presents sessions: its main and peer chats, also to the side, in the Chat view, or in the chat part while a feature presents them there', async () => {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ openSession: async resource => { calls.push(`chat view ${resource.path}`); return undefined; } }));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({}));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		// The list's sessions service of an editor window, which its rows open sessions and chats with
		const sessionsService = disposables.add(instantiationService.createInstance(EditorWindowSessionsService));
		const main = upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/main') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(main) });
		const peer = URI.parse('agent-host-copilot:/peer');
		const openRows = async () => {
			await sessionsService.openChat(session, main.resource);
			await sessionsService.openChat(session, peer);
			await sessionsService.openChatToSide(session, peer);
			await sessionsService.openSessionToSide(session);
			return calls.splice(0);
		};

		const inChatView = await openRows();
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
			openChat: async (_session, chatResource, options) => { calls.push(`chat part ${chatResource?.path ?? 'main'}${options?.sideBySide ? ' to the side' : ''}`); },
		}));
		const inChatPart = await openRows();
		registration.dispose();

		assert.deepStrictEqual({ inChatView, inChatPart }, {
			inChatView: ['chat view /main', 'chat view /peer', 'chat view /peer', 'chat view /main'],
			inChatPart: ['chat part /main', 'chat part /peer', 'chat part /peer to the side', 'chat part main to the side'],
		});
	});

	test('the Chat view\'s composer offers the folders that the window\'s composers offer, such as worktrees, and follows the window\'s folder as it moves, until it goes', () => {
		const composerFolders = new EditorWindowComposerFoldersService(upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) }));
		const folder = URI.file('/repo');
		const worktree = URI.file('/repo.worktrees/feature');
		const offered = disposables.add(composerFolders.setComposerFolderOptions(() => ({ allowedFolders: constObservable([folder, worktree]) })));
		const retargeted: string[] = [];
		let init: IChatWindowComposerInit | undefined;
		const { folders } = createChatViewComposerModel({
			create: (_resource, composerInit) => {
				init = composerInit;
				return upcastPartial<ChatWindowComposerModel>({ retargetFolder: (to, from) => { retargeted.push(`${from?.path} -> ${to.path}`); return true; } });
			},
		}, composerFolders, URI.parse('vscode-agents-composer:/1'), { folderUri: folder }, async () => { });
		composerFolders.retargetComposerFolders(worktree, folder);
		folders.dispose();
		composerFolders.retargetComposerFolders(folder, worktree);
		const allowedFolders = init?.allowedFolders?.get().map(uri => uri.path);
		offered.dispose();

		assert.deepStrictEqual({ target: init?.target?.folderUri?.path, allowedFolders, afterOffer: init?.allowedFolders?.get().map(uri => uri.path), retargeted }, {
			target: '/repo',
			allowedFolders: ['/repo', '/repo.worktrees/feature'],
			// The window's folders, of which this window has none
			afterOffer: [],
			retargeted: ['/repo -> /repo.worktrees/feature'],
		});
	});

	test('the Chat view\'s composer holds the window\'s sessions providers while it has a draft, and goes as they are released only once nothing is typed', async () => {
		const presenterService = disposables.add(new EditorWindowSessionsPresenterService(upcastPartial<IChatViewHostService>({})));
		let pristine = false;
		let model: { isPristine(): boolean } | undefined = { isPristine: () => pristine };
		const holder = disposables.add(presenterService.registerComposerHolder(createChatViewComposerHolder(() => model, () => { model = undefined; })));
		const steps: boolean[] = [];
		// As the providers are released, such as a while after the Chat view hid: a draft with text stays
		await presenterService.closeIdleComposers();
		steps.push(presenterService.hasComposer());
		pristine = true;
		await presenterService.closeIdleComposers();
		steps.push(presenterService.hasComposer());
		holder.dispose();

		assert.deepStrictEqual(steps, [true, false]);
	});

	test('New Chat aims the Chat view\'s composer at its target when it has one, and at the window\'s default otherwise', () => {
		const folder = URI.file('/repo.worktrees/feature');
		const fallback = { folderUri: URI.file('/repo') };
		const aimed = getChatViewComposerTarget({ folder, providerId: 'provider', sessionType: 'claude', modelId: 'model', modeId: 'mode', requireDevContainer: true }, () => fallback);
		assert.deepStrictEqual({
			aimed: { folder: aimed?.folderUri?.path, providerId: aimed?.providerId, sessionTypeId: aimed?.sessionTypeId, modelId: aimed?.modelId, modeId: aimed?.modeId, requireDevContainer: aimed?.requireDevContainer },
			default: getChatViewComposerTarget(undefined, () => fallback)?.folderUri?.path,
		}, {
			aimed: { folder: '/repo.worktrees/feature', providerId: 'provider', sessionTypeId: 'claude', modelId: 'model', modeId: 'mode', requireDevContainer: true },
			default: '/repo',
		});
	});

	test('the Chat view\'s composer created before a feature offers other folders, such as worktrees, offers them once it does, and the window\'s folders again once it no longer does', () => {
		const folder = URI.file('/repo');
		const worktree = URI.file('/repo.worktrees/feature');
		const composerFolders = new EditorWindowComposerFoldersService(upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: folder })] }) }));
		let init: IChatWindowComposerInit | undefined;
		const { folders } = createChatViewComposerModel({
			create: (_resource, composerInit) => {
				init = composerInit;
				return upcastPartial<ChatWindowComposerModel>({ retargetFolder: () => true });
			},
		}, composerFolders, URI.parse('vscode-agents-composer:/1'), { folderUri: folder }, async () => { });
		const offered = () => init?.allowedFolders?.get().map(uri => uri.path);
		const steps = [offered()];
		const offering = composerFolders.setComposerFolderOptions(() => ({ allowedFolders: constObservable([folder, worktree]) }));
		steps.push(offered());
		offering.dispose();
		steps.push(offered());
		folders.dispose();

		assert.deepStrictEqual(steps, [['/repo'], ['/repo', '/repo.worktrees/feature'], ['/repo']]);
	});
});

