/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FolderLocationChangeReason, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IDidEnterWorkspaceEvent, IWillRemoveFoldersEvent, IWorkspaceEditingService, IWorkspaceFoldersEditOptions } from '../common/workspaceEditing.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { hasWorkspaceFileExtension, IAnyWorkspaceIdentifier, isSavedWorkspace, isUntitledWorkspace, isWorkspaceIdentifier, IWorkspaceContextService, IWorkspaceIdentifier, toWorkspaceIdentifier, WorkbenchState, WORKSPACE_EXTENSION, WORKSPACE_FILTER } from '../../../../platform/workspace/common/workspace.js';
import { IJSONEditingService, JSONEditingError, JSONEditingErrorCode } from '../../configuration/common/jsonEditing.js';
import { IWorkspaceFolderCreationData, IWorkspacesService, rewriteWorkspaceFileForNewLocation, IEnterWorkspaceResult, IStoredWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { WorkspaceService } from '../../configuration/browser/configurationService.js';
import { ConfigurationScope, IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { distinct } from '../../../../base/common/arrays.js';
import { basename, isEqual, isEqualAuthority, joinPath, removeTrailingPathSeparator } from '../../../../base/common/resources.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IHostService } from '../../host/browser/host.js';
import { Schemas } from '../../../../base/common/network.js';
import { SaveReason } from '../../../common/editor.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Promises } from '../../../../base/common/async.js';

export class DidEnterWorkspaceEvent implements IDidEnterWorkspaceEvent {

	private readonly promises: Promise<void>[] = [];

	constructor(
		readonly oldWorkspace: IAnyWorkspaceIdentifier,
		readonly newWorkspace: IAnyWorkspaceIdentifier
	) { }

	join(promise: Promise<void>): void {
		this.promises.push(promise);
	}

	async wait(): Promise<void> {
		await Promises.settled(this.promises);
	}
}

export abstract class AbstractWorkspaceEditingService extends Disposable implements IWorkspaceEditingService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidEnterWorkspace = this._register(new Emitter<IDidEnterWorkspaceEvent>());
	readonly onDidEnterWorkspace: Event<IDidEnterWorkspaceEvent> = this._onDidEnterWorkspace.event;

	private readonly _onWillRemoveFolders = this._register(new Emitter<IWillRemoveFoldersEvent>());
	readonly onWillRemoveFolders: Event<IWillRemoveFoldersEvent> = this._onWillRemoveFolders.event;

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
		@ILogService protected readonly logService: ILogService,
		@IWorkspaceFolderLocationService private readonly workspaceFolderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceTrustEnablementService private readonly workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
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

	private folderLocationRequest = 0;
	private pendingFolderLocationRequests = 0;

	async setFolderLocation(location: URI, options?: { readonly ifIdle?: boolean; readonly reason?: FolderLocationChangeReason; readonly folder?: URI; readonly force?: boolean }): Promise<void> {
		if (options?.ifIdle && this.pendingFolderLocationRequests > 0) {
			return;
		}

		this.pendingFolderLocationRequests++;
		try {
			await this.doSetFolderLocation(location, options?.reason, options?.folder, options?.force);
		} finally {
			this.pendingFolderLocationRequests--;
		}
	}

	private async doSetFolderLocation(location: URI, reason?: FolderLocationChangeReason, folder?: URI, force?: boolean): Promise<void> {
		const currentFolder = this.contextService.getWorkspace().folders[0];
		if (!currentFolder || !this.workspaceFolderLocationService.canSetLocation(currentFolder)) {
			throw new Error(localize('folderLocationLocalSingleFolderOnly', "Folder locations are only supported in local single-folder workspaces."));
		}

		if (folder && !this.uriIdentityService.extUri.isEqual(folder, this.contextService.getWorkspace().folders[0].uri)) {
			throw new Error(localize('folderLocationUnknownFolder', "'{0}' is not a folder of this workspace.", folder.toString()));
		}

		// Only the most recent invocation takes effect, regardless of the order in which resolutions complete
		const request = ++this.folderLocationRequest;

		const getIdentity = () => {
			if (this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER) {
				throw new Error(localize('folderLocationSingleFolderOnly', "Folder locations are only supported in single-folder workspaces."));
			}
			const workspace = this.contextService.getWorkspace();
			return workspace.uri ?? workspace.folders[0].uri;
		};
		const identity = getIdentity();
		const validatePrimary = () => {
			if (!this.uriIdentityService.extUri.isEqual(getIdentity(), identity)) {
				throw new Error(localize('folderLocationWrongPrimary', "The workspace changed while the folder location was being set."));
			}
		};

		let resolved: IResolvedFolderLocation | undefined;
		if (!this.uriIdentityService.extUri.isEqual(location, identity)) {
			if (identity.scheme !== Schemas.file || location.scheme !== Schemas.file) {
				throw new Error(localize('folderLocationLocalOnly', "Folder locations are only supported for local folders."));
			}

			resolved = await this.workspaceFolderLocationService.resolveLocation(identity, location, CancellationToken.None);
			if (!resolved) {
				throw new Error(localize('folderLocationUnknown', "'{0}' is not an alternate location of '{1}'.", location.toString(), identity.toString()));
			}

			if (request !== this.folderLocationRequest) {
				return; // superseded by a newer invocation
			}
			validatePrimary(); // the workspace may have changed while resolving
		}

		// Whether this request is still the latest one for the same workspace; it never throws
		const isCurrent = () => request === this.folderLocationRequest
			&& this.contextService.getWorkbenchState() === WorkbenchState.FOLDER
			&& this.uriIdentityService.extUri.isEqual(getIdentity(), identity);

		// Same, but a workspace change is an error
		const isFresh = () => {
			if (request !== this.folderLocationRequest) {
				return false;
			}
			validatePrimary();
			return true;
		};

		// What runs against the current location asks to be considered before the folder moves, unless the caller forces the change
		if (!force && !this.uriIdentityService.extUri.isEqual(location, currentFolder.uri)) {
			const vetoes = await this.willRemoveFolders([currentFolder.uri]);
			if (!isFresh()) {
				return;
			}
			if (vetoes.reasons.length > 0) {
				const { confirmed } = await this.dialogService.confirm({
					type: Severity.Warning,
					message: localize('confirmFolderLocationSwitch', "Switch the folder to '{0}'?", resolved?.label ?? basename(location)),
					detail: localize('confirmFolderLocationSwitchDetail', "{0}\n\nSwitching stops them.", vetoes.reasons.join('\n')),
					primaryButton: localize({ key: 'stopAndSwitch', comment: ['&& denotes a mnemonic'] }, "&&Stop and Switch")
				});
				if (!confirmed || !isFresh()) {
					return;
				}
				await vetoes.stop();
				if (!isFresh()) {
					return;
				}
			}
		}

		// Settle the trust of the destination before switching, so its settings are never applied under another trust.
		// This also applies to returning to the primary location, which has its own trust.
		// A request superseded before its trust grant starts persists no trust: freshness is checked right before each grant.
		// Once a grant has started (a built-in provider vouched for the location, or the user said yes) it completes,
		// but the superseded switch itself is not applied.
		let trusted: boolean | undefined;
		const destinationIsCurrent = this.uriIdentityService.extUri.isEqual(location, currentFolder.uri);
		if (!destinationIsCurrent && this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			const wasTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
			let destinationTrusted = (await this.workspaceTrustManagementService.getUriTrustInfo(location)).trusted;
			if (!isFresh()) {
				return;
			}

			if (!destinationTrusted) {
				if (resolved?.builtIn) {
					// A built-in provider vouches for its locations: they inherit the trust of the primary location
					const primaryTrusted = (await this.workspaceTrustManagementService.getUriTrustInfo(identity)).trusted;
					if (!isFresh()) {
						return;
					}
					if (primaryTrusted) {
						await this.workspaceTrustManagementService.setUrisTrust([location], true);
						destinationTrusted = true;
					}
				} else if (wasTrusted) {
					const { confirmed } = await this.dialogService.confirm({
						type: Severity.Info,
						message: localize('trustFolderLocationMessage', "Do you trust the authors of the files in this folder?"),
						detail: localize('trustFolderLocationDetail', "You are switching a trusted workspace to a location whose files are not currently trusted. If you do not trust them, the workspace switches in Restricted Mode."),
						cancelButton: localize('no', "No"),
						custom: { icon: Codicon.shield }
					});
					if (!isFresh()) {
						return; // a superseded request does not persist trust
					}
					if (confirmed) {
						await this.workspaceTrustManagementService.setUrisTrust([location], true);
						destinationTrusted = true;
					}
				}
			}
			trusted = destinationTrusted;
		}

		if (!isFresh()) {
			return; // superseded by a newer invocation, or the workspace changed
		}

		// The queued switch is skipped when superseded while waiting for earlier workspace edits.
		// The location metadata is published as soon as the switch was applied, so it always follows the last applied switch.
		await this.contextService.setFolderLocation(location, {
			trusted,
			isCurrent,
			onApplied: () => {
				const folder = this.contextService.getWorkspace().folders[0];
				if (folder && this.uriIdentityService.extUri.isEqual(folder.uri, location)) {
					this.workspaceFolderLocationService.setLocation(folder, resolved, reason);
				}
			}
		});
	}

	/**
	 * Asks what runs against `folders` ({@link onWillRemoveFolders}) whether they can leave the workspace without the user's confirmation.
	 */
	private async willRemoveFolders(folders: readonly URI[]): Promise<{ readonly reasons: readonly string[]; stop(): Promise<void> }> {
		const pending: Promise<string | readonly string[] | undefined>[] = [];
		const stops: (() => Promise<void>)[] = [];
		this._onWillRemoveFolders.fire({
			folders,
			veto: (reasons, stop) => {
				pending.push(Promise.resolve(reasons));
				if (stop) {
					stops.push(stop);
				}
			}
		});

		const reasons = new Set<string>();
		for (const result of await Promise.all(pending)) {
			for (const reason of result === undefined ? [] : typeof result === 'string' ? [result] : result) {
				reasons.add(reason);
			}
		}

		return {
			reasons: [...reasons],
			stop: async () => {
				const results = await Promise.allSettled(stops.map(stop => stop()));
				const failure = results.find(result => result.status === 'rejected');
				if (failure) {
					throw failure.reason;
				}
			}
		};
	}

	/**
	 * Asks the user to confirm the removal of `folders` when something runs against them, and stops what runs.
	 * Returns whether the folders can be removed.
	 */
	private async confirmRemoveFolders(folders: readonly URI[]): Promise<boolean> {
		if (folders.length === 0) {
			return true;
		}

		const vetoes = await this.willRemoveFolders(folders);
		if (vetoes.reasons.length === 0) {
			return true;
		}

		const names = folders.map(folder => this.contextService.getWorkspaceFolder(folder)?.name ?? basename(folder));
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Warning,
			message: names.length === 1
				? localize('confirmRemoveFolder', "Remove the folder '{0}'?", names[0])
				: localize('confirmRemoveFolders', "Remove the folders {0}?", names.join(', ')),
			detail: localize('confirmRemoveFoldersDetail', "{0}\n\nRemoving stops them.", vetoes.reasons.join('\n')),
			primaryButton: localize({ key: 'stopAndRemove', comment: ['&& denotes a mnemonic'] }, "&&Stop and Remove")
		});
		if (!confirmed) {
			return false;
		}

		await vetoes.stop();
		return true;
	}

	/**
	 * The folders of an update that actually leave the workspace: those that are not added again.
	 */
	private getLeavingFolders(foldersToDelete: readonly URI[], foldersToAdd: readonly IWorkspaceFolderCreationData[]): URI[] {
		return foldersToDelete.filter(folder => !foldersToAdd.some(added => this.uriIdentityService.extUri.isEqual(added.uri, folder)));
	}

	async updateFolders(index: number, deleteCount?: number, foldersToAddCandidates?: IWorkspaceFolderCreationData[], options?: IWorkspaceFoldersEditOptions): Promise<void> {
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
			return this.doAddFolders(foldersToAdd, index, options?.donotNotifyError);
		}

		// Delete Folders
		if (wantsToDelete && !wantsToAdd) {
			return this.removeFolders(foldersToDelete, { force: options?.force });
		}

		// Add & Delete Folders
		else {

			// if we are in single-folder state and the folder is replaced with
			// other folders, we handle this specially and just enter workspace
			// mode with the folders that are being added.
			if (this.includesSingleFolderWorkspace(foldersToDelete)) {
				if (!options?.force && !await this.confirmRemoveFolders(this.getLeavingFolders(foldersToDelete, foldersToAdd))) {
					return;
				}
				return this.createAndEnterWorkspace(foldersToAdd);
			}

			// if we are not in workspace-state, we just add the folders
			if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
				return this.doAddFolders(foldersToAdd, index, options?.donotNotifyError);
			}

			// finally, update folders within the workspace
			return this.doUpdateFolders(foldersToAdd, foldersToDelete, index, options);
		}
	}

	private async doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToDelete: URI[], index?: number, options?: IWorkspaceFoldersEditOptions): Promise<void> {
		if (!options?.force && !await this.confirmRemoveFolders(this.getLeavingFolders(foldersToDelete, foldersToAdd))) {
			return;
		}

		try {
			await this.contextService.updateFolders(foldersToAdd, foldersToDelete, index);
		} catch (error) {
			if (options?.donotNotifyError) {
				throw error;
			}

			this.handleWorkspaceConfigurationEditingError(error);
		}
	}

	addFolders(foldersToAddCandidates: IWorkspaceFolderCreationData[], donotNotifyError = false): Promise<void> {

		// Normalize
		const foldersToAdd = foldersToAddCandidates.map(folderToAdd => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));

		return this.doAddFolders(foldersToAdd, undefined, donotNotifyError);
	}

	private async doAddFolders(foldersToAdd: IWorkspaceFolderCreationData[], index?: number, donotNotifyError = false): Promise<void> {
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

	async removeFolders(foldersToRemove: URI[], options?: IWorkspaceFoldersEditOptions): Promise<void> {

		// If we are in single-folder state and the opened folder is to be removed,
		// we create an empty workspace and enter it.
		if (this.includesSingleFolderWorkspace(foldersToRemove)) {
			if (!options?.force && !await this.confirmRemoveFolders(foldersToRemove)) {
				return;
			}
			return this.createAndEnterWorkspace([]);
		}

		if (!options?.force && !await this.confirmRemoveFolders(foldersToRemove)) {
			return;
		}

		// Delegate removal of folders to workspace service otherwise
		try {
			await this.contextService.removeFolders(foldersToRemove);
		} catch (error) {
			if (options?.donotNotifyError) {
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

	protected async fireDidEnterWorkspace(oldWorkspace: IAnyWorkspaceIdentifier, newWorkspace: IAnyWorkspaceIdentifier): Promise<void> {
		const event = new DidEnterWorkspaceEvent(oldWorkspace, newWorkspace);
		this._onDidEnterWorkspace.fire(event);

		try {
			await event.wait();
		} catch (error) {
			this.logService.error('Error while waiting for participants of onDidEnterWorkspace to join:', error);
		}
	}

	protected async doEnterWorkspace(workspaceUri: URI): Promise<IEnterWorkspaceResult | undefined> {
		if (this.environmentService.extensionTestsLocationURI) {
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
		const targetWorkspaceConfiguration: Record<string, unknown> = {};
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
