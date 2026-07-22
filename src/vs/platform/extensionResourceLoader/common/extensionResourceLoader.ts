/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from '../../../base/common/platform.js';
import { format2 } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IProductService } from '../../product/common/productService.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService } from '../../storage/common/storage.js';
import { TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel, supportsTelemetry } from '../../telemetry/common/telemetryUtils.js';
import { RemoteAuthorities } from '../../../base/common/network.js';
import { TargetPlatform } from '../../extensions/common/extensions.js';
import { ExtensionGalleryResourceType, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifest, IExtensionGalleryManifestService } from '../../extensionManagement/common/extensionGalleryManifest.js';
import { ILogService } from '../../log/common/log.js';
import { Disposable } from '../../../base/common/lifecycle.js';

const WEB_EXTENSION_RESOURCE_END_POINT_SEGMENT = '/web-extension-resource/';

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
	supportsExtensionGalleryResources(): Promise<boolean>;

	/**
	 * Return true if the given URI is a extension gallery resource.
	 */
	isExtensionGalleryResource(uri: URI): Promise<boolean>;

	/**
	 * Computes the URL of a extension gallery resource. Returns `undefined` if gallery does not provide extension resources.
	 */
	getExtensionGalleryResourceURL(galleryExtension: { publisher: string; name: string; version: string; targetPlatform?: TargetPlatform }, path?: string): Promise<URI | undefined>;
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

export abstract class AbstractExtensionResourceLoaderService extends Disposable implements IExtensionResourceLoaderService {

	readonly _serviceBrand: undefined;

	private readonly _initPromise: Promise<void>;

	private _extensionGalleryResourceUrlTemplate: string | undefined;
	private _extensionGalleryAuthority: string | undefined;

	constructor(
		protected readonly _fileService: IFileService,
		private readonly _storageService: IStorageService,
		private readonly _productService: IProductService,
		private readonly _environmentService: IEnvironmentService,
		private readonly _configurationService: IConfigurationService,
		private readonly _extensionGalleryManifestService: IExtensionGalleryManifestService,
		protected readonly _logService: ILogService,
	) {
		super();
		this._initPromise = this._init();
	}

	private async _init(): Promise<void> {
		try {
			const manifest = await this._extensionGalleryManifestService.getExtensionGalleryManifest();
			this.resolve(manifest);
			this._register(this._extensionGalleryManifestService.onDidChangeExtensionGalleryManifest(() => this.resolve(manifest)));
		} catch (error) {
			this._logService.error(error);
		}
	}

	private resolve(manifest: IExtensionGalleryManifest | null): void {
		this._extensionGalleryResourceUrlTemplate = manifest ? getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.ExtensionResourceUri) : undefined;
		this._extensionGalleryAuthority = this._extensionGalleryResourceUrlTemplate ? this._getExtensionGalleryAuthority(URI.parse(this._extensionGalleryResourceUrlTemplate)) : undefined;
	}

	public async supportsExtensionGalleryResources(): Promise<boolean> {
		await this._initPromise;
		return this._extensionGalleryResourceUrlTemplate !== undefined;
	}

	public async getExtensionGalleryResourceURL({ publisher, name, version, targetPlatform }: { publisher: string; name: string; version: string; targetPlatform?: TargetPlatform }, path?: string): Promise<URI | undefined> {
		await this._initPromise;
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

	async isExtensionGalleryResource(uri: URI): Promise<boolean> {
		await this._initPromise;
		return !!this._extensionGalleryAuthority && this._extensionGalleryAuthority === this._getExtensionGalleryAuthority(uri);
	}

	protected async getExtensionGalleryRequestHeaders(resource?: URI): Promise<Record<string, string>> {
		const headers: Record<string, string> = {
			'X-Client-Name': `${this._productService.applicationName}${isWeb ? '-web' : ''}`,
			'X-Client-Version': this._productService.version
		};
		if (supportsTelemetry(this._productService, this._environmentService) && getTelemetryLevel(this._configurationService) === TelemetryLevel.USAGE) {
			headers['X-Machine-Id'] = await this._getServiceMachineId();
		}
		if (this._productService.commit) {
			headers['X-Client-Commit'] = this._productService.commit;
		}
		if (resource) {
			Object.assign(headers, await this.getMarketplaceAuthorizationHeader(resource));
		}
		return headers;
	}

	/**
	 * Returns an `Authorization` header for a `[Authorize]`-gated marketplace resource request, or an
	 * empty object when no token applies. The negotiated bearer token (see
	 * {@link IExtensionGalleryManifestService.getAccessToken}) is attached ONLY when `resource` is
	 * same-origin HTTPS with the marketplace's `extensionquery` service endpoint — this prevents the
	 * resource-scoped token from leaking to a foreign origin (e.g. a third-party resource CDN whose
	 * URL was advertised by the gallery manifest, or a cleartext URL). Mirrors the guard applied to
	 * gallery API/asset requests in `ExtensionGalleryService`.
	 */
	private async getMarketplaceAuthorizationHeader(resource: URI): Promise<Record<string, string>> {
		const token = await this._extensionGalleryManifestService.getAccessToken();
		if (!token) {
			return {};
		}
		const manifest = await this._extensionGalleryManifestService.getExtensionGalleryManifest();
		const marketplaceApi = manifest ? getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.ExtensionQueryService) : undefined;
		if (!marketplaceApi || !AbstractExtensionResourceLoaderService.isSameSecureOrigin(resource, URI.parse(marketplaceApi))) {
			return {};
		}
		return { Authorization: `Bearer ${token}` };
	}

	/**
	 * True when both URIs are `https:` and share the same origin (scheme + authority). Fails closed:
	 * a scheme mismatch returns false so a token is never attached to a cleartext target.
	 */
	private static isSameSecureOrigin(target: URI, base: URI): boolean {
		return target.scheme === 'https'
			&& base.scheme === 'https'
			&& target.authority.toLowerCase() === base.authority.toLowerCase();
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
		const uriPath = uri.path, serverRootPath = RemoteAuthorities.getServerRootPath();
		// test if the path starts with the server root path followed by the web extension resource end point segment
		return uriPath.startsWith(serverRootPath) && uriPath.startsWith(WEB_EXTENSION_RESOURCE_END_POINT_SEGMENT, serverRootPath.length);
	}

}
