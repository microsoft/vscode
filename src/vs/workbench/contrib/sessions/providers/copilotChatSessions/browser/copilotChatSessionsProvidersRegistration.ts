/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IDisposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { CloudSandboxEnabledSettingId, isCloudSandboxEnabled } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';

/**
 * Registers the {@link CopilotChatSessionsProvider} as a sessions provider, and on the web also its cloud sandbox provider
 * while cloud sandboxes are enabled, until the returned disposable is disposed.
 *
 * The provider only surfaces Copilot Cloud sessions from the Copilot extension;
 * local Copilot CLI sessions are owned by the agent host providers.
 *
 * Call it once per window, from the one module or contribution that owns these registrations: its registrations are
 * global, and registering them twice throws or duplicates them.
 */
export function registerCopilotChatSessionsProviders(accessor: ServicesAccessor): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);
	const sessionsProvidersService = accessor.get(ISessionsProvidersService);
	const configurationService = accessor.get(IConfigurationService);
	const chatEntitlementService = accessor.get(IChatEntitlementService);

	const disposables = new DisposableStore();

	const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider, 'default'));
	disposables.add(sessionsProvidersService.registerProvider(provider));

	if (isWeb) {
		const sandboxRegistration = disposables.add(new MutableDisposable<DisposableStore>());
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
		disposables.add(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CloudSandboxEnabledSettingId) || event.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				updateSandboxRegistration();
			}
		}));
		disposables.add(chatEntitlementService.onDidChangeSentiment(updateSandboxRegistration));
		updateSandboxRegistration();
	}
	return disposables;
}
