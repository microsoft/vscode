/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as platform from 'vs/base/common/platform';
import Uri from 'vs/base/common/uri';
import { IBackupService, IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextFileEditorModel, ITextFileOperationResult, IResult, ITextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService, IFilesConfiguration } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TPromise } from 'vs/base/common/winjs.base';

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
			return TPromise.as<void>(null);
		}

		return this.doBackup(resource, content, true);
	}

	public doBackup(resource: Uri, content: string, immediate?: boolean): TPromise<void> {
		// Cancel any currently running backups to make this the one that succeeds
		this.cancelBackupPromises();

		if (immediate) {
			return this.backupFileService.backupAndRegisterResource(resource, content).then(f => void 0);
		}

		// Create new backup promise and keep it
		const promise = TPromise.timeout(1000).then(() => {
			this.backupFileService.backupAndRegisterResource(resource, content); // Very important here to not return the promise because if the timeout promise is canceled it will bubble up the error otherwise - do not change
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
	private backupAll(dirtyToBackup: Uri[], textFileEditorModelManager: ITextFileEditorModelManager): TPromise<ITextFileOperationResult> {
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

	private doBackupAll(dirtyFileModels: ITextFileEditorModel[], untitledResources: Uri[]): TPromise<ITextFileOperationResult> {
		// Handle file resources first
		const mapResourceToResult: { [resource: string]: IResult } = Object.create(null);
		dirtyFileModels.forEach(m => {
			mapResourceToResult[m.getResource().toString()] = {
				source: m.getResource()
			};
		});

		return TPromise.join(dirtyFileModels.map(model => {
			return this.backupImmediately(model.getResource(), model.getValue()).then(() => {
				mapResourceToResult[model.getResource().toString()].success = true;
			});
		})).then(results => {
			// Handle untitled resources
			const untitledModelPromises = untitledResources.map(untitledResource => this.untitledEditorService.get(untitledResource))
				.filter(untitled => !!untitled)
				.map(untitled => untitled.resolve());

			return TPromise.join(untitledModelPromises).then(untitledModels => {
				const untitledBackupPromises = untitledModels.map(model => {
					mapResourceToResult[model.getResource().toString()] = {
						source: model.getResource(),
						target: model.getResource()
					};
					return this.backupImmediately(model.getResource(), model.getValue()).then(() => {
						mapResourceToResult[model.getResource().toString()].success = true;
					});
				});
				return TPromise.join(untitledBackupPromises).then(() => {
					return {
						results: Object.keys(mapResourceToResult).map(k => mapResourceToResult[k])
					};
				});
			});
		});
	}

	public get isHotExitEnabled(): boolean {
		// If hot exit is enabled then save the dirty files in the workspace and then exit
		// Hot exit is currently disabled for both empty workspaces (#13733) and on Mac (#13305)
		return this.configuredHotExit && this.contextService.getWorkspace() && !platform.isMacintosh;
	}

	public backupBeforeShutdown(dirtyToBackup: Uri[], textFileEditorModelManager: ITextFileEditorModelManager): boolean | TPromise<boolean> {
		// If there are no dirty files, clean up and exit
		if (dirtyToBackup.length === 0) {
			return this.cleanupBackupsBeforeShutdown();
		}

		return this.backupFileService.getWorkspaceBackupPaths().then(workspaceBackupPaths => {
			// Only remove the workspace from the backup service if it's not the last one or it's not dirty
			if (workspaceBackupPaths.length > 1) {
				return false;
			}

			// Backup and hot exit
			return this.backupAll(dirtyToBackup, textFileEditorModelManager).then(result => {
				if (result.results.some(r => !r.success)) {
					return true; // veto if some backups failed
				}

				return false; // the backup went smoothly, no veto
			});
		});
	}

	// TODO: Verify whether this is even needed at all if there is an onsave listener
	public cleanupBackupsBeforeShutdown(): boolean | TPromise<boolean> {
		const workspace = this.contextService.getWorkspace();
		if (!workspace) {
			return false; // no backups to cleanup, no veto
		}
		return this.backupFileService.removeWorkspaceBackupPath(workspace.resource).then(() => {
			return this.backupFileService.discardBackups().then(() => {
				return false; // no veto
			});
		});
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		this.cancelBackupPromises();
	}

	// TODO: Watch untitled files
}