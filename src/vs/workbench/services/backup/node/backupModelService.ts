/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IBackupService, IBackupModelService, IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextFileService, TextFileModelChangeEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';

export class BackupModelService implements IBackupModelService {

	public _serviceBrand: any;

	private toDispose: IDisposable[];

	constructor(
		@IBackupFileService private backupFileService: IBackupFileService,
		@IBackupService private backupService: IBackupService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners() {
		this.toDispose.push(this.textFileService.models.onModelContentChanged((e) => this.onTextFileModelChanged(e)));
		this.toDispose.push(this.textFileService.models.onModelSaved((e) => this.onTextFileModelClean(e)));
		this.toDispose.push(this.textFileService.models.onModelReverted((e) => this.onTextFileModelClean(e)));
	}

	private onTextFileModelChanged(event: TextFileModelChangeEvent): void {
		console.log('text file model change', event);
		if (this.backupService.isHotExitEnabled) {
			console.log('change: ' + event.resource.fsPath);
			const model = this.textFileService.models.get(event.resource);
			this.backupService.doBackup(model.getResource(), model.getValue());
		}
	}

	private onTextFileModelClean(event: TextFileModelChangeEvent): void {
		console.log('discard backup for resource ' + event.resource.fsPath);
		this.backupFileService.discardAndDeregisterResource(event.resource);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	// TODO: Move untitled file model watching here
}