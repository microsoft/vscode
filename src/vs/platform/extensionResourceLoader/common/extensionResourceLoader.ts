/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from 'vs/base/common/platform';
import { format2 } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IHeaders } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { getServiceMachineId } from 'vs/platform/externalServices/common/serviceMachineId';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { getTelemetryLevel, supportsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { RemoteAuthorities } from 'vs/base/common/network';
import { getRemoteServerRootPath } from 'vs/platform/remote/common/remoteHosts';
import { TargetPlatform } from 'vs/platform/extensions/common/extensions';

const WEB_EXTENSION_RESOURCE_END_POINT = 'web-extension-resource';

export const IExtensionResourceLoaderService = createDecorator<IExtensionResourceLoaderService>('extensionResourceLoaderService');

/**
 * A service useful for reading resources from within extensions.
 */
export interface IExtensionResourceLoaderService {
	readonly _serviceBrand: undefined;

	/**
	 * Read a certain resource within an extension.
	 */
	readExtensionResource(uri: URI): Promise<string>;

	/**
	 * Returns whether the gallery provides extension resources.
	 */
	readonly supportsExtensionGalleryResources: boolean;

	/**
	 * Return true if the given URI is a extension gallery resource.
	 */
	isExtensionGalleryResource(uri: URI): boolean;

	/**
	 * Computes the URL of a extension gallery resource. Returns `undefined` if gallery does not provide extension resources.
	 */
	getExtensionGalleryResourceURL(galleryExtension: { publisher: string; name: string; version: string; targetPlatform?: TargetPlatform }, path?: string): URI | undefined;
}

export function migratePlatformSpecificExtensionGalleryResourceURL(resource: URI, targetPlatform: TargetPlatform): URI | undefined {
	if (resource.query !== `target=${targetPlatform}`) {
		return undefined;
	}
	const paths = resource.path.split('/');
	if (!paths[3]) {
		return undefined;
	}
	paths[3] = `${paths[3]}+${targetPlatform}`;
	return resource.with({ query: null, path: paths.join('/') });
}

export abstract class AbstractExtensionResourceLoaderService implements IExtensionResourceLoaderService {

	readonly _serviceBrand: undefined;

	private readonly _webExtensionResourceEndPoint: string;
	private readonly _extensionGalleryResourceUrlTemplate: string | undefined;
	private readonly _extensionGalleryAuthority: string | undefined;

	constructor(
		protected readonly _fileService: IFileService,
		private readonly _storageService: IStorageService,
		private readonly _productService: IProductService,
		private readonly _environmentService: IEnvironmentService,
		private readonly _configurationService: IConfigurationService,
	) {
		this._webExtensionResourceEndPoint = `${getRemoteServerRootPath(_productService)}/${WEB_EXTENSION_RESOURCE_END_POINT}/`;
		if (_productService.extensionsGallery) {
			this._extensionGalleryResourceUrlTemplate = _productService.extensionsGallery.resourceUrlTemplate;
			this._extensionGalleryAuthority = this._extensionGalleryResourceUrlTemplate ? this._getExtensionGalleryAuthority(URI.parse(this._extensionGalleryResourceUrlTemplate)) : undefined;
		}
	}

	public get supportsExtensionGalleryResources(): boolean {
		return this._extensionGalleryResourceUrlTemplate !== undefined;
	}

	public getExtensionGalleryResourceURL({ publisher, name, version, targetPlatform }: { publisher: string; name: string; version: string; targetPlatform?: TargetPlatform }, path?: string): URI | undefined {
		if (this._extensionGalleryResourceUrlTemplate) {
			const uri = URI.parse(format2(this._extensionGalleryResourceUrlTemplate, {
				publisher,
				name,
				version: targetPlatform !== undefined
					&& targetPlatform !== TargetPlatform.UNDEFINED
					&& targetPlatform !== TargetPlatform.UNKNOWN
					&& targetPlatform !== TargetPlatform.UNIVERSAL
					? `${version}+${targetPlatform}`
					: version,
				path: 'extension'
			}));
			return this._isWebExtensionResourceEndPoint(uri) ? uri.with({ scheme: RemoteAuthorities.getPreferredWebSchema() }) : uri;
		}
		return undefined;
	}

	public abstract readExtensionResource(uri: URI): Promise<string>;

	isExtensionGalleryResource(uri: URI): boolean {
		return !!this._extensionGalleryAuthority && this._extensionGalleryAuthority === this._getExtensionGalleryAuthority(uri);
	}

	protected async getExtensionGalleryRequestHeaders(): Promise<IHeaders> {
		const headers: IHeaders = {
			'X-Client-Name': `${this._productService.applicationName}${isWeb ? '-web' : ''}`,
			'X-Client-Version': this._productService.version
		};
		if (supportsTelemetry(this._productService, this._environmentService) && getTelemetryLevel(this._configurationService) === TelemetryLevel.USAGE) {
			headers['X-Machine-Id'] = await this._getServiceMachineId();
		}
		if (this._productService.commit) {
			headers['X-Client-Commit'] = this._productService.commit;
		}
		return headers;
	}

	private _serviceMachineIdPromise: Promise<string> | undefined;
	private _getServiceMachineId(): Promise<string> {
		if (!this._serviceMachineIdPromise) {
			this._serviceMachineIdPromise = getServiceMachineId(this._environmentService, this._fileService, this._storageService);
		}
		return this._serviceMachineIdPromise;
	}

	private _getExtensionGalleryAuthority(uri: URI): string | undefined {
		if (this._isWebExtensionResourceEndPoint(uri)) {
			return uri.authority;
		}
		const index = uri.authority.indexOf('.');
		return index !== -1 ? uri.authority.substring(index + 1) : undefined;
	}

	protected _isWebExtensionResourceEndPoint(uri: URI): boolean {
		return uri.path.startsWith(this._webExtensionResourceEndPoint);
	}

}
