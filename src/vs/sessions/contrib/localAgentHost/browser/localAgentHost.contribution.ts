/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { AgentHostEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { LocalAgentHostSessionsProvider } from './localAgentHostSessionsProvider.js';

/**
 * Registers the {@link LocalAgentHostSessionsProvider} as a sessions provider
 * when `chat.agentHost.enabled` is true.
 *
 * The existing {@link AgentHostContribution} (from `chat/electron-browser/chat.contribution.js`)
 * handles all the heavy lifting — agent discovery, session handler registration,
 * language model providers, customization harness — via {@link IChatSessionsService}.
 * This contribution only bridges the session listing and lifecycle to the
 * {@link ISessionsProvidersService} layer used by the Sessions app's UI.
 */
class LocalAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.localAgentHostContribution';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		if (!configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		const provider = this._register(instantiationService.createInstance(LocalAgentHostSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(LocalAgentHostContribution.ID, LocalAgentHostContribution, WorkbenchPhase.AfterRestored);
