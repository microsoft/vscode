/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, ViewContainerLocation, WindowEnablement } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { AgentsChatPartContribution } from './agentsChatPartContribution.js';
import { registerAgentsViewNewSessionActions } from './agentsChatPartActions.js';
import { AGENTS_VIEW_CONTAINER_ID } from './agentsView.js';
import { createEditorWindowSessionsScope, registerEditorWindowChatViewReplacement, registerEditorWindowSessionsList, registerEditorWindowSessionsViews } from './editorWindowSessionsList.js';

const AGENTS_VIEW_TITLE = localize2('agentsView.title', "Sessions");

/**
 * Shows the Sessions view of the Agents window in an editor window while {@link ChatConfiguration.SessionsViewEnabled} is on.
 * The setting is read once, as the window starts: with it off, this registers nothing and creates no service.
 */
export class AgentsViewGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsViewGate';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (configurationService.getValue<boolean>(ChatConfiguration.SessionsViewEnabled) !== true) {
			return;
		}

		const scoped = instantiationService.invokeFunction(accessor => createEditorWindowSessionsScope(this, accessor.get(IWorkspaceContextService)));
		this.registerView(scoped);
		this._register(registerEditorWindowSessionsList(instantiationService, registerAgentsViewNewSessionActions));

		instantiationService.invokeFunction(accessor => {
			// The chat part, where sessions open: not in remote windows, where the Sessions view does not show
			if (!accessor.get(IWorkbenchEnvironmentService).remoteAuthority) {
				// The chat part docks beside the Sessions view, wherever the user puts it
				const layoutService = accessor.get(IWorkbenchLayoutService);
				layoutService.setChatPartAnchor({ viewId: SessionsViewId });
				this._register(toDisposable(() => layoutService.setChatPartAnchor(undefined)));
				this._register(instantiationService.createInstance(AgentsChatPartContribution));
				this._register(registerEditorWindowChatViewReplacement(instantiationService));
			}
		});
	}

	private registerView(scoped: IObservable<boolean>): void {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const container = viewContainersRegistry.registerViewContainer({
			id: AGENTS_VIEW_CONTAINER_ID,
			title: AGENTS_VIEW_TITLE,
			icon: Codicon.agent,
			// Before the Explorer, until the user moves it: the activity bar keeps where it is from then on
			order: -1,
			// Its title shows the actions of the sessions header
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AGENTS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: AGENTS_VIEW_CONTAINER_ID,
			hideIfEmpty: true,
			windowEnablement: WindowEnablement.Editor,
		}, ViewContainerLocation.Sidebar);
		this._register(toDisposable(() => viewContainersRegistry.deregisterViewContainer(container)));
		this._register(registerEditorWindowSessionsViews(container, scoped));
	}
}
