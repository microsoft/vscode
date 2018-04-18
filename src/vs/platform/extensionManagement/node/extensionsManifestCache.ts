/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { join } from 'path';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionManagementService, DidInstallExtensionEvent, DidUninstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { MANIFEST_CACHE_FOLDER, USER_MANIFEST_CACHE_FILE } from 'vs/platform/extensions/common/extensions';
import * as pfs from 'vs/base/node/pfs';

export class ExtensionsManifestCache extends Disposable {

	private extensionsManifestCache = join(this.environmentService.userDataPath, MANIFEST_CACHE_FOLDER, USER_MANIFEST_CACHE_FILE);

	constructor(
		private readonly environmentService: IEnvironmentService,
		extensionsManagementServuce: IExtensionManagementService
	) {
		super();
		this._register(extensionsManagementServuce.onDidInstallExtension(e => this.onDidInstallExtension(e)));
		this._register(extensionsManagementServuce.onDidUninstallExtension(e => this.onDidUnInstallExtension(e)));
	}

	private onDidInstallExtension(e: DidInstallExtensionEvent): void {
		if (!e.error) {
			this.invalidate();
		}
	}

	private onDidUnInstallExtension(e: DidUninstallExtensionEvent): void {
		if (!e.error) {
			this.invalidate();
		}
	}

	invalidate(): void {
		pfs.del(this.extensionsManifestCache).done(() => { }, () => { });
	}
}
