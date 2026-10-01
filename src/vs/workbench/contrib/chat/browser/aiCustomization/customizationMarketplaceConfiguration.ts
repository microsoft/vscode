/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { affectsCustomizationMarketplaceSources, CustomizationMarketplaceConfiguration, getVisibleCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';

export const customizationMarketplaceConfigurationProperties = {
	[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('chat.customizations.marketplace.enabled', "Shows Discover instead of Overview when a customization marketplace source is enabled. When disabled, marketplace discovery remains in the existing customization management pages."),
		default: false,
		experiment: { mode: 'auto' },
	},
	[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('chat.customizations.marketplace.sources.publicFeed.enabled', "Enables the GitHub Feed as a source of skills, MCP servers, and plugins when Marketplace is shown. If Marketplace or this setting is disabled, the GitHub Feed is not queried."),
		default: true,
	},
} satisfies Record<string, IConfigurationPropertySchema>;

export function isCustomizationDiscoveryAvailable(configurationService: IConfigurationService, marketplaceService: ICustomizationMarketplaceService): boolean {
	return getVisibleCustomizationMarketplaceSources(configurationService, marketplaceService.sources).length > 0;
}

export function affectsCustomizationDiscoveryAvailability(event: IConfigurationChangeEvent, marketplaceService: ICustomizationMarketplaceService): boolean {
	return affectsCustomizationMarketplaceSources(event, marketplaceService.allSources ?? marketplaceService.sources);
}
