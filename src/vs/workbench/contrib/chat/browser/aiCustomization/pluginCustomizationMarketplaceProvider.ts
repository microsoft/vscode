/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType } from '../../common/plugins/pluginMarketplaceService.js';
import { ChatConfiguration } from '../../common/constants.js';

export function getPluginMarketplaceIdentifier(plugin: IMarketplacePlugin): string {
	return JSON.stringify([plugin.marketplaceReference.canonicalId, plugin.name, plugin.sourceDescriptor, plugin.version]);
}

export class PluginCustomizationMarketplaceProvider extends Disposable implements ICustomizationMarketplaceProvider {
	readonly id = 'pluginMarketplaces';
	private generation = 0;
	private readonly continuations = new LRUCache<string, {
		readonly query: string;
		readonly mediaType: string | undefined;
		readonly pageSize: number;
		readonly entries: readonly ICustomizationMarketplaceEntry[];
		readonly errors: readonly string[];
		readonly offset: number;
		readonly expiresAt: number;
	}>(32);

	constructor(
		@IPluginMarketplaceService private readonly marketplaceService: IPluginMarketplaceService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this._register(marketplaceService.onDidChangeMarketplaces(() => this.invalidate()));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.StrictMarketplaces) ||
				event.affectsConfiguration(CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled)) {
				this.invalidate();
			}
		}));
	}

	private invalidate(): void {
		this.generation++;
		this.continuations.clear();
	}

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (options.mediaType && options.mediaType !== CustomizationMarketplaceMediaType.CopilotPlugin && options.mediaType !== CustomizationMarketplaceMediaType.ClaudePlugin) {
			return { items: [], total: 0 };
		}
		const query = options.query?.toLowerCase() ?? '';
		const generation = this.generation;
		const pageSize = Math.min(options.pageSize ?? 30, 100);
		const continuation = options.cursor ? this.continuations.get(options.cursor) : undefined;
		if (options.cursor && (!continuation || continuation.expiresAt <= Date.now() || continuation.query !== query ||
			continuation.mediaType !== options.mediaType || continuation.pageSize !== pageSize)) {
			throw new Error(localize('pluginMarketplace.invalidPage', "The plugin marketplace page is invalid. Start a new search."));
		}
		const errors: string[] = [];
		const plugins = continuation ? [] : await this.marketplaceService.fetchMarketplacePlugins(token, undefined, {
			onMarketplaceError: (reference, error) => errors.push(`${reference.displayLabel}: ${getErrorMessage(error)}`),
		});
		if (token.isCancellationRequested || generation !== this.generation) {
			throw new CancellationError();
		}
		const entries = continuation?.entries ?? plugins.flatMap(plugin => {
			const mediaType = getPluginMediaType(plugin);
			if (!mediaType ||
				(this.marketplaceService.isStrictMarketplacePolicyActive() && !this.marketplaceService.isMarketplaceTrusted(plugin.marketplaceReference)) ||
				(options.mediaType && mediaType !== options.mediaType) ||
				(query && ![plugin.name, plugin.description, plugin.marketplace].some(value => value.toLowerCase().includes(query)))) {
				return [];
			}
			return [{
				identifier: getPluginMarketplaceIdentifier(plugin),
				displayName: plugin.name,
				description: plugin.description,
				mediaType,
				tags: [],
				capabilities: [],
				representativeQueries: [],
				originLabel: plugin.marketplace,
				version: plugin.version,
				url: plugin.readmeUri,
				score: query ? 0 : undefined,
			} satisfies ICustomizationMarketplaceEntry];
		});
		const offset = continuation?.offset ?? 0;
		const end = Math.min(offset + pageSize, entries.length);
		const nextCursor = end < entries.length ? generateUuid() : undefined;
		if (nextCursor) {
			this.continuations.set(nextCursor, {
				query, mediaType: options.mediaType, pageSize, entries, errors: continuation?.errors ?? errors,
				offset: end, expiresAt: Date.now() + 30 * 60_000,
			});
		}
		const sourceErrors = continuation?.errors ?? errors;
		return {
			items: entries.slice(offset, end),
			total: sourceErrors.length ? undefined : entries.length,
			nextCursor,
			...(sourceErrors.length ? { warning: sourceErrors.join('; ') } : {}),
		};
	}
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
