/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
import { AbstractJsonSynchronizer } from './abstractJsonSynchronizer.js';
import { IUserDataSyncLocalStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource } from './userDataSync.js';

interface IMcpSyncContent {
	mcp?: string;
}

export function getMcpContentFromSyncContent(syncContent: string, logService: ILogService): string | null {
	try {
		const parsed = <IMcpSyncContent>JSON.parse(syncContent);
		return parsed.mcp ?? null;
	} catch (e) {
		logService.error(e);
		return null;
	}
}

export class McpSynchroniser extends AbstractJsonSynchronizer implements IUserDataSynchroniser {

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
		super(profile.mcpResource, { syncResource: SyncResource.Mcp, profile }, collection, 'mcp.json', fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
	}

	protected getContentFromSyncContent(syncContent: string): string | null {
		return getMcpContentFromSyncContent(syncContent, this.logService);
	}

	protected toSyncContent(mcp: string | null): IMcpSyncContent {
		return mcp ? { mcp } : {};
	}
}
