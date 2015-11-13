/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import platform = require('vs/platform/platform');
import { Promise } from 'vs/base/common/winjs.base';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionsService, IGalleryService } from 'vs/workbench/parts/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IPath } from 'vs/workbench/electron-main/window';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import wbaregistry = require('vs/workbench/browser/actionRegistry');
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ListExtensionsAction, InstallExtensionAction } from './extensionsActions';
import { IQuickOpenRegistry, Extensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';

import ipc = require('ipc');

interface IInstallExtensionsRequest {
	extensionsToInstall: string[];
}

export class ExtensionsWorkbenchExtension implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsService private extensionsService: IExtensionsService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IGalleryService galleryService: IGalleryService
	) {
		this.registerListeners();

		const options = contextService.getOptions();
		// Extensions to install
		if (options.extensionsToInstall && options.extensionsToInstall.length) {
			this.install(options.extensionsToInstall).done(null, errors.onUnexpectedError);
		}

		const extensionsCategory = nls.localize('extensionsCategory', "Extensions");
		const actionRegistry = (<wbaregistry.IWorkbenchActionRegistry> platform.Registry.as(wbaregistry.Extensions.WorkbenchActions));
		actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ListExtensionsAction, ListExtensionsAction.ID, ListExtensionsAction.LABEL), extensionsCategory);

		(<IQuickOpenRegistry>platform.Registry.as(Extensions.Quickopen)).registerQuickOpenHandler(
			new QuickOpenHandlerDescriptor(
				'vs/workbench/parts/extensions/electron-browser/extensionsQuickOpen',
				'LocalExtensionsHandler',
				'ext ',
				nls.localize('localExtensionsCommands', "Local Extensions Commands")
			)
		);

		if (galleryService.isEnabled()) {
			actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(InstallExtensionAction, InstallExtensionAction.ID, InstallExtensionAction.LABEL), extensionsCategory);

			(<IQuickOpenRegistry>platform.Registry.as(Extensions.Quickopen)).registerQuickOpenHandler(
				new QuickOpenHandlerDescriptor(
					'vs/workbench/parts/extensions/electron-browser/extensionsQuickOpen',
					'GalleryExtensionsHandler',
					'ext install ',
					nls.localize('galleryExtensionsCommands', "Gallery Extensions Commands"),
					true
				)
			);
		}
	}

	private registerListeners(): void {
		ipc.on('vscode:installExtensions', (request: IInstallExtensionsRequest) => {
			if (request.extensionsToInstall) {
				this.install(request.extensionsToInstall).done(null, errors.onUnexpectedError);
			}
		});
	}

	private install(extensions: string[]): Promise {
		return Promise.join(extensions.map(extPath =>	this.extensionsService.install(extPath)))
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
