/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import * as errors from 'vs/base/common/errors';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position, IResourceInput, IUntitledResourceInput } from 'vs/platform/editor/common/editor';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { Schemas } from 'vs/base/common/network';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';

export class BackupRestorer implements IWorkbenchContribution {

	private static readonly UNTITLED_REGEX = /Untitled-\d+/;

	constructor(
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IEditorGroupService private groupService: IEditorGroupService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IFileService private fileService: IFileService
	) {
		this.restoreBackups();
	}

	private restoreBackups(): void {
		if (this.backupFileService.backupEnabled) {
			this.lifecycleService.when(LifecyclePhase.Running).then(() => {
				this.doRestoreBackups().done(null, errors.onUnexpectedError);
			});
		}
	}

	private doRestoreBackups(): TPromise<URI[]> {

		// Find all files and untitled with backups
		return this.backupFileService.getWorkspaceFileBackups().then(backups => {

			// Resolve backups that are opened in stacks model
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
		const stacks = this.groupService.getStacksModel();

		const restorePromises: TPromise<any>[] = [];
		const unresolved: URI[] = [];

		backups.forEach(backup => {
			if (stacks.isOpen(backup)) {
				if (this.fileService.canHandleResource(backup)) {
					restorePromises.push(this.textFileService.models.loadOrCreate(backup).then(null, () => unresolved.push(backup)));
				} else if (backup.scheme === Schemas.untitled) {
					restorePromises.push(this.untitledEditorService.loadOrCreate({ resource: backup }).then(null, () => unresolved.push(backup)));
				}
			} else {
				unresolved.push(backup);
			}
		});

		return TPromise.join(restorePromises).then(() => unresolved, () => unresolved);
	}

	private doOpenEditors(resources: URI[]): TPromise<void> {
		const stacks = this.groupService.getStacksModel();
		const hasOpenedEditors = stacks.groups.length > 0;
		const inputs = resources.map((resource, index) => this.resolveInput(resource, index, hasOpenedEditors));

		// Open all remaining backups as editors and resolve them to load their backups
		return this.editorService.openEditors(inputs.map(input => { return { input, position: Position.ONE }; })).then(() => void 0);
	}

	private resolveInput(resource: URI, index: number, hasOpenedEditors: boolean): IResourceInput | IUntitledResourceInput {
		const options = { pinned: true, preserveFocus: true, inactive: index > 0 || hasOpenedEditors };

		if (resource.scheme === Schemas.untitled && !BackupRestorer.UNTITLED_REGEX.test(resource.fsPath)) {
			return { filePath: resource.fsPath, options };
		}

		return { resource, options };
	}
}