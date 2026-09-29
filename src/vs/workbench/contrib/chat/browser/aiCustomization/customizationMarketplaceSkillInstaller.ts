/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { posix } from '../../../../../base/common/path.js';
import { dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceInstallation, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginGitService } from '../../common/plugins/pluginGitService.js';
import { IMarketplacePlugin, IMarketplaceReference, MarketplaceReferenceKind, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';
import { SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from '../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationLocationPicker } from './customizationCreatorService.js';
import { CustomizationMarketplaceInstallationRecordTarget, ICustomizationMarketplaceInstallationRecord } from './customizationMarketplaceInstallationRecordStore.js';

const maxSkillEntries = 1000;
const maxSkillBytes = 50 * 1024 * 1024;
const maxSkillRecordPathCharacters = 1024 * 1024;

type SkillInstallationTarget = Extract<CustomizationMarketplaceInstallationRecordTarget, { kind: 'skill' }>;

/** Installs and repairs complete skill packages without exposing staging or repository mechanics. */
export class CustomizationMarketplaceSkillInstaller {
	constructor(
		private readonly checkEnabled: (sourceId: string, token: CancellationToken) => void,
		private readonly locationPicker: CustomizationLocationPicker,
		@IAgentPluginRepositoryService private readonly repositoryService: IAgentPluginRepositoryService,
		@IPluginGitService private readonly pluginGitService: IPluginGitService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IProgressService private readonly progressService: IProgressService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
	) { }

	async install(resource: ICustomizationMarketplaceResource, enabledToken: CancellationToken): Promise<SkillInstallationTarget> {
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
		if (!targetFolder || targetFolder.source !== 'local' && targetFolder.source !== 'user') {
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
		let resolvedRevision: string | undefined;
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('customizationMarketplace.installingSkill', "Installing skill '{0}'", resource.displayName),
				cancellable: true,
			}, async () => {
				const resolved = await this.resolveSkillSourceDirectory(reference, sourceSegments, () => checkContext(token), token);
				const sourceDirectory = resolved.sourceDirectory;
				resolvedRevision = resolved.resolvedRevision;
				const staging = joinPath(dirname(targetDirectory), `.customization-marketplace-${generateUuid()}`);
				try {
					installedFiles = await this.copySkill(sourceDirectory, staging, () => checkContext(token), token);
					const revisionAfterCopy = (await this.pluginGitService.revParse(resolved.repository, 'HEAD')).toLowerCase();
					if (revisionAfterCopy !== resolvedRevision) {
						throw new Error(localize('customizationMarketplace.skillRevisionChangedDuringInstall', "The skill source changed while it was being copied. Try installing it again."));
					}
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
					await this.cleanupStaging(staging, 'installation');
				}
			}, () => cancellation.cancel());
		} finally {
			operationDisposables.dispose();
		}
		if (!installedFiles || !resolvedRevision) {
			throw new Error(localize('customizationMarketplace.skillInstallIncomplete', "The skill could not be installed. Review the installation error and try again."));
		}
		return {
			kind: 'skill',
			uri: joinPath(target, SKILL_FILENAME),
			files: installedFiles,
			resolvedRevision,
			source: targetFolder.source,
			harness,
			sourceFolder: targetFolder.uri,
			destinationGroupId: targetFolder.destinationGroupId,
			project: targetFolder.source === 'local' ? project : undefined,
			session: targetFolder.source === 'local' && !project ? session : undefined,
		};
	}

	async repair(record: ICustomizationMarketplaceInstallationRecord, enabledToken: CancellationToken, isApplicable: () => boolean): Promise<void> {
		if (record.target.kind !== 'skill' || record.installation.kind !== 'skill') {
			throw new Error(localize('customizationMarketplace.invalidSkillRecord', "The recorded skill installation is invalid."));
		}
		const target = record.target;
		const installation = record.installation;
		this.getSkillSource(installation);
		const reference = parseMarketplaceReference(`${installation.repository}#${target.resolvedRevision}`);
		if (!reference || reference.kind !== MarketplaceReferenceKind.GitHubShorthand) {
			throw new Error(localize('customizationMarketplace.invalidSkillRecord', "The recorded skill installation is invalid."));
		}
		const targetRoot = dirname(target.uri);
		const confirmation = await this.dialogService.confirm({
			type: 'question',
			message: localize('customizationMarketplace.confirmSkillRepair', "Repair '{0}'?", record.displayName),
			detail: localize('customizationMarketplace.confirmSkillRepairDetail', "Missing files will be restored without overwriting existing files.\n\nSource: {0}\nRevision: {1}\nDestination: {2}",
				`${installation.repository}/${installation.path}`, target.resolvedRevision, this.labelService.getUriLabel(targetRoot)),
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
			if (token.isCancellationRequested || harness !== this.harnessService.activeHarness.get() || !isEqual(session, this.harnessService.activeSessionResource.get()) || !isEqual(project, this.workspaceService.getActiveProjectRoot()) || !isApplicable()) {
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
				const resolved = await this.resolvePinnedSkillSourceDirectory(reference, installation.path, target.resolvedRevision, () => checkContext(token), token);
				const staging = joinPath(dirname(targetRoot), `.customization-marketplace-${generateUuid()}`);
				try {
					const stagedFiles = new Set(await this.copySkill(resolved.sourceDirectory, staging, () => checkContext(token), token));
					const revisionAfterCopy = (await this.pluginGitService.revParse(resolved.repository, 'HEAD')).toLowerCase();
					if (revisionAfterCopy !== target.resolvedRevision) {
						throw new Error(localize('customizationMarketplace.skillRepairRevisionMismatch', "The recorded skill revision is no longer available from its source."));
					}
					for (const relativePath of target.files) {
						if (!stagedFiles.has(relativePath)) {
							throw new Error(localize('customizationMarketplace.skillRepairSourceChanged', "The recorded skill files are no longer available from the original source."));
						}
						const pathSegments = relativePath.split('/');
						const destination = joinPath(targetRoot, ...pathSegments);
						if (await this.fileService.exists(destination)) {
							const stat = await this.fileService.resolve(destination);
							if (!stat.isFile || stat.isSymbolicLink) {
								throw new Error(localize('customizationMarketplace.skillRepairConflict', "A recorded skill file cannot be repaired because its destination is occupied by another file type."));
							}
							continue;
						}
						await this.ensureSafeSkillRepairParent(targetRoot, pathSegments.slice(0, -1));
						checkContext(token);
						await this.fileService.copy(joinPath(staging, ...pathSegments), destination, false);
					}
				} finally {
					await this.cleanupStaging(staging, 'repair');
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

	private async resolveSkillSourceDirectory(reference: IMarketplaceReference, sourceSegments: readonly string[], checkContext: () => void, token: CancellationToken): Promise<{ readonly repository: URI; readonly sourceDirectory: URI; readonly resolvedRevision: string }> {
		const repository = await this.repositoryService.ensureRepository(reference, { token });
		checkContext();
		const resolvedRevision = (await this.pluginGitService.revParse(repository, 'HEAD')).toLowerCase();
		if (!/^[0-9a-f]{40}$/.test(resolvedRevision)) {
			throw new Error(localize('customizationMarketplace.invalidSkillRevision', "The skill source did not resolve to an immutable Git revision."));
		}
		const requestedRevision = reference.ref?.toLowerCase();
		if (requestedRevision && /^[0-9a-f]{40}$/.test(requestedRevision) && resolvedRevision !== requestedRevision) {
			throw new Error(localize('customizationMarketplace.skillRepairRevisionMismatch', "The recorded skill revision is no longer available from its source."));
		}
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
		return { repository, sourceDirectory, resolvedRevision };
	}

	private async resolvePinnedSkillSourceDirectory(reference: IMarketplaceReference, path: string, resolvedRevision: string, checkContext: () => void, token: CancellationToken): Promise<{ readonly repository: URI; readonly sourceDirectory: URI; readonly resolvedRevision: string }> {
		if (!reference.githubRepo) {
			throw new Error(localize('customizationMarketplace.invalidSkillRecord', "The recorded skill installation is invalid."));
		}
		const plugin: IMarketplacePlugin = {
			name: reference.displayLabel,
			description: '',
			version: '',
			source: path,
			sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: reference.githubRepo, sha: resolvedRevision, path: path || undefined },
			marketplace: reference.displayLabel,
			marketplaceReference: reference,
			marketplaceType: MarketplaceType.OpenPlugin,
		};
		const sourceDirectory = await this.repositoryService.ensurePluginSource(plugin, { token });
		checkContext();
		const repository = this.repositoryService.getPluginSource(plugin.sourceDescriptor.kind).getCleanupTarget(this.repositoryService.agentPluginsHome, plugin.sourceDescriptor);
		if (!repository) {
			throw new Error(localize('customizationMarketplace.invalidSkillRecord', "The recorded skill installation is invalid."));
		}
		const checkedOutRevision = (await this.pluginGitService.revParse(repository, 'HEAD')).toLowerCase();
		if (checkedOutRevision !== resolvedRevision) {
			throw new Error(localize('customizationMarketplace.skillRepairRevisionMismatch', "The recorded skill revision is no longer available from its source."));
		}
		const skill = await this.fileService.resolve(joinPath(sourceDirectory, SKILL_FILENAME));
		if (!skill.isFile || skill.isSymbolicLink) {
			throw new Error(localize('customizationMarketplace.missingSkillFile', "The source does not contain a regular SKILL.md file."));
		}
		return { repository, sourceDirectory, resolvedRevision };
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
		let recordPathCharacters = 0;
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
				recordPathCharacters += relativePath.length;
				if (recordPathCharacters > maxSkillRecordPathCharacters) {
					throw new Error(localize('customizationMarketplace.skillMetadataTooLarge', "The skill contains too much file metadata to install safely."));
				}
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

	private async cleanupStaging(staging: URI, operation: 'installation' | 'repair'): Promise<void> {
		try {
			if (await this.fileService.exists(staging)) {
				await this.fileService.del(staging, { recursive: true });
			}
		} catch (error) {
			this.logService.error(`[CustomizationMarketplace] Unable to clean up staged skill ${operation}`, error);
		}
	}
}
