/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../../base/common/async.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../../../../common/views.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { FindAgentSessionInViewerAction, RefreshAgentSessionsViewerAction } from '../../../../chat/browser/agentSessions/agentSessionsActions.js';
import { ChatViewPane } from '../../../../chat/browser/widgetHosts/viewPane/chatViewPane.js';
import { ChatViewContainerId, ChatViewId, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../chat/browser/chatViewHost.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { EditorWindowMainSessionHost } from '../../../browser/agentsView/editorWindowMainSessionHost.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ChatConfiguration, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, surfacesAllLocalAgentHostAgents } from '../../../../chat/common/constants.js';
import { IMultiDiffSourceResolverService } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { ChatViewSessionsGate } from '../../../browser/agentsView/chatViewSessionsGate.js';
import { IChatViewSessionsListService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { Menus } from '../../../browser/menus.js';
import { SessionGroupToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';

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

	let createdChatParts: number;
	let hosts: number;
	/** The sessions lists given to the Chat view. */
	let providers: number;
	let chatPartAnchor: string | undefined;
	let contextKeyService: MockContextKeyService;
	/** Whether the chat part shows, as the window restored it. */
	let chatPartVisible: boolean;
	let configurationService: TestConfigurationService;
	let viewVisibility: Emitter<{ id: string; visible: boolean }>;

	function createGate(enabled: boolean, remoteAuthority?: string, configuration?: Record<string, unknown>, stub?: (instantiationService: TestInstantiationService) => void): ChatViewSessionsGate {
		createdChatParts = 0;
		hosts = 0;
		providers = 0;
		chatPartAnchor = undefined;
		chatPartVisible ??= false;
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IAgentsChatPartFrame, new SyncDescriptor(class {
			constructor() {
				createdChatParts++;
			}
		})])));
		configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled, ...configuration });
		instantiationService.stub(IConfigurationService, configurationService);
		viewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: viewVisibility.event, isViewVisible: () => false }));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({
			onDidChangePartVisibility: Event.None,
			isVisible: part => part === Parts.CHAT_PART && chatPartVisible,
			setPartHidden: (hidden, part) => {
				if (part === Parts.CHAT_PART) {
					chatPartVisible = !hidden;
				}
			},
			setChatPartAnchor: anchor => chatPartAnchor = anchor?.viewId,
		}));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }));
		// Where the chat part can show, such as with chat set up
		contextKeyService = new class extends MockContextKeyService { override contextMatchesRules(): boolean { return true; } }();
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IChatViewSessionsListService, upcastPartial<IChatViewSessionsListService>({ registerProvider: () => { providers++; return toDisposable(() => providers--); } }));
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ registerHost: () => { hosts++; return toDisposable(() => hosts--); } }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) }));
		instantiationService.stub(IMultiDiffSourceResolverService, upcastPartial<IMultiDiffSourceResolverService>({ registerResolver: () => ({ dispose: () => { } }) }));
		// What the chat of the Chat view, and its host, take
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({}));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({}));
		instantiationService.stub(IAgentsChatPartService, upcastPartial<IAgentsChatPartService>({ restore: async () => { } }));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({}));
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

	test('gives the Chat view its sessions list, without local chats by default and with the chat part docked beside it, and the actions of the list only once it shows, while the setting is on', () => {
		const before = registered();
		const listActionsBefore = sessionItemMenuItems();
		const gate = createGate(true);
		const whileOn = { ...registered(), providers, hosts, chatPartAnchor, createdChatParts, listActionsBeforeShown: sessionItemMenuItems() - listActionsBefore };
		gate.dispose();

		assert.deepStrictEqual({ whileOn, afterDispose: { ...registered(), providers, hosts, chatPartAnchor } }, {
			// The Chat view shows the chats itself: no host replaces it
			whileOn: { ...before, localChatDefault: false, providers: 1, hosts: 0, chatPartAnchor: ChatViewId, createdChatParts: 1, listActionsBeforeShown: 0 },
			afterDispose: { ...before, providers: 0, hosts: 0, chatPartAnchor: undefined },
		});
	});

	test('the chats open in the chat part, through a host that replaces the Chat view, only while chat.viewSessions.openInChatPart is on', () => {
		createGate(true, undefined, { [ChatConfiguration.ChatViewSessionsOpenInChatPart]: true });
		const inChatPart = hosts;
		configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));

		assert.deepStrictEqual({ inChatPart, inView: hosts }, { inChatPart: 1, inView: 0 });
	});

	test('hides the chat part, also as the window restores it shown, while the chats open in the Chat view, and as they stop opening in the chat part', async () => {
		const shown = async (openInChatPart: boolean) => {
			chatPartVisible = true;
			const gate = createGate(true, undefined, { [ChatConfiguration.ChatViewSessionsOpenInChatPart]: openInChatPart });
			// As the window is ready and restored
			await timeout(0);
			return { gate, visible: chatPartVisible };
		};
		const inViewGate = await shown(false);
		inViewGate.gate.dispose();
		const inView = inViewGate.visible;
		const inChatPart = (await shown(true)).visible;
		// The chats open in the Chat view again
		configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));

		assert.deepStrictEqual({ inView, inChatPart, afterSwitchingToView: chatPartVisible }, { inView: false, inChatPart: true, afterSwitchingToView: false });
	});

	test('registers nothing while the Agents view of #347688 is on too, which takes precedence', () => {
		createGate(true, undefined, { 'chat.sessionsView.enabled': true });

		assert.deepStrictEqual({ providers, hosts, createdChatParts }, { providers: 0, hosts: 0, createdChatParts: 0 });
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

		assert.deepStrictEqual({ providers, hosts, createdChatParts, localChatDefault: registered().localChatDefault }, { providers: 0, hosts: 0, createdChatParts: 0, localChatDefault: before.localChatDefault });
	});

	test('the chat that the Chat view shows is the chat of the window, marked read while it shows, while the chats open in the Chat view, and the chat part\'s otherwise', () => {
		const marked: string[] = [];
		const createSession = (id: string) => {
			const chat = upcastPartial<IChat>({ resource: URI.parse(`agent-host-copilot:/${id}`), isRead: observableValue(`${id}.isRead`, false), updatedAt: constObservable(new Date(1)) });
			return upcastPartial<ISession>({ sessionId: id, mainChat: constObservable(chat), loading: constObservable(false), status: constObservable(SessionStatus.Completed) });
		};
		const inView = createSession('inView');
		const inChatPart = createSession('inChatPart');
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined);
		let mainHost: EditorWindowMainSessionHost | undefined;
		createGate(true, undefined, { [ChatConfiguration.ChatViewSessionsOpenInChatPart]: false }, instantiationService => {
			instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: viewVisibility.event, isViewVisible: id => id === ChatViewId }));
			instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
			instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ shownSession, registerHost: () => { hosts++; return toDisposable(() => hosts--); } }));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				onDidChangeSessions: Event.None,
				getSessionForChatResource: resource => [inView, inChatPart].map(session => ({ session, chat: session.mainChat.get() })).find(shown => extUri.isEqual(shown.chat.resource, resource)),
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
		const setOpenInChatPart = (value: boolean) => {
			configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, value);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		};
		setOpenInChatPart(true);
		steps.inChatPart = mainHost!.session.get()?.sessionId;
		setOpenInChatPart(false);
		steps.backInView = mainHost!.session.get()?.sessionId;

		assert.deepStrictEqual({ steps, marked }, { steps: { inView: 'inView', inChatPart: 'inChatPart', backInView: 'inView' }, marked: ['inView'] });
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
});
