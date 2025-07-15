/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkingCopyBackupService } from '../common/workingCopyBackup.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { IWorkingCopyService } from '../common/workingCopyService.js';
import { ILifecycleService, ShutdownReason } from '../../lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { WorkingCopyBackupTracker } from '../common/workingCopyBackupTracker.js';
import { IWorkingCopyEditorService } from '../common/workingCopyEditorService.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IEditorGroupsService } from '../../editor/common/editorGroupsService.js';

export class BrowserWorkingCopyBackupTracker extends WorkingCopyBackupTracker implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.browserWorkingCopyBackupTracker';

	constructor(
		@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService logService: ILogService,
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(workingCopyBackupService, workingCopyService, logService, lifecycleService, filesConfigurationService, workingCopyEditorService, editorService, editorGroupService);
	}

	protected onFinalBeforeShutdown(reason: ShutdownReason): boolean {

		// Web: we cannot perform long running in the shutdown phase
		// As such we need to check sync if there are any modified working
		// copies that have not been backed up yet and then prevent the
		// shutdown if that is the case.

		const modifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
		if (!modifiedWorkingCopies.length) {
			return false; // nothing modified: no veto
		}

		if (!this.filesConfigurationService.isHotExitEnabled) {
			return true; // modified without backup: veto
		}

		for (const modifiedWorkingCopy of modifiedWorkingCopies) {
			if (!this.workingCopyBackupService.hasBackupSync(modifiedWorkingCopy, this.getContentVersion(modifiedWorkingCopy))) {
				this.logService.warn('Unload veto: pending backups');

				return true; // modified without backup: veto
			}
		}

		return false; // modified and backed up: no veto
	}
}
