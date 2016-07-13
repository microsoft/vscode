/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IGalleryExtension, IExtensionGalleryService, IGalleryVersion, IQueryOptions, SortBy, SortOrder } from 'vs/platform/extensionManagement/common/extensionManagement';
import { isUndefined } from 'vs/base/common/types';
import { assign, getOrDefault } from 'vs/base/common/objects';
import { IRequestService } from 'vs/platform/request/common/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IPager } from 'vs/base/common/paging';
import pkg from 'vs/platform/package';
import product from 'vs/platform/product';

interface IRawGalleryExtensionFile {
	assetType: string;
}

interface IRawGalleryExtensionVersion {
	version: string;
	lastUpdated: string;
	assetUri: string;
	files: IRawGalleryExtensionFile[];
}

interface IRawGalleryExtension {
	extensionId: string;
	extensionName: string;
	displayName: string;
	shortDescription: string;
	publisher: { displayName: string, publisherId: string, publisherName: string; };
	versions: IRawGalleryExtensionVersion[];
	statistics: IRawGalleryExtensionStatistics[];
}

interface IRawGalleryExtensionStatistics {
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

interface ICriterium {
	filterType: FilterType;
	value?: string;
}

const DefaultPageSize = 10;

interface IQueryState {
	pageNumber: number;
	pageSize: number;
	sortBy: SortBy;
	sortOrder: SortOrder;
	flags: Flags;
	criteria: ICriterium[];
}

const DefaultQueryState: IQueryState = {
	pageNumber: 1,
	pageSize: DefaultPageSize,
	sortBy: SortBy.NoneOrRelevance,
	sortOrder: SortOrder.Default,
	flags: Flags.None,
	criteria: []
};

class Query {

	constructor(private state = DefaultQueryState) {}

	get pageNumber(): number { return this.state.pageNumber; }
	get pageSize(): number { return this.state.pageSize; }
	get sortBy(): number { return this.state.sortBy; }
	get sortOrder(): number { return this.state.sortOrder; }
	get flags(): number { return this.state.flags; }

	withPage(pageNumber: number, pageSize: number = this.state.pageSize): Query {
		return new Query(assign({}, this.state, { pageNumber, pageSize }));
	}

	withFilter(filterType: FilterType, value?: string): Query {
		const criterium: ICriterium = { filterType };

		if (!isUndefined(value)) {
			criterium.value = value;
		}

		const criteria = this.state.criteria.slice();
		criteria.push(criterium);
		return new Query(assign({}, this.state, { criteria }));
	}

	withSortBy(sortBy: SortBy): Query {
		return new Query(assign({}, this.state, { sortBy }));
	}

	withSortOrder(sortOrder): Query {
		return new Query(assign({}, this.state, { sortOrder }));
	}

	withFlags(...flags: Flags[]): Query {
		return new Query(assign({}, this.state, { flags: flags.reduce((r, f) => r | f, 0) }));
	}

	get raw(): any {
		return {
			filters: [{
				criteria: this.state.criteria,
				pageNumber: this.state.pageNumber,
				pageSize: this.state.pageSize,
				sortBy: this.state.sortBy,
				sortOrder: this.state.sortOrder
			}],
			flags: this.state.flags
		};
	}
}

function getStatistic(statistics: IRawGalleryExtensionStatistics[], name: string): number {
	const result = (statistics || []).filter(s => s.statisticName === name)[0];
	return result ? result.value : 0;
}

function toExtension(galleryExtension: IRawGalleryExtension, extensionsGalleryUrl: string, downloadHeaders: any): IGalleryExtension {
	const versions = galleryExtension.versions.map<IGalleryVersion>(v => ({
		version: v.version,
		date: v.lastUpdated,
		downloadHeaders,
		downloadUrl: `${ v.assetUri }/Microsoft.VisualStudio.Services.VSIXPackage?install=true`,
		manifestUrl: `${ v.assetUri }/Microsoft.VisualStudio.Code.Manifest`,
		readmeUrl: `${ v.assetUri }/Microsoft.VisualStudio.Services.Content.Details`,
		iconUrl: `${ v.assetUri }/Microsoft.VisualStudio.Services.Icons.Default`
	}));

	return {
		id: galleryExtension.extensionId,
		name: galleryExtension.extensionName,
		displayName: galleryExtension.displayName,
		publisherId: galleryExtension.publisher.publisherId,
		publisher: galleryExtension.publisher.publisherName,
		publisherDisplayName: galleryExtension.publisher.displayName,
		description: galleryExtension.shortDescription || '',
		installCount: getStatistic(galleryExtension.statistics, 'install'),
		rating: getStatistic(galleryExtension.statistics, 'averagerating'),
		ratingCount: getStatistic(galleryExtension.statistics, 'ratingcount'),
		versions
	};
}

export class ExtensionGalleryService implements IExtensionGalleryService {

	_serviceBrand: any;

	private extensionsGalleryUrl: string;
	private machineId: TPromise<string>;

	constructor(
		@IRequestService private requestService: IRequestService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		const config = product.extensionsGallery;
		this.extensionsGalleryUrl = config && config.serviceUrl;
		this.machineId = telemetryService.getTelemetryInfo().then(({ machineId }) => machineId);
	}

	private api(path = ''): string {
		return `${ this.extensionsGalleryUrl }${ path }`;
	}

	isEnabled(): boolean {
		return !!this.extensionsGalleryUrl;
	}

	query(options: IQueryOptions = {}): TPromise<IPager<IGalleryExtension>> {
		if (!this.isEnabled()) {
			return TPromise.wrapError(new Error('No extension gallery service configured.'));
		}

		const type = options.names ? 'ids' : (options.text ? 'text' : 'all');
		const text = options.text || '';
		const pageSize = getOrDefault(options, o => o.pageSize, 50);

		this.telemetryService.publicLog('galleryService:query', { type, text });

		let query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeCategoryAndTags, Flags.IncludeAssetUri, Flags.IncludeStatistics)
			.withPage(1, pageSize)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code');

		if (text) {
			query = query.withFilter(FilterType.SearchText, text).withSortBy(SortBy.NoneOrRelevance);
		} else if (options.ids) {
			query = options.ids.reduce((query, id) => query.withFilter(FilterType.ExtensionId, id), query);
		} else if (options.names) {
			query = options.names.reduce((query, name) => query.withFilter(FilterType.ExtensionName, name), query);
		} else {
			query = query.withSortBy(SortBy.InstallCount);
		}

		if (typeof options.sortBy === 'number') {
			query = query.withSortBy(options.sortBy);
		}

		if (typeof options.sortOrder === 'number') {
			query = query.withSortOrder(options.sortOrder);
		}

		return this.queryGallery(query).then(({ galleryExtensions, total }) => {
			return this.getRequestHeaders().then(downloadHeaders => {
				const extensions = galleryExtensions.map(e => toExtension(e, this.extensionsGalleryUrl, downloadHeaders));
				const pageSize = query.pageSize;
				const getPage = pageIndex => this.queryGallery(query.withPage(pageIndex + 1))
					.then(({ galleryExtensions }) => galleryExtensions.map(e => toExtension(e, this.extensionsGalleryUrl, downloadHeaders)));

				return { firstPage: extensions, total, pageSize, getPage };
			});
		});
	}

	private queryGallery(query: Query): TPromise<{ galleryExtensions: IRawGalleryExtension[], total: number; }> {
		const data = JSON.stringify(query.raw);

		return this.getRequestHeaders()
			.then(headers => {
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
			})
			.then(r => JSON.parse(r.responseText).results[0])
			.then(r => {
				const galleryExtensions = r.extensions;
				const resultCount = r.resultMetadata && r.resultMetadata.filter(m => m.metadataType === 'ResultCount')[0];
				const total = resultCount && resultCount.metadataItems.filter(i => i.name === 'TotalCount')[0].count || 0;

				return { galleryExtensions, total };
			});
	}

	private getRequestHeaders(): TPromise<any> {
		return this.machineId.then(machineId => {
			const result = {
				'X-Market-Client-Id': `VSCode ${ pkg.version }`,
				'User-Agent': `VSCode ${ pkg.version }`
			};

			if (machineId) {
				result['X-Market-User-Id'] = machineId;
			}

			return result;
		});
	}
}