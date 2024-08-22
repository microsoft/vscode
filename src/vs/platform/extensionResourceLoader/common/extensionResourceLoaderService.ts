/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions';
import { IFileService } from '../../files/common/files';
import { IProductService } from '../../product/common/productService';
import { asTextOrError, IRequestService } from '../../request/common/request';
import { IStorageService } from '../../storage/common/storage';
import { IEnvironmentService } from '../../environment/common/environment';
import { IConfigurationService } from '../../configuration/common/configuration';
import { CancellationToken } from '../../../base/common/cancellation';
import { AbstractExtensionResourceLoaderService, IExtensionResourceLoaderService } from './extensionResourceLoader';

export class ExtensionResourceLoaderService extends AbstractExtensionResourceLoaderService {

	constructor(
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IProductService productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
	) {
		super(fileService, storageService, productService, environmentService, configurationService);
	}

	async readExtensionResource(uri: URI): Promise<string> {
		if (this.isExtensionGalleryResource(uri)) {
			const headers = await this.getExtensionGalleryRequestHeaders();
			const requestContext = await this._requestService.request({ url: uri.toString(), headers }, CancellationToken.None);
			return (await asTextOrError(requestContext)) || '';
		}
		const result = await this._fileService.readFile(uri);
		return result.value.toString();
	}

}

registerSingleton(IExtensionResourceLoaderService, ExtensionResourceLoaderService, InstantiationType.Delayed);
