/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWindowService, IEnterWorkspaceResult, MessageBoxOptions, IWindowsService } from 'vs/platform/windows/common/windows';
import { IJSONEditingService, JSONEditingError, JSONEditingErrorCode } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, IStoredWorkspace, isStoredWorkspaceFolder, isRawFileWorkspaceFolder, isWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configurationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { StorageService } from 'vs/platform/storage/node/storageService';
import { ConfigurationScope, IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { distinct } from 'vs/base/common/arrays';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { isEqual, dirname, basename } from 'vs/base/common/resources';
import * as json from 'vs/base/common/json';
import * as jsonEdit from 'vs/base/common/jsonEdit';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IFileService } from 'vs/platform/files/common/files';
import { isAbsolute, resolve } from 'path';
import { massageFolderPathForWorkspace } from 'vs/platform/workspaces/node/workspaces';
import { Schemas } from 'vs/base/common/network';

export class WorkspaceEditingService implements IWorkspaceEditingService {

	_serviceBrand: any;

	constructor(
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private readonly contextService: WorkspaceService,
		@IWindowService private readonly windowService: IWindowService,
		@IWorkspaceConfigurationService private readonly workspaceConfigurationService: IWorkspaceConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileSystemService: IFileService,
		@IWindowsService private readonly windowsService: IWindowsService,
	) {
	}

	updateFolders(index: number, deleteCount?: number, foldersToAdd?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void> {
		const folders = this.contextService.getWorkspace().folders;

		let foldersToDelete: URI[] = [];
		if (typeof deleteCount === 'number') {
			foldersToDelete = folders.slice(index, index + deleteCount).map(f => f.uri);
		}

		const wantsToDelete = foldersToDelete.length > 0;
		const wantsToAdd = Array.isArray(foldersToAdd) && foldersToAdd.length > 0;

		if (!wantsToAdd && !wantsToDelete) {
			return Promise.resolve(); // return early if there is nothing to do
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

	private doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToDelete: URI[], index?: number, donotNotifyError: boolean = false): Promise<void> {
		return this.contextService.updateFolders(foldersToAdd, foldersToDelete, index)
			.then(() => null, error => donotNotifyError ? Promise.reject(error) : this.handleWorkspaceConfigurationEditingError(error));
	}

	addFolders(foldersToAdd: IWorkspaceFolderCreationData[], donotNotifyError: boolean = false): Promise<void> {
		return this.doAddFolders(foldersToAdd, undefined, donotNotifyError);
	}

	private doAddFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number, donotNotifyError: boolean = false): Promise<void> {
		const state = this.contextService.getWorkbenchState();

		// If we are in no-workspace or single-folder workspace, adding folders has to
		// enter a workspace.
		if (state !== WorkbenchState.WORKSPACE) {
			let newWorkspaceFolders = this.contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri } as IWorkspaceFolderCreationData));
			newWorkspaceFolders.splice(typeof index === 'number' ? index : newWorkspaceFolders.length, 0, ...foldersToAdd);
			newWorkspaceFolders = distinct(newWorkspaceFolders, folder => isLinux ? folder.uri.toString() : folder.uri.toString().toLowerCase());

			if (state === WorkbenchState.EMPTY && newWorkspaceFolders.length === 0 || state === WorkbenchState.FOLDER && newWorkspaceFolders.length === 1) {
				return Promise.resolve(); // return if the operation is a no-op for the current state
			}

			return this.createAndEnterWorkspace(newWorkspaceFolders);
		}

		// Delegate addition of folders to workspace service otherwise
		return this.contextService.addFolders(foldersToAdd, index)
			.then(() => null, error => donotNotifyError ? Promise.reject(error) : this.handleWorkspaceConfigurationEditingError(error));
	}

	removeFolders(foldersToRemove: URI[], donotNotifyError: boolean = false): Promise<void> {

		// If we are in single-folder state and the opened folder is to be removed,
		// we create an empty workspace and enter it.
		if (this.includesSingleFolderWorkspace(foldersToRemove)) {
			return this.createAndEnterWorkspace([]);
		}

		// Delegate removal of folders to workspace service otherwise
		return this.contextService.removeFolders(foldersToRemove)
			.then(() => null, error => donotNotifyError ? Promise.reject(error) : this.handleWorkspaceConfigurationEditingError(error));
	}

	private includesSingleFolderWorkspace(folders: URI[]): boolean {
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			const workspaceFolder = this.contextService.getWorkspace().folders[0];
			return (folders.some(folder => isEqual(folder, workspaceFolder.uri)));
		}

		return false;
	}

	enterWorkspace(path: URI): Promise<void> {
		return this.doEnterWorkspace(() => this.windowService.enterWorkspace(path));
	}

	createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): Promise<void> {
		return this.doEnterWorkspace(() => this.windowService.createAndEnterWorkspace(folders, path));
	}

	async saveAndEnterWorkspace(path: URI): Promise<void> {
		if (!this.isValidTargetWorkspacePath(path)) {
			return Promise.reject(null);
		}
		const currentWorkspaceIdentifier = toWorkspaceIdentifier(this.contextService.getWorkspace());
		if (!isWorkspaceIdentifier(currentWorkspaceIdentifier)) {
			return Promise.reject(null);
		}
		await this.saveWorkspace(currentWorkspaceIdentifier, path);

		return this.enterWorkspace(path);
	}


	async isValidTargetWorkspacePath(path: URI): Promise<boolean> {

		const windows = await this.windowsService.getWindows();

		// Prevent overwriting a workspace that is currently opened in another window
		if (windows.some(window => window.workspace && isEqual(URI.file(window.workspace.configPath), path))) {
			const options: MessageBoxOptions = {
				type: 'info',
				buttons: [nls.localize('ok', "OK")],
				message: nls.localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(path)),
				detail: nls.localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again."),
				noLink: true
			};
			return this.windowService.showMessageBox(options).then(() => false);
		}

		return Promise.resolve(true); // OK
	}

	private saveWorkspace(workspace: IWorkspaceIdentifier, targetConfigPathURI: URI): Promise<URI> {
		const configPathURI = URI.file(workspace.configPath);

		// Return early if target is same as source
		if (isEqual(configPathURI, targetConfigPathURI)) {
			return Promise.resolve(targetConfigPathURI);
		}

		// Read the contents of the workspace file and resolve it
		return this.fileSystemService.resolveFile(configPathURI).then(raw => {
			const rawWorkspaceContents = raw.toString();
			let storedWorkspace: IStoredWorkspace;
			try {
				storedWorkspace = this.doParseStoredWorkspace(configPathURI, rawWorkspaceContents);
			} catch (error) {
				return Promise.reject(error);
			}

			const sourceConfigFolder = dirname(configPathURI);
			const targetConfigFolder = dirname(targetConfigPathURI);

			// Rewrite absolute paths to relative paths if the target workspace folder
			// is a parent of the location of the workspace file itself. Otherwise keep
			// using absolute paths.
			storedWorkspace.folders.forEach(folder => {
				if (isRawFileWorkspaceFolder(folder)) {
					if (sourceConfigFolder.scheme === Schemas.file) {
						if (!isAbsolute(folder.path)) {
							folder.path = resolve(sourceConfigFolder.path, folder.path); // relative paths get resolved against the workspace location
						}
						folder.path = massageFolderPathForWorkspace(folder.path, targetConfigFolder, storedWorkspace.folders);
					}
				}
			});

			// Preserve as much of the existing workspace as possible by using jsonEdit
			// and only changing the folders portion.
			let newRawWorkspaceContents = rawWorkspaceContents;
			const edits = jsonEdit.setProperty(rawWorkspaceContents, ['folders'], storedWorkspace.folders, { insertSpaces: false, tabSize: 4, eol: (isLinux || isMacintosh) ? '\n' : '\r\n' });
			edits.forEach(edit => {
				newRawWorkspaceContents = jsonEdit.applyEdit(rawWorkspaceContents, edit);
			});

			return this.fileSystemService.createFile(targetConfigPathURI, newRawWorkspaceContents, { overwrite: true }).then(() => {
				return targetConfigPathURI;
			});
		});
	}

	private doParseStoredWorkspace(path: URI, contents: string): IStoredWorkspace {

		// Parse workspace file
		let storedWorkspace: IStoredWorkspace = json.parse(contents); // use fault tolerant parser

		// Filter out folders which do not have a path or uri set
		if (Array.isArray(storedWorkspace.folders)) {
			storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
		}

		// Validate
		if (!Array.isArray(storedWorkspace.folders)) {
			throw new Error(`${path} looks like an invalid workspace file.`);
		}

		return storedWorkspace;
	}

	private handleWorkspaceConfigurationEditingError(error: JSONEditingError): Promise<void> {
		switch (error.code) {
			case JSONEditingErrorCode.ERROR_INVALID_FILE:
				this.onInvalidWorkspaceConfigurationFileError();
				return Promise.resolve();
			case JSONEditingErrorCode.ERROR_FILE_DIRTY:
				this.onWorkspaceConfigurationFileDirtyError();
				return Promise.resolve();
		}
		this.notificationService.error(error.message);

		return Promise.resolve();
	}

	private onInvalidWorkspaceConfigurationFileError(): void {
		const message = nls.localize('errorInvalidTaskConfiguration', "Unable to write into workspace configuration file. Please open the file to correct errors/warnings in it and try again.");
		this.askToOpenWorkspaceConfigurationFile(message);
	}

	private onWorkspaceConfigurationFileDirtyError(): void {
		const message = nls.localize('errorWorkspaceConfigurationFileDirty', "Unable to write into workspace configuration file because the file is dirty. Please save it and try again.");
		this.askToOpenWorkspaceConfigurationFile(message);
	}

	private askToOpenWorkspaceConfigurationFile(message: string): void {
		this.notificationService.prompt(Severity.Error, message,
			[{
				label: nls.localize('openWorkspaceConfigurationFile', "Open Workspace Configuration"),
				run: () => this.commandService.executeCommand('workbench.action.openWorkspaceConfigFile')
			}]
		);
	}

	private doEnterWorkspace(mainSidePromise: () => Promise<IEnterWorkspaceResult>): Promise<void> {

		// Stop the extension host first to give extensions most time to shutdown
		this.extensionService.stopExtensionHost();
		let extensionHostStarted: boolean = false;

		const startExtensionHost = () => {
			this.extensionService.startExtensionHost();
			extensionHostStarted = true;
		};

		return mainSidePromise().then(result => {

			// Migrate storage and settings if we are to enter a workspace
			if (result) {
				return this.migrate(result.workspace).then(() => {

					// Reinitialize backup service
					if (this.backupFileService instanceof BackupFileService) {
						this.backupFileService.initialize(result.backupPath);
					}

					// Reinitialize configuration service
					const workspaceImpl = this.contextService as WorkspaceService;
					return workspaceImpl.initialize(result.workspace, startExtensionHost);
				});
			}

			return Promise.resolve();
		}).then(undefined, error => {
			if (!extensionHostStarted) {
				startExtensionHost(); // start the extension host if not started
			}

			return Promise.reject(error);
		});
	}

	private migrate(toWorkspace: IWorkspaceIdentifier): Promise<void> {

		// Storage migration
		return this.migrateStorage(toWorkspace).then(() => {

			// Settings migration (only if we come from a folder workspace)
			if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
				return this.migrateWorkspaceSettings(toWorkspace);
			}

			return undefined;
		});
	}

	private migrateStorage(toWorkspace: IWorkspaceIdentifier): Promise<void> {
		const storageImpl = this.storageService as StorageService;

		return storageImpl.migrate(toWorkspace);
	}

	private migrateWorkspaceSettings(toWorkspace: IWorkspaceIdentifier): Promise<void> {
		return this.doCopyWorkspaceSettings(toWorkspace, setting => setting.scope === ConfigurationScope.WINDOW);
	}

	copyWorkspaceSettings(toWorkspace: IWorkspaceIdentifier): Promise<void> {
		return this.doCopyWorkspaceSettings(toWorkspace);
	}

	private doCopyWorkspaceSettings(toWorkspace: IWorkspaceIdentifier, filter?: (config: IConfigurationPropertySchema) => boolean): Promise<void> {
		const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		const targetWorkspaceConfiguration = {};
		for (const key of this.workspaceConfigurationService.keys().workspace) {
			if (configurationProperties[key]) {
				if (filter && !filter(configurationProperties[key])) {
					continue;
				}

				targetWorkspaceConfiguration[key] = this.workspaceConfigurationService.inspect(key).workspace;
			}
		}

		return this.jsonEditingService.write(URI.file(toWorkspace.configPath), { key: 'settings', value: targetWorkspaceConfiguration }, true);
	}
}
