/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';

export const customizationMarketplaceConfigurationProperties = {
	[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('chat.customizations.marketplace.enabled', "Shows Discover instead of Overview when a customization marketplace source is enabled. When disabled, marketplace discovery remains in the existing customization management pages."),
		default: false,
	},
	[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('chat.customizations.marketplace.sources.publicFeed.enabled', "Enables the GitHub Feed as a source of skills, MCP servers, and plugins when Marketplace is shown. If Marketplace or this setting is disabled, the GitHub Feed is not queried."),
		default: true,
	},
	[CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('chat.customizations.marketplace.sources.pluginMarketplaces.enabled', "Shows plugins from configured marketplaces in Discover when marketplace visibility is enabled. The built-in Awesome Copilot marketplace is omitted only when the public GitHub Feed is enabled. Only marketplaces permitted by plugin policy are queried. When disabled, plugin discovery remains in the Plugins section."),
		default: true,
	},
} satisfies Record<string, IConfigurationPropertySchema>;
