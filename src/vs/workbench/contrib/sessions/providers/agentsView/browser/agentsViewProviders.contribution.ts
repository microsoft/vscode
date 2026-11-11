/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
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
 * Registers the sessions providers of the Sessions view of an editor window when that view or the chat part first shows, while
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

		const { viewsService, layoutService, lifecycleService } = instantiationService.invokeFunction(accessor => ({
			viewsService: accessor.get(IViewsService),
			layoutService: accessor.get(IWorkbenchLayoutService),
			lifecycleService: accessor.get(ILifecycleService),
		}));
		// Once the Sessions view or the chat part, which shows sessions too, first shows
		const firstShown = this._register(new DisposableStore());
		const register = () => {
			if (!firstShown.isDisposed) {
				firstShown.dispose();
				this._register(instantiationService.invokeFunction(registerAgentsViewProviders));
			}
		};
		firstShown.add(viewsService.onDidChangeViewVisibility(e => {
			if (e.id === SessionsViewId && e.visible) {
				register();
			}
		}));
		firstShown.add(layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.CHAT_PART && e.visible) {
				register();
			}
		}));
		// The chat part restores shown with the window, without a change of its visibility
		void lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (layoutService.isVisible(Parts.CHAT_PART)) {
				register();
			}
		});
	}
}

registerSingleton(IDevContainerAgentHostService, DevContainerAgentHostService, InstantiationType.Delayed);
registerWorkbenchContribution2(AgentsViewProvidersContribution.ID, AgentsViewProvidersContribution, WorkbenchPhase.BlockStartup);
