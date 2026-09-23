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
import { dirname, getComparisonKey, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { getEnabledCustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IMcpWorkbenchService, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService, MarketplaceReferenceKind, parseMarketplaceReference, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';
import { SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from '../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationLocationPicker } from './customizationCreatorService.js';

const maxSkillEntries = 1000;
const maxSkillBytes = 50 * 1024 * 1024;

export class CustomizationMarketplaceInstallService extends Disposable implements ICustomizationMarketplaceInstallService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly pending = new Map<string, Promise<void>>();
	private readonly installedSkills = new Map<string, { readonly uri: URI; readonly sourceId: string }>();
	private readonly lifetimeToken = cancelOnDispose(this._store);
	private readonly enabledDisposables = this._register(new DisposableStore());
	private observingInstallations = false;
	private readonly locationPicker: CustomizationLocationPicker;

	constructor(
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IPluginMarketplaceService private readonly pluginMarketplaceService: IPluginMarketplaceService,
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
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.locationPicker = instantiationService.createInstance(CustomizationLocationPicker);
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (this.customizationMarketplaceService.sources.some(source => event.affectsConfiguration(source.enablementSetting))) {
				this.updateEnablement();
			} else if (this.isEnabled() && event.affectsConfiguration(ChatConfiguration.PluginsEnabled)) {
				this._onDidChange.fire();
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

	private updateEnablement(): void {
		for (const [key, skill] of this.installedSkills) {
			if (!this.isSourceEnabled(skill.sourceId)) {
				this.installedSkills.delete(key);
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
			this.workspaceService.activeProjectRoot.read(reader);
			this._onDidChange.fire();
		}));
		this.enabledDisposables.add(this.mcpWorkbenchService.onChange(() => this._onDidChange.fire()));
		this.enabledDisposables.add(this.entitlementService.onDidChangeSentiment(() => this._onDidChange.fire()));
		this.enabledDisposables.add(this.fileService.onDidFilesChange(event => {
			let changed = false;
			for (const [key, { uri }] of this.installedSkills) {
				if (event.contains(uri, FileChangeType.DELETED)) {
					this.installedSkills.delete(key);
					changed = true;
				}
			}
			if (changed) {
				this._onDidChange.fire();
			}
		}));
	}

	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
		if (!this.isSourceEnabled(resource.sourceId)) {
			return { kind: 'unavailable', message: localize('customizationMarketplace.sourceDisabled', "Enable this resource's marketplace source to install it.") };
		}
		if (this.entitlementService.sentiment.hidden) {
			return { kind: 'unavailable', message: localize('customizationMarketplace.aiDisabled', "Enable AI features to install customizations.") };
		}
		if (this.pending.has(getCustomizationMarketplaceResourceKey(resource))) {
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
			const installed = this.pluginMarketplaceService.installedPlugins.get().some(({ plugin }) => {
				const descriptor = plugin.sourceDescriptor;
				if (descriptor.kind === PluginSourceKind.GitHub) {
					return descriptor.repo.toLowerCase() === source.repository.toLowerCase() && (descriptor.path ?? '') === source.path;
				}
				return descriptor.kind === PluginSourceKind.RelativePath &&
					plugin.marketplaceReference.githubRepo?.toLowerCase() === source.repository.toLowerCase() &&
					plugin.source.replace(/^\.\//, '').replace(/\/$/, '') === source.path;
			});
			return { kind: installed ? 'installed' : 'available' };
		}
		if (source.kind === 'mcp') {
			const server = this.mcpWorkbenchService.local.find(server => server.name === source.name && server.gallery?.name === source.name);
			return { kind: server?.installState === McpServerInstallState.Installed ? 'installed' : 'available' };
		}
		return { kind: this.installedSkills.has(this.getSkillKey(resource)) ? 'installed' : 'available' };
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
		if (state.kind === 'installed') {
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
		const operation = this.doInstall(resource, token);
		this.pending.set(key, operation);
		this._onDidChange.fire();
		try {
			await operation;
		} catch (error) {
			if (token.isCancellationRequested || this.lifetimeToken.isCancellationRequested || !this.isSourceEnabled(resource.sourceId)) {
				throw new CancellationError();
			}
			throw error;
		} finally {
			operationDisposables.dispose();
			this.pending.delete(key);
			if (this.isEnabled()) {
				this._onDidChange.fire();
			}
		}
	}

	private async doInstall(resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<void> {
		this.checkEnabled(resource.sourceId, token);
		const source = resource.installation;
		if (!source) {
			throw new Error(localize('customizationMarketplace.sourceUnavailable', "This resource does not provide a supported installation source."));
		}
		if (source.kind === 'mcp') {
			const server = await this.mcpWorkbenchService.getMcpServerFromGallery(source.name);
			this.checkEnabled(resource.sourceId, token);
			if (!server) {
				throw new Error(localize('customizationMarketplace.mcpUnavailable', "The MCP server '{0}' is not available in the configured registry.", source.name));
			}
			const canInstall = this.mcpWorkbenchService.canInstall(server);
			if (canInstall !== true) {
				throw new Error(canInstall.value);
			}
			const installed = await this.mcpWorkbenchService.install(server);
			if (installed.installState !== McpServerInstallState.Installed) {
				throw new Error(localize('customizationMarketplace.mcpInstallIncomplete', "The MCP server could not be installed. Review the installation error and try again."));
			}
			return;
		}
		if (source.kind === 'plugin') {
			const result = await this.pluginInstallService.installPluginFromSource(`${source.repository}#${source.ref}`, { path: source.path });
			if (!result.success) {
				if (result.message) {
					throw new Error(result.message);
				}
				throw new CancellationError();
			}
			return;
		}
		await this.installSkill(resource, token);
	}

	private async installSkill(resource: ICustomizationMarketplaceResource, enabledToken: CancellationToken): Promise<void> {
		const source = resource.installation;
		if (source?.kind !== 'skill') {
			throw new Error(localize('customizationMarketplace.invalidSkillSource', "The skill's installation source is invalid."));
		}
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
		const session = this.harnessService.activeSessionResource.get();
		const harness = this.harnessService.activeHarness.get();
		const project = this.workspaceService.getActiveProjectRoot();
		const key = this.getSkillKey(resource);
		const checkContext = (token: CancellationToken = CancellationToken.None) => {
			this.checkEnabled(resource.sourceId, enabledToken);
			if (token.isCancellationRequested || harness !== this.harnessService.activeHarness.get() || !isEqual(session, this.harnessService.activeSessionResource.get()) || !isEqual(project, this.workspaceService.getActiveProjectRoot())) {
				throw new CancellationError();
			}
		};
		const targetDirectory = await this.locationPicker.resolveTargetDirectoryWithPicker(session, PromptsType.skill);
		checkContext();
		if (targetDirectory === null) {
			throw new CancellationError();
		}
		if (!targetDirectory) {
			throw new Error(localize('customizationMarketplace.noSkillDestination', "The selected agent does not provide a writable skill installation location."));
		}
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
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('customizationMarketplace.installingSkill', "Installing skill '{0}'", resource.displayName),
				cancellable: true,
			}, async () => {
				const repository = await this.repositoryService.ensureRepository(reference, { token });
				checkContext(token);
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
				const staging = joinPath(dirname(targetDirectory), `.customization-marketplace-${generateUuid()}`);
				try {
					await this.copySkill(sourceDirectory, staging, () => checkContext(token), token);
					if (!await this.fileService.exists(joinPath(staging, SKILL_FILENAME))) {
						throw new Error(localize('customizationMarketplace.missingStagedSkillFile', "The source changed before the skill was fully copied. Try installing it again."));
					}
					checkContext(token);
					await this.fileService.move(staging, target, false);
					this.installedSkills.set(key, { uri: joinPath(target, SKILL_FILENAME), sourceId: resource.sourceId });
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
	}

	private async copySkill(source: URI, target: URI, checkContext: () => void, token: CancellationToken): Promise<void> {
		const directories = [{ source, target }];
		const skillFile = joinPath(source, SKILL_FILENAME);
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
				if (child.isDirectory) {
					directories.push({ source: child.resource, target: destination });
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
				} else {
					throw new Error(localize('customizationMarketplace.unsupportedSkillFile', "The skill contains a file type that cannot be installed."));
				}
			}
		}
	}

	private getSkillKey(resource: ICustomizationMarketplaceResource): string {
		const root = this.workspaceService.getActiveProjectRoot();
		return JSON.stringify([getCustomizationMarketplaceResourceKey(resource), this.harnessService.activeHarness.get(), root ? getComparisonKey(root) : '']);
	}

	private checkEnabled(sourceId: string, token: CancellationToken): void {
		if (token.isCancellationRequested || this.lifetimeToken.isCancellationRequested || !this.isSourceEnabled(sourceId) || this.entitlementService.sentiment.hidden) {
			throw new CancellationError();
		}
	}
}
