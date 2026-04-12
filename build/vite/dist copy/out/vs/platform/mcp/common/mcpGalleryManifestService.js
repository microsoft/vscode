/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService, isSuccess } from '../../request/common/request.js';
const SUPPORTED_VERSIONS = [
    'v0.1',
    'v0',
];
let McpGalleryManifestService = class McpGalleryManifestService extends Disposable {
    get mcpGalleryManifestStatus() {
        return !!this.productService.mcpGallery?.serviceUrl ? "available" /* McpGalleryManifestStatus.Available */ : "unavailable" /* McpGalleryManifestStatus.Unavailable */;
    }
    constructor(productService, requestService, logService) {
        super();
        this.productService = productService;
        this.requestService = requestService;
        this.logService = logService;
        this.onDidChangeMcpGalleryManifest = Event.None;
        this.onDidChangeMcpGalleryManifestStatus = Event.None;
        this.versionByUrl = new Map();
    }
    async getMcpGalleryManifest() {
        if (!this.productService.mcpGallery) {
            return null;
        }
        return this.createMcpGalleryManifest(this.productService.mcpGallery.serviceUrl, SUPPORTED_VERSIONS[0]);
    }
    async createMcpGalleryManifest(url, version) {
        url = url.endsWith('/') ? url.slice(0, -1) : url;
        if (!version) {
            let versionPromise = this.versionByUrl.get(url);
            if (!versionPromise) {
                this.versionByUrl.set(url, versionPromise = this.getVersion(url));
            }
            version = await versionPromise;
        }
        const isProductGalleryUrl = this.productService.mcpGallery?.serviceUrl === url;
        const serversUrl = `${url}/${version}/servers`;
        const resources = [
            {
                id: serversUrl,
                type: "McpServersQueryService" /* McpGalleryResourceType.McpServersQueryService */
            },
            {
                id: `${serversUrl}/{name}/versions/{version}`,
                type: "McpServerVersionUriTemplate" /* McpGalleryResourceType.McpServerVersionUri */
            },
            {
                id: `${serversUrl}/{name}/versions/latest`,
                type: "McpServerLatestVersionUriTemplate" /* McpGalleryResourceType.McpServerLatestVersionUri */
            }
        ];
        if (isProductGalleryUrl) {
            resources.push({
                id: `${serversUrl}/by-name/{name}`,
                type: "McpServerNamedResourceUriTemplate" /* McpGalleryResourceType.McpServerNamedResourceUri */
            });
            resources.push({
                id: this.productService.mcpGallery.itemWebUrl,
                type: "McpServerWebUriTemplate" /* McpGalleryResourceType.McpServerWebUri */
            });
            resources.push({
                id: this.productService.mcpGallery.publisherUrl,
                type: "PublisherUriTemplate" /* McpGalleryResourceType.PublisherUriTemplate */
            });
            resources.push({
                id: this.productService.mcpGallery.supportUrl,
                type: "ContactSupportUri" /* McpGalleryResourceType.ContactSupportUri */
            });
            resources.push({
                id: this.productService.mcpGallery.supportUrl,
                type: "ContactSupportUri" /* McpGalleryResourceType.ContactSupportUri */
            });
            resources.push({
                id: this.productService.mcpGallery.privacyPolicyUrl,
                type: "PrivacyPolicyUri" /* McpGalleryResourceType.PrivacyPolicyUri */
            });
            resources.push({
                id: this.productService.mcpGallery.termsOfServiceUrl,
                type: "TermsOfServiceUri" /* McpGalleryResourceType.TermsOfServiceUri */
            });
            resources.push({
                id: this.productService.mcpGallery.reportUrl,
                type: "ReportUri" /* McpGalleryResourceType.ReportUri */
            });
        }
        if (version === 'v0') {
            resources.push({
                id: `${serversUrl}/{id}`,
                type: "McpServerIdUriTemplate" /* McpGalleryResourceType.McpServerIdUri */
            });
        }
        return {
            version,
            url,
            resources
        };
    }
    async getVersion(url) {
        for (const version of SUPPORTED_VERSIONS) {
            if (await this.checkVersion(url, version)) {
                return version;
            }
        }
        return SUPPORTED_VERSIONS[0];
    }
    async checkVersion(url, version) {
        try {
            const context = await this.requestService.request({
                type: 'GET',
                url: `${url}/${version}/servers?limit=1`,
                callSite: 'mcpGalleryManifestService.checkVersion'
            }, CancellationToken.None);
            if (isSuccess(context)) {
                return true;
            }
            this.logService.info(`The service at ${url} does not support version ${version}. Service returned status ${context.res.statusCode}.`);
        }
        catch (error) {
            this.logService.error(error);
        }
        return false;
    }
};
McpGalleryManifestService = __decorate([
    __param(0, IProductService),
    __param(1, IRequestService),
    __param(2, ILogService)
], McpGalleryManifestService);
export { McpGalleryManifestService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLGVBQWUsRUFBRSxTQUFTLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUc3RSxNQUFNLGtCQUFrQixHQUFHO0lBQzFCLE1BQU07SUFDTixJQUFJO0NBQ0osQ0FBQztBQUVLLElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQTBCLFNBQVEsVUFBVTtJQVF4RCxJQUFJLHdCQUF3QjtRQUMzQixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQyxzREFBb0MsQ0FBQyx5REFBcUMsQ0FBQztJQUNqSSxDQUFDO0lBRUQsWUFDa0IsY0FBZ0QsRUFDaEQsY0FBZ0QsRUFDcEQsVUFBMEM7UUFFdkQsS0FBSyxFQUFFLENBQUM7UUFKMEIsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQy9CLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUNqQyxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBWi9DLGtDQUE2QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDM0Msd0NBQW1D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