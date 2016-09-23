/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { tmpdir } from 'os';
import * as path from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { distinct } from 'vs/base/common/arrays';
import { ArraySet } from 'vs/base/common/set';
import { IGalleryExtension, IExtensionGalleryService, IQueryOptions, SortBy, SortOrder, IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionTelemetryData } from 'vs/platform/extensionManagement/common/extensionTelemetry';
import { isUndefined } from 'vs/base/common/types';
import { assign, getOrDefault } from 'vs/base/common/objects';
import { IRequestService } from 'vs/platform/request/common/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IPager } from 'vs/base/common/paging';
import { IRequestOptions, IRequestContext, download, asJson } from 'vs/base/node/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import pkg from 'vs/platform/package';
import product from 'vs/platform/product';
import { isValidExtensionVersion, validateVersions } from 'vs/platform/extensions/node/extensionValidator';
import * as url from 'url';

interface IRawGalleryExtensionFile {
	assetType: string;
	source: string;
}

interface IRawGalleryExtensionProperty {
	key: string;
	value: string;
}

interface IRawGalleryExtensionVersion {
	version: string;
	lastUpdated: string;
	assetUri: string;
	files: IRawGalleryExtensionFile[];
	properties?: IRawGalleryExtensionProperty[];
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
	License: 'Microsoft.VisualStudio.Services.Content.License',
};

const PropertyType = {
	Dependency: 'Microsoft.VisualStudio.Code.ExtensionDependencies',
	Engine: 'Microsoft.VisualStudio.Code.Engine'
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
function getDependencies(version: IRawGalleryExtensionVersion): string[] {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.Dependency) : [];
	if (values.length && values[0].value) {
		return values[0].value.split(',');
	}
	return [];
}
function getEngine(version: IRawGalleryExtensionVersion): string {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.Engine) : [];
	if (values.length && values[0].value) {
		return values[0].value;
	}
	return '';
}
function toExtension(galleryExtension: IRawGalleryExtension, extensionsGalleryUrl: string, downloadHeaders: { [key: string]: string; }): IGalleryExtension {
	const [version] = galleryExtension.versions;

	let iconFallback = getAssetSource(version.files, AssetType.Icon);
	let icon: string;

	if (iconFallback) {
		const parsedUrl = url.parse(iconFallback, true);
		parsedUrl.search = undefined;
		parsedUrl.query['redirect'] = 'true';
		icon = url.format(parsedUrl);
	} else {
		iconFallback = icon = require.toUrl('./media/defaultIcon.png');
	}

	const assets = {
		manifest: getAssetSource(version.files, AssetType.Manifest),
		readme: getAssetSource(version.files, AssetType.Details),
		download: `${ getAssetSource(version.files, AssetType.VSIX) }?install=true`,
		icon,
		iconFallback,
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
		properties: {
			dependencies: getDependencies(version),
			engine: getEngine(version)
		},
		downloadHeaders,
		isCompatible: false
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
		return this.loadCompatibleVersion(extension).then(extension => {
			const url = extension.assets.download;
			const zipPath = path.join(tmpdir(), extension.id);
			const data = getGalleryExtensionTelemetryData(extension);
			const startTime = new Date().getTime();
			const log = duration => this.telemetryService.publicLog('galleryService:downloadVSIX', assign(data, { duration }));

			return this.getCommonHeaders()
				.then(headers => this._getAsset({ url, headers }))
				.then(context => download(zipPath, context))
				.then(() => log(new Date().getTime() - startTime))
				.then(() => zipPath);
		});
	}

	getAsset(url: string): TPromise<IRequestContext> {
		return this._getAsset({ url });
	}

	getAllDependencies(extension: IGalleryExtension): TPromise<IGalleryExtension[]> {
		return this.loadCompatibleVersion(<IGalleryExtension>extension)
			.then(compatible => this.getDependenciesReccursively(compatible.properties.dependencies, [extension]))
			.then(dependencies => dependencies.slice(1));
	}

	loadCompatibleVersion(extension: IGalleryExtension): TPromise<IGalleryExtension> {
		if (extension.isCompatible) {
			return TPromise.wrap(extension);
		}
		if (extension.assets.download && extension.properties.engine && validateVersions(pkg.version, extension.properties.engine, [])) {
			extension.isCompatible = true;
			return TPromise.wrap(extension);
		}
		const query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, 1)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withAssetTypes(AssetType.Manifest, AssetType.VSIX)
			.withFilter(FilterType.ExtensionId, extension.id);

		return this.queryGallery(query).then(({ galleryExtensions }) => {
			const [rawExtension] = galleryExtensions;
			if (!rawExtension) {
				return TPromise.wrapError(new Error(localize('notFound', "Extension not found")));
			}
			return this.getLastValidExtensionVersion(rawExtension, rawExtension.versions)
				.then(rawVersion => {
					extension.properties.dependencies = getDependencies(rawVersion);
					extension.properties.engine = getEngine(rawVersion);
					extension.assets.download = `${getAssetSource(rawVersion.files, AssetType.VSIX)}?install=true`;
					extension.isCompatible = true;
					return extension;
				});
		});
	}

	private loadDependencies(extensionNames: string[]): TPromise<IGalleryExtension[]> {
		let query = new Query()
			.withFlags(Flags.IncludeLatestVersionOnly, Flags.IncludeAssetUri, Flags.IncludeStatistics, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, extensionNames.length)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withAssetTypes(AssetType.Icon, AssetType.License, AssetType.Details, AssetType.Manifest, AssetType.VSIX);
		query = extensionNames.reduce((query, name) => query.withFilter(FilterType.ExtensionName, name), query);

		return this.queryGallery(query)
			.then(result => this.getCommonHeaders()
				.then(downloadHeaders => {
					const dependencies = [];
					const ids = [];
					for (const rawExtension of result.galleryExtensions) {
						if (ids.indexOf(rawExtension.extensionId) === -1) {
							const galleryExtension = toExtension(rawExtension, this.extensionsGalleryUrl, downloadHeaders);
							galleryExtension.isCompatible = galleryExtension.properties.engine && validateVersions(pkg.version, galleryExtension.properties.engine, []);
							dependencies.push(galleryExtension);
							ids.push(rawExtension.extensionId);
						}
					}
					return dependencies;
				})
		);
	}

	private getDependenciesReccursively(toGet: string[], result: IGalleryExtension[]): TPromise<IGalleryExtension[]> {
		if (!toGet || !toGet.length) {
			return TPromise.wrap(result);
		}
		toGet = result.length ? toGet.filter(e => !ExtensionGalleryService.hasExtensionByName(result, e)) : toGet;
		if (!toGet.length) {
			return TPromise.wrap(result);
		}

		return this.loadDependencies(toGet)
			.then(loadedDependencies => {
				const dependenciesSet = new ArraySet<string>();
				for (const dep of loadedDependencies) {
					if (dep.properties.dependencies) {
						dep.properties.dependencies.forEach(d => dependenciesSet.set(d));
					}
				}
				result = distinct(result.concat(loadedDependencies), d => d.id);
				const dependencies = dependenciesSet.elements.filter(d => !ExtensionGalleryService.hasExtensionByName(result, d));
				return this.getDependenciesReccursively(dependencies, result);
			});
	}

	/**
	 * Always try with the `redirect=true` query string.
	 * If that does not return 200, try without it.
	 */
	private _getAsset(options: IRequestOptions): TPromise<IRequestContext> {
		const parsedUrl = url.parse(options.url, true);
		parsedUrl.search = undefined;
		parsedUrl.query['redirect'] = 'true';

		const cdnUrl = url.format(parsedUrl);

		return this.requestService.request(assign({}, options, { url: cdnUrl }))
			.then(context => context.res.statusCode === 200 ? context : TPromise.wrapError('expected 200'))
			.then(null, () => {
				this.telemetryService.publicLog('galleryService:cdnFallback', { url: cdnUrl });
				return this.requestService.request(options);
			});
	}

	private getLastValidExtensionVersion(extension: IRawGalleryExtension, versions: IRawGalleryExtensionVersion[]): TPromise<IRawGalleryExtensionVersion> {
		const version = this.getLastValidExtensionVersionFromProperties(versions);
		if (version) {
			return TPromise.wrap(version);
		}
		return this.getLastValidExtensionVersionReccursively(extension, versions);
	}

	private getLastValidExtensionVersionFromProperties(versions: IRawGalleryExtensionVersion[]): IRawGalleryExtensionVersion {
		for (const version of versions) {
			const engine = getEngine(version);
			if (!engine) {
				return null;
			}
			if (validateVersions(pkg.version, engine, [])) {
				return version;
			}
		}
		return null;
	}

	private getLastValidExtensionVersionReccursively(extension: IRawGalleryExtension, versions: IRawGalleryExtensionVersion[]): TPromise<IRawGalleryExtensionVersion> {
		if (!versions.length) {
			return TPromise.wrapError(new Error(localize('noCompatible', "Couldn't find a compatible version of {0} with this version of Code.", extension.displayName || extension.extensionName)));
		}

		const version = versions[0];
		const url = getAssetSource(version.files, AssetType.Manifest);

		return this.getCommonHeaders()
			.then(headers => assign(headers, { 'Accept-Encoding': 'gzip' }))
			.then(headers => this._getAsset({ url, headers }))
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
				version.properties = version.properties || [];
				version.properties.push({ key: PropertyType.Engine, value: manifest.engines.vscode });
				return version;
			});
	}

	private static hasExtensionByName(extensions: IGalleryExtension[], name: string): boolean {
		for (const extension of extensions) {
			if (`${extension.publisher}.${extension.name}` === name) {
				return true;
			}
		}
		return false;
	}
}