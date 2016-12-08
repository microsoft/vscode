/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Uri from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextFileService, TextFileModelChangeEvent, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, AutoSaveConfiguration } from 'vs/platform/files/common/files';

export class BackupModelTracker implements IWorkbenchContribution {

	public _serviceBrand: any;

	private configuredAutoSaveAfterDelay: boolean;
	private toDispose: IDisposable[];

	constructor(
		@IBackupFileService private backupFileService: IBackupFileService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService
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

		// Listen to config changes
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config)));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		this.configuredAutoSaveAfterDelay = configuration && configuration.files && configuration.files.autoSave === AutoSaveConfiguration.AFTER_DELAY;
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
				this.backupFileService.backupResource(model.getResource(), model.getValue(), model.getVersionId()).done(null, errors.onUnexpectedError);
			}
		}
	}

	private onUntitledModelChanged(resource: Uri): void {
		const input = this.untitledEditorService.get(resource);
		if (input.isDirty()) {
			input.resolve().then(model => this.backupFileService.backupResource(resource, model.getValue(), model.getVersionId())).done(null, errors.onUnexpectedError);
		} else {
			this.discardBackup(resource);
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