/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
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
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
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

/** How long the providers stay registered after neither the Sessions view nor the chat part shows, in case either shows again. */
export const AGENTS_VIEW_PROVIDERS_RELEASE_DELAY = 60_000;

/**
 * Registers the sessions providers of the Sessions view of an editor window while that view or the chat part, which shows
 * sessions too, shows, while {@link ChatConfiguration.AgentsViewEnabled} is on. The setting is read once, as the window
 * starts: with it off, this does nothing else.
 *
 * Once neither shows, it releases them after {@link AGENTS_VIEW_PROVIDERS_RELEASE_DELAY}, so the window stops following the
 * sessions of the agent host, and registers them again as either shows. The chats of the chat part's tabs then find their
 * sessions again, as a provider going away hides its sessions without removing them. A new-session composer of the chat part
 * holds them, as its draft session is its provider's: one with nothing typed or attached closes then, and one with input
 * holds them until it is sent or closed.
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

		const { viewsService, layoutService, lifecycleService, chatPartService } = instantiationService.invokeFunction(accessor => ({
			viewsService: accessor.get(IViewsService),
			layoutService: accessor.get(IWorkbenchLayoutService),
			lifecycleService: accessor.get(ILifecycleService),
			chatPartService: accessor.get(IAgentsChatPartService),
		}));
		const registration = this._register(new MutableDisposable());
		const release = this._register(new MutableDisposable());
		const isShown = () => viewsService.isViewVisible(SessionsViewId) || layoutService.isVisible(Parts.CHAT_PART);
		const releaseLater = () => {
			release.value = disposableTimeout(() => {
				if (isShown()) {
					release.clear();
					return;
				}
				// A composer the user left without typing anything goes, so the providers can go too
				chatPartService.closeIdleComposers();
				if (chatPartService.hasComposer()) {
					releaseLater();
				} else {
					release.clear();
					registration.clear();
				}
			}, AGENTS_VIEW_PROVIDERS_RELEASE_DELAY);
		};
		const update = () => {
			if (isShown()) {
				release.clear();
				registration.value ??= instantiationService.invokeFunction(registerAgentsViewProviders);
			} else if (registration.value && !release.value) {
				releaseLater();
			}
		};
		this._register(viewsService.onDidChangeViewVisibility(e => {
			if (e.id === SessionsViewId) {
				update();
			}
		}));
		this._register(layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.CHAT_PART) {
				update();
			}
		}));
		// The chat part restores shown with the window, without a change of its visibility
		void lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (!this._store.isDisposed) {
				update();
			}
		});
	}
}

registerSingleton(IDevContainerAgentHostService, DevContainerAgentHostService, InstantiationType.Delayed);
registerWorkbenchContribution2(AgentsViewProvidersContribution.ID, AgentsViewProvidersContribution, WorkbenchPhase.BlockStartup);
