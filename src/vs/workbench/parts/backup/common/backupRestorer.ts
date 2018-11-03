/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { Schemas } from 'vs/base/common/network';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IUntitledResourceInput } from 'vs/workbench/common/editor';

export class BackupRestorer implements IWorkbenchContribution {

	private static readonly UNTITLED_REGEX = /Untitled-\d+/;

	constructor(
		@IEditorService private editorService: IEditorService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		this.restoreBackups();
	}

	private restoreBackups(): void {
		this.lifecycleService.when(LifecyclePhase.Running).then(() => this.doRestoreBackups());
	}

	private doRestoreBackups(): TPromise<URI[]> {

		// Find all files and untitled with backups
		return this.backupFileService.getWorkspaceFileBackups().then(backups => {

			// Resolve backups that are opened
			return this.doResolveOpenedBackups(backups).then(unresolved => {

				// Some failed to restore or were not opened at all so we open and resolve them manually
				if (unresolved.length > 0) {
					return this.doOpenEditors(unresolved).then(() => this.doResolveOpenedBackups(unresolved));
				}

				return void 0;
			});
		});
	}

	private doResolveOpenedBackups(backups: URI[]): TPromise<URI[]> {
		const restorePromises: TPromise<any>[] = [];
		const unresolved: URI[] = [];

		backups.forEach(backup => {
			const openedEditor = this.editorService.getOpened({ resource: backup });
			if (openedEditor) {
				restorePromises.push(openedEditor.resolve().then(null, () => unresolved.push(backup)));
			} else {
				unresolved.push(backup);
			}
		});

		return TPromise.join(restorePromises).then(() => unresolved, () => unresolved);
	}

	private doOpenEditors(resources: URI[]): TPromise<void> {
		const hasOpenedEditors = this.editorService.visibleEditors.length > 0;
		const inputs = resources.map((resource, index) => this.resolveInput(resource, index, hasOpenedEditors));

		// Open all remaining backups as editors and resolve them to load their backups
		return this.editorService.openEditors(inputs).then(() => void 0);
	}

	private resolveInput(resource: URI, index: number, hasOpenedEditors: boolean): IResourceInput | IUntitledResourceInput {
		const options = { pinned: true, preserveFocus: true, inactive: index > 0 || hasOpenedEditors };

		if (resource.scheme === Schemas.untitled && !BackupRestorer.UNTITLED_REGEX.test(resource.fsPath)) {
			return { filePath: resource.fsPath, options };
		}

		return { resource, options };
	}
}