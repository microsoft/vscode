/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { IWorkspaceEditingService } from '../common/workspaceEditing.js';
import { URI } from '../../../../base/common/uri.js';
import { hasWorkspaceFileExtension, isUntitledWorkspace, isWorkspaceIdentifier, IWorkspaceContextService, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IWorkingCopyBackupService } from '../../workingCopy/common/workingCopyBackup.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { basename } from '../../../../base/common/resources.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IHostService } from '../../host/browser/host.js';
import { AbstractWorkspaceEditingService } from '../browser/abstractWorkspaceEditingService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { WorkingCopyBackupService } from '../../workingCopy/common/workingCopyBackupService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { ILogService } from '../../../../platform/log/common/log.js';
let NativeWorkspaceEditingService = class NativeWorkspaceEditingService extends AbstractWorkspaceEditingService {
    constructor(jsonEditingService, contextService, nativeHostService, configurationService, storageService, extensionService, workingCopyBackupService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, lifecycleService, labelService, hostService, uriIdentityService, workspaceTrustManagementService, userDataProfilesService, userDataProfileService, logService) {
        super(jsonEditingService, contextService, configurationService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, hostService, uriIdentityService, workspaceTrustManagementService, userDataProfilesService, userDataProfileService, logService);
        this.nativeHostService = nativeHostService;
        this.storageService = storageService;
        this.extensionService = extensionService;
        this.workingCopyBackupService = workingCopyBackupService;
        this.lifecycleService = lifecycleService;
        this.labelService = labelService;
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.lifecycleService.onBeforeShutdown(e => {
            const saveOperation = this.saveUntitledBeforeShutdown(e.reason);
            e.veto(saveOperation, 'veto.untitledWorkspace');
        }));
    }
    async saveUntitledBeforeShutdown(reason) {
        if (reason !== 4 /* ShutdownReason.LOAD */ && reason !== 1 /* ShutdownReason.CLOSE */) {
            return false; // only interested when window is closing or loading
        }
        const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
        if (!workspaceIdentifier || !isUntitledWorkspace(workspaceIdentifier.configPath, this.environmentService)) {
            return false; // only care about untitled workspaces to ask for saving
        }
        const windowCount = await this.nativeHostService.getWindowCount();
        if (reason === 1 /* ShutdownReason.CLOSE */ && !isMacintosh && windowCount === 1) {
            return false; // Windows/Linux: quits when last window is closed, so do not ask then
        }
        const confirmSaveUntitledWorkspace = this.configurationService.getValue('window.confirmSaveUntitledWorkspace') !== false;
        if (!confirmSaveUntitledWorkspace) {
            await this.workspacesService.deleteUntitledWorkspace(workspaceIdentifier);
            return false; // no confirmation configured
        }
        let canceled = false;
        const { result, checkboxChecked } = await this.dialogService.prompt({
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
                                    label: this.labelService.getWorkspaceLabel(newWorkspaceIdentifier, { verbose: 2 /* Verbosity.LONG */ }),
                                    workspace: newWorkspaceIdentifier,
                                    remoteAuthority: this.environmentService.remoteAuthority // remember whether this was a remote window
                                }]);
                            // Delete the untitled one
                            await this.workspacesService.deleteUntitledWorkspace(workspaceIdentifier);
                        }
                        catch (error) {
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
            await this.configurationService.updateValue('window.confirmSaveUntitledWorkspace', false, 2 /* ConfigurationTarget.USER */);
        }
        return result;
    }
    async isValidTargetWorkspacePath(workspaceUri) {
        const windows = await this.nativeHostService.getWindows({ includeAuxiliaryWindows: false });
        // Prevent overwriting a workspace that is currently opened in another window
        if (windows.some(window => isWorkspaceIdentifier(window.workspace) && this.uriIdentityService.extUri.isEqual(window.workspace.configPath, workspaceUri))) {
            await this.dialogService.info(localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(workspaceUri)), localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again."));
            return false;
        }
        return true; // OK
    }
    async enterWorkspace(workspaceUri) {
        const stopped = await this.extensionService.stopExtensionHosts(localize('restartExtensionHost.reason', "Opening a multi-root workspace"));
        if (!stopped) {
            return;
        }
        const oldWorkspace = toWorkspaceIdentifier(this.contextService.getWorkspace());
        const result = await this.doEnterWorkspace(workspaceUri);
        if (result) {
            // Migrate storage to new workspace
            await this.storageService.switch(result.workspace, true /* preserve data */);
            // Reinitialize backup service
            if (this.workingCopyBackupService instanceof WorkingCopyBackupService) {
                const newBackupWorkspaceHome = result.backupPath ? URI.file(result.backupPath).with({ scheme: this.environmentService.userRoamingDataHome.scheme }) : undefined;
                this.workingCopyBackupService.reinitialize(newBackupWorkspaceHome);
            }
            // Fire event to allow participants to join
            await this.fireDidEnterWorkspace(oldWorkspace, result.workspace);
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
};
NativeWorkspaceEditingService = __decorate([
    __param(0, IJSONEditingService),
    __param(1, IWorkspaceContextService),
    __param(2, INativeHostService),
    __param(3, IWorkbenchConfigurationService),
    __param(4, IStorageService),
    __param(5, IExtensionService),
    __param(6, IWorkingCopyBackupService),
    __param(7, INotificationService),
    __param(8, ICommandService),
    __param(9, IFileService),
    __param(10, ITextFileService),
    __param(11, IWorkspacesService),
    __param(12, INativeWorkbenchEnvironmentService),
    __param(13, IFileDialogService),
    __param(14, IDialogService),
    __param(15, ILifecycleService),
    __param(16, ILabelService),
    __param(17, IHostService),
    __param(18, IUriIdentityService),
    __param(19, IWorkspaceTrustManagementService),
    __param(20, IUserDataProfilesService),
    __param(21, IUserDataProfileService),
    __param(22, ILogService)
], NativeWorkspaceEditingService);
export { NativeWorkspaceEditingService };
registerSingleton(IWorkspaceEditingService, NativeWorkspaceEditingService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlRWRpdGluZ1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya3NwYWNlcy9lbGVjdHJvbi1icm93c2VyL3dvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLHdCQUF3QixFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDNUwsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUs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