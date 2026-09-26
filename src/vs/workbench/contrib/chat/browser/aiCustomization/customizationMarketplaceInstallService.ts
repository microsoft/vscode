/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../../base/common/async.js';
import { cancelOnDispose, CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { agentFinderMcpRegistryManifest } from '../../../../../platform/agentFinder/common/agentFinderMcpRegistry.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CopilotConnectorsError } from '../../../../../platform/copilotConnectors/common/copilotConnectorsRequestService.js';
import { CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { normalizeMcpGalleryUrl } from '../../../../../platform/customizationMarketplace/common/mcpGalleryMarketplaceProvider.js';
import { affectsCustomizationMarketplaceSources, CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, getVisibleCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { mcpGalleryServiceUrlConfig } from '../../../../../platform/mcp/common/mcpManagement.js';
import { UnsupportedMcpGalleryPackageError } from '../../../../../platform/mcp/common/mcpGalleryService.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService } from '../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';
import { CustomizationMarketplaceInstallationTarget, CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginGitService } from '../../common/plugins/pluginGitService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';
import { SKILL_FILENAME } from '../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { DELETE_AI_CUSTOMIZATION_ID } from './aiCustomizationManagement.js';
import { getConnectorRowPresentation } from './connectorPresentation.js';
import { ICopilotConnectorAccount, ICopilotConnectorsService, toCopilotConnectorMarketplaceEntry } from './copilotConnectorsService.js';
import { CustomizationLocationPicker } from './customizationCreatorService.js';
import { getPluginMarketplaceIdentifier, isPluginMarketplaceReferenceAvailableInDiscover } from './pluginCustomizationMarketplaceProvider.js';
import { CustomizationMarketplaceInstallationRecordStore, CustomizationMarketplaceInstallationRecordTarget, getInstallationRecordResourceKey, ICustomizationMarketplaceInstallationRecord, toRecordedMarketplaceResource } from './customizationMarketplaceInstallationRecordStore.js';
import { CustomizationMarketplaceSkillInstaller } from './customizationMarketplaceSkillInstaller.js';

type McpGalleryInstallation = Extract<CustomizationMarketplaceInstallation, { readonly kind: 'mcpGallery' }>;

type InstallationRecordState =
	| { readonly kind: 'checking' | 'installed' | 'missing' }
	| { readonly kind: 'error'; readonly message: string };

interface IPendingOperation {
	readonly promise: Promise<void>;
	cancel(): void;
}

export class CustomizationMarketplaceInstallService extends Disposable implements ICustomizationMarketplaceInstallService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly pending = new Map<string, IPendingOperation>();
	private readonly pendingRepairs = new Map<string, IPendingOperation>();
	private readonly pendingUninstalls = new Map<string, Promise<void>>();
	private readonly manualMcpSetups = new Map<string, { readonly sourceId: string; readonly url?: URI }>();
	private readonly recordStates = new Map<string, InstallationRecordState>();
	private readonly skillVerificationLimiter = this._register(new Limiter<boolean>(16));
	private readonly reconciliationVersions = new Map<string, number>();
	private readonly recordStore: CustomizationMarketplaceInstallationRecordStore;
	private readonly lifetimeToken = cancelOnDispose(this._store);
	private readonly enabledDisposables = this._register(new DisposableStore());
	private readonly connectorListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly sourceFolderRequest = this._register(new MutableDisposable<DisposableStore>());
	private readonly locationPicker: CustomizationLocationPicker;
	private readonly skillInstaller: CustomizationMarketplaceSkillInstaller;
	private observingInstallations = false;
	private activeSkillSourceFolders: readonly ICustomizationSourceFolder[] | undefined;
	private sourceFolderSequence = 0;

	constructor(
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IAgentPluginRepositoryService private readonly repositoryService: IAgentPluginRepositoryService,
		@IPluginGitService private readonly pluginGitService: IPluginGitService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ICustomizationMarketplaceService private readonly customizationMarketplaceService: ICustomizationMarketplaceService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.locationPicker = instantiationService.createInstance(CustomizationLocationPicker);
		this.skillInstaller = instantiationService.createInstance(CustomizationMarketplaceSkillInstaller, (sourceId, token) => this.checkEnabled(sourceId, token), this.locationPicker);
		this.recordStore = this._register(new CustomizationMarketplaceInstallationRecordStore(storageService, logService));
		for (const record of this.recordStore.records.values()) {
			this.recordStates.set(record.id, { kind: 'checking' });
		}
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (affectsCustomizationMarketplaceSources(event, this.customizationMarketplaceService.allSources ?? this.customizationMarketplaceService.sources)) {
				this.updateEnablement();
			} else if (this.isEnabled() && (event.affectsConfiguration(ChatConfiguration.PluginsEnabled) ||
				event.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled))) {
				this._onDidChange.fire();
			}
		}));
		if (this.customizationMarketplaceService.onDidChangeSources) {
			this._register(this.customizationMarketplaceService.onDidChangeSources(() => this.updateEnablement()));
		}
		this._register(this.recordStore.onDidChange(() => {
			this.synchronizeRecordStates(true);
			this._onDidChange.fire();
			if (this.isEnabled()) {
				void this.reconcileRecords([...this.getRecordsByKind('plugin'), ...this.getRecordsByKind('mcp'), ...this.getApplicableConnectorRecords()]);
				void this.refreshActiveSkillSourceFolders();
			}
		}));
		this.updateEnablement();
	}

	private isEnabled(): boolean {
		return getVisibleCustomizationMarketplaceSources(this.configurationService, this.customizationMarketplaceService.sources).length > 0;
	}

	private isSourceEnabled(sourceId: string): boolean {
		const source = this.customizationMarketplaceService.sources.find(source => source.id === sourceId);
		return !!source && getVisibleCustomizationMarketplaceSources(this.configurationService, this.customizationMarketplaceService.sources).includes(source);
	}

	private getInstalledMcpServer(name: string, version: string): IWorkbenchMcpServer | undefined {
		return this.mcpWorkbenchService.local.find(server => server.name === name &&
			server.local?.name === name &&
			server.local?.galleryUrl === agentFinderMcpRegistryManifest.url &&
			server.local.version === version &&
			(!server.gallery || server.gallery.name === name) &&
			server.installState === McpServerInstallState.Installed);
	}

	private getInstalledGalleryMcpServer(source: McpGalleryInstallation): IWorkbenchMcpServer | undefined {
		const registryUrl = normalizeMcpGalleryUrl(source.registryUrl);
		return registryUrl ? this.mcpWorkbenchService.local.find(server => server.name === source.name &&
			server.local?.name === source.name &&
			normalizeMcpGalleryUrl(server.local.galleryUrl) === registryUrl &&
			registryUrl !== normalizeMcpGalleryUrl(agentFinderMcpRegistryManifest.url) &&
			server.gallery?.name === source.name &&
			normalizeMcpGalleryUrl(server.gallery.galleryUrl) === registryUrl &&
			server.installState === McpServerInstallState.Installed) : undefined;
	}

	private isMcpGallerySourceCurrent(source: McpGalleryInstallation): boolean {
		return source.registry === 'default'
			? this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled) !== true
			: normalizeMcpGalleryUrl(this.configurationService.getValue<string>(mcpGalleryServiceUrlConfig)) === normalizeMcpGalleryUrl(source.registryUrl);
	}

	private updateEnablement(): void {
		if (this.isSourceEnabled(CustomizationMarketplaceSources.CopilotConnectors.id)) {
			if (!this.connectorListeners.value) {
				const listeners = new DisposableStore();
				this.connectorListeners.value = listeners;
				listeners.add(this.copilotConnectorsService.onDidChange(() => {
					this._onDidChange.fire();
					void this.synchronizeConnectedConnectorRecords();
				}));
				listeners.add(this.copilotConnectorsService.onDidChangeAccount(() => {
					this.synchronizeRecordStates();
					this._onDidChange.fire();
					void this.reconcileRecords(this.getApplicableConnectorRecords());
				}));
				listeners.add(this.copilotConnectorsService.onDidDisconnect(name => {
					const account = this.copilotConnectorsService.account;
					const record = account ? this.findConnectorRecord(name, account) : undefined;
					if (record) {
						this.removeRecord(record);
						this._onDidChange.fire();
					}
				}));
			}
		} else {
			this.connectorListeners.clear();
		}
		for (const [key, setup] of this.manualMcpSetups) {
			if (!this.isSourceEnabled(setup.sourceId)) {
				this.manualMcpSetups.delete(key);
			}
		}
		const enabled = this.isEnabled();
		if (enabled === this.observingInstallations) {
			this._onDidChange.fire();
			void this.synchronizeConnectedConnectorRecords();
			return;
		}
		this.observingInstallations = enabled;
		this.enabledDisposables.clear();
		if (!enabled) {
			this.sourceFolderSequence++;
			this.sourceFolderRequest.clear();
			this.activeSkillSourceFolders = undefined;
			this._onDidChange.fire();
			return;
		}
		this.enabledDisposables.add(autorun(reader => {
			this.pluginMarketplaceService.installedPlugins.read(reader);
			this._onDidChange.fire();
			void this.reconcileRecords(this.getRecordsByKind('plugin'));
		}));
		this.enabledDisposables.add(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.harnessService.activeSessionResource.read(reader);
			this.workspaceService.activeProjectRoot.read(reader);
			this.activeSkillSourceFolders = undefined;
			this._onDidChange.fire();
			void this.refreshActiveSkillSourceFolders();
		}));
		this.enabledDisposables.add(this.mcpWorkbenchService.onChange(() => {
			this._onDidChange.fire();
			void this.reconcileRecords(this.getRecordsByKind('mcp'));
		}));
		this.enabledDisposables.add(this.mcpWorkbenchService.onReset(() => {
			this._onDidChange.fire();
			void this.reconcileRecords(this.getRecordsByKind('mcp'));
		}));
		this.enabledDisposables.add(this.entitlementService.onDidChangeSentiment(() => this._onDidChange.fire()));
		this.enabledDisposables.add(this.fileService.onDidFilesChange(event => {
			const affected = this.getApplicableSkillRecords().filter(record => record.target.kind === 'skill' && (event.affects(record.target.uri) || event.affects(dirname(record.target.uri))));
			if (affected.length) {
				void this.reconcileRecords(affected);
			}
		}));
		void this.reconcileRecords(this.getRecordsByKind('mcp'));
		void this.synchronizeConnectedConnectorRecords();
	}

	private async refreshActiveSkillSourceFolders(): Promise<void> {
		const sequence = ++this.sourceFolderSequence;
		if (this.entitlementService.sentiment.hidden || this.getRecordsByKind('skill').length === 0) {
			this.activeSkillSourceFolders = undefined;
			return;
		}
		const session = this.harnessService.activeSessionResource.get();
		const request = new DisposableStore();
		const token = cancelOnDispose(request);
		this.sourceFolderRequest.value = request;
		try {
			const folders = await this.locationPicker.resolveTargetFolders(session, PromptsType.skill, undefined, token);
			if (sequence !== this.sourceFolderSequence || !isEqual(session, this.harnessService.activeSessionResource.get()) || this._store.isDisposed) {
				return;
			}
			this.activeSkillSourceFolders = folders;
			this.rebaseSkillRecordTargets(folders ?? []);
			this._onDidChange.fire();
			await this.reconcileRecords(this.getApplicableSkillRecords());
		} catch (error) {
			if (sequence === this.sourceFolderSequence && !this._store.isDisposed) {
				this.logService.error('[CustomizationMarketplace] Unable to resolve active skill destinations', error);
			}
		}
	}

	private rebaseSkillRecordTargets(folders: readonly ICustomizationSourceFolder[]): void {
		for (const record of this.getRecordsByKind('skill')) {
			if (record.target.kind !== 'skill' || !record.target.destinationGroupId || !this.isRecordApplicable(record)) {
				continue;
			}
			const target = record.target;
			const folder = folders.find(candidate => candidate.source === target.source && candidate.destinationGroupId === target.destinationGroupId);
			if (!folder || isEqual(folder.uri, target.sourceFolder)) {
				continue;
			}
			const skillName = basename(dirname(target.uri));
			const updated: ICustomizationMarketplaceInstallationRecord = {
				...record,
				target: {
					...target,
					uri: joinPath(folder.uri, skillName, SKILL_FILENAME),
					sourceFolder: folder.uri,
				},
			};
			this.recordStore.upsert(updated);
			this.recordStates.set(updated.id, { kind: 'checking' });
		}
	}

	private synchronizeRecordStates(reset = false): void {
		for (const id of [...this.recordStates.keys()]) {
			if (!this.recordStore.records.has(id)) {
				this.recordStates.delete(id);
				this.reconciliationVersions.delete(id);
			}
		}
		for (const record of this.recordStore.records.values()) {
			if (reset || !this.recordStates.has(record.id)) {
				this.recordStates.set(record.id, { kind: 'checking' });
			}
		}
	}

	private getRecordsByKind(kind: CustomizationMarketplaceInstallationRecordTarget['kind']): ICustomizationMarketplaceInstallationRecord[] {
		return [...this.recordStore.records.values()].filter(record => record.target.kind === kind);
	}

	private getApplicableSkillRecords(): ICustomizationMarketplaceInstallationRecord[] {
		return this.getRecordsByKind('skill').filter(record => this.isRecordApplicable(record));
	}

	private getApplicableConnectorRecords(): ICustomizationMarketplaceInstallationRecord[] {
		return this.getRecordsByKind('copilotConnector').filter(record => this.isRecordApplicable(record));
	}

	private getRelevantRecords(): ICustomizationMarketplaceInstallationRecord[] {
		return [...this.getRecordsByKind('plugin'), ...this.getRecordsByKind('mcp'), ...this.getApplicableSkillRecords(), ...this.getApplicableConnectorRecords()];
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
				const didChange = !existing || existing.version !== record.version || existing.displayName !== record.displayName || existing.description !== record.description;
				if (didChange) {
					this.recordStore.upsert(record);
					this.recordStates.set(record.id, { kind: 'checking' });
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
		this.recordStates.set(record.id, { kind: 'checking' });
		await this.reconcileRecords([record]);
	}

	private removeRecord(record: ICustomizationMarketplaceInstallationRecord): void {
		this.recordStore.delete(record);
		this.recordStates.delete(record.id);
		this.reconciliationVersions.delete(record.id);
	}

	private findRecord(resource: ICustomizationMarketplaceResource): ICustomizationMarketplaceInstallationRecord | undefined {
		if (resource.installation?.kind === 'copilotConnector') {
			const account = this.copilotConnectorsService.account;
			return account ? this.findConnectorRecord(resource.installation.name, account) : undefined;
		}
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		return [...this.recordStore.records.values()].find(record => getInstallationRecordResourceKey(record) === resourceKey && this.isRecordApplicable(record));
	}

	private isRecordApplicable(record: ICustomizationMarketplaceInstallationRecord): boolean {
		if (record.target.kind === 'copilotConnector') {
			const account = this.copilotConnectorsService.account;
			return !!account && isConnectorAccountEqual(record.target, account);
		}
		if (record.target.kind !== 'skill') {
			return true;
		}
		const target = record.target;
		if (target.harness !== this.harnessService.activeHarness.get()) {
			return false;
		}
		if (target.source === 'local' && target.project) {
			return isEqual(target.project, this.workspaceService.getActiveProjectRoot());
		}
		if (this.activeSkillSourceFolders) {
			return this.activeSkillSourceFolders.some(folder => folder.source === target.source && (
				!!target.destinationGroupId && folder.destinationGroupId === target.destinationGroupId
				|| isEqual(folder.uri, target.sourceFolder)
			));
		}
		if (target.source === 'user') {
			return true;
		}
		return !!target.session && isEqual(target.session, this.harnessService.activeSessionResource.get());
	}

	private toInstallationTarget(record: ICustomizationMarketplaceInstallationRecord): CustomizationMarketplaceInstallationTarget {
		switch (record.target.kind) {
			case 'skill': return { kind: 'skill', uri: record.target.uri };
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
			} else if (record.target.kind === 'skill') {
				state = { kind: await this.isSkillInstallationComplete(record.target) ? 'installed' : 'missing' };
			} else if (record.target.kind === 'plugin') {
				const target = record.target;
				let installed = this.pluginMarketplaceService.installedPlugins.get().find(candidate => isEqual(candidate.pluginUri, target.uri));
				installed ??= this.getInstalledPlugin(record);
				state = { kind: installed ? 'installed' : 'missing' };
				if (installed && !isEqual(installed.pluginUri, target.uri)) {
					record = { ...record, target: { ...target, uri: installed.pluginUri } };
				}
			} else {
				const target = record.target;
				const installed = this.mcpWorkbenchService.local.find(server => server.id === target.id && server.installState === McpServerInstallState.Installed)
					?? (record.installation.kind === 'mcp'
						? this.getInstalledMcpServer(record.installation.name, record.installation.version)
						: record.installation.kind === 'mcpGallery'
							? this.getInstalledGalleryMcpServer(record.installation)
							: undefined);
				state = { kind: installed ? 'installed' : 'missing' };
				if (installed && installed.id !== target.id) {
					record = { ...record, target: { kind: 'mcp', id: installed.id } };
				}
			}
		} catch (error) {
			this.logService.error(`[CustomizationMarketplace] Unable to verify installation '${original.id}'`, error);
			state = { kind: 'error', message: localize('customizationMarketplace.installationVerificationFailed', "Could not verify this customization installation. {0}", getErrorMessage(error)) };
		}
		if (this.reconciliationVersions.get(original.id) !== version || this._store.isDisposed || this.recordStore.records.get(original.id) !== original) {
			return;
		}
		const didUpdateRecord = record !== original;
		if (didUpdateRecord) {
			this.recordStore.upsert(record);
		}
		const previous = this.recordStates.get(record.id);
		if (didUpdateRecord || !previous || previous.kind !== state.kind || previous.kind === 'error' && state.kind === 'error' && previous.message !== state.message) {
			this.recordStates.set(record.id, state);
			this._onDidChange.fire();
		}
	}

	private async isSkillInstallationComplete(target: Extract<CustomizationMarketplaceInstallationRecordTarget, { kind: 'skill' }>): Promise<boolean> {
		const root = dirname(target.uri);
		const results = await Promise.all(target.files.map(path => this.skillVerificationLimiter.queue(async () => {
			try {
				const stat = await this.fileService.resolve(joinPath(root, ...path.split('/')));
				return stat.isFile && !stat.isSymbolicLink;
			} catch (error) {
				if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
					return false;
				}
				throw error;
			}
		})));
		return results.every(Boolean);
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
		const sourceUnavailableMessage = this.getSourceUnavailableMessage(record.sourceId);
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

	getRecordedResources(): readonly ICustomizationMarketplaceResource[] {
		return this.getRelevantRecords().map(toRecordedMarketplaceResource);
	}

	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
		const record = this.findRecord(resource);
		if (record) {
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
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		const operationKey = resource.installation?.kind === 'copilotConnector' ? getConnectorOperationKey(resource) : resourceKey;
		if (this.pending.has(operationKey)) {
			return { kind: 'installing' };
		}
		const source = resource.installation;
		if (source?.kind === 'configuredPlugin') {
			if (isWeb) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.pluginWebUnsupported', "Installing configured marketplace plugins is not available in VS Code for the Web.") };
			}
			if (!this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.pluginsDisabled', "Enable agent plugins to install this resource.") };
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
		if (source.kind === 'plugin') {
			if (!this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.pluginsDisabled', "Enable agent plugins to install this resource.") };
			}
			return { kind: 'available' };
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
		if (source.kind === 'mcp') {
			const manualSetup = this.manualMcpSetups.get(resourceKey);
			if (manualSetup) {
				return {
					kind: 'unavailable',
					message: manualSetup.url
						? localize('customizationMarketplace.mcpManualSetup', "This MCP server requires manual setup. Review the publisher's instructions before adding it.")
						: localize('customizationMarketplace.mcpManualSetupUnavailable', "This MCP server requires manual setup, but no publisher instructions are available."),
					setupUrl: manualSetup.url,
				};
			}
			return { kind: 'available' };
		}
		if (source.kind === 'mcpGallery') {
			if (!this.isMcpGallerySourceCurrent(source)) {
				return { kind: 'unavailable', message: localize('customizationMarketplace.mcpGalleryChanged', "The MCP registry changed after '{0}' was discovered. Refresh Discover and try again.", source.name) };
			}
			return { kind: 'available' };
		}
		return { kind: 'available' };
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
		this.recordStore.ensureCanAdd();
		const operationDisposables = new DisposableStore();
		const token = cancelOnDispose(operationDisposables);
		const isConfiguredPlugin = resource.installation?.kind === 'configuredPlugin';
		operationDisposables.add(this.lifetimeToken.onCancellationRequested(() => operationDisposables.dispose()));
		if (isConfiguredPlugin) {
			operationDisposables.add(this.pluginMarketplaceService.onDidChangeMarketplaces(() => operationDisposables.dispose()));
		}
		operationDisposables.add(this.configurationService.onDidChangeConfiguration(event => {
			if (
				!this.isSourceEnabled(resource.sourceId) ||
				(isConfiguredPlugin && (
					event.affectsConfiguration(ChatConfiguration.StrictMarketplaces) ||
					event.affectsConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled)
				)) ||
				(resource.installation?.kind === 'mcpGallery' && resource.installation.registry === 'custom' &&
					event.affectsConfiguration(mcpGalleryServiceUrlConfig))
			) {
				operationDisposables.dispose();
			}
		}));
		const operation = connector
			? (async () => {
				await this.runConnectorOperation(resource.sourceId, operationToken => this.copilotConnectorsService.connect(connector.name, operationToken), token);
				const account = this.copilotConnectorsService.account;
				if (!account) {
					throw new Error(localize('customizationMarketplace.connectorAccountUnavailable', "The GitHub account used to connect this resource is no longer available."));
				}
				await this.addRecord(await this.createConnectorRecord(resource, account));
			})()
			: (async () => {
				const record = await this.doInstall(resource, token);
				await this.addRecord(record);
			})();
		this.pending.set(key, { promise: operation, cancel: () => operationDisposables.dispose() });
		this._onDidChange.fire();
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
				this._onDidChange.fire();
			}
		}
	}

	async repair(resource: ICustomizationMarketplaceResource): Promise<void> {
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
			if (!this.isSourceEnabled(record.sourceId)) {
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
		this._onDidChange.fire();
		try {
			await operation;
		} catch (error) {
			if (token.isCancellationRequested || this.lifetimeToken.isCancellationRequested || !this.isSourceEnabled(record.sourceId)) {
				throw new CancellationError();
			}
			throw error;
		} finally {
			operationDisposables.dispose();
			this.pendingRepairs.delete(record.id);
			this._onDidChange.fire();
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
				this._onDidChange.fire();
				return;
			}
			const operation = (async () => {
				try {
					await this.runConnectorOperation(resource.sourceId, token => this.copilotConnectorsService.disconnect(connector.name, token), this.lifetimeToken);
					if (record && this.recordStore.records.has(record.id)) {
						this.removeRecord(record);
						this._onDidChange.fire();
					}
				} catch (error) {
					if (!record || !(error instanceof CopilotConnectorsError) || error.statusCode !== 404) {
						throw error;
					}
					this.removeRecord(record);
					this._onDidChange.fire();
				}
			})();
			this.pendingUninstalls.set(key, operation);
			this._onDidChange.fire();
			try {
				await operation;
			} finally {
				this.pendingUninstalls.delete(key);
				this._onDidChange.fire();
			}
			return;
		}
		const record = this.findRecord(resource);
		if (!record) {
			return;
		}
		const state = this.recordStates.get(record.id);
		const pending = this.pendingUninstalls.get(record.id);
		if (pending) {
			return pending;
		}
		if (state?.kind !== 'installed' && state?.kind !== 'missing' && state?.kind !== 'error') {
			return;
		}
		const operation = (async () => {
			await this.doUninstall(record);
			this.removeRecord(record);
		})();
		this.pendingUninstalls.set(record.id, operation);
		this._onDidChange.fire();
		try {
			await operation;
		} finally {
			this.pendingUninstalls.delete(record.id);
			this._onDidChange.fire();
		}
	}

	private async doUninstall(record: ICustomizationMarketplaceInstallationRecord): Promise<void> {
		const source = record.installation;
		if (source.kind === 'mcp' || source.kind === 'mcpGallery') {
			const targetId = record.target.kind === 'mcp' ? record.target.id : undefined;
			const server = this.mcpWorkbenchService.local.find(candidate => candidate.id === targetId)
				?? (source.kind === 'mcp'
					? this.getInstalledMcpServer(source.name, source.version)
					: this.getInstalledGalleryMcpServer(source));
			if (server) {
				await this.mcpWorkbenchService.uninstall(server);
			}
			return;
		}
		if (source.kind === 'plugin' || source.kind === 'configuredPlugin') {
			const targetUri = record.target.kind === 'plugin' ? record.target.uri : undefined;
			const installed = (targetUri
				? this.pluginMarketplaceService.installedPlugins.get().find(candidate => isEqual(candidate.pluginUri, targetUri))
				: undefined) ?? this.getInstalledPlugin(record);
			if (!installed) {
				return;
			}
			const plugin = this.agentPluginService.plugins.get().find(candidate => isEqual(candidate.uri, installed.pluginUri));
			if (!plugin?.remove) {
				throw new Error(localize('customizationMarketplace.pluginUninstallUnavailable', "This plugin cannot be uninstalled from the customization marketplace."));
			}
			if (!await plugin.remove()) {
				throw new CancellationError();
			}
			return;
		}
		if (record.target.kind !== 'skill') {
			return;
		}
		const target = dirname(record.target.uri);
		try {
			await this.fileService.resolve(target);
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return;
			}
			throw error;
		}
		await this.commandService.executeCommand(DELETE_AI_CUSTOMIZATION_ID, {
			uri: record.target.uri,
			name: record.displayName,
			promptType: PromptsType.skill,
			storage: record.target.source === 'local' ? PromptsStorage.local : PromptsStorage.user,
		});
		if (await this.fileService.exists(target)) {
			throw new CancellationError();
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
		const target = await this.installTarget({ ...resource, installation: source }, token);
		const slot = target.kind === 'skill'
			? [getCustomizationMarketplaceResourceKey(resource), target.harness, target.source, target.destinationGroupId ?? target.sourceFolder.toString(), target.project?.toString() ?? target.session?.toString() ?? null]
			: [getCustomizationMarketplaceResourceKey(resource)];
		return {
			id: await createInstallationRecordId(slot),
			sourceId: resource.sourceId,
			identifier: resource.identifier,
			version: resource.version,
			displayName: resource.displayName,
			description: resource.description,
			mediaType: resource.mediaType,
			installation: source,
			target,
		};
	}

	private async doRepair(resource: ICustomizationMarketplaceResource, record: ICustomizationMarketplaceInstallationRecord, token: CancellationToken): Promise<ICustomizationMarketplaceInstallationRecord> {
		this.checkEnabled(record.sourceId, token);
		if (record.target.kind === 'copilotConnector' && record.installation.kind === 'copilotConnector') {
			const target = record.target;
			await this.runConnectorOperation(record.sourceId, operationToken => this.copilotConnectorsService.connect(target.name, operationToken), token);
			return record;
		}
		if (record.target.kind === 'skill') {
			await this.skillInstaller.repair(record, token, () => this.isRecordApplicable(record));
			return record;
		}
		const installation = record.target.kind === 'plugin' && record.installation.kind === 'plugin' && record.target.resolvedRevision
			? { ...record.installation, ref: record.target.resolvedRevision }
			: record.installation;
		const target = await this.installTarget({
			...resource,
			sourceId: record.sourceId,
			identifier: record.identifier,
			version: record.version,
			installation,
		}, token);
		return { ...record, target };
	}

	private async installTarget(resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<CustomizationMarketplaceInstallationRecordTarget> {
		const source = resource.installation;
		if (!source) {
			throw new Error(localize('customizationMarketplace.sourceUnavailable', "This resource does not provide a supported installation source."));
		}
		if (source.kind === 'configuredPlugin') {
			const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(token);
			this.checkEnabled(resource.sourceId, token);
			const plugin = plugins.find(plugin =>
				isPluginMarketplaceReferenceAvailableInDiscover(this.configurationService, plugin.marketplaceReference) &&
				getPluginMarketplaceIdentifier(plugin) === resource.identifier);
			if (!plugin) {
				throw new Error(localize('customizationMarketplace.pluginUnavailable', "This plugin is no longer available from a configured marketplace. Refresh Discover and try again."));
			}
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
		if (source.kind === 'mcp') {
			let server: IWorkbenchMcpServer | undefined;
			try {
				server = await this.mcpWorkbenchService.getMcpServerFromAgentFinder(source.name, source.version, token);
			} catch (error) {
				this.checkEnabled(resource.sourceId, token);
				if (error instanceof UnsupportedMcpGalleryPackageError) {
					const setupUrl = error.repositoryUrl ?? resource.repository;
					this.manualMcpSetups.set(getCustomizationMarketplaceResourceKey(resource), { sourceId: resource.sourceId, url: setupUrl });
					this._onDidChange.fire();
					throw new Error(setupUrl
						? localize('customizationMarketplace.mcpManualSetupRequired', "This MCP server requires manual setup. Open the publisher's instructions to configure it.")
						: localize('customizationMarketplace.mcpManualSetupUnavailable', "This MCP server requires manual setup, but no publisher instructions are available."));
				}
				throw error;
			}
			this.checkEnabled(resource.sourceId, token);
			if (!server) {
				throw new Error(localize('customizationMarketplace.mcpUnavailable', "The MCP server '{0}' is no longer available from the GitHub Feed.", source.name));
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
		if (source.kind === 'plugin') {
			const result = await this.pluginInstallService.installPluginFromSource(`${source.repository}#${source.ref}`, { path: source.path });
			if (!result.success) {
				if (result.message) {
					throw new Error(result.message);
				}
				throw new CancellationError();
			}
			if (!result.matchedPlugin || resource.version !== undefined && result.matchedPlugin.version !== resource.version) {
				throw new Error(localize('customizationMarketplace.pluginInstallIncomplete', "The plugin could not be installed. Review the installation error and try again."));
			}
			const descriptor = result.matchedPlugin.sourceDescriptor;
			if (descriptor.kind !== PluginSourceKind.GitHub) {
				throw new Error(localize('customizationMarketplace.pluginInstallIncomplete', "The plugin could not be installed. Review the installation error and try again."));
			}
			const repository = this.repositoryService.getPluginSource(descriptor.kind).getCleanupTarget(this.repositoryService.agentPluginsHome, descriptor);
			if (!repository) {
				throw new Error(localize('customizationMarketplace.pluginInstallIncomplete', "The plugin could not be installed. Review the installation error and try again."));
			}
			const resolvedRevision = (await this.pluginGitService.revParse(repository, 'HEAD')).toLowerCase();
			if (!/^[0-9a-f]{40}$/.test(resolvedRevision)) {
				throw new Error(localize('customizationMarketplace.pluginInstallIncomplete', "The plugin could not be installed. Review the installation error and try again."));
			}
			if (/^[0-9a-f]{40}$/i.test(source.ref) && resolvedRevision !== source.ref.toLowerCase()) {
				throw new Error(localize('customizationMarketplace.pluginRevisionMismatch', "The recorded plugin revision is no longer available from its source."));
			}
			return { kind: 'plugin', uri: this.pluginInstallService.getPluginInstallUri(result.matchedPlugin), resolvedRevision };
		}
		return this.skillInstaller.install(resource, token);
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

	private getInstalledPlugin(record: ICustomizationMarketplaceInstallationRecord) {
		const source = record.installation;
		if (source.kind === 'configuredPlugin') {
			return this.pluginMarketplaceService.installedPlugins.get().find(({ plugin }) => getPluginMarketplaceIdentifier(plugin) === record.identifier);
		}
		if (source.kind !== 'plugin') {
			return undefined;
		}
		return this.pluginMarketplaceService.installedPlugins.get().find(({ plugin }) => {
			if (record.version !== undefined && plugin.version !== record.version) {
				return false;
			}
			const descriptor = plugin.sourceDescriptor;
			const resolvedRevision = record.target.kind === 'plugin' ? record.target.resolvedRevision : undefined;
			if (descriptor.kind === PluginSourceKind.GitHub) {
				return descriptor.repo.toLowerCase() === source.repository.toLowerCase() &&
					(descriptor.path ?? '') === source.path &&
					(descriptor.ref === source.ref || descriptor.sha === source.ref || descriptor.ref === resolvedRevision || descriptor.sha === resolvedRevision);
			}
			return descriptor.kind === PluginSourceKind.RelativePath &&
				plugin.marketplaceReference.githubRepo?.toLowerCase() === source.repository.toLowerCase() &&
				plugin.marketplaceReference.ref === source.ref &&
				plugin.source.replace(/^\.\//, '').replace(/\/$/, '') === source.path;
		});
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
