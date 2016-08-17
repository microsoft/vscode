/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { tmpdir } from 'os';
import * as path from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { IGalleryExtension, IExtensionGalleryService, IQueryOptions, SortBy, SortOrder, IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';
import { isUndefined } from 'vs/base/common/types';
import { assign, getOrDefault } from 'vs/base/common/objects';
import { IRequestService } from 'vs/platform/request/common/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IPager } from 'vs/base/common/paging';
import { IRequestOptions, IRequestContext, download, asJson } from 'vs/base/node/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import pkg from 'vs/platform/package';
import product from 'vs/platform/product';
import { isValidExtensionVersion } from 'vs/platform/extensions/node/extensionValidator';

interface IRawGalleryExtensionFile {
	assetType: string;
	source: string;
}

interface IRawGalleryExtensionVersion {
	version: string;
	lastUpdated: string;
	assetUri: string;
	files: IRawGalleryExtensionFile[];
}

interface IRawGalleryExtensionStatistics {
	statisticName: string;
	value: number;
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

interface IRawGalleryQueryResult {
	results: {
		extensions: IRawGalleryExtension[];
		resultMetadata: {
			metadataType: string;
			metadataItems: {
				name: string;
				count: number;
			}[];
		}[]
	}[];
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

const AssetType = {
	Icon: 'Microsoft.VisualStudio.Services.Icons.Default',
	Details: 'Microsoft.VisualStudio.Services.Content.Details',
	Manifest: 'Microsoft.VisualStudio.Code.Manifest',
	VSIX: 'Microsoft.VisualStudio.Services.VSIXPackage',
	License: 'Microsoft.VisualStudio.Services.Content.License'
};

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
	assetTypes: string[];
}

const DefaultQueryState: IQueryState = {
	pageNumber: 1,
	pageSize: DefaultPageSize,
	sortBy: SortBy.NoneOrRelevance,
	sortOrder: SortOrder.Default,
	flags: Flags.None,
	criteria: [],
	assetTypes: []
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

	withSortOrder(sortOrder: SortOrder): Query {
		return new Query(assign({}, this.state, { sortOrder }));
	}

	withFlags(...flags: Flags[]): Query {
		return new Query(assign({}, this.state, { flags: flags.reduce((r, f) => r | f, 0) }));
	}

	withAssetTypes(...assetTypes: string[]): Query {
		return new Query(assign({}, this.state, { assetTypes }));
	}

	get raw(): any {
		const { criteria, pageNumber, pageSize, sortBy, sortOrder, flags, assetTypes } = this.state;
		const filters = [{ criteria, pageNumber, pageSize, sortBy, sortOrder }];
		return { filters, assetTypes, flags };
	}
}

function getStatistic(statistics: IRawGalleryExtensionStatistics[], name: string): number {
	const result = (statistics || []).filter(s => s.statisticName === name)[0];
	return result ? result.value : 0;
}

function getAssetSource(files: IRawGalleryExtensionFile[], type: string): string {
	const result = files.filter(f => f.assetType === type)[0];
	return result && result.source;
}

function toExtension(galleryExtension: IRawGalleryExtension, extensionsGalleryUrl: string, downloadHeaders: { [key: string]: string; }): IGalleryExtension {
	const [version] = galleryExtension.versions;
	const assets = {
		manifest: getAssetSource(version.files, AssetType.Manifest),
		readme: getAssetSource(version.files, AssetType.Details),
		download: `${ getAssetSource(version.files, AssetType.VSIX) }?install=true`,
		icon: getAssetSource(version.files, AssetType.Icon) || require.toUrl('./media/defaultIcon.png'),
		license: getAssetSource(version.files, AssetType.License)
	};

	return {
		id: galleryExtension.extensionId,
		name: galleryExtension.extensionName,
		version: version.version,
		date: version.lastUpdated,
		displayName: galleryExtension.displayName,
		publisherId: galleryExtension.publisher.publisherId,
		publisher: galleryExtension.publisher.publisherName,
		publisherDisplayName: galleryExtension.publisher.displayName,
		description: galleryExtension.shortDescription || '',
		installCount: getStatistic(galleryExtension.statistics, 'install'),
		rating: getStatistic(galleryExtension.statistics, 'averagerating'),
		ratingCount: getStatistic(galleryExtension.statistics, 'ratingcount'),
		assets,
		downloadHeaders
	};
}

export class ExtensionGalleryService implements IExtensionGalleryService {

	_serviceBrand: any;

	private extensionsGalleryUrl: string;

	private getCommonHeaders(): TPromise<{ [key: string]: string; }> {
		return this.telemetryService.getTelemetryInfo().then(({ machineId }) => {
			const result: { [key: string]: string; } = {
				'X-Market-Client-Id': `VSCode ${ pkg.version }`,
				'User-Agent': `VSCode ${ pkg.version }`
			};

			if (machineId) {
				result['X-Market-User-Id'] = machineId;
			}

			return result;
		});
	}

	constructor(
		@IRequestService private requestService: IRequestService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		const config = product.extensionsGallery;
		this.extensionsGalleryUrl = config && config.serviceUrl;
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
			.withFlags(Flags.IncludeLatestVersionOnly, Flags.IncludeAssetUri, Flags.IncludeStatistics, Flags.IncludeFiles)
			.withPage(1, pageSize)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withAssetTypes(AssetType.Icon, AssetType.License, AssetType.Details, AssetType.Manifest, AssetType.VSIX);

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
			return this.getCommonHeaders().then(downloadHeaders => {
				const extensions = galleryExtensions.map(e => toExtension(e, this.extensionsGalleryUrl, downloadHeaders));
				const pageSize = query.pageSize;
				const getPage = pageIndex => this.queryGallery(query.withPage(pageIndex + 1))
					.then(({ galleryExtensions }) => galleryExtensions.map(e => toExtension(e, this.extensionsGalleryUrl, downloadHeaders)));

				return { firstPage: extensions, total, pageSize, getPage };
			});
		});
	}

	private queryGallery(query: Query): TPromise<{ galleryExtensions: IRawGalleryExtension[], total: number; }> {
		return this.getCommonHeaders()
			.then(headers => {
				const data = JSON.stringify(query.raw);

				headers = assign(headers, {
					'Content-Type': 'application/json',
					'Accept': 'application/json;api-version=3.0-preview.1',
					'Accept-Encoding': 'gzip',
					'Content-Length': data.length
				});

				return this.requestService.request({
					type: 'POST',
					url: this.api('/extensionquery'),
					data,
					headers
				});
			})
			.then(context => asJson<IRawGalleryQueryResult>(context))
			.then(result => {
				const r = result.results[0];
				const galleryExtensions = r.extensions;
				const resultCount = r.resultMetadata && r.resultMetadata.filter(m => m.metadataType === 'ResultCount')[0];
				const total = resultCount && resultCount.metadataItems.filter(i => i.name === 'TotalCount')[0].count || 0;

				return { galleryExtensions, total };
			});
	}

	download(extension: IGalleryExtension): TPromise<string> {
		const query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeFiles)
			.withPage(1, 1)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withAssetTypes(AssetType.Manifest, AssetType.VSIX)
			.withFilter(FilterType.ExtensionId, extension.id);

		return this.queryGallery(query).then(({ galleryExtensions }) => {
			const [rawExtension] = galleryExtensions;

			if (!rawExtension) {
				return TPromise.wrapError(new Error(localize('notFound', "Extension not found")));
			}

			return this.getLastValidExtensionVersion(rawExtension, rawExtension.versions).then(rawVersion => {
				const url = `${ getAssetSource(rawVersion.files, AssetType.VSIX) }?install=true`;
				const zipPath = path.join(tmpdir(), extension.id);

				return this.getCommonHeaders()
					.then(headers => this._getAsset({ url, headers }))
					.then(context => download(zipPath, context))
					.then(() => zipPath);
			});
		});
	}

	getAsset(url: string): TPromise<IRequestContext> {
		return this._getAsset({ url });
	}

	private _getAsset(options: IRequestOptions): TPromise<IRequestContext> {
		return this.requestService.request(options);
	}

	private getLastValidExtensionVersion(extension: IRawGalleryExtension, versions: IRawGalleryExtensionVersion[]): TPromise<IRawGalleryExtensionVersion> {
		if (!versions.length) {
			return TPromise.wrapError(new Error(localize('noCompatible', "Couldn't find a compatible version of {0} with this version of Code.", extension.displayName || extension.extensionName)));
		}

		const version = versions[0];
		const url = getAssetSource(version.files, AssetType.Manifest);

		return this.getCommonHeaders()
			.then(headers => assign(headers, { 'accept-encoding': 'gzip' }))
			.then(headers => this.requestService.request({ url, headers }))
			.then(context => asJson<IExtensionManifest>(context))
			.then(manifest => {
				const desc = {
					isBuiltin: false,
					engines: { vscode: manifest.engines.vscode },
					main: manifest.main
				};

				if (!isValidExtensionVersion(pkg.version, desc, [])) {
					return this.getLastValidExtensionVersion(extension, versions.slice(1));
				}

				return version;
			});
	}
}