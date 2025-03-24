/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IProductService } from '../../product/common/productService.js';
import { ExtensionGalleryResourceType, Flag, IExtensionGalleryManifest, IExtensionGalleryManifestService } from './extensionGalleryManifest.js';
import { FilterType, SortBy } from './extensionManagement.js';

type ExtensionGalleryConfig = {
	readonly serviceUrl: string;
	readonly itemUrl: string;
	readonly publisherUrl: string;
	readonly resourceUrlTemplate: string;
	readonly extensionUrlTemplate: string;
	readonly controlUrl: string;
	readonly nlsBaseUrl: string;
};

export class ExtensionGalleryManifestService extends Disposable implements IExtensionGalleryManifestService {

	readonly _serviceBrand: undefined;
	readonly onDidChangeExtensionGalleryManifest = Event.None;

	constructor(
		@IProductService protected readonly productService: IProductService,
	) {
		super();
	}

	isEnabled(): boolean {
		return !!this.productService.extensionsGallery?.serviceUrl;
	}

	async getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		const extensionsGallery = this.productService.extensionsGallery as ExtensionGalleryConfig | undefined;
		if (!extensionsGallery?.serviceUrl) {
			return null;
		}

		const resources = [
			{
				id: `${extensionsGallery.serviceUrl}/extensionquery`,
				type: ExtensionGalleryResourceType.ExtensionQueryService
			},
			{
				id: `${extensionsGallery.serviceUrl}/vscode/{publisher}/{name}/latest`,
				type: ExtensionGalleryResourceType.ExtensionLatestVersionUri
			},
			{
				id: `${extensionsGallery.serviceUrl}/publishers/{publisher}/extensions/{name}/{version}/stats?statType={statTypeName}`,
				type: ExtensionGalleryResourceType.ExtensionStatisticsUri
			},
			{
				id: `${extensionsGallery.serviceUrl}/itemName/{publisher}.{name}/version/{version}/statType/{statTypeValue}/vscodewebextension`,
				type: ExtensionGalleryResourceType.WebExtensionStatisticsUri
			},
		];

		if (extensionsGallery.publisherUrl) {
			resources.push({
				id: `${extensionsGallery.publisherUrl}/{publisher}`,
				type: ExtensionGalleryResourceType.PublisherViewUri
			});
		}

		if (extensionsGallery.itemUrl) {
			resources.push({
				id: `${extensionsGallery.itemUrl}/?itemName={publisher}.{name}`,
				type: ExtensionGalleryResourceType.ExtensionDetailsViewUri
			});
			resources.push({
				id: `${extensionsGallery.itemUrl}/?itemName={publisher}.{name}&ssr=false#review-details`,
				type: ExtensionGalleryResourceType.ExtensionRatingViewUri
			});
		}

		if (extensionsGallery.resourceUrlTemplate) {
			resources.push({
				id: extensionsGallery.resourceUrlTemplate,
				type: ExtensionGalleryResourceType.ExtensionResourceUri
			});
		}

		const filtering = [
			{
				name: FilterType.Tag,
				value: 1,
			},
			{
				name: FilterType.ExtensionId,
				value: 4,
			},
			{
				name: FilterType.Category,
				value: 5,
			},
			{
				name: FilterType.ExtensionName,
				value: 7,
			},
			{
				name: FilterType.Target,
				value: 8,
			},
			{
				name: FilterType.Featured,
				value: 9,
			},
			{
				name: FilterType.SearchText,
				value: 10,
			},
			{
				name: FilterType.ExcludeWithFlags,
				value: 12,
			},
		];

		const sorting = [
			{
				name: SortBy.NoneOrRelevance,
				value: 0,
			},
			{
				name: SortBy.LastUpdatedDate,
				value: 1,
			},
			{
				name: SortBy.Title,
				value: 2,
			},
			{
				name: SortBy.PublisherName,
				value: 3,
			},
			{
				name: SortBy.InstallCount,
				value: 4,
			},
			{
				name: SortBy.AverageRating,
				value: 6,
			},
			{
				name: SortBy.PublishedDate,
				value: 10,
			},
			{
				name: SortBy.WeightedRating,
				value: 12,
			},
		];

		const flags = [
			{
				name: Flag.None,
				value: 0x0,
			},
			{
				name: Flag.IncludeVersions,
				value: 0x1,
			},
			{
				name: Flag.IncludeFiles,
				value: 0x2,
			},
			{
				name: Flag.IncludeCategoryAndTags,
				value: 0x4,
			},
			{
				name: Flag.IncludeSharedAccounts,
				value: 0x8,
			},
			{
				name: Flag.IncludeVersionProperties,
				value: 0x10,
			},
			{
				name: Flag.ExcludeNonValidated,
				value: 0x20,
			},
			{
				name: Flag.IncludeInstallationTargets,
				value: 0x40,
			},
			{
				name: Flag.IncludeAssetUri,
				value: 0x80,
			},
			{
				name: Flag.IncludeStatistics,
				value: 0x100,
			},
			{
				name: Flag.IncludeLatestVersionOnly,
				value: 0x200,
			},
			{
				name: Flag.Unpublished,
				value: 0x1000,
			},
			{
				name: Flag.IncludeNameConflictInfo,
				value: 0x8000,
			},
			{
				name: Flag.IncludeLatestPrereleaseAndStableVersionOnly,
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
					allRepositorySigned: true,
				}
			}
		};
	}
}
