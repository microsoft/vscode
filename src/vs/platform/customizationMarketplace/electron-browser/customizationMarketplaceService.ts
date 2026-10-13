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
import { IPlatformCustomizationMarketplaceService } from '../common/platformCustomizationMarketplaceService.js';
import { CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService } from '../common/customizationMarketplaceService.js';
import { queryEnabledCustomizationMarketplaceSources } from '../common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../common/mcpGalleryMarketplaceProvider.js';

export class NativeCustomizationMarketplaceService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources = getAllMcpGalleryMarketplaceSourceInfos();
	readonly onDidChangeSources = Event.None;
	get sources() { return getCustomizationMarketplaceSourceInfos(); }
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			...createMcpGalleryMarketplaceProviders(instantiationService),
		]));
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.service.value.query(request, token),
		);
	}
}

registerSingleton(IPlatformCustomizationMarketplaceService, NativeCustomizationMarketplaceService, InstantiationType.Delayed);
