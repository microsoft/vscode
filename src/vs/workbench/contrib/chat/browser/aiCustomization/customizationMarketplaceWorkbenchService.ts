/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPlatformCustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/platformCustomizationMarketplaceService.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceRecoveryGroup, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { createPluginCustomizationMarketplaceProviders, getAllPluginCustomizationMarketplaceSourceInfos, getPluginCustomizationMarketplaceSourceInfos } from './pluginCustomizationMarketplaceProvider.js';
import { CopilotConnectorsMarketplaceProvider, ICopilotConnectorsService } from './copilotConnectorsService.js';

export class PlatformCustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources = getAllMcpGalleryMarketplaceSourceInfos();
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

export class CustomizationMarketplaceWorkbenchService extends Disposable implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	readonly allSources: ICustomizationMarketplaceService['sources'];
	readonly onDidChangeSources: Event<void>;
	get sources() {
		const harnessSources = this.harnessService.getActiveDescriptor().marketplaceSearchProvider
			? [CustomizationMarketplaceSources.AgentFinderPublicFeed]
			: [];
		return [
			...getPluginCustomizationMarketplaceSourceInfos(this.configurationService, this.pluginMarketplaceService),
			...this.platformService.sources.filter(source => source.id !== CustomizationMarketplaceSources.AgentFinderPublicFeed.id),
			...harnessSources,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	private readonly service: Lazy<CustomizationMarketplaceService>;
	private readonly harnessBindingCancellation: MutableDisposable<CancellationTokenSource>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPlatformCustomizationMarketplaceService private readonly platformService: ICustomizationMarketplaceService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.harnessBindingCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.harnessService.activeSessionResource.read(reader);
			this.harnessBindingCancellation.value = new CancellationTokenSource();
		}));
		const platformSources = (platformService.allSources ?? platformService.sources)
			.filter(source => source.id !== CustomizationMarketplaceSources.AgentFinderPublicFeed.id);
		this.allSources = [
			...getAllPluginCustomizationMarketplaceSourceInfos(),
			...platformSources,
			CustomizationMarketplaceSources.AgentFinderPublicFeed,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
		this.onDidChangeSources = Event.any(
			pluginMarketplaceService.onDidChangeMarketplaces,
			platformService.onDidChangeSources ?? Event.None,
			Event.fromObservableLight(this.harnessService.activeHarness),
			Event.fromObservableLight(this.harnessService.activeSessionResource),
		);
		const platformProviders = platformSources.map(source => {
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
		this.service = new Lazy(() => new CustomizationMarketplaceService([
			...createPluginCustomizationMarketplaceProviders(instantiationService),
			...platformProviders,
			createLazyCustomizationMarketplaceProvider('harness.githubFeed', () => ({
				id: 'harness.githubFeed',
				query: async (options, token) => {
					const cacheToken = this.harnessBindingCancellation.value?.token;
					const provider = this.harnessService.getActiveDescriptor().marketplaceSearchProvider;
					if (!provider || !cacheToken || cacheToken.isCancellationRequested) {
						return { items: [], total: 0, ...(cacheToken ? { cacheToken } : {}) };
					}
					const page = await provider.query(this.harnessService.activeSessionResource.get(), options, token);
					return page ? { ...page, cacheToken } : { items: [], total: 0, cacheToken };
				},
			}), CustomizationMarketplaceSources.AgentFinderPublicFeed.id),
			createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.CopilotConnectors.id, () => new CopilotConnectorsMarketplaceProvider(copilotConnectorsService, configurationService)),
		]));
	}

	getSourceRecoveryAction(sourceId: string): ICustomizationMarketplaceSourceRecoveryAction | undefined {
		if (sourceId === CustomizationMarketplaceSources.AgentFinderPublicFeed.id) {
			return this.harnessService.getActiveDescriptor().marketplaceSearchProvider?.getRecoveryAction?.();
		}
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
			...(this.copilotConnectorsService.catalogMayRequireConsent ? {} : { groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount }),
			run: token => this.copilotConnectorsService.catalogMayRequireConsent
				? this.copilotConnectorsService.authorize(token)
				: this.copilotConnectorsService.signIn(token),
		};
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.service.value.query(request, token),
		);
	}
}
