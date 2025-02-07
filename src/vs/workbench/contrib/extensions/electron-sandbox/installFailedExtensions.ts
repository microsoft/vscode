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
import { URI } from '../../../../base/common/uri.js';


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
				if (extensions.length === 0) {
					logService.trace('No failed extensions to re-attempt installation');
					return;
				}
				logService.info('Attempting to install extensions that remote server could not install');
				// Only processes gallery extensions for now
				const [galleryExtensionIds, extensionUris] = extensions.reduce<[{ id: string }[], URI[]]>((result, extension) => {
					if (typeof extension === 'string') {
						result[0].push({ id: extension });
					} else {
						result[1].push(extension);
					}
					return result;
				}, [[], []]);
				for (const ext of await this._extensionGalleryService.getExtensions(galleryExtensionIds, CancellationToken.None)) {
					try {
						await this._extensionManagementService.installFromGallery(ext, installOptions);
					} catch (e) {
						logService.error('Failed to install extension from gallery', e);
					}
				}
				for (const ext of extensionUris) {
					try {
						await this._extensionManagementService.install(ext, installOptions);
					} catch (e) {
						logService.error('Failed to install extension from URI', e);
					}
				}

			}).catch(e => {
				logService.error(e);
			});
	}
}
