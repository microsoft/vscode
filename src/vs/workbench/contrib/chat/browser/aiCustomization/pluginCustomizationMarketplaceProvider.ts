/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceMediaType, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourceEntry, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';
import { DEFAULT_PLUGIN_MARKETPLACE, IMarketplaceReference, parseMarketplaceReference } from '../../common/plugins/marketplaceReference.js';
import { IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';

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

export function getPluginCustomizationMarketplaceSourceId(reference: IMarketplaceReference): string {
	return `${CustomizationMarketplaceSources.PluginMarketplaces.id}.${reference.canonicalId}`;
}

export function getPluginCustomizationMarketplaceNavigationSourceId(configurationService: IConfigurationService, reference: IMarketplaceReference): string {
	return isPluginMarketplaceReferenceAvailableInDiscover(configurationService, reference)
		? getPluginCustomizationMarketplaceSourceId(reference)
		: CustomizationMarketplaceSources.AgentFinderPublicFeed.id;
}

export function getPluginCustomizationMarketplaceSourceIdFromIdentifier(identifier: string): string | undefined {
	try {
		const value: unknown = JSON.parse(identifier);
		return Array.isArray(value) && typeof value[0] === 'string'
			? `${CustomizationMarketplaceSources.PluginMarketplaces.id}.${value[0]}`
			: undefined;
	} catch {
		return undefined;
	}
}

export function isPluginMarketplaceReferenceAvailableInDiscover(configurationService: IConfigurationService, reference: IMarketplacePlugin['marketplaceReference']): boolean {
	return configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled) !== true ||
		reference.canonicalId !== defaultMarketplaceId;
}

export function getPluginCustomizationMarketplaceSourceInfos(
	configurationService: IConfigurationService,
	marketplaceService: IPluginMarketplaceService,
): readonly ICustomizationMarketplaceSourceInfo[] {
	if (configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) !== true) {
		return [];
	}
	return marketplaceService.getMarketplaceReferences()
		.filter(reference => isPluginMarketplaceReferenceAvailableInDiscover(configurationService, reference))
		.map(toPluginCustomizationMarketplaceSourceInfo);
}

export function getAllPluginCustomizationMarketplaceSourceInfos(marketplaceService: IPluginMarketplaceService): readonly ICustomizationMarketplaceSourceInfo[] {
	return [
		pluginMarketplaceSourceInfo,
		...marketplaceService.getMarketplaceReferences().map(toPluginCustomizationMarketplaceSourceInfo),
	];
}

export function createPluginCustomizationMarketplaceProviders(
	instantiationService: IInstantiationService,
	configurationService: IConfigurationService,
	marketplaceService: IPluginMarketplaceService,
): readonly ICustomizationMarketplaceProvider[] {
	return marketplaceService.getMarketplaceReferences()
		.filter(reference => isPluginMarketplaceReferenceAvailableInDiscover(configurationService, reference))
		.map(reference => {
			const id = getPluginCustomizationMarketplaceSourceId(reference);
			return createLazyCustomizationMarketplaceProvider(
				id,
				() => instantiationService.createInstance(PluginCustomizationMarketplaceProvider, reference),
			);
		});
}

function toPluginCustomizationMarketplaceSourceInfo(reference: IMarketplaceReference): ICustomizationMarketplaceSourceInfo {
	return {
		...pluginMarketplaceSourceInfo,
		id: getPluginCustomizationMarketplaceSourceId(reference),
		displayName: reference.displayLabel,
	};
}

export class PluginCustomizationMarketplaceProvider implements ICustomizationMarketplaceProvider {
	readonly id: string;

	constructor(
		private readonly reference: IMarketplaceReference,
		@IPluginMarketplaceService private readonly marketplaceService: IPluginMarketplaceService,
	) {
		this.id = getPluginCustomizationMarketplaceSourceId(reference);
	}

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		const marketplaceTypes = getPluginMarketplaceTypes(options.mediaType);
		if (!marketplaceTypes) {
			return { items: [], total: 0 };
		}
		if (!this.marketplaceService.getMarketplaceReferences().some(reference => reference.canonicalId === this.reference.canonicalId)) {
			return { items: [], total: 0 };
		}
		const registry = this.reference.canonicalId === defaultMarketplaceId ? 'default' : 'custom';
		const page = await this.marketplaceService.queryMarketplacePlugins({
			text: options.query,
			pageSize: options.pageSize ?? 30,
			cursor: options.cursor,
			marketplaceIds: new Set([this.reference.canonicalId]),
			marketplaceTypes,
		}, token);
		return {
			items: page.items.map(plugin => toMarketplaceEntry(plugin, registry, !!options.query)),
			total: page.total,
			nextCursor: page.nextCursor,
			...(page.errors.length ? { warning: page.errors.map(error => `${error.marketplace}: ${error.message}`).join('; ') } : {}),
		};
	}
}

function toMarketplaceEntry(plugin: IMarketplacePlugin, registry: 'custom' | 'default', search: boolean): ICustomizationMarketplaceSourceEntry {
	const publisher = getPluginPublisher(plugin);
	return {
		identifier: getPluginMarketplaceIdentifier(plugin),
		displayName: plugin.name,
		description: plugin.description,
		mediaType: getPluginMediaType(plugin)!,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		originLabel: plugin.marketplace,
		publisher: publisher?.name,
		...(publisher ? { publisherUrl: publisher.url } : {}),
		version: plugin.version,
		url: plugin.readmeUri,
		...(plugin.readmeUri ? { readmeUri: plugin.readmeUri } : {}),
		score: search ? 0 : undefined,
		priority: registry === 'custom' ? 1 : 0,
		installation: { kind: 'configuredPlugin' },
	};
}

function getPluginPublisher(plugin: IMarketplacePlugin): { readonly name: string; readonly url: URI } | undefined {
	let publisher: string | undefined;
	if (plugin.sourceDescriptor.kind === PluginSourceKind.GitHub) {
		publisher = plugin.sourceDescriptor.repo.split('/', 1)[0];
	} else if (plugin.sourceDescriptor.kind === PluginSourceKind.GitUrl) {
		const match = plugin.sourceDescriptor.url.match(/^https:\/\/github\.com\/(?<owner>[^/]+)\//i);
		if (match?.groups) {
			publisher = match.groups.owner;
		}
	}
	publisher ??= plugin.marketplaceReference.githubRepo?.split('/', 1)[0];
	return publisher ? { name: publisher, url: URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${publisher}` }) } : undefined;
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
