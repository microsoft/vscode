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
import { URI } from '../../../../base/common/uri.js';


interface GalleryExtension {
	id: string;
	installOptions: InstallOptions;
}

interface VSIXExtension {
	uri: URI;
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
					logService.trace('No failed extensions to install relayed from server');
					return;
				}
				logService.info(`Processing '${failed.length}' extensions relayed from server`);
				logService.trace(JSON.stringify(failed));
				const [galleryExts, vsixExts] = failed.reduce<[GalleryExtension[], VSIXExtension[]]>((acc, f) => {
					const { extension, installOptions } = f;
					if (typeof extension === 'string') {
						acc[0].push({ id: extension, installOptions });
					} else {
						acc[1].push({ uri: extension, installOptions });
					}
					return acc;
				}, [[], []]);

				for (const { uri, installOptions } of vsixExts) {
					try {
						await this._extensionManagementService.install(uri, installOptions);
					} catch (e) {
						logService.error('Failed to install extension from URI', e);
					}
				}

				const galleryExtensions = await this._extensionGalleryService.getExtensions(galleryExts, CancellationToken.None);
				for (const ext of galleryExtensions) {
					const installOptions = galleryExts.find(g => g.id === ext.identifier.id)?.installOptions;
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
