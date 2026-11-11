/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { CloudSandboxEnabledSettingId, isCloudSandboxEnabled } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ISessionsListingScope } from '../../../browser/sessionScope.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';

/**
 * Registers the {@link CopilotChatSessionsProvider} of Copilot Cloud sessions, and on the web also its cloud sandbox
 * provider while cloud sandboxes are enabled, until the returned disposable is disposed. Local Copilot CLI sessions are
 * owned by the agent host providers. With a `listingScope`, they list only the sessions of that scope, such as of an
 * editor window's folders.
 */
export function registerCopilotChatSessionsProviders(accessor: ServicesAccessor, options?: { readonly listingScope?: ISessionsListingScope }): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);
	const sessionsProvidersService = accessor.get(ISessionsProvidersService);
	const configurationService = accessor.get(IConfigurationService);
	const chatEntitlementService = accessor.get(IChatEntitlementService);

	const disposables = new DisposableStore();
	const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider, 'default'));
	if (options?.listingScope) {
		provider.setListingScope(options.listingScope);
	}
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
				if (options?.listingScope) {
					sandboxProvider.setListingScope(options.listingScope);
				}
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
