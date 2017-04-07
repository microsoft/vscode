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
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position, IResourceInput } from 'vs/platform/editor/common/editor';

export class BackupRestorer implements IWorkbenchContribution {

	private static readonly UNTITLED_REGEX = /Untitled-\d+/;

	constructor(
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IPartService private partService: IPartService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IEditorGroupService private groupService: IEditorGroupService
	) {
		this.restoreBackups();
	}

	private restoreBackups(): void {
		if (!this.environmentService.isExtensionDevelopment) {
			this.partService.joinCreation().then(() => {
				this.doRestoreBackups().done(null, errors.onUnexpectedError);
			});
		}
	}

	private doRestoreBackups(): TPromise<any> {

		// Find all files and untitled with backups
		return this.backupFileService.getWorkspaceFileBackups().then(backups => {

			// Resolve backups that are opened in stacks model
			return this.doResolveOpenedBackups(backups).then(unresolved => {

				// Some failed to restore or were not opened at all so we open and resolve them manually
				if (unresolved.length > 0) {
					return this.doOpenEditors(unresolved).then(() => this.doResolveOpenedBackups(unresolved));
				}
				return undefined;
			});
		});
	}

	private doResolveOpenedBackups(backups: URI[]): TPromise<URI[]> {
		const stacks = this.groupService.getStacksModel();

		const restorePromises: TPromise<any>[] = [];
		const unresolved: URI[] = [];

		backups.forEach(backup => {
			if (stacks.isOpen(backup)) {
				if (backup.scheme === 'file') {
					restorePromises.push(this.textModelResolverService.createModelReference(backup).then(null, () => unresolved.push(backup)));
				} else if (backup.scheme === 'untitled') {
					restorePromises.push(this.untitledEditorService.get(backup).resolve().then(null, () => unresolved.push(backup)));
				}
			} else {
				unresolved.push(backup);
			}
		});

		return TPromise.join(restorePromises).then(() => unresolved, () => unresolved);
	}

	private doOpenEditors(inputs: URI[]): TPromise<void> {
		const stacks = this.groupService.getStacksModel();
		const hasOpenedEditors = stacks.groups.length > 0;

		return TPromise.join(inputs.map(resource => this.resolveInput(resource))).then(inputs => {
			const openEditorsArgs = inputs.map((input, index) => {
				return { input, options: { pinned: true, preserveFocus: true, inactive: index > 0 || hasOpenedEditors }, position: Position.ONE };
			});

			// Open all remaining backups as editors and resolve them to load their backups
			return this.editorService.openEditors(openEditorsArgs).then(() => void 0);
		});
	}

	private resolveInput(resource: URI): TPromise<IResourceInput> {
		if (resource.scheme === 'untitled' && !BackupRestorer.UNTITLED_REGEX.test(resource.fsPath)) {
			// TODO@Ben debt: instead of guessing if an untitled file has an associated file path or not
			// this information should be provided by the backup service and stored as meta data within
			return TPromise.as({
				resource: this.untitledEditorService.createOrGet(URI.file(resource.fsPath)).getResource()
			});
		}

		return TPromise.as({ resource });
	}

	public getId(): string {
		return 'vs.backup.backupRestorer';
	}
}