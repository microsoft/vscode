/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export class InstallFailedExtensions extends Disposable implements IWorkbenchContribution {
	constructor(
		@IRemoteExtensionsScannerService remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@IExtensionGalleryService private readonly _extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService,
		@ILogService logService: ILogService
	) {
		super();

		remoteExtensionsScannerService.whenExtensionsReady()
			.then(async ({ extensions, installOptions }) => {
				logService.debug('Failed from remote', extensions);

				const registryExtensionIds = extensions
					.filter(ext => typeof ext === 'string')
					.map(ext => ({ id: ext }));

				const exts = await this._extensionGalleryService.getExtensions(registryExtensionIds, CancellationToken.None);
				for (const ext of exts) {
					await this._extensionManagementService.installFromGallery(ext, installOptions);
				}

			}).catch(e => {
				logService.error('Failed in InstallFailedExtensions', e);
			});
	}
}
