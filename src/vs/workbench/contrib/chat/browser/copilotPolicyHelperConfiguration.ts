/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AgentHostCopilotPolicyHelperSettingId, CopilotCliConfigKey, normalizeCopilotPolicyHelperConfig } from '../../../../platform/agentHost/common/copilotCliConfig.js';
import { AgentHostConfigurationSyncScope, ConfigurationScope, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';

export const copilotPolicyHelperConfigurationProperties: Record<string, IConfigurationPropertySchema> = {
	[AgentHostCopilotPolicyHelperSettingId]: {
		type: ['object', 'null'],
		markdownDescription: localize('chat.agentHost.copilot.policyHelper', "Policy helper executable for the local Copilot runtime, with an absolute `path` and optional `args`. Device and server policies take precedence. This advanced setting is omitted from Settings JSON suggestions. Changes restart the Copilot SDK client after active turns and subagents finish. Helper script content changes do not trigger a restart."),
		properties: {
			path: { type: 'string' },
			args: { type: 'array', items: { type: 'string' } },
		},
		required: ['path'],
		additionalProperties: false,
		default: null,
		scope: ConfigurationScope.APPLICATION,
		ignoreSync: true,
		tags: ['experimental', 'advanced'],
		doNotSuggest: true,
		agentHost: {
			key: CopilotCliConfigKey.PolicyHelper,
			// An object survives JSON transport so removal clears the host's previous value.
			transform: value => normalizeCopilotPolicyHelperConfig(value) ?? { path: '' },
			scope: AgentHostConfigurationSyncScope.Local,
		},
	},
};
