/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls';
import { IFileService } from '../../../../platform/files/common/files';
import { URI } from '../../../../base/common/uri';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService';
import { INativeHostService } from '../../../../platform/native/common/native';
import { Schemas } from '../../../../base/common/network';
import { Action2 } from '../../../../platform/actions/common/actions';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { ExtensionsLocalizedLabel, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement';
import { Categories } from '../../../../platform/action/common/actionCommonCategories';

export class OpenExtensionsFolderAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.extensions.action.openExtensionsFolder',
			title: localize2('openExtensionsFolder', 'Open Extensions Folder'),
			category: ExtensionsLocalizedLabel,
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

