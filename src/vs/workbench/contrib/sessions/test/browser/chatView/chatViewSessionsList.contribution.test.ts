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
import { IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
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
import { ChatConfiguration, observeChatViewSessionsListEnabled, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, surfacesAllLocalAgentHostAgents } from '../../../../chat/common/constants.js';
import { ChatViewSessionsGate } from '../../../browser/chatView/chatViewSessionsList.contribution.js';
import { IChatViewSessionsListService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { Menus } from '../../../browser/menus.js';
import { SessionGroupToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionsList } from '../../../browser/views/sessionsList.js';
import { ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { EditorWindowSessionsPresenterService, IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { EditorWindowSessionsService } from '../../../browser/agentsView/editorWindowSessionsService.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { ChatViewSessionsListProvider } from '../../../browser/agentsView/chatViewSessionsList.js';
import { InSessionsViewContext, ISessionsViewLocator, SessionsView, SessionsViewId } from '../../../browser/views/sessionsView.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { SessionsListNotificationFocused } from '../../../browser/views/sessionsListNotification.js';
import { ChatViewSessionsListAccessibilityHelp, trackChatViewSessionsListHelpHint } from '../../../browser/chatView/chatViewSessionsListAccessibilityHelp.js';
import { AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
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

	let configurationService: TestConfigurationService;

	function createGate(enabled: boolean, remoteAuthority?: string, configuration?: Record<string, unknown>, stub?: (instantiationService: TestInstantiationService) => void): ChatViewSessionsGate {
		providers = 0;
		runtimeHolds = 0;
		opened = [];
		replaced = observableValue('replaced', false);
		chatViewHosts = observableValue('chatViewHosts', true);
		const instantiationService = disposables.add(new TestInstantiationService());
		configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled, ...configuration });
		instantiationService.stub(IConfigurationService, configurationService);
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

	/** Changes `key` to `value` in the configuration service of the gate created last, as a user would. */
	function change(key: string, value: boolean): void {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (affected: string) => affected === key, affectedKeys: new Set([key]) }));
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

	test('reads only its settings and registers nothing but the accessibility help of the list while the setting is off', () => {
		const reads: string[] = [];
		const configurationService = new class extends TestConfigurationService {
			override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
				reads.push(String(arg1));
				return super.getValue<T>(arg1, arg2);
			}
		}({ [ChatConfiguration.ChatViewSessionsListEnabled]: false });
		const before = registered();
		// Any use of the instantiation service fails: with the setting off, the gate creates and invokes nothing
		disposables.add(new ChatViewSessionsGate(configurationService, upcastPartial<IInstantiationService>({}), upcastPartial<IWorkbenchEnvironmentService>({})));

		assert.deepStrictEqual({ ...registered(), reads }, { ...before, reads: ['chat.sessionsView.enabled', ChatConfiguration.ChatViewSessionsListEnabled] });
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

	test('registers the accessibility help of the list and of its Undo notice as the window starts, also with the setting off, so that the help that the window installs then opens in the list once the setting turns on', () => {
		const helps = () => AccessibleViewRegistry.getImplementations().map(help => help.name).filter(name => name === 'chatViewSessionsList' || name === 'sessions-list-notification').sort();
		// The Agents window's list, which other tests load, may hold the Undo notice's help for good
		const before = helps();
		const gate = createGate(false);
		// What the window's accessibility help installs, once, after the window starts
		const installed = [...AccessibleViewRegistry.getImplementations()];
		change(ChatConfiguration.ChatViewSessionsListEnabled, true);
		const inList = { getValue: <T>(key: string) => ({ [FocusedViewContext.key]: ChatViewId, [InSessionsViewContext.key]: true } as Record<string, unknown>)[key] as T };
		const opens = installed.filter(help => help.type === AccessibleViewType.Help && help.when?.evaluate(inList)).sort((a, b) => b.priority - a.priority)[0]?.name;
		const registeredHelps = helps();
		gate.dispose();

		assert.deepStrictEqual({ registeredHelps, opens, afterDispose: helps() }, { registeredHelps: ['chatViewSessionsList', 'sessions-list-notification'], opens: 'chatViewSessionsList', afterDispose: before });
	});

	test('the list tells screen readers how to open its accessibility help while the Chat view\'s verbosity setting is on, following the setting and the keybindings', () => {
		const configuration = new TestConfigurationService({ [AccessibilityVerbositySettingId.Chat]: true });
		const keybindingsChanged = disposables.add(new Emitter<void>());
		let keybinding: string | undefined = 'Alt+F1';
		const keybindingService = upcastPartial<IKeybindingService>({
			lookupKeybinding: () => keybinding ? upcastPartial<ResolvedKeybinding>({ getAriaLabel: () => keybinding! }) : undefined,
			onDidUpdateKeybindings: keybindingsChanged.event,
		});
		const descriptions: (string | undefined)[] = [];
		const hint = trackChatViewSessionsListHelpHint({ setAriaDescription: description => descriptions.push(description) }, configuration, keybindingService);
		const setVerbosity = (value: boolean) => {
			configuration.setUserConfiguration(AccessibilityVerbositySettingId.Chat, value);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === AccessibilityVerbositySettingId.Chat }));
		};
		setVerbosity(false);
		setVerbosity(true);
		keybinding = 'Ctrl+K Ctrl+H';
		keybindingsChanged.fire();
		keybinding = undefined;
		keybindingsChanged.fire();
		hint.dispose();
		keybinding = 'Alt+F1';
		keybindingsChanged.fire();

		assert.deepStrictEqual(descriptions, [
			'Press Alt+F1 for accessibility help.',
			undefined,
			'Press Alt+F1 for accessibility help.',
			'Press Ctrl+K Ctrl+H for accessibility help.',
			undefined,
		]);
	});

	test('the accessibility help of the list helps in the sessions list of the Chat view, not on its Undo notice, elsewhere in the Chat view, nor in the Agents window, and returns focus to the list as it closes', () => {
		const focused: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ getViewWithId: () => null }));
		instantiationService.stub(ISessionsViewLocator, upcastPartial<ISessionsViewLocator>({ getEmbeddedView: () => upcastPartial<SessionsView>({ focus: () => { focused.push('list'); } }) }));
		const help = new ChatViewSessionsListAccessibilityHelp();
		const provider = disposables.add(instantiationService.invokeFunction(accessor => help.getProvider(accessor)));
		provider.onClose();

		const shows = (view: string, inList: boolean, sessionsWindow = false, noticeFocused = false) => help.when?.evaluate({
			getValue: <T>(key: string) => ({ [FocusedViewContext.key]: view, [InSessionsViewContext.key]: inList, [IsSessionsWindowContext.key]: sessionsWindow, [SessionsListNotificationFocused.key]: noticeFocused } as Record<string, unknown>)[key] as T,
		});
		assert.deepStrictEqual({
			inList: shows(ChatViewId, true),
			inChat: shows(ChatViewId, false),
			onUndoNotice: shows(ChatViewId, true, false, true),
			inAgentsWindow: shows(ChatViewId, true, true),
			inAgentsView: shows(SessionsViewId, false),
			verbosity: provider.verbositySettingKey,
			focused,
		}, {
			inList: true,
			inChat: false,
			onUndoNotice: false,
			inAgentsWindow: false,
			inAgentsView: false,
			verbosity: AccessibilityVerbositySettingId.Chat,
			focused: ['list'],
		});
	});

	test('follows the setting live: turning it on registers the sessions list, and turning it off registers none of it again, without a reload', () => {
		const before = registered();
		createGate(false);
		const toggle = (enabled: boolean) => {
			change(ChatConfiguration.ChatViewSessionsListEnabled, enabled);
			return { ...registered(), providers, runtimeHolds, sessionsOnlyKey: contextKeyService.getContextKeyValue('chatViewSessionsOnly') };
		};
		const off = { ...registered(), providers, runtimeHolds, sessionsOnlyKey: contextKeyService.getContextKeyValue('chatViewSessionsOnly') };
		const on = toggle(true);
		const offAgain = toggle(false);
		const onAgain = toggle(true);

		const offState = { ...before, providers: 0, runtimeHolds: 0 };
		const onState = { ...before, localChatDefault: false, providers: 1, runtimeHolds: 1, sessionsOnlyKey: false };
		// The context key, never set before it first turns on, is reset to its default as it turns off
		assert.deepStrictEqual({ off, on, offAgain, onAgain }, { off: { ...offState, sessionsOnlyKey: undefined }, on: onState, offAgain: { ...offState, sessionsOnlyKey: false }, onAgain: onState });
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

	test('registers nothing while the Agents view of #347688 is on too, which takes precedence; as it takes effect on restart, a change of it does not change the Chat view until then', () => {
		createGate(true, undefined, { 'chat.sessionsView.enabled': true });
		const whileAgentsView = [{ providers, runtimeHolds }];
		change('chat.sessionsView.enabled', false);
		whileAgentsView.push({ providers, runtimeHolds });
		createGate(true);
		const withoutAgentsView = [{ providers, runtimeHolds }];
		change('chat.sessionsView.enabled', true);
		withoutAgentsView.push({ providers, runtimeHolds });

		assert.deepStrictEqual({ whileAgentsView, withoutAgentsView }, {
			whileAgentsView: [{ providers: 0, runtimeHolds: 0 }, { providers: 0, runtimeHolds: 0 }],
			withoutAgentsView: [{ providers: 1, runtimeHolds: 1 }, { providers: 1, runtimeHolds: 1 }],
		});
	});

	test('the Agents view counts as it was when the window started, also once it changes before the Chat view\'s setting first turns on, and for observers created later', () => {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: false, 'chat.sessionsView.enabled': false });
		const environment = { isSessionsWindow: false };
		// The gate's observer, created and read as the window starts with both off
		const enabled = observeChatViewSessionsListEnabled(configurationService);
		const atStartup = enabled.get();
		// The Agents view turns on, which takes effect on restart: an observer created later still sees it off
		configurationService.setUserConfiguration('chat.sessionsView.enabled', true);
		const laterSurfacesAll = surfacesAllLocalAgentHostAgents(environment, configurationService);
		// Then the Chat view's sessions list turns on, which takes effect live
		configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsListEnabled, true);

		assert.deepStrictEqual({ atStartup, laterSurfacesAll, enabled: enabled.get(), laterEnabled: observeChatViewSessionsListEnabled(configurationService).get() }, {
			atStartup: false,
			laterSurfacesAll: false,
			enabled: true,
			laterEnabled: true,
		});
	});

	test('registers the actions of the list once the Chat view first shows', () => {
		const before = sessionItemMenuItems();
		const gate = createGate(true);

		viewVisibility.fire({ id: ChatViewId, visible: true });
		const afterShown = sessionItemMenuItems() > before;
		gate.dispose();

		assert.deepStrictEqual({ afterShown, afterDispose: sessionItemMenuItems() - before }, { afterShown: true, afterDispose: 0 });
	});

	test('surfaces every local agent host agent in a local editor window with the setting or the Agents view on, as the Agents window does, but not in a remote one', () => {
		const surfaces = (enabled: boolean, remoteAuthority?: string, isSessionsWindow = false, sessionsViewEnabled = false) =>
			surfacesAllLocalAgentHostAgents({ isSessionsWindow, remoteAuthority }, new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled, 'chat.sessionsView.enabled': sessionsViewEnabled }));

		assert.deepStrictEqual({
			local: surfaces(true),
			remote: surfaces(true, 'ssh-remote+host'),
			off: surfaces(false),
			agentsWindow: surfaces(false, undefined, true),
			agentsView: surfaces(false, undefined, false, true),
		}, { local: true, remote: false, off: false, agentsWindow: true, agentsView: true });
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
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
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

	test('the Chat view keeps its own chat input with the sessions list, for new chats and the chats it shows: the list provides only its control, header and sessions-only state', () => {
		const view = upcastPartial<SessionsView>({ element: document.createElement('div'), render: () => { }, setVisible: () => { }, dispose: () => { } });
		const workspaceContextService = upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) });
		const accessor = upcastPartial<ServicesAccessor>({ get: (<T>() => workspaceContextService as T) as ServicesAccessor['get'] });
		const instantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: ((fn: (accessor: ServicesAccessor) => unknown) => fn(accessor)) as IInstantiationService['invokeFunction'],
			createInstance: (() => view) as IInstantiationService['createInstance'],
		});
		const sessionsOnly = constObservable(false);
		const list = new ChatViewSessionsListProvider(sessionsOnly).create(document.createElement('div'), instantiationService, { overrideStyles: {} });
		disposables.add(list.control);

		assert.deepStrictEqual({ keys: Object.keys(list).sort(), hasHeader: list.hasHeader, sessionsOnly: list.sessionsOnly === sessionsOnly }, { keys: ['control', 'hasHeader', 'sessionsOnly'], hasHeader: true, sessionsOnly: true });
	});

	test('revealing the chat that the Chat view shows reveals its session, also for a peer chat of the session, whose resource differs from the session\'s', () => {
		const revealed: string[] = [];
		const view = upcastPartial<SessionsView>({ element: document.createElement('div'), render: () => { }, setVisible: () => { }, dispose: () => { }, sessionsControl: upcastPartial<SessionsList>({ reveal: (resource: URI) => { revealed.push(resource.path); return resource.path === '/session'; }, setAriaDescription: () => { } }) });
		const workspaceContextService = upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) });
		const session = upcastPartial<ISession>({ resource: URI.parse('agent-host-copilot:/session') });
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({ getSessionForChatResource: resource => resource.path === '/peer' ? { session, chat: upcastPartial<IChat>({ resource }) } : undefined });
		const accessor = upcastPartial<ServicesAccessor>({ get: (<T>(id: unknown) => (id === ISessionsManagementService ? sessionsManagementService : id === IConfigurationService ? new TestConfigurationService() : id === IKeybindingService ? upcastPartial<IKeybindingService>({ lookupKeybinding: () => undefined, onDidUpdateKeybindings: Event.None }) : workspaceContextService) as T) as ServicesAccessor['get'] });
		const instantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: ((fn: (accessor: ServicesAccessor) => unknown) => fn(accessor)) as IInstantiationService['invokeFunction'],
			createInstance: (() => view) as IInstantiationService['createInstance'],
		});
		const list = new ChatViewSessionsListProvider(constObservable(false)).create(document.createElement('div'), instantiationService, { overrideStyles: {} });
		disposables.add(list.control);

		const results = { peer: list.control.reveal(URI.parse('agent-host-copilot:/peer')), unknown: list.control.reveal(URI.parse('agent-host-copilot:/untitled')) };
		assert.deepStrictEqual({ results, revealed }, { results: { peer: true, unknown: false }, revealed: ['/session', '/untitled'] });
	});
});
