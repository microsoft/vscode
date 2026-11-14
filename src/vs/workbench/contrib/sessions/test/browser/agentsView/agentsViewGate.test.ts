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
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../../../../common/views.js';
import { ViewPaneContainer } from '../../../../../browser/parts/views/viewPaneContainer.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../services/panecomposite/browser/panecomposite.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { RemoteNameContext } from '../../../../../common/contextkeys.js';
import { ChatEntitlementContextKeys } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ChatViewContainerId } from '../../../../chat/browser/chat.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { IMultiDiffSourceResolverService } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { ChatConfiguration, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, surfacesAllLocalAgentHostAgents } from '../../../../chat/common/constants.js';
import { AgentsViewGate } from '../../../browser/agentsView/agentsViewGate.js';
import { Menus } from '../../../browser/menus.js';
import { SessionGroupToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { SessionsViewId } from '../../../browser/views/sessionsView.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';

/** How many items the context menu of a session has: the actions of the sessions list add theirs. */
function sessionItemMenuItems(): number {
	return MenuRegistry.getMenuItems(SessionItemContextMenuId).length;
}

suite('AgentsViewGate', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// The Agents window registers the Sessions view too, as other tests load it: set that registration aside meanwhile.
	// The Chat view container, where the Sessions view shows, is registered by the chat contributions: unless loaded, a stand-in.
	let agentsWindowView: { readonly view: IViewDescriptor; readonly container: ViewContainer } | undefined;
	let chatViewContainerStandIn: ViewContainer | undefined;
	setup(() => {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		if (!viewContainersRegistry.get(ChatViewContainerId)) {
			chatViewContainerStandIn = viewContainersRegistry.registerViewContainer({ id: ChatViewContainerId, title: { value: 'Chat', original: 'Chat' }, ctorDescriptor: new SyncDescriptor(ViewPaneContainer) }, ViewContainerLocation.AuxiliaryBar);
		}
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const view = viewsRegistry.getView(SessionsViewId);
		const container = viewsRegistry.getViewContainer(SessionsViewId);
		agentsWindowView = view && container ? { view, container } : undefined;
		if (agentsWindowView) {
			viewsRegistry.deregisterViews([agentsWindowView.view], agentsWindowView.container);
		}
	});
	teardown(() => {
		if (chatViewContainerStandIn) {
			Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).deregisterViewContainer(chatViewContainerStandIn);
			chatViewContainerStandIn = undefined;
		}
		if (agentsWindowView) {
			Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([agentsWindowView.view], agentsWindowView.container);
		}
	});

	let createdChatParts: number;
	let viewVisibility: Emitter<{ id: string; visible: boolean }>;

	/** Shows the Sessions view, as the user opens it. */
	function showSessionsView(): void {
		viewVisibility.fire({ id: SessionsViewId, visible: true });
	}

	let hosts: number;
	let hiddenParts: Parts[];
	let contextKeyService: IContextKeyService;
	/** Whether chat is installed: without it, chat needs setting up, which the Chat view offers. */
	let chatInstalled: IContextKey<boolean>;

	function createGate(enabled: boolean, remoteAuthority?: string, auxiliaryBar?: { visible: boolean; containers: string[] }, events?: { readonly partVisibility?: Event<IPartVisibilityChangeEvent>; readonly compositeClose?: Event<{ viewContainerLocation: ViewContainerLocation }>; readonly extensionsRegistered?: Promise<boolean> }, configuration?: Record<string, unknown>): AgentsViewGate {
		createdChatParts = 0;
		hosts = 0;
		hiddenParts = [];
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IAgentsChatPartFrame, new SyncDescriptor(class {
			constructor() {
				createdChatParts++;
			}
		})])));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled, [ChatConfiguration.AgentEnabled]: true, ...configuration }));
		viewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: viewVisibility.event, isViewVisible: () => false }));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({
			onDidChangePartVisibility: events?.partVisibility ?? Event.None,
			isVisible: (part: Parts) => part === Parts.AUXILIARYBAR_PART && !!auxiliaryBar?.visible,
			setPartHidden: (hidden: boolean, part: Parts) => {
				if (hidden) {
					hiddenParts.push(part);
					if (part === Parts.AUXILIARYBAR_PART && auxiliaryBar) {
						auxiliaryBar.visible = false;
					}
				}
			},
		}));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }));
		contextKeyService = disposables.add(new ContextKeyService(instantiationService.get(IConfigurationService)));
		// Where the Sessions view can show: a local window, with agents enabled and chat set up
		RemoteNameContext.bindTo(contextKeyService).set('');
		chatInstalled = ChatEntitlementContextKeys.Setup.installed.bindTo(contextKeyService);
		chatInstalled.set(true);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ registerHost: () => { hosts++; return toDisposable(() => hosts--); } }));
		instantiationService.stub(IPaneCompositePartService, upcastPartial<IPaneCompositePartService>({
			getVisiblePaneCompositeIds: () => auxiliaryBar?.containers ?? [],
			onDidPaneCompositeClose: (events?.compositeClose ?? Event.None) as IPaneCompositePartService['onDidPaneCompositeClose'],
		}));
		instantiationService.stub(IExtensionService, upcastPartial<IExtensionService>({ whenInstalledExtensionsRegistered: () => events?.extensionsRegistered ?? Promise.resolve(true) }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({}));
		instantiationService.stub(IMultiDiffSourceResolverService, upcastPartial<IMultiDiffSourceResolverService>({ registerResolver: () => ({ dispose: () => { } }) }));
		return disposables.add(instantiationService.createInstance(AgentsViewGate));
	}

	/** The view containers of its own, which it registers none of, and the Sessions view in the Chat view container. */
	function registered() {
		const containers = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).all.filter(container => container.id === 'workbench.view.agents').length;
		const chatViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(ChatViewContainerId);
		const view = chatViewContainer ? Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViews(chatViewContainer).find(view => view.id === SessionsViewId) : undefined;
		return { containers, view: view && { name: view.name.value, when: view.when?.serialize() } };
	}

	test('reads only its setting and registers nothing while the setting is off', () => {
		const reads: string[] = [];
		const configurationService = new class extends TestConfigurationService {
			override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
				reads.push(String(arg1));
				return super.getValue<T>(arg1, arg2);
			}
		}({ [ChatConfiguration.ChatViewSessionsListEnabled]: false });
		// Any use of the instantiation service fails: with the setting off, the gate creates and invokes nothing
		disposables.add(new AgentsViewGate(configurationService, upcastPartial<IInstantiationService>({})));

		assert.deepStrictEqual({ ...registered(), reads }, { containers: 0, view: undefined, reads: [ChatConfiguration.ChatViewSessionsListEnabled] });
	});

	test('registers the Sessions view in the Chat view container, no view container of its own, and not the actions of the list before it shows, while the setting is on', () => {
		const before = sessionItemMenuItems();
		const gate = createGate(true);
		const whileOn = { ...registered(), createdChatParts, listActionsBeforeShown: sessionItemMenuItems() - before };
		gate.dispose();

		assert.deepStrictEqual({ whileOn, afterDispose: registered() }, {
			whileOn: { containers: 0, view: { name: 'Sessions', when: 'chatAgentsViewActive' }, createdChatParts: 1, listActionsBeforeShown: 0 },
			afterDispose: { containers: 0, view: undefined },
		});
	});

	test('leaves the Chat view, and what shows it, while chat needs setting up, and replaces them once it is set up', () => {
		createGate(true);
		const state = () => ({ active: contextKeyService.getContextKeyValue(ChatContextKeys.agentsViewActive.key), hosts });
		const setUp = state();
		chatInstalled.set(false);
		const needsSetup = state();
		chatInstalled.set(true);

		assert.deepStrictEqual({ setUp, needsSetup, setUpAgain: state() }, {
			setUp: { active: true, hosts: 1 },
			needsSetup: { active: false, hosts: 0 },
			setUpAgain: { active: true, hosts: 1 },
		});
	});

	test('registers nothing while the Agents view of #347688 is on too, which takes precedence', () => {
		createGate(true, undefined, undefined, undefined, { 'chat.sessionsView.enabled': true });

		assert.deepStrictEqual({ active: contextKeyService.getContextKeyValue(ChatContextKeys.agentsViewActive.key), createdChatParts, view: registered().view }, { active: undefined, createdChatParts: 0, view: undefined });
	});

	test('registers the actions of the list once the Sessions view first shows', () => {
		const before = sessionItemMenuItems();
		const gate = createGate(true);

		showSessionsView();
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

	test('creates no chat part in a remote window', () => {
		createGate(true, 'ssh-remote+host');

		assert.deepStrictEqual({ createdChatParts }, { createdChatParts: 0 });
	});

	test('replaces the Chat view in a local window: it hides it, and what would show it shows the chat part', () => {
		const local = createGate(true);
		const localState = { active: contextKeyService.getContextKeyValue(ChatContextKeys.agentsViewActive.key), hosts };
		local.dispose();
		const afterDispose = { hosts };
		createGate(true, 'ssh-remote+host');
		const remoteState = { active: contextKeyService.getContextKeyValue(ChatContextKeys.agentsViewActive.key), hosts };

		assert.deepStrictEqual({ localState, afterDispose, remoteState }, {
			localState: { active: true, hosts: 1 },
			afterDispose: { hosts: 0 },
			remoteState: { active: undefined, hosts: 0 },
		});
	});

	test('offers no action of the Sessions view that opens the Agents window', () => {
		createGate(true);
		showSessionsView();

		const menus = [Menus.SidebarSessionsHeader, Menus.SessionsViewFilter, Menus.SessionItemToolbar, SessionItemContextMenuId, Menus.SessionChatItemContext, Menus.SessionChatItemToolbar, Menus.SessionSectionContext, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, MenuId.ViewTitle];
		const commands = menus.flatMap(menu => MenuRegistry.getMenuItems(menu)).filter(isIMenuItem).map(item => item.command.id);
		assert.deepStrictEqual(commands.filter(id => id === OPEN_AGENTS_WINDOW_COMMAND_ID || id === OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID), []);
	});
});
