/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { AbstractJsonSynchronizer } from './abstractJsonSynchronizer.js';
import { AbstractInitializer } from './abstractSynchronizer.js';
import { IRemoteUserData, IUserDataSyncLocalStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource } from './userDataSync.js';

interface ITasksSyncContent {
	tasks?: string;
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

export class TasksSynchroniser extends AbstractJsonSynchronizer implements IUserDataSynchroniser {

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
		super(profile.tasksResource, { syncResource: SyncResource.Tasks, profile }, collection, 'tasks.json', fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
	}

	protected getContentFromSyncContent(syncContent: string): string | null {
		return getTasksContentFromSyncContent(syncContent, this.logService);
	}

	protected toSyncContent(tasks: string | null): ITasksSyncContent {
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
