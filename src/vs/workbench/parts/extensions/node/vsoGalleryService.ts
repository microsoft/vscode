/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IExtension, IGalleryService, IGalleryVersion, IQueryOptions, IQueryResult } from 'vs/workbench/parts/extensions/common/extensions';
import { isUndefined } from 'vs/base/common/types';
import { IXHRResponse } from 'vs/base/common/http';
import { assign, getOrDefault } from 'vs/base/common/objects';
import { IRequestService } from 'vs/platform/request/common/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { matchesContiguousSubString } from 'vs/base/common/filters';
import { getExtensionId } from 'vs/workbench/parts/extensions/common/extensionsUtil';
import product from 'vs/platform/product';

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

	withSort(sortBy: SortBy, sortOrder = SortOrder.Default): Query {
		return new Query(assign({}, this.state, { sortBy, sortOrder }));
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

function getInstallCount(statistics: IGalleryExtensionStatistics[]): number {
	if (!statistics) {
		return 0;
	}

	const result = statistics.filter(s => s.statisticName === 'install')[0];
	return result ? result.value : 0;
}

function toExtension(galleryExtension: IGalleryExtension, extensionsGalleryUrl: string, downloadHeaders: any): IExtension {
	const versions = galleryExtension.versions.map<IGalleryVersion>(v => ({
		version: v.version,
		date: v.lastUpdated,
		downloadHeaders,
		downloadUrl: `${ v.assetUri }/Microsoft.VisualStudio.Services.VSIXPackage?install=true`,
		manifestUrl: `${ v.assetUri }/Microsoft.VisualStudio.Code.Manifest`
	}));

	return {
		name: galleryExtension.extensionName,
		displayName: galleryExtension.displayName || galleryExtension.extensionName,
		publisher: galleryExtension.publisher.publisherName,
		version: versions[0].version,
		engines: { vscode: void 0 }, // TODO: ugly
		description: galleryExtension.shortDescription || '',
		galleryInformation: {
			galleryApiUrl: extensionsGalleryUrl,
			id: galleryExtension.extensionId,
			publisherId: galleryExtension.publisher.publisherId,
			publisherDisplayName: galleryExtension.publisher.displayName,
			installCount: getInstallCount(galleryExtension.statistics),
			versions
		}
	};
}

const FIVE_MINUTES = 1000 * 60 * 5;

function extensionFilter(input: string): (e: IExtension) => boolean {
	return extension => {
		return !!matchesContiguousSubString(input, `${ extension.publisher }.${ extension.name }`)
			|| !!matchesContiguousSubString(input, extension.name)
			|| !!matchesContiguousSubString(input, extension.displayName)
			|| !!matchesContiguousSubString(input, extension.description);
	};
}

export class GalleryService implements IGalleryService {

	serviceId = IGalleryService;

	private extensionsGalleryUrl: string;
	private extensionsCacheUrl: string;
	private machineId: TPromise<string>;

	constructor(
		@IRequestService private requestService: IRequestService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		const config = product.extensionsGallery;
		this.extensionsGalleryUrl = config && config.serviceUrl;
		this.extensionsCacheUrl = config && config.cacheUrl;
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

		const type = options.ids ? 'ids' : (options.text ? 'text' : 'all');
		const text = options.text || '';
		this.telemetryService.publicLog('galleryService:query', { type, text });

		const cache = this.queryCache().then(result => {
			const rawLastModified = result.getResponseHeader('last-modified');

			if (!rawLastModified) {
				return TPromise.wrapError('no last modified header');
			}

			const lastModified = new Date(rawLastModified).getTime();
			const now = new Date().getTime();
			const diff = now - lastModified;

			if (diff > FIVE_MINUTES) {
				return TPromise.wrapError('stale');
			}

			return this.getRequestHeaders().then(downloadHeaders => {
				const rawExtensions: IGalleryExtension[] = JSON.parse(result.responseText).results[0].extensions || [];
				let extensions = rawExtensions
					.map(e => toExtension(e, this.extensionsGalleryUrl, downloadHeaders));

				if (options.ids) {
					extensions = extensions.filter(e => options.ids.indexOf(getExtensionId(e)) > -1);
				} else if (options.text) {
					extensions = extensions.filter(extensionFilter(options.text));
				}

				extensions = extensions
					.sort((a, b) => b.galleryInformation.installCount - a.galleryInformation.installCount);

				return {
					firstPage: extensions,
					total: extensions.length,
					pageSize: extensions.length,
					getPage: () => TPromise.as([])
				};
			});
		});

		return cache.then(null, _ => this._query(options));
	}

	private _query(options: IQueryOptions = {}): TPromise<IQueryResult> {
		const text = getOrDefault(options, o => o.text, '');
		const pageSize = getOrDefault(options, o => o.pageSize, 30);

		let query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeCategoryAndTags, Flags.IncludeAssetUri, Flags.IncludeStatistics)
			.withPage(1, pageSize)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withSort(SortBy.InstallCount);

		if (text) {
			query = query.withFilter(FilterType.SearchText, text);
		} else if (options.ids) {
			options.ids.forEach(id => {
				query = query.withFilter(FilterType.ExtensionName, id);
			});
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

	private queryGallery(query: Query): TPromise<{ galleryExtensions: IGalleryExtension[], total: number; }> {
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

	private queryCache(): TPromise<IXHRResponse> {
		const url = this.extensionsCacheUrl;

		if (!url) {
			return TPromise.wrapError(new Error('No cache configured.'));
		}

		return this.requestService.makeRequest({ url });
	}

	private getRequestHeaders(): TPromise<any> {
		return this.machineId.then(machineId => {
			const result = {
				'X-Market-Client-Id': 'VSCode',
				'User-Agent': 'VSCode'
			};

			if (machineId) {
				result['X-Market-User-Id'] = machineId;
			}

			return result;
		});
	}
}