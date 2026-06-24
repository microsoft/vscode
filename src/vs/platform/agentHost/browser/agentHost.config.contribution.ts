/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../base/common/defaultAccount.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import * as nls from '../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import { AgentHostEnabledSettingId } from '../common/agentService.js';
import '../common/agentHost.config.contribution.js';

// Re-registers `chat.agentHost.enabled` with the `policy` block attached.
// The bare setting (type + default) is registered in the common layer so the
// main process knows the default; this browser-only file adds the policy's
// `value` callback which cannot be structured-cloned over Electron IPC.
//
// Side-effect imports of this file:
//   - `src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts`

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
const existingProp = configurationRegistry.getConfigurationProperties()[AgentHostEnabledSettingId];
const oldNode: IConfigurationNode = { id: 'chatAgentHost', properties: { [AgentHostEnabledSettingId]: existingProp } };
const newNode: IConfigurationNode = {
	id: 'chatAgentHost',
	properties: {
		[AgentHostEnabledSettingId]: {
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
