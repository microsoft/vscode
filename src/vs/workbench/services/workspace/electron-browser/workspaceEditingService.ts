/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { isEqual, basename } from 'vs/base/common/resources';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IFileDialogService, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { WorkspaceEditingService } from 'vs/workbench/services/workspace/browser/workspaceEditingService';
import { IElectronService } from 'vs/platform/electron/node/electron';

export class NativeWorkspaceEditingService extends WorkspaceEditingService {

	_serviceBrand: undefined;

	constructor(
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService contextService: WorkspaceService,
		@IElectronService private electronService: IElectronService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
		@IBackupFileService backupFileService: IBackupFileService,
		@INotificationService notificationService: INotificationService,
		@ICommandService commandService: ICommandService,
		@IFileService fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IWindowService windowService: IWindowService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IDialogService protected dialogService: IDialogService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILabelService labelService: ILabelService,
		@IHostService hostService: IHostService
	) {
		super(jsonEditingService, contextService, windowService, configurationService, storageService, extensionService, backupFileService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, lifecycleService, labelService, hostService);
	}

	async isValidTargetWorkspacePath(path: URI): Promise<boolean> {
		const windows = await this.electronService.getWindows();

		// Prevent overwriting a workspace that is currently opened in another window
		if (windows.some(window => !!window.workspace && isEqual(window.workspace.configPath, path))) {
			await this.dialogService.show(
				Severity.Info,
				nls.localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(path)),
				[nls.localize('ok', "OK")],
				{
					detail: nls.localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again.")
				}
			);

			return false;
		}

		return true; // OK
	}
}

registerSingleton(IWorkspaceEditingService, NativeWorkspaceEditingService, true);
