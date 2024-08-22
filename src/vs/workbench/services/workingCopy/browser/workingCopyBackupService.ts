/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';
import { ILogService } from '../../../../platform/log/common/log';
import { WorkingCopyBackupService } from '../common/workingCopyBackupService';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IWorkingCopyBackupService } from '../common/workingCopyBackup';
import { joinPath } from '../../../../base/common/resources';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { BrowserWorkingCopyBackupTracker } from './workingCopyBackupTracker';

export class BrowserWorkingCopyBackupService extends WorkingCopyBackupService {

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
registerSingleton(IWorkingCopyBackupService, BrowserWorkingCopyBackupService, InstantiationType.Eager);

// Register Backup Tracker
registerWorkbenchContribution2(BrowserWorkingCopyBackupTracker.ID, BrowserWorkingCopyBackupTracker, WorkbenchPhase.BlockStartup);
