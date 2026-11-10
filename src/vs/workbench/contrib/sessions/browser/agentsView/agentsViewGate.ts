/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, WindowEnablement } from '../../../../common/views.js';
import { ISessionsStorageService } from '../../../../services/sessions/browser/sessionsStorageService.js';
import { registerSessionsListActions, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { ISessionsViewOptions, SessionsView, SessionsViewId } from '../views/sessionsView.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { AGENTS_VIEW_CONTAINER_ID, AgentsViewWhen } from './agentsView.js';

const AGENTS_VIEW_TITLE = localize2('agentsView.title', "Sessions");

/** The container of the Sessions view in an editor window, whose title shows the actions of the sessions header. */
class AgentsViewPaneContainer extends ViewPaneContainer {
	protected override createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewPane {
		const sessionsViewOptions: IViewletViewOptions & ISessionsViewOptions = { ...options, headerInTitle: true, showCustomizations: false };
		return super.createView(viewDescriptor, sessionsViewOptions);
	}
}

/**
 * Shows the Sessions view of the Agents window in an editor window while {@link ChatConfiguration.AgentsViewEnabled} is on.
 * The setting is read once, as the window starts: with it off, this registers nothing and creates no service.
 */
export class AgentsViewGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsViewGate';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (configurationService.getValue<boolean>(ChatConfiguration.AgentsViewEnabled) !== true) {
			return;
		}

		this.registerView();
		this._register(registerSessionsListActions());
		this._register(instantiationService.createInstance(SessionsArchiveActionsContribution));

		// Starts loading the state the list shares with the Agents window, so that the view shows once it has
		instantiationService.invokeFunction(accessor => accessor.get(ISessionsStorageService));
	}

	private registerView(): void {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const container = viewContainersRegistry.registerViewContainer({
			id: AGENTS_VIEW_CONTAINER_ID,
			title: AGENTS_VIEW_TITLE,
			icon: Codicon.agent,
			// Before the Explorer, until the user moves it: the activity bar keeps where it is from then on
			order: -1,
			ctorDescriptor: new SyncDescriptor(AgentsViewPaneContainer, [AGENTS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: AGENTS_VIEW_CONTAINER_ID,
			hideIfEmpty: true,
			windowEnablement: WindowEnablement.Editor,
		}, ViewContainerLocation.Sidebar);
		this._register(toDisposable(() => viewContainersRegistry.deregisterViewContainer(container)));

		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const view: IViewDescriptor = {
			id: SessionsViewId,
			name: AGENTS_VIEW_TITLE,
			containerIcon: Codicon.agent,
			containerTitle: AGENTS_VIEW_TITLE.value,
			singleViewPaneContainerTitle: AGENTS_VIEW_TITLE.value,
			ctorDescriptor: new SyncDescriptor(SessionsView),
			canToggleVisibility: false,
			canMoveView: false,
			when: AgentsViewWhen,
			windowEnablement: WindowEnablement.Editor,
		};
		viewsRegistry.registerViews([view], container);
		this._register(toDisposable(() => viewsRegistry.deregisterViews([view], container)));
	}
}
