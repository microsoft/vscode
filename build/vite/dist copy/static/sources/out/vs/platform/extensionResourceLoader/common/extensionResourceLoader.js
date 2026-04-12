/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWeb } from '../../../base/common/platform.js';
import { format2 } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { getTelemetryLevel, supportsTelemetry } from '../../telemetry/common/telemetryUtils.js';
import { RemoteAuthorities } from '../../../base/common/network.js';
import { getExtensionGalleryManifestResourceUri } from '../../extensionManagement/common/extensionGalleryManifest.js';
import { Disposable } from '../../../base/common/lifecycle.js';
const WEB_EXTENSION_RESOURCE_END_POINT_SEGMENT = '/web-extension-resource/';
export const IExtensionResourceLoaderService = createDecorator('extensionResourceLoaderService');
export function migratePlatformSpecificExtensionGalleryResourceURL(resource, targetPlatform) {
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
export class AbstractExtensionResourceLoaderService extends Disposable {
    constructor(_fileService, _storageService, _productService, _environmentService, _configurationService, _extensionGalleryManifestService, _logService) {
        super();
        this._fileService = _fileService;
        this._storageService = _storageService;
        this._productService = _productService;
        this._environmentService = _environmentService;
        this._configurationService = _configurationService;
        this._extensionGalleryManifestService = _extensionGalleryManifestService;
        this._logService = _logService;
        this._initPromise = this._init();
    }
    async _init() {
        try {
            const manifest = await this._extensionGalleryManifestService.getExtensionGalleryManifest();
            this.resolve(manifest);
            this._register(this._extensionGalleryManifestService.onDidChangeExtensionGalleryManifest(() => this.resolve(manifest)));
        }
        catch (error) {
            this._logService.error(error);
        }
    }
    resolve(manifest) {
        this._extensionGalleryResourceUrlTemplate = manifest ? getExtensionGalleryManifestResourceUri(manifest, "ExtensionResourceUriTemplate" /* ExtensionGalleryResourceType.ExtensionResourceUri */) : undefined;
        this._extensionGalleryAuthority = this._extensionGalleryResourceUrlTemplate ? this._getExtensionGalleryAuthority(URI.parse(this._extensionGalleryResourceUrlTemplate)) : undefined;
    }
    async supportsExtensionGalleryResources() {
        await this._initPromise;
        return this._extensionGalleryResourceUrlTemplate !== undefined;
    }
    async getExtensionGalleryResourceURL({ publisher, name, version, targetPlatform }, path) {
        await this._initPromise;
        if (this._extensionGalleryResourceUrlTemplate) {
            const uri = URI.parse(format2(this._extensionGalleryResourceUrlTemplate, {
                publisher,
                name,
                version: targetPlatform !== undefined
                    && targetPlatform !== "undefined" /* TargetPlatform.UNDEFINED */
                    && targetPlatform !== "unknown" /* TargetPlatform.UNKNOWN */
                    && targetPlatform !== "universal" /* TargetPlatform.UNIVERSAL */
                    ? `${version}+${targetPlatform}`
                    : version,
                path: 'extension'
            }));
            return this._isWebExtensionResourceEndPoint(uri) ? uri.with({ scheme: RemoteAuthorities.getPreferredWebSchema() }) : uri;
        }
        return undefined;
    }
    async isExtensionGalleryResource(uri) {
        await this._initPromise;
        return !!this._extensionGalleryAuthority && this._extensionGalleryAuthority === this._getExtensionGalleryAuthority(uri);
    }
    async getExtensionGalleryRequestHeaders() {
        const headers = {
            'X-Client-Name': `${this._productService.applicationName}${isWeb ? '-web' : ''}`,
            'X-Client-Version': this._productService.version
        };
        if (supportsTelemetry(this._productService, this._environmentService) && getTelemetryLevel(this._configurationService) === 3 /* TelemetryLevel.USAGE */) {
            headers['X-Machine-Id'] = await this._getServiceMachineId();
        }
        if (this._productService.commit) {
            headers['X-Client-Commit'] = this._productService.commit;
        }
        return headers;
    }
    _getServiceMachineId() {
        if (!this._serviceMachineIdPromise) {
            this._serviceMachineIdPromise = getServiceMachineId(this._environmentService, this._fileService, this._storageService);
        }
        return this._serviceMachineIdPromise;
    }
    _getExtensionGalleryAuthority(uri) {
        if (this._isWebExtensionResourceEndPoint(uri)) {
            return uri.authority;
        }
        const index = uri.authority.indexOf('.');
        return index !== -1 ? uri.authority.substring(index + 1) : undefined;
    }
    _isWebExtensionResourceEndPoint(uri) {
        const uriPath = uri.path, serverRootPath = RemoteAuthorities.getServerRootPath();
        // test if the path starts with the server root path followed by the web extension resource end point segment
        return uriPath.startsWith(serverRootPath) && uriPath.startsWith(WEB_EXTENSION_RESOURCE_END_POINT_SEGMENT, serverRootPath.length);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFJbEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBR3hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXBFLE9BQU8sRUFBZ0Msc0NBQXNDLEVBQStELE1BQU0sOERBQThELENBQUM7QUFFak4sT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9ELE1BQU0sd0NBQXdDLEdBQUcsMEJBQTBCLENBQUM7QUFFNUUsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsZUFBZSxDQUFrQyxnQ0FBZ0MsQ0FBQyxDQUFDO0FBNkJsSSxNQUFNLFVBQVUsa0RBQWtELENBQUMsUUFBYSxFQUFFLGNBQThCO0lBQy9HLElBQUksUUFBUSxDQUFDLEtBQUssS0FBSyxVQUFVLGNBQWMsRUFBRSxFQUFFLENBQUM7UUFDbkQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENB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