/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWindowService, MessageBoxOptions, IWindowsService } from 'vs/platform/windows/common/windows';
import { IJSONEditingService, JSONEditingError, JSONEditingErrorCode } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, IWorkspacesService, rewriteWorkspaceFileForNewLocation, WORKSPACE_FILTER } from 'vs/platform/workspaces/common/workspaces';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { StorageService } from 'vs/platform/storage/node/storageService';
import { ConfigurationScope, IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IBackupFileService, toBackupWorkspaceResource } from 'vs/workbench/services/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/common/backupFileService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { distinct } from 'vs/base/common/arrays';
import { isLinux, isWindows, isMacintosh } from 'vs/base/common/platform';
import { isEqual, basename, isEqualOrParent, getComparisonKey } from 'vs/base/common/resources';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { IFileDialogService, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class WorkspaceEditingService implements IWorkspaceEditingService {

	_serviceBrand!: ServiceIdentifier<IWorkspaceEditingService>;

	constructor(
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private readonly contextService: WorkspaceService,
		@IWindowService private readonly windowService: IWindowService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@IWorkspacesService private readonly workspaceService: IWorkspacesService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILifecycleService readonly lifecycleService: ILifecycleService,
		@ILabelService readonly labelService: ILabelService
	) {
		this.registerListeners();
	}

	private registerListeners(): void {
		this.lifecycleService.onBeforeShutdown(async e => {
			const saveOperation = this.saveUntitedBeforeShutdown(e.reason);
			if (saveOperation) {
				e.veto(saveOperation);
			}
		});
	}

	private async saveUntitedBeforeShutdown(reason: ShutdownReason): Promise<boolean> {
		if (reason !== ShutdownReason.LOAD && reason !== ShutdownReason.CLOSE) {
			return false; // only interested when window is closing or loading
		}

		const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
		if (!workspaceIdentifier || !isEqualOrParent(workspaceIdentifier.configPath, this.environmentService.untitledWorkspacesHome)) {
			return false; // only care about untitled workspaces to ask for saving
		}

		const windowCount = await this.windowsService.getWindowCount();

		if (reason === ShutdownReason.CLOSE && !isMacintosh && windowCount === 1) {
			return false; // Windows/Linux: quits when last window is closed, so do not ask then
		}

		enum ConfirmResult {
			SAVE,
			DONT_SAVE,
			CANCEL
		}

		const save = { label: mnemonicButtonLabel(nls.localize('save', "Save")), result: ConfirmResult.SAVE };
		const dontSave = { label: mnemonicButtonLabel(nls.localize('doNotSave', "Don't Save")), result: ConfirmResult.DONT_SAVE };
		const cancel = { label: nls.localize('cancel', "Cancel"), result: ConfirmResult.CANCEL };

		const buttons: { label: string; result: ConfirmResult; }[] = [];
		if (isWindows) {
			buttons.push(save, dontSave, cancel);
		} else if (isLinux) {
			buttons.push(dontSave, cancel, save);
		} else {
			buttons.push(save, cancel, dontSave);
		}

		const message = nls.localize('saveWorkspaceMessage', "Do you want to save your workspace configuration as a file?");
		const detail = nls.localize('saveWorkspaceDetail', "Save your workspace if you plan to open it again.");
		const cancelId = buttons.indexOf(cancel);

		const res = await this.dialogService.show(Severity.Warning, message, buttons.map(button => button.label), { detail, cancelId });

		switch (buttons[res].result) {

			// Cancel: veto unload
			case ConfirmResult.CANCEL:
				return true;

			// Don't Save: delete workspace
			case ConfirmResult.DONT_SAVE:
				this.workspaceService.deleteUntitledWorkspace(workspaceIdentifier);
				return false;

			// Save: save workspace, but do not veto unload if path provided
			case ConfirmResult.SAVE: {
				const newWorkspacePath = await this.pickNewWorkspacePath();
				if (!newWorkspacePath) {
					return true; // keep veto if no target was provided
				}

				try {
					await this.saveWorkspaceAs(workspaceIdentifier, newWorkspacePath);

					const newWorkspaceIdentifier = await this.workspaceService.getWorkspaceIdentifier(newWorkspacePath);

					const label = this.labelService.getWorkspaceLabel(newWorkspaceIdentifier, { verbose: true });
					this.windowService.addRecentlyOpened([{ label, workspace: newWorkspaceIdentifier }]);

					this.workspaceService.deleteUntitledWorkspace(workspaceIdentifier);
				} catch (error) {
					// ignore
				}

				return false;
			}
		}
	}

	pickNewWorkspacePath(): Promise<URI | undefined> {
		return this.fileDialogService.showSaveDialog({
			saveLabel: mnemonicButtonLabel(nls.localize('save', "Save")),
			title: nls.localize('saveWorkspace', "Save Workspace"),
			filters: WORKSPACE_FILTER,
			defaultUri: this.fileDialogService.defaultWorkspacePath()
		});
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
		if (wantsToAdd && !wantsToDelete && Array.isArray(foldersToAdd)) {
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
				return this.createAndEnterWorkspace(foldersToAdd!);
			}

			// if we are not in workspace-state, we just add the folders
			if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
				return this.doAddFolders(foldersToAdd!, index, donotNotifyError);
			}

			// finally, update folders within the workspace
			return this.doUpdateFolders(foldersToAdd!, foldersToDelete, index, donotNotifyError);
		}
	}

	private async doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToDelete: URI[], index?: number, donotNotifyError: boolean = false): Promise<void> {
		try {
			await this.contextService.updateFolders(foldersToAdd, foldersToDelete, index);
		} catch (error) {
			if (donotNotifyError) {
				throw error;
			}

			this.handleWorkspaceConfigurationEditingError(error);
		}
	}

	addFolders(foldersToAdd: IWorkspaceFolderCreationData[], donotNotifyError: boolean = false): Promise<void> {
		return this.doAddFolders(foldersToAdd, undefined, donotNotifyError);
	}

	private async doAddFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number, donotNotifyError: boolean = false): Promise<void> {
		const state = this.contextService.getWorkbenchState();
		if (this.environmentService.configuration.remoteAuthority) {

			// Do not allow workspace folders with scheme different than the current remote scheme
			const schemas = this.contextService.getWorkspace().folders.map(f => f.uri.scheme);
			if (schemas.length && foldersToAdd.some(f => schemas.indexOf(f.uri.scheme) === -1)) {
				return Promise.reject(new Error(nls.localize('differentSchemeRoots', "Workspace folders from different providers are not allowed in the same workspace.")));
			}
		}

		// If we are in no-workspace or single-folder workspace, adding folders has to
		// enter a workspace.
		if (state !== WorkbenchState.WORKSPACE) {
			let newWorkspaceFolders = this.contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri }));
			newWorkspaceFolders.splice(typeof index === 'number' ? index : newWorkspaceFolders.length, 0, ...foldersToAdd);
			newWorkspaceFolders = distinct(newWorkspaceFolders, folder => getComparisonKey(folder.uri));

			if (state === WorkbenchState.EMPTY && newWorkspaceFolders.length === 0 || state === WorkbenchState.FOLDER && newWorkspaceFolders.length === 1) {
				return; // return if the operation is a no-op for the current state
			}

			return this.createAndEnterWorkspace(newWorkspaceFolders);
		}

		// Delegate addition of folders to workspace service otherwise
		try {
			await this.contextService.addFolders(foldersToAdd, index);
		} catch (error) {
			if (donotNotifyError) {
				throw error;
			}

			this.handleWorkspaceConfigurationEditingError(error);
		}
	}

	async removeFolders(foldersToRemove: URI[], donotNotifyError: boolean = false): Promise<void> {

		// If we are in single-folder state and the opened folder is to be removed,
		// we create an empty workspace and enter it.
		if (this.includesSingleFolderWorkspace(foldersToRemove)) {
			return this.createAndEnterWorkspace([]);
		}

		// Delegate removal of folders to workspace service otherwise
		try {
			await this.contextService.removeFolders(foldersToRemove);
		} catch (error) {
			if (donotNotifyError) {
				throw error;
			}

			this.handleWorkspaceConfigurationEditingError(error);
		}
	}

	private includesSingleFolderWorkspace(folders: URI[]): boolean {
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			const workspaceFolder = this.contextService.getWorkspace().folders[0];
			return (folders.some(folder => isEqual(folder, workspaceFolder.uri)));
		}

		return false;
	}

	async createAndEnterWorkspace(folders: IWorkspaceFolderCreationData[], path?: URI): Promise<void> {
		if (path && !await this.isValidTargetWorkspacePath(path)) {
			return;
		}

		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		const untitledWorkspace = await this.workspaceService.createUntitledWorkspace(folders, remoteAuthority);
		if (path) {
			await this.saveWorkspaceAs(untitledWorkspace, path);
		} else {
			path = untitledWorkspace.configPath;
		}

		return this.enterWorkspace(path);
	}

	async saveAndEnterWorkspace(path: URI): Promise<void> {
		if (!await this.isValidTargetWorkspacePath(path)) {
			return;
		}

		const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
		if (!workspaceIdentifier) {
			return;
		}

		await this.saveWorkspaceAs(workspaceIdentifier, path);

		return this.enterWorkspace(path);
	}

	async isValidTargetWorkspacePath(path: URI): Promise<boolean> {
		const windows = await this.windowsService.getWindows();

		// Prevent overwriting a workspace that is currently opened in another window
		if (windows.some(window => !!window.workspace && isEqual(window.workspace.configPath, path))) {
			const options: MessageBoxOptions = {
				type: 'info',
				buttons: [nls.localize('ok', "OK")],
				message: nls.localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(path)),
				detail: nls.localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again."),
				noLink: true
			};
			await this.windowService.showMessageBox(options);

			return false;
		}

		return true; // OK
	}

	private async saveWorkspaceAs(workspace: IWorkspaceIdentifier, targetConfigPathURI: URI): Promise<any> {
		const configPathURI = workspace.configPath;

		// Return early if target is same as source
		if (isEqual(configPathURI, targetConfigPathURI)) {
			return;
		}

		// Read the contents of the workspace file, update it to new location and save it.
		const raw = await this.fileService.readFile(configPathURI);
		const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(raw.value.toString(), configPathURI, targetConfigPathURI);
		await this.textFileService.create(targetConfigPathURI, newRawWorkspaceContents, { overwrite: true });
	}

	private handleWorkspaceConfigurationEditingError(error: JSONEditingError): void {
		switch (error.code) {
			case JSONEditingErrorCode.ERROR_INVALID_FILE:
				this.onInvalidWorkspaceConfigurationFileError();
				break;
			case JSONEditingErrorCode.ERROR_FILE_DIRTY:
				this.onWorkspaceConfigurationFileDirtyError();
				break;
			default:
				this.notificationService.error(error.message);
		}
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

	async enterWorkspace(path: URI): Promise<void> {
		if (!!this.environmentService.extensionTestsLocationURI) {
			throw new Error('Entering a new workspace is not possible in tests.');
		}

		const workspace = await this.workspaceService.getWorkspaceIdentifier(path);

		// Settings migration (only if we come from a folder workspace)
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			await this.migrateWorkspaceSettings(workspace);
		}

		const workspaceImpl = this.contextService as WorkspaceService;
		await workspaceImpl.initialize(workspace);

		const result = await this.windowService.enterWorkspace(path);
		if (result) {

			// Migrate storage to new workspace
			await this.migrateStorage(result.workspace);

			// Reinitialize backup service
			this.environmentService.configuration.backupPath = result.backupPath;
			this.environmentService.configuration.backupWorkspaceResource = result.backupPath ? toBackupWorkspaceResource(result.backupPath, this.environmentService) : undefined;
			if (this.backupFileService instanceof BackupFileService) {
				this.backupFileService.reinitialize();
			}
		}

		// TODO@aeschli: workaround until restarting works
		if (this.environmentService.configuration.remoteAuthority) {
			this.windowService.reloadWindow();
		}

		// Restart the extension host: entering a workspace means a new location for
		// storage and potentially a change in the workspace.rootPath property.
		else {
			this.extensionService.restartExtensionHost();
		}
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
		const targetWorkspaceConfiguration: any = {};
		for (const key of this.configurationService.keys().workspace) {
			if (configurationProperties[key]) {
				if (filter && !filter(configurationProperties[key])) {
					continue;
				}

				targetWorkspaceConfiguration[key] = this.configurationService.inspect(key).workspace;
			}
		}

		return this.jsonEditingService.write(toWorkspace.configPath, { key: 'settings', value: targetWorkspaceConfiguration }, true);
	}

	private getCurrentWorkspaceIdentifier(): IWorkspaceIdentifier | undefined {
		const workspace = this.contextService.getWorkspace();
		if (workspace && workspace.configuration) {
			return { id: workspace.id, configPath: workspace.configuration };
		}
		return undefined;
	}
}

registerSingleton(IWorkspaceEditingService, WorkspaceEditingService, true);
