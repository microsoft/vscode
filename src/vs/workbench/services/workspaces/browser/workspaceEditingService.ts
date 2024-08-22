/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { IJSONEditingService } from '../../configuration/common/jsonEditing';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces';
import { WorkspaceService } from '../../configuration/browser/configurationService';
import { ICommandService } from '../../../../platform/commands/common/commands';
import { INotificationService } from '../../../../platform/notification/common/notification';
import { IFileService } from '../../../../platform/files/common/files';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs';
import { ITextFileService } from '../../textfile/common/textfiles';
import { IHostService } from '../../host/browser/host';
import { AbstractWorkspaceEditingService } from './abstractWorkspaceEditingService';
import { IWorkspaceEditingService } from '../common/workspaceEditing';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { URI } from '../../../../base/common/uri';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile';

export class BrowserWorkspaceEditingService extends AbstractWorkspaceEditingService {

	constructor(
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService contextService: WorkspaceService,
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
		@INotificationService notificationService: INotificationService,
		@ICommandService commandService: ICommandService,
		@IFileService fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IDialogService dialogService: IDialogService,
		@IHostService hostService: IHostService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
	) {
		super(jsonEditingService, contextService, configurationService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, hostService, uriIdentityService, workspaceTrustManagementService, userDataProfilesService, userDataProfileService);
	}

	async enterWorkspace(workspaceUri: URI): Promise<void> {
		const result = await this.doEnterWorkspace(workspaceUri);
		if (result) {

			// Open workspace in same window
			await this.hostService.openWindow([{ workspaceUri }], { forceReuseWindow: true });
		}
	}
}

registerSingleton(IWorkspaceEditingService, BrowserWorkspaceEditingService, InstantiationType.Delayed);
