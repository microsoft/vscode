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
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';

export class BackupRestorer implements IWorkbenchContribution {

	constructor(
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IPartService private partService: IPartService,
		@IBackupService private backupService: IBackupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IEditorGroupService private groupService: IEditorGroupService
	) {
		if (!this.environmentService.isExtensionDevelopment) {
			this.restoreBackups();
		}
	}

	private restoreBackups(): void {

		// Wait for all editors being restored before restoring backups
		this.partService.joinCreation().then(() => {
			const stacks = this.groupService.getStacksModel();
			const hasOpenedEditors = stacks.groups.length > 0;

			// Find all files and untitled with backups
			this.backupFileService.getWorkspaceFileBackups().then(backups => {
				const restorePromises: TPromise<any>[] = [];
				const editorsToOpen: URI[] = [];

				// Restore any backup that is opened and remember those that are not yet
				backups.forEach(backup => {
					if (stacks.isOpen(backup)) {
						if (backup.scheme === 'file') {
							restorePromises.push(this.textModelResolverService.createModelReference(backup));
						} else if (backup.scheme === 'untitled') {
							restorePromises.push(this.untitledEditorService.get(backup).resolve());
						}
					} else {
						editorsToOpen.push(backup);
					}
				});

				// Restore all backups that are opened as editors
				return TPromise.join(restorePromises).then(() => {
					if (editorsToOpen.length > 0) {
						const resourceToInputs = TPromise.join(editorsToOpen.map(resource => this.editorService.createInput({ resource })));

						return resourceToInputs.then(inputs => {
							const openEditorsArgs = inputs.map((input, index) => {
								return { input, options: { pinned: true, preserveFocus: true, inactive: index > 0 || hasOpenedEditors }, position: Position.ONE };
							});

							// Open all remaining backups as editors and resolve them to load their backups
							return this.editorService.openEditors(openEditorsArgs).then(() => TPromise.join(inputs.map(input => input.resolve())));
						});
					}
				});
			}).done(null, errors.onUnexpectedError);
		});
	}

	public getId(): string {
		return 'vs.backup.backupRestorer';
	}
}