/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { Promise } from 'vs/base/common/winjs.base';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import {ipcRenderer as ipc} from 'electron';

interface IInstallExtensionsRequest {
	extensionsToInstall: string[];
}

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

		const options = contextService.getOptions();
		// Extensions to install
		if (options.extensionsToInstall && options.extensionsToInstall.length) {
			this.install(options.extensionsToInstall).done(null, errors.onUnexpectedError);
		}

		// const actionRegistry = (<wbaregistry.IWorkbenchActionRegistry> platform.Registry.as(wbaregistry.Extensions.WorkbenchActions));
		// actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ListExtensionsAction, ListExtensionsAction.ID, ListExtensionsAction.LABEL), 'Extensions: Show Installed Extensions', ExtensionsLabel);
	}

	private registerListeners(): void {
		ipc.on('vscode:installExtensions', (event, request: IInstallExtensionsRequest) => {
			if (request.extensionsToInstall) {
				this.install(request.extensionsToInstall).done(null, errors.onUnexpectedError);
			}
		});
	}

	private install(extensions: string[]): Promise {
		return Promise.join(extensions.map(extPath =>	this.extensionManagementService.install(extPath)))
			.then(extensions => {
				this.messageService.show(
					Severity.Info,
					{
						message: extensions.length > 1 ? nls.localize('success', "Extensions were successfully installed. Restart to enable them.")
							: nls.localize('successSingle', "{0} was successfully installed. Restart to enable it.", extensions[0].displayName),
						actions: [this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, nls.localize('reloadNow', "Restart Now"))]
					}
				);
			});
	}

	public getId(): string {
		return 'vs.extensions.workbenchextension';
	}
}
