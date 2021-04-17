/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BackupFileService } from 'vs/workbench/services/backup/common/backupFileService';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { NativeBackupTracker } from 'vs/workbench/services/backup/electron-sandbox/backupTracker';

export class NativeBackupFileService extends BackupFileService {

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService
	) {
		super(environmentService.configuration.backupPath ? URI.file(environmentService.configuration.backupPath).with({ scheme: environmentService.userRoamingDataHome.scheme }) : undefined, fileService, logService);
	}
}

// Register Service
registerSingleton(IBackupFileService, NativeBackupFileService);

// Register Backup Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NativeBackupTracker, LifecyclePhase.Starting);
