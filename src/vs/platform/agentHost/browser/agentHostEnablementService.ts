/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../base/common/defaultAccount.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isWeb } from '../../../base/common/platform.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import * as nls from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { Registry } from '../../registry/common/platform.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY, IAgentHostEnablementService } from '../common/agentHostEnablementService.js';

// The setting ID is intentionally not exported — all runtime checks go through
// IAgentHostEnablementService. The string is needed here only to register
// and apply the policy.
const agentHostEnabledSettingId = 'chat.agentHost.enabled';
const aiFeaturesDisabledSettingId = 'chat.disableAIFeatures';

// Add the `policy` block to `chat.agentHost.enabled`. The base registration
// (type, default, description) is done in the common layer as a side-effect of
// importing `../common/agentHostEnablementService.js`. The policy `value`
// callback cannot be structured-cloned over Electron IPC, so it is added here
// in the browser layer only.
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
const existingProp = configurationRegistry.getConfigurationProperties()[agentHostEnabledSettingId];
const oldNode: IConfigurationNode = { id: 'chatAgentHost', properties: { [agentHostEnabledSettingId]: existingProp } };
const newNode: IConfigurationNode = {
	id: 'chatAgentHost',
	properties: {
		[agentHostEnabledSettingId]: {
			...existingProp,
			policy: {
				name: 'ChatAgentHostEnabled',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.126',
				value: (policyData: IPolicyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
				localization: {
					description: {
						key: 'chat.agentHost.enabled',
						value: nls.localize('chat.agentHost.enabled', "When enabled, some agents run in a separate agent host process.")
					}
				},
			}
		},
	}
};
configurationRegistry.updateConfigurations({ remove: [oldNode], add: [newNode] });

export class AgentHostEnablementService extends Disposable implements IAgentHostEnablementService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: boolean;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.enabled = !isWeb
			&& (configurationService.getValue<boolean>(agentHostEnabledSettingId) ?? false)
			&& configurationService.getValue<boolean>(aiFeaturesDisabledSettingId) !== true;
		AGENT_HOST_ENABLED_CONTEXT_KEY.bindTo(contextKeyService).set(this.enabled);
	}
}

registerSingleton(IAgentHostEnablementService, AgentHostEnablementService, InstantiationType.Eager);
