/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as Uri } from 'vs/base/common/uri';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextFileService, TextFileModelChangeEvent, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, AutoSaveConfiguration, CONTENT_CHANGE_EVENT_BUFFER_DELAY } from 'vs/platform/files/common/files';

const AUTO_SAVE_AFTER_DELAY_DISABLED_TIME = CONTENT_CHANGE_EVENT_BUFFER_DELAY + 500;

export class BackupModelTracker extends Disposable implements IWorkbenchContribution {

	private configuredAutoSaveAfterDelay = false;

	constructor(
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {

		// Listen for text file model changes
		this._register(this.textFileService.models.onModelContentChanged((e) => this.onTextFileModelChanged(e)));
		this._register(this.textFileService.models.onModelSaved((e) => this.discardBackup(e.resource)));
		this._register(this.textFileService.models.onModelDisposed((e) => this.discardBackup(e)));

		// Listen for untitled model changes
		this._register(this.untitledEditorService.onDidChangeContent((e) => this.onUntitledModelChanged(e)));
		this._register(this.untitledEditorService.onDidDisposeModel((e) => this.discardBackup(e)));

		// Listen to config changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(this.configurationService.getValue<IFilesConfiguration>())));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		if (!configuration || !configuration.files) {
			this.configuredAutoSaveAfterDelay = false;

			return;
		}

		this.configuredAutoSaveAfterDelay = (configuration.files.autoSave === AutoSaveConfiguration.AFTER_DELAY && configuration.files.autoSaveDelay <= AUTO_SAVE_AFTER_DELAY_DISABLED_TIME);
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
		if (this.untitledEditorService.isDirty(resource)) {
			this.untitledEditorService.loadOrCreate({ resource }).then(model => model.backup());
		} else {
			this.discardBackup(resource);
		}
	}

	private discardBackup(resource: Uri): void {
		this.backupFileService.discardResourceBackup(resource);
	}
}
