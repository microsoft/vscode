/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionGalleryService, IExtensionManagementService, InstallOptions } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';


interface GalleryExtension {
	id: string;
	installOptions: InstallOptions;
}

export class InstallFailedExtensions extends Disposable implements IWorkbenchContribution {
	constructor(
		@IRemoteExtensionsScannerService remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@IExtensionGalleryService private readonly _extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService,
		@ILogService logService: ILogService
	) {
		super();
		remoteExtensionsScannerService.whenExtensionsReady()
			.then(async ({ failed }) => {
				if (failed.length === 0) {
					logService.trace('No failed extensions relayed from server');
					return;
				}

				logService.trace(`Received '${failed.length}' failed extensions relayed from server`);
				const failedGalleryExtensions = failed.reduce<GalleryExtension[]>((acc, f) => {
					const { extension, installOptions } = f;
					if (typeof extension === 'string') {
						acc.push({ id: extension, installOptions });
					}
					// NOTE: Handle VSIX URIs here
					return acc;
				}, []);

				const alreadyInstalled = await this._extensionManagementService.getInstalled(ExtensionType.User);
				const missing = failedGalleryExtensions.filter(
					({ id }) => !alreadyInstalled.some(e => areSameExtensions(e.identifier, { id }))
				);

				logService.info(`Processing '${missing.length}' missing extensions relayed from server`);
				for (const ext of await this._extensionGalleryService.getExtensions(failedGalleryExtensions, CancellationToken.None)) {
					const installOptions = failedGalleryExtensions.find(g => g.id === ext.identifier.id)?.installOptions;
					try {
						await this._extensionManagementService.installFromGallery(ext, installOptions);
					} catch (e) {
						logService.error('Failed to install extension from gallery', e);
					}
				}
			}).catch(e => {
				logService.error(e);
			});
	}
}
