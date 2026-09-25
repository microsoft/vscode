/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Lazy } from '../../../base/common/lazy.js';
import { revive } from '../../../base/common/marshalling.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IProductService } from '../../product/common/productService.js';
import { CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, IPublicCustomizationMarketplaceService } from '../common/customizationMarketplaceIpc.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService } from '../common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../common/mcpGalleryMarketplaceProvider.js';

export class NativeCustomizationMarketplaceService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources = getAllMcpGalleryMarketplaceSourceInfos();
	get sources() { return getCustomizationMarketplaceSourceInfos(this.configurationService, this.productService); }
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
	) {
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			...createMcpGalleryMarketplaceProviders(instantiationService),
			createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.AgentFinderPublicFeed.id, () => {
				const channel = sharedProcessService.getChannel(CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME);
				return {
					id: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
					query: async (options, token) => {
						const page = revive<ICustomizationMarketplacePage>(await channel.call<ICustomizationMarketplacePage>('query', {
							...options,
							cursor: options.cursor ? { token: options.cursor } : undefined,
							sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id],
						}, token));
						return { items: page.items, total: page.total, nextCursor: page.nextCursor?.token, error: page.sourceErrors?.[0]?.message };
					},
				};
			}),
		]));
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.service.value.query(request, token),
		);
	}
}

registerSingleton(IPublicCustomizationMarketplaceService, NativeCustomizationMarketplaceService, InstantiationType.Delayed);
