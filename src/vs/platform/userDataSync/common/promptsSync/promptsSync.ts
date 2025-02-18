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
import { areSame, IMergeResult as IPromptsMergeResult, merge } from './promptsMerge.js';
import { AbstractSynchroniser, IAcceptResult, IFileResourcePreview, IMergeResult } from '../abstractSynchronizer.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStat } from '../../../files/common/files.js';
import { Change, IRemoteUserData, ISyncData, IUserDataSyncLocalStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from '../userDataSync.js';

interface IPromptsResourcePreview extends IFileResourcePreview {
	previewResult: IMergeResult;
}

interface IPromptsAcceptedResourcePreview extends IFileResourcePreview {
	acceptResult: IAcceptResult;
}

export function parsePrompts(syncData: ISyncData): IStringDictionary<string> {
	return JSON.parse(syncData.content);
}

/**
 * Synchronizer class for the global prompt files.
 * Adopted from {@link SnippetsSynchroniser}.
 */
export class PromptsSynchronizer extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;
	private readonly promptsFolder: URI;

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
		const syncResource = { syncResource: SyncResource.Prompts, profile };
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

		this.promptsFolder = profile.promptsHome;
		this._register(this.fileService.watch(environmentService.userRoamingDataHome));
		this._register(this.fileService.watch(this.promptsFolder));
		this._register(Event.filter(this.fileService.onDidFilesChange, e => e.affects(this.promptsFolder))(() => this.triggerLocalChange()));
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, isRemoteDataFromCurrentMachine: boolean): Promise<IPromptsResourcePreview[]> {
		const local = await this.getPromptsFileContents();
		const localPrompts = this.toPromptContents(local);
		const remotePrompts: IStringDictionary<string> | null = remoteUserData.syncData ? this.parsePrompts(remoteUserData.syncData) : null;

		// Use remote data as last sync data if last sync data does not exist and remote data is from same machine
		lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
		const lastSyncPrompts: IStringDictionary<string> | null = lastSyncUserData && lastSyncUserData.syncData ? this.parsePrompts(lastSyncUserData.syncData) : null;

		if (remotePrompts) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote prompts with local prompts...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote prompts does not exist. Synchronizing prompts for the first time.`);
		}

		const mergeResult = merge(localPrompts, remotePrompts, lastSyncPrompts);
		return this.getResourcePreviews(mergeResult, local, remotePrompts || {}, lastSyncPrompts || {});
	}

	protected async hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean> {
		const lastSync: IStringDictionary<string> | null = lastSyncUserData.syncData ? this.parsePrompts(lastSyncUserData.syncData) : null;
		if (lastSync === null) {
			return true;
		}
		const local = await this.getPromptsFileContents();
		const localPrompts = this.toPromptContents(local);
		const mergeResult = merge(localPrompts, lastSync, lastSync);
		return Object.keys(mergeResult.remote.added).length > 0 || Object.keys(mergeResult.remote.updated).length > 0 || mergeResult.remote.removed.length > 0 || mergeResult.conflicts.length > 0;
	}

	protected async getMergeResult(resourcePreview: IPromptsResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		return resourcePreview.previewResult;
	}

	protected async getAcceptResult(resourcePreview: IPromptsResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IAcceptResult> {

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

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [IPromptsResourcePreview, IAcceptResult][], force: boolean): Promise<void> {
		const accptedResourcePreviews: IPromptsAcceptedResourcePreview[] = resourcePreviews.map(([resourcePreview, acceptResult]) => ({ ...resourcePreview, acceptResult }));
		if (accptedResourcePreviews.every(({ localChange, remoteChange }) => localChange === Change.None && remoteChange === Change.None)) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing prompts.`);
		}

		if (accptedResourcePreviews.some(({ localChange }) => localChange !== Change.None)) {
			// back up all prompts
			await this.updateLocalBackup(accptedResourcePreviews);
			await this.updateLocalPrompts(accptedResourcePreviews, force);
		}

		if (accptedResourcePreviews.some(({ remoteChange }) => remoteChange !== Change.None)) {
			remoteUserData = await this.updateRemotePrompts(accptedResourcePreviews, remoteUserData, force);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized prompts...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized prompts`);
		}

		for (const { previewResource } of accptedResourcePreviews) {
			// Delete the preview
			try {
				await this.fileService.del(previewResource);
			} catch (e) { /* ignore */ }
		}

	}

	private getResourcePreviews(
		mergeResult: IPromptsMergeResult,
		localFileContent: IStringDictionary<IFileContent>,
		remote: IStringDictionary<string>,
		base: IStringDictionary<string>,
	): IPromptsResourcePreview[] {
		const resourcePreviews: Map<string, IPromptsResourcePreview> = new Map<string, IPromptsResourcePreview>();

		/* Prompts added remotely -> add locally */
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

		/* Prompts updated remotely -> update locally */
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

		/* Prompts removed remotely -> remove locally */
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

		/* Prompts added locally -> add remotely */
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

		/* Prompts updated locally -> update remotely */
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

		/* Prompts removed locally -> remove remotely */
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

		/* Prompts with conflicts */
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

		/* Unmodified Prompts */
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
			const local = await this.getPromptsFileContents();
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
		await this.backupLocal(JSON.stringify(this.toPromptContents(local)));
	}

	private async updateLocalPrompts(resourcePreviews: IPromptsAcceptedResourcePreview[], force: boolean): Promise<void> {
		for (const { fileContent, acceptResult, localResource, remoteResource, localChange } of resourcePreviews) {
			if (localChange !== Change.None) {
				const key = remoteResource ? this.extUri.basename(remoteResource) : this.extUri.basename(localResource);
				const resource = this.extUri.joinPath(this.promptsFolder, key);

				// Removed
				if (localChange === Change.Deleted) {
					this.logService.trace(`${this.syncResourceLogLabel}: Deleting prompt...`, this.extUri.basename(resource));
					await this.fileService.del(resource);
					this.logService.info(`${this.syncResourceLogLabel}: Deleted prompt`, this.extUri.basename(resource));
				}

				// Added
				else if (localChange === Change.Added) {
					this.logService.trace(`${this.syncResourceLogLabel}: Creating prompt...`, this.extUri.basename(resource));
					await this.fileService.createFile(resource, VSBuffer.fromString(acceptResult.content!), { overwrite: force });
					this.logService.info(`${this.syncResourceLogLabel}: Created prompt`, this.extUri.basename(resource));
				}

				// Updated
				else {
					this.logService.trace(`${this.syncResourceLogLabel}: Updating prompt...`, this.extUri.basename(resource));
					await this.fileService.writeFile(resource, VSBuffer.fromString(acceptResult.content!), force ? undefined : fileContent!);
					this.logService.info(`${this.syncResourceLogLabel}: Updated prompt`, this.extUri.basename(resource));
				}
			}
		}
	}

	private async updateRemotePrompts(resourcePreviews: IPromptsAcceptedResourcePreview[], remoteUserData: IRemoteUserData, forcePush: boolean): Promise<IRemoteUserData> {
		const currentPrompts: IStringDictionary<string> = remoteUserData.syncData ? this.parsePrompts(remoteUserData.syncData) : {};
		const newPrompts: IStringDictionary<string> = deepClone(currentPrompts);

		for (const { acceptResult, localResource, remoteResource, remoteChange } of resourcePreviews) {
			if (remoteChange !== Change.None) {
				const key = localResource ? this.extUri.basename(localResource) : this.extUri.basename(remoteResource);
				if (remoteChange === Change.Deleted) {
					delete newPrompts[key];
				} else {
					newPrompts[key] = acceptResult.content!;
				}
			}
		}

		if (!areSame(currentPrompts, newPrompts)) {
			// update remote
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote prompts...`);
			remoteUserData = await this.updateRemoteUserData(JSON.stringify(newPrompts), forcePush ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote prompts`);
		}
		return remoteUserData;
	}

	private parsePrompts(syncData: ISyncData): IStringDictionary<string> {
		return parsePrompts(syncData);
	}

	private toPromptContents(fileContents: IStringDictionary<IFileContent>): IStringDictionary<string> {
		const prompts: IStringDictionary<string> = {};
		for (const key of Object.keys(fileContents)) {
			prompts[key] = fileContents[key].value.toString();
		}
		return prompts;
	}

	private async getPromptsFileContents(): Promise<IStringDictionary<IFileContent>> {
		const prompts: IStringDictionary<IFileContent> = {};
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(this.promptsFolder);
		} catch (e) {
			// No prompts
			if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return prompts;
			} else {
				throw e;
			}
		}
		for (const entry of stat.children || []) {
			const resource = entry.resource;

			if (!resource.path.endsWith('.prompt.md')) {
				continue;
			}

			const key = this.extUri.relativePath(this.promptsFolder, resource)!;
			const content = await this.fileService.readFile(resource);
			prompts[key] = content;
		}

		return prompts;
	}
}
