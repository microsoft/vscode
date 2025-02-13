/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionGalleryService, InstallExtensionInfo } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';
export class InstallFailedExtensions extends Disposable implements IWorkbenchContribution {
	constructor(
		@IRemoteExtensionsScannerService remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@IExtensionGalleryService private readonly _extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementServerService private readonly _extensionManagementServerService: IExtensionManagementServerService,
		@ILogService logService: ILogService
	) {
		super();
		remoteExtensionsScannerService.whenExtensionsReady()
			.then(async ({ failed }) => {
				if (failed.length === 0) {
					logService.trace('No failed extensions relayed from server');
					return;
				}

				if (!this._extensionManagementServerService.remoteExtensionManagementServer) {
					logService.error('No remote extension management server available');
					return;
				}

				const extensionManagementService = this._extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService;
				const galleryExtensions = await this._extensionGalleryService.getExtensions(failed, CancellationToken.None);
				// Join back with its installOptions
				const installExtensionInfo: InstallExtensionInfo[] = galleryExtensions.map(ext => {
					return {
						extension: ext,
						options: failed.find(f => areSameExtensions(f, ext.identifier))?.installOptions || {}
					};
				});

				await extensionManagementService.installGalleryExtensions(installExtensionInfo);
			}).catch(e => {
				logService.error(e);
			});
	}
}
