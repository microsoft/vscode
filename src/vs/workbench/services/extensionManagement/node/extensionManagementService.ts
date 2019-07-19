/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { isLanguagePackExtension } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { isUIExtension } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { ExtensionManagementService as BaseExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';

export class ExtensionManagementService extends BaseExtensionManagementService {

	async install(vsix: URI): Promise<ILocalExtension> {
		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			const manifest = await getManifest(vsix.fsPath);
			if (isLanguagePackExtension(manifest)) {
				// Install on both servers
				const [local] = await Promise.all(this.servers.map(server => server.extensionManagementService.install(vsix)));
				return local;
			}
			if (isUIExtension(manifest, this.productService, this.configurationService)) {
				// Install only on local server
				return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix);
			}
			// Install only on remote server
			return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.install(vsix);
		}
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix);
		}
		return Promise.reject('No Servers to Install');
	}

}
