/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentsViewFolderLocationService } from '../../../browser/agentsView/agentsViewFolderLocation.js';
import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
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
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../services/panecomposite/browser/panecomposite.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { CHAT_OPEN_ACTION_ID } from '../../../../chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { IMultiDiffSourceResolverService } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { ChatConfiguration, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, surfacesAllLocalAgentHostAgents } from '../../../../chat/common/constants.js';
import { AGENTS_VIEW_CONTAINER_ID, AGENTS_VIEW_SETUP_VIEW_ID, AgentsViewAvailable, AgentsViewWhen } from '../../../browser/agentsView/agentsView.js';
import { AgentsViewGate } from '../../../browser/agentsView/agentsViewGate.js';
import { Menus } from '../../../browser/menus.js';
import { SessionGroupToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { SessionsViewId } from '../../../browser/views/sessionsView.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';

/** How many items the context menu of a session has: the actions of the sessions list add theirs. */
function sessionItemMenuItems(): number {
	return MenuRegistry.getMenuItems(SessionItemContextMenuId).length;
}

const CHAT_CONTAINER = 'workbench.panel.chat';

suite('AgentsViewGate', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();


	// The Agents window registers the Sessions view too, as other tests load it: set that registration aside meanwhile.
	let agentsWindowView: { readonly view: IViewDescriptor; readonly container: ViewContainer } | undefined;
	setup(() => {
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const view = viewsRegistry.getView(SessionsViewId);
		const container = viewsRegistry.getViewContainer(SessionsViewId);
		agentsWindowView = view && container ? { view, container } : undefined;
		if (agentsWindowView) {
			viewsRegistry.deregisterViews([agentsWindowView.view], agentsWindowView.container);
		}
	});
	teardown(() => {
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

	let delegates: number;
	let hiddenParts: Parts[];
	let contextKeyService: MockContextKeyService;

	function createGate(enabled: boolean, remoteAuthority?: string, auxiliaryBar?: { visible: boolean; containers: string[] }, events?: { readonly partVisibility?: Event<IPartVisibilityChangeEvent>; readonly compositeClose?: Event<{ viewContainerLocation: ViewContainerLocation }>; readonly extensionsRegistered?: Promise<boolean> }): AgentsViewGate {
		createdChatParts = 0;
		delegates = 0;
		hiddenParts = [];
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IAgentsChatPartFrame, new SyncDescriptor(class {
			constructor() {
				createdChatParts++;
			}
		})])));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.AgentsViewEnabled]: enabled }));
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
		contextKeyService = new MockContextKeyService();
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IAgentsViewFolderLocationService, upcastPartial<IAgentsViewFolderLocationService>({ start: () => { }, switchToSession: async () => { } }));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ setChatViewHostDelegate: () => { delegates++; return toDisposable(() => delegates--); } }));
		instantiationService.stub(IPaneCompositePartService, upcastPartial<IPaneCompositePartService>({
			getVisiblePaneCompositeIds: () => auxiliaryBar?.containers ?? [],
			onDidPaneCompositeClose: (events?.compositeClose ?? Event.None) as IPaneCompositePartService['onDidPaneCompositeClose'],
		}));
		instantiationService.stub(IExtensionService, upcastPartial<IExtensionService>({ whenInstalledExtensionsRegistered: () => events?.extensionsRegistered ?? Promise.resolve(true) }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({}));
		instantiationService.stub(IMultiDiffSourceResolverService, upcastPartial<IMultiDiffSourceResolverService>({ registerResolver: () => ({ dispose: () => { } }) }));
		return disposables.add(instantiationService.createInstance(AgentsViewGate));
	}

	function registered() {
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(AGENTS_VIEW_CONTAINER_ID);
		const view = container ? Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViews(container).find(view => view.id === SessionsViewId) : undefined;
		return { container, view };
	}

	test('reads only its setting and registers nothing while the setting is off', () => {
		const reads: string[] = [];
		const configurationService = new class extends TestConfigurationService {
			override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
				reads.push(String(arg1));
				return super.getValue<T>(arg1, arg2);
			}
		}({ [ChatConfiguration.AgentsViewEnabled]: false });
		// Any use of the instantiation service fails: with the setting off, the gate creates and invokes nothing
		disposables.add(new AgentsViewGate(configurationService, upcastPartial<IInstantiationService>({})));

		assert.deepStrictEqual({ ...registered(), reads }, { container: undefined, view: undefined, reads: [ChatConfiguration.AgentsViewEnabled] });
	});

	test('registers the Sessions view before the Explorer, without registering its actions, while the setting is on', () => {
		const before = sessionItemMenuItems();
		const gate = createGate(true);
		const listActionsBeforeShown = sessionItemMenuItems() - before;

		const { container, view } = registered();
		assert.deepStrictEqual({
			title: container?.title,
			icon: container?.icon,
			order: container?.order,
			view: view?.id,
			when: view?.when?.serialize(),
			createdChatParts,
			listActionsBeforeShown,
		}, {
			title: { value: 'Sessions', original: 'Sessions' },
			icon: Codicon.agent,
			order: -1,
			view: SessionsViewId,
			when: AgentsViewWhen.serialize(),
			createdChatParts: 1,
			listActionsBeforeShown: 0,
		});

		gate.dispose();
		assert.deepStrictEqual(registered(), { container: undefined, view: undefined });
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
			surfacesAllLocalAgentHostAgents({ isSessionsWindow, remoteAuthority }, new TestConfigurationService({ [ChatConfiguration.AgentsViewEnabled]: enabled }));

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

	test('replaces the Chat view in a local window: it hides it, its keys and what would show it show the chat part', () => {
		const chatViewKeys = () => KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === CHAT_OPEN_ACTION_ID && rule.when?.serialize() === ContextKeyExpr.and(ChatContextKeys.agentsViewActive, AgentsViewAvailable)?.serialize()).length;
		const local = createGate(true);
		const localState = { active: contextKeyService.getContextKeyValue(ChatContextKeys.agentsViewActive.key), delegates, chatViewKeys: chatViewKeys() };
		local.dispose();
		const afterDispose = { delegates, chatViewKeys: chatViewKeys() };
		createGate(true, 'ssh-remote+host');
		const remoteState = { active: contextKeyService.getContextKeyValue(ChatContextKeys.agentsViewActive.key), delegates, chatViewKeys: chatViewKeys() };

		assert.deepStrictEqual({ localState, afterDispose, remoteState }, {
			localState: { active: true, delegates: 1, chatViewKeys: 1 },
			afterDispose: { delegates: 0, chatViewKeys: 0 },
			remoteState: { active: undefined, delegates: 0, chatViewKeys: 0 },
		});
	});

	test('its keys open the chat part only while chat shows: not with AI features off', () => {
		createGate(true);
		const rule = KeybindingsRegistry.getDefaultKeybindings().find(rule => rule.command === CHAT_OPEN_ACTION_ID && rule.when?.keys().includes(ChatContextKeys.agentsViewActive.key));
		const claims = (values: Record<string, unknown>) => !!rule?.when?.evaluate({ getValue: <T>(key: string) => ({ chatAgentsViewActive: true, 'config.chat.agent.enabled': true, remoteName: '', ...values })[key] as T });

		assert.deepStrictEqual({ available: claims({}), aiOff: claims({ chatSetupHidden: true }), disabledInWorkspace: claims({ chatSetupDisabledInWorkspace: true }) }, { available: true, aiOff: false, disabledInWorkspace: false });
	});

	test('hides the Secondary Side Bar whenever, without the Chat view, it would show nothing: once extensions registered their containers, and as it shows again', () => runWithFakedTimers({}, async () => {
		// Before extensions registered, the bar of its containers still shows the Chat view's
		const auxiliaryBar = { visible: true, containers: [CHAT_CONTAINER] };
		const partVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const compositeClose = disposables.add(new Emitter<{ viewContainerLocation: ViewContainerLocation }>());
		const extensionsRegistered = new DeferredPromise<boolean>();
		createGate(true, undefined, auxiliaryBar, { partVisibility: partVisibility.event, compositeClose: compositeClose.event, extensionsRegistered: extensionsRegistered.p });
		await timeout(10);
		const beforeExtensions = [...hiddenParts];
		auxiliaryBar.containers = [];
		await extensionsRegistered.complete(true);
		await timeout(10);
		const afterExtensions = [...hiddenParts];
		// Its toggle shows it again, with nothing to show
		auxiliaryBar.visible = true;
		partVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await timeout(10);
		const shownAgain = [...hiddenParts];
		// A container shows in it, then closes
		auxiliaryBar.visible = true;
		auxiliaryBar.containers = ['workbench.view.extension.other'];
		partVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await timeout(10);
		const withOther = [...hiddenParts];
		auxiliaryBar.containers = [];
		compositeClose.fire({ viewContainerLocation: ViewContainerLocation.AuxiliaryBar });
		await timeout(10);

		assert.deepStrictEqual({ beforeExtensions, afterExtensions, shownAgain, withOther, closed: hiddenParts }, {
			beforeExtensions: [],
			afterExtensions: [Parts.AUXILIARYBAR_PART],
			shownAgain: [Parts.AUXILIARYBAR_PART, Parts.AUXILIARYBAR_PART],
			withOther: [Parts.AUXILIARYBAR_PART, Parts.AUXILIARYBAR_PART],
			closed: [Parts.AUXILIARYBAR_PART, Parts.AUXILIARYBAR_PART, Parts.AUXILIARYBAR_PART],
		});
	}));

	test('shows how to sign in instead of the sessions while chat needs it, and the sessions otherwise', () => {
		createGate(true);
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(AGENTS_VIEW_CONTAINER_ID)!;
		const views = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getViews(container);
		const shown = (values: Record<string, unknown>) => views.filter(view => view.when?.evaluate({ getValue: <T>(key: string) => ({ 'config.chat.agent.enabled': true, remoteName: '', chatSetupInstalled: true, ...values })[key] as T })).map(view => view.id);

		assert.deepStrictEqual({
			signedIn: shown({}),
			signedOut: shown({ chatEntitlementSignedOut: true }),
			notInstalled: shown({ chatSetupInstalled: false }),
			anonymous: shown({ chatEntitlementSignedOut: true, chatAnonymous: true }),
		}, {
			signedIn: [SessionsViewId],
			signedOut: [AGENTS_VIEW_SETUP_VIEW_ID],
			notInstalled: [AGENTS_VIEW_SETUP_VIEW_ID],
			anonymous: [SessionsViewId],
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
