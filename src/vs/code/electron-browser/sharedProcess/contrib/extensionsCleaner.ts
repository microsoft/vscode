/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionGalleryService, IGlobalExtensionEnablementService, IServerExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionStorageService, IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { migrateUnsupportedExtensions } from 'vs/platform/extensionManagement/common/unsupportedExtensionsMigration';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';

export class ExtensionsCleaner extends Disposable {

	constructor(
		@IServerExtensionManagementService extensionManagementService: ExtensionManagementService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IExtensionStorageService extensionStorageService: IExtensionStorageService,
		@IGlobalExtensionEnablementService extensionEnablementService: IGlobalExtensionEnablementService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();
		extensionManagementService.removeDeprecatedExtensions();
		migrateUnsupportedExtensions(extensionManagementService, extensionGalleryService, extensionStorageService, extensionEnablementService, logService);
		ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
	}
}
