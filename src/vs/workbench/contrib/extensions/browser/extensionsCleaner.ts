/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class ExtensionsCleaner implements IWorkbenchContribution {

	constructor(
		@IExtensionStorageService extensionStorageService: IExtensionStorageService,
	) {
		extensionStorageService.removeOutdatedExtensionVersions();
	}
}
