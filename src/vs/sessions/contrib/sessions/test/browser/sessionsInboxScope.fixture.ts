/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { SessionsInboxScope } from '../../../../../workbench/contrib/sessions/browser/views/sessionsInboxScope.js';
import { getInboxWorkspaceFilter, SessionsListFilters } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListFilters.js';
import { buildTestSession } from '../../../../../workbench/contrib/sessions/test/common/testSessionBuilder.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import '../../../../../workbench/contrib/sessions/browser/media/sessionsViewPane.css';

function renderScope({ container, disposableStore, theme }: ComponentFixtureContext, options: { selected?: boolean; disconnected?: boolean; unavailable?: boolean; width?: number; picker?: 'workspace' | 'environment' } = {}): void {
	const width = options.width ?? 340;
	const canvasWidth = options.picker ? 960 : width;
	container.style.width = `${canvasWidth}px`;
	if (options.picker) {
		container.style.height = '240px';
	}
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	const pane = append(container, $('.agent-sessions-viewpane'));
	pane.style.width = `${width}px`;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.define(IContextViewService, ContextViewService);
			reg.define(IActionWidgetService, ActionWidgetService);
			reg.defineInstance(ILayoutService, new class extends TestLayoutService {
				override mainContainer = container;
				override activeContainer = container;
				override containers = [container];
				override mainContainerDimension = { width: canvasWidth, height: 400 };
				override activeContainerDimension = this.mainContainerDimension;
				override getContainer() { return container; }
			}());
		},
	});
	const session = buildTestSession({
		id: 'workspace', title: 'Review navigation', workspace: 'agent-host-protocol-and-workbench-navigation', environment: 'ssh:work',
	}).session;
	const environment = { id: 'ssh:work', label: 'Development Workstation', isConnected: constObservable(!options.disconnected) };
	const filters = disposableStore.add(instantiationService.createInstance(SessionsListFilters));
	if (options.selected) {
		filters.setInboxEnvironment(environment);
		filters.setInboxWorkspace(getInboxWorkspaceFilter(session));
	}
	const scope = disposableStore.add(instantiationService.createInstance(SessionsInboxScope, pane, filters,
		constObservable(options.unavailable ? [] : [session]), constObservable(options.unavailable ? [] : [environment])));
	if (options.picker) {
		scope.element.querySelector<HTMLElement>(`.${options.picker}-picker .action-label`)!.click();
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	All: defineComponentFixture({ render: context => renderScope(context), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	Selected: defineComponentFixture({ render: context => renderScope(context, { selected: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	Disconnected: defineComponentFixture({ render: context => renderScope(context, { selected: true, disconnected: true }) }),
	Unavailable: defineComponentFixture({ render: context => renderScope(context, { selected: true, unavailable: true }) }),
	Narrow: defineComponentFixture({ render: context => renderScope(context, { selected: true, width: 220 }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	WorkspaceDropdown: defineComponentFixture({ render: context => renderScope(context, { selected: true, width: 480, picker: 'workspace' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	EnvironmentDropdown: defineComponentFixture({ render: context => renderScope(context, { selected: true, picker: 'environment' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
});
