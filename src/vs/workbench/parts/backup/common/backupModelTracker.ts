/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Uri from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import { IBackupService, IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextFileService, TextFileModelChangeEvent, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class BackupModelTracker implements IWorkbenchContribution {

	public _serviceBrand: any;

	private toDispose: IDisposable[];

	constructor(
		@IBackupFileService private backupFileService: IBackupFileService,
		@IBackupService private backupService: IBackupService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners() {
		if (this.environmentService.isExtensionDevelopment) {
			return;
		}

		// Listen for text file model changes
		this.toDispose.push(this.textFileService.models.onModelContentChanged((e) => this.onTextFileModelChanged(e)));
		this.toDispose.push(this.textFileService.models.onModelSaved((e) => this.discardBackup(e.resource)));
		this.toDispose.push(this.textFileService.models.onModelDisposed((e) => this.discardBackup(e)));

		// Listen for untitled model changes
		this.toDispose.push(this.untitledEditorService.onDidChangeContent((e) => this.onUntitledModelChanged(e)));
		this.toDispose.push(this.untitledEditorService.onDidDisposeModel((e) => this.discardBackup(e)));
	}

	private onTextFileModelChanged(event: TextFileModelChangeEvent): void {
		if (event.kind === StateChange.REVERTED) {
			this.discardBackup(event.resource);
		} else if (event.kind === StateChange.CONTENT_CHANGE) {
			if (this.backupService.isHotExitEnabled) {
				const model = this.textFileService.models.get(event.resource);
				this.backupFileService.backupResource(model.getResource(), model.getValue(), model.getVersionId()).done(null, errors.onUnexpectedError);
			}
		}
	}

	private onUntitledModelChanged(resource: Uri): void {
		if (this.backupService.isHotExitEnabled) {
			const input = this.untitledEditorService.get(resource);
			if (input.isDirty()) {
				input.resolve().then(model => this.backupFileService.backupResource(resource, model.getValue(), model.getVersionId())).done(null, errors.onUnexpectedError);
			} else {
				this.discardBackup(resource);
			}
		}
	}

	private discardBackup(resource: Uri): void {
		this.backupFileService.discardResourceBackup(resource).done(null, errors.onUnexpectedError);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	public getId(): string {
		return 'vs.backup.backupModelTracker';
	}
}