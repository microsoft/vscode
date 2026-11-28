/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AgentHostCopilotPolicyHelperFailureModeSettingId, AgentHostCopilotPolicyHelperSettingId, CopilotCliConfigKey, normalizeCopilotPolicyHelperConfig, normalizeCopilotPolicyHelperFailureMode } from '../../../../platform/agentHost/common/copilotCliConfig.js';
import { AgentHostConfigurationSyncScope, ConfigurationScope, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';

export const copilotPolicyHelperConfigurationProperties: Record<string, IConfigurationPropertySchema> = {
	[AgentHostCopilotPolicyHelperSettingId]: {
		type: ['object', 'null'],
		markdownDescription: localize('chat.agentHost.copilot.policyHelper', "Policy helper executable for the local Copilot runtime, with an absolute `path`, optional `args`, and optional `timeoutMs`. The timeout accepts whole milliseconds from 1 through 30000. If omitted, the runtime uses 5000 milliseconds. Device and server policies take precedence. This advanced setting is omitted from Settings JSON suggestions. Changes restart the Copilot SDK client after active turns and subagents finish. Helper script content changes do not trigger a restart."),
		properties: {
			path: { type: 'string' },
			args: { type: 'array', items: { type: 'string' } },
			timeoutMs: {
				type: 'integer',
				minimum: 1,
				maximum: 30_000,
				description: localize('chat.agentHost.copilot.policyHelper.timeoutMs', "Timeout for one helper run in milliseconds. If omitted, the runtime uses 5000 milliseconds."),
			},
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
	[AgentHostCopilotPolicyHelperFailureModeSettingId]: {
		type: ['string', 'null'],
		enum: [null, 'ignore', 'failClosed'],
		enumDescriptions: [
			localize('chat.agentHost.copilot.policyHelperFailureMode.unset', "Remove the local environment override."),
			localize('chat.agentHost.copilot.policyHelperFailureMode.ignore', "Report helper failures and resolve policy from the remaining sources."),
			localize('chat.agentHost.copilot.policyHelperFailureMode.failClosed', "Treat helper failures as undetermined policy and engage the runtime's fail-closed protection."),
		],
		markdownDescription: localize('chat.agentHost.copilot.policyHelperFailureMode', "Fallback behavior when the local Copilot policy helper fails. Device and server policies take precedence. Null removes the local environment override. Requires a runtime that supports `COPILOT_CLI_POLICY_HELPER_FAILURE_MODE`. The bundled runtime 1.0.114 does not support this override. Changes restart the Copilot SDK client after active turns and subagents finish."),
		default: null,
		scope: ConfigurationScope.APPLICATION,
		ignoreSync: true,
		tags: ['experimental', 'advanced'],
		doNotSuggest: true,
		agentHost: {
			key: CopilotCliConfigKey.PolicyHelperFailureMode,
			// A string survives JSON transport so removal clears the host's previous value.
			transform: value => normalizeCopilotPolicyHelperFailureMode(value) ?? '',
			scope: AgentHostConfigurationSyncScope.Local,
		},
	},
};
