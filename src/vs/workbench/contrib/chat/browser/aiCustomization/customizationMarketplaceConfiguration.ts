/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { affectsCustomizationMarketplaceSources, CustomizationMarketplaceConfiguration, getVisibleCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { ChatConfiguration } from '../../common/constants.js';
import { getStrictKnownMarketplaces } from '../../common/plugins/strictKnownMarketplaces.js';

export const customizationMarketplaceConfigurationProperties = {
	[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: {
		type: 'boolean',
		tags: ['experimental', 'advanced'],
		description: localize('chat.customizations.marketplace.enabled', "Shows Discover instead of Overview when a customization marketplace source is enabled. When disabled, marketplace discovery remains in the existing customization management pages."),
		default: false,
		experiment: { mode: 'auto' },
	},
	[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: {
		type: 'boolean',
		tags: ['experimental', 'advanced'],
		description: localize('chat.customizations.marketplace.sources.publicFeed.enabled', "Enables the SDK-backed GitHub Feed for agent harnesses that provide marketplace search. Local does not provide this source. If Marketplace or this setting is disabled, or a strict marketplace policy is configured, the GitHub Feed is not queried."),
		default: true,
	},
} satisfies Record<string, IConfigurationPropertySchema>;

export function isAgentFinderPublicFeedAvailable(configurationService: IConfigurationService, harnessProvidesMarketplaceSearch: boolean): boolean {
	return harnessProvidesMarketplaceSearch && !isStrictMarketplacePolicyConfigured(configurationService);
}

export function isStrictMarketplacePolicyConfigured(configurationService: IConfigurationService): boolean {
	return getStrictKnownMarketplaces(configurationService.getValue(ChatConfiguration.StrictMarketplaces)) !== undefined;
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
	return event.affectsConfiguration(ChatConfiguration.StrictMarketplaces) ||
		affectsCustomizationMarketplaceSources(event, marketplaceService.allSources ?? marketplaceService.sources);
}
