/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { localize } from '../../../../../nls.js';
import { AgentFinderRestProvider } from '../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPlatformCustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceIpc.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceService, ICustomizationMarketplaceFeatured, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, getEnabledCustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { createMcpGalleryMarketplaceProviders, getAllMcpGalleryMarketplaceSourceInfos, getCustomizationMarketplaceSourceInfos } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
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
	readonly allSources: ICustomizationMarketplaceService['sources'];
	readonly onDidChangeSources: Event<void>;
	readonly featuredSourceIds: readonly string[];
	get sources() {
		return [
			...getPluginCustomizationMarketplaceSourceInfos(this.configurationService, this.pluginMarketplaceService),
			...this.platformService.sources,
			CustomizationMarketplaceSources.CopilotConnectors,
		];
	}
	private readonly service: Lazy<CustomizationMarketplaceService>;
	private readonly agentFinderProvider: Lazy<AgentFinderRestProvider>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPlatformCustomizationMarketplaceService private readonly platformService: ICustomizationMarketplaceService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.allSources = [
			...getAllPluginCustomizationMarketplaceSourceInfos(),
			...(platformService.allSources ?? platformService.sources),
			CustomizationMarketplaceSources.CopilotConnectors,
		];
		this.featuredSourceIds = productService.defaultChatAgent?.agentFinderFeaturedFeedId
			? [CustomizationMarketplaceSources.AgentFinderPublicFeed.id]
			: [];
		const featuredAccountChanges = this.featuredSourceIds.length ? Event.any(
			Event.map(defaultAccountService.onDidChangeDefaultAccount, () => undefined),
			Event.map(Event.filter(authenticationService.onDidChangeSessions, event => {
				const account = defaultAccountService.currentDefaultAccount;
				return !!account && event.providerId === account.authenticationProvider.id &&
					[...event.event.added ?? [], ...event.event.changed ?? [], ...event.event.removed ?? []].some(session => session.id === account.sessionId);
			}), () => undefined),
		) : Event.None;
		this.onDidChangeSources = Event.any(
			pluginMarketplaceService.onDidChangeMarketplaces,
			platformService.onDidChangeSources ?? Event.None,
			featuredAccountChanges,
		);
		const platformProviders = (platformService.allSources ?? platformService.sources).map(source => {
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
			createLazyCustomizationMarketplaceProvider(CustomizationMarketplaceSources.CopilotConnectors.id, () => new CopilotConnectorsMarketplaceProvider(copilotConnectorsService, configurationService)),
		]));
		this.agentFinderProvider = new Lazy(() => instantiationService.createInstance(AgentFinderRestProvider));
	}

	getSourceRecoveryAction(sourceId: string): ICustomizationMarketplaceSourceRecoveryAction | undefined {
		if (sourceId === CustomizationMarketplaceSources.AgentFinderPublicFeed.id &&
			this.productService.defaultChatAgent?.agentFinderFeaturedFeedId &&
			!this.defaultAccountService.currentDefaultAccount) {
			return {
				label: localize('customizationMarketplace.signIn', "Sign In"),
				kind: 'signIn',
				run: async token => {
					const account = await raceCancellationError(this.defaultAccountService.signIn(), token);
					if (!account) {
						throw new CancellationError();
					}
				},
			};
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
			run: token => this.copilotConnectorsService.catalogMayRequireConsent
				? this.copilotConnectorsService.authorize(token)
				: this.copilotConnectorsService.signIn(token),
		};
	}

	async getFeatured(options: Pick<ICustomizationMarketplaceQuery, 'sourceIds'>, token: CancellationToken): Promise<ICustomizationMarketplaceFeatured | undefined> {
		const source = CustomizationMarketplaceSources.AgentFinderPublicFeed;
		const feedId = this.productService.defaultChatAgent?.agentFinderFeaturedFeedId;
		if (!feedId || !getEnabledCustomizationMarketplaceSources(this.configurationService, this.sources).some(candidate => candidate.id === source.id) ||
			(options.sourceIds && !options.sourceIds.includes(source.id))) {
			return undefined;
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		try {
			const authorization = await this.getAgentFinderAuthorization(token);
			const feed = await this.agentFinderProvider.value.getFeed(feedId, authorization, token);
			return {
				sourceId: source.id,
				items: feed.items.map(item => ({ ...item, sourceId: source.id })),
			};
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error)) {
				throw new CancellationError();
			}
			return { sourceId: source.id, items: [], error: getErrorMessage(error) };
		}
	}

	private async getAgentFinderAuthorization(token: CancellationToken): Promise<string> {
		const account = this.defaultAccountService.currentDefaultAccount ?? await raceCancellationError(this.defaultAccountService.getDefaultAccount(), token);
		if (!account) {
			throw new Error(localize('customizationMarketplace.agentFinderSignInRequired', "Sign in to view featured customizations."));
		}
		const sessions = await raceCancellationError(this.authenticationService.getSessions(account.authenticationProvider.id, [], { silent: true }, true), token);
		const currentAccount = this.defaultAccountService.currentDefaultAccount;
		if (!currentAccount || currentAccount.authenticationProvider.id !== account.authenticationProvider.id ||
			currentAccount.sessionId !== account.sessionId || currentAccount.accountName !== account.accountName) {
			throw new CancellationError();
		}
		const session = sessions.find(candidate => candidate.id === account.sessionId);
		if (!session) {
			throw new Error(localize('customizationMarketplace.agentFinderSignInRequired', "Sign in to view featured customizations."));
		}
		return session.accessToken;
	}

	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		return queryEnabledCustomizationMarketplaceSources(
			this.configurationService, this.sources, options, token,
			(request, token) => this.service.value.query(request, token),
		);
	}
}
