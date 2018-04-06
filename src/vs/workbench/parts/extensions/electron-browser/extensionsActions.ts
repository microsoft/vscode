/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import * as paths from 'vs/base/common/paths';
import { IExtensionsWorkbenchService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IFileService } from 'vs/platform/files/common/files';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { LocalExtensionType } from 'vs/platform/extensionManagement/common/extensionManagement';

export class OpenExtensionsFolderAction extends Action {

	static readonly ID = 'workbench.extensions.action.openExtensionsFolder';
	static LABEL = localize('openExtensionsFolder', "Open Extensions Folder");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService,
		@IFileService private fileService: IFileService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		const extensionsHome = this.environmentService.extensionsPath;

		return this.fileService.resolveFile(URI.file(extensionsHome)).then(file => {
			let itemToShow: string;
			if (file.children && file.children.length > 0) {
				itemToShow = file.children[0].resource.fsPath;
			} else {
				itemToShow = paths.normalize(extensionsHome, true);
			}

			return this.windowsService.showItemInFolder(itemToShow);
		});
	}
}

export class InstallVSIXAction extends Action {

	static readonly ID = 'workbench.extensions.action.installVSIX';
	static LABEL = localize('installVSIX', "Install from VSIX...");

	constructor(
		id = InstallVSIXAction.ID,
		label = InstallVSIXAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label, 'extension-action install-vsix', true);
	}

	run(): TPromise<any> {
		return this.windowService.showOpenDialog({
			title: localize('installFromVSIX', "Install from VSIX"),
			filters: [{ name: 'VSIX Extensions', extensions: ['vsix'] }],
			properties: ['openFile'],
			buttonLabel: mnemonicButtonLabel(localize({ key: 'installButton', comment: ['&& denotes a mnemonic'] }, "&&Install"))
		}).then(result => {
			if (!result) {
				return TPromise.as(null);
			}

			return TPromise.join(result.map(vsix => this.extensionsWorkbenchService.install(vsix))).then(() => {
				this.notificationService.prompt(
					Severity.Info,
					localize('InstallVSIXAction.success', "Successfully installed the extension. Reload to enable it."),
					[{
						label: localize('InstallVSIXAction.reloadNow', "Reload Now"),
						run: () => this.windowService.reloadWindow()
					}]
				);
			});
		});
	}
}

export class ReinstallAction extends Action {

	static readonly ID = 'workbench.extensions.action.reinstall';
	static LABEL = localize('reinstall', "Reinstall Extension...");

	constructor(
		id: string = ReinstallAction.ID, label: string = ReinstallAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	get enabled(): boolean {
		return this.extensionsWorkbenchService.local.filter(l => l.type === LocalExtensionType.User && l.local).length > 0;
	}

	run(): TPromise<any> {
		return this.quickOpenService.pick(this.getEntries(), { placeHolder: localize('selectExtension', "Select Extension to Reinstall") });
	}

	private getEntries(): TPromise<IPickOpenEntry[]> {
		return this.extensionsWorkbenchService.queryLocal()
			.then(local => {
				const entries: IPickOpenEntry[] = local
					.filter(extension => extension.type === LocalExtensionType.User)
					.map(extension => {
						return <IPickOpenEntry>{
							id: extension.id,
							label: extension.displayName,
							description: extension.id,
							run: () => this.reinstallExtension(extension),
						};
					});
				return entries;
			});
	}

	private reinstallExtension(extension: IExtension): TPromise<void> {
		return this.extensionsWorkbenchService.reinstall(extension)
			.then(() => {
				this.notificationService.prompt(
					Severity.Info,
					localize('ReinstallAction.success', "Successfully reinstalled the extension."),
					[{
						label: localize('ReinstallAction.reloadNow', "Reload Now"),
						run: () => this.windowService.reloadWindow()
					}]
				);
			}, error => this.notificationService.error(error));
	}
}