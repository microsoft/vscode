/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PolicyCategory } from '../../../../../base/common/policy.js';
import { localize } from '../../../../../nls.js';
import { AgentHostMcpConnectorsEnabledConfigKey } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { affectsCustomizationMarketplaceSources, CustomizationMarketplaceConfiguration, getVisibleCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';

export const customizationMarketplaceConfigurationProperties = {
	[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: {
		type: 'boolean',
		tags: ['preview'],
		description: localize('chat.customizations.marketplace.enabled', "Shows Browse instead of Overview when a customization marketplace source is enabled. When disabled, marketplace discovery remains in the existing customization management pages."),
		default: true,
		experiment: { mode: 'auto' },
		policy: {
			name: 'ChatCustomizationMarketplace',
			category: PolicyCategory.InteractiveSession,
			minimumVersion: '1.144',
			value: policyData => policyData.chat_preview_features_enabled === false ? false : undefined,
			localization: {
				description: {
					key: 'chat.customizations.marketplace.enabled',
					value: localize('chat.customizations.marketplace.enabled', "Shows Browse instead of Overview when a customization marketplace source is enabled. When disabled, marketplace discovery remains in the existing customization management pages."),
				},
			},
		},
	},
	[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: {
		type: 'boolean',
		tags: ['preview'],
		description: localize('chat.customizations.copilotConnectors.enabled', "Enables Copilot connectors in the unified marketplace and exposes connected connector MCP servers in Chat Customizations and Copilot agent sessions."),
		default: true,
		scope: ConfigurationScope.APPLICATION,
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostMcpConnectorsEnabledConfigKey },
		policy: {
			name: 'ChatCopilotConnectors',
			category: PolicyCategory.InteractiveSession,
			minimumVersion: '1.144',
			value: policyData => policyData.chat_preview_features_enabled === false ? false : undefined,
			localization: {
				description: {
					key: 'chat.customizations.copilotConnectors.enabled',
					value: localize('chat.customizations.copilotConnectors.enabled', "Enables Copilot connectors in the unified marketplace and exposes connected connector MCP servers in Chat Customizations and Copilot agent sessions."),
				},
			},
		},
	},
	[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: {
		type: 'boolean',
		tags: ['experimental', 'advanced'],
		description: localize('chat.customizations.marketplace.sources.publicFeed.enabled', "Enables the SDK-backed GitHub Feed for agent harnesses that provide marketplace search. Local does not provide this source. If Marketplace or this setting is disabled, or a strict marketplace policy is configured, the GitHub Feed is not queried."),
		default: true,
	},
} satisfies Record<string, IConfigurationPropertySchema>;

export function isAgentFinderPublicFeedAvailable(marketplaceService: IPluginMarketplaceService, harnessProvidesMarketplaceSearch: boolean): boolean {
	return harnessProvidesMarketplaceSearch && !marketplaceService.isStrictMarketplacePolicyActive();
}

export function isCustomizationDiscoveryAvailable(configurationService: IConfigurationService, marketplaceService: ICustomizationMarketplaceService): boolean {
	return getVisibleCustomizationMarketplaceSources(configurationService, marketplaceService.sources).length > 0;
}

export function isCustomizationMarketplaceValueFromDefault(configurationService: IConfigurationService): boolean {
	const inspected = configurationService.inspect<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled);
	return inspected.applicationValue === undefined &&
		inspected.userValue === undefined &&
		inspected.userLocalValue === undefined &&
		inspected.userRemoteValue === undefined &&
		inspected.workspaceValue === undefined &&
		inspected.workspaceFolderValue === undefined &&
		inspected.memoryValue === undefined &&
		inspected.policyValue === undefined;
}

export function affectsCustomizationDiscoveryAvailability(event: IConfigurationChangeEvent, marketplaceService: ICustomizationMarketplaceService): boolean {
	return affectsCustomizationMarketplaceSources(event, marketplaceService.allSources ?? marketplaceService.sources);
}
