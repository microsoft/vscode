/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { SimpleFileDialog } from 'vs/workbench/services/dialogs/browser/simpleFileDialog';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-browser/environmentService';

export class NativeSimpleFileDialog extends SimpleFileDialog {
	constructor(
		@IFileService fileService: IFileService,
		@IQuickInputService quickInputService: IQuickInputService,
		@ILabelService labelService: ILabelService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@INotificationService notificationService: INotificationService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IWorkbenchEnvironmentService protected environmentService: INativeWorkbenchEnvironmentService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IPathService protected pathService: IPathService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(fileService, quickInputService, labelService, workspaceContextService, notificationService, fileDialogService, modelService, modeService, environmentService, remoteAgentService, pathService, keybindingService, contextKeyService);
	}

	protected async getUserHome(): Promise<URI> {
		if (this.scheme !== Schemas.file) {
			return super.getUserHome();
		}
		return this.environmentService.userHome;
	}
}
