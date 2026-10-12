/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose, CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CopilotConnectorsError } from '../../../../../platform/copilotConnectors/common/copilotConnectorsRequestService.js';
import { CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource, ICustomizationMarketplaceService, isCustomizationMarketplaceIconEqual } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { normalizeMcpGalleryUrl } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { affectsCustomizationMarketplaceSources, CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, getVisibleCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { mcpGalleryServiceUrlConfig } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService } from '../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';
import { createCustomizationMarketplaceInstallationSnapshot, CustomizationMarketplaceInstallationTarget, CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallProvider, ICustomizationMarketplaceInstallService, IRecordedCustomizationMarketplaceResource, RecordedCustomizationMarketplaceInstallState } from '../../common/customizationMarketplaceInstallService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { getCustomizationMarketplaceInstallTelemetryContext, runCustomizationMarketplaceInstallWithTelemetry } from '../../common/customizationMarketplaceInstallTelemetry.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { parseMarketplaceReference } from '../../common/plugins/marketplaceReference.js';
import { IMarketplacePlugin, IMarketplaceReference, IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { getConnectorRowPresentation } from './connectorPresentation.js';
import { ICopilotConnectorAccount, ICopilotConnectorsService, toCopilotConnectorMarketplaceEntry } from './copilotConnectorsService.js';
import { getGitHubMcpRegistryIdentity, getGitHubMcpRegistryResourceIdentity } from './githubMcpRegistryIcons.js';
import { getPluginCustomizationMarketplaceSourceIdFromIdentifier, getPluginMarketplaceIdentifier } from './pluginCustomizationMarketplaceProvider.js';
import { CustomizationMarketplaceInstallationAssociationCache as CustomizationMarketplaceInstallationRecordStore, CustomizationMarketplaceInstallationAssociationTarget as CustomizationMarketplaceInstallationRecordTarget, getInstallationAssociationResourceKey as getInstallationRecordResourceKey, ICustomizationMarketplaceInstallationAssociation as ICustomizationMarketplaceInstallationRecord, removeLegacyCustomizationMarketplaceInstallationRecords, toAssociatedMarketplaceResource as toRecordedMarketplaceResource } from './customizationMarketplaceInstallationAssociation.js';

type McpGalleryInstallation = Extract<CustomizationMarketplaceInstallation, { readonly kind: 'mcpGallery' }>;
type InstallationRecordState =
	| { readonly kind: 'checking' | 'installed' | 'missing' }
	| { readonly kind: 'error'; readonly message: string };

interface IPendingOperation {
	readonly promise: Promise<void>;
	cancel(): void;
}

interface IInstallProviderBinding {
	readonly provider: ICustomizationMarketplaceInstallProvider;
	readonly session: URI;
	refreshVersion: number;
}

export class CustomizationMarketplaceInstallService extends Disposable implements ICustomizationMarketplaceInstallService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	readonly installations: IObservable<ICustomizationMarketplaceInstallationSnapshot>;
	private installationSnapshot: ICustomizationMarketplaceInstallationSnapshot | undefined;
	private readonly pending = new Map<string, IPendingOperation>();
	private readonly pendingRepairs = new Map<string, IPendingOperation>();
	private readonly pendingUninstalls = new Map<string, Promise<void>>();
	private readonly recordStates = new Map<string, InstallationRecordState>();
	private readonly reconciliationVersions = new Map<string, number>();
	private readonly recordStore: CustomizationMarketplaceInstallationRecordStore;
	private readonly lifetimeToken = cancelOnDispose(this._store);
	private readonly enabledDisposables = this._register(new DisposableStore());
	private readonly connectorListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly providerRequest = this._register(new MutableDisposable<DisposableStore>());
	private providerInstallations: readonly IRecordedCustomizationMarketplaceResource[] = [];
	private readonly knownResources = new Map<string, ICustomizationMarketplaceResource>();
	private providerBinding: IInstallProviderBinding | undefined;
	private providerChangeScheduled = false;
	private observingInstallations = false;

	constructor(
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ICustomizationMarketplaceService private readonly customizationMarketplaceService: ICustomizationMarketplaceService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		removeLegacyCustomizationMarketplaceInstallationRecords(storageService);
		this.recordStore = this._register(new CustomizationMarketplaceInstallationRecordStore());
		for (const record of this.recordStore.associations.values()) {
			this.recordStates.set(record.id, { kind: 'checking' });
		}
		this.installations = observableFromEvent(this, this.onDidChange, () => this.getInstallationSnapshot());
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (affectsCustomizationMarketplaceSources(event, this.customizationMarketplaceService.allSources ?? this.customizationMarketplaceService.sources)) {
				this.updateEnablement();
			} else if (this.isEnabled() && (event.affectsConfiguration(ChatConfiguration.PluginsEnabled) ||
				event.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled))) {
				this.emitChange();
			}
		}));
		if (this.customizationMarketplaceService.onDidChangeSources) {
			this._register(this.customizationMarketplaceService.onDidChangeSources(() => this.updateEnablement()));
		}
		this._register(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.harnessService.activeSessionResource.read(reader);
			this.bindInstallProvider();
		}));
		this.updateEnablement();
	}

	private emitChange(): void {
		this.installationSnapshot = undefined;
		this._onDidChange.fire();
	}

	private getInstallationSnapshot(): ICustomizationMarketplaceInstallationSnapshot {
		const associations = this.getRelevantRecords().map(record => {
			const resource = toRecordedMarketplaceResource(record);
			return { resource, state: this.getRecordedInstallState(record, resource) };
		});
		const providerInstallations = this.providerInstallations.map(installation => {
			const resource = this.findKnownResource(installation.resource) ?? installation.resource;
			return resource === installation.resource ? installation : { ...installation, resource };
		});
		return this.installationSnapshot ??= createCustomizationMarketplaceInstallationSnapshot(
			[...providerInstallations, ...associations],
			(recorded, resource) => this.isLegacyConfiguredPluginResource(recorded, resource),
		);
	}

	private bindInstallProvider(): void {
		this.providerRequest.clear();
		const hadInstallations = this.providerInstallations.length > 0;
		this.providerInstallations = [];
		if (hadInstallations) {
			this.emitChange();
		}
		const provider = this.harnessService.getActiveDescriptor().marketplaceInstallProvider;
		if (!provider) {
			this.providerBinding = undefined;
			return;
		}
		const binding: IInstallProviderBinding = {
			provider,
			session: this.harnessService.activeSessionResource.get(),
			refreshVersion: 0,
		};
		this.providerBinding = binding;
		const store = new DisposableStore();
		this.providerRequest.value = store;
		store.add(provider.onDidChange(() => void this.refreshProviderInstallations(binding)));
		void this.refreshProviderInstallations(binding);
	}

	private async refreshProviderInstallations(binding: IInstallProviderBinding): Promise<void> {
		const refreshVersion = ++binding.refreshVersion;
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(this.lifetimeToken));
		try {
			const installations = await binding.provider.getInstallations(binding.session, cancellation.token);
			if (binding !== this.providerBinding || refreshVersion !== binding.refreshVersion || cancellation.token.isCancellationRequested || this._store.isDisposed) {
				return;
			}
			this.providerInstallations = installations;
			this.emitChange();
		} catch (error) {
			if (!cancellation.token.isCancellationRequested) {
				this.logService.error('[CustomizationMarketplace] Unable to load provider-owned installations', error);
			}
		} finally {
			store.dispose();
		}
	}

	private rememberResource(resource: ICustomizationMarketplaceResource): void {
		const key = getCustomizationMarketplaceResourceKey(resource);
		const previous = this.knownResources.get(key);
		if (previous && isCustomizationMarketplaceIconEqual(previous.icon, resource.icon)) {
			return;
		}
		this.knownResources.set(key, resource);
		while (this.knownResources.size > 1000) {
			this.knownResources.delete(this.knownResources.keys().next().value!);
		}
		if (!this.providerChangeScheduled && this.providerInstallations.some(installation => this.matchesProviderInstallation(installation.resource, resource))) {
			this.providerChangeScheduled = true;
			queueMicrotask(() => {
				this.providerChangeScheduled = false;
				if (!this._store.isDisposed) {
					this.emitChange();
				}
			});
		}
	}

	private findKnownResource(resource: ICustomizationMarketplaceResource): ICustomizationMarketplaceResource | undefined {
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		let exactResource: ICustomizationMarketplaceResource | undefined;
		for (const candidate of this.knownResources.values()) {
			if (!this.matchesProviderInstallation(resource, candidate)) {
				continue;
			}
			if (getCustomizationMarketplaceResourceKey(candidate) !== resourceKey) {
				return candidate;
			}
			exactResource ??= candidate;
		}
		return exactResource;
	}

	private matchesProviderInstallation(installed: ICustomizationMarketplaceResource, resource: ICustomizationMarketplaceResource): boolean {
		if (getCustomizationMarketplaceResourceKey(installed) === getCustomizationMarketplaceResourceKey(resource)) {
			return true;
		}
		const versionsCompatible = installed.version === undefined || resource.version === undefined || installed.version === resource.version;
		if (versionsCompatible && installed.externalUrl && resource.externalUrl && installed.externalUrl === resource.externalUrl) {
			return true;
		}
		const installedRegistryIdentity = this.getGitHubMcpRegistryIdentity(installed);
		const resourceRegistryIdentity = this.getGitHubMcpRegistryIdentity(resource);
		if (versionsCompatible && installedRegistryIdentity && resourceRegistryIdentity && installedRegistryIdentity === resourceRegistryIdentity) {
			return true;
		}
		const installedSource = installed.installation;
		const resourceSource = resource.installation;
		if (installedSource?.kind === 'configuredPlugin' &&
			(resourceSource?.kind === 'configuredPlugin' || resourceSource?.kind === 'providerPlugin')) {
			return versionsCompatible && installedSource.name === resourceSource.name && installedSource.marketplace === resourceSource.marketplace;
		}
		if (installedSource?.kind === 'plugin' && resourceSource?.kind === 'plugin') {
			return installedSource.repository.toLowerCase() === resourceSource.repository.toLowerCase()
				&& installedSource.path === resourceSource.path
				&& installedSource.ref === resourceSource.ref
				&& versionsCompatible;
		}
		return false;
	}

	private getGitHubMcpRegistryIdentity(resource: ICustomizationMarketplaceResource): string | undefined {
		const installation = resource.installation;
		const itemUrl = installation?.kind === 'providerCatalog' ? installation.itemUrl : undefined;
		return getGitHubMcpRegistryResourceIdentity(resource.identifier)?.toLowerCase()
			?? getGitHubMcpRegistryIdentity(itemUrl ?? resource.externalUrl ?? resource.url?.toString(true) ?? resource.identifier)?.toLowerCase();
	}

	private isEnabled(): boolean {
		return getVisibleCustomizationMarketplaceSources(this.configurationService, this.customizationMarketplaceService.sources).length > 0;
	}

	private isSourceEnabled(sourceId: string): boolean {
		return getVisibleCustomizationMarketplaceSources(this.configurationService, this.customizationMarketplaceService.sources)
			.some(source => source.id === sourceId);
	}

	private getInstalledGalleryMcpServer(source: McpGalleryInstallation): IWorkbenchMcpServer | undefined {
		const registryUrl = normalizeMcpGalleryUrl(source.registryUrl);
		return registryUrl ? this.mcpWorkbenchService.local.find(server => server.name === source.name &&
			server.local?.name === source.name &&
			normalizeMcpGalleryUrl(server.local.galleryUrl) === registryUrl &&
			server.gallery?.name === source.name &&
			normalizeMcpGalleryUrl(server.gallery.galleryUrl) === registryUrl &&
			server.installState === McpServerInstallState.Installed) : undefined;
	}

	private isMcpGallerySourceCurrent(source: McpGalleryInstallation): boolean {
		return source.registry === 'default'
			? true
			: normalizeMcpGalleryUrl(this.configurationService.getValue<string>(mcpGalleryServiceUrlConfig)) === normalizeMcpGalleryUrl(source.registryUrl);
	}

	private updateEnablement(): void {
		if (this.isSourceEnabled(CustomizationMarketplaceSources.CopilotConnectors.id)) {
			if (!this.connectorListeners.value) {
				const listeners = new DisposableStore();
				this.connectorListeners.value = listeners;
				listeners.add(this.copilotConnectorsService.onDidChange(() => {
					this.emitChange();
					void this.synchronizeConnectedConnectorRecords();
				}));
				listeners.add(this.copilotConnectorsService.onDidChangeAccount(() => {
					this.synchronizeRecordStates();
					this.emitChange();
					void this.reconcileRecords(this.getApplicableConnectorRecords());
				}));
				listeners.add(this.copilotConnectorsService.onDidDisconnect(name => {
					const account = this.copilotConnectorsService.account;
					const record = account ? this.findConnectorRecord(name, account) : undefined;
					if (record) {
						this.removeRecord(record);
						this.emitChange();
					}
				}));
			}
		} else {
			this.connectorListeners.clear();
		}
		const enabled = this.isEnabled();
		if (enabled === this.observingInstallations) {
			this.emitChange();
			void this.synchronizeConnectedConnectorRecords();
			return;
		}
		this.observingInstallations = enabled;
		this.enabledDisposables.clear();
		if (!enabled) {
			this.emitChange();
			return;
		}
		this.enabledDisposables.add(autorun(reader => {
			this.pluginMarketplaceService.installedPlugins.read(reader);
			this.agentPluginService.plugins.read(reader);
			this.emitChange();
			void this.reconcileRecords(this.getRecordsByKind('plugin'));
		}));
		this.enabledDisposables.add(this.mcpWorkbenchService.onChange(() => {
			this.emitChange();
			void this.reconcileRecords(this.getRecordsByKind('mcp'));
		}));
		this.enabledDisposables.add(this.mcpWorkbenchService.onReset(() => {
			this.emitChange();
			void this.reconcileRecords(this.getRecordsByKind('mcp'));
		}));
		this.enabledDisposables.add(this.entitlementService.onDidChangeSentiment(() => this.emitChange()));
		void this.reconcileRecords(this.getRecordsByKind('mcp'));
		void this.synchronizeConnectedConnectorRecords();
	}

	private synchronizeRecordStates(reset = false): void {
		for (const id of [...this.recordStates.keys()]) {
			if (!this.recordStore.associations.has(id)) {
				this.recordStates.delete(id);
				this.reconciliationVersions.delete(id);
			}
		}
		for (const record of this.recordStore.associations.values()) {
			if (reset || !this.recordStates.has(record.id)) {
				this.recordStates.set(record.id, { kind: 'checking' });
			}
		}
	}

	private getRecordsByKind(kind: CustomizationMarketplaceInstallationRecordTarget['kind']): ICustomizationMarketplaceInstallationRecord[] {
		return [...this.recordStore.associations.values()].filter(record => record.target.kind === kind);
	}

	private getApplicableConnectorRecords(): ICustomizationMarketplaceInstallationRecord[] {
		return this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) === true
			? this.getRecordsByKind('copilotConnector').filter(record => this.isRecordApplicable(record))
			: [];
	}

	private getRelevantRecords(): ICustomizationMarketplaceInstallationRecord[] {
		return [...this.getRecordsByKind('plugin'), ...this.getRecordsByKind('mcp'), ...this.getApplicableConnectorRecords()]
			.filter(record => !this.isProviderManagedInstallation(record.installation));
	}

	private async synchronizeConnectedConnectorRecords(): Promise<void> {
		if (!this.isSourceEnabled(CustomizationMarketplaceSources.CopilotConnectors.id)) {
			return;
		}
		const account = this.copilotConnectorsService.account;
		if (!account) {
			return;
		}
		for (const connector of this.copilotConnectorsService.connectors) {
			if (connector.connectionStatus !== 'connected') {
				continue;
			}
			try {
				const resource: ICustomizationMarketplaceResource = {
					...toCopilotConnectorMarketplaceEntry(connector),
					sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
				};
				const existing = this.findConnectorRecord(connector.name, account);
				const record = await this.createConnectorRecord(resource, account, existing?.id);
				const didChange = !existing || existing.version !== record.version || existing.displayName !== record.displayName || existing.description !== record.description || !isCustomizationMarketplaceIconEqual(existing.icon, record.icon);
				if (didChange) {
					this.recordStore.upsert(record);
					this.recordStates.set(record.id, { kind: 'checking' });
					this.emitChange();
				}
			} catch (error) {
				this.logService.error(`[CustomizationMarketplace] Unable to record connected Copilot connector '${connector.name}'`, error);
			}
		}
		await this.reconcileRecords(this.getApplicableConnectorRecords());
	}

	private async createConnectorRecord(resource: ICustomizationMarketplaceResource, account: ICopilotConnectorAccount, existingId?: string): Promise<ICustomizationMarketplaceInstallationRecord> {
		const installation = resource.installation;
		if (installation?.kind !== 'copilotConnector') {
			throw new Error(localize('customizationMarketplace.connectorInstallationMetadataUnavailable', "Copilot connector installation metadata is unavailable."));
		}
		return {
			id: existingId ?? await createInstallationRecordId([
				getCustomizationMarketplaceResourceKey(resource),
				account.providerId,
				account.enterprise ? 'enterprise' : 'public',
				account.accountName,
			]),
			sourceId: resource.sourceId,
			identifier: resource.identifier,
			version: resource.version,
			displayName: resource.displayName,
			description: resource.description,
			mediaType: resource.mediaType,
			icon: resource.icon,
			installation,
			target: {
				kind: 'copilotConnector',
				name: installation.name,
				providerId: account.providerId,
				accountName: account.accountName,
				enterprise: account.enterprise,
			},
		};
	}

	private findConnectorRecord(name: string, account: ICopilotConnectorAccount): ICustomizationMarketplaceInstallationRecord | undefined {
		return this.getRecordsByKind('copilotConnector').find(record =>
			record.target.kind === 'copilotConnector'
			&& record.target.name === name
			&& isConnectorAccountEqual(record.target, account));
	}

	private async addRecord(record: ICustomizationMarketplaceInstallationRecord): Promise<void> {
		this.recordStore.upsert(record);
		this.recordStates.delete(record.id);
		await this.reconcileRecords([record]);
	}

	private removeRecord(record: ICustomizationMarketplaceInstallationRecord): void {
		this.recordStore.delete(record);
		this.recordStates.delete(record.id);
		this.reconciliationVersions.delete(record.id);
	}

	private findRecord(resource: ICustomizationMarketplaceResource): ICustomizationMarketplaceInstallationRecord | undefined {
		if (this.getInstallProviderBinding(resource)) {
			return undefined;
		}
		if (resource.installation?.kind === 'copilotConnector') {
			const account = this.copilotConnectorsService.account;
			return account ? this.findConnectorRecord(resource.installation.name, account) : undefined;
		}
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		return [...this.recordStore.associations.values()].find(record =>
			this.isRecordApplicable(record) && (
				getInstallationRecordResourceKey(record) === resourceKey ||
				this.isLegacyConfiguredPluginRecord(record, resource)
			));
	}

	private isLegacyConfiguredPluginRecord(record: ICustomizationMarketplaceInstallationRecord, resource: ICustomizationMarketplaceResource): boolean {
		return this.isLegacyConfiguredPluginResource(record, resource);
	}

	private isLegacyConfiguredPluginResource(recorded: ICustomizationMarketplaceInstallationRecord | ICustomizationMarketplaceResource, resource: ICustomizationMarketplaceResource): boolean {
		return recorded.sourceId === CustomizationMarketplaceSources.PluginMarketplaces.id &&
			recorded.installation?.kind === 'configuredPlugin' &&
			resource.installation?.kind === 'configuredPlugin' &&
			recorded.identifier === resource.identifier &&
			recorded.version === resource.version;
	}

	private getRecordSourceId(record: ICustomizationMarketplaceInstallationRecord): string {
		return record.sourceId === CustomizationMarketplaceSources.PluginMarketplaces.id && record.installation.kind === 'configuredPlugin'
			? getPluginCustomizationMarketplaceSourceIdFromIdentifier(record.identifier) ?? record.sourceId
			: record.sourceId;
	}

	private isRecordApplicable(record: ICustomizationMarketplaceInstallationRecord): boolean {
		if (record.target.kind === 'copilotConnector') {
			const account = this.copilotConnectorsService.account;
			return !!account && isConnectorAccountEqual(record.target, account);
		}
		return true;
	}

	private toInstallationTarget(record: ICustomizationMarketplaceInstallationRecord): CustomizationMarketplaceInstallationTarget {
		switch (record.target.kind) {
			case 'plugin': return { kind: 'plugin', uri: record.target.uri };
			case 'mcp': return { kind: 'mcp', id: record.target.id };
			case 'copilotConnector': return { kind: 'copilotConnector', name: record.target.name };
		}
	}

	private async reconcileRecords(records: readonly ICustomizationMarketplaceInstallationRecord[]): Promise<void> {
		await Promise.all(records.map(record => this.reconcileRecord(record)));
	}

	private async reconcileRecord(original: ICustomizationMarketplaceInstallationRecord): Promise<void> {
		const version = (this.reconciliationVersions.get(original.id) ?? 0) + 1;
		this.reconciliationVersions.set(original.id, version);
		let record = original;
		let state: InstallationRecordState;
		try {
			if (record.target.kind === 'copilotConnector') {
				const target = record.target;
				const connector = this.copilotConnectorsService.connectors.find(candidate => candidate.name === target.name);
				state = {
					kind: !this.copilotConnectorsService.connectionStateKnown || connector?.connectionStatus === 'unknown'
						? 'checking'
						: connector?.connectionStatus === 'connected' ? 'installed' : 'missing',
				};
			} else if (record.target.kind === 'plugin') {
				const target = record.target;
				const installed = await this.getExistingInstalledPlugin(record);
				state = { kind: installed ? 'installed' : 'missing' };
				if (installed && !isEqual(installed.pluginUri, target.uri)) {
					record = { ...record, target: { ...target, uri: installed.pluginUri } };
				}
			} else {
				const target = record.target;
				const installed = this.mcpWorkbenchService.local.find(server => server.id === target.id && server.installState === McpServerInstallState.Installed)
					?? (record.installation.kind === 'mcpGallery' ? this.getInstalledGalleryMcpServer(record.installation) : undefined);
				state = { kind: installed ? 'installed' : 'missing' };
				if (installed && installed.id !== target.id) {
					record = { ...record, target: { kind: 'mcp', id: installed.id } };
				}
			}
		} catch (error) {
			this.logService.error(`[CustomizationMarketplace] Unable to verify installation '${original.id}'`, error);
			state = { kind: 'error', message: localize('customizationMarketplace.installationVerificationFailed', "Could not verify this customization installation. {0}", getErrorMessage(error)) };
		}
		if (this.reconciliationVersions.get(original.id) !== version || this._store.isDisposed || this.recordStore.associations.get(original.id) !== original) {
			return;
		}
		const didUpdateRecord = record !== original;
		if (didUpdateRecord) {
			this.recordStore.upsert(record);
		}
		const previous = this.recordStates.get(record.id);
		if (didUpdateRecord || !previous || previous.kind !== state.kind || previous.kind === 'error' && state.kind === 'error' && previous.message !== state.message) {
			this.recordStates.set(record.id, state);
			this.emitChange();
		}
	}

	private getSourceUnavailableMessage(sourceId: string): string | undefined {
		const source = (this.customizationMarketplaceService.allSources ?? this.customizationMarketplaceService.sources).find(candidate => candidate.id === sourceId);
		if (!source) {
			return localize('customizationMarketplace.sourceUnavailableForRepair', "This resource's marketplace source is no longer available, so it cannot be repaired.");
		}
		return this.configurationService.getValue<boolean>(source.enablementSetting) === true
			? undefined
			: localize('customizationMarketplace.sourceDisabled', "Enable this resource's marketplace source to install it.");
	}

	private getRepairUnavailableMessage(record: ICustomizationMarketplaceInstallationRecord): string | undefined {
		if (!this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled)) {
			return localize('customizationMarketplace.disabled', "Enable the customization marketplace to install this resource.");
		}
		const sourceUnavailableMessage = this.getSourceUnavailableMessage(this.getRecordSourceId(record));
		if (sourceUnavailableMessage) {
			return sourceUnavailableMessage;
		}
		if (this.entitlementService.sentiment.hidden) {
			return localize('customizationMarketplace.aiDisabled', "Enable AI features to install customizations.");
		}
		if ((record.installation.kind === 'plugin' || record.installation.kind === 'configuredPlugin') && !this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
			return localize('customizationMarketplace.pluginsDisabled', "Enable agent plugins to install this resource.");
		}
		if (record.target.kind === 'copilotConnector') {
			const target = record.target;
			const connector = this.copilotConnectorsService.connectors.find(candidate => candidate.name === target.name);
			if (!connector) {
				return localize('customizationMarketplace.connectorNoLongerAvailable', "This connector is no longer available from the Copilot Connectors catalog.");
			}
			const presentation = getConnectorRowPresentation(connector);
			if (connector.connectionStatus !== 'connected' && !presentation.action) {
				return localize('customizationMarketplace.connectorRepairUnavailable', "This connector cannot be reconnected while its status is '{0}'.", presentation.statusLabel);
			}
		}
		return undefined;
	}

	private getRecordedInstallState(record: ICustomizationMarketplaceInstallationRecord, resource: ICustomizationMarketplaceResource): RecordedCustomizationMarketplaceInstallState {
		const target = this.toInstallationTarget(record);
		if (this.pendingUninstalls.has(record.target.kind === 'copilotConnector' ? getConnectorOperationKey(resource) : record.id)) {
			return { kind: 'uninstalling', target };
		}
		if (this.pendingRepairs.has(record.id)) {
			return { kind: 'repairing', target };
		}
		const state = this.recordStates.get(record.id) ?? { kind: 'checking' as const };
		if (state.kind === 'error') {
			return { ...state, target };
		}
		return state.kind === 'missing' ? { kind: 'missing', target, repairUnavailableMessage: this.getRepairUnavailableMessage(record) } : { kind: state.kind, target };
	}

	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
		this.rememberResource(resource);
		if (resource.installation?.kind === 'copilotConnector' &&
			this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) !== true) {
			return { kind: 'unavailable', message: localize('customizationMarketplace.connectorsDisabled', "Enable the Copilot connectors experiment to connect this resource.") };
		}
		const providerInstallation = this.providerInstallations.find(installation => this.matchesProviderInstallation(installation.resource, resource));
		if (providerInstallation) {
			return this.getProviderInstallState(providerInstallation);
		}
		const providerBinding = this.getInstallProviderBinding(resource);
		const ownerAssociation = this.findRecord(resource);
		if (ownerAssociation?.id.startsWith('owner:') && !this.isOwnerAssociationCurrent(resource, ownerAssociation)) {
			this.removeRecord(ownerAssociation);
			this.installationSnapshot = undefined;
		}
		const recorded = providerBinding ? undefined : this.installations.get().findByResource(resource);
		if (recorded) {
			return recorded.state;
		}
		if (!this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled)) {
			return { kind: 'unavailable', message: localize('customizationMarketplace.disabled', "Enable the customization marketplace to install this resource.") };
		}
		const sourceUnavailableMessage = this.getSourceUnavailableMessage(resource.sourceId);
		if (sourceUnavailableMessage) {
			return { kind: 'unavailable', message: sourceUnavailableMessage };
		}
		if (this.entitlementService.sentiment.hidden) {
			return { kind: 'unavailable', message: localize('customizationMarketplace.aiDisabled', "Enable AI features to install customizations.") };
		}
		const operationKey = resource.installation?.kind === 'copilotConnector' ? getConnectorOperationKey(resource) : getCustomizationMarketplaceResourceKey(resource);
		if (this.pending.has(operationKey)) {
			return { kind: 'installing' };
		}
		const source = resource.installation;
		const providerUnavailableMessage = providerBinding?.provider.getInstallUnavailableMessage?.(resource);
		if (providerUnavailableMessage) {
			return { kind: 'unavailable', message: providerUnavailableMessage };
		}
		if (source?.kind === 'configuredPlugin') {
			if (isWeb) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.pluginWebUnsupported', "Installing configured marketplace plugins is not available in VS Code for the Web.") };
			}
			if (!this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.pluginsDisabled', "Enable agent plugins to install this resource.") };
			}
			const installed = providerBinding ? undefined : this.pluginMarketplaceService.installedPlugins.get().find(({ plugin }) => getPluginMarketplaceIdentifier(plugin) === resource.identifier);
			if (installed) {
				const target = { kind: 'plugin' as const, uri: installed.pluginUri };
				this.associateInstalledResource(resource, target);
				return { kind: 'installed', target };
			}
			return { kind: 'available' };
		}

		if (!source) {
			return {
				kind: 'unavailable',
				message: resource.mediaType === CustomizationMarketplaceMediaType.CursorPlugin
					? localize('customizationMarketplace.cursorUnsupported', "Cursor plugins cannot be installed in VS Code. Open the resource to view its installation instructions.")
					: localize('customizationMarketplace.sourceUnavailable', "This resource does not provide a supported installation source."),
			};
		}
		if (source.kind === 'skill' || source.kind === 'mcp' || source.kind === 'plugin' || source.kind === 'providerPlugin' || source.kind === 'providerCatalog') {
			if ((source.kind === 'plugin' || source.kind === 'providerPlugin') &&
				!this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.pluginsDisabled', "Enable agent plugins to install this resource.") };
			}
			return providerBinding
				? { kind: 'available' }
				: { kind: 'unavailable', message: localize('customizationMarketplace.providerCatalogUnavailable', "The active agent cannot install this catalog resource.") };
		}
		if (source.kind === 'copilotConnector') {
			const target: CustomizationMarketplaceInstallationTarget = { kind: 'copilotConnector', name: source.name };
			if (this.pendingUninstalls.has(operationKey)) {
				return { kind: 'uninstalling', target };
			}
			if (this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) !== true) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.connectorsDisabled', "Enable the Copilot connectors experiment to connect this resource.") };
			}
			const connector = this.copilotConnectorsService.connectors.find(connector => connector.name === source.name);
			if (!connector) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.connectorStatusUnavailable', "This connector is no longer available. Refresh Discover and try again.") };
			}
			if (connector.connectionStatus === 'connected') {
				return { kind: 'installed', target };
			}
			const presentation = getConnectorRowPresentation(connector);
			return presentation.action
				? { kind: 'available' }
				: { kind: 'unavailable', message: localize('customizationMarketplace.connectorNotActionable', "This connector cannot be connected while its status is '{0}'. Refresh and try again.", presentation.statusLabel) };
		}
		if (source.kind === 'mcpGallery') {
			if (!this.isMcpGallerySourceCurrent(source)) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.mcpGalleryChanged', "The MCP registry changed after '{0}' was discovered. Refresh Discover and try again.", source.name) };
			}
			const installed = this.getInstalledGalleryMcpServer(source);
			if (installed) {
				const target = { kind: 'mcp' as const, id: installed.id };
				this.associateInstalledResource(resource, target);
				return { kind: 'installed', target };
			}
			return { kind: 'available' };
		}
		return { kind: 'available' };
	}

	private isOwnerAssociationCurrent(resource: ICustomizationMarketplaceResource, association: ICustomizationMarketplaceInstallationRecord): boolean {
		const source = resource.installation;
		if (association.target.kind === 'plugin') {
			return source?.kind === 'configuredPlugin' && this.pluginMarketplaceService.installedPlugins.get().some(({ plugin }) => getPluginMarketplaceIdentifier(plugin) === resource.identifier);
		}
		if (association.target.kind === 'mcp') {
			return source?.kind === 'mcpGallery' && !!this.getInstalledGalleryMcpServer(source);
		}
		return true;
	}

	private getProviderInstallState(installation: IRecordedCustomizationMarketplaceResource): RecordedCustomizationMarketplaceInstallState {
		const key = installation.installationId ?? getCustomizationMarketplaceResourceKey(installation.resource);
		if (this.pendingUninstalls.has(key)) {
			return { kind: 'uninstalling', target: installation.state.target };
		}
		if (this.pendingRepairs.has(key)) {
			return { kind: 'repairing', target: installation.state.target };
		}
		return installation.state;
	}

	private getInstallProviderBinding(resource: ICustomizationMarketplaceResource): IInstallProviderBinding | undefined {
		const binding = this.providerBinding;
		const provider = binding?.provider;
		const kind = resource.installation?.kind;
		return binding && provider && (kind === 'skill' || kind === 'mcp' || kind === 'plugin' || kind === 'configuredPlugin' || kind === 'providerPlugin'
			|| kind === 'providerCatalog'
			|| this.providerInstallations.some(installation => this.matchesProviderInstallation(installation.resource, resource)))
			? binding
			: undefined;
	}

	private isProviderManagedInstallation(installation: CustomizationMarketplaceInstallation): boolean {
		return !!this.providerBinding && (installation.kind === 'skill' || installation.kind === 'mcp' || installation.kind === 'plugin' || installation.kind === 'configuredPlugin' || installation.kind === 'providerPlugin' || installation.kind === 'providerCatalog');
	}

	private associateInstalledResource(resource: ICustomizationMarketplaceResource, target: Extract<CustomizationMarketplaceInstallationRecordTarget, { readonly kind: 'plugin' | 'mcp' }>): void {
		if (!resource.installation) {
			return;
		}
		const id = `owner:${getCustomizationMarketplaceResourceKey(resource)}`;
		if (this.recordStore.associations.has(id)) {
			return;
		}
		this.recordStore.upsert({
			id,
			sourceId: resource.sourceId,
			identifier: resource.identifier,
			version: resource.version,
			displayName: resource.displayName,
			description: resource.description,
			mediaType: resource.mediaType,
			installation: resource.installation,
			icon: resource.icon,
			target,
		});
		this.installationSnapshot = undefined;
		this.recordStates.set(id, { kind: 'installed' });
		if (!this.providerChangeScheduled) {
			this.providerChangeScheduled = true;
			queueMicrotask(() => {
				this.providerChangeScheduled = false;
				if (!this._store.isDisposed) {
					this.emitChange();
				}
			});
		}
	}

	async install(resource: ICustomizationMarketplaceResource): Promise<void> {
		const state = this.getInstallState(resource);
		if (state.kind === 'unavailable') {
			throw new Error(state.message);
		}
		const key = resource.installation?.kind === 'copilotConnector' ? getConnectorOperationKey(resource) : getCustomizationMarketplaceResourceKey(resource);
		const pending = this.pending.get(key);
		if (pending) {
			return pending.promise;
		}
		if (state.kind !== 'available') {
			return;
		}
		const connector = resource.installation?.kind === 'copilotConnector' ? resource.installation : undefined;
		const providerBinding = this.getInstallProviderBinding(resource);
		const operationDisposables = new DisposableStore();
		const token = cancelOnDispose(operationDisposables);
		const requiresMarketplaceTrust = resource.installation?.kind === 'configuredPlugin' || resource.installation?.kind === 'providerPlugin';
		operationDisposables.add(this.lifetimeToken.onCancellationRequested(() => operationDisposables.dispose()));
		if (requiresMarketplaceTrust) {
			operationDisposables.add(this.pluginMarketplaceService.onDidChangeMarketplaces(() => operationDisposables.dispose()));
		}
		operationDisposables.add(this.configurationService.onDidChangeConfiguration(event => {
			if (
				!this.isSourceEnabled(resource.sourceId) ||
				(requiresMarketplaceTrust && (
					event.affectsConfiguration(ChatConfiguration.StrictMarketplaces)
				)) ||
				(resource.installation?.kind === 'mcpGallery' && resource.installation.registry === 'custom' &&
					event.affectsConfiguration(mcpGalleryServiceUrlConfig))
			) {
				operationDisposables.dispose();
			}
		}));
		const operation = runCustomizationMarketplaceInstallWithTelemetry(
			this.telemetryService,
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', resource.installation),
			async () => {
				if (providerBinding) {
					if (resource.installation?.kind === 'configuredPlugin' || resource.installation?.kind === 'providerPlugin') {
						const marketplaceReference = resource.installation.kind === 'configuredPlugin'
							? (await this.resolveConfiguredPlugin(resource, token)).marketplaceReference
							: this.resolveProviderPluginMarketplaceReference(resource);
						if (!await this.pluginInstallService.ensureMarketplaceTrusted(marketplaceReference, token)) {
							throw new CancellationError();
						}
					}
					await providerBinding.provider.install(providerBinding.session, resource, token);
					if (providerBinding === this.providerBinding) {
						await this.refreshProviderInstallations(providerBinding);
					}
					return;
				}
				if (!connector) {
					const record = await this.doInstall(resource, token);
					await this.addRecord(record);
					return;
				}
				await this.runConnectorOperation(resource.sourceId, operationToken => this.copilotConnectorsService.connect(connector.name, operationToken), token);
				const account = this.copilotConnectorsService.account;
				if (!account) {
					throw new Error(localize('customizationMarketplace.connectorAccountUnavailable', "The GitHub account used to connect this resource is no longer available."));
				}
				await this.addRecord(await this.createConnectorRecord(resource, account));
			},
			token,
		);
		this.pending.set(key, { promise: operation, cancel: () => operationDisposables.dispose() });
		this.emitChange();
		let didComplete = false;
		try {
			await operation;
			didComplete = true;
		} catch (error) {
			if (token.isCancellationRequested || this.lifetimeToken.isCancellationRequested || !this.isSourceEnabled(resource.sourceId)) {
				throw new CancellationError();
			}
			throw error;
		} finally {
			operationDisposables.dispose();
			this.pending.delete(key);
			if (!didComplete) {
				this.emitChange();
			}
		}
	}

	async repair(resource: ICustomizationMarketplaceResource): Promise<void> {
		const providerBinding = this.getInstallProviderBinding(resource);
		const providerInstallation = providerBinding
			? this.providerInstallations.find(installation => this.matchesProviderInstallation(installation.resource, resource))
			: undefined;
		if (providerBinding && providerInstallation) {
			if (providerInstallation.state.kind !== 'missing' && providerInstallation.state.kind !== 'error') {
				return;
			}
			const key = providerInstallation.installationId ?? getCustomizationMarketplaceResourceKey(providerInstallation.resource);
			const pending = this.pendingRepairs.get(key);
			if (pending) {
				return pending.promise;
			}
			const operationDisposables = new DisposableStore();
			const token = cancelOnDispose(operationDisposables);
			const operation = (async () => {
				await providerBinding.provider.repair(providerBinding.session, providerInstallation, token);
				if (providerBinding === this.providerBinding) {
					await this.refreshProviderInstallations(providerBinding);
				}
			})();
			this.pendingRepairs.set(key, { promise: operation, cancel: () => operationDisposables.dispose() });
			this.emitChange();
			try {
				await operation;
			} finally {
				operationDisposables.dispose();
				this.pendingRepairs.delete(key);
				this.emitChange();
			}
			return;
		}
		if (providerBinding) {
			return;
		}
		const record = this.findRecord(resource);
		if (!record || this.recordStates.get(record.id)?.kind !== 'missing') {
			return;
		}
		const unavailableMessage = this.getRepairUnavailableMessage(record);
		if (unavailableMessage) {
			throw new Error(unavailableMessage);
		}
		const pending = this.pendingRepairs.get(record.id);
		if (pending) {
			return pending.promise;
		}
		const operationDisposables = new DisposableStore();
		const token = cancelOnDispose(operationDisposables);
		operationDisposables.add(this.lifetimeToken.onCancellationRequested(() => operationDisposables.dispose()));
		operationDisposables.add(this.configurationService.onDidChangeConfiguration(() => {
			if (!this.isSourceEnabled(this.getRecordSourceId(record))) {
				operationDisposables.dispose();
			}
		}));
		const operation = (async () => {
			const repaired = await this.doRepair(resource, record, token);
			this.recordStore.upsert(repaired);
			this.recordStates.set(record.id, { kind: 'checking' });
			await this.reconcileRecords([repaired]);
			if (this.recordStates.get(record.id)?.kind !== 'installed') {
				throw new Error(record.target.kind === 'copilotConnector'
					? localize('customizationMarketplace.connectorRepairIncomplete', "The connector could not be reconnected. Refresh its status and try again.")
					: localize('customizationMarketplace.repairIncomplete', "The customization could not be fully repaired. Review the installation and try again."));
			}
		})();
		this.pendingRepairs.set(record.id, { promise: operation, cancel: () => operationDisposables.dispose() });
		this.emitChange();
		try {
			await operation;
		} catch (error) {
			if (token.isCancellationRequested || this.lifetimeToken.isCancellationRequested || !this.isSourceEnabled(this.getRecordSourceId(record))) {
				throw new CancellationError();
			}
			throw error;
		} finally {
			operationDisposables.dispose();
			this.pendingRepairs.delete(record.id);
			this.emitChange();
		}
	}

	cancelConnectorOperation(resource: ICustomizationMarketplaceResource): void {
		if (resource.installation?.kind !== 'copilotConnector') {
			return;
		}
		this.pending.get(getConnectorOperationKey(resource))?.cancel();
		const record = this.findRecord(resource);
		if (record) {
			this.pendingRepairs.get(record.id)?.cancel();
		}
	}

	async uninstall(resource: ICustomizationMarketplaceResource): Promise<void> {
		const providerBinding = this.getInstallProviderBinding(resource);
		const providerInstallation = providerBinding
			? this.providerInstallations.find(installation => this.matchesProviderInstallation(installation.resource, resource))
			: undefined;
		if (providerBinding && providerInstallation) {
			const key = providerInstallation.installationId ?? getCustomizationMarketplaceResourceKey(providerInstallation.resource);
			const pending = this.pendingUninstalls.get(key);
			if (pending) {
				return pending;
			}
			const operationDisposables = new DisposableStore();
			const token = cancelOnDispose(operationDisposables);
			const operation = (async () => {
				await providerBinding.provider.uninstall(providerBinding.session, providerInstallation, token);
				if (providerBinding === this.providerBinding) {
					await this.refreshProviderInstallations(providerBinding);
				}
			})();
			this.pendingUninstalls.set(key, operation);
			this.emitChange();
			try {
				await operation;
			} finally {
				operationDisposables.dispose();
				this.pendingUninstalls.delete(key);
				this.emitChange();
			}
			return;
		}
		if (providerBinding) {
			return;
		}
		const connector = resource.installation?.kind === 'copilotConnector' ? resource.installation : undefined;
		if (connector) {
			const record = this.findRecord(resource);
			const key = getConnectorOperationKey(resource);
			const pending = this.pendingUninstalls.get(key);
			if (pending) {
				return pending;
			}
			const state = this.getInstallState(resource);
			if (state.kind === 'unavailable') {
				throw new Error(state.message);
			}
			if (state.kind !== 'installed' && state.kind !== 'missing' && state.kind !== 'error') {
				return;
			}
			if (record && this.copilotConnectorsService.connectionStateKnown &&
				!this.copilotConnectorsService.connectors.some(candidate => candidate.name === connector.name)) {
				this.removeRecord(record);
				this.emitChange();
				return;
			}
			const operation = (async () => {
				try {
					await this.runConnectorOperation(resource.sourceId, token => this.copilotConnectorsService.disconnect(connector.name, token), this.lifetimeToken);
					if (record && this.recordStore.associations.has(record.id)) {
						this.removeRecord(record);
						this.emitChange();
					}
				} catch (error) {
					if (!record || !(error instanceof CopilotConnectorsError) || error.statusCode !== 404) {
						throw error;
					}
					this.removeRecord(record);
					this.emitChange();
				}
			})();
			this.pendingUninstalls.set(key, operation);
			this.emitChange();
			try {
				await operation;
			} finally {
				this.pendingUninstalls.delete(key);
				this.emitChange();
			}
			return;
		}
		const record = this.findRecord(resource);
		if (!record) {
			return;
		}
		const state = this.recordStates.get(record.id) ?? { kind: 'checking' as const };
		const pending = this.pendingUninstalls.get(record.id);
		if (pending) {
			return pending;
		}
		if (state.kind !== 'checking' && state.kind !== 'installed' && state.kind !== 'missing' && state.kind !== 'error') {
			return;
		}
		const operation = (async () => {
			await this.doUninstall(record);
			this.removeRecord(record);
		})();
		this.pendingUninstalls.set(record.id, operation);
		this.emitChange();
		try {
			await operation;
		} finally {
			this.pendingUninstalls.delete(record.id);
			this.emitChange();
		}
	}

	private async doUninstall(record: ICustomizationMarketplaceInstallationRecord): Promise<void> {
		const source = record.installation;
		if (source.kind === 'mcpGallery') {
			const targetId = record.target.kind === 'mcp' ? record.target.id : undefined;
			const server = this.mcpWorkbenchService.local.find(candidate => candidate.id === targetId)
				?? this.getInstalledGalleryMcpServer(source);
			if (server) {
				await this.mcpWorkbenchService.uninstall(server);
			}
			return;
		}
		if (source.kind === 'configuredPlugin') {
			const targetUri = record.target.kind === 'plugin' ? record.target.uri : undefined;
			const installed = (targetUri
				? this.pluginMarketplaceService.installedPlugins.get().find(candidate => isEqual(candidate.pluginUri, targetUri))
				: undefined) ?? this.getInstalledPlugin(record);
			if (!installed) {
				return;
			}
			const plugin = this.agentPluginService.plugins.get().find(candidate => isEqual(candidate.uri, installed.pluginUri));
			if (plugin?.remove) {
				if (!await plugin.remove()) {
					throw new CancellationError();
				}
				return;
			}
			this.agentPluginService.enablementModel.remove(installed.pluginUri.toString());
			await this.pluginInstallService.uninstallPlugin(installed.pluginUri);
			return;
		}
	}

	private async runConnectorOperation(sourceId: string, operation: (token: CancellationToken) => Promise<void>, token: CancellationToken): Promise<void> {
		this.checkEnabled(sourceId, token);
		const operationDisposables = new DisposableStore();
		const cancellation = operationDisposables.add(new CancellationTokenSource(token));
		operationDisposables.add(this.entitlementService.onDidChangeSentiment(() => {
			if (this.entitlementService.sentiment.hidden) {
				cancellation.cancel();
			}
		}));
		operationDisposables.add(this.configurationService.onDidChangeConfiguration(() => {
			if (!this.isSourceEnabled(sourceId)) {
				cancellation.cancel();
			}
		}));
		try {
			await operation(cancellation.token);
			this.checkEnabled(sourceId, cancellation.token);
		} finally {
			operationDisposables.dispose();
		}
	}

	private async doInstall(resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<ICustomizationMarketplaceInstallationRecord> {
		this.checkEnabled(resource.sourceId, token);
		const source = resource.installation;
		if (!source) {
			throw new Error(localize('customizationMarketplace.sourceUnavailable', "This resource does not provide a supported installation source."));
		}
		if (source.kind === 'copilotConnector') {
			throw new Error(localize('customizationMarketplace.connectorInstallTargetUnavailable', "Copilot connectors do not have a local installation target."));
		}
		if (source.kind === 'providerCatalog') {
			throw new Error(localize('customizationMarketplace.providerCatalogUnavailable', "The active agent cannot install this catalog resource."));
		}
		const target = await this.installTarget({ ...resource, installation: source }, token);
		return {
			id: await createInstallationRecordId([getCustomizationMarketplaceResourceKey(resource)]),
			sourceId: resource.sourceId,
			identifier: resource.identifier,
			version: resource.version,
			displayName: resource.displayName,
			description: resource.description,
			mediaType: resource.mediaType,
			icon: resource.icon,
			installation: source,
			target,
		};
	}

	private async doRepair(resource: ICustomizationMarketplaceResource, record: ICustomizationMarketplaceInstallationRecord, token: CancellationToken): Promise<ICustomizationMarketplaceInstallationRecord> {
		const sourceId = this.getRecordSourceId(record);
		this.checkEnabled(sourceId, token);
		if (record.target.kind === 'copilotConnector' && record.installation.kind === 'copilotConnector') {
			const target = record.target;
			await this.runConnectorOperation(sourceId, operationToken => this.copilotConnectorsService.connect(target.name, operationToken), token);
			return record;
		}
		const target = await this.installTarget({
			...resource,
			sourceId,
			identifier: record.identifier,
			version: record.version,
			installation: record.installation,
		}, token);
		return { ...record, target };
	}

	private async resolveConfiguredPlugin(resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<IMarketplacePlugin> {
		const source = resource.installation;
		if (source?.kind !== 'configuredPlugin') {
			throw new Error(localize('customizationMarketplace.pluginIdentityUnavailable', "This plugin does not provide configured marketplace identity."));
		}
		const discoveredReference = source.marketplaceSource ? parseMarketplaceReference(source.marketplaceSource) : undefined;
		if (source.marketplaceId && (!discoveredReference || discoveredReference.canonicalId !== source.marketplaceId)) {
			throw new Error(localize('customizationMarketplace.pluginIdentityChanged', "This plugin's marketplace identity changed after discovery. Refresh Discover and try again."));
		}
		const currentReference = source.marketplaceId
			? this.pluginMarketplaceService.getMarketplaceReferences().find(reference => reference.canonicalId === source.marketplaceId)
			: undefined;
		if (source.marketplaceId && !currentReference) {
			if (discoveredReference && this.pluginMarketplaceService.isStrictMarketplacePolicyActive() &&
				!await this.pluginInstallService.ensureMarketplaceTrusted(discoveredReference, token)) {
				throw new CancellationError();
			}
			throw new Error(localize('customizationMarketplace.pluginUnavailable', "This plugin is no longer available from a configured marketplace. Refresh Discover and try again."));
		}
		const marketplaceIds = source.marketplaceId ? new Set([source.marketplaceId]) : undefined;
		const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(token, marketplaceIds);
		this.checkEnabled(resource.sourceId, token);
		const plugin = plugins.find(plugin =>
			getPluginMarketplaceIdentifier(plugin) === resource.identifier);
		if (!plugin || source.name && plugin.name !== source.name || source.marketplace && plugin.marketplaceName !== source.marketplace) {
			throw new Error(localize('customizationMarketplace.pluginUnavailable', "This plugin is no longer available from a configured marketplace. Refresh Discover and try again."));
		}
		return plugin;
	}

	private resolveProviderPluginMarketplaceReference(resource: ICustomizationMarketplaceResource): IMarketplaceReference {
		const source = resource.installation;
		if (source?.kind !== 'providerPlugin' || !source.marketplaceSource) {
			throw new Error(localize('customizationMarketplace.providerPluginIdentityUnavailable', "This plugin does not provide provider marketplace identity."));
		}
		const directReference = parseMarketplaceReference(source.marketplaceSource);
		const githubSource = /^GitHub:\s+(?<source>.+)$/.exec(source.marketplaceSource)?.groups?.source;
		const marketplaceReference = directReference ?? (githubSource ? parseMarketplaceReference(githubSource) : undefined);
		if (!marketplaceReference) {
			throw new Error(localize('customizationMarketplace.providerPluginUnavailable', "This featured plugin is no longer available from a registered marketplace. Refresh Discover and try again."));
		}
		return marketplaceReference;
	}

	private async installTarget(resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<CustomizationMarketplaceInstallationRecordTarget> {
		const source = resource.installation;
		if (!source) {
			throw new Error(localize('customizationMarketplace.sourceUnavailable', "This resource does not provide a supported installation source."));
		}
		if (source.kind === 'configuredPlugin') {
			const plugin = await this.resolveConfiguredPlugin(resource, token);
			await this.pluginInstallService.installPlugin(plugin, token);
			this.checkEnabled(resource.sourceId, token);
			const uri = this.pluginInstallService.getPluginInstallUri(plugin);
			if (!this.pluginMarketplaceService.installedPlugins.get().some(candidate => isEqual(candidate.pluginUri, uri))) {
				throw new Error(localize('customizationMarketplace.pluginInstallIncomplete', "The plugin could not be installed. Review the installation error and try again."));
			}
			return { kind: 'plugin', uri };
		}
		if (source.kind === 'mcpGallery') {
			const manifest = await this.getMcpGalleryManifest(source);
			this.checkEnabled(resource.sourceId, token);
			const server = await this.mcpWorkbenchService.getMcpServerFromGallery(source.name, manifest);
			this.checkEnabled(resource.sourceId, token);
			if (!server || server.gallery?.name !== source.name ||
				normalizeMcpGalleryUrl(server.gallery.galleryUrl) !== normalizeMcpGalleryUrl(source.registryUrl)) {
				throw new Error(localize('customizationMarketplace.mcpGalleryUnavailable', "The MCP server '{0}' is not available in the configured registry.", source.name));
			}
			const canInstall = this.mcpWorkbenchService.canInstall(server);
			if (canInstall !== true) {
				throw new Error(canInstall.value);
			}
			const installed = await this.mcpWorkbenchService.install(server);
			if (installed.installState !== McpServerInstallState.Installed) {
				throw new Error(localize('customizationMarketplace.mcpInstallIncomplete', "The MCP server could not be installed. Review the installation error and try again."));
			}
			return { kind: 'mcp', id: installed.id };
		}
		if (source.kind === 'copilotConnector') {
			throw new Error(localize('customizationMarketplace.connectorInstallTargetUnavailable', "Copilot connectors do not have a local installation target."));
		}
		throw new Error(localize('customizationMarketplace.providerCatalogUnavailable', "The active agent cannot install this catalog resource."));
	}

	private async getMcpGalleryManifest(source: McpGalleryInstallation): Promise<IMcpGalleryManifest> {
		const manifest = source.registry === 'default'
			? await this.mcpGalleryManifestService.getDefaultMcpGalleryManifest() ?? await this.mcpGalleryManifestService.getMcpGalleryManifest()
			: await this.mcpGalleryManifestService.getMcpGalleryManifest();
		const sourceRegistryUrl = normalizeMcpGalleryUrl(source.registryUrl);
		const configuredRegistryUrl = source.registry === 'custom'
			? normalizeMcpGalleryUrl(this.configurationService.getValue<string>(mcpGalleryServiceUrlConfig))
			: sourceRegistryUrl;
		if (!manifest || !sourceRegistryUrl || normalizeMcpGalleryUrl(manifest.url) !== sourceRegistryUrl || configuredRegistryUrl !== sourceRegistryUrl) {
			throw new Error(localize('customizationMarketplace.mcpGalleryChanged', "The MCP registry changed after '{0}' was discovered. Refresh Discover and try again.", source.name));
		}
		return manifest;
	}

	private async getExistingInstalledPlugin(record: ICustomizationMarketplaceInstallationRecord) {
		const target = record.target;
		const recorded = target.kind === 'plugin'
			? this.pluginMarketplaceService.installedPlugins.get().find(candidate => isEqual(candidate.pluginUri, target.uri))
			: undefined;
		const candidates = recorded
			? [recorded, ...this.getInstalledPlugins(record).filter(candidate => !isEqual(candidate.pluginUri, recorded.pluginUri))]
			: this.getInstalledPlugins(record);
		for (const candidate of candidates) {
			try {
				if ((await this.fileService.resolve(candidate.pluginUri)).isDirectory) {
					return candidate;
				}
			} catch (error) {
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					throw error;
				}
			}
		}
		return undefined;
	}

	private getInstalledPlugin(record: ICustomizationMarketplaceInstallationRecord) {
		return this.getInstalledPlugins(record)[0];
	}

	private getInstalledPlugins(record: ICustomizationMarketplaceInstallationRecord) {
		const source = record.installation;
		return source.kind === 'configuredPlugin'
			? this.pluginMarketplaceService.installedPlugins.get().filter(({ plugin }) => getPluginMarketplaceIdentifier(plugin) === record.identifier)
			: [];
	}

	private checkEnabled(sourceId: string, token: CancellationToken): void {
		if (token.isCancellationRequested || this.lifetimeToken.isCancellationRequested || !this.isSourceEnabled(sourceId) || this.entitlementService.sentiment.hidden) {
			throw new CancellationError();
		}
	}
}

function isConnectorAccountEqual(
	target: Extract<CustomizationMarketplaceInstallationRecordTarget, { kind: 'copilotConnector' }>,
	account: ICopilotConnectorAccount,
): boolean {
	return target.providerId === account.providerId
		&& target.accountName === account.accountName
		&& target.enterprise === account.enterprise;
}

function getConnectorOperationKey(resource: ICustomizationMarketplaceResource): string {
	const connectorName = resource.installation?.kind === 'copilotConnector' ? resource.installation.name : resource.identifier;
	return JSON.stringify([resource.sourceId, 'copilotConnector', connectorName]);
}

async function createInstallationRecordId(slot: readonly (string | null)[]): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(slot)));
	return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
