/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import paths = require('vs/base/common/paths');
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IFileService } from 'vs/platform/files/common/files';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IChoiceService } from 'vs/platform/dialogs/common/dialogs';

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
		@IChoiceService private choiceService: IChoiceService,
		@IWindowService private windowsService: IWindowService
	) {
		super(id, label, 'extension-action install-vsix', true);
	}

	run(): TPromise<any> {
		return this.windowsService.showOpenDialog({
			title: localize('installFromVSIX', "Install from VSIX"),
			filters: [{ name: 'VSIX Extensions', extensions: ['vsix'] }],
			properties: ['openFile'],
			buttonLabel: mnemonicButtonLabel(localize({ key: 'installButton', comment: ['&& denotes a mnemonic'] }, "&&Install"))
		}).then(result => {
			if (!result) {
				return TPromise.as(null);
			}

			return TPromise.join(result.map(vsix => this.extensionsWorkbenchService.install(vsix))).then(() => {
				return this.choiceService.choose(Severity.Info, localize('InstallVSIXAction.success', "Successfully installed the extension. Reload to enable it."), [localize('InstallVSIXAction.reloadNow', "Reload Now")]).then(choice => {
					if (choice === 0) {
						return this.windowsService.reloadWindow();
					}

					return TPromise.as(undefined);
				});
			});
		});
	}
}