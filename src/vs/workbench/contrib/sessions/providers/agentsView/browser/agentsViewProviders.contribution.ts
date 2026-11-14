/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { isChatViewSessionsListEnabled } from '../../../../chat/common/constants.js';
import { IDevContainerAgentHostService } from '../../../common/devContainerAgentHostService.js';
import { SessionsViewId } from '../../../browser/views/sessionsView.js';
import { ChatViewId } from '../../../../chat/browser/chat.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { registerLocalAgentHostSessionsProvider } from '../../agentHost/browser/localAgentHostSessionsProviderRegistration.js';
import { registerCopilotChatSessionsProviders } from '../../copilotChatSessions/browser/copilotChatSessionsProvidersRegistration.js';
import { registerAgentsViewComposerControls } from './agentsViewComposerControls.js';
import { DevContainerAgentHostService } from '../../remoteAgentHost/browser/devContainerAgentHostService.js';

/**
 * Registers the sessions providers whose sessions the Sessions view of an editor window lists: those of the local agent
 * host, on desktop, and those of Copilot Cloud. As every provider of the window, they list only the sessions of its
 * folders (see `EditorWindowSessionsProvidersService`). The pickers of the chat part's composers and session chats,
 * which act on the sessions of these providers, come and go with them.
 */
function registerAgentsViewProviders(accessor: ServicesAccessor): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);
	const disposables = new DisposableStore();
	disposables.add(instantiationService.invokeFunction(registerAgentsViewComposerControls));
	if (!isWeb) {
		disposables.add(instantiationService.invokeFunction(registerLocalAgentHostSessionsProvider));
	}
	disposables.add(instantiationService.invokeFunction(registerCopilotChatSessionsProviders));
	return disposables;
}

/** How long the providers stay registered once nothing holds them, such as after neither the Sessions view nor the chat part shows. */
export const AGENTS_VIEW_PROVIDERS_RELEASE_DELAY = 60_000;

/**
 * Registers the sessions providers of the Sessions view of an editor window while something holds them, and releases them
 * {@link AGENTS_VIEW_PROVIDERS_RELEASE_DELAY} after nothing does, so the window stops following the sessions of the agent
 * host. The chats of the chat part's tabs find their sessions again once the providers return, as a provider going away
 * hides its sessions without removing them.
 *
 * A new-session composer of the chat part holds them too, as its draft session is its provider's: one with nothing typed or
 * attached closes as they are released, and one with input holds them until it is sent or closed.
 */
export class AgentsViewProvidersService extends Disposable implements IAgentsViewProvidersService {

	declare readonly _serviceBrand: undefined;

	private _holds = 0;
	private readonly _registration = this._register(new MutableDisposable());
	private readonly _release = this._register(new MutableDisposable());

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentsChatPartService private readonly _chatPart: IAgentsChatPartService,
	) {
		super();
	}

	acquire(): IDisposable {
		this._holds++;
		this._release.clear();
		this._registration.value ??= this._instantiationService.invokeFunction(registerAgentsViewProviders);
		let held = true;
		return toDisposable(() => {
			if (held) {
				held = false;
				if (--this._holds === 0 && !this._store.isDisposed) {
					this._releaseLater();
				}
			}
		});
	}

	private _releaseLater(): void {
		this._release.value = disposableTimeout(() => {
			this._release.clear();
			void this._releaseUnheld();
		}, AGENTS_VIEW_PROVIDERS_RELEASE_DELAY);
	}

	private async _releaseUnheld(): Promise<void> {
		if (this._holds > 0) {
			return;
		}
		// A composer the user left without typing anything goes, so the providers can go too
		await this._chatPart.closeIdleComposers();
		if (this._store.isDisposed || this._holds > 0 || this._release.value) {
			return;
		}
		if (this._chatPart.hasComposer()) {
			this._releaseLater();
		} else {
			this._registration.clear();
		}
	}
}

/**
 * Holds the sessions providers of the Sessions view of an editor window while that view or the chat part, which shows
 * sessions too, shows, while {@link isChatViewSessionsListEnabled}. The setting is read once, as the window
 * starts: with it off, this does nothing else.
 */
export class AgentsViewProvidersContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsViewProviders';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (!isChatViewSessionsListEnabled(configurationService)) {
			return;
		}

		const { viewsService, layoutService, lifecycleService, providersService } = instantiationService.invokeFunction(accessor => ({
			viewsService: accessor.get(IViewsService),
			layoutService: accessor.get(IWorkbenchLayoutService),
			lifecycleService: accessor.get(ILifecycleService),
			providersService: accessor.get(IAgentsViewProvidersService),
		}));
		const shown = this._register(new MutableDisposable());
		const update = () => {
			// The Sessions view, or the Chat view that shows the sessions in its place
			if (viewsService.isViewVisible(SessionsViewId) || viewsService.isViewVisible(ChatViewId) || layoutService.isVisible(Parts.CHAT_PART)) {
				shown.value ??= providersService.acquire();
			} else {
				shown.clear();
			}
		};
		this._register(viewsService.onDidChangeViewVisibility(e => {
			if (e.id === SessionsViewId || e.id === ChatViewId) {
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
registerSingleton(IAgentsViewProvidersService, AgentsViewProvidersService, InstantiationType.Delayed);
registerWorkbenchContribution2(AgentsViewProvidersContribution.ID, AgentsViewProvidersContribution, WorkbenchPhase.BlockStartup);
