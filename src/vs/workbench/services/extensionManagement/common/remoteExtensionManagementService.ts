/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionManagementService, IGalleryExtension, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { canExecuteOnWorkspace } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IProductService } from 'vs/platform/product/common/productService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';

export class WebRemoteExtensionManagementService extends ExtensionManagementChannelClient implements IExtensionManagementService {

	constructor(
		channel: IChannel,
		@IExtensionGalleryService protected readonly galleryService: IExtensionGalleryService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IProductService protected readonly productService: IProductService
	) {
		super(channel);
	}

	async canInstall(extension: IGalleryExtension): Promise<boolean> {
		const manifest = await this.galleryService.getManifest(extension, CancellationToken.None);
		return !!manifest && canExecuteOnWorkspace(manifest, this.productService, this.configurationService);
	}

}
