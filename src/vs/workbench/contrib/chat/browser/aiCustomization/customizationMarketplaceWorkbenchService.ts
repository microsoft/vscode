/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPlatformCustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/platformCustomizationMarketplaceService.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceRecoveryGroup, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceInfo, ICustomizationMarketplaceManagementProvider, ICustomizationMarketplaceSearchProvider } from '../../common/customizationHarnessService.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { CopilotConnectorsMarketplaceProvider, ICopilotConnectorsService } from './copilotConnectorsService.js';
import { isAgentFinderPublicFeedAvailable } from './customizationMarketplaceConfiguration.js';
import { createPluginCustomizationMarketplaceProviders, getAllPluginCustomizationMarketplaceSourceInfos, getPluginCustomizationMarketplaceSourceInfos } from './pluginCustomizationMarketplaceProvider.js';

export function getProviderMarketplaceSourceId(name: string): string {
	return `providerPluginMarketplace.${encodeURIComponent(name)}`;
}

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
		const pluginSources = this.marketplaceManagementProvider
			? []
			: getAllPluginCustomizationMarketplaceSourceInfos(this.pluginMarketplaceService);
		return [
			...pluginSources,
			...this.getProviderMarketplaceSources(true),
			...(this.platformService.allSources ?? this.platformService.sources),
			CustomizationMarketplaceSources.AgentFinderPublicFeed,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	readonly onDidChangeSources: Event<void>;
	get sources(): readonly ICustomizationMarketplaceSourceInfo[] {
		const githubFeedAvailable = this.isGitHubFeedAvailable();
		const pluginSources = this.marketplaceManagementProvider
			? []
			: getPluginCustomizationMarketplaceSourceInfos(this.configurationService, this.pluginMarketplaceService, githubFeedAvailable);
		const harnessSources = githubFeedAvailable
			? [CustomizationMarketplaceSources.AgentFinderPublicFeed]
			: [];
		return [
			...pluginSources,
			...this.getProviderMarketplaceSources(false),
			...this.platformService.sources.filter(source => source.id !== CustomizationMarketplaceSources.AgentFinderPublicFeed.id),
			...harnessSources,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	private readonly harnessBindingCancellation: MutableDisposable<CancellationTokenSource>;
	private readonly marketplaceManagementBinding = this._register(new MutableDisposable<DisposableStore>());
	private readonly _onDidChangeSources = this._register(new Emitter<void>());
	private providerMarketplaces: readonly ICustomizationMarketplaceInfo[] = [];
	private marketplaceSessionResource: URI | undefined;
	private marketplaceSearchProvider: ICustomizationMarketplaceSearchProvider | undefined;
	private marketplaceManagementProvider: ICustomizationMarketplaceManagementProvider | undefined;
	private marketplaceManagementVersion = 0;
	private marketplaceManagementRefreshVersion = 0;
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
			this.harnessService.availableHarnesses.read(reader);
			const sessionResource = this.harnessService.activeSessionResource.read(reader);
			const descriptor = this.harnessService.getDescriptorForSession(sessionResource);
			this.harnessBindingCancellation.value = new CancellationTokenSource();
			this.bindMarketplaceProviders(
				sessionResource,
				descriptor?.marketplaceSearchProvider,
				descriptor?.marketplaceManagementProvider,
			);
		}));
		this.onDidChangeSources = Event.any(
			this._onDidChangeSources.event,
			pluginMarketplaceService.onDidChangeMarketplaces,
			Event.filter(configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(ChatConfiguration.PluginsEnabled)),
			platformService.onDidChangeSources ?? Event.None,
			Event.fromObservableLight(this.harnessService.activeHarness),
			Event.fromObservableLight(this.harnessService.activeSessionResource),
		);
	}

	private getProviderMarketplaceSources(includeUnavailable: boolean): readonly ICustomizationMarketplaceSourceInfo[] {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) !== true) {
			return [];
		}
		return this.providerMarketplaces
			.filter(marketplace => includeUnavailable || marketplace.available !== false)
			.map(marketplace => ({
				id: getProviderMarketplaceSourceId(marketplace.name),
				displayName: marketplace.name,
				enablementSetting: CustomizationMarketplaceConfiguration.MarketplaceEnabled,
				configurationDependencies: [ChatConfiguration.PluginsEnabled],
			}));
	}

	private bindMarketplaceProviders(
		sessionResource: URI,
		searchProvider: ICustomizationMarketplaceSearchProvider | undefined,
		managementProvider: ICustomizationMarketplaceManagementProvider | undefined,
	): void {
		this.marketplaceSessionResource = sessionResource;
		this.marketplaceSearchProvider = searchProvider;
		this.marketplaceManagementProvider = managementProvider;
		const version = ++this.marketplaceManagementVersion;
		const hadMarketplaces = this.providerMarketplaces.length > 0;
		this.providerMarketplaces = [];
		if (hadMarketplaces) {
			this._onDidChangeSources.fire();
		}
		if (!managementProvider) {
			this.marketplaceManagementBinding.clear();
			return;
		}
		const store = new DisposableStore();
		this.marketplaceManagementBinding.value = store;
		store.add(managementProvider.onDidChange(() => void this.refreshProviderMarketplaces(sessionResource, managementProvider, version, true)));
		void this.refreshProviderMarketplaces(sessionResource, managementProvider, version);
	}

	private async refreshProviderMarketplaces(sessionResource: URI, provider: ICustomizationMarketplaceManagementProvider, version: number, forceChangeEvent = false): Promise<void> {
		const refreshVersion = ++this.marketplaceManagementRefreshVersion;
		try {
			const marketplaces = await provider.list(sessionResource);
			if (version !== this.marketplaceManagementVersion || refreshVersion !== this.marketplaceManagementRefreshVersion || this._store.isDisposed) {
				return;
			}
			const previous = JSON.stringify(this.providerMarketplaces);
			this.providerMarketplaces = marketplaces;
			if (forceChangeEvent || JSON.stringify(marketplaces) !== previous) {
				this._onDidChangeSources.fire();
			}
		} catch (error) {
			if (version === this.marketplaceManagementVersion && !this._store.isDisposed) {
				onUnexpectedError(error);
			}
		}
	}

	private isGitHubFeedAvailable(): boolean {
		return isAgentFinderPublicFeedAvailable(
			this.pluginMarketplaceService,
			!!this.marketplaceSearchProvider,
		);
	}

	private getService(): CustomizationMarketplaceService {
		const githubFeedAvailable = this.isGitHubFeedAvailable();
		const managementProvider = this.marketplaceManagementProvider;
		const pluginProviders = managementProvider
			? []
			: createPluginCustomizationMarketplaceProviders(
				this.instantiationService,
				this.configurationService,
				this.pluginMarketplaceService,
				githubFeedAvailable,
			);
		const providerMarketplaceProviders = managementProvider
			? this.providerMarketplaces
				.filter(marketplace => marketplace.available !== false)
				.map(marketplace => createLazyCustomizationMarketplaceProvider(
					getProviderMarketplaceSourceId(marketplace.name),
					() => ({
						id: getProviderMarketplaceSourceId(marketplace.name),
						query: (options, token) => {
							const sessionResource = this.marketplaceSessionResource;
							return sessionResource
								? managementProvider.queryMarketplace(sessionResource, marketplace, options, token)
								: Promise.resolve({ items: [], total: 0 });
						},
					}),
				))
			: [];
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
			...providerMarketplaceProviders.map(provider => provider.id),
			...platformProviders.map(provider => provider.id),
		]);
		if (!this.service || this.serviceSignature !== signature) {
			this.serviceSignature = signature;
			this.service = new CustomizationMarketplaceService([
				...pluginProviders,
				...providerMarketplaceProviders,
				...platformProviders,
				createLazyCustomizationMarketplaceProvider('harness.githubFeed', () => ({
					id: 'harness.githubFeed',
					query: async (options, token) => {
						const cacheToken = this.harnessBindingCancellation.value?.token;
						const provider = this.marketplaceSearchProvider;
						const sessionResource = this.marketplaceSessionResource;
						if (!provider || !sessionResource || !cacheToken || cacheToken.isCancellationRequested) {
							return { items: [], total: 0, ...(cacheToken ? { cacheToken } : {}) };
						}
						const page = await provider.query(sessionResource, options, token);
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
				? this.marketplaceSearchProvider?.getRecoveryAction?.()
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

	async query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		const sources = this.sources;
		const queriesPlugins = sources.some(source => (!options.sourceIds || options.sourceIds.includes(source.id)) &&
			(source.id.startsWith(CustomizationMarketplaceSources.PluginMarketplaces.id) || source.id.startsWith('providerPluginMarketplace.')));
		const queriesPublicFeed = sources.some(source => source.id === CustomizationMarketplaceSources.AgentFinderPublicFeed.id &&
			(!options.sourceIds || options.sourceIds.includes(source.id)));
		const strictPolicyActive = this.pluginMarketplaceService.isStrictMarketplacePolicyActive();
		store.add(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
			if (queriesPlugins || queriesPublicFeed && strictPolicyActive !== this.pluginMarketplaceService.isStrictMarketplacePolicyActive()) {
				cancellation.cancel();
			}
		}));
		try {
			return await queryEnabledCustomizationMarketplaceSources(
				this.configurationService, sources, options, cancellation.token,
				(request, token) => this.getService().query(request, token),
			);
		} finally {
			store.dispose();
		}
	}
}
