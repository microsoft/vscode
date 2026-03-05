/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IStorageService } from '../../../storage/common/storage.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';

import { IUserDataProfile } from '../../../userDataProfile/common/userDataProfile.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { areSame, IMergeResult as ISkillsMergeResult, merge } from './skillsMerge.js';
import { AbstractSynchroniser, IAcceptResult, IFileResourcePreview, IMergeResult } from '../abstractSynchronizer.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStat } from '../../../files/common/files.js';
import { Change, IRemoteUserData, ISyncData, IUserDataSyncLocalStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from '../userDataSync.js';

/**
 * Maximum size in bytes for a single skill folder.
 * Skills exceeding this limit will be skipped during sync.
 */
const MAX_SKILL_FOLDER_SIZE = 500 * 1024; // 500KB

interface ISkillsResourcePreview extends IFileResourcePreview {
	previewResult: IMergeResult;
}

interface ISkillsAcceptedResourcePreview extends IFileResourcePreview {
	acceptResult: IAcceptResult;
}

export function parseSkills(syncData: ISyncData): IStringDictionary<string> {
	return JSON.parse(syncData.content);
}

/**
 * Synchronizer class for user skill files.
 * Skills are folder-based with nested directories - each skill is a top-level
 * folder under the skills home directory. Files are synced using relative paths
 * as keys (e.g., "my-skill/SKILL.md", "my-skill/subfolder/helper.py").
 *
 * Skills are "all or nothing" - if any skill folder exceeds {@link MAX_SKILL_FOLDER_SIZE},
 * the entire skill is skipped and a warning is logged.
 */
export class SkillsSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;
	private readonly skillsFolder: URI;

	constructor(
		profile: IUserDataProfile,
		collection: string | undefined,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLocalStoreService userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		const syncResource = { syncResource: SyncResource.Skills, profile };
		super(
			syncResource,
			collection,
			fileService,
			environmentService,
			storageService,
			userDataSyncStoreService,
			userDataSyncLocalStoreService,
			userDataSyncEnablementService,
			telemetryService,
			logService,
			configurationService,
			uriIdentityService,
		);

		this.skillsFolder = profile.skillsHome;
		this._register(this.fileService.watch(environmentService.userRoamingDataHome));
		this._register(this.fileService.watch(this.skillsFolder));
		this._register(Event.filter(this.fileService.onDidFilesChange, e => e.affects(this.skillsFolder))(() => this.triggerLocalChange()));
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, isRemoteDataFromCurrentMachine: boolean): Promise<ISkillsResourcePreview[]> {
		const local = await this.getSkillsFileContents();
		const localSkills = this.toSkillContents(local);
		const remoteSkills: IStringDictionary<string> | null = remoteUserData.syncData ? this.parseSkills(remoteUserData.syncData) : null;

		lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
		const lastSyncSkills: IStringDictionary<string> | null = lastSyncUserData && lastSyncUserData.syncData ? this.parseSkills(lastSyncUserData.syncData) : null;

		if (remoteSkills) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote skills with local skills...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote skills does not exist. Synchronizing skills for the first time.`);
		}

		const mergeResult = merge(localSkills, remoteSkills, lastSyncSkills);
		return this.getResourcePreviews(mergeResult, local, remoteSkills || {}, lastSyncSkills || {});
	}

	protected async hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean> {
		const lastSync: IStringDictionary<string> | null = lastSyncUserData.syncData ? this.parseSkills(lastSyncUserData.syncData) : null;
		if (lastSync === null) {
			return true;
		}
		const local = await this.getSkillsFileContents();
		const localSkills = this.toSkillContents(local);
		const mergeResult = merge(localSkills, lastSync, lastSync);
		return Object.keys(mergeResult.remote.added).length > 0 || Object.keys(mergeResult.remote.updated).length > 0 || mergeResult.remote.removed.length > 0 || mergeResult.conflicts.length > 0;
	}

	protected async getMergeResult(resourcePreview: ISkillsResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		return resourcePreview.previewResult;
	}

	protected async getAcceptResult(resourcePreview: ISkillsResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IAcceptResult> {

		/* Accept local resource */
		if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }))) {
			return {
				content: resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : null,
				localChange: Change.None,
				remoteChange: resourcePreview.fileContent
					? resourcePreview.remoteContent !== null ? Change.Modified : Change.Added
					: Change.Deleted
			};
		}

		/* Accept remote resource */
		if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }))) {
			return {
				content: resourcePreview.remoteContent,
				localChange: resourcePreview.remoteContent !== null
					? resourcePreview.fileContent ? Change.Modified : Change.Added
					: Change.Deleted,
				remoteChange: Change.None,
			};
		}

		/* Accept preview resource */
		if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder)) {
			if (content === undefined) {
				return {
					content: resourcePreview.previewResult.content,
					localChange: resourcePreview.previewResult.localChange,
					remoteChange: resourcePreview.previewResult.remoteChange,
				};
			} else {
				return {
					content,
					localChange: content === null
						? resourcePreview.fileContent !== null ? Change.Deleted : Change.None
						: Change.Modified,
					remoteChange: content === null
						? resourcePreview.remoteContent !== null ? Change.Deleted : Change.None
						: Change.Modified
				};
			}
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [ISkillsResourcePreview, IAcceptResult][], force: boolean): Promise<void> {
		const acceptedResourcePreviews: ISkillsAcceptedResourcePreview[] = resourcePreviews.map(([resourcePreview, acceptResult]) => ({ ...resourcePreview, acceptResult }));
		if (acceptedResourcePreviews.every(({ localChange, remoteChange }) => localChange === Change.None && remoteChange === Change.None)) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing skills.`);
		}

		if (acceptedResourcePreviews.some(({ localChange }) => localChange !== Change.None)) {
			await this.updateLocalBackup(acceptedResourcePreviews);
			await this.updateLocalSkills(acceptedResourcePreviews, force);
		}

		if (acceptedResourcePreviews.some(({ remoteChange }) => remoteChange !== Change.None)) {
			remoteUserData = await this.updateRemoteSkills(acceptedResourcePreviews, remoteUserData, force);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized skills...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized skills`);
		}

		for (const { previewResource } of acceptedResourcePreviews) {
			try {
				await this.fileService.del(previewResource);
			} catch (e) { /* ignore */ }
		}
	}

	private getResourcePreviews(
		mergeResult: ISkillsMergeResult,
		localFileContent: IStringDictionary<IFileContent>,
		remote: IStringDictionary<string>,
		base: IStringDictionary<string>,
	): ISkillsResourcePreview[] {
		const resourcePreviews: Map<string, ISkillsResourcePreview> = new Map<string, ISkillsResourcePreview>();

		/* Added remotely -> add locally */
		for (const key of Object.keys(mergeResult.local.added)) {
			const previewResult: IMergeResult = {
				content: mergeResult.local.added[key],
				hasConflicts: false,
				localChange: Change.Added,
				remoteChange: Change.None,
			};
			resourcePreviews.set(key, {
				baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
				baseContent: null,
				fileContent: null,
				localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
				localContent: null,
				remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
				remoteContent: remote[key],
				previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
				previewResult,
				localChange: previewResult.localChange,
				remoteChange: previewResult.remoteChange,
				acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
			});
		}

		/* Updated remotely -> update locally */
		for (const key of Object.keys(mergeResult.local.updated)) {
			const previewResult: IMergeResult = {
				content: mergeResult.local.updated[key],
				hasConflicts: false,
				localChange: Change.Modified,
				remoteChange: Change.None,
			};
			const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
			resourcePreviews.set(key, {
				baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
				baseContent: base[key] ?? null,
				localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
				fileContent: localFileContent[key],
				localContent,
				remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
				remoteContent: remote[key],
				previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
				previewResult,
				localChange: previewResult.localChange,
				remoteChange: previewResult.remoteChange,
				acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
			});
		}

		/* Removed remotely -> remove locally */
		for (const key of mergeResult.local.removed) {
			const previewResult: IMergeResult = {
				content: null,
				hasConflicts: false,
				localChange: Change.Deleted,
				remoteChange: Change.None,
			};
			const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
			resourcePreviews.set(key, {
				baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
				baseContent: base[key] ?? null,
				localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
				fileContent: localFileContent[key],
				localContent,
				remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
				remoteContent: null,
				previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
				previewResult,
				localChange: previewResult.localChange,
				remoteChange: previewResult.remoteChange,
				acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
			});
		}

		/* Added locally -> add remotely */
		for (const key of Object.keys(mergeResult.remote.added)) {
			const previewResult: IMergeResult = {
				content: mergeResult.remote.added[key],
				hasConflicts: false,
				localChange: Change.None,
				remoteChange: Change.Added,
			};
			const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
			resourcePreviews.set(key, {
				baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
				baseContent: base[key] ?? null,
				localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
				fileContent: localFileContent[key],
				localContent,
				remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
				remoteContent: null,
				previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
				previewResult,
				localChange: previewResult.localChange,
				remoteChange: previewResult.remoteChange,
				acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
			});
		}

		/* Updated locally -> update remotely */
		for (const key of Object.keys(mergeResult.remote.updated)) {
			const previewResult: IMergeResult = {
				content: mergeResult.remote.updated[key],
				hasConflicts: false,
				localChange: Change.None,
				remoteChange: Change.Modified,
			};
			const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
			resourcePreviews.set(key, {
				baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
				baseContent: base[key] ?? null,
				localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
				fileContent: localFileContent[key],
				localContent,
				remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
				remoteContent: remote[key],
				previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
				previewResult,
				localChange: previewResult.localChange,
				remoteChange: previewResult.remoteChange,
				acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
			});
		}

		/* Removed locally -> remove remotely */
		for (const key of mergeResult.remote.removed) {
			const previewResult: IMergeResult = {
				content: null,
				hasConflicts: false,
				localChange: Change.None,
				remoteChange: Change.Deleted,
			};
			resourcePreviews.set(key, {
				baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
				baseContent: base[key] ?? null,
				localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
				fileContent: null,
				localContent: null,
				remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
				remoteContent: remote[key],
				previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
				previewResult,
				localChange: previewResult.localChange,
				remoteChange: previewResult.remoteChange,
				acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
			});
		}

		/* Conflicts */
		for (const key of mergeResult.conflicts) {
			const previewResult: IMergeResult = {
				content: base[key] ?? null,
				hasConflicts: true,
				localChange: localFileContent[key] ? Change.Modified : Change.Added,
				remoteChange: remote[key] ? Change.Modified : Change.Added
			};
			const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
			resourcePreviews.set(key, {
				baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
				baseContent: base[key] ?? null,
				localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
				fileContent: localFileContent[key] || null,
				localContent,
				remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
				remoteContent: remote[key] || null,
				previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
				previewResult,
				localChange: previewResult.localChange,
				remoteChange: previewResult.remoteChange,
				acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
			});
		}

		/* Unmodified */
		for (const key of Object.keys(localFileContent)) {
			if (!resourcePreviews.has(key)) {
				const previewResult: IMergeResult = {
					content: localFileContent[key] ? localFileContent[key].value.toString() : null,
					hasConflicts: false,
					localChange: Change.None,
					remoteChange: Change.None
				};
				const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
				resourcePreviews.set(key, {
					baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }),
					baseContent: base[key] ?? null,
					localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }),
					fileContent: localFileContent[key] || null,
					localContent,
					remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }),
					remoteContent: remote[key] || null,
					previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
					previewResult,
					localChange: previewResult.localChange,
					remoteChange: previewResult.remoteChange,
					acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })
				});
			}
		}

		return [...resourcePreviews.values()];
	}

	override async resolveContent(uri: URI): Promise<string | null> {
		if (this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' }))
			|| this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' }))
			|| this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' }))
			|| this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' }))) {
			return this.resolvePreviewContent(uri);
		}
		return null;
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const local = await this.getSkillsFileContents();
			if (Object.keys(local).length) {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

	private async updateLocalBackup(resourcePreviews: IFileResourcePreview[]): Promise<void> {
		const local: IStringDictionary<IFileContent> = {};
		for (const resourcePreview of resourcePreviews) {
			if (resourcePreview.fileContent) {
				local[this.extUri.basename(resourcePreview.localResource)] = resourcePreview.fileContent;
			}
		}
		await this.backupLocal(JSON.stringify(this.toSkillContents(local)));
	}

	private async updateLocalSkills(resourcePreviews: ISkillsAcceptedResourcePreview[], force: boolean): Promise<void> {
		for (const { fileContent, acceptResult, localResource, remoteResource, localChange } of resourcePreviews) {
			if (localChange !== Change.None) {
				const key = remoteResource ? this.extUri.basename(remoteResource) : this.extUri.basename(localResource);
				const resource = this.extUri.joinPath(this.skillsFolder, key);

				if (localChange === Change.Deleted) {
					this.logService.trace(`${this.syncResourceLogLabel}: Deleting skill file...`, key);
					await this.fileService.del(resource);
					this.logService.info(`${this.syncResourceLogLabel}: Deleted skill file`, key);
				} else if (localChange === Change.Added) {
					this.logService.trace(`${this.syncResourceLogLabel}: Creating skill file...`, key);
					await this.fileService.createFile(resource, VSBuffer.fromString(acceptResult.content!), { overwrite: force });
					this.logService.info(`${this.syncResourceLogLabel}: Created skill file`, key);
				} else {
					this.logService.trace(`${this.syncResourceLogLabel}: Updating skill file...`, key);
					await this.fileService.writeFile(resource, VSBuffer.fromString(acceptResult.content!), force ? undefined : fileContent!);
					this.logService.info(`${this.syncResourceLogLabel}: Updated skill file`, key);
				}
			}
		}
	}

	private async updateRemoteSkills(resourcePreviews: ISkillsAcceptedResourcePreview[], remoteUserData: IRemoteUserData, forcePush: boolean): Promise<IRemoteUserData> {
		const currentSkills: IStringDictionary<string> = remoteUserData.syncData ? this.parseSkills(remoteUserData.syncData) : {};
		const newSkills: IStringDictionary<string> = deepClone(currentSkills);

		for (const { acceptResult, localResource, remoteResource, remoteChange } of resourcePreviews) {
			if (remoteChange !== Change.None) {
				const key = localResource ? this.extUri.basename(localResource) : this.extUri.basename(remoteResource);
				if (remoteChange === Change.Deleted) {
					delete newSkills[key];
				} else {
					newSkills[key] = acceptResult.content!;
				}
			}
		}

		if (!areSame(currentSkills, newSkills)) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote skills...`);
			remoteUserData = await this.updateRemoteUserData(JSON.stringify(newSkills), forcePush ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote skills`);
		}
		return remoteUserData;
	}

	private parseSkills(syncData: ISyncData): IStringDictionary<string> {
		return parseSkills(syncData);
	}

	private toSkillContents(fileContents: IStringDictionary<IFileContent>): IStringDictionary<string> {
		const skills: IStringDictionary<string> = {};
		for (const key of Object.keys(fileContents)) {
			skills[key] = fileContents[key].value.toString();
		}
		return skills;
	}

	/**
	 * Reads all skill files from the skills folder recursively.
	 * Each skill is a top-level folder under skillsHome. Files within
	 * each skill folder are keyed by their relative path from skillsHome
	 * (e.g., "my-skill/SKILL.md", "my-skill/subfolder/helper.py").
	 *
	 * Skills whose total file size exceeds {@link MAX_SKILL_FOLDER_SIZE}
	 * are skipped entirely with a warning.
	 */
	private async getSkillsFileContents(): Promise<IStringDictionary<IFileContent>> {
		const skills: IStringDictionary<IFileContent> = {};
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(this.skillsFolder);
		} catch (e) {
			if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return skills;
			}
			throw e;
		}

		for (const entry of stat.children || []) {
			if (!entry.isDirectory) {
				continue;
			}

			const skillName = this.extUri.relativePath(this.skillsFolder, entry.resource)!;
			const skillFiles = await this.readFolderRecursively(entry.resource, skillName);

			// Check size limit for this skill
			let totalSize = 0;
			for (const content of Object.values(skillFiles)) {
				totalSize += content.value.byteLength;
			}

			if (totalSize > MAX_SKILL_FOLDER_SIZE) {
				this.logService.warn(`${this.syncResourceLogLabel}: Skipping skill "${skillName}" because its total size (${Math.round(totalSize / 1024)}KB) exceeds the ${Math.round(MAX_SKILL_FOLDER_SIZE / 1024)}KB limit`);
				continue;
			}

			Object.assign(skills, skillFiles);
		}

		return skills;
	}

	/**
	 * Recursively reads all files from a folder, returning them keyed
	 * by their relative path from the skills root.
	 */
	private async readFolderRecursively(folderUri: URI, relativePath: string): Promise<IStringDictionary<IFileContent>> {
		const result: IStringDictionary<IFileContent> = {};
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(folderUri);
		} catch (e) {
			if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return result;
			}
			throw e;
		}

		for (const entry of stat.children || []) {
			const entryName = this.extUri.relativePath(folderUri, entry.resource)!;
			const entryRelPath = `${relativePath}/${entryName}`;

			if (entry.isDirectory) {
				const subFiles = await this.readFolderRecursively(entry.resource, entryRelPath);
				Object.assign(result, subFiles);
			} else {
				const content = await this.fileService.readFile(entry.resource);
				result[entryRelPath] = content;
			}
		}

		return result;
	}
}
