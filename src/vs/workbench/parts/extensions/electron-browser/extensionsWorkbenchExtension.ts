/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { LegacyWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import { ipcRenderer as ipc } from 'electron';

interface IInstallExtensionsRequest {
	extensionsToInstall: string[];
}

// TODO@Joao retire this beast
export class ExtensionsWorkbenchExtension implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IExtensionTipsService extenstionTips: IExtensionTipsService, // this is to eagerly start the service
		@IExtensionGalleryService galleryService: IExtensionGalleryService
	) {
		this.registerListeners();

		const options = (<LegacyWorkspaceContextService>contextService).getOptions();

		if (options.extensionsToInstall && options.extensionsToInstall.length) {
			this.install(options.extensionsToInstall).done(null, onUnexpectedError);
		}

		//actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(InstallExtensionAction, InstallExtensionAction.ID, InstallExtensionAction.LABEL), 'Extensions: Install Extension', ExtensionsLabel);
	}

	private registerListeners(): void {
		ipc.on('vscode:installExtensions', (event, request: IInstallExtensionsRequest) => {
			if (request.extensionsToInstall) {
				this.install(request.extensionsToInstall).done(null, onUnexpectedError);
			}
		});
	}

	private install(extensions: string[]): TPromise<void> {
		return TPromise.join(extensions.map(extPath =>	this.extensionManagementService.install(extPath)))
			.then(() => {
				this.messageService.show(
					Severity.Info,
					{
						message: extensions.length > 1 ? localize('success', "Extensions were successfully installed. Restart to enable them.")
							: localize('successSingle', "Extension was successfully installed. Restart to enable it."),
						actions: [this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, localize('reloadNow', "Restart Now"))]
					}
				);
			});
	}

	public getId(): string {
		return 'vs.extensions.workbenchextension';
	}
}