/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { localize } from '../../../../../nls.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceService, IAgentFinderMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceProvider, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getCustomizationMarketplaceSourceInfos } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { CopilotConnectorsMarketplaceProvider, ICopilotConnectorsService } from './copilotConnectorsService.js';

export class AgentFinderMarketplaceWorkbenchService implements IAgentFinderMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources = [
		CustomizationMarketplaceSources.McpGallery,
		CustomizationMarketplaceSources.AgentFinderPublicFeed,
	];
	get sources() { return getCustomizationMarketplaceSourceInfos(this.configurationService, this.productService); }
	private readonly service: Lazy<CustomizationMarketplaceService>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
	) {
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			...createMcpGalleryMarketplaceProviders(instantiationService),
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

class MarketplaceServiceProvider implements ICustomizationMarketplaceProvider {
	constructor(
		readonly id: string,
		private readonly service: IAgentFinderMarketplaceService,
	) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		const page = await this.service.query({
			query: options.query,
			mediaType: options.mediaType,
			pageSize: options.pageSize,
			cursor: options.cursor === undefined ? undefined : { token: options.cursor },
			sourceIds: [this.id],
		}, token);
		if (page.sourceErrors?.some(error => error.sourceId !== this.id)) {
			throw new Error('Unexpected built-in marketplace source failure.');
		}
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
			error: page.sourceErrors?.[0]?.message,
		};
	}
}

export class CustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	private readonly service: CustomizationMarketplaceService;

	constructor(
		@IAgentFinderMarketplaceService private readonly baseMarketplaceService: IAgentFinderMarketplaceService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		const baseSources = baseMarketplaceService.allSources ?? baseMarketplaceService.sources ?? [CustomizationMarketplaceSources.AgentFinderPublicFeed];
		this.service = new CustomizationMarketplaceService([
			...baseSources.map(source => createLazyCustomizationMarketplaceProvider(source.id, () => new MarketplaceServiceProvider(source.id, baseMarketplaceService))),
			createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.CopilotConnectors.id, () => new CopilotConnectorsMarketplaceProvider(copilotConnectorsService, configurationService)),
		]);
	}

	get allSources() {
		return [...(this.baseMarketplaceService.allSources ?? this.baseMarketplaceService.sources ?? [CustomizationMarketplaceSources.AgentFinderPublicFeed]), CustomizationMarketplaceSources.CopilotConnectors];
	}

	get sources() {
		return [...(this.baseMarketplaceService.sources ?? [CustomizationMarketplaceSources.AgentFinderPublicFeed]), CustomizationMarketplaceSources.CopilotConnectors];
	}

	getSourceRecoveryAction(sourceId: string): ICustomizationMarketplaceSourceRecoveryAction | undefined {
		if (sourceId !== CustomizationMarketplaceSources.CopilotConnectors.id || !this.copilotConnectorsService.authorizationRequired) {
			return undefined;
		}
		return {
			label: this.copilotConnectorsService.catalogMayRequireConsent
				? localize('customizationMarketplace.authorizeConnectors', "Authorize Connectors")
				: localize('customizationMarketplace.signIn', "Sign In"),
			kind: 'signIn',
			run: token => this.copilotConnectorsService.catalogMayRequireConsent
				? this.copilotConnectorsService.authorize(token)
				: this.copilotConnectorsService.signIn(token),
		};
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.service.query(request, token),
		);
	}
}
