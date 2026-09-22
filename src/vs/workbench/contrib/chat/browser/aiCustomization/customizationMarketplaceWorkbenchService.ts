/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { AgentFinderSource } from '../../../../../platform/agentFinder/common/agentFinderSource.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';

export class CustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.service = new Lazy(() => {
			const provider = instantiationService.createInstance(AgentFinderRestProvider);
			return new CustomizationMarketplaceService([new AgentFinderSource(provider, provider)]);
		});
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled) !== true || token.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		return this.service.value.query(options, token);
	}
}
