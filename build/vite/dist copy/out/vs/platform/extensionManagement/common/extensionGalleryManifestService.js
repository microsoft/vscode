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
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IProductService } from '../../product/common/productService.js';
let ExtensionGalleryManifestService = class ExtensionGalleryManifestService extends Disposable {
    get extensionGalleryManifestStatus() {
        return !!this.productService.extensionsGallery?.serviceUrl ? "available" /* ExtensionGalleryManifestStatus.Available */ : "unavailable" /* ExtensionGalleryManifestStatus.Unavailable */;
    }
    constructor(productService) {
        super();
        this.productService = productService;
        this.onDidChangeExtensionGalleryManifest = Event.None;
        this.onDidChangeExtensionGalleryManifestStatus = Event.None;
    }
    async getExtensionGalleryManifest() {
        const extensionsGallery = this.productService.extensionsGallery;
        if (!extensionsGallery?.serviceUrl) {
            return null;
        }
        const resources = [
            {
                id: `${extensionsGallery.serviceUrl}/extensionquery`,
                type: "ExtensionQueryService" /* ExtensionGalleryResourceType.ExtensionQueryService */
            },
            {
                id: `${extensionsGallery.serviceUrl}/vscode/{publisher}/{name}/latest`,
                type: "ExtensionLatestVersionUriTemplate" /* ExtensionGalleryResourceType.ExtensionLatestVersionUri */
            },
            {
                id: `${extensionsGallery.serviceUrl}/publishers/{publisher}/extensions/{name}/{version}/stats?statType={statTypeName}`,
                type: "ExtensionStatisticsUriTemplate" /* ExtensionGalleryResourceType.ExtensionStatisticsUri */
            },
        ];
        if (extensionsGallery.publisherUrl) {
            resources.push({
                id: `${extensionsGallery.publisherUrl}/{publisher}`,
                type: "PublisherViewUriTemplate" /* ExtensionGalleryResourceType.PublisherViewUri */
            });
        }
        if (extensionsGallery.itemUrl) {
            resources.push({
                id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}`,
                type: "ExtensionDetailsViewUriTemplate" /* ExtensionGalleryResourceType.ExtensionDetailsViewUri */
            });
            resources.push({
                id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}&ssr=false#review-details`,
                type: "ExtensionRatingViewUriTemplate" /* ExtensionGalleryResourceType.ExtensionRatingViewUri */
            });
        }
        if (extensionsGallery.resourceUrlTemplate) {
            resources.push({
                id: extensionsGallery.resourceUrlTemplate,
                type: "ExtensionResourceUriTemplate" /* ExtensionGalleryResourceType.ExtensionResourceUri */
            });
        }
        const filtering = [
            {
                name: "Tag" /* FilterType.Tag */,
                value: 1,
            },
            {
                name: "ExtensionId" /* FilterType.ExtensionId */,
                value: 4,
            },
            {
                name: "Category" /* FilterType.Category */,
                value: 5,
            },
            {
                name: "ExtensionName" /* FilterType.ExtensionName */,
                value: 7,
            },
            {
                name: "Target" /* FilterType.Target */,
                value: 8,
            },
            {
                name: "Featured" /* FilterType.Featured */,
                value: 9,
            },
            {
                name: "SearchText" /* FilterType.SearchText */,
                value: 10,
            },
            {
                name: "ExcludeWithFlags" /* FilterType.ExcludeWithFlags */,
                value: 12,
            },
        ];
        const sorting = [
            {
                name: "NoneOrRelevance" /* SortBy.NoneOrRelevance */,
                value: 0,
            },
            {
                name: "LastUpdatedDate" /* SortBy.LastUpdatedDate */,
                value: 1,
            },
            {
                name: "Title" /* SortBy.Title */,
                value: 2,
            },
            {
                name: "PublisherName" /* SortBy.PublisherName */,
                value: 3,
            },
            {
                name: "InstallCount" /* SortBy.InstallCount */,
                value: 4,
            },
            {
                name: "AverageRating" /* SortBy.AverageRating */,
                value: 6,
            },
            {
                name: "PublishedDate" /* SortBy.PublishedDate */,
                value: 10,
            },
            {
                name: "WeightedRating" /* SortBy.WeightedRating */,
                value: 12,
            },
        ];
        const flags = [
            {
                name: "None" /* Flag.None */,
                value: 0x0,
            },
            {
                name: "IncludeVersions" /* Flag.IncludeVersions */,
                value: 0x1,
            },
            {
                name: "IncludeFiles" /* Flag.IncludeFiles */,
                value: 0x2,
            },
            {
                name: "IncludeCategoryAndTags" /* Flag.IncludeCategoryAndTags */,
                value: 0x4,
            },
            {
                name: "IncludeSharedAccounts" /* Flag.IncludeSharedAccounts */,
                value: 0x8,
            },
            {
                name: "IncludeVersionProperties" /* Flag.IncludeVersionProperties */,
                value: 0x10,
            },
            {
                name: "ExcludeNonValidated" /* Flag.ExcludeNonValidated */,
                value: 0x20,
            },
            {
                name: "IncludeInstallationTargets" /* Flag.IncludeInstallationTargets */,
                value: 0x40,
            },
            {
                name: "IncludeAssetUri" /* Flag.IncludeAssetUri */,
                value: 0x80,
            },
            {
                name: "IncludeStatistics" /* Flag.IncludeStatistics */,
                value: 0x100,
            },
            {
                name: "IncludeLatestVersionOnly" /* Flag.IncludeLatestVersionOnly */,
                value: 0x200,
            },
            {
                name: "Unpublished" /* Flag.Unpublished */,
                value: 0x1000,
            },
            {
                name: "IncludeNameConflictInfo" /* Flag.IncludeNameConflictInfo */,
                value: 0x8000,
            },
            {
                name: "IncludeLatestPrereleaseAndStableVersionOnly" /* Flag.IncludeLatestPrereleaseAndStableVersionOnly */,
                value: 0x10000,
            },
        ];
        return {
            version: '',
            resources,
            capabilities: {
                extensionQuery: {
                    filtering,
                    sorting,
                    flags,
                },
                signing: {
                    allPublicRepositorySigned: true,
                }
            }
        };
    }
};
ExtensionGalleryManifestService = __decorate([
    __param(0, IProductService)
], ExtensionGalleryManifestService);
export { ExtensionGalleryManifestService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFjbEUsSUFBTSwrQkFBK0IsR0FBckMsTUFBTSwrQkFBZ0MsU0FBUSxVQUFVO0lBTTlELElBQUksOEJBQThCO1FBQ2pDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLENBQUMsNERBQTBDLENBQUMsK0RBQTJDLENBQUM7SUFDcEosQ0FBQztJQUVELFlBQ2tCLGNBQWtEO1FBRW5FLEtBQUssRUFBRSxDQUFDO1FBRjRCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQVIzRCx3Q0FBbUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2pELDhDQUF5QyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFVaEUsQ0FBQztJQUVELEtBQUssQ0FBQywyQkFBMkI7UUFDaEMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGlCQUF1RCxDQUFDO1FBQ3RHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUNwQyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRztZQUNqQjtnQkFDQyxFQUFFLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLGlCQUFpQjtnQkFDcEQsSUFBSSxrRkFBb0Q7YUFDeEQ7WUFDRDtnQkFDQyxFQUFFLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLG1DQUFtQztnQkFDdEUsSUFBSSxrR0FBd0Q7YUFDNUQ7WUFDRDtnQkFDQyxFQUFFLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLG1GQUFtRjtnQkFDdEgsSUFBSSw0RkFBcUQ7YUFDekQ7U0FDRCxDQUFDO1FBRUYsSUFBSSxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNwQyxTQUFTLENBQUMsSUFBSSxDQUFDO2dCQUNkLEVBQUUsRUFBRSxHQUFHLGlCQUFpQixDQUFDLFlBQVksY0FBYztnQkFDbkQsSUFBSSxnRkFBK0M7YUFDbkQsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUksaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDL0IsU0FBUyxDQUFDLElBQUksQ0FBQztnQkFDZCxFQUFFLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLDhCQUE4QjtnQkFDOUQsSUFBSSw4RkFBc0Q7YUFDMUQsQ0FBQyxDQUFDO1lBQ0gsU0FBUyxDQUFDLElBQUksQ0FBQztnQkFDZCxFQUFFLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLHVEQUF1RDtnQkFDdkYsSUFBSSw0RkFBcUQ7YUFDekQsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUksaUJBQWlCLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMzQyxTQUFTLENBQUMsSUFBSSxDQUFDO2dCQUNkLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxtQkFBbUI7Z0JBQ3pDLElBQUksd0ZBQW1EO2FBQ3ZELENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRztZQUNqQjtnQkFDQyxJQUFJLDRCQUFnQjtnQkFDcEIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNEO2dCQUNDLElBQUksNENBQXdCO2dCQUM1QixLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0Q7Z0JBQ0MsSUFBSSxzQ0FBcUI7Z0JBQ3pCLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRDtnQkFDQyxJQUFJLGdEQUEwQjtnQkFDOUIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNEO2dCQUNDLElBQUksa0NBQW1CO2dCQUN2QixLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0Q7Z0JBQ0MsSUFBSSxzQ0FBcUI7Z0JBQ3pCLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRDtnQkFDQyxJQUFJLDBDQUF1QjtnQkFDM0IsS0FBSyxFQUFFLEVBQUU7YUFDVDtZQUNEO2dCQUNDLElBQUksc0RBQTZCO2dCQUNqQyxLQUFLLEVBQUUsRUFBRTthQUNUO1NBQ0QsQ0FBQztRQUVGLE1BQU0sT0FBTyxHQUFHO1lBQ2Y7Z0JBQ0MsSUFBSSxnREFBd0I7Z0JBQzVCLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRDtnQkFDQyxJQUFJLGdEQUF3QjtnQkFDNUIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNEO2dCQUNDLElBQUksNEJBQWM7Z0JBQ2xCLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRDtnQkFDQyxJQUFJLDRDQUFzQjtnQkFDMUIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNEO2dCQUNDLElBQUksMENBQXFCO2dCQUN6QixLQUFLLEVBQUUsQ0FBQzthQUNSO1lBQ0Q7Z0JBQ0MsSUFBSSw0Q0FBc0I7Z0JBQzFCLEtBQUssRUFBRSxDQUFDO2FBQ1I7WUFDRDtnQkFDQyxJQUFJLDRDQUFzQjtnQkFDMUIsS0FBSyxFQUFFLEVBQUU7YUFDVDtZQUNEO2dCQUNDLElBQUksOENBQXVCO2dCQUMzQixLQUFLLEVBQUUsRUFBRTthQUNUO1NBQ0QsQ0FBQztRQUVGLE1BQU0sS0FBSyxHQUFHO1lBQ2I7Z0JBQ0MsSUFBSSx3QkFBVztnQkFDZixLQUFLLEVBQUUsR0FBRzthQUNWO1lBQ0Q7Z0JBQ0MsSUFBSSw4Q0FBc0I7Z0JBQzFCLEtBQUssRUFBRSxHQUFHO2FBQ1Y7WUFDRDtnQkFDQyxJQUFJLHdDQUFtQjtnQkFDdkIsS0FBSyxFQUFFLEdBQUc7YUFDVjtZQUNEO2dCQUNDLElBQUksNERBQTZCO2dCQUNqQyxLQUFLLEVBQUUsR0FBRzthQUNWO1lBQ0Q7Z0JBQ0MsSUFBSSwwREFBNEI7Z0JBQ2hDLEtBQUssRUFBRSxHQUFHO2FBQ1Y7WUFDRDtnQkFDQyxJQUFJLGdFQUErQjtnQkFDbkMsS0FBSyxFQUFFLElBQUk7YUFDWDtZQUNEO2dCQUNDLElBQUksc0RBQTBCO2dCQUM5QixLQUFLLEVBQUUsSUFBSTthQUNYO1lBQ0Q7Z0JBQ0MsSUFBSSxvRUFBaUM7Z0JBQ3JDLEtBQUssRUFBRSxJQUFJO2FBQ1g7WUFDRDtnQkFDQyxJQUFJLDhDQUFzQjtnQkFDMUIsS0FBSyxFQUFFLElBQUk7YUFDWDtZQUNEO2dCQUNDLElBQUksa0RBQXdCO2dCQUM1QixLQUFLLEVBQUUsS0FBSzthQUNaO1lBQ0Q7Z0JBQ0MsSUFBSSxnRUFBK0I7Z0JBQ25DLEtBQUssRUFBRSxLQUFLO2FBQ1o7WUFDRDtnQkFDQyxJQUFJLHNDQUFrQjtnQkFDdEIsS0FBSyxFQUFFLE1BQU07YUFDYjtZQUNEO2dCQUNDLElBQUksOERBQThCO2dCQUNsQyxLQUFLLEVBQUUsTUFBTTthQUNiO1lBQ0Q7Z0JBQ0MsSUFBSSxzR0FBa0Q7Z0JBQ3RELEtBQUssRUFBRSxPQUFPO2FBQ2Q7U0FDRCxDQUFDO1FBRUYsT0FBTztZQUNOLE9BQU8sRUFBRSxFQUFFO1lBQ1gsU0FBUztZQUNULFlBQVksRUFBRTtnQkFDYixjQUFjLEVBQUU7b0JBQ2YsU0FBUztvQkFDVCxPQUFPO29CQUNQLEtBQUs7aUJBQ0w7Z0JBQ0QsT0FBTyxFQUFFO29CQUNSLHlCQUF5QixFQUFFLElBQUk7aUJBQy9CO2FBQ0Q7U0FDRCxDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUE7QUE5TVksK0JBQStCO0lBV3pDLFdBQUEsZUFBZSxDQUFBO0dBWEwsK0JBQStCLENBOE0zQyJ9