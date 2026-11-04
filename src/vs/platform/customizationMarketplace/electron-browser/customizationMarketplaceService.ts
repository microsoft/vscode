/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IMcpGalleryManifestService } from '../../mcp/common/mcpGalleryManifest.js';
import { IPlatformCustomizationMarketplaceService } from '../common/platformCustomizationMarketplaceService.js';
import { CustomizationMarketplaceQueryProgressCallback, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourcesChangeEvent } from '../common/customizationMarketplaceService.js';
import { queryEnabledCustomizationMarketplaceSources } from '../common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../common/mcpGalleryMarketplaceProvider.js';

export class NativeCustomizationMarketplaceService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources = getAllMcpGalleryMarketplaceSourceInfos();
	readonly onDidChangeSources: Event<ICustomizationMarketplaceSourcesChangeEvent>;
	get sources() { return getCustomizationMarketplaceSourceInfos(this.mcpGalleryManifestService.mcpGalleryManifestStatus); }
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
	) {
		this.onDidChangeSources = Event.map(mcpGalleryManifestService.onDidChangeMcpGalleryManifestStatus, () => ({ sourceIds: this.allSources.map(source => source.id) }));
		void mcpGalleryManifestService.getMcpGalleryManifest();
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			...createMcpGalleryMarketplaceProviders(instantiationService),
		]));
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken, onProgress?: CustomizationMarketplaceQueryProgressCallback): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token, onProgress) => this.service.value.query(request, token, onProgress),
			onProgress,
		);
	}
}

registerSingleton(IPlatformCustomizationMarketplaceService, NativeCustomizationMarketplaceService, InstantiationType.Delayed);
