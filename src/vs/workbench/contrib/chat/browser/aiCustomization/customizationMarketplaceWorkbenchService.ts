/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { localize } from '../../../../../nls.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPlatformCustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceIpc.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { createPluginCustomizationMarketplaceProviders, getAllPluginCustomizationMarketplaceSourceInfos, getPluginCustomizationMarketplaceSourceInfos } from './pluginCustomizationMarketplaceProvider.js';
import { CopilotConnectorsMarketplaceProvider, ICopilotConnectorsService } from './copilotConnectorsService.js';

export class PlatformCustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources = getAllMcpGalleryMarketplaceSourceInfos();
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

export class CustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	get allSources() {
		return [
			...getAllPluginCustomizationMarketplaceSourceInfos(this.pluginMarketplaceService),
			...(this.platformService.allSources ?? this.platformService.sources),
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	readonly onDidChangeSources: Event<void>;
	get sources() {
		return [
			...getPluginCustomizationMarketplaceSourceInfos(this.configurationService, this.pluginMarketplaceService),
			...this.platformService.sources,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	private service: CustomizationMarketplaceService | undefined;
	private serviceSignature: string | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPlatformCustomizationMarketplaceService private readonly platformService: ICustomizationMarketplaceService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.onDidChangeSources = Event.any(
			pluginMarketplaceService.onDidChangeMarketplaces,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(ChatConfiguration.StrictMarketplaces)),
			platformService.onDidChangeSources ?? Event.None,
		);
	}

	private getService(): CustomizationMarketplaceService {
		const pluginProviders = createPluginCustomizationMarketplaceProviders(this.instantiationService, this.configurationService, this.pluginMarketplaceService);
		const platformProviders = (this.platformService.allSources ?? this.platformService.sources).map(source => {
			const providerId = `platform.${source.id}`;
			return createLazyCustomizationMarketplaceProvider(providerId, () => ({
				id: providerId,
				query: async (options, token) => {
					const page = await this.platformService.query({ ...options, sourceIds: [source.id], cursor: options.cursor ? { token: options.cursor } : undefined }, token);
					const sourceError = page.sourceErrors?.find(error => error.sourceId === source.id);
					return {
						items: page.items.map(({ sourceId: _sourceId, ...item }) => item),
						total: page.total,
						nextCursor: page.nextCursor?.token,
						...(sourceError
							? page.nextCursor ? { warning: sourceError.message } : { error: sourceError.message }
							: {}),
					};
				},
			}), source.id);
		});
		const signature = JSON.stringify([
			...pluginProviders.map(provider => provider.id),
			...platformProviders.map(provider => provider.id),
		]);
		if (!this.service || this.serviceSignature !== signature) {
			this.serviceSignature = signature;
			this.service = new CustomizationMarketplaceService([
				...pluginProviders,
				...platformProviders,
				createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.CopilotConnectors.id, () => new CopilotConnectorsMarketplaceProvider(this.copilotConnectorsService, this.configurationService)),
			]);
		}
		return this.service;
	}

	getSourceRecoveryAction(sourceId: string): ICustomizationMarketplaceSourceRecoveryAction | undefined {
		if (sourceId !== CustomizationMarketplaceSources.CopilotConnectors.id ||
			this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) !== true ||
			!this.copilotConnectorsService.authorizationRequired) {
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
			(request, token) => this.getService().query(request, token),
		);
	}
}
