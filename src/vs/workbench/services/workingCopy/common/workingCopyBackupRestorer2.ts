/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IEditorInput } from 'vs/workbench/common/editor';
import { Promises } from 'vs/base/common/async';
import { IWorkingCopyIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { Disposable } from 'vs/base/common/lifecycle';

export class WorkingCopyBackupRestorer extends Disposable implements IWorkbenchContribution {

	private readonly unrestoredBackups = new Set<IWorkingCopyIdentifier>();
	private readonly whenReady: Promise<void>;

	constructor(
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkingCopyEditorService private readonly workingCopyEditorService: IWorkingCopyEditorService
	) {
		super();

		this.whenReady = this.resolveBackupsToRestore();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Once a handler registers, restore backups that still
		// have not yet been restored.
		this._register(this.workingCopyEditorService.onDidRegisterHandler(handler => this.restoreBackups(handler)));
	}

	private async resolveBackupsToRestore(): Promise<void> {

		// Wait for resolving backups until we are restored to reduce startup pressure
		await this.lifecycleService.when(LifecyclePhase.Restored);

		// Remember each backup that needs to restore
		for (const backup of await this.workingCopyBackupService.getBackups()) {
			this.unrestoredBackups.add(backup);
		}
	}

	private async restoreBackups(handler: IWorkingCopyEditorHandler): Promise<void> {

		// Wait for backups to be resolved
		await this.whenReady;

		// Figure out already opened editors for backups vs
		// non-opened.
		const openedEditorsForBackups: IEditorInput[] = [];
		const nonOpenedEditorsForBackups: IEditorInput[] = [];

		// Ensure each backup that can be handled has an
		// associated editor.
		const restoredBackups = new Set<IWorkingCopyIdentifier>();
		for (const unrestoredBackup of this.unrestoredBackups) {
			if (!(await handler.handles(unrestoredBackup))) {
				continue;
			}

			// Collect already opened editors for backup
			let hasOpenedEditorForBackup = false;
			for (const editor of this.editorService.editors) {
				if (handler.isOpen(unrestoredBackup, editor)) {
					openedEditorsForBackups.push(editor);
					hasOpenedEditorForBackup = true;
				}
			}

			// Otherwise, make sure to create at least one editor
			// for the backup to show
			if (!hasOpenedEditorForBackup) {
				nonOpenedEditorsForBackups.push(await handler.createEditor(unrestoredBackup));
			}

			// Remember as (potentially) restored
			restoredBackups.add(unrestoredBackup);
		}

		// Ensure editors are opened for each backup without editor
		// in the background without stealing focus
		if (nonOpenedEditorsForBackups.length > 0) {
			await this.editorService.openEditors(nonOpenedEditorsForBackups.map(nonOpenedEditorForBackup => ({
				editor: nonOpenedEditorForBackup,
				options: { pinned: true, preserveFocus: true, inactive: true }
			})));

			openedEditorsForBackups.push(...nonOpenedEditorsForBackups);
		}

		// Then, resolve each editor to make sure the working copy
		// is loaded and the dirty editor appears properly
		await Promises.settled(openedEditorsForBackups.map(openedEditorsForBackup => openedEditorsForBackup.resolve()));

		// Finally, remove all handled backups from the list
		for (const restoredBackup of restoredBackups) {
			this.unrestoredBackups.delete(restoredBackup);
		}
	}
}
