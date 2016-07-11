/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { localize } from 'vs/nls';
import { Promise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IExtensionsWorkbenchService, ExtensionState, VIEWLET_ID } from './extensions';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IActivityService, ProgressBadge, NumberBadge } from 'vs/workbench/services/activity/common/activityService';
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

		const options = contextService.getOptions();

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

	private install(extensions: string[]): Promise {
		return Promise.join(extensions.map(extPath =>	this.extensionManagementService.install(extPath)))
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

export class StatusUpdater implements IWorkbenchContribution {

	private disposables: IDisposable[];

	constructor(
		@IActivityService private activityService: IActivityService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		extensionsWorkbenchService.onChange(this.onServiceChange, this, this.disposables);
	}

	getId(): string {
		return 'vs.extensions.statusupdater';
	}

	private onServiceChange(): void {
		if (this.extensionsWorkbenchService.local.some(e => e.state === ExtensionState.Installing)) {
			this.activityService.showActivity(VIEWLET_ID, new ProgressBadge(() => localize('extensions', 'Extensions')), 'extensions-badge progress-badge');
			return;
		}

		const outdated = this.extensionsWorkbenchService.local.reduce((r, e) => r + (e.outdated ? 1 : 0), 0);

		if (outdated > 0) {
			const badge = new NumberBadge(outdated, n => localize('outdatedExtensions', '{0} Outdated Extensions', n));
			this.activityService.showActivity(VIEWLET_ID, badge, 'extensions-badge count-badge');
		} else {
			this.activityService.showActivity(VIEWLET_ID, null, 'extensions-badge');
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
