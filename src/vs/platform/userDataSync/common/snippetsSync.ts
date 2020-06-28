/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	IUserDataSyncStoreService, IUserDataSyncLogService, IUserDataSynchroniser, SyncResource, IUserDataSyncResourceEnablementService, IUserDataSyncBackupStoreService,
	Conflict, USER_DATA_SYNC_SCHEME, ISyncResourceHandle, IRemoteUserData, ISyncData, IResourcePreview
} from 'vs/platform/userDataSync/common/userDataSync';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService, FileChangesEvent, IFileStat, IFileContent, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { AbstractSynchroniser, ISyncResourcePreview } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStringDictionary } from 'vs/base/common/collections';
import { URI } from 'vs/base/common/uri';
import { joinPath, extname, relativePath, isEqualOrParent, isEqual, basename, dirname } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { merge, IMergeResult } from 'vs/platform/userDataSync/common/snippetsMerge';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStorageService } from 'vs/platform/storage/common/storage';

interface ISinppetsSyncPreview extends ISyncResourcePreview {
	readonly local: IStringDictionary<IFileContent>;
	readonly added: IStringDictionary<string>;
	readonly updated: IStringDictionary<string>;
	readonly removed: string[];
	readonly conflicts: Conflict[];
	readonly resolvedConflicts: IStringDictionary<string | null>;
	readonly remote: IStringDictionary<string> | null;
}

export class SnippetsSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;
	private readonly snippetsFolder: URI;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncResourceEnablementService userDataSyncResourceEnablementService: IUserDataSyncResourceEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(SyncResource.Snippets, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncResourceEnablementService, telemetryService, logService, configurationService);
		this.snippetsFolder = environmentService.snippetsHome;
		this._register(this.fileService.watch(environmentService.userRoamingDataHome));
		this._register(this.fileService.watch(this.snippetsFolder));
		this._register(this.fileService.onDidFilesChange(e => this.onFileChanges(e)));
	}

	private onFileChanges(e: FileChangesEvent): void {
		if (!e.changes.some(change => isEqualOrParent(change.resource, this.snippetsFolder))) {
			return;
		}
		this.triggerLocalChange();
	}

	protected async generatePullPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<ISinppetsSyncPreview> {
		if (remoteUserData.syncData !== null) {
			const local = await this.getSnippetsFileContents();
			const localSnippets = this.toSnippetsContents(local);
			const remoteSnippets = this.parseSnippets(remoteUserData.syncData);
			const mergeResult = merge(localSnippets, remoteSnippets, localSnippets);
			const { added, updated, remote, removed } = mergeResult;
			return {
				remoteUserData, lastSyncUserData,
				added, removed, updated, remote, local,
				hasLocalChanged: Object.keys(added).length > 0 || removed.length > 0 || Object.keys(updated).length > 0,
				hasRemoteChanged: remote !== null,
				conflicts: [], resolvedConflicts: {}, hasConflicts: false,
				isLastSyncFromCurrentMachine: false,
				resourcePreviews: this.getResourcePreviews(mergeResult)
			};
		} else {
			return {
				remoteUserData, lastSyncUserData,
				added: {}, removed: [], updated: {}, remote: null, local: {},
				hasLocalChanged: false,
				hasRemoteChanged: false,
				conflicts: [], resolvedConflicts: {}, hasConflicts: false,
				isLastSyncFromCurrentMachine: false,
				resourcePreviews: []
			};
		}
	}

	protected async generatePushPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<ISinppetsSyncPreview> {
		const local = await this.getSnippetsFileContents();
		const localSnippets = this.toSnippetsContents(local);
		const mergeResult = merge(localSnippets, null, null);
		const { added, updated, remote, removed } = mergeResult;
		return {
			added, removed, updated, remote, remoteUserData, local, lastSyncUserData, conflicts: [], resolvedConflicts: {},
			hasLocalChanged: Object.keys(added).length > 0 || removed.length > 0 || Object.keys(updated).length > 0,
			hasRemoteChanged: remote !== null,
			isLastSyncFromCurrentMachine: false,
			hasConflicts: false,
			resourcePreviews: this.getResourcePreviews(mergeResult)
		};
	}

	protected async generateReplacePreview(syncData: ISyncData, remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<ISinppetsSyncPreview> {
		const local = await this.getSnippetsFileContents();
		const localSnippets = this.toSnippetsContents(local);
		const snippets = this.parseSnippets(syncData);
		const mergeResult = merge(localSnippets, snippets, localSnippets);
		const { added, updated, removed } = mergeResult;
		return {
			added, removed, updated, remote: snippets, remoteUserData, local, lastSyncUserData, conflicts: [], resolvedConflicts: {}, hasConflicts: false,
			hasLocalChanged: Object.keys(added).length > 0 || removed.length > 0 || Object.keys(updated).length > 0,
			hasRemoteChanged: true,
			isLastSyncFromCurrentMachine: false,
			resourcePreviews: this.getResourcePreviews(mergeResult)
		};
	}

	protected async generatePreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken = CancellationToken.None): Promise<ISinppetsSyncPreview> {
		const local = await this.getSnippetsFileContents();
		return this.doGeneratePreview(local, remoteUserData, lastSyncUserData, {}, token);
	}

	private async doGeneratePreview(local: IStringDictionary<IFileContent>, remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resolvedConflicts: IStringDictionary<string | null> = {}, token: CancellationToken = CancellationToken.None): Promise<ISinppetsSyncPreview> {
		const localSnippets = this.toSnippetsContents(local);
		const remoteSnippets: IStringDictionary<string> | null = remoteUserData.syncData ? this.parseSnippets(remoteUserData.syncData) : null;
		const isLastSyncFromCurrentMachine = await this.isLastSyncFromCurrentMachine(remoteUserData);

		let lastSyncSnippets: IStringDictionary<string> | null = null;
		if (lastSyncUserData === null) {
			if (isLastSyncFromCurrentMachine) {
				lastSyncSnippets = remoteUserData.syncData ? this.parseSnippets(remoteUserData.syncData) : null;
			}
		} else {
			lastSyncSnippets = lastSyncUserData.syncData ? this.parseSnippets(lastSyncUserData.syncData) : null;
		}

		if (remoteSnippets) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote snippets with local snippets...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote snippets does not exist. Synchronizing snippets for the first time.`);
		}

		const mergeResult = merge(localSnippets, remoteSnippets, lastSyncSnippets, resolvedConflicts);
		const resourcePreviews = this.getResourcePreviews(mergeResult);

		const conflicts: Conflict[] = [];
		for (const key of mergeResult.conflicts) {
			const localPreview = joinPath(this.syncPreviewFolder, key);
			conflicts.push({ local: localPreview, remote: localPreview.with({ scheme: USER_DATA_SYNC_SCHEME }) });
			const content = local[key];
			if (!token.isCancellationRequested) {
				await this.fileService.writeFile(localPreview, content ? content.value : VSBuffer.fromString(''));
			}
		}

		for (const conflict of this.conflicts) {
			// clear obsolete conflicts
			if (!conflicts.some(({ local }) => isEqual(local, conflict.local))) {
				try {
					await this.fileService.del(conflict.local);
				} catch (error) {
					// Ignore & log
					this.logService.error(error);
				}
			}
		}

		this.setConflicts(conflicts);

		return {
			remoteUserData, local,
			lastSyncUserData,
			added: mergeResult.added,
			removed: mergeResult.removed,
			updated: mergeResult.updated,
			conflicts,
			hasConflicts: conflicts.length > 0,
			remote: mergeResult.remote,
			resolvedConflicts,
			hasLocalChanged: Object.keys(mergeResult.added).length > 0 || mergeResult.removed.length > 0 || Object.keys(mergeResult.updated).length > 0,
			hasRemoteChanged: mergeResult.remote !== null,
			isLastSyncFromCurrentMachine,
			resourcePreviews
		};
	}

	protected async updatePreviewWithConflict(preview: ISinppetsSyncPreview, conflictResource: URI, content: string, token: CancellationToken): Promise<ISinppetsSyncPreview> {
		const conflict = this.conflicts.filter(({ local, remote }) => isEqual(local, conflictResource) || isEqual(remote, conflictResource))[0];
		if (conflict) {
			const key = relativePath(this.syncPreviewFolder, conflict.local)!;
			preview.resolvedConflicts[key] = content || null;
			preview = await this.doGeneratePreview(preview.local, preview.remoteUserData, preview.lastSyncUserData, preview.resolvedConflicts, token);
		}
		return preview;
	}

	protected async applyPreview(preview: ISinppetsSyncPreview, forcePush: boolean): Promise<void> {
		let { added, removed, updated, local, remote, remoteUserData, lastSyncUserData, hasLocalChanged, hasRemoteChanged } = preview;

		if (!hasLocalChanged && !hasRemoteChanged) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing snippets.`);
		}

		if (hasLocalChanged) {
			// back up all snippets
			await this.backupLocal(JSON.stringify(this.toSnippetsContents(local)));
			await this.updateLocalSnippets(added, removed, updated, local);
		}

		if (remote) {
			// update remote
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote snippets...`);
			const content = JSON.stringify(remote);
			remoteUserData = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote snippets`);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized snippets...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized snippets`);
		}

	}

	private getResourcePreviews(mergeResult: IMergeResult): IResourcePreview[] {
		const resourcePreviews: IResourcePreview[] = [];
		for (const key of Object.keys(mergeResult.added)) {
			resourcePreviews.push({
				remoteResource: joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME }),
				hasConflicts: false,
				hasLocalChanged: true,
				hasRemoteChanged: false
			});
		}
		for (const key of Object.keys(mergeResult.updated)) {
			resourcePreviews.push({
				remoteResource: joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME }),
				localResouce: joinPath(this.snippetsFolder, key),
				hasConflicts: false,
				hasLocalChanged: true,
				hasRemoteChanged: true
			});
		}
		for (const key of mergeResult.removed) {
			resourcePreviews.push({
				localResouce: joinPath(this.snippetsFolder, key),
				hasConflicts: false,
				hasLocalChanged: true,
				hasRemoteChanged: false
			});
		}
		for (const key of mergeResult.conflicts) {
			resourcePreviews.push({
				localResouce: joinPath(this.snippetsFolder, key),
				remoteResource: joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME }),
				previewResource: joinPath(this.syncPreviewFolder, key),
				hasConflicts: true,
				hasLocalChanged: true,
				hasRemoteChanged: true
			});
		}

		return resourcePreviews;
	}

	async stop(): Promise<void> {
		await this.clearConflicts();
		return super.stop();
	}

	async getAssociatedResources({ uri }: ISyncResourceHandle): Promise<{ resource: URI, comparableResource?: URI }[]> {
		let content = await super.resolveContent(uri);
		if (content) {
			const syncData = this.parseSyncData(content);
			if (syncData) {
				const snippets = this.parseSnippets(syncData);
				const result = [];
				for (const snippet of Object.keys(snippets)) {
					const resource = joinPath(uri, snippet);
					const comparableResource = joinPath(this.snippetsFolder, snippet);
					const exists = await this.fileService.exists(comparableResource);
					result.push({ resource, comparableResource: exists ? comparableResource : undefined });
				}
				return result;
			}
		}
		return [];
	}

	async resolveContent(uri: URI): Promise<string | null> {
		if (isEqualOrParent(uri.with({ scheme: this.syncFolder.scheme }), this.syncPreviewFolder)) {
			return this.resolvePreviewContent(uri);
		}
		let content = await super.resolveContent(uri);
		if (content) {
			return content;
		}
		content = await super.resolveContent(dirname(uri));
		if (content) {
			const syncData = this.parseSyncData(content);
			if (syncData) {
				const snippets = this.parseSnippets(syncData);
				return snippets[basename(uri)] || null;
			}
		}
		return null;
	}

	private async resolvePreviewContent(conflictResource: URI): Promise<string | null> {
		const syncPreview = await this.getSyncPreviewInProgress();
		if (syncPreview) {
			const key = relativePath(this.syncPreviewFolder, conflictResource.with({ scheme: this.syncPreviewFolder.scheme }))!;
			if (conflictResource.scheme === this.syncPreviewFolder.scheme) {
				return (syncPreview as ISinppetsSyncPreview).local[key] ? (syncPreview as ISinppetsSyncPreview).local[key].value.toString() : null;
			} else if (syncPreview.remoteUserData && syncPreview.remoteUserData.syncData) {
				const snippets = this.parseSnippets(syncPreview.remoteUserData.syncData);
				return snippets[key] || null;
			}
		}
		return null;
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const localSnippets = await this.getSnippetsFileContents();
			if (Object.keys(localSnippets).length) {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

	private async clearConflicts(): Promise<void> {
		if (this.conflicts.length) {
			await Promise.all(this.conflicts.map(({ local }) => this.fileService.del(local)));
			this.setConflicts([]);
		}
	}

	private async updateLocalSnippets(added: IStringDictionary<string>, removed: string[], updated: IStringDictionary<string>, local: IStringDictionary<IFileContent>): Promise<void> {
		for (const key of removed) {
			const resource = joinPath(this.snippetsFolder, key);
			this.logService.trace(`${this.syncResourceLogLabel}: Deleting snippet...`, basename(resource));
			await this.fileService.del(resource);
			this.logService.info(`${this.syncResourceLogLabel}: Deleted snippet`, basename(resource));
		}

		for (const key of Object.keys(added)) {
			const resource = joinPath(this.snippetsFolder, key);
			this.logService.trace(`${this.syncResourceLogLabel}: Creating snippet...`, basename(resource));
			await this.fileService.createFile(resource, VSBuffer.fromString(added[key]), { overwrite: false });
			this.logService.info(`${this.syncResourceLogLabel}: Created snippet`, basename(resource));
		}

		for (const key of Object.keys(updated)) {
			const resource = joinPath(this.snippetsFolder, key);
			this.logService.trace(`${this.syncResourceLogLabel}: Updating snippet...`, basename(resource));
			await this.fileService.writeFile(resource, VSBuffer.fromString(updated[key]), local[key]);
			this.logService.info(`${this.syncResourceLogLabel}: Updated snippet`, basename(resource));
		}
	}

	private parseSnippets(syncData: ISyncData): IStringDictionary<string> {
		return JSON.parse(syncData.content);
	}

	private toSnippetsContents(snippetsFileContents: IStringDictionary<IFileContent>): IStringDictionary<string> {
		const snippets: IStringDictionary<string> = {};
		for (const key of Object.keys(snippetsFileContents)) {
			snippets[key] = snippetsFileContents[key].value.toString();
		}
		return snippets;
	}

	private async getSnippetsFileContents(): Promise<IStringDictionary<IFileContent>> {
		const snippets: IStringDictionary<IFileContent> = {};
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(this.snippetsFolder);
		} catch (e) {
			// No snippets
			if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return snippets;
			} else {
				throw e;
			}
		}
		for (const entry of stat.children || []) {
			const resource = entry.resource;
			const extension = extname(resource);
			if (extension === '.json' || extension === '.code-snippets') {
				const key = relativePath(this.snippetsFolder, resource)!;
				const content = await this.fileService.readFile(resource);
				snippets[key] = content;
			}
		}
		return snippets;
	}
}
