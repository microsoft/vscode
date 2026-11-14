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
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../services/panecomposite/browser/panecomposite.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
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

	let hosts: number;
	let hiddenParts: Parts[];
	let contextKeyService: MockContextKeyService;

	function createGate(enabled: boolean, remoteAuthority?: string, auxiliaryBar?: { visible: boolean; containers: string[] }, events?: { readonly partVisibility?: Event<IPartVisibilityChangeEvent>; readonly compositeClose?: Event<{ viewContainerLocation: ViewContainerLocation }>; readonly extensionsRegistered?: Promise<boolean> }, configuration?: Record<string, unknown>): AgentsViewGate {
		createdChatParts = 0;
		hosts = 0;
		hiddenParts = [];
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IAgentsChatPartFrame, new SyncDescriptor(class {
			constructor() {
				createdChatParts++;
			}
		})])));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled, ...configuration }));
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

	function registered() {
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get('workbench.view.agents');
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
		}({ [ChatConfiguration.ChatViewSessionsListEnabled]: false });
		// Any use of the instantiation service fails: with the setting off, the gate creates and invokes nothing
		disposables.add(new AgentsViewGate(configurationService, upcastPartial<IInstantiationService>({})));

		assert.deepStrictEqual({ ...registered(), reads }, { container: undefined, view: undefined, reads: [ChatConfiguration.ChatViewSessionsListEnabled] });
	});

	test('registers no view container of its own, and not the actions of the list before it shows, while the setting is on', () => {
		const before = sessionItemMenuItems();
		const gate = createGate(true);

		assert.deepStrictEqual({ ...registered(), createdChatParts, listActionsBeforeShown: sessionItemMenuItems() - before }, { container: undefined, view: undefined, createdChatParts: 1, listActionsBeforeShown: 0 });
		gate.dispose();
	});

	test('registers nothing while the Agents view of #347688 is on too, which takes precedence', () => {
		createGate(true, undefined, undefined, undefined, { 'chat.sessionsView.enabled': true });

		assert.deepStrictEqual({ active: contextKeyService.getContextKeyValue(ChatContextKeys.agentsViewActive.key), createdChatParts }, { active: undefined, createdChatParts: 0 });
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
