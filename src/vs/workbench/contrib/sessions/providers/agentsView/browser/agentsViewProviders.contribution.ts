/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { IDevContainerAgentHostService } from '../../../common/devContainerAgentHostService.js';
import { SessionsViewId } from '../../../browser/views/sessionsView.js';
import { registerLocalAgentHostSessionsProvider } from '../../agentHost/browser/localAgentHostSessionsProviderRegistration.js';
import { registerCopilotChatSessionsProviders } from '../../copilotChatSessions/browser/copilotChatSessionsProvidersRegistration.js';
import { DevContainerAgentHostService } from '../../remoteAgentHost/browser/devContainerAgentHostService.js';

/**
 * Registers the sessions providers whose sessions the Sessions view of an editor window lists: those of the local agent
 * host, on desktop, and those of Copilot Cloud.
 */
function registerAgentsViewProviders(accessor: ServicesAccessor): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);
	const disposables = new DisposableStore();
	if (!isWeb) {
		disposables.add(instantiationService.invokeFunction(registerLocalAgentHostSessionsProvider));
	}
	disposables.add(instantiationService.invokeFunction(registerCopilotChatSessionsProviders));
	return disposables;
}

/**
 * Registers the sessions providers of the Sessions view of an editor window when that view first shows, while
 * {@link ChatConfiguration.AgentsViewEnabled} is on. The setting is read once, as the window starts: with it off, this
 * does nothing else.
 */
export class AgentsViewProvidersContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsViewProviders';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (configurationService.getValue<boolean>(ChatConfiguration.AgentsViewEnabled) !== true) {
			return;
		}

		const viewsService = instantiationService.invokeFunction(accessor => accessor.get(IViewsService));
		const whenFirstShown = Event.once(Event.filter(viewsService.onDidChangeViewVisibility, e => e.id === SessionsViewId && e.visible));
		this._register(whenFirstShown(() => {
			this._register(instantiationService.invokeFunction(registerAgentsViewProviders));
		}));
	}
}

registerSingleton(IDevContainerAgentHostService, DevContainerAgentHostService, InstantiationType.Delayed);
registerWorkbenchContribution2(AgentsViewProvidersContribution.ID, AgentsViewProvidersContribution, WorkbenchPhase.BlockStartup);
