/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as Uri } from 'vs/base/common/uri';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextFileService, TextFileModelChangeEvent, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { CONTENT_CHANGE_EVENT_BUFFER_DELAY } from 'vs/platform/files/common/files';
import { IFilesConfigurationService, IAutoSaveConfiguration } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

const AUTO_SAVE_AFTER_DELAY_DISABLED_TIME = CONTENT_CHANGE_EVENT_BUFFER_DELAY + 500;

export class BackupModelTracker extends Disposable implements IWorkbenchContribution {

	private configuredAutoSaveAfterDelay = false;

	constructor(
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUntitledTextEditorService private readonly untitledTextEditorService: IUntitledTextEditorService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {

		// Listen for text file model changes
		this._register(this.textFileService.models.onModelContentChanged(e => this.onTextFileModelChanged(e)));
		this._register(this.textFileService.models.onModelSaved(e => this.discardBackup(e.resource)));
		this._register(this.textFileService.models.onModelDisposed(e => this.discardBackup(e)));

		// Listen for untitled model changes
		this._register(this.untitledTextEditorService.onDidChangeContent(e => this.onUntitledModelChanged(e)));
		this._register(this.untitledTextEditorService.onDidDisposeModel(e => this.discardBackup(e)));

		// Listen to auto save config changes
		this._register(this.filesConfigurationService.onAutoSaveConfigurationChange(c => this.onAutoSaveConfigurationChange(c)));
	}

	private onAutoSaveConfigurationChange(configuration: IAutoSaveConfiguration): void {
		this.configuredAutoSaveAfterDelay = typeof configuration.autoSaveDelay === 'number' && configuration.autoSaveDelay < AUTO_SAVE_AFTER_DELAY_DISABLED_TIME;
	}

	private onTextFileModelChanged(event: TextFileModelChangeEvent): void {
		if (event.kind === StateChange.REVERTED) {
			// This must proceed even if auto save after delay is configured in order to clean up
			// any backups made before the config change
			this.discardBackup(event.resource);
		} else if (event.kind === StateChange.CONTENT_CHANGE) {
			// Do not backup when auto save after delay is configured
			if (!this.configuredAutoSaveAfterDelay) {
				const model = this.textFileService.models.get(event.resource);
				if (model) {
					model.backup();
				}
			}
		}
	}

	private onUntitledModelChanged(resource: Uri): void {
		if (this.untitledTextEditorService.isDirty(resource)) {
			this.untitledTextEditorService.loadOrCreate({ resource }).then(model => model.backup());
		} else {
			this.discardBackup(resource);
		}
	}

	private discardBackup(resource: Uri): void {
		this.backupFileService.discardResourceBackup(resource);
	}
}
