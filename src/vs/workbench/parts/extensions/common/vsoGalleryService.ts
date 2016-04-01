/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IGalleryService, IGalleryVersion, IQueryOptions, IQueryResult } from 'vs/workbench/parts/extensions/common/extensions';
import { IXHRResponse } from 'vs/base/common/http';
import { isUndefined } from 'vs/base/common/types';
import { assign, getOrDefault } from 'vs/base/common/objects';
import { IRequestService } from 'vs/platform/request/common/request';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export interface IGalleryExtensionFile {
	assetType: string;
}

export interface IGalleryExtensionVersion {
	version: string;
	lastUpdated: string;
	assetUri: string;
	files: IGalleryExtensionFile[];
}

export interface IGalleryExtension {
	extensionId: string;
	extensionName: string;
	displayName: string;
	shortDescription: string;
	publisher: { displayName: string, publisherId: string, publisherName: string; };
	versions: IGalleryExtensionVersion[];
	galleryApiUrl: string;
	statistics: IGalleryExtensionStatistics[];
}

export interface IGalleryExtensionStatistics {
	statisticName: string;
	value: number;
}

enum Flags {
	None = 0x0,
	IncludeVersions = 0x1,
	IncludeFiles = 0x2,
	IncludeCategoryAndTags = 0x4,
	IncludeSharedAccounts = 0x8,
	IncludeVersionProperties = 0x10,
	ExcludeNonValidated = 0x20,
	IncludeInstallationTargets = 0x40,
	IncludeAssetUri = 0x80,
	IncludeStatistics = 0x100,
	IncludeLatestVersionOnly = 0x200
}

enum FilterType {
	Tag = 1,
	ExtensionId = 4,
	Category = 5,
	ExtensionName = 7,
	Target = 8,
	Featured = 9,
	SearchText = 10
}

enum SortBy {
	NoneOrRelevance = 0,
	LastUpdatedDate = 1,
	Title = 2,
	PublisherName = 3,
	InstallCount = 4,
	PublishedDate = 5,
	AverageRating = 6
}

enum SortOrder {
	Default = 0,
	Ascending = 1,
	Descending = 2
}

interface ICriterium {
	filterType: FilterType;
	value?: string;
}

class Query {

	private pageNumber = 1;
	private pageSize = 10;
	private sortBy = SortBy.NoneOrRelevance;
	private sortOrder = SortOrder.Default;
	private flags = Flags.None;
	private criteria: ICriterium[] = [];

	withPage(pageSize: number, pageNumber: number): Query {
		this.pageSize = pageSize;
		this.pageNumber = pageNumber;
		return this;
	}

	withFilter(filterType: FilterType, value?: string): Query {
		const criterium: ICriterium = { filterType };

		if (!isUndefined(value)) {
			criterium.value = value;
		}

		this.criteria.push(criterium);
		return this;
	}

	withSort(sortBy: SortBy, sortOrder = SortOrder.Default): Query {
		this.sortBy = sortBy;
		this.sortOrder = sortOrder;
		return this;
	}

	withFlags(...flags: Flags[]): Query {
		this.flags = flags.reduce((r, f) => r | f, 0);
		return this;
	}

	get raw(): any {
		return {
			filters: [{
				criteria: this.criteria,
				pageNumber: this.pageNumber,
				pageSize: this.pageSize,
				sortBy: this.sortBy,
				sortOrder: this.sortOrder
			}],
			flags: this.flags
		};
	}
}

function getInstallCount(statistics: IGalleryExtensionStatistics[]): number {
	if (!statistics) {
		return 0;
	}

	const result = statistics.filter(s => s.statisticName === 'install')[0];
	return result ? result.value : 0;
}

export class GalleryService implements IGalleryService {

	serviceId = IGalleryService;

	private extensionsGalleryUrl: string;
	private machineId: TPromise<string>;

	constructor(
		@IRequestService private requestService: IRequestService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		const config = contextService.getConfiguration().env.extensionsGallery;
		this.extensionsGalleryUrl = config && config.serviceUrl;
		this.machineId = telemetryService.getTelemetryInfo().then(({ machineId }) => machineId);
	}

	private api(path = ''): string {
		return `${ this.extensionsGalleryUrl }${ path }`;
	}

	isEnabled(): boolean {
		return !!this.extensionsGalleryUrl;
	}

	query(options: IQueryOptions = {}): TPromise<IQueryResult> {
		if (!this.isEnabled()) {
			return TPromise.wrapError(new Error('No extension gallery service configured.'));
		}

		return this.queryGallery(options)
			.then(r => JSON.parse(r.responseText).results[0])
			.then<{ galleryExtensions: IGalleryExtension[]; total: number; }>(r => {
				const galleryExtensions = r.extensions;
				const resultCount = r.resultMetadata && r.resultMetadata.filter(m => m.metadataType === 'ResultCount')[0];
				const total = resultCount && resultCount.metadataItems.filter(i => i.name === 'TotalCount')[0].count || 0;

				return { galleryExtensions, total };
			})
			.then(({ galleryExtensions, total }) => {
				return this.getRequestHeaders().then(downloadHeaders => {
					const extensions = galleryExtensions.map(e => {
						const versions = e.versions.map<IGalleryVersion>(v => ({
							version: v.version,
							date: v.lastUpdated,
							downloadHeaders,
							downloadUrl: `${ v.assetUri }/Microsoft.VisualStudio.Services.VSIXPackage?install=true`,
							manifestUrl: `${ v.assetUri }/Microsoft.VisualStudio.Code.Manifest`
						}));

						return {
							name: e.extensionName,
							displayName: e.displayName || e.extensionName,
							publisher: e.publisher.publisherName,
							version: versions[0].version,
							engines: { vscode: void 0 }, // TODO: ugly
							description: e.shortDescription || '',
							galleryInformation: {
								galleryApiUrl: this.extensionsGalleryUrl,
								id: e.extensionId,
								publisherId: e.publisher.publisherId,
								publisherDisplayName: e.publisher.displayName,
								installCount: getInstallCount(e.statistics),
								versions
							}
						};
					});

					return { extensions, total };
				});
			});
	}

	private queryGallery(options: IQueryOptions): TPromise<IXHRResponse> {
		const text = getOrDefault(options, o => o.text, '');
		const pageNumber = getOrDefault(options, o => o.pageNumber, 1);
		const pageSize = getOrDefault(options, o => o.pageNumber, 10);

		let query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeCategoryAndTags, Flags.IncludeAssetUri, Flags.IncludeStatistics)
			.withPage(pageSize, pageNumber)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withSort(SortBy.InstallCount);

		if (text) {
			query = query.withFilter(FilterType.SearchText, text);
		}

		const data = JSON.stringify(query.raw);

		return this.getRequestHeaders().then(headers => {
			headers = assign(headers, {
				'Content-Type': 'application/json',
				'Accept': 'application/json;api-version=3.0-preview.1',
				'Content-Length': data.length
			});

			const request = {
				type: 'POST',
				url: this.api('/extensionquery'),
				data,
				headers
			};

			return this.requestService.makeRequest(request);
		});
	}

	private getRequestHeaders(): TPromise<any> {
		return this.machineId.then(machineId => {
			const result = {
				'X-Market-Client-Id': 'VSCode'
			};

			if (machineId) {
				result['X-Market-User-Id'] = machineId;
			}

			return result;
		});
	}
}