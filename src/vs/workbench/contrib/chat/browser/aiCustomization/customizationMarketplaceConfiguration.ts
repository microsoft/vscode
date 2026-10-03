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
		default: true,
		experiment: { mode: 'auto' },
	},
	[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: {
		type: 'boolean',
		tags: ['experimental'],
		description: localize('chat.customizations.marketplace.sources.publicFeed.enabled', "Enables the GitHub Feed as a source of skills, MCP servers, and plugins when Marketplace is shown. If Marketplace or this setting is disabled, the GitHub Feed is not queried."),
		default: false,
	},
} satisfies Record<string, IConfigurationPropertySchema>;

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
