/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionGalleryService, InstallExtensionInfo } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';
/**
 * Checks and attempts to install extensions that remote server has 'relayed' to workbench.
 * The server would 'relay' an extension for installation if it was unable to install it by itself.
 */
export class InstallFailedExtensions extends Disposable implements IWorkbenchContribution {
	constructor(
		@IRemoteExtensionsScannerService remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@IExtensionGalleryService private readonly _extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementServerService private readonly _extensionManagementServerService: IExtensionManagementServerService,
		@ILogService logService: ILogService
	) {
		super();
		logService.info('Checking for extensions relayed from server');
		remoteExtensionsScannerService.whenExtensionsReady()
			.then(async ({ failed }) => {
				if (failed.length === 0) {
					logService.trace('No extensions relayed from server');
					return;
				}

				if (!this._extensionManagementServerService.remoteExtensionManagementServer) {
					logService.error('No remote extension management server available');
					return;
				}

				logService.trace(`Retrieved gallery information for '${failed.length}' extensions relayed from server`);
				const extensionManagementService = this._extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService;
				const galleryExtensions = await this._extensionGalleryService.getExtensions(failed, CancellationToken.None);
				// Join back with its installOptions
				const installExtensionInfo: InstallExtensionInfo[] = galleryExtensions.map(ext => {
					return {
						extension: ext,
						options: failed.find(f => areSameExtensions(f, ext.identifier))?.installOptions || {}
					};
				});

				logService.trace(`Retrieved gallery information for '${installExtensionInfo.length}' extensions relayed from server`);
				const settled = await Promise.allSettled(
					installExtensionInfo.map(info => extensionManagementService.installFromGallery(info.extension, info.options))
				);

				const installedCount = settled.filter(result => result.status === 'fulfilled').length;
				logService.info(`Installed '${installedCount}' of '${failed.length}' extensions relayed from server`);
			}).catch(e => {
				logService.error('Unexpected failure installing extensions relayed from server');
				logService.error(e);
			});
	}
}
