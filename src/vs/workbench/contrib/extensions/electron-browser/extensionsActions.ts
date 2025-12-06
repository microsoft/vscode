/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Schemas } from '../../../../base/common/network.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';

export class OpenExtensionsFolderAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.extensions.action.openExtensionsFolder',
			title: localize2('openExtensionsFolder', 'Open Extensions Folder'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const fileService = accessor.get(IFileService);
		const environmentService = accessor.get(INativeWorkbenchEnvironmentService);

		const extensionsHome = URI.file(environmentService.extensionsPath);
		const file = await fileService.resolve(extensionsHome);

		let itemToShow: URI;
		if (file.children && file.children.length > 0) {
			itemToShow = file.children[0].resource;
		} else {
			itemToShow = extensionsHome;
		}

		if (itemToShow.scheme === Schemas.file) {
			return nativeHostService.showItemInFolder(itemToShow.fsPath);
		}
	}
}

export class CleanUpExtensionsFolderAction extends Action2 {

	constructor() {
		super({
			id: '_workbench.extensions.action.cleanUpExtensionsFolder',
			title: localize2('cleanUpExtensionsFolder', 'Cleanup Extensions Folder'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionManagementService = accessor.get(IExtensionManagementService);
		return extensionManagementService.cleanUp();
	}
}

