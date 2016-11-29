/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import platform = require('vs/base/common/platform');
import Uri from 'vs/base/common/uri';
import { IBackupService, IBackupFileService, IBackupResult } from 'vs/workbench/services/backup/common/backup';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextFileEditorModel, ITextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService, IFilesConfiguration } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';

export class BackupService implements IBackupService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected backupWorkspacesPath: string;

	private toDispose: IDisposable[];

	private configuredHotExit: boolean;

	constructor(
		@IBackupFileService private backupFileService: IBackupFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IFileService private fileService: IFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowsService private windowsService: IWindowsService
	) {
		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners() {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config)));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		// Hot exit is disabled for empty workspaces
		this.configuredHotExit = this.contextService.getWorkspace() && configuration && configuration.files && configuration.files.hotExit;
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
			return this.backupFileService.backupResource(model.getResource(), model.getValue(), model.getVersionId());
		})).then(results => {
			// Handle untitled resources
			const untitledModelPromises = untitledResources.map(untitledResource => this.untitledEditorService.get(untitledResource))
				.filter(untitled => !!untitled)
				.map(untitled => untitled.resolve());

			return TPromise.join(untitledModelPromises).then(untitledModels => {
				const untitledBackupPromises = untitledModels.map(model => {
					return this.backupFileService.backupResource(model.getResource(), model.getValue(), model.getVersionId());
				});
				return TPromise.join(untitledBackupPromises).then(() => void 0);
			});
		});
	}

	public get isHotExitEnabled(): boolean {
		// If hot exit is enabled then save the dirty files in the workspace and then exit
		// Hot exit is currently disabled for empty workspaces (#13733).
		return !this.environmentService.isExtensionDevelopment && this.configuredHotExit && !!this.contextService.getWorkspace();
	}

	public backupBeforeShutdown(dirtyToBackup: Uri[], textFileEditorModelManager: ITextFileEditorModelManager, reason: ShutdownReason): TPromise<IBackupResult> {
		return this.windowsService.getWindowCount().then(windowCount => {

			// When quit is requested skip the confirm callback and attempt to backup all workspaces.
			// When quit is not requested the confirm callback should be shown when the window being
			// closed is the only VS Code window open, except for on Mac where hot exit is only
			// ever activated when quit is requested.

			let doBackup: boolean;
			switch (reason) {
				case ShutdownReason.CLOSE:
					if (windowCount > 1 || platform.isMacintosh) {
						doBackup = false; // do not backup if a window is closed that does not cause quitting of the application
					} else {
						doBackup = true; // backup if last window is closed on win/linux where the application quits right after
					}
					break;

				case ShutdownReason.QUIT:
					doBackup = true; // backup because next start we restore all backups
					break;

				case ShutdownReason.RELOAD:
					doBackup = true; // backup because after window reload, backups restore
					break;

				case ShutdownReason.LOAD:
					doBackup = false; // do not backup because we are switching contexts
					break;
			}

			if (!doBackup) {
				return TPromise.as({ didBackup: false });
			}

			// Backup
			return this.backupAll(dirtyToBackup, textFileEditorModelManager).then(() => { return { didBackup: true }; }); // we did backup
		});
	}

	public cleanupBackupsBeforeShutdown(): TPromise<void> {
		if (this.environmentService.isExtensionDevelopment) {
			return TPromise.as(void 0);
		}

		const workspace = this.contextService.getWorkspace();
		if (!workspace) {
			return TPromise.as(void 0); // no backups to cleanup
		}

		return this.backupFileService.discardAllWorkspaceBackups();
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}