/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWindowService, IEnterWorkspaceResult } from 'vs/platform/windows/common/windows';
import { IJSONEditingService, JSONEditingError, JSONEditingErrorCode } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configurationService';
import { migrateStorageToMultiRootWorkspace } from 'vs/platform/storage/common/migration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { StorageService } from 'vs/platform/storage/common/storageService';
import { ConfigurationScope, IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { distinct } from 'vs/base/common/arrays';
import { isLinux } from 'vs/base/common/platform';
import { isEqual } from 'vs/base/common/resources';
import { IChoiceService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

export class WorkspaceEditingService implements IWorkspaceEditingService {

	public _serviceBrand: any;

	constructor(
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private contextService: WorkspaceService,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceConfigurationService private workspaceConfigurationService: IWorkspaceConfigurationService,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@IChoiceService private choiceService: IChoiceService,
		@INotificationService private notificationService: INotificationService,
		@ICommandService private commandService: ICommandService
	) {
	}

	public updateFolders(index: number, deleteCount?: number, foldersToAdd?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): TPromise<void> {
		const folders = this.contextService.getWorkspace().folders;

		let foldersToDelete: URI[] = [];
		if (typeof deleteCount === 'number') {
			foldersToDelete = folders.slice(index, index + deleteCount).map(f => f.uri);
		}

		const wantsToDelete = foldersToDelete.length > 0;
		const wantsToAdd = Array.isArray(foldersToAdd) && foldersToAdd.length > 0;

		if (!wantsToAdd && !wantsToDelete) {
			return TPromise.as(void 0); // return early if there is nothing to do
		}

		// Add Folders
		if (wantsToAdd && !wantsToDelete) {
			return this.doAddFolders(foldersToAdd, index, donotNotifyError);
		}

		// Delete Folders
		if (wantsToDelete && !wantsToAdd) {
			return this.removeFolders(foldersToDelete);
		}

		// Add & Delete Folders
		else {

			// if we are in single-folder state and the folder is replaced with
			// other folders, we handle this specially and just enter workspace
			// mode with the folders that are being added.
			if (this.includesSingleFolderWorkspace(foldersToDelete)) {
				return this.createAndEnterWorkspace(foldersToAdd);
			}

			// if we are not in workspace-state, we just add the folders
			if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
				return this.doAddFolders(foldersToAdd, index, donotNotifyError);
			}

			// finally, update folders within the workspace
			return this.doUpdateFolders(foldersToAdd, foldersToDelete, index, donotNotifyError);
		}
	}

	private doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToDelete: URI[], index?: number, donotNotifyError: boolean = false): TPromise<void> {
		return this.contextService.updateFolders(foldersToAdd, foldersToDelete, index)
			.then(() => null, error => donotNotifyError ? TPromise.wrapError(error) : this.handleWorkspaceConfigurationEditingError(error));
	}

	public addFolders(foldersToAdd: IWorkspaceFolderCreationData[], donotNotifyError: boolean = false): TPromise<void> {
		return this.doAddFolders(foldersToAdd, void 0, donotNotifyError);
	}

	private doAddFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number, donotNotifyError: boolean = false): TPromise<void> {
		const state = this.contextService.getWorkbenchState();

		// If we are in no-workspace or single-folder workspace, adding folders has to
		// enter a workspace.
		if (state !== WorkbenchState.WORKSPACE) {
			let newWorkspaceFolders = this.contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri } as IWorkspaceFolderCreationData));
			newWorkspaceFolders.splice(typeof index === 'number' ? index : newWorkspaceFolders.length, 0, ...foldersToAdd);
			newWorkspaceFolders = distinct(newWorkspaceFolders, folder => isLinux ? folder.uri.toString() : folder.uri.toString().toLowerCase());

			if (state === WorkbenchState.EMPTY && newWorkspaceFolders.length === 0 || state === WorkbenchState.FOLDER && newWorkspaceFolders.length === 1) {
				return TPromise.as(void 0); // return if the operation is a no-op for the current state
			}

			return this.createAndEnterWorkspace(newWorkspaceFolders);
		}

		// Delegate addition of folders to workspace service otherwise
		return this.contextService.addFolders(foldersToAdd, index)
			.then(() => null, error => donotNotifyError ? TPromise.wrapError(error) : this.handleWorkspaceConfigurationEditingError(error));
	}

	public removeFolders(foldersToRemove: URI[], donotNotifyError: boolean = false): TPromise<void> {

		// If we are in single-folder state and the opened folder is to be removed,
		// we create an empty workspace and enter it.
		if (this.includesSingleFolderWorkspace(foldersToRemove)) {
			return this.createAndEnterWorkspace([]);
		}

		// Delegate removal of folders to workspace service otherwise
		return this.contextService.removeFolders(foldersToRemove)
			.then(() => null, error => donotNotifyError ? TPromise.wrapError(error) : this.handleWorkspaceConfigurationEditingError(error));
	}

	private includesSingleFolderWorkspace(folders: URI[]): boolean {
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			const workspaceFolder = this.contextService.getWorkspace().folders[0];
			return (folders.some(folder => isEqual(folder, workspaceFolder.uri, !isLinux)));
		}

		return false;
	}

	public createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<void> {
		return this.doEnterWorkspace(() => this.windowService.createAndEnterWorkspace(folders, path));
	}

	public saveAndEnterWorkspace(path: string): TPromise<void> {
		return this.doEnterWorkspace(() => this.windowService.saveAndEnterWorkspace(path));
	}

	private handleWorkspaceConfigurationEditingError(error: JSONEditingError): TPromise<void> {
		switch (error.code) {
			case JSONEditingErrorCode.ERROR_INVALID_FILE:
				return this.onInvalidWorkspaceConfigurationFileError();
			case JSONEditingErrorCode.ERROR_FILE_DIRTY:
				return this.onWorkspaceConfigurationFileDirtyError();
		}
		this.notificationService.error(error.message);
		return TPromise.as(void 0);
	}

	private onInvalidWorkspaceConfigurationFileError(): TPromise<void> {
		const message = nls.localize('errorInvalidTaskConfiguration', "Unable to write into workspace configuration file. Please open the file to correct errors/warnings in it and try again.");
		return this.askToOpenWorkspaceConfigurationFile(message);
	}

	private onWorkspaceConfigurationFileDirtyError(): TPromise<void> {
		const message = nls.localize('errorWorkspaceConfigurationFileDirty', "Unable to write into workspace configuration file because the file is dirty. Please save it and try again.");
		return this.askToOpenWorkspaceConfigurationFile(message);
	}

	private askToOpenWorkspaceConfigurationFile(message: string): TPromise<void> {
		return this.choiceService.choose(Severity.Error, message, [nls.localize('openWorkspaceConfigurationFile', "Open Workspace Configuration")])
			.then(option => {
				if (option === 0) {
					this.commandService.executeCommand('workbench.action.openWorkspaceConfigFile');
				}
			});
	}

	private doEnterWorkspace(mainSidePromise: () => TPromise<IEnterWorkspaceResult>): TPromise<void> {

		// Stop the extension host first to give extensions most time to shutdown
		this.extensionService.stopExtensionHost();

		const startExtensionHost = () => {
			this.extensionService.startExtensionHost();
		};

		return mainSidePromise().then(result => {

			// Migrate storage and settings if we are to enter a workspace
			if (result) {
				return this.migrate(result.workspace).then(() => {

					// TODO@Ben TODO@Sandeep the following requires ugly casts and should probably have a service interface

					// Reinitialize backup service
					const backupFileService = this.backupFileService as BackupFileService;
					backupFileService.initialize(result.backupPath);

					// Reinitialize configuration service
					const workspaceImpl = this.contextService as WorkspaceService;
					return workspaceImpl.initialize(result.workspace);
				});
			}

			return TPromise.as(void 0);
		}).then(startExtensionHost, error => {
			startExtensionHost(); // in any case start the extension host again!

			return TPromise.wrapError(error);
		});
	}

	private migrate(toWorkspace: IWorkspaceIdentifier): TPromise<void> {

		// Storage (UI State) migration
		this.migrateStorage(toWorkspace);

		// Settings migration (only if we come from a folder workspace)
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			return this.copyWorkspaceSettings(toWorkspace);
		}

		return TPromise.as(void 0);
	}

	private migrateStorage(toWorkspace: IWorkspaceIdentifier): void {

		// TODO@Ben revisit this when we move away from local storage to a file based approach
		const storageImpl = this.storageService as StorageService;
		const newWorkspaceId = migrateStorageToMultiRootWorkspace(storageImpl.workspaceId, toWorkspace, storageImpl.workspaceStorage);
		storageImpl.setWorkspaceId(newWorkspaceId);
	}

	public copyWorkspaceSettings(toWorkspace: IWorkspaceIdentifier): TPromise<void> {
		const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		const targetWorkspaceConfiguration = {};
		for (const key of this.workspaceConfigurationService.keys().workspace) {
			if (configurationProperties[key] && !configurationProperties[key].notMultiRootAdopted && configurationProperties[key].scope === ConfigurationScope.WINDOW) {
				targetWorkspaceConfiguration[key] = this.workspaceConfigurationService.inspect(key).workspace;
			}
		}

		return this.jsonEditingService.write(URI.file(toWorkspace.configPath), { key: 'settings', value: targetWorkspaceConfiguration }, true);
	}
}
