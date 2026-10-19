/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentCustomizationInstallation, IAgentCustomizationInstallationApplyResult, IAgentCustomizationInstallationRequest, IAgentCustomizationInstallationReview } from '../../../../../../platform/agentHost/common/agent.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceRecoveryGroup, ICustomizationMarketplaceResource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import type { IMcpServerConfiguration } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IRecordedCustomizationMarketplaceResource, ICustomizationMarketplaceInstallProvider } from '../../../common/customizationMarketplaceInstallService.js';
import { ICustomizationMarketplaceInfo, ICustomizationMarketplaceManagementProvider, ICustomizationMarketplaceSearchProvider, ICustomizationMcpConfigurationProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { getGitHubMcpRegistryIcon } from '../../aiCustomization/githubMcpRegistryIcons.js';

const maxCachedReceiptSessions = 50;
const maxCatalogAssociations = 1000;
const pluginInventoryUpdateTimeoutMs = 30_000;
const githubLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export class AgentHostCustomizationMarketplaceInstallProvider extends Disposable implements ICustomizationMarketplaceInstallProvider, ICustomizationMarketplaceSearchProvider, ICustomizationMarketplaceManagementProvider, ICustomizationMcpConfigurationProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	private readonly receiptInstallations = new ResourceMap<readonly IRecordedCustomizationMarketplaceResource[]>();
	private readonly unavailableCatalogItems = new Map<string, string>();
	private readonly catalogAssociations = new Map<string, ICustomizationMarketplaceResource>();
	private readonly catalogAuthenticationRequired = new Set<string>();
	readonly onDidChange: Event<void>;

	constructor(
		private readonly providerId: string,
		private readonly resolveAuthentication: () => Promise<boolean>,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.onDidChange = Event.any(
			this._onDidChange.event,
			this.agentHostCustomizationService.onDidChangeCustomizations,
			Event.fromObservableLight(this.agentPluginService.plugins),
			this.agentHostService.onAgentHostStart,
			Event.map(this.agentHostService.onAgentHostExit, () => undefined),
		);
	}

	getInstallUnavailableMessage(resource: ICustomizationMarketplaceResource): string | undefined {
		const installation = resource.installation;
		if (installation?.kind === 'providerCatalog') {
			return this.unavailableCatalogItems.get(installation.selectionId);
		}

		if (installation?.kind === 'plugin') {
			return localize('agentHost.customizationInstall.directPluginUnavailable', "The SDK cannot yet install a catalog plugin at its exact pinned revision.");
		}
		if (installation?.kind === 'providerPlugin' && !installation.marketplaceSource) {
			return localize('agentHost.customizationInstall.pluginSourceUnavailable', "The SDK plugin marketplace source is unavailable.");
		}
		if (installation?.kind === 'configuredPlugin' && (!installation.name || !installation.marketplace || !installation.marketplaceId || !installation.marketplaceSource)) {
			return localize('agentHost.customizationInstall.pluginIdentityUnavailable', "The SDK plugin installation identity is unavailable.");
		}
		if (installation?.kind === 'mcpGallery' && !installation.cardUrl) {
			return localize('agentHost.customizationInstall.mcpGalleryIdentityUnavailable', "This MCP Gallery entry does not provide the server card URL required for Copilot installation.");
		}
		if ((installation?.kind === 'skill' || installation?.kind === 'mcp') && !resource.externalUrl && !resource.url) {
			return localize('agentHost.customizationInstall.catalogIdentityUnavailable', "This customization does not provide the SDK catalog identity required for installation.");
		}
		return undefined;
	}

	async addGlobal(name: string, config: IMcpServerConfiguration): Promise<void> {
		if (!this.agentHostService.addMcpServerConfiguration) {
			throw new Error(localize('agentHost.mcpConfiguration.addUnavailable', "The selected agent does not support global MCP configuration."));
		}
		await this.agentHostService.addMcpServerConfiguration(this.providerId, name, config);
	}

	async list(sessionResource: URI) {
		if (!this.agentHostService.listPluginMarketplaces) {
			throw new Error(localize('agentHost.marketplaceManagement.listUnavailable', "The selected agent does not support marketplace management."));
		}
		return this.agentHostService.listPluginMarketplaces(this.providerId, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
	}

	async add(sessionResource: URI, source: string) {
		if (!this.agentHostService.addPluginMarketplace) {
			throw new Error(localize('agentHost.marketplaceManagement.addUnavailable', "The selected agent does not support adding marketplaces."));
		}
		const result = await this.agentHostService.addPluginMarketplace(this.providerId, this.getBackendSession(sessionResource), source, this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
		this._onDidChange.fire();
		return result;
	}

	async queryMarketplace(sessionResource: URI, marketplace: ICustomizationMarketplaceInfo, options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		this.throwIfCancelled(token);
		if (options.mediaType && options.mediaType !== CustomizationMarketplaceMediaType.CopilotPlugin) {
			return { items: [], total: 0 };
		}
		if (!this.agentHostService.browsePluginMarketplace) {
			throw new Error(localize('agentHost.marketplaceManagement.browseUnavailable', "The selected agent does not support browsing marketplaces."));
		}
		const plugins = await this.agentHostService.browsePluginMarketplace(this.providerId, this.getBackendSession(sessionResource), marketplace.name, this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
		this.throwIfCancelled(token);
		const query = options.query?.trim().toLowerCase();
		const matching = query
			? plugins.filter(plugin => plugin.name.toLowerCase().includes(query) || plugin.description?.toLowerCase().includes(query))
			: plugins;
		const offset = Number(options.cursor ?? 0);
		const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
		const pageSize = options.pageSize ?? matching.length;
		const end = Math.min(start + pageSize, matching.length);
		return {
			items: matching.slice(start, end).map(plugin => ({
				identifier: JSON.stringify([marketplace.source, marketplace.name, plugin.name]),
				displayName: plugin.name,
				description: plugin.description ?? '',
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				tags: [],
				capabilities: [],
				representativeQueries: [],
				installation: {
					kind: 'providerPlugin' as const,
					name: plugin.name,
					marketplace: marketplace.name,
					marketplaceSource: marketplace.source,
					providerManaged: true,
				},
			})),
			total: matching.length,
			nextCursor: end < matching.length ? String(end) : undefined,
		};
	}

	async remove(sessionResource: URI, name: string, force?: boolean) {
		if (!this.agentHostService.removePluginMarketplace) {
			throw new Error(localize('agentHost.marketplaceManagement.removeUnavailable', "The selected agent does not support removing marketplaces."));
		}
		const result = await this.agentHostService.removePluginMarketplace(this.providerId, this.getBackendSession(sessionResource), name, force, this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
		if (result.removed) {
			this._onDidChange.fire();
		}
		return result;
	}

	async refresh(sessionResource: URI, name?: string) {
		if (!this.agentHostService.refreshPluginMarketplaces) {
			throw new Error(localize('agentHost.marketplaceManagement.refreshUnavailable', "The selected agent does not support refreshing marketplaces."));
		}
		const result = await this.agentHostService.refreshPluginMarketplaces(this.providerId, this.getBackendSession(sessionResource), name, this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
		this._onDidChange.fire();
		return result;
	}

	getRecoveryAction(): ICustomizationMarketplaceSourceRecoveryAction | undefined {
		if (this.catalogAuthenticationRequired.size === 0) {
			return undefined;
		}
		return {
			label: localize('agentHost.customizationSearch.signIn', "Sign In"),
			kind: 'signIn',
			groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount,
			run: async token => {
				if (!await this.resolveAuthentication()) {
					throw new CancellationError();
				}
				this.throwIfCancelled(token);
				this.catalogAuthenticationRequired.clear();
			},
		};
	}

	async query(sessionResource: URI, options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage | undefined> {
		return this.queryCatalog(sessionResource, options, token);
	}

	async getFeed(sessionResource: URI, feedId: string, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		const page = await this.queryCatalog(sessionResource, {}, token, feedId);
		if (!page) {
			throw new Error(localize('agentHost.customizationFeed.unavailable', "The selected agent cannot retrieve curated customizations."));
		}
		return page;
	}

	private async queryCatalog(sessionResource: URI, options: ICustomizationMarketplaceSourceQuery, token: CancellationToken, feedId?: string): Promise<ICustomizationMarketplaceSourcePage | undefined> {
		this.throwIfCancelled(token);
		const query = options.query?.trim() ?? '';
		if (!this.agentHostService.searchCustomizationMarketplace) {
			return undefined;
		}
		let backendSession: URI;
		try {
			backendSession = this.getBackendSession(sessionResource);
		} catch {
			return undefined;
		}
		const search = () => this.agentHostService.searchCustomizationMarketplace!(this.providerId, backendSession, {
			query,
			mediaType: options.mediaType,
			limit: options.pageSize ?? 30,
			cursor: options.cursor,
			...(feedId !== undefined ? { feedId } : {}),
		});
		const result = await search();
		this.throwIfCancelled(token);
		const authenticationKey = feedId ?? '';
		if (result.kind === 'unavailable') {
			if (result.reason === 'authentication') {
				this.catalogAuthenticationRequired.add(authenticationKey);
			} else {
				this.catalogAuthenticationRequired.delete(authenticationKey);
			}
			switch (result.reason) {
				case 'authentication':
					throw new Error(localize('agentHost.customizationSearch.authenticationRequired', "Sign in to Copilot to search the GitHub Feed."));
				case 'session':
					throw new Error(localize('agentHost.customizationSearch.sessionUnavailable', "The selected Copilot session is unavailable for GitHub Feed search."));
				case 'unsupported':
					throw new Error(localize('agentHost.customizationSearch.unsupported', "The active Copilot runtime does not support GitHub Feed search."));
			}
		}
		this.catalogAuthenticationRequired.delete(authenticationKey);
		return {
			items: result.items.map(item => {
				if (item.unavailableMessage) {
					this.unavailableCatalogItems.set(item.selectionId, item.unavailableMessage);
					while (this.unavailableCatalogItems.size > maxCatalogAssociations) {
						this.unavailableCatalogItems.delete(this.unavailableCatalogItems.keys().next().value!);
					}
				} else {
					this.unavailableCatalogItems.delete(item.selectionId);
				}
				const publisher = getGitHubPublisher(item.publisher);
				const registryIcon = item.kind === 'mcp' ? getGitHubMcpRegistryIcon(item.itemUrl) : undefined;
				const providerPlugin = !item.unavailableMessage && item.kind === 'plugin' && item.pluginName && item.marketplace && item.marketplaceSource
					? { kind: 'providerPlugin' as const, name: item.pluginName, marketplace: item.marketplace, marketplaceSource: item.marketplaceSource }
					: undefined;
				return {
					identifier: item.identifier ?? (providerPlugin ? JSON.stringify([providerPlugin.marketplaceSource, providerPlugin.marketplace, providerPlugin.name]) : item.itemUrl ?? item.selectionId),
					displayName: item.displayName,
					description: item.description ?? '',
					mediaType: getCatalogMediaType(item.kind),
					tags: item.categories ?? [],
					capabilities: [],
					representativeQueries: [],
					connectorIds: item.connectorIds,
					version: item.version,
					repository: item.repository ? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${item.repository}` }) : undefined,
					publisher: item.publisher,
					publisherUrl: publisher?.profile,
					icon: item.iconUrl ? URI.parse(item.iconUrl) : publisher?.avatar ?? registryIcon,
					installation: providerPlugin ?? {
						kind: 'providerCatalog' as const,
						resourceKind: item.kind,
						selectionId: item.selectionId,
						itemUrl: item.itemUrl,
						...(item.repository ? { repository: item.repository } : {}),
						...(item.path ? { path: item.path } : {}),
					},
				};
			}),
			nextCursor: result.nextCursor,
		};
	}

	async getInstallations(sessionResource: URI, token: CancellationToken): Promise<readonly IRecordedCustomizationMarketplaceResource[]> {
		this.throwIfCancelled(token);
		const pluginInstallations = this.getPluginInstallations();
		if (!this.agentHostService.listCustomizationInstallations) {
			return pluginInstallations;
		}
		let backendSession: URI;
		try {
			backendSession = this.getBackendSession(sessionResource);
		} catch (error) {
			this.throwIfCancelled(token);
			this.logService.error('[AgentHostCustomizationMarketplace] Unable to resolve the session for SDK installation receipts', error);
			return pluginInstallations;
		}
		let installations: readonly IAgentCustomizationInstallation[];
		try {
			installations = await this.agentHostService.listCustomizationInstallations(this.providerId, backendSession);
		} catch (error) {
			this.throwIfCancelled(token);
			this.logService.error('[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts', error);
			const receiptInstallations = this.receiptInstallations.get(backendSession) ?? [];
			return [...receiptInstallations, ...pluginInstallations];
		}
		this.throwIfCancelled(token);
		const receiptInstallations = installations.map(installation => this.toRecordedInstallation(sessionResource, installation));
		this.receiptInstallations.set(backendSession, receiptInstallations);
		while (this.receiptInstallations.size > maxCachedReceiptSessions) {
			this.receiptInstallations.delete(this.receiptInstallations.keys().next().value!);
		}
		return [
			...receiptInstallations,
			...pluginInstallations,
		];
	}

	async install(sessionResource: URI, resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		this.throwIfCancelled(token);
		const installation = resource.installation;
		if (installation?.kind === 'providerCatalog') {
			if (!await this.resolveAuthentication()) {
				throw new CancellationError();
			}
			this.throwIfCancelled(token);
			const review = await this.prepare(sessionResource, {
				mediaType: resource.mediaType,
				identifier: resource.identifier,
				displayName: resource.displayName,
				description: resource.description,
				version: resource.version,
				itemUrl: installation.itemUrl,
				selectionId: installation.selectionId,
				installation: { kind: installation.resourceKind },
			}, token);
			await this.confirmAndApplyCatalogResource(review, resource, token);
			return;
		}
		if (installation?.kind === 'configuredPlugin') {
			if (!installation.name || !installation.marketplace || !installation.marketplaceId || !installation.marketplaceSource) {
				throw new Error(localize('agentHost.customizationInstall.pluginIdentityUnavailable', "The SDK plugin installation identity is unavailable."));
			}
			if (!this.agentHostService.installPlugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginUnavailable', "The selected agent does not support SDK plugin installation."));
			}
			await this.agentHostService.installPlugin(this.providerId, { source: `${installation.name}@${installation.marketplace}` }, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
			await this.waitForPluginInventory({ name: installation.name, marketplace: installation.marketplace }, true, token);
			this.throwIfCancelled(token);
			this._onDidChange.fire();
			return;
		}
		if (installation?.kind === 'providerPlugin') {
			if (!this.agentHostService.installPlugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginUnavailable', "The selected agent does not support SDK plugin installation."));
			}
			await this.agentHostService.installPlugin(this.providerId, { source: `${installation.name}@${installation.marketplace}` }, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
			await this.waitForPluginInventory({ name: installation.name, marketplace: installation.marketplace }, true, token);
			this.throwIfCancelled(token);
			this._onDidChange.fire();
			return;
		}
		if (installation?.kind === 'plugin') {
			throw new Error(this.getInstallUnavailableMessage(resource)!);
		}
		if (installation?.kind === 'mcpGallery') {
			if (!installation.cardUrl) {
				throw new Error(this.getInstallUnavailableMessage(resource)!);
			}
			if (!await this.resolveAuthentication()) {
				throw new CancellationError();
			}
			this.throwIfCancelled(token);
			const review = await this.prepare(sessionResource, {
				mediaType: resource.mediaType,
				identifier: resource.identifier,
				displayName: resource.displayName,
				description: resource.description,
				version: resource.version,
				itemUrl: installation.cardUrl,
				installation: {
					kind: 'mcp',
					source: { kind: 'url', mediaType: CustomizationMarketplaceMediaType.McpServer, url: installation.cardUrl },
				},
			}, token);
			await this.confirmAndApplyCatalogResource(review, resource, token);
			return;
		}
		if (installation?.kind !== 'skill' && installation?.kind !== 'mcp') {
			throw new Error(localize('agentHost.customizationInstall.unsupported', "The selected agent does not support installing this customization through its SDK."));
		}
		if (!await this.resolveAuthentication()) {
			throw new CancellationError();
		}
		this.throwIfCancelled(token);
		const review = await this.prepare(sessionResource, {
			mediaType: resource.mediaType,
			identifier: resource.identifier,
			displayName: resource.displayName,
			description: resource.description,
			version: resource.version,
			itemUrl: resource.externalUrl ?? resource.url?.toString(true),
			installation: { kind: installation.kind },
		}, token);
		await this.confirmAndApply(review, token);
	}

	async repair(sessionResource: URI, installation: IRecordedCustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		this.throwIfCancelled(token);
		if (!installation.installationId || !this.agentHostService.recoverCustomizationInstallations) {
			throw new Error(localize('agentHost.customizationInstall.repairUnavailable', "The selected agent cannot repair this SDK installation."));
		}
		const recovered = await this.agentHostService.recoverCustomizationInstallations(this.providerId, this.getBackendSession(sessionResource));
		this.throwIfCancelled(token);
		const current = recovered.find(candidate => candidate.installationId === installation.installationId);
		if (!current || current.state !== 'installed') {
			throw new Error(current?.errorMessage ?? localize('agentHost.customizationInstall.repairIncomplete', "The SDK could not repair this customization installation."));
		}
		this._onDidChange.fire();
	}

	async uninstall(sessionResource: URI, installation: IRecordedCustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		this.throwIfCancelled(token);
		if (installation.state.target.kind === 'plugin') {
			const target = installation.state.target;
			const plugin = target.uri
				? this.agentPluginService.plugins.get().find(candidate => candidate.uri.toString() === target.uri?.toString())
				: undefined;
			const identity = plugin?.copilotCliInstallation;
			if (!identity || !this.agentHostService.uninstallPlugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginRemovalUnavailable', "The SDK plugin installation identity is unavailable."));
			}
			await this.agentHostService.uninstallPlugin(this.providerId, {
				name: identity.name,
				marketplace: identity.marketplace,
				directSourceId: identity.directSourceId,
			}, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
			await this.waitForPluginInventory(identity, false, token);
			this.throwIfCancelled(token);
			this._onDidChange.fire();
			return;
		}
		if (!installation.installationId) {
			throw new Error(localize('agentHost.customizationInstall.removalUnavailable', "The SDK installation identity is unavailable."));
		}
		const review = await this.prepare(sessionResource, { installationId: installation.installationId }, token);
		await this.confirmAndApply(review, token);
	}

	private async prepare(sessionResource: URI, request: IAgentCustomizationInstallationRequest | { readonly installationId: string }, token: CancellationToken): Promise<IAgentCustomizationInstallationReview> {
		if (!this.agentHostService.prepareCustomizationInstallation) {
			throw new Error(localize('agentHost.customizationInstall.prepareUnavailable', "The selected agent does not support SDK installation review."));
		}
		const review = await this.agentHostService.prepareCustomizationInstallation(this.providerId, this.getBackendSession(sessionResource), request);
		this.throwIfCancelled(token);
		return review;
	}

	private async confirmAndApply(
		review: IAgentCustomizationInstallationReview,
		token: CancellationToken,
		beforeChange?: (result: IAgentCustomizationInstallationApplyResult | undefined) => Promise<void> | void,
	): Promise<void> {
		const confirmation = await this.dialogService.confirm({
			type: 'question',
			message: review.action === 'install'
				? localize('agentHost.customizationInstall.confirmInstall', "Install '{0}'?", review.displayName)
				: localize('agentHost.customizationInstall.confirmUninstall', "Uninstall '{0}'?", review.displayName),
			detail: this.getReviewDetail(review),
			primaryButton: review.action === 'install'
				? localize('agentHost.customizationInstall.installButton', "Install")
				: localize('agentHost.customizationInstall.uninstallButton', "Uninstall"),
			custom: { icon: Codicon.shield },
		});
		this.throwIfCancelled(token);
		if (!confirmation.confirmed) {
			throw new CancellationError();
		}
		if (!this.agentHostService.applyCustomizationInstallation) {
			throw new Error(localize('agentHost.customizationInstall.applyUnavailable', "The selected agent cannot apply this SDK installation."));
		}
		const result = await this.agentHostService.applyCustomizationInstallation(this.providerId, review.operationId);
		this.throwIfCancelled(token);
		await beforeChange?.(result);
		this.throwIfCancelled(token);
		this._onDidChange.fire();
	}

	private async confirmAndApplyCatalogResource(review: IAgentCustomizationInstallationReview, resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		await this.confirmAndApply(review, token, async result => {
			const installation = resource.installation;
			if (installation?.kind !== 'providerCatalog' && installation?.kind !== 'mcpGallery') {
				return;
			}
			if (result?.kind === 'receipt') {
				this.rememberCatalogAssociation(result.installationId, resource);
				return;
			}
			if (result?.kind === 'plugin') {
				const plugin = await this.waitForAppliedPluginInventory(result, token);
				this.rememberCatalogAssociation(getPluginInstallationId(plugin.copilotCliInstallation!), resource);
			}
		});
	}

	private getReviewDetail(review: IAgentCustomizationInstallationReview): string {
		if (review.kind === 'skill') {
			const modifiedDetail = review.filesModified
				? localize('agentHost.customizationInstall.skillFilesModified', "\n\nThe installed files have been modified. The SDK will refuse removal if they changed after this review.")
				: '';
			return review.action === 'install'
				? localize('agentHost.customizationInstall.skillInstallDetail', "Skills can supply instructions and scripts that an agent may run. Only install resources from sources you trust.\n\nSource: {0}\nDestination: {1}\nFiles: {2}\nSize: {3} bytes", review.source, review.target, review.fileCount, review.totalBytes)
				: localize('agentHost.customizationInstall.skillUninstallDetail', "The SDK will remove {0} owned files ({1} bytes) from {2}.{3}", review.fileCount, review.totalBytes, review.target, modifiedDetail);
		}
		if (review.kind === 'plugin') {
			const status = review.installsDisabled
				? localize('agentHost.customizationInstall.pluginDisabled', "The plugin will be installed disabled.")
				: localize('agentHost.customizationInstall.pluginEnabled', "The plugin will be installed enabled.");
			const mcpServers = review.mcpServerCount
				? localize('agentHost.customizationInstall.pluginMcpServers', "\nDeclared MCP servers: {0}", review.mcpServerCount)
				: '';
			return localize('agentHost.customizationInstall.pluginInstallDetail', "Plugins can supply agents, skills, hooks, and MCP servers. Only install resources from sources you trust.\n\nSource: {0}\nDestination: {1}\nFiles: {2}\nSize: {3} bytes\n\n{4}{5}", review.source, review.target, review.fileCount, review.totalBytes, status, mcpServers);
		}
		if (review.action === 'install') {
			return localize('agentHost.customizationInstall.mcpInstallDetail', "MCP servers can run tools and access external services. Only install resources from sources you trust.\n\nServer: {0}\nDestination: {1}\nEndpoint: {2}\nConfiguration fields: {3}", review.serverName, review.target, review.endpoint ?? localize('agentHost.customizationInstall.notApplicable', "Not applicable"), review.configurationFields.join(', ') || localize('agentHost.customizationInstall.none', "None"));
		}
		return localize('agentHost.customizationInstall.mcpUninstallDetail', "Server: {0}\nRestores previous configuration: {1}\nShared authentication is preserved: {2}", review.serverName, review.restoresPreviousConfiguration ? localize('agentHost.customizationInstall.yes', "Yes") : localize('agentHost.customizationInstall.no', "No"), review.preservesSharedAuthentication ? localize('agentHost.customizationInstall.yes', "Yes") : localize('agentHost.customizationInstall.no', "No"));
	}

	private toRecordedInstallation(sessionResource: URI, installation: IAgentCustomizationInstallation): IRecordedCustomizationMarketplaceResource {
		const resource = this.catalogAssociations.get(installation.installationId) ?? this.toMarketplaceResource(installation);
		const state = installation.state === 'error'
			? { kind: 'error' as const, message: installation.errorMessage ?? localize('agentHost.customizationInstall.inventoryError', "The SDK could not verify this installation."), target: this.getTarget(sessionResource, installation) }
			: { kind: installation.state, target: this.getTarget(sessionResource, installation) };
		return { installationId: installation.installationId, resource, state };
	}

	private toMarketplaceResource(installation: IAgentCustomizationInstallation): ICustomizationMarketplaceResource {
		const catalogue = installation.catalogue;
		const publisher = getGitHubPublisher(catalogue?.publisher);
		const registryIcon = installation.kind === 'mcp' ? getGitHubMcpRegistryIcon(catalogue?.itemUrl, catalogue?.resourceId) : undefined;
		return {
			sourceId: this.getSourceId(catalogue?.source),
			identifier: catalogue?.resourceId ?? catalogue?.itemUrl ?? (installation.kind === 'mcp' ? installation.serverName : installation.installationId),
			displayName: catalogue?.displayName ?? (installation.kind === 'skill' ? installation.name : installation.serverName),
			description: catalogue?.description ?? '',
			mediaType: installation.mediaType,
			tags: [],
			capabilities: [],
			representativeQueries: [],
			version: catalogue?.version,
			externalUrl: catalogue?.itemUrl,
			url: catalogue?.itemUrl ? URI.parse(catalogue.itemUrl) : undefined,
			publisher: catalogue?.publisher,
			publisherUrl: publisher?.profile,
			icon: publisher?.avatar ?? registryIcon,
		};
	}

	private rememberCatalogAssociation(installationId: string, resource: ICustomizationMarketplaceResource): void {
		this.catalogAssociations.set(installationId, resource);
		while (this.catalogAssociations.size > maxCatalogAssociations) {
			this.catalogAssociations.delete(this.catalogAssociations.keys().next().value!);
		}
	}

	private getTarget(sessionResource: URI, installation: IAgentCustomizationInstallation) {
		if (installation.kind === 'mcp') {
			const server = this.agentHostCustomizationService.getMcpServers(sessionResource).find(candidate => candidate.name === installation.serverName);
			return { kind: 'mcp' as const, id: server?.id, name: installation.serverName };
		}
		return { kind: 'skill' as const, uri: installation.targetUri, name: installation.name };
	}

	private getPluginInstallations(): readonly IRecordedCustomizationMarketplaceResource[] {
		const result: IRecordedCustomizationMarketplaceResource[] = [];
		for (const plugin of this.agentPluginService.plugins.get()) {
			const installation = plugin.copilotCliInstallation;
			if (!installation) {
				continue;
			}
			const installationId = getPluginInstallationId(installation);
			const resource = this.catalogAssociations.get(installationId) ?? toPluginMarketplaceResource(plugin);
			result.push({
				installationId,
				resource,
				state: { kind: 'installed', target: { kind: 'plugin', uri: plugin.uri, name: installation.name } },
			});
		}
		return result;
	}

	private getSourceId(source: string | undefined): string {
		if (!source) {
			return CustomizationMarketplaceSources.AgentFinderPublicFeed.id;
		}
		if (source === 'agentfinder.github.com') {
			return CustomizationMarketplaceSources.AgentFinderPublicFeed.id;
		}
		try {
			const sourceUri = URI.parse(source);
			return (sourceUri.authority || sourceUri.path) === 'agentfinder.github.com'
				? CustomizationMarketplaceSources.AgentFinderPublicFeed.id
				: source;
		} catch {
			return source;
		}
	}

	private throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	private getBackendSession(sessionResource: URI): URI {
		const identity = this.agentHostConnectionsService.resolveSessionResourceIdentity(sessionResource);
		if (!identity) {
			return sessionResource;
		}
		if (identity.connectionAuthority !== AMBIENT_AGENT_HOST_AUTHORITY) {
			throw new Error(localize('agentHost.customizationInstall.sessionUnavailable', "The selected local Agent Host session is unavailable."));
		}
		return identity.backendSession;
	}

	private async waitForPluginInventory(identity: NonNullable<IAgentPlugin['copilotCliInstallation']>, present: boolean, token: CancellationToken): Promise<void> {
		const operation = new DisposableStore();
		try {
			const inventoryUpdated = new Promise<boolean>((resolve, reject) => {
				const checkInventory = () => {
					if (this.agentPluginService.plugins.get().some(plugin => isPluginInstallation(plugin.copilotCliInstallation, identity)) === present) {
						resolve(true);
					}
				};
				operation.add(Event.fromObservableLight(this.agentPluginService.plugins)(checkInventory));
				operation.add(token.onCancellationRequested(() => reject(new CancellationError())));
				checkInventory();
			});
			if (await raceTimeout(inventoryUpdated, pluginInventoryUpdateTimeoutMs) !== true) {
				throw new Error(localize('agentHost.customizationInstall.pluginInventoryTimeout', "The SDK completed the plugin operation, but its installation inventory did not update."));
			}
			this.throwIfCancelled(token);
		} finally {
			operation.dispose();
		}
	}

	private async waitForAppliedPluginInventory(identity: Extract<IAgentCustomizationInstallationApplyResult, { readonly kind: 'plugin' }>, token: CancellationToken): Promise<IAgentPlugin> {
		const operation = new DisposableStore();
		try {
			const inventoryUpdated = new Promise<IAgentPlugin>((resolve, reject) => {
				const checkInventory = () => {
					const plugin = this.agentPluginService.plugins.get().find(candidate => isAppliedPluginInstallation(candidate, identity));
					if (plugin) {
						resolve(plugin);
					}
				};
				operation.add(Event.fromObservableLight(this.agentPluginService.plugins)(checkInventory));
				operation.add(token.onCancellationRequested(() => reject(new CancellationError())));
				checkInventory();
			});
			const plugin = await raceTimeout(inventoryUpdated, pluginInventoryUpdateTimeoutMs);
			if (!plugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginInventoryTimeout', "The SDK completed the plugin operation, but its installation inventory did not update."));
			}
			this.throwIfCancelled(token);
			return plugin;
		} finally {
			operation.dispose();
		}
	}
}

function isPluginInstallation(
	candidate: IAgentPlugin['copilotCliInstallation'],
	expected: NonNullable<IAgentPlugin['copilotCliInstallation']>,
): boolean {
	return candidate?.name === expected.name
		&& candidate.marketplace === expected.marketplace
		&& candidate.directSourceId === expected.directSourceId;
}

function isAppliedPluginInstallation(
	plugin: IAgentPlugin,
	expected: Extract<IAgentCustomizationInstallationApplyResult, { readonly kind: 'plugin' }>,
): boolean {
	const installation = plugin.copilotCliInstallation;
	const source = installation?.source;
	return installation?.name === expected.name
		&& source?.kind === 'github'
		&& source.repository.toLowerCase() === expected.repository.toLowerCase()
		&& (source.sha ?? source.ref) === expected.ref
		&& (source.path ?? '') === expected.path;
}

function toPluginMarketplaceResource(plugin: IAgentPlugin): ICustomizationMarketplaceResource {
	const installation = plugin.copilotCliInstallation!;
	const version = plugin.version?.get();
	const source = installation.source;
	const configured = installation.marketplace
		? { kind: 'configuredPlugin' as const, name: installation.name, marketplace: installation.marketplace }
		: undefined;
	const direct = source?.kind === 'github'
		? {
			kind: 'plugin' as const,
			repository: source.repository,
			ref: source.sha ?? source.ref ?? 'HEAD',
			path: source.path ?? '',
		}
		: undefined;
	return {
		sourceId: configured ? CustomizationMarketplaceSources.PluginMarketplaces.id : CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
		identifier: configured ? JSON.stringify([installation.marketplace, installation.name]) : installation.directSourceId ?? plugin.uri.toString(),
		displayName: plugin.label,
		description: '',
		mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		version,
		repository: source?.kind === 'github'
			? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${source.repository}` })
			: undefined,
		installation: configured ?? direct,
	};
}

function getPluginInstallationId(installation: NonNullable<IAgentPlugin['copilotCliInstallation']>): string {
	return installation.marketplace
		? `plugin:${installation.marketplace}:${installation.name}`
		: `plugin:direct:${installation.directSourceId ?? installation.name}`;
}

function getCatalogMediaType(kind: 'skill' | 'mcp' | 'plugin'): CustomizationMarketplaceMediaType {
	switch (kind) {
		case 'skill': return CustomizationMarketplaceMediaType.Skill;
		case 'mcp': return CustomizationMarketplaceMediaType.McpServer;
		case 'plugin': return CustomizationMarketplaceMediaType.CopilotPlugin;
	}
}

function getGitHubPublisher(publisher: string | undefined): { readonly profile: URI; readonly avatar: URI } | undefined {
	const login = publisher?.trim();
	if (!login || !githubLoginPattern.test(login)) {
		return undefined;
	}
	return {
		profile: URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${login}` }),
		avatar: URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${login}.png` }),
	};
}
