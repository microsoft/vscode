/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError, getErrorMessage } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { waitForState } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentCustomizationInstallation, IAgentCustomizationInstallationAnswers, IAgentCustomizationInstallationApplyResult, IAgentCustomizationInstallationPreparation, IAgentCustomizationInstallationRequest, IAgentCustomizationInstallationReview, IAgentPluginInstallation } from '../../../../../../platform/agentHost/common/agent.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceRecoveryGroup, ICustomizationMarketplaceResource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IMcpGalleryManifestService } from '../../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IMcpGalleryService, McpGalleryResolveStatus } from '../../../../../../platform/mcp/common/mcpManagement.js';
import type { IMcpServerConfiguration } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IRecordedCustomizationMarketplaceResource, ICustomizationMarketplaceInstallProvider } from '../../../common/customizationMarketplaceInstallService.js';
import { ICustomizationMarketplaceInfo, ICustomizationMarketplaceManagementProvider, ICustomizationMarketplaceSearchProvider, ICustomizationMcpConfigurationProvider, ICustomizationPluginInstallProvider } from '../../../common/customizationHarnessService.js';
import { customizationSearchMatchesAny } from '../../../common/aiCustomizationSearch.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { ICustomizationInstallationConfigurationService } from './customizationInstallationConfigurationService.js';
import { getGitHubMcpRegistryIcon } from '../../aiCustomization/githubMcpRegistryIcons.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { getCopilotCliPluginSourceId, IAgentPlugin, IAgentPluginService, setAgentPluginEnablement } from '../../../common/plugins/agentPluginService.js';

const maxCachedReceiptSessions = 50;
const maxCatalogAssociations = 1000;
const githubLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
/** The shape of an MCP registry server name: a reverse-DNS namespace and a name, such as `io.github.owner/server`. */
const mcpRegistryServerNamePattern = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\/[A-Za-z0-9._-]+$/;
/** How long to wait before asking the registry again about a server it could not answer for. */
const registryNameRetryDelay = 5 * 60 * 1000;
/**
 * Shows a command and its arguments on one line. A part that is empty or contains whitespace or a
 * quote is quoted, so where one argument ends and the next begins can always be told.
 */
function formatCommandLine(parts: readonly string[]): string {
	return parts.map(part => /^[^\s"]+$/.test(part) ? part : JSON.stringify(part)).join(' ');
}

type AppliedPluginIdentity = Extract<IAgentCustomizationInstallationApplyResult, { readonly kind: 'plugin' }>;
export class AgentHostCustomizationMarketplaceInstallProvider extends Disposable implements ICustomizationMarketplaceInstallProvider, ICustomizationMarketplaceSearchProvider, ICustomizationMarketplaceManagementProvider, ICustomizationMcpConfigurationProvider, ICustomizationPluginInstallProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	private readonly _onDidChangeMarketplaces = this._register(new Emitter<void>());
	private readonly receiptInstallations = new ResourceMap<readonly IRecordedCustomizationMarketplaceResource[]>();
	private readonly unavailableCatalogItems = new Map<string, string>();
	private readonly catalogAssociations = new Map<string, ICustomizationMarketplaceResource>();
	private readonly pendingCatalogAssociations: { readonly identity: AppliedPluginIdentity; readonly directSourceId: string; readonly resource: ICustomizationMarketplaceResource }[] = [];
	private readonly catalogAuthenticationRequired = new Set<string>();
	/**
	 * What the current MCP registry calls configured servers whose configuration key is a registry
	 * server name. An entry without a name records that the registry has none, or when to ask it
	 * again. Replaced when the registry changes, so answers from the previous one are not used.
	 */
	private registryNames = new Map<string, { readonly displayName?: string; readonly retryAt?: number }>();
	readonly onDidChange: Event<void>;
	readonly onDidChangeMarketplaces: Event<void>;

	constructor(
		private readonly providerId: string,
		private readonly resolveAuthentication: () => Promise<boolean>,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@ICustomizationInstallationConfigurationService private readonly configurationService: ICustomizationInstallationConfigurationService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IMcpGalleryManifestService mcpGalleryManifestService: IMcpGalleryManifestService,
	) {
		super();
		// Fires only when the registry's address or version changes.
		this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => {
			this.registryNames = new Map();
			this._onDidChange.fire();
		}));
		this.onDidChange = Event.any(
			this._onDidChange.event,
			this.agentHostCustomizationService.onDidChangeCustomizations,
			this.agentHostService.onAgentHostStart,
			Event.map(this.agentHostService.onAgentHostExit, () => undefined),
			Event.fromObservableLight(this.agentPluginService.plugins),
		);
		this.onDidChangeMarketplaces = Event.any(
			this._onDidChangeMarketplaces.event,
			this.agentHostService.onAgentHostStart,
			Event.map(this.agentHostService.onAgentHostExit, () => undefined),
		);
	}

	private fireMarketplacesChanged(): void {
		this._onDidChangeMarketplaces.fire();
		this._onDidChange.fire();
	}

	getInstallUnavailableMessage(resource: ICustomizationMarketplaceResource): string | undefined {
		const installation = resource.installation;
		if (installation?.kind === 'providerCatalog') {
			return this.unavailableCatalogItems.get(installation.selectionId);
		}

		if (installation?.kind === 'plugin') {
			return localize('agentHost.customizationInstall.directPluginUnavailable', "Catalog plugins at pinned revisions are not yet supported.");
		}
		if (installation?.kind === 'providerPlugin' && !installation.marketplaceSource) {
			return localize('agentHost.customizationInstall.pluginSourceUnavailable', "The plugin marketplace source is unavailable.");
		}
		if (installation?.kind === 'configuredPlugin' && (!installation.name || !installation.marketplace || !installation.marketplaceId || !installation.marketplaceSource)) {
			return localize('agentHost.customizationInstall.pluginIdentityUnavailable', "The plugin installation identity is unavailable.");
		}
		if (installation?.kind === 'mcpGallery' && !installation.cardUrl) {
			return localize('agentHost.customizationInstall.mcpGalleryIdentityUnavailable', "This MCP Gallery entry does not provide the server card URL required for Copilot installation.");
		}
		if ((installation?.kind === 'skill' || installation?.kind === 'mcp') && !resource.externalUrl && !resource.url) {
			return localize('agentHost.customizationInstall.catalogIdentityUnavailable', "This customization does not provide the catalog identity required for installation.");
		}
		return undefined;
	}

	async installFromSource(sessionResource: URI, source: string): Promise<void> {
		if (!this.agentHostService.installPlugin) {
			throw new Error(localize('agentHost.pluginInstall.unavailable', "The selected agent does not support installing plugins from source."));
		}
		await this.agentHostService.installPlugin(this.providerId, { source }, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
		this._onDidChange.fire();
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

	async add(sessionResource: URI | undefined, source: string) {
		if (!this.agentHostService.addPluginMarketplace) {
			throw new Error(localize('agentHost.marketplaceManagement.addUnavailable', "The selected agent does not support adding marketplaces."));
		}
		const result = await this.agentHostService.addPluginMarketplace(
			this.providerId,
			sessionResource ? this.getBackendSession(sessionResource) : undefined,
			source,
			sessionResource ? this.agentHostCustomizationService.getBackendChatResource?.(sessionResource) : undefined,
		);
		this.fireMarketplacesChanged();
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
		const query = options.query?.trim() ?? '';
		const matching = query
			? plugins.filter(plugin => customizationSearchMatchesAny(query, [plugin.name, plugin.description]))
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
			this.fireMarketplacesChanged();
		}
		return result;
	}

	async refresh(sessionResource: URI, name?: string) {
		if (!this.agentHostService.refreshPluginMarketplaces) {
			throw new Error(localize('agentHost.marketplaceManagement.refreshUnavailable', "The selected agent does not support refreshing marketplaces."));
		}
		const result = await this.agentHostService.refreshPluginMarketplaces(this.providerId, this.getBackendSession(sessionResource), name, this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
		this.fireMarketplacesChanged();
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
					...(item.compatibilityTags?.length ? { compatibilityTags: item.compatibilityTags } : {}),
					capabilities: [],
					representativeQueries: [],
					connectorIds: item.connectorIds,
					...(item.installCount !== undefined ? { installCount: item.installCount } : {}),
					version: item.version,
					repository: item.repository ? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${item.repository}` }) : undefined,
					publisher: item.publisher,
					publisherUrl: publisher?.profile,
					icon: item.iconUrl ? URI.parse(item.iconUrl) : publisher?.avatar ?? registryIcon,
					installation: providerPlugin ?? {
						kind: 'providerCatalog' as const,
						resourceKind: item.kind,
						selectionId: item.selectionId,
						...(item.catalogIdentity ? { catalogIdentity: item.catalogIdentity } : {}),
						itemUrl: item.itemUrl,
						installable: item.installable,
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
		const pluginInstallations = await this.getPluginInstallations(sessionResource, token);
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
		void this.resolveRegistryNames(installations);
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
			const prepared = await this.prepare(sessionResource, {
				mediaType: resource.mediaType,
				identifier: resource.identifier,
				displayName: resource.displayName,
				description: resource.description,
				version: resource.version,
				itemUrl: installation.itemUrl,
				selectionId: installation.selectionId,
				...(installation.catalogIdentity ? { catalogIdentity: installation.catalogIdentity } : {}),
				installation: { kind: installation.resourceKind },
			}, token, installation.resourceKind === 'mcp');
			await this.confirmAndApplyCatalogResource(prepared, resource, token);
			return;
		}
		if (installation?.kind === 'configuredPlugin') {
			if (!installation.name || !installation.marketplace || !installation.marketplaceId || !installation.marketplaceSource) {
				throw new Error(localize('agentHost.customizationInstall.pluginIdentityUnavailable', "The plugin installation identity is unavailable."));
			}
			if (!this.agentHostService.installPlugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginUnavailable', "The selected agent does not support plugin installation."));
			}
			await this.agentHostService.installPlugin(this.providerId, { source: `${installation.name}@${installation.marketplace}` }, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
			this.throwIfCancelled(token);
			this._onDidChange.fire();
			return;
		}
		if (installation?.kind === 'providerPlugin') {
			if (!this.agentHostService.installPlugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginUnavailable', "The selected agent does not support plugin installation."));
			}
			await this.agentHostService.installPlugin(this.providerId, { source: `${installation.name}@${installation.marketplace}` }, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
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
			const prepared = await this.prepare(sessionResource, {
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
			}, token, true);
			await this.confirmAndApplyCatalogResource(prepared, resource, token);
			return;
		}
		if (installation?.kind !== 'skill' && installation?.kind !== 'mcp') {
			throw new Error(localize('agentHost.customizationInstall.unsupported', "The selected agent does not support installing this customization."));
		}
		if (!await this.resolveAuthentication()) {
			throw new CancellationError();
		}
		this.throwIfCancelled(token);
		const prepared = await this.prepare(sessionResource, {
			mediaType: resource.mediaType,
			identifier: resource.identifier,
			displayName: resource.displayName,
			description: resource.description,
			version: resource.version,
			itemUrl: resource.externalUrl ?? resource.url?.toString(true),
			installation: { kind: installation.kind },
		}, token, installation.kind === 'mcp');
		await this.confirmAndApply(prepared, token);
	}

	async repair(sessionResource: URI, installation: IRecordedCustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		this.throwIfCancelled(token);
		if (!installation.installationId || !this.agentHostService.recoverCustomizationInstallations) {
			throw new Error(localize('agentHost.customizationInstall.repairUnavailable', "The selected agent cannot repair this installation."));
		}
		const recovered = await this.agentHostService.recoverCustomizationInstallations(this.providerId, this.getBackendSession(sessionResource));
		this.throwIfCancelled(token);
		const current = recovered.find(candidate => candidate.installationId === installation.installationId);
		if (!current || current.state !== 'installed') {
			throw new Error(current?.errorMessage ?? localize('agentHost.customizationInstall.repairIncomplete', "Could not repair this customization installation."));
		}
		this._onDidChange.fire();
	}

	async uninstall(sessionResource: URI, installation: IRecordedCustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		this.throwIfCancelled(token);
		if (installation.state.kind === 'installed' && installation.state.uninstallUnavailableMessage) {
			throw new Error(installation.state.uninstallUnavailableMessage);
		}
		if (installation.state.target.kind === 'plugin') {
			const plugins = await this.listPluginInstallations(sessionResource, token);
			const matches = plugins.filter(candidate => getPluginInstallationId(candidate) === installation.installationId);
			const identity = matches.length === 1 ? matches[0] : undefined;
			if (!identity || !identity.marketplace && !identity.directSourceId || !this.agentHostService.uninstallPlugin) {
				this._onDidChange.fire();
				throw new Error(localize('agentHost.customizationInstall.pluginRemovalUnavailable', "The plugin installation identity is unavailable."));
			}
			await this.agentHostService.uninstallPlugin(this.providerId, {
				name: identity.name,
				marketplace: identity.marketplace,
				directSourceId: identity.directSourceId,
			}, this.getBackendSession(sessionResource), this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
			const plugin = this.findDiscoveredPlugin(identity);
			if (plugin) {
				this.agentPluginService.enablementModel.remove(plugin.uri.toString());
			}
			this.throwIfCancelled(token);
			this.catalogAssociations.delete(getPluginInstallationId(identity));
			this._onDidChange.fire();
			return;
		}
		if (!installation.installationId) {
			throw new Error(localize('agentHost.customizationInstall.removalUnavailable', "The installation identity is unavailable."));
		}
		const prepared = await this.prepare(sessionResource, { installationId: installation.installationId }, token);
		await this.confirmAndApply(prepared, token);
	}

	/**
	 * Prepares a review or configuration request on the local Agent Host.
	 * MCP installs require workspace trust before anything reaches the host.
	 */
	private async prepare(sessionResource: URI, request: IAgentCustomizationInstallationRequest | { readonly installationId: string }, token: CancellationToken, requiresWorkspaceTrust = false): Promise<IAgentCustomizationInstallationPreparation> {
		if (!this.agentHostService.prepareCustomizationInstallation) {
			throw new Error(localize('agentHost.customizationInstall.prepareUnavailable', "The selected agent does not support installation review."));
		}
		const backendSession = this.getBackendSession(sessionResource);
		if (requiresWorkspaceTrust) {
			await this.requireWorkspaceTrust(token);
		}
		const preparation = await this.agentHostService.prepareCustomizationInstallation(this.providerId, backendSession, request);
		this.throwIfCancelled(token);
		return preparation;
	}

	private async requireWorkspaceTrust(token: CancellationToken): Promise<void> {
		if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			return;
		}
		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('agentHost.customizationInstall.trustRequired', "Installing MCP servers requires a trusted workspace."),
			buttons: [
				{ label: localize('agentHost.customizationInstall.trustAndContinue', "Trust Workspace and Continue"), type: 'ContinueWithTrust' },
				{ label: localize('agentHost.customizationInstall.trustCancel', "Cancel"), type: 'Cancel' },
			],
		});
		this.throwIfCancelled(token);
		if (!trusted) {
			throw new CancellationError();
		}
	}

	/**
	 * Confirms and applies a prepared installation. An MCP server installation is
	 * confirmed in the form that shows what will be configured and collects the
	 * values and secrets it needs, if any; those are sent once with the apply.
	 * Everything else is confirmed in a dialog. Apply is never resent after a failure.
	 */
	private async confirmAndApply(
		preparation: IAgentCustomizationInstallationPreparation,
		token: CancellationToken,
		beforeChange?: (result: IAgentCustomizationInstallationApplyResult | undefined) => Promise<void> | void,
	): Promise<void> {
		const review = preparation.kind === 'review' ? preparation.review : undefined;
		const activatePlugin = review?.action === 'install' && review.kind === 'plugin';
		let answers: IAgentCustomizationInstallationAnswers | undefined;
		if (preparation.kind === 'configuration') {
			answers = await this.configurationService.collect(preparation, token);
			this.throwIfCancelled(token);
			if (!answers) {
				throw new CancellationError();
			}
		} else if (preparation.review.kind === 'mcp' && preparation.review.action === 'install') {
			// Nothing to fill in: the same form shows what will be configured, and a review is applied without answers.
			const { review, hostGeneration, ownershipToken } = preparation;
			const confirmed = await this.configurationService.collect({
				kind: 'configuration',
				operationId: review.operationId,
				hostGeneration,
				ownershipToken,
				displayName: review.displayName,
				serverName: review.serverName,
				target: review.target,
				choices: [{
					choiceId: review.operationId,
					transport: review.command !== undefined ? 'stdio' : 'http',
					...(review.command !== undefined
						? { command: formatCommandLine([review.command, ...(review.args ?? [])]), ...(review.env ? { env: review.env } : {}) }
						: { endpointSummary: review.endpoint }),
					configurationFields: review.configurationFields,
					values: [],
					secrets: [],
				}],
			}, token);
			this.throwIfCancelled(token);
			if (!confirmed) {
				throw new CancellationError();
			}
		} else {
			await this.confirm(preparation.review.action, activatePlugin, preparation.review.displayName, this.getReviewDetail(preparation.review), token);
		}
		if (!this.agentHostService.applyCustomizationInstallation) {
			throw new Error(localize('agentHost.customizationInstall.applyUnavailable', "The selected agent cannot apply this installation."));
		}
		let result: IAgentCustomizationInstallationApplyResult | undefined;
		try {
			result = await this.agentHostService.applyCustomizationInstallation(this.providerId, {
				hostGeneration: preparation.hostGeneration,
				ownershipToken: preparation.ownershipToken,
				operationId: preparation.kind === 'review' ? preparation.review.operationId : preparation.operationId,
				...(answers ? { answers } : {}),
			});
		} catch (error) {
			// Never resend: refresh the inventory so the host can report the outcome.
			this._onDidChange.fire();
			throw error;
		}
		await beforeChange?.(result);
		if (activatePlugin) {
			try {
				if (result?.kind !== 'plugin') {
					throw new Error(localize('agentHost.customizationInstall.activationIdentityMissing', "The runtime did not return the installed plugin identity."));
				}
				await this.activateInstalledPlugin(result, token);
			} catch (error) {
				this._onDidChange.fire();
				this.throwIfCancelled(token);
				throw new Error(localize('agentHost.customizationInstall.activationFailed', "Plugin '{0}' was installed, but activation failed: {1}. Enable it from Plugins to retry.", review!.displayName, getErrorMessage(error)));
			}
		}
		this._onDidChange.fire();
		this.throwIfCancelled(token);
	}

	/** Throws a {@link CancellationError} unless the user confirms. */
	private async confirm(action: 'install' | 'uninstall', activatePlugin: boolean, displayName: string, detail: string, token: CancellationToken): Promise<void> {
		const confirmation = await this.dialogService.confirm({
			type: 'question',
			message: activatePlugin
				? localize('agentHost.customizationInstall.confirmInstallAndEnable', "Install and enable '{0}'?", displayName)
				: action === 'install'
					? localize('agentHost.customizationInstall.confirmInstall', "Install '{0}'?", displayName)
					: localize('agentHost.customizationInstall.confirmUninstall', "Uninstall '{0}'?", displayName),
			detail,
			primaryButton: activatePlugin
				? localize('agentHost.customizationInstall.installAndEnableButton', "Install and Enable")
				: action === 'install'
					? localize('agentHost.customizationInstall.installButton', "Install")
					: localize('agentHost.customizationInstall.uninstallButton', "Uninstall"),
			custom: { icon: Codicon.shield },
		});
		this.throwIfCancelled(token);
		if (!confirmation.confirmed) {
			throw new CancellationError();
		}
	}

	private async activateInstalledPlugin(identity: AppliedPluginIdentity, token: CancellationToken): Promise<void> {
		this.throwIfCancelled(token);
		const disposables = new DisposableStore();
		const cancellation = disposables.add(new CancellationTokenSource(token));
		try {
			disposables.add(disposableTimeout(() => cancellation.cancel(), 10_000));
			const directSourceId = await getAppliedPluginSourceId(identity);
			const matches = this.agentPluginService.plugins.map(plugins => plugins.filter(plugin => matchesAppliedPlugin(plugin, identity, directSourceId)));
			const plugins = await waitForState(matches, plugins => plugins.length > 0, undefined, cancellation.token).catch(error => {
				this.throwIfCancelled(token);
				if (cancellation.token.isCancellationRequested) {
					throw new Error(localize('agentHost.customizationInstall.activationDiscoveryTimedOut', "The installed plugin was not discovered in time."));
				}
				throw error;
			});
			if (plugins.length !== 1) {
				throw new Error(localize('agentHost.customizationInstall.activationAmbiguous', "Multiple installations match the verified plugin source."));
			}
			const plugin = plugins[0];
			this.associatePluginCatalogResource(plugin);
			if (!plugin.setEnabled) {
				throw new Error(localize('agentHost.customizationInstall.activationUnavailable', "Runtime plugin enablement is unavailable."));
			}
			this.throwIfCancelled(token);
			await setAgentPluginEnablement(plugin, this.agentPluginService.enablementModel, ContributionEnablementState.EnabledProfile);
		} finally {
			cancellation.cancel();
			disposables.dispose();
		}
	}

	private async confirmAndApplyCatalogResource(prepared: IAgentCustomizationInstallationPreparation, resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		await this.confirmAndApply(prepared, token, async result => {
			const installation = resource.installation;
			if (installation?.kind !== 'providerCatalog' && installation?.kind !== 'mcpGallery') {
				return;
			}
			if (result?.kind === 'receipt') {
				this.rememberCatalogAssociation(result.installationId, resource);
				return;
			}
			if (result?.kind === 'plugin') {
				this.pendingCatalogAssociations.push({ identity: result, directSourceId: await getAppliedPluginSourceId(result), resource });
				while (this.pendingCatalogAssociations.length > maxCatalogAssociations) {
					this.pendingCatalogAssociations.shift();
				}
			}
		});
	}

	/** Describes what a dialog asks the user to confirm. */
	private getReviewDetail(review: IAgentCustomizationInstallationReview): string {
		if (review.kind === 'skill') {
			const modifiedDetail = review.filesModified
				? localize('agentHost.customizationInstall.skillFilesModified', "\n\nThe installed files have been modified. Removal will be blocked if they change after this review.")
				: '';
			return review.action === 'install'
				? localize('agentHost.customizationInstall.skillInstallDetail', "Skills can supply instructions and scripts that an agent may run. Only install resources from sources you trust.\n\nSource: {0}\nDestination: {1}\nFiles: {2}\nSize: {3} bytes", review.source, review.target, review.fileCount, review.totalBytes)
				: localize('agentHost.customizationInstall.skillUninstallDetail', "Remove {0} owned files ({1} bytes) from {2}.{3}", review.fileCount, review.totalBytes, review.target, modifiedDetail);
		}
		if (review.kind === 'plugin') {
			const status = localize('agentHost.customizationInstall.pluginActivated', "The plugin will be enabled for your profile after installation, and running chats will reload its contributions.");
			const mcpServers = review.mcpServerCount
				? localize('agentHost.customizationInstall.pluginMcpServers', "\nDeclared MCP servers: {0}", review.mcpServerCount)
				: '';
			return localize('agentHost.customizationInstall.pluginInstallDetail', "Plugins can supply agents, skills, hooks, and MCP servers. Only install resources from sources you trust.\n\nSource: {0}\nDestination: {1}\nFiles: {2}\nSize: {3} bytes\n\n{4}{5}", review.source, review.target, review.fileCount, review.totalBytes, status, mcpServers);
		}
		// An MCP server installation is reviewed in the install form instead.
		return localize('agentHost.customizationInstall.mcpUninstallDetail', "Server: {0}\nRestores previous configuration: {1}\nShared authentication is preserved: {2}", review.serverName, review.restoresPreviousConfiguration ? localize('agentHost.customizationInstall.yes', "Yes") : localize('agentHost.customizationInstall.no', "No"), review.preservesSharedAuthentication ? localize('agentHost.customizationInstall.yes', "Yes") : localize('agentHost.customizationInstall.no', "No"));
	}

	private toRecordedInstallation(sessionResource: URI, installation: IAgentCustomizationInstallation): IRecordedCustomizationMarketplaceResource {
		const resource = this.catalogAssociations.get(installation.installationId) ?? this.toMarketplaceResource(installation);
		const state = installation.state === 'error'
			? { kind: 'error' as const, message: installation.errorMessage ?? localize('agentHost.customizationInstall.inventoryError', "Could not verify this installation."), target: this.getTarget(sessionResource, installation) }
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
			displayName: catalogue?.displayName ?? (installation.kind === 'skill' ? installation.name : this.registryNames.get(installation.serverName)?.displayName ?? installation.serverName),
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

	/**
	 * Asks the MCP registry what it calls configured servers that have no catalog metadata, such
	 * as Gallery servers installed before this window opened. Inventory does not wait for the
	 * answer: a name that is found refreshes it.
	 */
	private async resolveRegistryNames(installations: readonly IAgentCustomizationInstallation[]): Promise<void> {
		const registryNames = this.registryNames;
		const now = Date.now();
		const names = [...new Set(installations.flatMap(installation => {
			// Only a key shaped like a registry server name is sent to the registry.
			if (installation.kind !== 'mcp' || installation.catalogue || !mcpRegistryServerNamePattern.test(installation.serverName)) {
				return [];
			}
			const known = registryNames.get(installation.serverName);
			return known && (known.retryAt === undefined || known.retryAt > now) ? [] : [installation.serverName];
		}))];
		if (!names.length) {
			return;
		}
		const retry = { retryAt: now + registryNameRetryDelay };
		for (const name of names) {
			// Claimed, so inventory read in the meantime does not ask again.
			registryNames.set(name, retry);
		}
		let found = false;
		try {
			const resolved = await this.mcpGalleryService.resolveMcpServersFromGallery(names.map(name => ({ name })));
			for (const name of names) {
				const result = resolved.get(name);
				if (result?.status === McpGalleryResolveStatus.Found) {
					registryNames.set(name, { displayName: result.server.displayName });
					found = true;
				} else if (result?.status === McpGalleryResolveStatus.NotFound) {
					registryNames.set(name, {});
				}
			}
		} catch (error) {
			this.logService.trace('[AgentHostCustomizationMarketplace] Unable to look up MCP registry names', error);
		}
		// An answer from a registry that was replaced in the meantime says nothing about the current one.
		if (found && registryNames === this.registryNames && !this._store.isDisposed) {
			this._onDidChange.fire();
		}
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

	private async listPluginInstallations(sessionResource: URI, token: CancellationToken): Promise<readonly IAgentPluginInstallation[]> {
		const backendSession = this.getBackendSession(sessionResource);
		if (!this.agentHostService.listPluginInstallations) {
			return [];
		}
		const installations = await this.agentHostService.listPluginInstallations(this.providerId, backendSession, this.agentHostCustomizationService.getBackendChatResource?.(sessionResource));
		this.throwIfCancelled(token);
		return installations;
	}

	private async getPluginInstallations(sessionResource: URI, token: CancellationToken): Promise<readonly IRecordedCustomizationMarketplaceResource[]> {
		const installations = await this.listPluginInstallations(sessionResource, token);
		const matchCounts = new Map<string, number>();
		for (const installation of installations) {
			const key = getPluginInstallationId(installation);
			matchCounts.set(key, (matchCounts.get(key) ?? 0) + 1);
		}
		const result: IRecordedCustomizationMarketplaceResource[] = [];
		for (const installation of installations) {
			const installationId = getPluginInstallationId(installation);
			const plugin = this.findDiscoveredPlugin(installation);
			if (plugin) {
				this.associatePluginCatalogResource(plugin);
			}
			const resource = this.catalogAssociations.get(installationId);
			const uninstallUnavailableMessage = (!installation.marketplace && !installation.directSourceId || matchCounts.get(installationId) !== 1)
				? localize('agentHost.customizationInstall.pluginRemovalIdentityUnavailable', "Uninstall is unavailable because the runtime has not reported a unique plugin installation identity. Refresh the plugin inventory and try again.")
				: undefined;
			result.push({
				installationId,
				resource: resource ?? toPluginMarketplaceResource(installation, this.logService, plugin),
				state: {
					kind: 'installed',
					target: { kind: 'plugin', name: plugin?.copilotCliInstallation?.name ?? installation.name, ...(plugin ? { uri: plugin.uri } : {}) },
					...(uninstallUnavailableMessage ? { uninstallUnavailableMessage } : {}),
				},
			});
		}
		return result;
	}

	private findDiscoveredPlugin(installation: IAgentPluginInstallation): IAgentPlugin | undefined {
		if (!installation.marketplace && !installation.directSourceId) {
			return undefined;
		}
		const matches = this.agentPluginService.plugins.get().filter(plugin =>
			plugin.copilotCliInstallation && getPluginInstallationId(plugin.copilotCliInstallation) === getPluginInstallationId(installation));
		return matches.length === 1 ? matches[0] : undefined;
	}

	private associatePluginCatalogResource(plugin: IAgentPlugin): void {
		const installation = plugin.copilotCliInstallation;
		if (!installation) {
			return;
		}
		const pendingIndex = this.pendingCatalogAssociations.findIndex(candidate => matchesAppliedPlugin(plugin, candidate.identity, candidate.directSourceId));
		if (pendingIndex !== -1) {
			const { resource } = this.pendingCatalogAssociations.splice(pendingIndex, 1)[0];
			this.rememberCatalogAssociation(getPluginInstallationId(installation), resource);
		}
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

}

function getAppliedPluginSourceId(identity: AppliedPluginIdentity): Promise<string> {
	return getCopilotCliPluginSourceId({ kind: 'github', repository: identity.repository, sha: identity.ref, path: identity.path });
}

function matchesAppliedPlugin(plugin: IAgentPlugin, identity: AppliedPluginIdentity, directSourceId: string): boolean {
	const installation = plugin.copilotCliInstallation;
	const source = installation?.source;
	return !!installation?.directSourceId
		&& !installation.marketplace
		&& installation.name === identity.name
		&& (installation.directSourceId === directSourceId || source?.kind === 'github'
			&& source.repository.toLowerCase() === identity.repository.toLowerCase()
			&& (source.sha ?? source.ref) === identity.ref
			&& (source.path ?? '') === identity.path);
}

function toPluginMarketplaceResource(installation: IAgentPluginInstallation, logService: ILogService, plugin?: IAgentPlugin): ICustomizationMarketplaceResource {
	const source = installation.verifiedSource;
	const installedSource = plugin?.copilotCliInstallation?.source;
	const revision = installedSource?.kind === 'github' ? installedSource.sha ?? installedSource.ref : undefined;
	const directSource = !installation.marketplace && installedSource?.kind === 'github' && revision
		? { kind: 'plugin' as const, repository: installedSource.repository, ref: revision, path: installedSource.path ?? '' }
		: undefined;
	const configured = installation.marketplace
		? { kind: 'configuredPlugin' as const, name: installation.name, marketplace: installation.marketplace }
		: undefined;
	return {
		sourceId: configured ? CustomizationMarketplaceSources.PluginMarketplaces.id : CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
		identifier: configured ? JSON.stringify([installation.marketplace, installation.name]) : installation.directSourceId ?? installation.name,
		displayName: plugin?.label ?? installation.name,
		description: installation.description ?? '',
		mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		version: installation.version ?? plugin?.version?.get(),
		icon: getPluginIcon(installation.iconUrl, logService),
		repository: source
			? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${source.repository}` })
			: undefined,
		installation: configured ?? directSource,
	};
}

function getPluginIcon(value: string | undefined, logService: ILogService): URI | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (URL.canParse(value)) {
		const url = new URL(value);
		if (url.protocol === `${Schemas.https}:` && url.hostname && !url.username && !url.password) {
			return URI.parse(url.href);
		}
	}
	logService.warn('[AgentHostCustomizationMarketplace] Ignoring an invalid SDK plugin icon URL');
	return undefined;
}

function getPluginInstallationId(installation: IAgentPluginInstallation): string {
	return installation.marketplace
		? JSON.stringify(['plugin', installation.marketplace, installation.name])
		: installation.directSourceId
			? JSON.stringify(['plugin', 'direct', installation.directSourceId])
			: JSON.stringify(['plugin', 'unresolved', installation.name]);
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
