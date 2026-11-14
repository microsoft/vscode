/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { sessionsListConfigurationProperties } from '../sessionsConfiguration.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { AgentsChatPartContribution } from './agentsChatPartContribution.js';
import { registerSessionsListActions, registerSessionsListReadStateMenus, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { SessionsViewId } from '../views/sessionsView.js';
import { isChatViewSessionsListEnabled } from '../../../chat/common/constants.js';
import { registerAgentsViewNewSessionActions } from './agentsChatPartActions.js';

/** The settings of the sessions list and of the sessions it opens, as the Agents window registers them. */
const sessionsListConfiguration: IConfigurationNode = {
	id: 'sessionsList',
	properties: sessionsListConfigurationProperties,
};

/**
 * Shows the Agents view, with the sessions of the Agents window, in place of the Chat view of an editor window while {@link isChatViewSessionsListEnabled}.
 * The setting is read once, as the window starts: with it off, this registers nothing and creates no service.
 */
export class AgentsViewGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsViewGate';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (!isChatViewSessionsListEnabled(configurationService)) {
			return;
		}

		// The settings of the list and of the sessions it opens, as the Agents window has them
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration(sessionsListConfiguration);
		this._register(toDisposable(() => configurationRegistry.deregisterConfigurations([sessionsListConfiguration])));
		// The actions of the list and of the sessions it shows, once the Sessions view or the chat part first shows
		this.registerOnFirstShown(instantiationService, () => {
			this._register(registerSessionsListActions());
			this._register(registerSessionsListReadStateMenus());
			this._register(registerAgentsViewNewSessionActions());
			this._register(instantiationService.createInstance(SessionsArchiveActionsContribution));
		});

		instantiationService.invokeFunction(accessor => {
			// The chat part, where sessions open: not in remote windows, where the Sessions view does not show
			if (!accessor.get(IWorkbenchEnvironmentService).remoteAuthority) {
				this._register(instantiationService.createInstance(AgentsChatPartContribution));
				this.replaceChatView(accessor.get(IContextKeyService));
			}
		});
	}

	/** The Agents view replaces the Chat view: the Chat view does not show (`ChatContextKeys.agentsViewActive`). */
	private replaceChatView(contextKeyService: IContextKeyService): void {
		ChatContextKeys.agentsViewActive.bindTo(contextKeyService).set(true);
	}

	/** Runs `register` once, as the Sessions view or the chat part, which shows sessions too, first shows. */
	private registerOnFirstShown(instantiationService: IInstantiationService, register: () => void): void {
		const { viewsService, layoutService, lifecycleService } = instantiationService.invokeFunction(accessor => ({
			viewsService: accessor.get(IViewsService),
			layoutService: accessor.get(IWorkbenchLayoutService),
			lifecycleService: accessor.get(ILifecycleService),
		}));
		const firstShown = this._register(new DisposableStore());
		const shown = () => {
			if (!firstShown.isDisposed) {
				firstShown.dispose();
				register();
			}
		};
		firstShown.add(viewsService.onDidChangeViewVisibility(e => {
			if (e.id === SessionsViewId && e.visible) {
				shown();
			}
		}));
		firstShown.add(layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.CHAT_PART && e.visible) {
				shown();
			}
		}));
		// Either restores shown with the window, without a change of its visibility
		void lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (viewsService.isViewVisible(SessionsViewId) || layoutService.isVisible(Parts.CHAT_PART)) {
				shown();
			}
		});
	}
}
