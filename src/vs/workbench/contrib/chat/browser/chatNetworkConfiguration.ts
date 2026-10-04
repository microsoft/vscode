/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../../base/common/policy.js';
import * as nls from '../../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { AgentNetworkDomainSettingId } from '../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxSettingId } from '../../../../platform/sandbox/common/settings.js';
import { ConfigurationKeyValuePairs, ConfigurationMigration } from '../../../common/configuration.js';

export const chatNetworkDomainConfigurationProperties: Record<string, IConfigurationPropertySchema> = {
	[AgentNetworkDomainSettingId.AllowedNetworkDomains]: {
		order: 66,
		keywords: ['Sandbox', 'sandboxing'],
		markdownDescription: nls.localize('chat.agent.allowedNetworkDomains', "Allowed domains for network access by agent tools (fetch tool, integrated browser) when {0} is enabled. In Copilot Agent Host sessions with sandboxing ({1}) enabled, also restricts the integrated browser when outbound network access ({2}) is allowed; an empty allow list adds no sandbox restriction. This list does not enable outbound access. Supports wildcards like {3}. Outside sandboxing, when both allowed and denied lists are empty, all domains are blocked. Denied domains (see {4}) take precedence.\n\nChanges may not take full effect until VS Code is restarted.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, '`*.example.com`', `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
		type: 'array',
		items: { type: 'string' },
		default: [],
		scope: ConfigurationScope.APPLICATION,
		restricted: true,
		policy: {
			name: 'ChatAgentAllowedNetworkDomains',
			category: PolicyCategory.InteractiveSession,
			minimumVersion: '1.116',
			localization: {
				description: {
					key: 'chat.agent.allowedNetworkDomains',
					value: nls.localize('chat.agent.allowedNetworkDomains', "Allowed domains for network access by agent tools (fetch tool, integrated browser) when {0} is enabled. In Copilot Agent Host sessions with sandboxing ({1}) enabled, also restricts the integrated browser when outbound network access ({2}) is allowed; an empty allow list adds no sandbox restriction. This list does not enable outbound access. Supports wildcards like {3}. Outside sandboxing, when both allowed and denied lists are empty, all domains are blocked. Denied domains (see {4}) take precedence.\n\nChanges may not take full effect until VS Code is restarted.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, '`*.example.com`', `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
				}
			}
		}
	},
	[AgentNetworkDomainSettingId.DeniedNetworkDomains]: {
		order: 67,
		keywords: ['Sandbox', 'sandboxing'],
		markdownDescription: nls.localize('chat.agent.deniedNetworkDomains', "Denied domains for network access by agent tools (fetch tool, integrated browser) when {0} is enabled. Also applies to the integrated browser in sandboxed Copilot Agent Host sessions ({1}); allowing outbound network access ({2}) does not bypass this list. Takes precedence over {3}. Supports wildcards like {4}.\n\nChanges may not take full effect until VS Code is restarted.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, '`*.example.com`'),
		type: 'array',
		items: { type: 'string' },
		default: [],
		scope: ConfigurationScope.APPLICATION,
		restricted: true,
		policy: {
			name: 'ChatAgentDeniedNetworkDomains',
			category: PolicyCategory.InteractiveSession,
			minimumVersion: '1.116',
			localization: {
				description: {
					key: 'chat.agent.deniedNetworkDomains',
					value: nls.localize('chat.agent.deniedNetworkDomains', "Denied domains for network access by agent tools (fetch tool, integrated browser) when {0} is enabled. Also applies to the integrated browser in sandboxed Copilot Agent Host sessions ({1}); allowing outbound network access ({2}) does not bypass this list. Takes precedence over {3}. Supports wildcards like {4}.\n\nChanges may not take full effect until VS Code is restarted.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, '`*.example.com`'),
				}
			}
		}
	},
};

export const chatNetworkDomainConfigurationMigrations: ConfigurationMigration[] = [
	...[
		['chat.agent.allowedNetworkDomains', AgentNetworkDomainSettingId.AllowedNetworkDomains],
		['chat.agent.deniedNetworkDomains', AgentNetworkDomainSettingId.DeniedNetworkDomains],
	].map(([key, newKey]) => ({
		key,
		includeApplication: true,
		migrateFn: (value: unknown, accessor: (key: string) => unknown): ConfigurationKeyValuePairs => {
			const pairs: ConfigurationKeyValuePairs = [[key, { value: undefined }]];
			if (accessor(newKey) === undefined) {
				pairs.push([newKey, { value }]);
			}
			return pairs;
		}
	})),
];
