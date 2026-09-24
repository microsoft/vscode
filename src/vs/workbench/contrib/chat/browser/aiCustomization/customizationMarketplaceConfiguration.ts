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
		description: localize('chat.customizations.marketplace.sources.publicFeed.enabled', "Enables the GitHub Feed as a source of skills, MCP servers, and plugins when the customization marketplace is shown. When disabled, this source is not initialized or queried."),
		default: true,
	},
	[CustomizationMarketplaceConfiguration.McpGalleryEnabled]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('chat.customizations.marketplace.sources.mcpGallery.enabled', "When the customization marketplace is enabled, moves MCP server discovery from the MCP management page to Discover. Discover shows a configured custom MCP gallery and, when the public GitHub Feed is off, the default MCP gallery. The legacy MCP gallery remains available in the MCP management page when the marketplace is disabled."),
		default: true,
		experiment: { mode: 'auto' },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
