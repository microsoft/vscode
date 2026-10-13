/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js'; import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import type { IAgentPlugin } from '../../common/plugins/agentPluginService.js';
import type { IMarketplacePlugin, IMarketplaceReference, IPluginSourceDescriptor, MarketplaceType } from '../../common/plugins/pluginMarketplaceService.js';

export const enum AgentPluginItemKind {
	Installed = 'installed',
	Marketplace = 'marketplace',
}

export interface IInstalledPluginItem {
	readonly kind: AgentPluginItemKind.Installed;
	readonly name: string;
	readonly description: string;
	readonly marketplace?: string;
	readonly plugin: IAgentPlugin;
	/** When set, indicates the plugin has a newer version in the marketplace. */
	readonly outdated?: IObservable<IMarketplacePlugin | undefined>;
}

export interface IMarketplacePluginItem {
	readonly kind: AgentPluginItemKind.Marketplace;
	readonly name: string;
	readonly description: string;
	readonly version?: string;
	readonly source: string;
	readonly sourceDescriptor: IPluginSourceDescriptor;
	readonly marketplace: string;
	readonly marketplaceReference: IMarketplaceReference;
	readonly marketplaceType: MarketplaceType;
	readonly readmeUri?: URI;
}

export type IAgentPluginItem = IInstalledPluginItem | IMarketplacePluginItem;

/** Finds a discovered installation even when a marketplace update has changed its URI. */
export function findInstalledPlugin(plugins: readonly IAgentPlugin[], uri: URI, marketplace?: Pick<IMarketplacePlugin, 'name' | 'marketplaceReference'>): IAgentPlugin | undefined {
	return plugins.find(plugin => isEqual(plugin.uri, uri)
		|| (marketplace && plugin.fromMarketplace?.name === marketplace.name && plugin.fromMarketplace.marketplaceReference.canonicalId === marketplace.marketplaceReference.canonicalId));
}
