/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class ExtensionsCleaner implements IWorkbenchContribution {

	constructor(
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IStorageService storageService: IStorageService,
	) {
		ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
	}
}
