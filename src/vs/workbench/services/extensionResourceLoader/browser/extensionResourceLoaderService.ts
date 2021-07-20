/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { IProductService } from 'vs/platform/product/common/productService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IHeaders } from 'vs/base/parts/request/common/request';
import { getServiceMachineId } from 'vs/platform/serviceMachineId/common/serviceMachineId';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

class ExtensionResourceLoaderService implements IExtensionResourceLoaderService {

	declare readonly _serviceBrand: undefined;

	private readonly _extensionGalleryResourceAuthority: string | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IProductService productService: IProductService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
		if (productService.extensionsGallery) {
			this._extensionGalleryResourceAuthority = this._getExtensionResourceAuthority(URI.parse(productService.extensionsGallery.resourceUrlTemplate));
		}
	}

	async readExtensionResource(uri: URI): Promise<string> {
		uri = FileAccess.asBrowserUri(uri);

		if (uri.scheme !== Schemas.http && uri.scheme !== Schemas.https) {
			const result = await this._fileService.readFile(uri);
			return result.value.toString();
		}

		let headers: IHeaders = {};
		if (this._extensionGalleryResourceAuthority && this._extensionGalleryResourceAuthority === this._getExtensionResourceAuthority(uri)) {
			const machineId = await this._getServiceMachineId();
			headers['X-Machine-Id'] = machineId;
		}

		const response = await fetch(uri.toString(true) /* not adding machineid header due to CORS error */);
		if (response.status !== 200) {
			throw new Error(response.statusText);
		}
		return response.text();

	}

	private _serviceMachineIdPromise: Promise<string> | undefined;
	private _getServiceMachineId(): Promise<string> {
		if (!this._serviceMachineIdPromise) {
			this._serviceMachineIdPromise = getServiceMachineId(this._environmentService, this._fileService, this._storageService);
		}
		return this._serviceMachineIdPromise;
	}

	private _getExtensionResourceAuthority(uri: URI): string | undefined {
		const index = uri.authority.indexOf('.');
		return index !== -1 ? uri.authority.substring(index + 1) : undefined;
	}
}

registerSingleton(IExtensionResourceLoaderService, ExtensionResourceLoaderService);
