/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../configuration/common/configuration.js';
import { ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceRequest, ICustomizationMarketplaceSourceInfo } from './customizationMarketplaceService.js';

export const enum CustomizationMarketplaceConfiguration {
	MarketplaceEnabled = 'chat.customizations.marketplace.enabled',
	AgentFinderPublicFeedEnabled = 'chat.customizations.marketplace.sources.publicFeed.enabled',
	McpGalleryEnabled = 'chat.customizations.marketplace.sources.mcpGallery.enabled',
}

export const CustomizationMarketplaceSources = {
	McpGallery: {
		id: 'mcpGallery',
		displayName: localize('customizationMarketplace.mcpGallery', "MCP Gallery"),
		enablementSetting: CustomizationMarketplaceConfiguration.McpGalleryEnabled,
	},
	McpGalleryDefault: {
		id: 'mcpGalleryDefault',
		displayName: localize('customizationMarketplace.defaultMcpGallery', "Default MCP Gallery"),
		enablementSetting: CustomizationMarketplaceConfiguration.McpGalleryEnabled,
		exclusionSetting: CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled,
	},
	AgentFinderPublicFeed: {
		id: 'agentFinder',
		displayName: localize('customizationMarketplace.githubFeed', "GitHub Feed"),
		enablementSetting: CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled,
		requiresMarketplaceVisibility: true,
	},
} as const satisfies Record<string, ICustomizationMarketplaceSourceInfo>;

export function getEnabledCustomizationMarketplaceSources(configurationService: IConfigurationService, sources: readonly ICustomizationMarketplaceSourceInfo[]): readonly ICustomizationMarketplaceSourceInfo[] {
	return sources.filter(source => configurationService.getValue<boolean>(source.enablementSetting) === true &&
		(!source.exclusionSetting || configurationService.getValue<boolean>(source.exclusionSetting) !== true) &&
		(!source.requiresMarketplaceVisibility || configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true));
}

export function getVisibleCustomizationMarketplaceSources(configurationService: IConfigurationService, sources: readonly ICustomizationMarketplaceSourceInfo[]): readonly ICustomizationMarketplaceSourceInfo[] {
	return configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true
		? getEnabledCustomizationMarketplaceSources(configurationService, sources) : [];
}

export function affectsCustomizationMarketplaceSources(event: IConfigurationChangeEvent, sources: readonly ICustomizationMarketplaceSourceInfo[]): boolean {
	return event.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled)
		|| sources.some(source => event.affectsConfiguration(source.enablementSetting) ||
			(source.exclusionSetting !== undefined && event.affectsConfiguration(source.exclusionSetting)));
}

export async function queryEnabledCustomizationMarketplaceSources(
	configurationService: IConfigurationService,
	sources: readonly ICustomizationMarketplaceSourceInfo[],
	options: ICustomizationMarketplaceQuery,
	token: CancellationToken,
	query: (request: ICustomizationMarketplaceRequest, token: CancellationToken) => Promise<ICustomizationMarketplacePage>,
): Promise<ICustomizationMarketplacePage> {
	const getSourceIds = () => getEnabledCustomizationMarketplaceSources(configurationService, sources)
		.filter(source => !options.sourceIds || options.sourceIds.includes(source.id))
		.map(source => source.id);
	const sourceIds = getSourceIds();
	if (token.isCancellationRequested || sourceIds.length === 0) {
		throw new CancellationError();
	}
	const store = new DisposableStore();
	const cancellation = store.add(new CancellationTokenSource(token));
	store.add(configurationService.onDidChangeConfiguration(event => {
		if (affectsCustomizationMarketplaceSources(event, sources) &&
			!equals(sourceIds, getSourceIds())) {
			cancellation.cancel();
		}
	}));
	try {
		return await raceCancellationError(query({ ...options, sourceIds }, cancellation.token), cancellation.token);
	} finally {
		cancellation.cancel();
		store.dispose();
	}
}
