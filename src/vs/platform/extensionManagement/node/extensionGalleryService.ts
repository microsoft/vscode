/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import * as path from 'path';
import { distinct } from 'vs/base/common/arrays';
import { getErrorMessage, isPromiseCanceledError, canceled } from 'vs/base/common/errors';
import { StatisticType, IGalleryExtension, IExtensionGalleryService, IGalleryExtensionAsset, IQueryOptions, SortBy, SortOrder, IExtensionManifest, IExtensionIdentifier, IReportedExtension, InstallOperation, ITranslation, IGalleryExtensionVersion, IGalleryExtensionAssets } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId, getGalleryExtensionTelemetryData, adoptToGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { assign, getOrDefault } from 'vs/base/common/objects';
import { IRequestService } from 'vs/platform/request/node/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IPager } from 'vs/base/common/paging';
import { IRequestOptions, IRequestContext, download, asJson, asText } from 'vs/base/node/request';
import pkg from 'vs/platform/node/package';
import product from 'vs/platform/node/product';
import { isEngineValid } from 'vs/platform/extensions/node/extensionValidator';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { readFile } from 'vs/base/node/pfs';
import { writeFileAndFlushSync } from 'vs/base/node/extfs';
import { generateUuid, isUUID } from 'vs/base/common/uuid';
import { values } from 'vs/base/common/map';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';

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
	fallbackAssetUri: string;
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
	flags: string;
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
	IncludeLatestVersionOnly = 0x200,
	Unpublished = 0x1000
}

function flagsToString(...flags: Flags[]): string {
	return String(flags.reduce((r, f) => r | f, 0));
}

enum FilterType {
	Tag = 1,
	ExtensionId = 4,
	Category = 5,
	ExtensionName = 7,
	Target = 8,
	Featured = 9,
	SearchText = 10,
	ExcludeWithFlags = 12
}

const AssetType = {
	Icon: 'Microsoft.VisualStudio.Services.Icons.Default',
	Details: 'Microsoft.VisualStudio.Services.Content.Details',
	Changelog: 'Microsoft.VisualStudio.Services.Content.Changelog',
	Manifest: 'Microsoft.VisualStudio.Code.Manifest',
	VSIX: 'Microsoft.VisualStudio.Services.VSIXPackage',
	License: 'Microsoft.VisualStudio.Services.Content.License',
	Repository: 'Microsoft.VisualStudio.Services.Links.Source'
};

const PropertyType = {
	Dependency: 'Microsoft.VisualStudio.Code.ExtensionDependencies',
	ExtensionPack: 'Microsoft.VisualStudio.Code.ExtensionPack',
	Engine: 'Microsoft.VisualStudio.Code.Engine',
	LocalizedLanguages: 'Microsoft.VisualStudio.Code.LocalizedLanguages'
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

	constructor(private state = DefaultQueryState) { }

	get pageNumber(): number { return this.state.pageNumber; }
	get pageSize(): number { return this.state.pageSize; }
	get sortBy(): number { return this.state.sortBy; }
	get sortOrder(): number { return this.state.sortOrder; }
	get flags(): number { return this.state.flags; }

	withPage(pageNumber: number, pageSize: number = this.state.pageSize): Query {
		return new Query(assign({}, this.state, { pageNumber, pageSize }));
	}

	withFilter(filterType: FilterType, ...values: string[]): Query {
		const criteria = [
			...this.state.criteria,
			...values.map(value => ({ filterType, value }))
		];

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

	get searchText(): string {
		const criterium = this.state.criteria.filter(criterium => criterium.filterType === FilterType.SearchText)[0];
		return criterium && criterium.value ? criterium.value : '';
	}
}

function getStatistic(statistics: IRawGalleryExtensionStatistics[], name: string): number {
	const result = (statistics || []).filter(s => s.statisticName === name)[0];
	return result ? result.value : 0;
}

function getCoreTranslationAssets(version: IRawGalleryExtensionVersion): { [languageId: string]: IGalleryExtensionAsset } {
	const coreTranslationAssetPrefix = 'Microsoft.VisualStudio.Code.Translation.';
	const result = version.files.filter(f => f.assetType.indexOf(coreTranslationAssetPrefix) === 0);
	return result.reduce((result, file) => {
		result[file.assetType.substring(coreTranslationAssetPrefix.length)] = getVersionAsset(version, file.assetType);
		return result;
	}, {});
}

function getRepositoryAsset(version: IRawGalleryExtensionVersion): IGalleryExtensionAsset | null {
	if (version.properties) {
		const results = version.properties.filter(p => p.key === AssetType.Repository);
		const gitRegExp = new RegExp('((git|ssh|http(s)?)|(git@[\w\.]+))(:(//)?)([\w\.@\:/\-~]+)(\.git)(/)?');

		const uri = results.filter(r => gitRegExp.test(r.value))[0];
		return uri ? { uri: uri.value, fallbackUri: uri.value } : null;
	}
	return getVersionAsset(version, AssetType.Repository);
}

function getDownloadAsset(version: IRawGalleryExtensionVersion): IGalleryExtensionAsset {
	return {
		uri: `${version.fallbackAssetUri}/${AssetType.VSIX}?redirect=true`,
		fallbackUri: `${version.fallbackAssetUri}/${AssetType.VSIX}`
	};
}

function getIconAsset(version: IRawGalleryExtensionVersion): IGalleryExtensionAsset {
	const asset = getVersionAsset(version, AssetType.Icon);
	if (asset) {
		return asset;
	}
	const uri = require.toUrl('./media/defaultIcon.png');
	return { uri, fallbackUri: uri };
}

function getVersionAsset(version: IRawGalleryExtensionVersion, type: string): IGalleryExtensionAsset | null {
	const result = version.files.filter(f => f.assetType === type)[0];
	return result ? { uri: `${version.assetUri}/${type}`, fallbackUri: `${version.fallbackAssetUri}/${type}` } : null;
}

function getExtensions(version: IRawGalleryExtensionVersion, property: string): string[] {
	const values = version.properties ? version.properties.filter(p => p.key === property) : [];
	const value = values.length > 0 && values[0].value;
	return value ? value.split(',').map(v => adoptToGalleryExtensionId(v)) : [];
}

function getEngine(version: IRawGalleryExtensionVersion): string {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.Engine) : [];
	return (values.length > 0 && values[0].value) || '';
}

function getLocalizedLanguages(version: IRawGalleryExtensionVersion): string[] {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.LocalizedLanguages) : [];
	const value = (values.length > 0 && values[0].value) || '';
	return value ? value.split(',') : [];
}

function getIsPreview(flags: string): boolean {
	return flags.indexOf('preview') !== -1;
}

function toExtension(galleryExtension: IRawGalleryExtension, version: IRawGalleryExtensionVersion, index: number, query: Query, querySource?: string): IGalleryExtension {
	const assets = <IGalleryExtensionAssets>{
		manifest: getVersionAsset(version, AssetType.Manifest),
		readme: getVersionAsset(version, AssetType.Details),
		changelog: getVersionAsset(version, AssetType.Changelog),
		license: getVersionAsset(version, AssetType.License),
		repository: getRepositoryAsset(version),
		download: getDownloadAsset(version),
		icon: getIconAsset(version),
		coreTranslations: getCoreTranslationAssets(version)
	};

	return {
		identifier: {
			id: getGalleryExtensionId(galleryExtension.publisher.publisherName, galleryExtension.extensionName),
			uuid: galleryExtension.extensionId
		},
		name: galleryExtension.extensionName,
		version: version.version,
		date: version.lastUpdated,
		displayName: galleryExtension.displayName,
		publisherId: galleryExtension.publisher.publisherId,
		publisher: galleryExtension.publisher.publisherName,
		publisherDisplayName: galleryExtension.publisher.displayName,
		description: galleryExtension.shortDescription || '',
		installCount: getStatistic(galleryExtension.statistics, 'install') + getStatistic(galleryExtension.statistics, 'updateCount'),
		rating: getStatistic(galleryExtension.statistics, 'averagerating'),
		ratingCount: getStatistic(galleryExtension.statistics, 'ratingcount'),
		assets,
		properties: {
			dependencies: getExtensions(version, PropertyType.Dependency),
			extensionPack: getExtensions(version, PropertyType.ExtensionPack),
			engine: getEngine(version),
			localizedLanguages: getLocalizedLanguages(version)
		},
		/* __GDPR__FRAGMENT__
			"GalleryExtensionTelemetryData2" : {
				"index" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"searchText": { "classification": "CustomerContent", "purpose": "FeatureInsight" },
				"querySource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		telemetryData: {
			index: ((query.pageNumber - 1) * query.pageSize) + index,
			searchText: query.searchText,
			querySource
		},
		preview: getIsPreview(galleryExtension.flags)
	};
}

interface IRawExtensionsReport {
	malicious: string[];
	slow: string[];
}

export class ExtensionGalleryService implements IExtensionGalleryService {

	_serviceBrand: any;

	private extensionsGalleryUrl: string;
	private extensionsControlUrl: string;

	private readonly commonHeadersPromise: Promise<{ [key: string]: string; }>;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		const config = product.extensionsGallery;
		this.extensionsGalleryUrl = config && config.serviceUrl;
		this.extensionsControlUrl = config && config.controlUrl;
		this.commonHeadersPromise = resolveMarketplaceHeaders(this.environmentService);
	}

	private api(path = ''): string {
		return `${this.extensionsGalleryUrl}${path}`;
	}

	isEnabled(): boolean {
		return !!this.extensionsGalleryUrl;
	}

	getExtension({ id, uuid }: IExtensionIdentifier, version?: string): Promise<IGalleryExtension | null> {
		let query = new Query()
			.withFlags(Flags.IncludeAssetUri, Flags.IncludeStatistics, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, 1)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withFilter(FilterType.ExcludeWithFlags, flagsToString(Flags.Unpublished));

		if (uuid) {
			query = query.withFilter(FilterType.ExtensionId, uuid);
		} else {
			query = query.withFilter(FilterType.ExtensionName, id);
		}

		return this.queryGallery(query, CancellationToken.None).then(({ galleryExtensions }) => {
			if (galleryExtensions.length) {
				const galleryExtension = galleryExtensions[0];
				const versionAsset = version ? galleryExtension.versions.filter(v => v.version === version)[0] : galleryExtension.versions[0];
				if (versionAsset) {
					return toExtension(galleryExtension, versionAsset, 0, query);
				}
			}
			return null;
		});
	}

	query(options: IQueryOptions = {}): Promise<IPager<IGalleryExtension>> {
		if (!this.isEnabled()) {
			return Promise.reject(new Error('No extension gallery service configured.'));
		}

		const type = options.names ? 'ids' : (options.text ? 'text' : 'all');
		let text = options.text || '';
		const pageSize = getOrDefault(options, o => o.pageSize, 50);

		/* __GDPR__
			"galleryService:query" : {
				"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"text": { "classification": "CustomerContent", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('galleryService:query', { type, text });

		let query = new Query()
			.withFlags(Flags.IncludeLatestVersionOnly, Flags.IncludeAssetUri, Flags.IncludeStatistics, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, pageSize)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withFilter(FilterType.ExcludeWithFlags, flagsToString(Flags.Unpublished));

		if (text) {
			// Use category filter instead of "category:themes"
			text = text.replace(/\bcategory:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategory, category) => {
				query = query.withFilter(FilterType.Category, category || quotedCategory);
				return '';
			});

			// Use tag filter instead of "tag:debuggers"
			text = text.replace(/\btag:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedTag, tag) => {
				query = query.withFilter(FilterType.Tag, tag || quotedTag);
				return '';
			});

			text = text.trim();

			if (text) {
				text = text.length < 200 ? text : text.substring(0, 200);
				query = query.withFilter(FilterType.SearchText, text);
			}

			query = query.withSortBy(SortBy.NoneOrRelevance);
		} else if (options.ids) {
			query = query.withFilter(FilterType.ExtensionId, ...options.ids);
		} else if (options.names) {
			query = query.withFilter(FilterType.ExtensionName, ...options.names);
		} else {
			query = query.withSortBy(SortBy.InstallCount);
		}

		if (typeof options.sortBy === 'number') {
			query = query.withSortBy(options.sortBy);
		}

		if (typeof options.sortOrder === 'number') {
			query = query.withSortOrder(options.sortOrder);
		}

		return this.queryGallery(query, CancellationToken.None).then(({ galleryExtensions, total }) => {
			const extensions = galleryExtensions.map((e, index) => toExtension(e, e.versions[0], index, query, options.source));
			const pageSize = query.pageSize;
			const getPage = (pageIndex: number, ct: CancellationToken) => {
				if (ct.isCancellationRequested) {
					return Promise.reject(canceled());
				}

				const nextPageQuery = query.withPage(pageIndex + 1);
				return this.queryGallery(nextPageQuery, ct)
					.then(({ galleryExtensions }) => galleryExtensions.map((e, index) => toExtension(e, e.versions[0], index, nextPageQuery, options.source)));
			};

			return { firstPage: extensions, total, pageSize, getPage } as IPager<IGalleryExtension>;
		});
	}

	private queryGallery(query: Query, token: CancellationToken): Promise<{ galleryExtensions: IRawGalleryExtension[], total: number; }> {
		if (!this.isEnabled()) {
			return Promise.reject(new Error('No extension gallery service configured.'));
		}
		return this.commonHeadersPromise.then(commonHeaders => {
			const data = JSON.stringify(query.raw);
			const headers = assign({}, commonHeaders, {
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
			}, token).then(context => {

				if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
					return { galleryExtensions: [], total: 0 };
				}

				return asJson<IRawGalleryQueryResult>(context).then(result => {
					if (result) {
						const r = result.results[0];
						const galleryExtensions = r.extensions;
						const resultCount = r.resultMetadata && r.resultMetadata.filter(m => m.metadataType === 'ResultCount')[0];
						const total = resultCount && resultCount.metadataItems.filter(i => i.name === 'TotalCount')[0].count || 0;

						return { galleryExtensions, total };
					}
					return { galleryExtensions: [], total: 0 };
				});
			});
		});
	}

	reportStatistic(publisher: string, name: string, version: string, type: StatisticType): Promise<void> {
		if (!this.isEnabled()) {
			return Promise.resolve(undefined);
		}

		return this.commonHeadersPromise.then(commonHeaders => {
			const headers = { ...commonHeaders, Accept: '*/*;api-version=4.0-preview.1' };

			return this.requestService.request({
				type: 'POST',
				url: this.api(`/publishers/${publisher}/extensions/${name}/${version}/stats?statType=${type}`),
				headers
			}, CancellationToken.None).then(undefined, () => undefined);
		});
	}

	download(extension: IGalleryExtension, operation: InstallOperation): Promise<string> {
		this.logService.trace('ExtensionGalleryService#download', extension.identifier.id);
		const zipPath = path.join(tmpdir(), generateUuid());
		const data = getGalleryExtensionTelemetryData(extension);
		const startTime = new Date().getTime();
		/* __GDPR__
			"galleryService:downloadVSIX" : {
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"${include}": [
					"${GalleryExtensionTelemetryData}"
				]
			}
		*/
		const log = (duration: number) => this.telemetryService.publicLog('galleryService:downloadVSIX', assign(data, { duration }));

		const operationParam = operation === InstallOperation.Install ? 'install' : operation === InstallOperation.Update ? 'update' : '';
		const downloadAsset = operationParam ? {
			uri: `${extension.assets.download.uri}&${operationParam}=true`,
			fallbackUri: `${extension.assets.download.fallbackUri}?${operationParam}=true`
		} : extension.assets.download;

		return this.getAsset(downloadAsset)
			.then(context => download(zipPath, context))
			.then(() => log(new Date().getTime() - startTime))
			.then(() => zipPath);
	}

	getReadme(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		if (extension.assets.readme) {
			return this.getAsset(extension.assets.readme, {}, token)
				.then(context => asText(context))
				.then(content => content || '');
		}
		return Promise.resolve('');
	}

	getManifest(extension: IGalleryExtension, token: CancellationToken): Promise<IExtensionManifest | null> {
		if (extension.assets.manifest) {
			return this.getAsset(extension.assets.manifest, {}, token)
				.then(asText)
				.then(JSON.parse);
		}
		return Promise.resolve(null);
	}

	getCoreTranslation(extension: IGalleryExtension, languageId: string): Promise<ITranslation | null> {
		const asset = extension.assets.coreTranslations[languageId.toUpperCase()];
		if (asset) {
			return this.getAsset(asset)
				.then(asText)
				.then(JSON.parse);
		}
		return Promise.resolve(null);
	}

	getChangelog(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		if (extension.assets.changelog) {
			return this.getAsset(extension.assets.changelog, {}, token)
				.then(context => asText(context))
				.then(content => content || '');
		}
		return Promise.resolve('');
	}

	loadAllDependencies(extensions: IExtensionIdentifier[], token: CancellationToken): Promise<IGalleryExtension[]> {
		return this.getDependenciesReccursively(extensions.map(e => e.id), [], token);
	}

	getAllVersions(extension: IGalleryExtension, compatible: boolean): Promise<IGalleryExtensionVersion[]> {
		let query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, 1)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withFilter(FilterType.ExcludeWithFlags, flagsToString(Flags.Unpublished));

		if (extension.identifier.uuid) {
			query = query.withFilter(FilterType.ExtensionId, extension.identifier.uuid);
		} else {
			query = query.withFilter(FilterType.ExtensionName, extension.identifier.id);
		}

		return this.queryGallery(query, CancellationToken.None).then(({ galleryExtensions }) => {
			if (galleryExtensions.length) {
				if (compatible) {
					return Promise.all(galleryExtensions[0].versions.map(v => this.getEngine(v).then(engine => isEngineValid(engine) ? v : null)))
						.then(versions => versions
							.filter(v => !!v)
							.map(v => ({ version: v!.version, date: v!.lastUpdated })));
				} else {
					return galleryExtensions[0].versions.map(v => ({ version: v.version, date: v.lastUpdated }));
				}
			}
			return [];
		});
	}

	loadCompatibleVersion(extension: IGalleryExtension, fromVersion: string = extension.version): Promise<IGalleryExtension | null> {
		if (extension.version === fromVersion && extension.properties.engine && isEngineValid(extension.properties.engine)) {
			return Promise.resolve(extension);
		}
		const query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, 1)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withFilter(FilterType.ExcludeWithFlags, flagsToString(Flags.Unpublished))
			.withAssetTypes(AssetType.Manifest, AssetType.VSIX)
			.withFilter(FilterType.ExtensionId, extension.identifier.uuid);

		return this.queryGallery(query, CancellationToken.None)
			.then(({ galleryExtensions }) => {
				const [rawExtension] = galleryExtensions;

				if (!rawExtension) {
					return null;
				}

				const versions: IRawGalleryExtensionVersion[] = this.getVersionsFrom(rawExtension.versions, fromVersion);
				if (!versions.length) {
					return null;
				}

				return this.getLastValidExtensionVersion(rawExtension, versions)
					.then(rawVersion => {
						if (rawVersion) {
							return toExtension(rawExtension, rawVersion, 0, query);
						}
						return null;
					});
			});
	}

	private getVersionsFrom(versions: IRawGalleryExtensionVersion[], version: string): IRawGalleryExtensionVersion[] {
		if (versions[0].version === version) {
			return versions;
		}
		const result: IRawGalleryExtensionVersion[] = [];
		let currentVersion: IRawGalleryExtensionVersion | null = null;
		for (const v of versions) {
			if (!currentVersion) {
				if (v.version === version) {
					currentVersion = v;
				}
			}
			if (currentVersion) {
				result.push(v);
			}
		}
		return result;
	}

	private loadDependencies(extensionNames: string[], token: CancellationToken): Promise<IGalleryExtension[]> {
		if (!extensionNames || extensionNames.length === 0) {
			return Promise.resolve([]);
		}

		let query = new Query()
			.withFlags(Flags.IncludeLatestVersionOnly, Flags.IncludeAssetUri, Flags.IncludeStatistics, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, extensionNames.length)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			.withFilter(FilterType.ExcludeWithFlags, flagsToString(Flags.Unpublished))
			.withAssetTypes(AssetType.Icon, AssetType.License, AssetType.Details, AssetType.Manifest, AssetType.VSIX)
			.withFilter(FilterType.ExtensionName, ...extensionNames);

		return this.queryGallery(query, token).then(result => {
			const dependencies: IGalleryExtension[] = [];
			const ids: string[] = [];

			for (let index = 0; index < result.galleryExtensions.length; index++) {
				const rawExtension = result.galleryExtensions[index];
				if (ids.indexOf(rawExtension.extensionId) === -1) {
					dependencies.push(toExtension(rawExtension, rawExtension.versions[0], index, query, 'dependencies'));
					ids.push(rawExtension.extensionId);
				}
			}
			return dependencies;
		});
	}

	private getDependenciesReccursively(toGet: string[], result: IGalleryExtension[], token: CancellationToken): Promise<IGalleryExtension[]> {
		if (!toGet || !toGet.length) {
			return Promise.resolve(result);
		}
		toGet = result.length ? toGet.filter(e => !ExtensionGalleryService.hasExtensionByName(result, e)) : toGet;
		if (!toGet.length) {
			return Promise.resolve(result);
		}

		return this.loadDependencies(toGet, token)
			.then(loadedDependencies => {
				const dependenciesSet = new Set<string>();
				for (const dep of loadedDependencies) {
					if (dep.properties.dependencies) {
						dep.properties.dependencies.forEach(d => dependenciesSet.add(d));
					}
				}
				result = distinct(result.concat(loadedDependencies), d => d.identifier.uuid);
				const dependencies: string[] = [];
				dependenciesSet.forEach(d => !ExtensionGalleryService.hasExtensionByName(result, d) && dependencies.push(d));
				return this.getDependenciesReccursively(dependencies, result, token);
			});
	}

	private getAsset(asset: IGalleryExtensionAsset, options: IRequestOptions = {}, token: CancellationToken = CancellationToken.None): Promise<IRequestContext> {
		return this.commonHeadersPromise.then(commonHeaders => {
			const baseOptions = { type: 'GET' };
			const headers = assign({}, commonHeaders, options.headers || {});
			options = assign({}, options, baseOptions, { headers });

			const url = asset.uri;
			const fallbackUrl = asset.fallbackUri;
			const firstOptions = assign({}, options, { url });

			return this.requestService.request(firstOptions, token)
				.then(context => {
					if (context.res.statusCode === 200) {
						return Promise.resolve(context);
					}

					return asText(context)
						.then(message => Promise.reject(new Error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`)));
				})
				.then(undefined, err => {
					if (isPromiseCanceledError(err)) {
						return Promise.reject(err);
					}

					const message = getErrorMessage(err);
					/* __GDPR__
						"galleryService:requestError" : {
							"url" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
							"cdn": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
							"message": { "classification": "CallstackOrException", "purpose": "FeatureInsight" }
						}
					*/
					this.telemetryService.publicLog('galleryService:requestError', { url, cdn: true, message });
					/* __GDPR__
						"galleryService:cdnFallback" : {
							"url" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
							"message": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
					this.telemetryService.publicLog('galleryService:cdnFallback', { url, message });

					const fallbackOptions = assign({}, options, { url: fallbackUrl });
					return this.requestService.request(fallbackOptions, token).then(undefined, err => {
						if (isPromiseCanceledError(err)) {
							return Promise.reject(err);
						}

						const message = getErrorMessage(err);
						/* __GDPR__
							"galleryService:requestError" : {
								"url" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"cdn": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"message": { "classification": "CallstackOrException", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog('galleryService:requestError', { url: fallbackUrl, cdn: false, message });
						return Promise.reject(err);
					});
				});
		});
	}

	private getLastValidExtensionVersion(extension: IRawGalleryExtension, versions: IRawGalleryExtensionVersion[]): Promise<IRawGalleryExtensionVersion | null> {
		const version = this.getLastValidExtensionVersionFromProperties(extension, versions);
		if (version) {
			return version;
		}
		return this.getLastValidExtensionVersionReccursively(extension, versions);
	}

	private getLastValidExtensionVersionFromProperties(extension: IRawGalleryExtension, versions: IRawGalleryExtensionVersion[]): Promise<IRawGalleryExtensionVersion> | null {
		for (const version of versions) {
			const engine = getEngine(version);
			if (!engine) {
				return null;
			}
			if (isEngineValid(engine)) {
				return Promise.resolve(version);
			}
		}
		return null;
	}

	private getEngine(version: IRawGalleryExtensionVersion): Promise<string> {
		const engine = getEngine(version);
		if (engine) {
			return Promise.resolve(engine);
		}

		const manifest = getVersionAsset(version, AssetType.Manifest);
		if (!manifest) {
			return Promise.reject('Manifest was not found');
		}

		const headers = { 'Accept-Encoding': 'gzip' };
		return this.getAsset(manifest, { headers })
			.then(context => asJson<IExtensionManifest>(context))
			.then(manifest => manifest ? manifest.engines.vscode : Promise.reject('Error while reading manifest'));
	}

	private getLastValidExtensionVersionReccursively(extension: IRawGalleryExtension, versions: IRawGalleryExtensionVersion[]): Promise<IRawGalleryExtensionVersion | null> {
		if (!versions.length) {
			return Promise.resolve(null);
		}

		const version = versions[0];
		return this.getEngine(version)
			.then(engine => {
				if (!isEngineValid(engine)) {
					return this.getLastValidExtensionVersionReccursively(extension, versions.slice(1));
				}

				version.properties = version.properties || [];
				version.properties.push({ key: PropertyType.Engine, value: engine });
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

	getExtensionsReport(): Promise<IReportedExtension[]> {
		if (!this.isEnabled()) {
			return Promise.reject(new Error('No extension gallery service configured.'));
		}

		if (!this.extensionsControlUrl) {
			return Promise.resolve([]);
		}

		return this.requestService.request({ type: 'GET', url: this.extensionsControlUrl }, CancellationToken.None).then(context => {
			if (context.res.statusCode !== 200) {
				return Promise.reject(new Error('Could not get extensions report.'));
			}

			return asJson<IRawExtensionsReport>(context).then(result => {
				const map = new Map<string, IReportedExtension>();

				if (result) {
					for (const id of result.malicious) {
						const ext = map.get(id) || { id: { id }, malicious: true, slow: false };
						ext.malicious = true;
						map.set(id, ext);
					}
				}

				return Promise.resolve(values(map));
			});
		});
	}
}

export function resolveMarketplaceHeaders(environmentService: IEnvironmentService): Promise<{ [key: string]: string; }> {
	const marketplaceMachineIdFile = path.join(environmentService.userDataPath, 'machineid');

	return readFile(marketplaceMachineIdFile, 'utf8')
		.then<string | null>(contents => isUUID(contents) ? contents : Promise.resolve(null), () => Promise.resolve(null) /* error reading ID file */)
		.then(uuid => {
			if (!uuid) {
				uuid = generateUuid();
				try {
					writeFileAndFlushSync(marketplaceMachineIdFile, uuid);
				} catch (error) {
					//noop
				}
			}
			return {
				'X-Market-Client-Id': `VSCode ${pkg.version}`,
				'User-Agent': `VSCode ${pkg.version}`,
				'X-Market-User-Id': uuid
			};
		});
}
