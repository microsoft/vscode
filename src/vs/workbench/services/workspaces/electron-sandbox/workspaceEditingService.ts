/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls';
import { IWorkspaceEditingService } from '../common/workspaceEditing';
import { URI } from '../../../../base/common/uri';
import { hasWorkspaceFileExtension, isUntitledWorkspace, isWorkspaceIdentifier, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { IJSONEditingService } from '../../configuration/common/jsonEditing';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces';
import { WorkspaceService } from '../../configuration/browser/configurationService';
import { IStorageService } from '../../../../platform/storage/common/storage';
import { IExtensionService } from '../../extensions/common/extensions';
import { IWorkingCopyBackupService } from '../../workingCopy/common/workingCopyBackup';
import { ICommandService } from '../../../../platform/commands/common/commands';
import { basename } from '../../../../base/common/resources';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification';
import { IFileService } from '../../../../platform/files/common/files';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService';
import { ILifecycleService, ShutdownReason } from '../../lifecycle/common/lifecycle';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label';
import { ITextFileService } from '../../textfile/common/textfiles';
import { IHostService } from '../../host/browser/host';
import { AbstractWorkspaceEditingService } from '../browser/abstractWorkspaceEditingService';
import { INativeHostService } from '../../../../platform/native/common/native';
import { isMacintosh } from '../../../../base/common/platform';
import { WorkingCopyBackupService } from '../../workingCopy/common/workingCopyBackupService';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration';

export class NativeWorkspaceEditingService extends AbstractWorkspaceEditingService {

	constructor(
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService contextService: WorkspaceService,
		@INativeHostService private nativeHostService: INativeHostService,
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService,
		@IWorkingCopyBackupService private workingCopyBackupService: IWorkingCopyBackupService,
		@INotificationService notificationService: INotificationService,
		@ICommandService commandService: ICommandService,
		@IFileService fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IDialogService dialogService: IDialogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService hostService: IHostService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
	) {
		super(jsonEditingService, contextService, configurationService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, hostService, uriIdentityService, workspaceTrustManagementService, userDataProfilesService, userDataProfileService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.lifecycleService.onBeforeShutdown(e => {
			const saveOperation = this.saveUntitledBeforeShutdown(e.reason);
			e.veto(saveOperation, 'veto.untitledWorkspace');
		}));
	}

	private async saveUntitledBeforeShutdown(reason: ShutdownReason): Promise<boolean> {
		if (reason !== ShutdownReason.LOAD && reason !== ShutdownReason.CLOSE) {
			return false; // only interested when window is closing or loading
		}

		const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
		if (!workspaceIdentifier || !isUntitledWorkspace(workspaceIdentifier.configPath, this.environmentService)) {
			return false; // only care about untitled workspaces to ask for saving
		}

		const windowCount = await this.nativeHostService.getWindowCount();
		if (reason === ShutdownReason.CLOSE && !isMacintosh && windowCount === 1) {
			return false; // Windows/Linux: quits when last window is closed, so do not ask then
		}

		const confirmSaveUntitledWorkspace = this.configurationService.getValue<boolean>('window.confirmSaveUntitledWorkspace') !== false;
		if (!confirmSaveUntitledWorkspace) {
			await this.workspacesService.deleteUntitledWorkspace(workspaceIdentifier);

			return false; // no confirmation configured
		}

		let canceled = false;
		const { result, checkboxChecked } = await this.dialogService.prompt<boolean>({
			type: Severity.Warning,
			message: localize('saveWorkspaceMessage', "Do you want to save your workspace configuration as a file?"),
			detail: localize('saveWorkspaceDetail', "Save your workspace if you plan to open it again."),
			buttons: [
				{
					label: localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save"),
					run: async () => {
						const newWorkspacePath = await this.pickNewWorkspacePath();
						if (!newWorkspacePath || !hasWorkspaceFileExtension(newWorkspacePath)) {
							return true; // keep veto if no target was provided
						}

						try {
							await this.saveWorkspaceAs(workspaceIdentifier, newWorkspacePath);

							// Make sure to add the new workspace to the history to find it again
							const newWorkspaceIdentifier = await this.workspacesService.getWorkspaceIdentifier(newWorkspacePath);
							await this.workspacesService.addRecentlyOpened([{
								label: this.labelService.getWorkspaceLabel(newWorkspaceIdentifier, { verbose: Verbosity.LONG }),
								workspace: newWorkspaceIdentifier,
								remoteAuthority: this.environmentService.remoteAuthority // remember whether this was a remote window
							}]);

							// Delete the untitled one
							await this.workspacesService.deleteUntitledWorkspace(workspaceIdentifier);
						} catch (error) {
							// ignore
						}

						return false;
					}
				},
				{
					label: localize({ key: 'doNotSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
					run: async () => {
						await this.workspacesService.deleteUntitledWorkspace(workspaceIdentifier);

						return false;
					}
				}
			],
			cancelButton: {
				run: () => {
					canceled = true;

					return true; // veto
				}
			},
			checkbox: {
				label: localize('doNotAskAgain', "Always discard untitled workspaces without asking")
			}
		});

		if (!canceled && checkboxChecked) {
			await this.configurationService.updateValue('window.confirmSaveUntitledWorkspace', false, ConfigurationTarget.USER);
		}

		return result;
	}

	override async isValidTargetWorkspacePath(workspaceUri: URI): Promise<boolean> {
		const windows = await this.nativeHostService.getWindows({ includeAuxiliaryWindows: false });

		// Prevent overwriting a workspace that is currently opened in another window
		if (windows.some(window => isWorkspaceIdentifier(window.workspace) && this.uriIdentityService.extUri.isEqual(window.workspace.configPath, workspaceUri))) {
			await this.dialogService.info(
				localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(workspaceUri)),
				localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again.")
			);

			return false;
		}

		return true; // OK
	}

	async enterWorkspace(workspaceUri: URI): Promise<void> {
		const stopped = await this.extensionService.stopExtensionHosts(localize('restartExtensionHost.reason', "Opening a multi-root workspace."));
		if (!stopped) {
			return;
		}

		const result = await this.doEnterWorkspace(workspaceUri);
		if (result) {

			// Migrate storage to new workspace
			await this.storageService.switch(result.workspace, true /* preserve data */);

			// Reinitialize backup service
			if (this.workingCopyBackupService instanceof WorkingCopyBackupService) {
				const newBackupWorkspaceHome = result.backupPath ? URI.file(result.backupPath).with({ scheme: this.environmentService.userRoamingDataHome.scheme }) : undefined;
				this.workingCopyBackupService.reinitialize(newBackupWorkspaceHome);
			}
		}

		// TODO@aeschli: workaround until restarting works
		if (this.environmentService.remoteAuthority) {
			this.hostService.reload();
		}

		// Restart the extension host: entering a workspace means a new location for
		// storage and potentially a change in the workspace.rootPath property.
		else {
			this.extensionService.startExtensionHosts();
		}
	}
}

registerSingleton(IWorkspaceEditingService, NativeWorkspaceEditingService, InstantiationType.Delayed);
