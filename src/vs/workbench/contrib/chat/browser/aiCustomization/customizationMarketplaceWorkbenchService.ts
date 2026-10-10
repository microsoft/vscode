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
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceRecoveryGroup, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { CopilotConnectorsMarketplaceProvider, ICopilotConnectorsService } from './copilotConnectorsService.js';
import { isAgentFinderPublicFeedAvailable } from './customizationMarketplaceConfiguration.js';
import { createPluginCustomizationMarketplaceProviders, getAllPluginCustomizationMarketplaceSourceInfos, getPluginCustomizationMarketplaceSourceInfos } from './pluginCustomizationMarketplaceProvider.js';

export class PlatformCustomizationMarketplaceWorkbenchService implements ICustomizationMarketplaceService {
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

export class CustomizationMarketplaceWorkbenchService extends Disposable implements ICustomizationMarketplaceService {
	declare readonly _serviceBrand: undefined;
	get allSources() {
		return [
			...getAllPluginCustomizationMarketplaceSourceInfos(this.pluginMarketplaceService),
			...(this.platformService.allSources ?? this.platformService.sources),
			CustomizationMarketplaceSources.AgentFinderPublicFeed,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	readonly onDidChangeSources: Event<void>;
	get sources(): readonly ICustomizationMarketplaceSourceInfo[] {
		const githubFeedAvailable = this.isGitHubFeedAvailable();
		const harnessSources = githubFeedAvailable
			? [CustomizationMarketplaceSources.AgentFinderPublicFeed]
			: [];
		return [
			...getPluginCustomizationMarketplaceSourceInfos(this.configurationService, this.pluginMarketplaceService, githubFeedAvailable),
			...this.platformService.sources.filter(source => source.id !== CustomizationMarketplaceSources.AgentFinderPublicFeed.id),
			...harnessSources,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	private readonly harnessBindingCancellation: MutableDisposable<CancellationTokenSource>;
	private service: CustomizationMarketplaceService | undefined;
	private serviceSignature: string | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPlatformCustomizationMarketplaceService private readonly platformService: ICustomizationMarketplaceService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.harnessBindingCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.harnessService.activeSessionResource.read(reader);
			this.harnessBindingCancellation.value = new CancellationTokenSource();
		}));
		this.onDidChangeSources = Event.any(
			pluginMarketplaceService.onDidChangeMarketplaces,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(ChatConfiguration.StrictMarketplaces)),
			platformService.onDidChangeSources ?? Event.None,
			Event.fromObservableLight(this.harnessService.activeHarness),
			Event.fromObservableLight(this.harnessService.activeSessionResource),
		);
	}

	private isGitHubFeedAvailable(): boolean {
		return isAgentFinderPublicFeedAvailable(
			this.configurationService,
			!!this.harnessService.getActiveDescriptor().marketplaceSearchProvider,
		);
	}

	private getService(): CustomizationMarketplaceService {
		const githubFeedAvailable = this.isGitHubFeedAvailable();
		const pluginProviders = createPluginCustomizationMarketplaceProviders(
			this.instantiationService,
			this.configurationService,
			this.pluginMarketplaceService,
			githubFeedAvailable,
		);
		const platformProviders = (this.platformService.allSources ?? this.platformService.sources)
			.filter(source => source.id !== CustomizationMarketplaceSources.AgentFinderPublicFeed.id)
			.map(source => {
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
			githubFeedAvailable,
			...pluginProviders.map(provider => provider.id),
			...platformProviders.map(provider => provider.id),
		]);
		if (!this.service || this.serviceSignature !== signature) {
			this.serviceSignature = signature;
			this.service = new CustomizationMarketplaceService([
				...pluginProviders,
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
				createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.CopilotConnectors.id, () => new CopilotConnectorsMarketplaceProvider(this.copilotConnectorsService, this.configurationService)),
			]);
		}
		return this.service;
	}

	getSourceRecoveryAction(sourceId: string): ICustomizationMarketplaceSourceRecoveryAction | undefined {
		if (sourceId === CustomizationMarketplaceSources.AgentFinderPublicFeed.id) {
			return this.isGitHubFeedAvailable()
				? this.harnessService.getActiveDescriptor().marketplaceSearchProvider?.getRecoveryAction?.()
				: undefined;
		}
		if (sourceId !== CustomizationMarketplaceSources.CopilotConnectors.id ||
			this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) !== true ||
			!this.copilotConnectorsService.authorizationRequired) {
			return undefined;
		}
		return {
			label: localize('customizationMarketplace.signIn', "Sign In"),
			kind: 'signIn',
			groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount,
			run: token => this.copilotConnectorsService.signIn(token),
		};
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		const sources = this.sources.map(source => source.id === CustomizationMarketplaceSources.AgentFinderPublicFeed.id ? {
			...source,
			configurationDependencies: [...(source.configurationDependencies ?? []), ChatConfiguration.StrictMarketplaces],
		} : source);
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, sources, options, token,
			(request, token) => this.getService().query(request, token),
		);
	}
}
