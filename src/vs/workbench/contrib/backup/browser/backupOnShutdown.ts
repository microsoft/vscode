/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';

export class BackupOnShutdown extends Disposable implements IWorkbenchContribution {

	constructor(
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {

		// Lifecycle
		this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown()));
	}

	private onBeforeShutdown(): boolean {

		// Web: we cannot perform long running in the shutdown phase
		// As such we need to check sync if there are any dirty working
		// copies that have not been backed up yet and then prevent the
		// shutdown if that is the case.

		const dirtyWorkingCopies = this.workingCopyService.workingCopies.filter(workingCopy => workingCopy.isDirty());
		if (!dirtyWorkingCopies.length) {
			return false; // no dirty: no veto
		}

		if (!this.filesConfigurationService.isHotExitEnabled) {
			return true; // dirty without backup: veto
		}

		for (const dirtyWorkingCopy of dirtyWorkingCopies) {
			if (!dirtyWorkingCopy.hasBackup()) {
				console.warn('Unload prevented: pending backups');
				return true; // dirty without backup: veto
			}
		}

		return false; // dirty with backups: no veto
	}
}
