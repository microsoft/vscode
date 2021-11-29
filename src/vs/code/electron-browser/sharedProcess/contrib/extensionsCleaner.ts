/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';

export class ExtensionsCleaner extends Disposable {

	constructor(
		@IExtensionManagementService extensionManagementService: ExtensionManagementService,
	) {
		super();
		extensionManagementService.removeDeprecatedExtensions();
		extensionManagementService.migrateUnsupportedExtensions();
	}
}
