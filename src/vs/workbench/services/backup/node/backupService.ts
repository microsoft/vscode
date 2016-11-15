/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import platform = require('vs/base/common/platform');
import Uri from 'vs/base/common/uri';
import { IBackupService, IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextFileEditorModel, ITextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService, IFilesConfiguration } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

export class BackupService implements IBackupService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected backupWorkspacesPath: string;

	private toDispose: IDisposable[];

	private backupPromises: TPromise<void>[];

	private configuredHotExit: boolean;

	constructor(
		@IBackupFileService private backupFileService: IBackupFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IFileService private fileService: IFileService,
		@IMessageService private messageService: IMessageService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		this.toDispose = [];
		this.backupPromises = [];

		this.registerListeners();
	}

	private registerListeners() {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config)));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		// Hot exit is disabled for empty workspaces
		this.configuredHotExit = this.contextService.getWorkspace() && configuration && configuration.files && configuration.files.hotExit;
	}

	private backupImmediately(resource: Uri, content: string): TPromise<void> {
		if (!resource) {
			return TPromise.as(void 0);
		}

		return this.doBackup(resource, content, true);
	}

	public doBackup(resource: Uri, content: string, immediate?: boolean): TPromise<void> {
		// Cancel any currently running backups to make this the one that succeeds
		this.cancelBackupPromises();

		if (immediate) {
			return this.backupFileService.backupResource(resource, content);
		}

		// Create new backup promise and keep it
		const promise = TPromise.timeout(1000).then(() => {
			this.backupFileService.backupResource(resource, content); // Very important here to not return the promise because if the timeout promise is canceled it will bubble up the error otherwise - do not change
		});

		this.backupPromises.push(promise);

		return promise;
	}

	private cancelBackupPromises(): void {
		while (this.backupPromises.length) {
			this.backupPromises.pop().cancel();
		}
	}

	/**
	 * Performs an immedate backup of all dirty file and untitled models.
	 */
	private backupAll(dirtyToBackup: Uri[], textFileEditorModelManager: ITextFileEditorModelManager): TPromise<void> {
		// split up between files and untitled
		const filesToBackup: ITextFileEditorModel[] = [];
		const untitledToBackup: Uri[] = [];
		dirtyToBackup.forEach(s => {
			if (s.scheme === 'file') {
				filesToBackup.push(textFileEditorModelManager.get(s));
			} else if (s.scheme === 'untitled') {
				untitledToBackup.push(s);
			}
		});

		return this.doBackupAll(filesToBackup, untitledToBackup);
	}

	private doBackupAll(dirtyFileModels: ITextFileEditorModel[], untitledResources: Uri[]): TPromise<void> {
		// Handle file resources first
		return TPromise.join(dirtyFileModels.map(model => {
			return this.backupImmediately(model.getResource(), model.getValue()).then(() => void 0);
		})).then(results => {
			// Handle untitled resources
			const untitledModelPromises = untitledResources.map(untitledResource => this.untitledEditorService.get(untitledResource))
				.filter(untitled => !!untitled)
				.map(untitled => untitled.resolve());

			return TPromise.join(untitledModelPromises).then(untitledModels => {
				const untitledBackupPromises = untitledModels.map(model => {
					return this.backupImmediately(model.getResource(), model.getValue());
				});
				return TPromise.join(untitledBackupPromises).then(() => void 0);
			});
		});
	}

	public get isHotExitEnabled(): boolean {
		// If hot exit is enabled then save the dirty files in the workspace and then exit
		// Hot exit is currently disabled for empty workspaces (#13733).
		return this.configuredHotExit && !!this.contextService.getWorkspace();
	}

	public backupBeforeShutdown(dirtyToBackup: Uri[], textFileEditorModelManager: ITextFileEditorModelManager, quitRequested: boolean, confirmCallback: () => boolean | TPromise<boolean>): boolean | TPromise<boolean> {
		return this.backupFileService.getWorkspaceBackupPaths().then(workspaceBackupPaths => {
			// When quit is requested skip the confirm callback and attempt to backup all workspaces.
			// When quit is not requested the confirm callback should be shown when the window being
			// closed is the only VS Code window open, except for on Mac where hot exit is only
			// ever activated when quit is requested.
			if (!quitRequested && (workspaceBackupPaths.length > 1 || platform.isMacintosh)) {
				return confirmCallback(); // confirm save
			}

			// Backup and hot exit
			return this.backupAll(dirtyToBackup, textFileEditorModelManager).then(() => {
				return false; // the backup went smoothly, no veto
			}, errors => {
				const firstError = errors[0];
				this.messageService.show(Severity.Error, nls.localize('files.backup.failSave', "Files could not be backed up (Error: {0}), try saving your files to exit.", firstError.message));
				return true; // veto, the backups failed
			});
		});
	}

	public cleanupBackupsBeforeShutdown(): boolean | TPromise<boolean> {
		const workspace = this.contextService.getWorkspace();
		if (!workspace) {
			return false; // no backups to cleanup, no veto
		}
		return this.backupFileService.discardAllWorkspaceBackups().then(() => false, () => false); // no veto
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		this.cancelBackupPromises();
	}
}