/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { AgentFinderSource } from '../../../../../platform/agentFinder/common/agentFinderSource.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createLazyCustomizationMarketplaceSource, CustomizationMarketplaceService, IAgentFinderMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CopilotConnectorsMarketplaceSource, ICopilotConnectorsService } from './copilotConnectorsService.js';

export class AgentFinderMarketplaceWorkbenchService implements IAgentFinderMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			createLazyCustomizationMarketplaceSource(CustomizationMarketplaceSources.AgentFinderPublicFeed.id, () => {
				const provider = instantiationService.createInstance(AgentFinderRestProvider);
				return new AgentFinderSource(provider, provider);
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

class AgentFinderMarketplaceSource implements ICustomizationMarketplaceSource {
	readonly id = CustomizationMarketplaceSources.AgentFinderPublicFeed.id;

	constructor(private readonly service: IAgentFinderMarketplaceService) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		const page = await this.service.query({
			query: options.query,
			mediaType: options.mediaType,
			pageSize: options.pageSize,
			cursor: options.cursor === undefined ? undefined : { token: options.cursor },
		}, token);
		return {
			items: page.items.map(item => {
				const { sourceId, ...entry } = item;
				if (sourceId !== this.id) {
					throw new Error(`Unexpected built-in marketplace source '${sourceId}'.`);
				}
				return entry;
			}),
			total: page.total,
			nextCursor: page.nextCursor?.token,
		};
	}
}

export class CustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly sources = Object.values(CustomizationMarketplaceSources);
	private readonly service: CustomizationMarketplaceService;

	constructor(
		@IAgentFinderMarketplaceService agentFinderService: IAgentFinderMarketplaceService,
		@ICopilotConnectorsService copilotConnectorsService: ICopilotConnectorsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.service = new CustomizationMarketplaceService([
			createLazyCustomizationMarketplaceSource(CustomizationMarketplaceSources.AgentFinderPublicFeed.id, () => new AgentFinderMarketplaceSource(agentFinderService)),
			createLazyCustomizationMarketplaceSource(CustomizationMarketplaceSources.CopilotConnectors.id, () => new CopilotConnectorsMarketplaceSource(copilotConnectorsService, configurationService)),
		]);
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.service.query(request, token),
		);
	}
}
