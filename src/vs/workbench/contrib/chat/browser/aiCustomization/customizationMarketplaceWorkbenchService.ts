/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPublicCustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceIpc.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { createPluginCustomizationMarketplaceProviders, getAllPluginCustomizationMarketplaceSourceInfos, getPluginCustomizationMarketplaceSourceInfos } from './pluginCustomizationMarketplaceProvider.js';

export class PublicCustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.AgentFinderPublicFeed.id, () => instantiationService.createInstance(AgentFinderRestProvider)),
		]));
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.service.value.query(request, token),
		);
	}
}

export class CustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources = getAllPluginCustomizationMarketplaceSourceInfos();
	get sources() { return getPluginCustomizationMarketplaceSourceInfos(this.configurationService, this.pluginMarketplaceService); }
	get onDidChangeSources() { return this.pluginMarketplaceService.onDidChangeMarketplaces; }
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPublicCustomizationMarketplaceService private readonly publicService: ICustomizationMarketplaceService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			...createPluginCustomizationMarketplaceProviders(instantiationService),
			createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.AgentFinderPublicFeed.id, () => ({
				id: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
				query: async (options, token) => {
					const page = await this.publicService.query({ ...options, sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id], cursor: options.cursor ? { token: options.cursor } : undefined }, token);
					const sourceError = page.sourceErrors?.find(error => error.sourceId === CustomizationMarketplaceSources.AgentFinderPublicFeed.id);
					return {
						items: page.items.map(({ sourceId: _sourceId, ...item }) => item),
						total: page.total,
						nextCursor: page.nextCursor?.token,
						...(sourceError
							? page.nextCursor ? { warning: sourceError.message } : { error: sourceError.message }
							: {}),
					};
				},
			})),
		]));
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(this.configurationService, this.sources, options, token,
			(request, token) => this.service.value.query(request, token));
	}
}
