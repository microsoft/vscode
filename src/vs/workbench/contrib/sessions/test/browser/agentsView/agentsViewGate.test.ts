/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer } from '../../../../../common/views.js';
import { ISessionsStorageService } from '../../../../../services/sessions/browser/sessionsStorageService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { ChatConfiguration, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../../../chat/common/constants.js';
import { AGENTS_VIEW_CONTAINER_ID, AgentsViewWhen } from '../../../browser/agentsView/agentsView.js';
import { AgentsViewGate } from '../../../browser/agentsView/agentsViewGate.js';
import { Menus } from '../../../browser/menus.js';
import { SessionGroupToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId } from '../../../browser/views/sessionsList.js';
import { SessionsViewId } from '../../../browser/views/sessionsView.js';

suite('AgentsViewGate', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let createdStorageServices: number;

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

	function createGate(enabled: boolean, remoteAuthority?: string): AgentsViewGate {
		createdStorageServices = 0;
		createdChatParts = 0;
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([ISessionsStorageService, new SyncDescriptor(class extends mock<IStorageService>() {
			constructor() {
				super();
				createdStorageServices++;
			}
		})], [IAgentsChatPartFrame, new SyncDescriptor(class {
			constructor() {
				createdChatParts++;
			}
		})])));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.AgentsViewEnabled]: enabled }));
		instantiationService.stub(IViewsService, { onDidChangeViewVisibility: Event.None });
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: Event.None, isVisible: () => false }));
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }));
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
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

	test('registers the Sessions view before the Explorer and starts loading its state while the setting is on', () => {
		const gate = createGate(true);

		const { container, view } = registered();
		assert.deepStrictEqual({
			title: container?.title,
			icon: container?.icon,
			order: container?.order,
			view: view?.id,
			when: view?.when?.serialize(),
			createdStorageServices,
			createdChatParts,
		}, {
			title: { value: 'Sessions', original: 'Sessions' },
			icon: Codicon.agent,
			order: -1,
			view: SessionsViewId,
			when: AgentsViewWhen.serialize(),
			createdStorageServices: 1,
			createdChatParts: 1,
		});

		gate.dispose();
		assert.deepStrictEqual(registered(), { container: undefined, view: undefined });
	});

	test('creates no chat part in a remote window', () => {
		createGate(true, 'ssh-remote+host');

		assert.deepStrictEqual({ createdChatParts }, { createdChatParts: 0 });
	});

	test('offers no action of the Sessions view that opens the Agents window', () => {
		createGate(true);

		const menus = [Menus.SidebarSessionsHeader, Menus.SessionsViewFilter, Menus.SessionItemToolbar, SessionItemContextMenuId, Menus.SessionChatItemContext, Menus.SessionChatItemToolbar, Menus.SessionSectionContext, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, MenuId.ViewTitle];
		const commands = menus.flatMap(menu => MenuRegistry.getMenuItems(menu)).filter(isIMenuItem).map(item => item.command.id);
		assert.deepStrictEqual(commands.filter(id => id === OPEN_AGENTS_WINDOW_COMMAND_ID || id === OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID), []);
	});
});
