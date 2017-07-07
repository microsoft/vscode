/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IUntitledEditorService, UNTITLED_SCHEMA } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import errors = require('vs/base/common/errors');
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position, IResourceInput, IUntitledResourceInput } from 'vs/platform/editor/common/editor';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { Schemas } from 'vs/base/common/network';

export class BackupRestorer implements IWorkbenchContribution {

	private static readonly UNTITLED_REGEX = /Untitled-\d+/;

	constructor(
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IPartService private partService: IPartService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IEditorGroupService private groupService: IEditorGroupService
	) {
		this.restoreBackups();
	}

	private restoreBackups(): void {
		if (this.backupFileService.backupEnabled) {
			this.partService.joinCreation().then(() => {
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
				if (backup.scheme === Schemas.file) {
					restorePromises.push(this.textFileService.models.loadOrCreate(backup).then(null, () => unresolved.push(backup)));
				} else if (backup.scheme === UNTITLED_SCHEMA) {
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

		if (resource.scheme === UNTITLED_SCHEMA && !BackupRestorer.UNTITLED_REGEX.test(resource.fsPath)) {
			// TODO@Ben debt: instead of guessing if an untitled file has an associated file path or not
			// this information should be provided by the backup service and stored as meta data within
			return { filePath: resource.fsPath, options };
		}

		return { resource, options };
	}

	public getId(): string {
		return 'vs.backup.backupRestorer';
	}
}