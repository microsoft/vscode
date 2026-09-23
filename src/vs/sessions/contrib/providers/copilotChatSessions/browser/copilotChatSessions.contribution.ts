/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { CopilotChatSessionsProvider, COPILOT_MULTI_CHAT_SETTING } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CloudSandboxEnabledSettingId, isCloudSandboxEnabled } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[COPILOT_MULTI_CHAT_SETTING]: {
			type: 'boolean',
			default: true,
			tags: ['preview'],
			description: localize('sessions.github.copilot.multiChatSessions', "Whether to enable multiple chats within a single session in the Copilot Chat sessions provider."),
		},
	},
});

/**
 * Registers the {@link CopilotChatSessionsProvider} as a sessions provider.
 *
 * Coexists with the local agent host provider when that runtime is available. The two providers list disjoint sets of sessions:
 * - The local agent host filters via the per-session Agent Host SQLite DB
 *   (database-existence ownership gate in `CopilotAgent.listSessions`).
 * - This provider's underlying extension service filters via the per-session
 *   metadata file's `origin` field, which the local agent host never writes.
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
