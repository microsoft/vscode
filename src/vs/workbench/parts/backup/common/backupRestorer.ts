/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import errors = require('vs/base/common/errors');
import { IBackupService, IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { FileEditorInput } from 'vs/workbench/parts/files/common/files';

// TODO@ben TODO@tyriar this should restore any backup that exists on disk and not rely
// on the editors to be restored already in the stacks model. For that a method is needed
// to get all backups that exist on disk.
export class BackupRestorer implements IWorkbenchContribution {

	constructor(
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IPartService private partService: IPartService,
		@IBackupService private backupService: IBackupService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@IEditorGroupService private groupService: IEditorGroupService
	) {
		if (!this.environmentService.isExtensionDevelopment) {
			this.restoreBackups();
		}
	}

	private restoreBackups(): void {

		// Wait for all editors being restored before restoring backups
		this.partService.joinCreation().then(() => {

			// Resolve all untitled so that their backups get loaded
			TPromise.join(this.untitledEditorService.getAll().map(untitled => untitled.resolve())).done(null, errors.onUnexpectedError);

			// TODO@Ben enable generally once we can get a list of backups quickly
			if (this.backupService.isHotExitEnabled) {
				const fileResources: { [resource: string]: FileEditorInput } = Object.create(null);
				this.groupService.getStacksModel().groups.forEach(group => {
					const editors = group.getEditors();
					editors.forEach(editor => {
						if (editor instanceof FileEditorInput) {
							fileResources[editor.getResource().toString()] = editor;
						}
					});
				});

				TPromise.join(Object.keys(fileResources).map(resource => {
					return this.backupFileService.hasBackup(URI.parse(resource)).then(hasBackup => {
						if (hasBackup) {
							return fileResources[resource].resolve();
						}
					});
				})).done(null, errors.onUnexpectedError);
			}
		});
	}

	public getId(): string {
		return 'vs.backup.backupRestorer';
	}
}