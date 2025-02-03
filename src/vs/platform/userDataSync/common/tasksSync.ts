/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { AbstractFileSynchroniser, AbstractInitializer, IAcceptResult, IFileResourcePreview, IMergeResult } from './abstractSynchronizer.js';
import { Change, IRemoteUserData, IUserDataSyncLocalStoreService, IUserDataSyncConfiguration, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from './userDataSync.js';

interface ITasksSyncContent {
	tasks?: string;
}

interface ITasksResourcePreview extends IFileResourcePreview {
	previewResult: IMergeResult;
}

export function getTasksContentFromSyncContent(syncContent: string, logService: ILogService): string | null {
	try {
		const parsed = <ITasksSyncContent>JSON.parse(syncContent);
		return parsed.tasks ?? null;
	} catch (e) {
		logService.error(e);
		return null;
	}
}

export class TasksSynchroniser extends AbstractFileSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;
	private readonly previewResource: URI = this.extUri.joinPath(this.syncPreviewFolder, 'tasks.json');
	private readonly baseResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
	private readonly localResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
	private readonly remoteResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
	private readonly acceptedResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });

	constructor(
		profile: IUserDataProfile,
		collection: string | undefined,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLocalStoreService userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(profile.tasksResource, { syncResource: SyncResource.Tasks, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, isRemoteDataFromCurrentMachine: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration): Promise<ITasksResourcePreview[]> {
		const remoteContent = remoteUserData.syncData ? getTasksContentFromSyncContent(remoteUserData.syncData.content, this.logService) : null;

		// Use remote data as last sync data if last sync data does not exist and remote data is from same machine
		lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
		const lastSyncContent: string | null = lastSyncUserData?.syncData ? getTasksContentFromSyncContent(lastSyncUserData.syncData.content, this.logService) : null;

		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();

		let content: string | null = null;
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;

		if (remoteUserData.syncData) {
			const localContent = fileContent ? fileContent.value.toString() : null;
			if (!lastSyncContent // First time sync
				|| lastSyncContent !== localContent // Local has forwarded
				|| lastSyncContent !== remoteContent // Remote has forwarded
			) {
				this.logService.trace(`${this.syncResourceLogLabel}: Merging remote tasks with local tasks...`);
				const result = merge(localContent, remoteContent, lastSyncContent);
				content = result.content;
				hasConflicts = result.hasConflicts;
				hasLocalChanged = result.hasLocalChanged;
				hasRemoteChanged = result.hasRemoteChanged;
			}
		}

		// First time syncing to remote
		else if (fileContent) {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote tasks does not exist. Synchronizing tasks for the first time.`);
			content = fileContent.value.toString();
			hasRemoteChanged = true;
		}

		const previewResult: IMergeResult = {
			content: hasConflicts ? lastSyncContent : content,
			localChange: hasLocalChanged ? fileContent ? Change.Modified : Change.Added : Change.None,
			remoteChange: hasRemoteChanged ? Change.Modified : Change.None,
			hasConflicts
		};

		const localContent = fileContent ? fileContent.value.toString() : null;
		return [{
			fileContent,

			baseResource: this.baseResource,
			baseContent: lastSyncContent,

			localResource: this.localResource,
			localContent,
			localChange: previewResult.localChange,

			remoteResource: this.remoteResource,
			remoteContent,
			remoteChange: previewResult.remoteChange,

			previewResource: this.previewResource,
			previewResult,
			acceptedResource: this.acceptedResource,
		}];

	}

	protected async hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean> {
		const lastSyncContent: string | null = lastSyncUserData?.syncData ? getTasksContentFromSyncContent(lastSyncUserData.syncData.content, this.logService) : null;
		if (lastSyncContent === null) {
			return true;
		}

		const fileContent = await this.getLocalFileContent();
		const localContent = fileContent ? fileContent.value.toString() : null;
		const result = merge(localContent, lastSyncContent, lastSyncContent);
		return result.hasLocalChanged || result.hasRemoteChanged;
	}

	protected async getMergeResult(resourcePreview: ITasksResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		return resourcePreview.previewResult;
	}

	protected async getAcceptResult(resourcePreview: ITasksResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IAcceptResult> {

		/* Accept local resource */
		if (this.extUri.isEqual(resource, this.localResource)) {
			return {
				content: resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : null,
				localChange: Change.None,
				remoteChange: Change.Modified,
			};
		}

		/* Accept remote resource */
		if (this.extUri.isEqual(resource, this.remoteResource)) {
			return {
				content: resourcePreview.remoteContent,
				localChange: Change.Modified,
				remoteChange: Change.None,
			};
		}

		/* Accept preview resource */
		if (this.extUri.isEqual(resource, this.previewResource)) {
			if (content === undefined) {
				return {
					content: resourcePreview.previewResult.content,
					localChange: resourcePreview.previewResult.localChange,
					remoteChange: resourcePreview.previewResult.remoteChange,
				};
			} else {
				return {
					content,
					localChange: Change.Modified,
					remoteChange: Change.Modified,
				};
			}
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [ITasksResourcePreview, IAcceptResult][], force: boolean): Promise<void> {
		const { fileContent } = resourcePreviews[0][0];
		const { content, localChange, remoteChange } = resourcePreviews[0][1];

		if (localChange === Change.None && remoteChange === Change.None) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing tasks.`);
		}

		if (localChange !== Change.None) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating local tasks...`);
			if (fileContent) {
				await this.backupLocal(JSON.stringify(this.toTasksSyncContent(fileContent.value.toString())));
			}
			if (content) {
				await this.updateLocalFileContent(content, fileContent, force);
			} else {
				await this.deleteLocalFile();
			}
			this.logService.info(`${this.syncResourceLogLabel}: Updated local tasks`);
		}

		if (remoteChange !== Change.None) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote tasks...`);
			const remoteContents = JSON.stringify(this.toTasksSyncContent(content));
			remoteUserData = await this.updateRemoteUserData(remoteContents, force ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote tasks`);
		}

		// Delete the preview
		try {
			await this.fileService.del(this.previewResource);
		} catch (e) { /* ignore */ }

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized tasks...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized tasks`);
		}

	}

	async hasLocalData(): Promise<boolean> {
		return this.fileService.exists(this.file);
	}

	override async resolveContent(uri: URI): Promise<string | null> {
		if (this.extUri.isEqual(this.remoteResource, uri)
			|| this.extUri.isEqual(this.baseResource, uri)
			|| this.extUri.isEqual(this.localResource, uri)
			|| this.extUri.isEqual(this.acceptedResource, uri)
		) {
			return this.resolvePreviewContent(uri);
		}
		return null;
	}

	private toTasksSyncContent(tasks: string | null): ITasksSyncContent {
		return tasks ? { tasks } : {};
	}

}

export class TasksInitializer extends AbstractInitializer {

	private tasksResource = this.userDataProfilesService.defaultProfile.tasksResource;

	constructor(
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IStorageService storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(SyncResource.Tasks, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
	}

	protected async doInitialize(remoteUserData: IRemoteUserData): Promise<void> {
		const tasksContent = remoteUserData.syncData ? getTasksContentFromSyncContent(remoteUserData.syncData.content, this.logService) : null;
		if (!tasksContent) {
			this.logService.info('Skipping initializing tasks because remote tasks does not exist.');
			return;
		}

		const isEmpty = await this.isEmpty();
		if (!isEmpty) {
			this.logService.info('Skipping initializing tasks because local tasks exist.');
			return;
		}

		await this.fileService.writeFile(this.tasksResource, VSBuffer.fromString(tasksContent));

		await this.updateLastSyncUserData(remoteUserData);
	}

	private async isEmpty(): Promise<boolean> {
		return this.fileService.exists(this.tasksResource);
	}

}

function merge(originalLocalContent: string | null, originalRemoteContent: string | null, baseContent: string | null): {
	content: string | null;
	hasLocalChanged: boolean;
	hasRemoteChanged: boolean;
	hasConflicts: boolean;
} {

	/* no changes */
	if (originalLocalContent === null && originalRemoteContent === null && baseContent === null) {
		return { content: null, hasLocalChanged: false, hasRemoteChanged: false, hasConflicts: false };
	}

	/* no changes */
	if (originalLocalContent === originalRemoteContent) {
		return { content: null, hasLocalChanged: false, hasRemoteChanged: false, hasConflicts: false };
	}

	const localForwarded = baseContent !== originalLocalContent;
	const remoteForwarded = baseContent !== originalRemoteContent;

	/* no changes */
	if (!localForwarded && !remoteForwarded) {
		return { content: null, hasLocalChanged: false, hasRemoteChanged: false, hasConflicts: false };
	}

	/* local has changed and remote has not */
	if (localForwarded && !remoteForwarded) {
		return { content: originalLocalContent, hasRemoteChanged: true, hasLocalChanged: false, hasConflicts: false };
	}

	/* remote has changed and local has not */
	if (remoteForwarded && !localForwarded) {
		return { content: originalRemoteContent, hasLocalChanged: true, hasRemoteChanged: false, hasConflicts: false };
	}

	return { content: originalLocalContent, hasLocalChanged: true, hasRemoteChanged: true, hasConflicts: true };
}
