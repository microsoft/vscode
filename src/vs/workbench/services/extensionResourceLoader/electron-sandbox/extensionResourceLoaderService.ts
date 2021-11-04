/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { IProductService } from 'vs/platform/product/common/productService';
import { asText, IRequestService } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';

export class ExtensionResourceLoaderService implements IExtensionResourceLoaderService {

	declare readonly _serviceBrand: undefined;

	private readonly _extensionGalleryResourceAuthority: string | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IProductService _productService: IProductService,
		@IRequestService private readonly _requestService: IRequestService,
	) {
		if (_productService.extensionsGallery) {
			this._extensionGalleryResourceAuthority = this._getExtensionResourceAuthority(URI.parse(_productService.extensionsGallery.resourceUrlTemplate));
		}


	}

	async readExtensionResource(uri: URI): Promise<string> {

		if (this._extensionGalleryResourceAuthority && this._extensionGalleryResourceAuthority === this._getExtensionResourceAuthority(uri)) {
			const requestContext = await this._requestService.request({
				url: uri.toString()
			}, CancellationToken.None);

			return (await asText(requestContext)) || '';
		}

		const result = await this._fileService.readFile(uri);
		return result.value.toString();
	}

	private _getExtensionResourceAuthority(uri: URI): string | undefined {
		const index = uri.authority.indexOf('.');
		return index !== -1 ? uri.authority.substring(index + 1) : undefined;
	}
}

registerSingleton(IExtensionResourceLoaderService, ExtensionResourceLoaderService);
