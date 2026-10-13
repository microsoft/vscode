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
import { IAgentCustomizationInstallation, IAgentCustomizationInstallationRequest, IAgentCustomizationInstallationReview } from '../../../../../../platform/agentHost/common/agent.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceRecoveryGroup, ICustomizationMarketplaceResource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IRecordedCustomizationMarketplaceResource, ICustomizationMarketplaceInstallProvider } from '../../../common/customizationMarketplaceInstallService.js';
import { ICustomizationMarketplaceSearchProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { getGitHubMcpRegistryIcon } from '../../aiCustomization/githubMcpRegistryIcons.js';

const maxCachedReceiptSessions = 50;
const maxCatalogAssociations = 1000;
const pluginInventoryUpdateTimeoutMs = 30_000;
const githubLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export class AgentHostCustomizationMarketplaceInstallProvider extends Disposable implements ICustomizationMarketplaceInstallProvider, ICustomizationMarketplaceSearchProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	private readonly receiptInstallations = new ResourceMap<readonly IRecordedCustomizationMarketplaceResource[]>();
	private readonly unavailableCatalogItems = new Map<string, string>();
	private readonly catalogAssociations = new Map<string, ICustomizationMarketplaceResource>();
	private knownInstallationIds = new Set<string>();
	private pendingCatalogInstall: { readonly resource: ICustomizationMarketplaceResource; readonly previousIds: ReadonlySet<string> } | undefined;
	private catalogAuthenticationRequired = false;
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
		if ((installation?.kind === 'skill' || installation?.kind === 'mcp') && !resource.externalUrl && !resource.url) {
			return localize('agentHost.customizationInstall.catalogIdentityUnavailable', "This customization does not provide the SDK catalog identity required for installation.");
		}
		return undefined;
	}

	getRecoveryAction(): ICustomizationMarketplaceSourceRecoveryAction | undefined {
		if (!this.catalogAuthenticationRequired) {
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
				this.catalogAuthenticationRequired = false;
			},
		};
	}

	async query(sessionResource: URI, options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage | undefined> {
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
		});
		const result = await search();
		this.throwIfCancelled(token);
		if (result.kind === 'unavailable') {
			this.catalogAuthenticationRequired = result.reason === 'authentication';
			switch (result.reason) {
				case 'authentication':
					throw new Error(localize('agentHost.customizationSearch.authenticationRequired', "Sign in to Copilot to search the GitHub Feed."));
				case 'session':
					throw new Error(localize('agentHost.customizationSearch.sessionUnavailable', "The selected Copilot session is unavailable for GitHub Feed search."));
				case 'unsupported':
					throw new Error(localize('agentHost.customizationSearch.unsupported', "The active Copilot runtime does not support GitHub Feed search."));
			}
		}
		this.catalogAuthenticationRequired = false;
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
					identifier: providerPlugin ? JSON.stringify([providerPlugin.marketplaceSource, providerPlugin.marketplace, providerPlugin.name]) : item.itemUrl ?? item.selectionId,
					displayName: item.displayName,
					description: item.description ?? '',
					mediaType: getCatalogMediaType(item.kind),
					tags: [],
					capabilities: [],
					representativeQueries: [],
					version: item.version,
					repository: item.repository ? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${item.repository}` }) : undefined,
					publisher: item.publisher,
					publisherUrl: publisher?.profile,
					icon: publisher?.avatar ?? registryIcon,
					installation: providerPlugin ?? { kind: 'providerCatalog' as const, resourceKind: item.kind, selectionId: item.selectionId, itemUrl: item.itemUrl },
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
			return [...(this.receiptInstallations.get(backendSession) ?? []), ...pluginInstallations];
		}
		this.throwIfCancelled(token);
		const rawReceiptInstallations = installations.map(installation => this.toRecordedInstallation(sessionResource, installation));
		this.captureCatalogAssociation(rawReceiptInstallations);
		const receiptInstallations = installations.map(installation => this.toRecordedInstallation(sessionResource, installation));
		this.receiptInstallations.set(backendSession, receiptInstallations);
		while (this.receiptInstallations.size > maxCachedReceiptSessions) {
			this.receiptInstallations.delete(this.receiptInstallations.keys().next().value!);
		}
		const result = [
			...receiptInstallations,
			...pluginInstallations,
		];
		this.knownInstallationIds = new Set(result.map(installation => installation.installationId).filter((id): id is string => !!id));
		return result;
	}

	async install(sessionResource: URI, resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		this.throwIfCancelled(token);
		const installation = resource.installation;
		if (installation?.kind === 'providerCatalog') {
			if (installation.resourceKind === 'plugin') {
				throw new Error(this.getInstallUnavailableMessage(resource) ?? localize('agentHost.customizationInstall.directPluginUnavailable', "The SDK cannot yet install a catalog plugin at its exact pinned revision."));
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
				itemUrl: installation.itemUrl,
				selectionId: installation.selectionId,
				installation: { kind: installation.resourceKind },
			}, token);
			await this.confirmAndApply(review, token);
			this.pendingCatalogInstall = { resource, previousIds: new Set(this.knownInstallationIds) };
			return;
		}
		if (installation?.kind === 'configuredPlugin') {
			if (!installation.name || !installation.marketplace || !installation.marketplaceId || !installation.marketplaceSource) {
				throw new Error(localize('agentHost.customizationInstall.pluginIdentityUnavailable', "The SDK plugin installation identity is unavailable."));
			}
			if (!this.agentHostService.installPlugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginUnavailable', "The selected agent does not support SDK plugin installation."));
			}
			await this.agentHostService.installPlugin(this.providerId, { source: `${installation.name}@${installation.marketplace}` });
			await this.waitForPluginInventory({ name: installation.name, marketplace: installation.marketplace }, true, token);
			this.throwIfCancelled(token);
			this._onDidChange.fire();
			return;
		}
		if (installation?.kind === 'providerPlugin') {
			if (!this.agentHostService.installPlugin) {
				throw new Error(localize('agentHost.customizationInstall.pluginUnavailable', "The selected agent does not support SDK plugin installation."));
			}
			await this.agentHostService.installPlugin(this.providerId, { source: `${installation.name}@${installation.marketplace}` });
			await this.waitForPluginInventory({ name: installation.name, marketplace: installation.marketplace }, true, token);
			this.throwIfCancelled(token);
			this._onDidChange.fire();
			return;
		}
		if (installation?.kind === 'plugin') {
			throw new Error(this.getInstallUnavailableMessage(resource)!);
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
			});
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

	private async confirmAndApply(review: IAgentCustomizationInstallationReview, token: CancellationToken): Promise<void> {
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
		await this.agentHostService.applyCustomizationInstallation(this.providerId, review.operationId);
		this.throwIfCancelled(token);
		this._onDidChange.fire();
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
			identifier: catalogue?.resourceId ?? catalogue?.itemUrl ?? installation.installationId,
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

	private captureCatalogAssociation(installations: readonly IRecordedCustomizationMarketplaceResource[]): void {
		const pending = this.pendingCatalogInstall;
		const pendingInstallation = pending?.resource.installation;
		if (!pending || pendingInstallation?.kind !== 'providerCatalog') {
			return;
		}
		const candidates = installations.filter(installation =>
			!!installation.installationId
			&& !pending.previousIds.has(installation.installationId)
			&& installation.state.target.kind === pendingInstallation.resourceKind
		);
		if (candidates.length === 1 && candidates[0].installationId) {
			this.catalogAssociations.set(candidates[0].installationId, pending.resource);
			while (this.catalogAssociations.size > maxCatalogAssociations) {
				this.catalogAssociations.delete(this.catalogAssociations.keys().next().value!);
			}
			this.pendingCatalogInstall = undefined;
		} else if (candidates.length > 1) {
			this.pendingCatalogInstall = undefined;
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
			const resource = toPluginMarketplaceResource(plugin);
			result.push({
				installationId: getPluginInstallationId(installation),
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
}

function isPluginInstallation(
	candidate: IAgentPlugin['copilotCliInstallation'],
	expected: NonNullable<IAgentPlugin['copilotCliInstallation']>,
): boolean {
	return candidate?.name === expected.name
		&& candidate.marketplace === expected.marketplace
		&& candidate.directSourceId === expected.directSourceId;
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
