/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CopilotChatSessionsProvider, COPILOT_MULTI_CHAT_SETTING } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { AgentHostEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[COPILOT_MULTI_CHAT_SETTING]: {
			type: 'boolean',
			default: false,
			tags: ['preview'],
			description: localize('sessions.github.copilot.multiChatSessions', "Whether to enable multiple chats within a single session in the Copilot Chat sessions provider."),
		},
	},
});

/**
 * Registers the {@link CopilotChatSessionsProvider} as a sessions provider.
 */
class DefaultSessionsProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.defaultSessionsProvider';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		// When the local agent host is enabled, skip registering the
		// default CopilotChat provider so only the local agent host
		// provider is active.
		if (configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		const provider = this._register(instantiationService.createInstance(CopilotChatSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, WorkbenchPhase.AfterRestored);
