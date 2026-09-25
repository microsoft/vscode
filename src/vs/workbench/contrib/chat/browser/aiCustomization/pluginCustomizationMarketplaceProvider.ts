/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceMediaType, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourceEntry, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';
import { DEFAULT_PLUGIN_MARKETPLACE, parseMarketplaceReference } from '../../common/plugins/marketplaceReference.js';
import { IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType } from '../../common/plugins/pluginMarketplaceService.js';

const defaultMarketplaceId = parseMarketplaceReference(DEFAULT_PLUGIN_MARKETPLACE)!.canonicalId;
const pluginMarketplaceSourceInfo: ICustomizationMarketplaceSourceInfo = {
	...CustomizationMarketplaceSources.PluginMarketplaces,
	configurationDependencies: [
		CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled,
		ChatConfiguration.PluginsEnabled,
		ChatConfiguration.PluginMarketplaces,
		ChatConfiguration.ExtraMarketplaces,
		ChatConfiguration.StrictMarketplaces,
	],
};
const allMarketplaceTypes = new Set([MarketplaceType.Claude, MarketplaceType.Copilot, MarketplaceType.OpenPlugin]);
const copilotMarketplaceTypes = new Set([MarketplaceType.Copilot, MarketplaceType.OpenPlugin]);
const claudeMarketplaceTypes = new Set([MarketplaceType.Claude]);

export function getPluginMarketplaceIdentifier(plugin: IMarketplacePlugin): string {
	return JSON.stringify([plugin.marketplaceReference.canonicalId, plugin.name, plugin.sourceDescriptor, plugin.version]);
}

export function isPluginMarketplaceReferenceAvailableInDiscover(configurationService: IConfigurationService, reference: IMarketplacePlugin['marketplaceReference']): boolean {
	return configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled) !== true ||
		reference.canonicalId !== defaultMarketplaceId;
}

export function getPluginCustomizationMarketplaceSourceInfos(
	configurationService: IConfigurationService,
	marketplaceService: IPluginMarketplaceService,
): readonly ICustomizationMarketplaceSourceInfo[] {
	const sources = getAllPluginCustomizationMarketplaceSourceInfos();
	if (configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) !== true) {
		return sources.filter(source => source.id !== pluginMarketplaceSourceInfo.id);
	}
	return marketplaceService.getMarketplaceReferences().some(reference => isPluginMarketplaceReferenceAvailableInDiscover(configurationService, reference))
		? sources
		: sources.filter(source => source.id !== pluginMarketplaceSourceInfo.id);
}

export function getAllPluginCustomizationMarketplaceSourceInfos(): readonly ICustomizationMarketplaceSourceInfo[] {
	return [pluginMarketplaceSourceInfo];
}

export function createPluginCustomizationMarketplaceProviders(instantiationService: IInstantiationService): readonly ICustomizationMarketplaceProvider[] {
	return (['custom', 'default'] as const).map(registry => {
		const id = `${CustomizationMarketplaceSources.PluginMarketplaces.id}.${registry}`;
		return createLazyCustomizationMarketplaceProvider(
			id,
			() => instantiationService.createInstance(PluginCustomizationMarketplaceProvider, registry),
			CustomizationMarketplaceSources.PluginMarketplaces.id,
		);
	});
}

export class PluginCustomizationMarketplaceProvider implements ICustomizationMarketplaceProvider {
	readonly id: string;
	readonly sourceId = CustomizationMarketplaceSources.PluginMarketplaces.id;

	constructor(
		private readonly registry: 'custom' | 'default',
		@IPluginMarketplaceService private readonly marketplaceService: IPluginMarketplaceService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.id = `${this.sourceId}.${registry}`;
	}

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		const marketplaceTypes = getPluginMarketplaceTypes(options.mediaType);
		if (!marketplaceTypes) {
			return { items: [], total: 0 };
		}
		const marketplaceIds = new Set(this.marketplaceService.getMarketplaceReferences()
			.filter(reference => isPluginMarketplaceReferenceAvailableInDiscover(this.configurationService, reference) &&
				(this.registry === 'default'
					? reference.canonicalId === defaultMarketplaceId
					: reference.canonicalId !== defaultMarketplaceId))
			.map(reference => reference.canonicalId));
		if (!marketplaceIds.size) {
			return { items: [], total: 0 };
		}
		const page = await this.marketplaceService.queryMarketplacePlugins({
			text: options.query,
			pageSize: options.pageSize ?? 30,
			cursor: options.cursor,
			marketplaceIds,
			marketplaceTypes,
		}, token);
		return {
			items: page.items.map(plugin => toMarketplaceEntry(plugin, this.registry, !!options.query)),
			total: page.total,
			nextCursor: page.nextCursor,
			...(page.errors.length ? { warning: page.errors.map(error => `${error.marketplace}: ${error.message}`).join('; ') } : {}),
		};
	}
}

function toMarketplaceEntry(plugin: IMarketplacePlugin, registry: 'custom' | 'default', search: boolean): ICustomizationMarketplaceSourceEntry {
	return {
		identifier: getPluginMarketplaceIdentifier(plugin),
		displayName: plugin.name,
		description: plugin.description,
		mediaType: getPluginMediaType(plugin)!,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		originLabel: plugin.marketplace,
		version: plugin.version,
		url: plugin.readmeUri,
		score: search ? 0 : undefined,
		priority: registry === 'custom' ? 1 : 0,
		installation: { kind: 'configuredPlugin' },
	};
}

function getPluginMarketplaceTypes(mediaType: string | undefined): ReadonlySet<MarketplaceType> | undefined {
	if (!mediaType) {
		return allMarketplaceTypes;
	}
	if (mediaType === CustomizationMarketplaceMediaType.CopilotPlugin) {
		return copilotMarketplaceTypes;
	}
	if (mediaType === CustomizationMarketplaceMediaType.ClaudePlugin) {
		return claudeMarketplaceTypes;
	}
	return undefined;
}

function getPluginMediaType(plugin: IMarketplacePlugin): string | undefined {
	switch (plugin.marketplaceType as string) {
		case MarketplaceType.Claude:
			return CustomizationMarketplaceMediaType.ClaudePlugin;
		case MarketplaceType.Copilot:
		case MarketplaceType.OpenPlugin:
			return CustomizationMarketplaceMediaType.CopilotPlugin;
	}
	return undefined;
}
