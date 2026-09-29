/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { CopilotChatSessionsProvider } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CloudSandboxEnabledSettingId, isCloudSandboxEnabled } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';

/**
 * Registers the {@link CopilotChatSessionsProvider} as a sessions provider.
 *
 * The provider only surfaces Copilot Cloud sessions from the Copilot extension;
 * local Copilot CLI sessions are owned by the agent host providers.
 */
class DefaultSessionsProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.defaultSessionsProvider';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();

		const provider = this._register(instantiationService.createInstance(CopilotChatSessionsProvider, 'default'));
		this._register(sessionsProvidersService.registerProvider(provider));

		if (isWeb) {
			const sandboxRegistration = this._register(new MutableDisposable<DisposableStore>());
			const updateSandboxRegistration = () => {
				if (!isCloudSandboxEnabled(configurationService) || chatEntitlementService.sentiment.hidden) {
					sandboxRegistration.clear();
				} else if (!sandboxRegistration.value) {
					const store = new DisposableStore();
					sandboxRegistration.value = store;
					const sandboxProvider = store.add(instantiationService.createInstance(CopilotChatSessionsProvider, 'sandbox'));
					store.add(sessionsProvidersService.registerProvider(sandboxProvider));
				}
			};
			this._register(configurationService.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration(CloudSandboxEnabledSettingId) || event.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
					updateSandboxRegistration();
				}
			}));
			this._register(chatEntitlementService.onDidChangeSentiment(updateSandboxRegistration));
			updateSandboxRegistration();
		}
	}
}

registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, WorkbenchPhase.AfterRestored);
