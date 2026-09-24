/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose, CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { posix } from '../../../../../base/common/path.js';
import { dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { agentFinderMcpRegistryManifest } from '../../../../../platform/agentFinder/common/agentFinderMcpRegistry.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { getEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { UnsupportedMcpGalleryPackageError } from '../../../../../platform/mcp/common/mcpGalleryService.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';
import { CustomizationMarketplaceInstallationTarget, CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { IMarketplaceReference, IPluginMarketplaceService, MarketplaceReferenceKind, parseMarketplaceReference, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';
import { SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from '../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { DELETE_AI_CUSTOMIZATION_ID } from './aiCustomizationManagement.js';
import { CustomizationLocationPicker } from './customizationCreatorService.js';

const maxSkillEntries = 1000;
const maxSkillBytes = 50 * 1024 * 1024;
const installationRecordsStorageKey = 'chat.customizations.marketplace.installationRecords.v1';
const installationRecordsVersion = 1;

type InstallationRecordState = 'checking' | 'installed' | 'missing';

interface ICustomizationMarketplaceInstallationRecord {
	readonly id: string;
	readonly sourceId: string;
	readonly identifier: string;
	readonly version?: string;
	readonly displayName: string;
	readonly installation: CustomizationMarketplaceInstallation;
	readonly target: CustomizationMarketplaceInstallationRecordTarget;
}

type CustomizationMarketplaceInstallationRecordTarget =
	| {
		readonly kind: 'skill';
		readonly uri: URI;
		readonly files: readonly string[];
		readonly source: 'local' | 'user';
		readonly harness: string;
		readonly project?: URI;
		readonly session?: URI;
	}
	| { readonly kind: 'plugin'; readonly uri: URI }
	| { readonly kind: 'mcp'; readonly id: string };

interface IStoredCustomizationMarketplaceInstallationRecords {
	readonly version: number;
	readonly records: readonly IStoredCustomizationMarketplaceInstallationRecord[];
}

interface IStoredCustomizationMarketplaceInstallationRecord {
	readonly id: string;
	readonly sourceId: string;
	readonly identifier: string;
	readonly version?: string;
	readonly displayName: string;
	readonly installation: CustomizationMarketplaceInstallation;
	readonly target:
		| { readonly kind: 'skill'; readonly uri: string; readonly files: readonly string[]; readonly source: 'local' | 'user'; readonly harness: string; readonly project?: string; readonly session?: string }
		| { readonly kind: 'plugin'; readonly uri: string }
		| { readonly kind: 'mcp'; readonly id: string };
}

export class CustomizationMarketplaceInstallService extends Disposable implements ICustomizationMarketplaceInstallService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly pending = new Map<string, Promise<void>>();
	private readonly pendingRepairs = new Map<string, Promise<void>>();
	private readonly pendingUninstalls = new Map<string, Promise<void>>();
	private readonly manualMcpSetups = new Map<string, { readonly sourceId: string; readonly url?: URI }>();
	private readonly records = new Map<string, ICustomizationMarketplaceInstallationRecord>();
	private readonly recordStates = new Map<string, InstallationRecordState>();
	private readonly lifetimeToken = cancelOnDispose(this._store);
	private readonly enabledDisposables = this._register(new DisposableStore());
	private readonly locationPicker: CustomizationLocationPicker;
	private reconciliationSequence = 0;
	private observingInstallations = false;

	constructor(
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IAgentPluginRepositoryService private readonly repositoryService: IAgentPluginRepositoryService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ICustomizationMarketplaceService private readonly customizationMarketplaceService: ICustomizationMarketplaceService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IProgressService private readonly progressService: IProgressService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.locationPicker = instantiationService.createInstance(CustomizationLocationPicker);
		this.loadRecords();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (this.customizationMarketplaceService.sources.some(source => event.affectsConfiguration(source.enablementSetting))) {
				this.updateEnablement();
			} else if (this.isEnabled() && event.affectsConfiguration(ChatConfiguration.PluginsEnabled)) {
				this._onDidChange.fire();
			}
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, installationRecordsStorageKey, this._store)(event => {
			if (event.external) {
				this.loadRecords();
				this._onDidChange.fire();
				if (this.isEnabled()) {
					void this.reconcileRecords();
				}
			}
		}));

		this.updateEnablement();
	}

	private isEnabled(): boolean {
		return getEnabledCustomizationMarketplaceSources(this.configurationService, this.customizationMarketplaceService.sources).length > 0;
	}

	private isSourceEnabled(sourceId: string): boolean {
		const source = this.customizationMarketplaceService.sources.find(source => source.id === sourceId);
		return !!source && this.configurationService.getValue<boolean>(source.enablementSetting) === true;
	}

	private getInstalledMcpServer(name: string, version: string): IWorkbenchMcpServer | undefined {
		return this.mcpWorkbenchService.local.find(server => server.name === name &&
			server.local?.name === name &&
			server.local?.galleryUrl === agentFinderMcpRegistryManifest.url &&
			server.local.version === version &&
			(!server.gallery || server.gallery.name === name) &&
			server.installState === McpServerInstallState.Installed);
	}

	private updateEnablement(): void {
		for (const [key, setup] of this.manualMcpSetups) {
			if (!this.isSourceEnabled(setup.sourceId)) {
				this.manualMcpSetups.delete(key);
			}
		}
		const enabled = this.isEnabled();
		if (enabled === this.observingInstallations) {
			this._onDidChange.fire();
			return;
		}
		this.observingInstallations = enabled;
		this.enabledDisposables.clear();
		if (!enabled) {
			this._onDidChange.fire();
			return;
		}
		this.enabledDisposables.add(autorun(reader => {
			this.pluginMarketplaceService.installedPlugins.read(reader);
			this.harnessService.activeHarness.read(reader);
			this.harnessService.activeSessionResource.read(reader);
			this.workspaceService.activeProjectRoot.read(reader);
			this._onDidChange.fire();
			void this.reconcileRecords();
		}));
		this.enabledDisposables.add(this.mcpWorkbenchService.onChange(() => {
			this._onDidChange.fire();
			void this.reconcileRecords();
		}));
		this.enabledDisposables.add(this.mcpWorkbenchService.onReset(() => {
			this._onDidChange.fire();
			void this.reconcileRecords();
		}));
		this.enabledDisposables.add(this.entitlementService.onDidChangeSentiment(() => this._onDidChange.fire()));
		this.enabledDisposables.add(this.fileService.onDidFilesChange(event => {
			if ([...this.records.values()].some(record => record.target.kind === 'skill' && (event.affects(record.target.uri) || event.affects(dirname(record.target.uri))))) {
				void this.reconcileRecords();
			}
		}));
		void this.reconcileRecords();
	}

	private loadRecords(): void {
		const raw = this.storageService.get(installationRecordsStorageKey, StorageScope.PROFILE);
		if (!raw) {
			this.records.clear();
			this.recordStates.clear();
			return;
		}
		try {
			const stored: unknown = JSON.parse(raw);
			if (!isStoredInstallationRecords(stored)) {
				throw new Error('Invalid installation records schema');
			}
			const records: ICustomizationMarketplaceInstallationRecord[] = [];
			for (const storedRecord of stored.records) {
				const record = reviveInstallationRecord(storedRecord);
				if (!record) {
					throw new Error('Invalid installation record');
				}
				records.push(record);
			}
			this.records.clear();
			this.recordStates.clear();
			for (const record of records) {
				this.records.set(record.id, record);
				this.recordStates.set(record.id, 'checking');
			}
		} catch (error) {
			this.logService.error('[CustomizationMarketplace] Unable to load installation records', error);
		}
	}

	private persistRecords(): void {
		const stored: IStoredCustomizationMarketplaceInstallationRecords = {
			version: installationRecordsVersion,
			records: [...this.records.values()].map(serializeInstallationRecord),
		};
		this.storageService.store(installationRecordsStorageKey, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private async addRecord(record: ICustomizationMarketplaceInstallationRecord): Promise<void> {
		this.records.set(record.id, record);
		this.recordStates.set(record.id, 'checking');
		this.persistRecords();
		await this.reconcileRecords();
	}

	private removeRecord(record: ICustomizationMarketplaceInstallationRecord): void {
		this.records.delete(record.id);
		this.recordStates.delete(record.id);
		this.persistRecords();
	}

	private findRecord(resource: ICustomizationMarketplaceResource): ICustomizationMarketplaceInstallationRecord | undefined {
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		return [...this.records.values()].find(record => getInstallationRecordResourceKey(record) === resourceKey && this.isRecordApplicable(record));
	}

	private isRecordApplicable(record: ICustomizationMarketplaceInstallationRecord): boolean {
		if (record.target.kind !== 'skill') {
			return true;
		}
		if (record.target.harness !== this.harnessService.activeHarness.get()) {
			return false;
		}
		if (record.target.source === 'user') {
			return true;
		}
		if (record.target.project) {
			return isEqual(record.target.project, this.workspaceService.getActiveProjectRoot());
		}
		return !!record.target.session && isEqual(record.target.session, this.harnessService.activeSessionResource.get());
	}

	private toInstallationTarget(record: ICustomizationMarketplaceInstallationRecord): CustomizationMarketplaceInstallationTarget {
		switch (record.target.kind) {
			case 'skill': return { kind: 'skill', uri: record.target.uri };
			case 'plugin': return { kind: 'plugin', uri: record.target.uri };
			case 'mcp': return { kind: 'mcp', id: record.target.id };
		}
	}

	private async reconcileRecords(): Promise<void> {
		const sequence = ++this.reconciliationSequence;
		let didChange = false;
		let didUpdateRecords = false;
		for (const original of [...this.records.values()]) {
			let record = original;
			let state: InstallationRecordState;
			if (record.target.kind === 'skill') {
				state = await this.isSkillInstallationComplete(record.target) ? 'installed' : 'missing';
			} else if (record.target.kind === 'plugin') {
				const target = record.target;
				let installed = this.pluginMarketplaceService.installedPlugins.get().find(candidate => isEqual(candidate.pluginUri, target.uri));
				installed ??= this.getInstalledPlugin(record.installation, record.version);
				state = installed ? 'installed' : 'missing';
				if (installed && !isEqual(installed.pluginUri, record.target.uri)) {
					record = { ...record, target: { kind: 'plugin', uri: installed.pluginUri } };
					this.records.set(record.id, record);
					didUpdateRecords = true;
				}
			} else {
				const target = record.target;
				const installed = this.mcpWorkbenchService.local.find(server => server.id === target.id && server.installState === McpServerInstallState.Installed)
					?? (record.installation.kind === 'mcp' ? this.getInstalledMcpServer(record.installation.name, record.installation.version) : undefined);
				state = installed ? 'installed' : 'missing';
				if (installed && installed.id !== target.id) {
					record = { ...record, target: { kind: 'mcp', id: installed.id } };
					this.records.set(record.id, record);
					didUpdateRecords = true;
				}
			}
			if (sequence !== this.reconciliationSequence || this._store.isDisposed) {
				return;
			}
			if (this.recordStates.get(record.id) !== state) {
				this.recordStates.set(record.id, state);
				didChange = true;
			}
		}
		if (didUpdateRecords) {
			this.persistRecords();
		}
		if (didChange || didUpdateRecords) {
			this._onDidChange.fire();
		}
	}

	private async isSkillInstallationComplete(target: Extract<CustomizationMarketplaceInstallationRecordTarget, { kind: 'skill' }>): Promise<boolean> {
		const root = dirname(target.uri);
		for (const path of target.files) {
			try {
				const stat = await this.fileService.resolve(joinPath(root, ...path.split('/')));
				if (!stat.isFile || stat.isSymbolicLink) {
					return false;
				}
			} catch {
				return false;
			}
		}
		return true;
	}

	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
		const record = this.findRecord(resource);
		if (record) {
			const target = this.toInstallationTarget(record);
			if (this.pendingUninstalls.has(record.id)) {
				return { kind: 'uninstalling', target };
			}
			if (this.pendingRepairs.has(record.id)) {
				return { kind: 'repairing', target };
			}
			return { kind: this.recordStates.get(record.id) ?? 'checking', target };
		}
		if (!this.isSourceEnabled(resource.sourceId)) {
			return { kind: 'unavailable', message: localize('customizationMarketplace.sourceDisabled', "Enable this resource's marketplace source to install it.") };
		}
		if (this.entitlementService.sentiment.hidden) {
			return { kind: 'unavailable', message: localize('customizationMarketplace.aiDisabled', "Enable AI features to install customizations.") };
		}
		const resourceKey = getCustomizationMarketplaceResourceKey(resource);
		if (this.pending.has(resourceKey)) {
			return { kind: 'installing' };
		}
		const source = resource.installation;
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
		return { kind: 'available' };
	}

	async install(resource: ICustomizationMarketplaceResource): Promise<void> {
		const state = this.getInstallState(resource);
		if (state.kind === 'unavailable') {
			throw new Error(state.message);
		}
		const key = getCustomizationMarketplaceResourceKey(resource);
		const pending = this.pending.get(key);
		if (pending) {
			return pending;
		}
		if (state.kind !== 'available') {
			return;
		}
		const operationDisposables = new DisposableStore();
		const token = cancelOnDispose(operationDisposables);
		operationDisposables.add(this.lifetimeToken.onCancellationRequested(() => operationDisposables.dispose()));
		operationDisposables.add(this.configurationService.onDidChangeConfiguration(() => {
			if (!this.isSourceEnabled(resource.sourceId)) {
				operationDisposables.dispose();
			}
		}));
		const operation = (async () => {
			const record = await this.doInstall(resource, token);
			await this.addRecord(record);
		})();
		this.pending.set(key, operation);
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
		if (!record || this.recordStates.get(record.id) !== 'missing') {
			return;
		}
		const pending = this.pendingRepairs.get(record.id);
		if (pending) {
			return pending;
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
			this.records.set(record.id, repaired);
			this.recordStates.set(record.id, 'checking');
			this.persistRecords();
			await this.reconcileRecords();
		})();
		this.pendingRepairs.set(record.id, operation);
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

	async uninstall(resource: ICustomizationMarketplaceResource): Promise<void> {
		const record = this.findRecord(resource);
		if (!record) {
			return;
		}
		const state = this.recordStates.get(record.id);
		const pending = this.pendingUninstalls.get(record.id);
		if (pending) {
			return pending;
		}
		if (state !== 'installed' && state !== 'missing') {
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
		if (source.kind === 'mcp') {
			const targetId = record.target.kind === 'mcp' ? record.target.id : undefined;
			const server = this.mcpWorkbenchService.local.find(candidate => candidate.id === targetId)
				?? this.getInstalledMcpServer(source.name, source.version);
			if (server) {
				await this.mcpWorkbenchService.uninstall(server);
			}
			return;
		}
		if (source.kind === 'plugin') {
			const targetUri = record.target.kind === 'plugin' ? record.target.uri : undefined;
			const installed = targetUri
				? this.pluginMarketplaceService.installedPlugins.get().find(candidate => isEqual(candidate.pluginUri, targetUri))
				: undefined;
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
		if (!await this.fileService.exists(target)) {
			return;
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

	private async doInstall(resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<ICustomizationMarketplaceInstallationRecord> {
		this.checkEnabled(resource.sourceId, token);
		const source = resource.installation;
		if (!source) {
			throw new Error(localize('customizationMarketplace.sourceUnavailable', "This resource does not provide a supported installation source."));
		}
		const target = await this.installTarget(resource, token);
		return {
			id: generateUuid(),
			sourceId: resource.sourceId,
			identifier: resource.identifier,
			version: resource.version,
			displayName: resource.displayName,
			installation: source,
			target,
		};
	}

	private async doRepair(resource: ICustomizationMarketplaceResource, record: ICustomizationMarketplaceInstallationRecord, token: CancellationToken): Promise<ICustomizationMarketplaceInstallationRecord> {
		this.checkEnabled(record.sourceId, token);
		if (record.target.kind === 'skill') {
			await this.repairSkill(record, token);
			return record;
		}
		const target = await this.installTarget({
			...resource,
			sourceId: record.sourceId,
			identifier: record.identifier,
			version: record.version,
			installation: record.installation,
		}, token);
		return { ...record, target };
	}

	private async installTarget(resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<CustomizationMarketplaceInstallationRecordTarget> {
		const source = resource.installation;
		if (!source) {
			throw new Error(localize('customizationMarketplace.sourceUnavailable', "This resource does not provide a supported installation source."));
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
			return { kind: 'plugin', uri: this.pluginInstallService.getPluginInstallUri(result.matchedPlugin) };
		}
		return this.installSkill(resource, token);
	}

	private getInstalledPlugin(source: CustomizationMarketplaceInstallation, version: string | undefined) {
		if (source.kind !== 'plugin') {
			return undefined;
		}
		return this.pluginMarketplaceService.installedPlugins.get().find(({ plugin }) => {
			if (version !== undefined && plugin.version !== version) {
				return false;
			}
			const descriptor = plugin.sourceDescriptor;
			if (descriptor.kind === PluginSourceKind.GitHub) {
				return descriptor.repo.toLowerCase() === source.repository.toLowerCase() &&
					(descriptor.path ?? '') === source.path &&
					(descriptor.ref === source.ref || descriptor.sha === source.ref);
			}
			return descriptor.kind === PluginSourceKind.RelativePath &&
				plugin.marketplaceReference.githubRepo?.toLowerCase() === source.repository.toLowerCase() &&
				plugin.marketplaceReference.ref === source.ref &&
				plugin.source.replace(/^\.\//, '').replace(/\/$/, '') === source.path;
		});
	}

	private async installSkill(resource: ICustomizationMarketplaceResource, enabledToken: CancellationToken): Promise<Extract<CustomizationMarketplaceInstallationRecordTarget, { kind: 'skill' }>> {
		const source = resource.installation;
		if (source?.kind !== 'skill') {
			throw new Error(localize('customizationMarketplace.invalidSkillSource', "The skill's installation source is invalid."));
		}
		const { sourceSegments, name, reference } = this.getSkillSource(source);
		const session = this.harnessService.activeSessionResource.get();
		const harness = this.harnessService.activeHarness.get();
		const project = this.workspaceService.getActiveProjectRoot();
		const checkContext = (token: CancellationToken = CancellationToken.None) => {
			this.checkEnabled(resource.sourceId, enabledToken);
			if (token.isCancellationRequested || harness !== this.harnessService.activeHarness.get() || !isEqual(session, this.harnessService.activeSessionResource.get()) || !isEqual(project, this.workspaceService.getActiveProjectRoot())) {
				throw new CancellationError();
			}
		};
		const targetFolder = await this.locationPicker.resolveTargetFolderWithPicker(session, PromptsType.skill);
		checkContext();
		if (targetFolder === null) {
			throw new CancellationError();
		}
		if (!targetFolder) {
			throw new Error(localize('customizationMarketplace.noSkillDestination', "The selected agent does not provide a writable skill installation location."));
		}
		if (targetFolder.source !== 'local' && targetFolder.source !== 'user') {
			throw new Error(localize('customizationMarketplace.noSkillDestination', "The selected agent does not provide a writable skill installation location."));
		}
		const targetDirectory = targetFolder.uri;
		const target = joinPath(targetDirectory, name);
		if (await this.fileService.exists(target)) {
			throw new Error(localize('customizationMarketplace.skillExists', "A skill already exists at '{0}'. Remove or rename it before installing this resource.", this.labelService.getUriLabel(target)));
		}
		const confirmation = await this.dialogService.confirm({
			type: 'question',
			message: localize('customizationMarketplace.confirmSkill', "Install '{0}'?", resource.displayName),
			detail: localize('customizationMarketplace.confirmSkillDetail', "Skills can supply instructions and scripts that an agent may run. Only install resources from sources you trust.\n\nSource: {0}\nRevision: {1}\nDestination: {2}",
				`${source.repository}/${source.path}`, source.ref, this.labelService.getUriLabel(target)),
			primaryButton: localize('customizationMarketplace.installSkillButton', "Install"),
			custom: { icon: Codicon.shield },
		});
		if (!confirmation.confirmed) {
			throw new CancellationError();
		}
		checkContext();
		const operationDisposables = new DisposableStore();
		const cancellation = operationDisposables.add(new CancellationTokenSource(enabledToken));
		const token = cancellation.token;
		let installedFiles: readonly string[] | undefined;
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('customizationMarketplace.installingSkill', "Installing skill '{0}'", resource.displayName),
				cancellable: true,
			}, async () => {
				const sourceDirectory = await this.resolveSkillSourceDirectory(reference, sourceSegments, () => checkContext(token), token);
				const staging = joinPath(dirname(targetDirectory), `.customization-marketplace-${generateUuid()}`);
				try {
					installedFiles = await this.copySkill(sourceDirectory, staging, () => checkContext(token), token);
					if (!await this.fileService.exists(joinPath(staging, SKILL_FILENAME))) {
						throw new Error(localize('customizationMarketplace.missingStagedSkillFile', "The source changed before the skill was fully copied. Try installing it again."));
					}
					checkContext(token);
					await this.fileService.move(staging, target, false);
					try {
						checkContext(token);
					} catch (error) {
						try {
							await this.fileService.del(target, { recursive: true });
						} catch (cleanupError) {
							this.logService.error('[CustomizationMarketplace] Unable to remove cancelled skill installation', cleanupError);
							throw cleanupError;
						}
						throw error;
					}
				} finally {
					try {
						if (await this.fileService.exists(staging)) {
							await this.fileService.del(staging, { recursive: true });
						}
					} catch (error) {
						this.logService.error('[CustomizationMarketplace] Unable to clean up staged skill installation', error);
					}
				}
			}, () => cancellation.cancel());
		} finally {
			operationDisposables.dispose();
		}
		if (!installedFiles) {
			throw new Error(localize('customizationMarketplace.skillInstallIncomplete', "The skill could not be installed. Review the installation error and try again."));
		}
		return {
			kind: 'skill',
			uri: joinPath(target, SKILL_FILENAME),
			files: installedFiles,
			source: targetFolder.source,
			harness,
			project: targetFolder.source === 'local' ? project : undefined,
			session: targetFolder.source === 'local' && !project ? session : undefined,
		};
	}

	private async repairSkill(record: ICustomizationMarketplaceInstallationRecord, enabledToken: CancellationToken): Promise<void> {
		if (record.target.kind !== 'skill' || record.installation.kind !== 'skill') {
			throw new Error(localize('customizationMarketplace.invalidSkillRecord', "The recorded skill installation is invalid."));
		}
		const target = record.target;
		const installation = record.installation;
		const { sourceSegments, reference } = this.getSkillSource(installation);
		const targetRoot = dirname(target.uri);
		const confirmation = await this.dialogService.confirm({
			type: 'question',
			message: localize('customizationMarketplace.confirmSkillRepair', "Repair '{0}'?", record.displayName),
			detail: localize('customizationMarketplace.confirmSkillRepairDetail', "Missing files will be restored without overwriting existing files.\n\nSource: {0}\nRevision: {1}\nDestination: {2}",
				`${installation.repository}/${installation.path}`, installation.ref, this.labelService.getUriLabel(targetRoot)),
			primaryButton: localize('customizationMarketplace.repairSkillButton', "Repair"),
			custom: { icon: Codicon.shield },
		});
		if (!confirmation.confirmed) {
			throw new CancellationError();
		}
		const harness = this.harnessService.activeHarness.get();
		const session = this.harnessService.activeSessionResource.get();
		const project = this.workspaceService.getActiveProjectRoot();
		const checkContext = (token: CancellationToken = CancellationToken.None) => {
			this.checkEnabled(record.sourceId, enabledToken);
			if (token.isCancellationRequested || harness !== this.harnessService.activeHarness.get() || !isEqual(session, this.harnessService.activeSessionResource.get()) || !isEqual(project, this.workspaceService.getActiveProjectRoot()) || !this.isRecordApplicable(record)) {
				throw new CancellationError();
			}
		};
		const operationDisposables = new DisposableStore();
		const cancellation = operationDisposables.add(new CancellationTokenSource(enabledToken));
		const token = cancellation.token;
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('customizationMarketplace.repairingSkill', "Repairing skill '{0}'", record.displayName),
				cancellable: true,
			}, async () => {
				const sourceDirectory = await this.resolveSkillSourceDirectory(reference, sourceSegments, () => checkContext(token), token);
				const staging = joinPath(dirname(targetRoot), `.customization-marketplace-${generateUuid()}`);
				try {
					const stagedFiles = new Set(await this.copySkill(sourceDirectory, staging, () => checkContext(token), token));
					for (const relativePath of target.files) {
						if (!stagedFiles.has(relativePath)) {
							throw new Error(localize('customizationMarketplace.skillRepairSourceChanged', "The recorded skill files are no longer available from the original source."));
						}
						const pathSegments = relativePath.split('/');
						const target = joinPath(targetRoot, ...pathSegments);
						if (await this.fileService.exists(target)) {
							const stat = await this.fileService.resolve(target);
							if (!stat.isFile || stat.isSymbolicLink) {
								throw new Error(localize('customizationMarketplace.skillRepairConflict', "A recorded skill file cannot be repaired because its destination is occupied by another file type."));
							}
							continue;
						}
						await this.ensureSafeSkillRepairParent(targetRoot, pathSegments.slice(0, -1));
						checkContext(token);
						await this.fileService.copy(joinPath(staging, ...pathSegments), target, false);
					}
				} finally {
					try {
						if (await this.fileService.exists(staging)) {
							await this.fileService.del(staging, { recursive: true });
						}
					} catch (error) {
						this.logService.error('[CustomizationMarketplace] Unable to clean up staged skill repair', error);
					}
				}
			}, () => cancellation.cancel());
		} finally {
			operationDisposables.dispose();
		}
	}

	private getSkillSource(source: Extract<CustomizationMarketplaceInstallation, { kind: 'skill' }>): { readonly sourceSegments: readonly string[]; readonly name: string; readonly reference: IMarketplaceReference } {
		const sourceSegments = source.path ? source.path.split('/') : [];
		if (sourceSegments.some(segment => !segment || segment === '.' || segment === '..' || /[:\\\u0000-\u001f\u007f]/.test(segment) || segment.toLowerCase() === '.git')) {
			throw new Error(localize('customizationMarketplace.invalidSkillSource', "The skill's installation source is invalid."));
		}
		const name = posix.basename(source.path || source.repository);
		if (!VALID_SKILL_NAME_REGEX.test(name) || name.length > 64) {
			throw new Error(localize('customizationMarketplace.invalidSkillName', "The skill's folder name '{0}' is not supported. Open the source to review its installation instructions.", name));
		}
		const reference = parseMarketplaceReference(`${source.repository}#${source.ref}`);
		if (!reference || reference.kind !== MarketplaceReferenceKind.GitHubShorthand) {
			throw new Error(localize('customizationMarketplace.invalidSkillSource', "The skill's installation source is invalid."));
		}
		return { sourceSegments, name, reference };
	}

	private async resolveSkillSourceDirectory(reference: IMarketplaceReference, sourceSegments: readonly string[], checkContext: () => void, token: CancellationToken): Promise<URI> {
		const repository = await this.repositoryService.ensureRepository(reference, { token });
		checkContext();
		let sourceDirectory = repository;
		for (const segment of sourceSegments) {
			sourceDirectory = joinPath(sourceDirectory, segment);
			const stat = await this.fileService.resolve(sourceDirectory);
			if (!stat.isDirectory || stat.isSymbolicLink) {
				throw new Error(localize('customizationMarketplace.unsafeSkillDirectory', "The skill must be a directory inside its repository, without symbolic links."));
			}
		}
		const skill = await this.fileService.resolve(joinPath(sourceDirectory, SKILL_FILENAME));
		if (!skill.isFile || skill.isSymbolicLink) {
			throw new Error(localize('customizationMarketplace.missingSkillFile', "The source does not contain a regular SKILL.md file."));
		}
		return sourceDirectory;
	}

	private async ensureSafeSkillRepairParent(root: URI, segments: readonly string[]): Promise<void> {
		let directory = root;
		for (const segment of ['', ...segments]) {
			if (segment) {
				directory = joinPath(directory, segment);
			}
			if (await this.fileService.exists(directory)) {
				const stat = await this.fileService.resolve(directory);
				if (!stat.isDirectory || stat.isSymbolicLink) {
					throw new Error(localize('customizationMarketplace.skillRepairUnsafeDestination', "The skill cannot be repaired because its destination contains a symbolic link or non-directory path."));
				}
			} else {
				await this.fileService.createFolder(directory);
			}
		}
	}

	private async copySkill(source: URI, target: URI, checkContext: () => void, token: CancellationToken): Promise<readonly string[]> {
		const directories = [{ source, target, relativePath: '' }];
		const skillFile = joinPath(source, SKILL_FILENAME);
		const files: string[] = [];
		let entries = 0;
		let bytes = 0;
		while (directories.length) {
			checkContext();
			const directory = directories.pop()!;
			const stat = await this.fileService.resolve(directory.source);
			if (!stat.isDirectory || stat.isSymbolicLink) {
				throw new Error(localize('customizationMarketplace.unsafeSkillDirectory', "The skill must be a directory inside its repository, without symbolic links."));
			}
			await this.fileService.createFolder(directory.target);
			for (const child of stat.children ?? []) {
				checkContext();
				if (child.name.toLowerCase() === '.git') {
					continue;
				}
				if (++entries > maxSkillEntries || child.isSymbolicLink) {
					throw new Error(localize('customizationMarketplace.unsafeSkillContents', "The skill contains symbolic links or too many files. Review the source before installing it manually."));
				}
				const destination = joinPath(directory.target, child.name);
				const relativePath = directory.relativePath ? `${directory.relativePath}/${child.name}` : child.name;
				if (child.isDirectory) {
					directories.push({ source: child.resource, target: destination, relativePath });
				} else if (child.isFile) {
					const content = await this.fileService.readFile(child.resource, { limits: { size: maxSkillBytes - bytes } }, token);
					if (isEqual(child.resource, skillFile) && !content.value.toString().trim()) {
						throw new Error(localize('customizationMarketplace.emptySkillFile', "The source's SKILL.md file is empty."));
					}
					bytes += content.value.byteLength;
					if (bytes > maxSkillBytes) {
						throw new Error(localize('customizationMarketplace.skillTooLarge', "The skill exceeds the 50 MB installation limit."));
					}
					checkContext();
					await this.fileService.createFile(destination, content.value, { overwrite: false });
					files.push(relativePath);
				} else {
					throw new Error(localize('customizationMarketplace.unsupportedSkillFile', "The skill contains a file type that cannot be installed."));
				}
			}
		}
		return files.sort();
	}

	private checkEnabled(sourceId: string, token: CancellationToken): void {
		if (token.isCancellationRequested || this.lifetimeToken.isCancellationRequested || !this.isSourceEnabled(sourceId) || this.entitlementService.sentiment.hidden) {
			throw new CancellationError();
		}
	}
}

function getInstallationRecordResourceKey(record: ICustomizationMarketplaceInstallationRecord): string {
	return getCustomizationMarketplaceResourceKey(record);
}

function isStoredInstallationRecords(value: unknown): value is IStoredCustomizationMarketplaceInstallationRecords {
	if (!isRecord(value) || value.version !== installationRecordsVersion || !Array.isArray(value.records)) {
		return false;
	}
	return value.records.every(isStoredInstallationRecord);
}

function isStoredInstallationRecord(value: unknown): value is IStoredCustomizationMarketplaceInstallationRecord {
	if (!isRecord(value)
		|| !isNonEmptyString(value.id)
		|| !isNonEmptyString(value.sourceId)
		|| !isNonEmptyString(value.identifier)
		|| value.version !== undefined && typeof value.version !== 'string'
		|| !isNonEmptyString(value.displayName)
		|| !isStoredInstallation(value.installation)
		|| !isRecord(value.target)
		|| value.target.kind !== value.installation.kind) {
		return false;
	}
	if (value.target.kind === 'mcp') {
		return isNonEmptyString(value.target.id);
	}
	if (value.target.kind === 'plugin') {
		return isNonEmptyString(value.target.uri);
	}
	return value.target.kind === 'skill'
		&& isNonEmptyString(value.target.uri)
		&& (value.target.source === 'local' || value.target.source === 'user')
		&& isNonEmptyString(value.target.harness)
		&& (value.target.project === undefined || isNonEmptyString(value.target.project))
		&& (value.target.session === undefined || isNonEmptyString(value.target.session))
		&& Array.isArray(value.target.files)
		&& value.target.files.length > 0
		&& value.target.files.includes(SKILL_FILENAME)
		&& value.target.files.every(isSafeStoredRelativePath);
}

function isStoredInstallation(value: unknown): value is CustomizationMarketplaceInstallation {
	if (!isRecord(value) || typeof value.kind !== 'string') {
		return false;
	}
	if (value.kind === 'mcp') {
		return isNonEmptyString(value.name) && isNonEmptyString(value.version);
	}
	return (value.kind === 'skill' || value.kind === 'plugin')
		&& isNonEmptyString(value.repository)
		&& isNonEmptyString(value.ref)
		&& typeof value.path === 'string';
}

function reviveInstallationRecord(record: IStoredCustomizationMarketplaceInstallationRecord): ICustomizationMarketplaceInstallationRecord | undefined {
	try {
		let target: CustomizationMarketplaceInstallationRecordTarget;
		if (record.target.kind === 'mcp') {
			target = { kind: 'mcp', id: record.target.id };
		} else if (record.target.kind === 'plugin') {
			target = { kind: 'plugin', uri: URI.parse(record.target.uri) };
		} else {
			const uri = URI.parse(record.target.uri);
			const root = dirname(uri);
			if (posix.basename(uri.path) !== SKILL_FILENAME || !root.path || root.path === '/') {
				return undefined;
			}
			target = {
				kind: 'skill',
				uri,
				files: record.target.files,
				source: record.target.source,
				harness: record.target.harness,
				project: record.target.project ? URI.parse(record.target.project) : undefined,
				session: record.target.session ? URI.parse(record.target.session) : undefined,
			};
		}
		return {
			id: record.id,
			sourceId: record.sourceId,
			identifier: record.identifier,
			version: record.version,
			displayName: record.displayName,
			installation: record.installation,
			target,
		};
	} catch {
		return undefined;
	}
}

function serializeInstallationRecord(record: ICustomizationMarketplaceInstallationRecord): IStoredCustomizationMarketplaceInstallationRecord {
	const target: IStoredCustomizationMarketplaceInstallationRecord['target'] = record.target.kind === 'mcp'
		? { kind: 'mcp', id: record.target.id }
		: record.target.kind === 'plugin'
			? { kind: 'plugin', uri: record.target.uri.toString() }
			: {
				kind: 'skill',
				uri: record.target.uri.toString(),
				files: record.target.files,
				source: record.target.source,
				harness: record.target.harness,
				project: record.target.project?.toString(),
				session: record.target.session?.toString(),
			};
	return {
		id: record.id,
		sourceId: record.sourceId,
		identifier: record.identifier,
		version: record.version,
		displayName: record.displayName,
		installation: record.installation,
		target,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isSafeStoredRelativePath(value: unknown): value is string {
	return typeof value === 'string'
		&& value.length > 0
		&& !value.startsWith('/')
		&& !/[:\\\u0000-\u001f\u007f]/.test(value)
		&& value.split('/').every(segment => !!segment && segment !== '.' && segment !== '..' && segment.toLowerCase() !== '.git');
}
