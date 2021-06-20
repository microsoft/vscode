/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';

export class DeprecatedExtensionsCleaner extends Disposable {

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: ExtensionManagementService
	) {
		super();

		this._register(extensionManagementService); // TODO@sandy081 this seems fishy

		this.cleanUpDeprecatedExtensions();
	}

	private cleanUpDeprecatedExtensions(): void {
		this.extensionManagementService.removeDeprecatedExtensions();
	}
}
