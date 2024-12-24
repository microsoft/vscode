/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionGalleryService, IGlobalExtensionEnablementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionStorageService, IExtensionStorageService } from '../../../../platform/extensionManagement/common/extensionStorage.js';
import { migrateUnsupportedExtensions } from '../../../../platform/extensionManagement/common/unsupportedExtensionsMigration.js';
import { INativeServerExtensionManagementService } from '../../../../platform/extensionManagement/node/extensionManagementService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export class ExtensionsContributions extends Disposable {
	constructor(
		@INativeServerExtensionManagementService extensionManagementService: INativeServerExtensionManagementService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IExtensionStorageService extensionStorageService: IExtensionStorageService,
		@IGlobalExtensionEnablementService extensionEnablementService: IGlobalExtensionEnablementService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();

		extensionManagementService.cleanUp();
		migrateUnsupportedExtensions(extensionManagementService, extensionGalleryService, extensionStorageService, extensionEnablementService, logService);
		ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
	}

}
