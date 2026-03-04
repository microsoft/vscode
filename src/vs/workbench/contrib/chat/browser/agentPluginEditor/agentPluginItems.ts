/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import type { IAgentPlugin } from '../../common/plugins/agentPluginService.js';
import type { IMarketplaceReference, MarketplaceType } from '../../common/plugins/pluginMarketplaceService.js';

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
}

export interface IMarketplacePluginItem {
	readonly kind: AgentPluginItemKind.Marketplace;
	readonly name: string;
	readonly description: string;
	readonly source: string;
	readonly marketplace: string;
	readonly marketplaceReference: IMarketplaceReference;
	readonly marketplaceType: MarketplaceType;
	readonly readmeUri?: URI;
}

export type IAgentPluginItem = IInstalledPluginItem | IMarketplacePluginItem;
