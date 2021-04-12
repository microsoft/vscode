/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { BackupFileService } from 'vs/workbench/services/backup/common/backupFileService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { joinPath } from 'vs/base/common/resources';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { BrowserBackupTracker } from 'vs/workbench/services/backup/browser/backupTracker';

export class BrowserBackupFileService extends BackupFileService {

	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService
	) {
		super(joinPath(environmentService.userRoamingDataHome, 'Backups', contextService.getWorkspace().id), fileService, logService);
	}
}

// Register Service
registerSingleton(IBackupFileService, BrowserBackupFileService);

// Register Backup Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BrowserBackupTracker, LifecyclePhase.Starting);
