/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceEditingService } from '../common/workspaceEditing.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { hasWorkspaceFileExtension, isSavedWorkspace, isUntitledWorkspace, isWorkspaceIdentifier, IWorkspaceContextService, IWorkspaceIdentifier, toWorkspaceIdentifier, WorkbenchState, WORKSPACE_EXTENSION, WORKSPACE_FILTER } from '../../../../platform/workspace/common/workspace.js';
import { IJSONEditingService, JSONEditingError, JSONEditingErrorCode } from '../../configuration/common/jsonEditing.js';
import { IWorkspaceFolderCreationData, IWorkspacesService, rewriteWorkspaceFileForNewLocation, IEnterWorkspaceResult, IStoredWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { WorkspaceService } from '../../configuration/browser/configurationService.js';
import { ConfigurationScope, IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { distinct } from '../../../../base/common/arrays.js';
import { basename, isEqual, isEqualAuthority, joinPath, removeTrailingPathSeparator } from '../../../../base/common/resources.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IHostService } from '../../host/browser/host.js';
import { Schemas } from '../../../../base/common/network.js';
import { SaveReason } from '../../../common/editor.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export abstract class AbstractWorkspaceEditingService extends Disposable implements IWorkspaceEditingService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService protected readonly contextService: WorkspaceService,
		@IWorkbenchConfigurationService protected readonly configurationService: IWorkbenchConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkspacesService protected readonly workspacesService: IWorkspacesService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IDialogService protected readonly dialogService: IDialogService,
		@IHostService protected readonly hostService: IHostService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
	) {
		super();
	}

	async pickNewWorkspacePath(): Promise<URI | undefined> {
		const availableFileSystems = [Schemas.file];
		if (this.environmentService.remoteAuthority) {
			availableFileSystems.unshift(Schemas.vscodeRemote);
		}
		let workspacePath = await this.fileDialogService.showSaveDialog({
			saveLabel: localize('save', "Save"),
			title: localize('saveWorkspace', "Save Workspace"),
			filters: WORKSPACE_FILTER,
			defaultUri: joinPath(await this.fileDialogService.defaultWorkspacePath(), this.getNewWorkspaceName()),
			availableFileSystems
		});

		if (!workspacePath) {
			return; // canceled
		}

		if (!hasWorkspaceFileExtension(workspacePath)) {
			// Always ensure we have workspace file extension
			// (see https://github.com/microsoft/vscode/issues/84818)
			workspacePath = workspacePath.with({ path: `${workspacePath.path}.${WORKSPACE_EXTENSION}` });
		}

		return workspacePath;
	}

	private getNewWorkspaceName(): string {

		// First try with existing workspace name
		const configPathURI = this.getCurrentWorkspaceIdentifier()?.configPath;
		if (configPathURI && isSavedWorkspace(configPathURI, this.environmentService)) {
			return basename(configPathURI);
		}

		// Then fallback to first folder if any
		const folder = this.contextService.getWorkspace().folders.at(0);
		if (folder) {
			return `${basename(folder.uri)}.${WORKSPACE_EXTENSION}`;
		}

		// Finally pick a good default
		return `workspace.${WORKSPACE_EXTENSION}`;
	}

	async updateFolders(index: number, deleteCount?: number, foldersToAddCandidates?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void> {
		const folders = this.contextService.getWorkspace().folders;

		let foldersToDelete: URI[] = [];
		if (typeof deleteCount === 'number') {
			foldersToDelete = folders.slice(index, index + deleteCount).map(folder => folder.uri);
		}

		let foldersToAdd: IWorkspaceFolderCreationData[] = [];
		if (Array.isArray(foldersToAddCandidates)) {
			foldersToAdd = foldersToAddCandidates.map(folderToAdd => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name })); // Normalize
		}

		const wantsToDelete = foldersToDelete.length > 0;
		const wantsToAdd = foldersToAdd.length > 0;

		if (!wantsToAdd && !wantsToDelete) {
			return; // return early if there is nothing to do
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

	addFolders(foldersToAddCandidates: IWorkspaceFolderCreationData[], donotNotifyError: boolean = false): Promise<void> {

		// Normalize
		const foldersToAdd = foldersToAddCandidates.map(folderToAdd => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));

		return this.doAddFolders(foldersToAdd, undefined, donotNotifyError);
	}

	private async doAddFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number, donotNotifyError: boolean = false): Promise<void> {
		const state = this.contextService.getWorkbenchState();
		const remoteAuthority = this.environmentService.remoteAuthority;
		if (remoteAuthority) {
			// https://github.com/microsoft/vscode/issues/94191
			foldersToAdd = foldersToAdd.filter(folder => folder.uri.scheme !== Schemas.file && (folder.uri.scheme !== Schemas.vscodeRemote || isEqualAuthority(folder.uri.authority, remoteAuthority)));
		}

		// If we are in no-workspace or single-folder workspace, adding folders has to
		// enter a workspace.
		if (state !== WorkbenchState.WORKSPACE) {
			let newWorkspaceFolders = this.contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri }));
			newWorkspaceFolders.splice(typeof index === 'number' ? index : newWorkspaceFolders.length, 0, ...foldersToAdd);
			newWorkspaceFolders = distinct(newWorkspaceFolders, folder => this.uriIdentityService.extUri.getComparisonKey(folder.uri));

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
			return (folders.some(folder => this.uriIdentityService.extUri.isEqual(folder, workspaceFolder.uri)));
		}

		return false;
	}

	async createAndEnterWorkspace(folders: IWorkspaceFolderCreationData[], path?: URI): Promise<void> {
		if (path && !await this.isValidTargetWorkspacePath(path)) {
			return;
		}

		const remoteAuthority = this.environmentService.remoteAuthority;
		const untitledWorkspace = await this.workspacesService.createUntitledWorkspace(folders, remoteAuthority);
		if (path) {
			try {
				await this.saveWorkspaceAs(untitledWorkspace, path);
			} finally {
				await this.workspacesService.deleteUntitledWorkspace(untitledWorkspace); // https://github.com/microsoft/vscode/issues/100276
			}
		} else {
			path = untitledWorkspace.configPath;
			if (!this.userDataProfileService.currentProfile.isDefault) {
				await this.userDataProfilesService.setProfileForWorkspace(untitledWorkspace, this.userDataProfileService.currentProfile);
			}
		}

		return this.enterWorkspace(path);
	}

	async saveAndEnterWorkspace(workspaceUri: URI): Promise<void> {
		const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
		if (!workspaceIdentifier) {
			return;
		}

		// Allow to save the workspace of the current window
		// if we have an identical match on the path
		if (isEqual(workspaceIdentifier.configPath, workspaceUri)) {
			return this.saveWorkspace(workspaceIdentifier);
		}

		// From this moment on we require a valid target that is not opened already
		if (!await this.isValidTargetWorkspacePath(workspaceUri)) {
			return;
		}

		await this.saveWorkspaceAs(workspaceIdentifier, workspaceUri);

		return this.enterWorkspace(workspaceUri);
	}

	async isValidTargetWorkspacePath(workspaceUri: URI): Promise<boolean> {
		return true; // OK
	}

	protected async saveWorkspaceAs(workspace: IWorkspaceIdentifier, targetConfigPathURI: URI): Promise<void> {
		const configPathURI = workspace.configPath;

		const isNotUntitledWorkspace = !isUntitledWorkspace(targetConfigPathURI, this.environmentService);
		if (isNotUntitledWorkspace && !this.userDataProfileService.currentProfile.isDefault) {
			const newWorkspace = await this.workspacesService.getWorkspaceIdentifier(targetConfigPathURI);
			await this.userDataProfilesService.setProfileForWorkspace(newWorkspace, this.userDataProfileService.currentProfile);
		}

		// Return early if target is same as source
		if (this.uriIdentityService.extUri.isEqual(configPathURI, targetConfigPathURI)) {
			return;
		}

		const isFromUntitledWorkspace = isUntitledWorkspace(configPathURI, this.environmentService);

		// Read the contents of the workspace file, update it to new location and save it.
		const raw = await this.fileService.readFile(configPathURI);
		const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(raw.value.toString(), configPathURI, isFromUntitledWorkspace, targetConfigPathURI, this.uriIdentityService.extUri);
		await this.textFileService.create([{ resource: targetConfigPathURI, value: newRawWorkspaceContents, options: { overwrite: true } }]);

		// Set trust for the workspace file
		await this.trustWorkspaceConfiguration(targetConfigPathURI);
	}

	protected async saveWorkspace(workspace: IWorkspaceIdentifier): Promise<void> {
		const configPathURI = workspace.configPath;

		// First: try to save any existing model as it could be dirty
		const existingModel = this.textFileService.files.get(configPathURI);
		if (existingModel) {
			await existingModel.save({ force: true, reason: SaveReason.EXPLICIT });
			return;
		}

		// Second: if the file exists on disk, simply return
		const workspaceFileExists = await this.fileService.exists(configPathURI);
		if (workspaceFileExists) {
			return;
		}

		// Finally, we need to re-create the file as it was deleted
		const newWorkspace: IStoredWorkspace = { folders: [] };
		const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(JSON.stringify(newWorkspace, null, '\t'), configPathURI, false, configPathURI, this.uriIdentityService.extUri);
		await this.textFileService.create([{ resource: configPathURI, value: newRawWorkspaceContents }]);
	}

	private handleWorkspaceConfigurationEditingError(error: JSONEditingError): void {
		switch (error.code) {
			case JSONEditingErrorCode.ERROR_INVALID_FILE:
				this.onInvalidWorkspaceConfigurationFileError();
				break;
			default:
				this.notificationService.error(error.message);
		}
	}

	private onInvalidWorkspaceConfigurationFileError(): void {
		const message = localize('errorInvalidTaskConfiguration', "Unable to write into workspace configuration file. Please open the file to correct errors/warnings in it and try again.");
		this.askToOpenWorkspaceConfigurationFile(message);
	}

	private askToOpenWorkspaceConfigurationFile(message: string): void {
		this.notificationService.prompt(Severity.Error, message,
			[{
				label: localize('openWorkspaceConfigurationFile', "Open Workspace Configuration"),
				run: () => this.commandService.executeCommand('workbench.action.openWorkspaceConfigFile')
			}]
		);
	}

	abstract enterWorkspace(workspaceUri: URI): Promise<void>;

	protected async doEnterWorkspace(workspaceUri: URI): Promise<IEnterWorkspaceResult | undefined> {
		if (!!this.environmentService.extensionTestsLocationURI) {
			throw new Error('Entering a new workspace is not possible in tests.');
		}

		const workspace = await this.workspacesService.getWorkspaceIdentifier(workspaceUri);

		// Settings migration (only if we come from a folder workspace)
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			await this.migrateWorkspaceSettings(workspace);
		}

		await this.configurationService.initialize(workspace);

		return this.workspacesService.enterWorkspace(workspaceUri);
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

				targetWorkspaceConfiguration[key] = this.configurationService.inspect(key).workspaceValue;
			}
		}

		return this.jsonEditingService.write(toWorkspace.configPath, [{ path: ['settings'], value: targetWorkspaceConfiguration }], true);
	}

	private async trustWorkspaceConfiguration(configPathURI: URI): Promise<void> {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			await this.workspaceTrustManagementService.setUrisTrust([configPathURI], true);
		}
	}

	protected getCurrentWorkspaceIdentifier(): IWorkspaceIdentifier | undefined {
		const identifier = toWorkspaceIdentifier(this.contextService.getWorkspace());
		if (isWorkspaceIdentifier(identifier)) {
			return identifier;
		}

		return undefined;
	}
}
