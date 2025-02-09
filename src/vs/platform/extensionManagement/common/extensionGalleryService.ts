/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../base/common/arrays.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../base/common/errors.js';
import { IPager } from '../../../base/common/paging.js';
import { isWeb, platform } from '../../../base/common/platform.js';
import { arch } from '../../../base/common/process.js';
import { isBoolean, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { IHeaders, IRequestContext, IRequestOptions, isOfflineError } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { getTargetPlatform, IExtensionGalleryService, IExtensionIdentifier, IExtensionInfo, IGalleryExtension, IGalleryExtensionAsset, IGalleryExtensionAssets, IGalleryExtensionVersion, InstallOperation, IQueryOptions, IExtensionsControlManifest, isNotWebExtensionInWebTargetPlatform, isTargetPlatformCompatible, ITranslation, SortBy, SortOrder, StatisticType, toTargetPlatform, WEB_EXTENSION_TAG, IExtensionQueryOptions, IDeprecationInfo, ISearchPrefferedResults, ExtensionGalleryError, ExtensionGalleryErrorCode, IProductVersion, UseUnpkgResourceApiConfigKey, IAllowedExtensionsService, EXTENSION_IDENTIFIER_REGEX } from './extensionManagement.js';
import { adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId, getGalleryExtensionTelemetryData } from './extensionManagementUtil.js';
import { IExtensionManifest, TargetPlatform } from '../../extensions/common/extensions.js';
import { areApiProposalsCompatible, isEngineValid } from '../../extensions/common/extensionValidator.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, asTextOrError, IRequestService, isSuccess } from '../../request/common/request.js';
import { resolveMarketplaceHeaders } from '../../externalServices/common/marketplace.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { format2 } from '../../../base/common/strings.js';

const CURRENT_TARGET_PLATFORM = isWeb ? TargetPlatform.WEB : getTargetPlatform(platform, arch);
const ACTIVITY_HEADER_NAME = 'X-Market-Search-Activity-Id';

interface IRawGalleryExtensionFile {
	readonly assetType: string;
	readonly source: string;
}

interface IRawGalleryExtensionProperty {
	readonly key: string;
	readonly value: string;
}

export interface IRawGalleryExtensionVersion {
	readonly version: string;
	readonly lastUpdated: string;
	readonly assetUri: string;
	readonly fallbackAssetUri: string;
	readonly files: IRawGalleryExtensionFile[];
	readonly properties?: IRawGalleryExtensionProperty[];
	readonly targetPlatform?: string;
}

interface IRawGalleryExtensionStatistics {
	readonly statisticName: string;
	readonly value: number;
}

interface IRawGalleryExtensionPublisher {
	readonly displayName: string;
	readonly publisherId: string;
	readonly publisherName: string;
	readonly domain?: string | null;
	readonly isDomainVerified?: boolean;
}

interface IRawGalleryExtension {
	readonly extensionId: string;
	readonly extensionName: string;
	readonly displayName: string;
	readonly shortDescription?: string;
	readonly publisher: IRawGalleryExtensionPublisher;
	readonly versions: IRawGalleryExtensionVersion[];
	readonly statistics: IRawGalleryExtensionStatistics[];
	readonly tags: string[] | undefined;
	readonly releaseDate: string;
	readonly publishedDate: string;
	readonly lastUpdated: string;
	readonly categories: string[] | undefined;
	readonly flags: string;
}

interface IRawGalleryExtensionsResult {
	readonly galleryExtensions: IRawGalleryExtension[];
	readonly total: number;
	readonly context?: IStringDictionary<string>;
}

interface IRawGalleryQueryResult {
	readonly results: {
		readonly extensions: IRawGalleryExtension[];
		readonly resultMetadata: {
			readonly metadataType: string;
			readonly metadataItems: {
				readonly name: string;
				readonly count: number;
			}[];
		}[];
	}[];
}

enum Flags {

	/**
	 * None is used to retrieve only the basic extension details.
	 */
	None = 0x0,

	/**
	 * IncludeVersions will return version information for extensions returned
	 */
	IncludeVersions = 0x1,

	/**
	 * IncludeFiles will return information about which files were found
	 * within the extension that were stored independent of the manifest.
	 * When asking for files, versions will be included as well since files
	 * are returned as a property of the versions.
	 * These files can be retrieved using the path to the file without
	 * requiring the entire manifest be downloaded.
	 */
	IncludeFiles = 0x2,

	/**
	 * Include the Categories and Tags that were added to the extension definition.
	 */
	IncludeCategoryAndTags = 0x4,

	/**
	 * Include the details about which accounts the extension has been shared
	 * with if the extension is a private extension.
	 */
	IncludeSharedAccounts = 0x8,

	/**
	 * Include properties associated with versions of the extension
	 */
	IncludeVersionProperties = 0x10,

	/**
	 * Excluding non-validated extensions will remove any extension versions that
	 * either are in the process of being validated or have failed validation.
	 */
	ExcludeNonValidated = 0x20,

	/**
	 * Include the set of installation targets the extension has requested.
	 */
	IncludeInstallationTargets = 0x40,

	/**
	 * Include the base uri for assets of this extension
	 */
	IncludeAssetUri = 0x80,

	/**
	 * Include the statistics associated with this extension
	 */
	IncludeStatistics = 0x100,

	/**
	 * When retrieving versions from a query, only include the latest
	 * version of the extensions that matched. This is useful when the
	 * caller doesn't need all the published versions. It will save a
	 * significant size in the returned payload.
	 */
	IncludeLatestVersionOnly = 0x200,

	/**
	 * The Unpublished extension flag indicates that the extension can't be installed/downloaded.
	 * Users who have installed such an extension can continue to use the extension.
	 */
	Unpublished = 0x1000,

	/**
	 * Include the details if an extension is in conflict list or not
	 */
	IncludeNameConflictInfo = 0x8000,
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
	Repository: 'Microsoft.VisualStudio.Services.Links.Source',
	Signature: 'Microsoft.VisualStudio.Services.VsixSignature'
};

const PropertyType = {
	Dependency: 'Microsoft.VisualStudio.Code.ExtensionDependencies',
	ExtensionPack: 'Microsoft.VisualStudio.Code.ExtensionPack',
	Engine: 'Microsoft.VisualStudio.Code.Engine',
	PreRelease: 'Microsoft.VisualStudio.Code.PreRelease',
	EnabledApiProposals: 'Microsoft.VisualStudio.Code.EnabledApiProposals',
	LocalizedLanguages: 'Microsoft.VisualStudio.Code.LocalizedLanguages',
	WebExtension: 'Microsoft.VisualStudio.Code.WebExtension',
	SponsorLink: 'Microsoft.VisualStudio.Code.SponsorLink',
	SupportLink: 'Microsoft.VisualStudio.Services.Links.Support',
	ExecutesCode: 'Microsoft.VisualStudio.Code.ExecutesCode',
};

interface ICriterium {
	readonly filterType: FilterType;
	readonly value?: string;
}

const DefaultPageSize = 10;

interface IQueryState {
	readonly pageNumber: number;
	readonly pageSize: number;
	readonly sortBy: SortBy;
	readonly sortOrder: SortOrder;
	readonly flags: Flags;
	readonly criteria: ICriterium[];
	readonly assetTypes: string[];
	readonly source?: string;
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

type GalleryServiceQueryClassification = {
	owner: 'sandy081';
	comment: 'Information about Marketplace query and its response';
	readonly filterTypes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Filter types used in the query.' };
	readonly flags: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flags passed in the query.' };
	readonly sortBy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'sorted by option passed in the query' };
	readonly sortOrder: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'sort order option passed in the query' };
	readonly pageNumber: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'requested page number in the query' };
	readonly duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; 'isMeasurement': true; comment: 'amount of time taken by the query request' };
	readonly success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'whether the query reques is success or not' };
	readonly requestBodySize: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'size of the request body' };
	readonly responseBodySize?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'size of the response body' };
	readonly statusCode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'status code of the response' };
	readonly errorCode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'error code of the response' };
	readonly count?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'total number of extensions matching the query' };
	readonly source?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source that requested this query, eg., recommendations, viewlet' };
	readonly searchTextLength?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'length of the search text in the query' };
};

type QueryTelemetryData = {
	readonly flags: number;
	readonly filterTypes: string[];
	readonly sortBy: string;
	readonly sortOrder: string;
	readonly pageNumber: string;
	readonly source?: string;
	readonly searchTextLength?: number;
};

type GalleryServiceQueryEvent = QueryTelemetryData & {
	readonly duration: number;
	readonly success: boolean;
	readonly requestBodySize: string;
	readonly responseBodySize?: string;
	readonly statusCode?: string;
	readonly errorCode?: string;
	readonly count?: string;
};

type GalleryServiceAdditionalQueryClassification = {
	owner: 'sandy081';
	comment: 'Response information about the additional query to the Marketplace for fetching all versions to get release version';
	readonly duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; 'isMeasurement': true; comment: 'Amount of time taken by the additional query' };
	readonly count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Total number of extensions returned by this additional query' };
};

type GalleryServiceAdditionalQueryEvent = {
	readonly duration: number;
	readonly count: number;
};

type ExtensionsCriteria = {
	readonly productVersion: IProductVersion;
	readonly targetPlatform: TargetPlatform;
	readonly compatible: boolean;
	readonly includePreRelease: boolean | (IExtensionIdentifier & { includePreRelease: boolean })[];
	readonly versions?: (IExtensionIdentifier & { version: string })[];
};

const enum VersionKind {
	Release,
	Prerelease,
	Latest
}

type ExtensionVersionCriteria = {
	readonly productVersion: IProductVersion;
	readonly targetPlatform: TargetPlatform;
	readonly compatible: boolean;
	readonly version: VersionKind | string;
};

class Query {

	constructor(private state = DefaultQueryState) { }

	get pageNumber(): number { return this.state.pageNumber; }
	get pageSize(): number { return this.state.pageSize; }
	get sortBy(): number { return this.state.sortBy; }
	get sortOrder(): number { return this.state.sortOrder; }
	get flags(): number { return this.state.flags; }
	get criteria(): ICriterium[] { return this.state.criteria; }

	withPage(pageNumber: number, pageSize: number = this.state.pageSize): Query {
		return new Query({ ...this.state, pageNumber, pageSize });
	}

	withFilter(filterType: FilterType, ...values: string[]): Query {
		const criteria = [
			...this.state.criteria,
			...values.length ? values.map(value => ({ filterType, value })) : [{ filterType }]
		];

		return new Query({ ...this.state, criteria });
	}

	withSortBy(sortBy: SortBy): Query {
		return new Query({ ...this.state, sortBy });
	}

	withSortOrder(sortOrder: SortOrder): Query {
		return new Query({ ...this.state, sortOrder });
	}

	withFlags(...flags: Flags[]): Query {
		return new Query({ ...this.state, flags: flags.reduce<number>((r, f) => r | f, 0) });
	}

	withAssetTypes(...assetTypes: string[]): Query {
		return new Query({ ...this.state, assetTypes });
	}

	withSource(source: string): Query {
		return new Query({ ...this.state, source });
	}

	get raw() {
		const { criteria, pageNumber, pageSize, sortBy, sortOrder, flags, assetTypes } = this.state;
		const filters = [{ criteria, pageNumber, pageSize, sortBy, sortOrder }];
		return { filters, assetTypes, flags };
	}

	get searchText(): string {
		const criterium = this.state.criteria.filter(criterium => criterium.filterType === FilterType.SearchText)[0];
		return criterium && criterium.value ? criterium.value : '';
	}

	get telemetryData(): QueryTelemetryData {
		return {
			filterTypes: this.state.criteria.map(criterium => String(criterium.filterType)),
			flags: this.state.flags,
			sortBy: String(this.sortBy),
			sortOrder: String(this.sortOrder),
			pageNumber: String(this.pageNumber),
			source: this.state.source,
			searchTextLength: this.searchText.length
		};
	}
}

function getStatistic(statistics: IRawGalleryExtensionStatistics[], name: string): number {
	const result = (statistics || []).filter(s => s.statisticName === name)[0];
	return result ? result.value : 0;
}

function getCoreTranslationAssets(version: IRawGalleryExtensionVersion): [string, IGalleryExtensionAsset][] {
	const coreTranslationAssetPrefix = 'Microsoft.VisualStudio.Code.Translation.';
	const result = version.files.filter(f => f.assetType.indexOf(coreTranslationAssetPrefix) === 0);
	return result.reduce<[string, IGalleryExtensionAsset][]>((result, file) => {
		const asset = getVersionAsset(version, file.assetType);
		if (asset) {
			result.push([file.assetType.substring(coreTranslationAssetPrefix.length), asset]);
		}
		return result;
	}, []);
}

function getRepositoryAsset(version: IRawGalleryExtensionVersion): IGalleryExtensionAsset | null {
	if (version.properties) {
		const results = version.properties.filter(p => p.key === AssetType.Repository);
		const gitRegExp = new RegExp('((git|ssh|http(s)?)|(git@[\\w.]+))(:(//)?)([\\w.@:/\\-~]+)(.git)(/)?');

		const uri = results.filter(r => gitRegExp.test(r.value))[0];
		return uri ? { uri: uri.value, fallbackUri: uri.value } : null;
	}
	return getVersionAsset(version, AssetType.Repository);
}

function getDownloadAsset(version: IRawGalleryExtensionVersion): IGalleryExtensionAsset {
	return {
		// always use fallbackAssetUri for download asset to hit the Marketplace API so that downloads are counted
		uri: `${version.fallbackAssetUri}/${AssetType.VSIX}?redirect=true${version.targetPlatform ? `&targetPlatform=${version.targetPlatform}` : ''}`,
		fallbackUri: `${version.fallbackAssetUri}/${AssetType.VSIX}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ''}`
	};
}

function getVersionAsset(version: IRawGalleryExtensionVersion, type: string): IGalleryExtensionAsset | null {
	const result = version.files.filter(f => f.assetType === type)[0];
	return result ? {
		uri: `${version.assetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ''}`,
		fallbackUri: `${version.fallbackAssetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ''}`
	} : null;
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

function isPreReleaseVersion(version: IRawGalleryExtensionVersion): boolean {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.PreRelease) : [];
	return values.length > 0 && values[0].value === 'true';
}

function executesCode(version: IRawGalleryExtensionVersion): boolean | undefined {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.ExecutesCode) : [];
	return values.length > 0 ? values[0].value === 'true' : undefined;
}

function getEnabledApiProposals(version: IRawGalleryExtensionVersion): string[] {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.EnabledApiProposals) : [];
	const value = (values.length > 0 && values[0].value) || '';
	return value ? value.split(',') : [];
}

function getLocalizedLanguages(version: IRawGalleryExtensionVersion): string[] {
	const values = version.properties ? version.properties.filter(p => p.key === PropertyType.LocalizedLanguages) : [];
	const value = (values.length > 0 && values[0].value) || '';
	return value ? value.split(',') : [];
}

function getSponsorLink(version: IRawGalleryExtensionVersion): string | undefined {
	return version.properties?.find(p => p.key === PropertyType.SponsorLink)?.value;
}

function getSupportLink(version: IRawGalleryExtensionVersion): string | undefined {
	return version.properties?.find(p => p.key === PropertyType.SupportLink)?.value;
}

function getIsPreview(flags: string): boolean {
	return flags.indexOf('preview') !== -1;
}

function getTargetPlatformForExtensionVersion(version: IRawGalleryExtensionVersion): TargetPlatform {
	return version.targetPlatform ? toTargetPlatform(version.targetPlatform) : TargetPlatform.UNDEFINED;
}

function getAllTargetPlatforms(rawGalleryExtension: IRawGalleryExtension): TargetPlatform[] {
	const allTargetPlatforms = distinct(rawGalleryExtension.versions.map(getTargetPlatformForExtensionVersion));

	// Is a web extension only if it has WEB_EXTENSION_TAG
	const isWebExtension = !!rawGalleryExtension.tags?.includes(WEB_EXTENSION_TAG);

	// Include Web Target Platform only if it is a web extension
	const webTargetPlatformIndex = allTargetPlatforms.indexOf(TargetPlatform.WEB);
	if (isWebExtension) {
		if (webTargetPlatformIndex === -1) {
			// Web extension but does not has web target platform -> add it
			allTargetPlatforms.push(TargetPlatform.WEB);
		}
	} else {
		if (webTargetPlatformIndex !== -1) {
			// Not a web extension but has web target platform -> remove it
			allTargetPlatforms.splice(webTargetPlatformIndex, 1);
		}
	}

	return allTargetPlatforms;
}

export function sortExtensionVersions(versions: IRawGalleryExtensionVersion[], preferredTargetPlatform: TargetPlatform): IRawGalleryExtensionVersion[] {
	/* It is expected that versions from Marketplace are sorted by version. So we are just sorting by preferred targetPlatform */
	for (let index = 0; index < versions.length; index++) {
		const version = versions[index];
		if (version.version === versions[index - 1]?.version) {
			let insertionIndex = index;
			const versionTargetPlatform = getTargetPlatformForExtensionVersion(version);
			/* put it at the beginning */
			if (versionTargetPlatform === preferredTargetPlatform) {
				while (insertionIndex > 0 && versions[insertionIndex - 1].version === version.version) { insertionIndex--; }
			}
			if (insertionIndex !== index) {
				versions.splice(index, 1);
				versions.splice(insertionIndex, 0, version);
			}
		}
	}
	return versions;
}

function setTelemetry(extension: IGalleryExtension, index: number, querySource?: string): void {
	/* __GDPR__FRAGMENT__
	"GalleryExtensionTelemetryData2" : {
		"index" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"querySource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"queryActivityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	}
	*/
	extension.telemetryData = { index, querySource, queryActivityId: extension.queryContext?.[ACTIVITY_HEADER_NAME] };
}

function toExtension(galleryExtension: IRawGalleryExtension, version: IRawGalleryExtensionVersion, allTargetPlatforms: TargetPlatform[], queryContext?: IStringDictionary<any>): IGalleryExtension {
	const latestVersion = galleryExtension.versions[0];
	const assets: IGalleryExtensionAssets = {
		manifest: getVersionAsset(version, AssetType.Manifest),
		readme: getVersionAsset(version, AssetType.Details),
		changelog: getVersionAsset(version, AssetType.Changelog),
		license: getVersionAsset(version, AssetType.License),
		repository: getRepositoryAsset(version),
		download: getDownloadAsset(version),
		icon: getVersionAsset(version, AssetType.Icon),
		signature: getVersionAsset(version, AssetType.Signature),
		coreTranslations: getCoreTranslationAssets(version)
	};

	return {
		type: 'gallery',
		identifier: {
			id: getGalleryExtensionId(galleryExtension.publisher.publisherName, galleryExtension.extensionName),
			uuid: galleryExtension.extensionId
		},
		name: galleryExtension.extensionName,
		version: version.version,
		displayName: galleryExtension.displayName,
		publisherId: galleryExtension.publisher.publisherId,
		publisher: galleryExtension.publisher.publisherName,
		publisherDisplayName: galleryExtension.publisher.displayName,
		publisherDomain: galleryExtension.publisher.domain ? { link: galleryExtension.publisher.domain, verified: !!galleryExtension.publisher.isDomainVerified } : undefined,
		publisherSponsorLink: getSponsorLink(latestVersion),
		description: galleryExtension.shortDescription ?? '',
		installCount: getStatistic(galleryExtension.statistics, 'install'),
		rating: getStatistic(galleryExtension.statistics, 'averagerating'),
		ratingCount: getStatistic(galleryExtension.statistics, 'ratingcount'),
		categories: galleryExtension.categories || [],
		tags: galleryExtension.tags || [],
		releaseDate: Date.parse(galleryExtension.releaseDate),
		lastUpdated: Date.parse(galleryExtension.lastUpdated),
		allTargetPlatforms,
		assets,
		properties: {
			dependencies: getExtensions(version, PropertyType.Dependency),
			extensionPack: getExtensions(version, PropertyType.ExtensionPack),
			engine: getEngine(version),
			enabledApiProposals: getEnabledApiProposals(version),
			localizedLanguages: getLocalizedLanguages(version),
			targetPlatform: getTargetPlatformForExtensionVersion(version),
			isPreReleaseVersion: isPreReleaseVersion(version),
			executesCode: executesCode(version)
		},
		hasPreReleaseVersion: isPreReleaseVersion(latestVersion),
		hasReleaseVersion: true,
		preview: getIsPreview(galleryExtension.flags),
		isSigned: !!assets.signature,
		queryContext,
		supportLink: getSupportLink(latestVersion)
	};
}

interface IRawExtensionsControlManifest {
	malicious: string[];
	migrateToPreRelease?: IStringDictionary<{
		id: string;
		displayName: string;
		migrateStorage?: boolean;
		engine?: string;
	}>;
	deprecated?: IStringDictionary<boolean | {
		disallowInstall?: boolean;
		extension?: {
			id: string;
			displayName: string;
		};
		settings?: string[];
		additionalInfo?: string;
	}>;
	search?: ISearchPrefferedResults[];
	extensionsEnabledWithPreRelease?: string[];
}

abstract class AbstractExtensionGalleryService implements IExtensionGalleryService {

	declare readonly _serviceBrand: undefined;

	private readonly extensionsGalleryUrl: string | undefined;
	private readonly extensionsControlUrl: string | undefined;
	private readonly extensionUrlTemplate: string | undefined;

	private readonly commonHeadersPromise: Promise<IHeaders>;
	private readonly extensionsEnabledWithApiProposalVersion: string[];

	constructor(
		storageService: IStorageService | undefined,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
	) {
		const config = productService.extensionsGallery;
		this.extensionsGalleryUrl = config?.serviceUrl;
		this.extensionsControlUrl = config?.controlUrl;
		this.extensionUrlTemplate = config?.extensionUrlTemplate;
		this.extensionsEnabledWithApiProposalVersion = productService.extensionsEnabledWithApiProposalVersion?.map(id => id.toLowerCase()) ?? [];
		this.commonHeadersPromise = resolveMarketplaceHeaders(
			productService.version,
			productService,
			this.environmentService,
			this.configurationService,
			this.fileService,
			storageService,
			this.telemetryService);
	}

	private api(path = ''): string {
		return `${this.extensionsGalleryUrl}${path}`;
	}

	isEnabled(): boolean {
		return !!this.extensionsGalleryUrl;
	}

	getExtensions(extensionInfos: ReadonlyArray<IExtensionInfo>, token: CancellationToken): Promise<IGalleryExtension[]>;
	getExtensions(extensionInfos: ReadonlyArray<IExtensionInfo>, options: IExtensionQueryOptions, token: CancellationToken): Promise<IGalleryExtension[]>;
	async getExtensions(extensionInfos: ReadonlyArray<IExtensionInfo>, arg1: any, arg2?: any): Promise<IGalleryExtension[]> {
		if (!this.isEnabled()) {
			throw new Error('No extension gallery service configured.');
		}

		const options = CancellationToken.isCancellationToken(arg1) ? {} : arg1 as IExtensionQueryOptions;
		const token = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2 as CancellationToken;

		const useResourceApi = options.preferResourceApi && (this.configurationService.getValue(UseUnpkgResourceApiConfigKey) ?? false);
		const result = useResourceApi
			? await this.getExtensionsUsingResourceApi(extensionInfos, options, token)
			: await this.doGetExtensions(extensionInfos, options, token);

		const uuids = result.map(r => r.identifier.uuid);
		const extensionInfosByName: IExtensionInfo[] = [];
		for (const e of extensionInfos) {
			if (e.uuid && !uuids.includes(e.uuid)) {
				extensionInfosByName.push({ ...e, uuid: undefined });
			}
		}

		if (extensionInfosByName.length) {
			// report telemetry data for additional query
			this.telemetryService.publicLog2<
				{ count: number },
				{
					owner: 'sandy081';
					comment: 'Report the query to the Marketplace for fetching extensions by name';
					readonly count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of extensions to fetch' };
				}>('galleryService:additionalQueryByName', {
					count: extensionInfosByName.length
				});

			const extensions = await this.doGetExtensions(extensionInfosByName, options, token);
			result.push(...extensions);
		}

		return result;
	}

	private async doGetExtensions(extensionInfos: ReadonlyArray<IExtensionInfo>, options: IExtensionQueryOptions, token: CancellationToken): Promise<IGalleryExtension[]> {
		const names: string[] = []; const ids: string[] = [], includePreReleases: (IExtensionIdentifier & { includePreRelease: boolean })[] = [], versions: (IExtensionIdentifier & { version: string })[] = [];
		let isQueryForReleaseVersionFromPreReleaseVersion = true;
		for (const extensionInfo of extensionInfos) {
			if (extensionInfo.uuid) {
				ids.push(extensionInfo.uuid);
			} else {
				names.push(extensionInfo.id);
			}
			// Set includePreRelease to true if version is set, because the version can be a pre-release version
			const includePreRelease = !!(extensionInfo.version || extensionInfo.preRelease);
			includePreReleases.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, includePreRelease });
			if (extensionInfo.version) {
				versions.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, version: extensionInfo.version });
			}
			isQueryForReleaseVersionFromPreReleaseVersion = isQueryForReleaseVersionFromPreReleaseVersion && (!!extensionInfo.hasPreRelease && !includePreRelease);
		}

		if (!ids.length && !names.length) {
			return [];
		}

		let query = new Query().withPage(1, extensionInfos.length);
		if (ids.length) {
			query = query.withFilter(FilterType.ExtensionId, ...ids);
		}
		if (names.length) {
			query = query.withFilter(FilterType.ExtensionName, ...names);
		}
		if (options.queryAllVersions || isQueryForReleaseVersionFromPreReleaseVersion /* Inlcude all versions if every requested extension is for release version and has pre-release version  */) {
			query = query.withFlags(query.flags, Flags.IncludeVersions);
		}
		if (options.source) {
			query = query.withSource(options.source);
		}

		const { extensions } = await this.queryGalleryExtensions(query, { targetPlatform: options.targetPlatform ?? CURRENT_TARGET_PLATFORM, includePreRelease: includePreReleases, versions, compatible: !!options.compatible, productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date } }, token);
		if (options.source) {
			extensions.forEach((e, index) => setTelemetry(e, index, options.source));
		}
		return extensions;
	}

	private async getExtensionsUsingResourceApi(extensionInfos: ReadonlyArray<IExtensionInfo>, options: IExtensionQueryOptions, token: CancellationToken): Promise<IGalleryExtension[]> {

		const toQuery: IExtensionInfo[] = [];
		const result: IGalleryExtension[] = [];

		await Promise.allSettled(extensionInfos.map(async extensionInfo => {
			if (extensionInfo.version) {
				toQuery.push(extensionInfo);
				return;
			}

			if (!EXTENSION_IDENTIFIER_REGEX.test(extensionInfo.id)) {
				return;
			}

			try {
				const rawGalleryExtension = await this.getLatestRawGalleryExtension(extensionInfo.id, token);
				if (!rawGalleryExtension) {
					if (extensionInfo.uuid) {
						toQuery.push(extensionInfo);
					}
					return;
				}

				const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
				const rawGalleryExtensionVersion = await this.getRawGalleryExtensionVersion(
					rawGalleryExtension,
					{
						targetPlatform: options.targetPlatform ?? CURRENT_TARGET_PLATFORM,
						compatible: !!options.compatible,
						productVersion: options.productVersion ?? {
							version: this.productService.version,
							date: this.productService.date
						},
						version: extensionInfo.preRelease ? VersionKind.Prerelease : VersionKind.Release
					}, allTargetPlatforms);

				if (rawGalleryExtensionVersion) {
					result.push(toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms));
				}

				// report telemetry
				else {
					this.telemetryService.publicLog2<
						{
							extension: string;
							preRelease: boolean;
							compatible: boolean;
						},
						{
							owner: 'sandy081';
							comment: 'Report the fallback to the Marketplace query for fetching extensions';
							extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Extension id' };
							preRelease: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Get pre-release version' };
							compatible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Get compatible version' };
						}>('galleryService:fallbacktoquery', {
							extension: extensionInfo.id,
							preRelease: !!extensionInfo.preRelease,
							compatible: !!options.compatible
						});
					if (!options.compatible || this.allowedExtensionsService.isAllowed({ id: extensionInfo.id, publisherDisplayName: rawGalleryExtension.publisher.displayName }) === true) {
						toQuery.push(extensionInfo);
					}
				}
			} catch (error) {
				// Skip if there is an error while getting the latest version
				this.logService.error(`Error while getting the latest version for the extension ${extensionInfo.id}.`, getErrorMessage(error));
				toQuery.push(extensionInfo);
			}
		}));

		const extensions = await this.doGetExtensions(toQuery, options, token);
		result.push(...extensions);

		return result;
	}

	async getCompatibleExtension(extension: IGalleryExtension, includePreRelease: boolean, targetPlatform: TargetPlatform, productVersion: IProductVersion = { version: this.productService.version, date: this.productService.date }): Promise<IGalleryExtension | null> {
		if (isNotWebExtensionInWebTargetPlatform(extension.allTargetPlatforms, targetPlatform)) {
			return null;
		}
		if (await this.isExtensionCompatible(extension, includePreRelease, targetPlatform)) {
			return extension;
		}
		if (this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName }) !== true) {
			return null;
		}
		const query = new Query()
			.withFlags(Flags.IncludeVersions)
			.withPage(1, 1)
			.withFilter(FilterType.ExtensionId, extension.identifier.uuid);
		const { extensions } = await this.queryGalleryExtensions(query, { targetPlatform, compatible: true, includePreRelease, productVersion }, CancellationToken.None);
		return extensions[0] || null;
	}

	async isExtensionCompatible(extension: IGalleryExtension, includePreRelease: boolean, targetPlatform: TargetPlatform, productVersion: IProductVersion = { version: this.productService.version, date: this.productService.date }): Promise<boolean> {
		if (this.allowedExtensionsService.isAllowed(extension) !== true) {
			return false;
		}

		if (!isTargetPlatformCompatible(extension.properties.targetPlatform, extension.allTargetPlatforms, targetPlatform)) {
			return false;
		}

		if (!includePreRelease && extension.properties.isPreReleaseVersion) {
			// Pre-releases are not allowed when include pre-release flag is not set
			return false;
		}

		let engine = extension.properties.engine;
		if (!engine) {
			const manifest = await this.getManifest(extension, CancellationToken.None);
			if (!manifest) {
				throw new Error('Manifest was not found');
			}
			engine = manifest.engines.vscode;
		}

		if (!isEngineValid(engine, productVersion.version, productVersion.date)) {
			return false;
		}

		if (!this.areApiProposalsCompatible(extension.identifier, extension.properties.enabledApiProposals)) {
			return false;
		}

		return true;
	}

	private areApiProposalsCompatible(extensionIdentifier: IExtensionIdentifier, enabledApiProposals: string[] | undefined): boolean {
		if (!enabledApiProposals) {
			return true;
		}
		if (!this.extensionsEnabledWithApiProposalVersion.includes(extensionIdentifier.id.toLowerCase())) {
			return true;
		}
		return areApiProposalsCompatible(enabledApiProposals);
	}

	private async isValidVersion(
		extension: string,
		rawGalleryExtensionVersion: IRawGalleryExtensionVersion,
		{ targetPlatform, compatible, productVersion, version }: ExtensionVersionCriteria,
		publisherDisplayName: string,
		allTargetPlatforms: TargetPlatform[]
	): Promise<boolean> {

		// Specific version
		if (isString(version)) {
			if (rawGalleryExtensionVersion.version !== version) {
				return false;
			}
		}

		// Prerelease or release version kind
		else if (version === VersionKind.Release || version === VersionKind.Prerelease) {
			if (isPreReleaseVersion(rawGalleryExtensionVersion) !== (version === VersionKind.Prerelease)) {
				return false;
			}
		}

		const targetPlatformForExtension = getTargetPlatformForExtensionVersion(rawGalleryExtensionVersion);
		if (!isTargetPlatformCompatible(targetPlatformForExtension, allTargetPlatforms, targetPlatform)) {
			return false;
		}

		if (compatible) {
			if (this.allowedExtensionsService.isAllowed({ id: extension, publisherDisplayName, version: rawGalleryExtensionVersion.version, prerelease: isPreReleaseVersion(rawGalleryExtensionVersion), targetPlatform: targetPlatformForExtension }) !== true) {
				return false;
			}
			try {
				const engine = await this.getEngine(extension, rawGalleryExtensionVersion);
				if (!isEngineValid(engine, productVersion.version, productVersion.date)) {
					return false;
				}
			} catch (error) {
				this.logService.error(`Error while getting the engine for the version ${rawGalleryExtensionVersion.version}.`, getErrorMessage(error));
				return false;
			}
		}

		return true;
	}

	async query(options: IQueryOptions, token: CancellationToken): Promise<IPager<IGalleryExtension>> {
		let text = options.text || '';
		const pageSize = options.pageSize ?? 50;

		let query = new Query()
			.withPage(1, pageSize);

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

			// Use featured filter
			text = text.replace(/\bfeatured(\s+|\b|$)/g, () => {
				query = query.withFilter(FilterType.Featured);
				return '';
			});

			text = text.trim();

			if (text) {
				text = text.length < 200 ? text : text.substring(0, 200);
				query = query.withFilter(FilterType.SearchText, text);
			}

			query = query.withSortBy(SortBy.NoneOrRelevance);
		} else {
			query = query.withSortBy(SortBy.InstallCount);
		}

		if (typeof options.sortBy === 'number') {
			query = query.withSortBy(options.sortBy);
		}

		if (typeof options.sortOrder === 'number') {
			query = query.withSortOrder(options.sortOrder);
		}

		if (options.source) {
			query = query.withSource(options.source);
		}

		const runQuery = async (query: Query, token: CancellationToken) => {
			const { extensions, total } = await this.queryGalleryExtensions(query, { targetPlatform: CURRENT_TARGET_PLATFORM, compatible: false, includePreRelease: !!options.includePreRelease, productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date } }, token);
			extensions.forEach((e, index) => setTelemetry(e, ((query.pageNumber - 1) * query.pageSize) + index, options.source));
			return { extensions, total };
		};
		const { extensions, total } = await runQuery(query, token);
		const getPage = async (pageIndex: number, ct: CancellationToken) => {
			if (ct.isCancellationRequested) {
				throw new CancellationError();
			}
			const { extensions } = await runQuery(query.withPage(pageIndex + 1), ct);
			return extensions;
		};

		return { firstPage: extensions, total, pageSize: query.pageSize, getPage };
	}

	private async queryGalleryExtensions(query: Query, criteria: ExtensionsCriteria, token: CancellationToken): Promise<{ extensions: IGalleryExtension[]; total: number }> {
		const flags = query.flags;

		/**
		 * If both version flags (IncludeLatestVersionOnly and IncludeVersions) are included, then only include latest versions (IncludeLatestVersionOnly) flag.
		 */
		if (!!(query.flags & Flags.IncludeLatestVersionOnly) && !!(query.flags & Flags.IncludeVersions)) {
			query = query.withFlags(query.flags & ~Flags.IncludeVersions, Flags.IncludeLatestVersionOnly);
		}

		/**
		 * If version flags (IncludeLatestVersionOnly and IncludeVersions) are not included, default is to query for latest versions (IncludeLatestVersionOnly).
		 */
		if (!(query.flags & Flags.IncludeLatestVersionOnly) && !(query.flags & Flags.IncludeVersions)) {
			query = query.withFlags(query.flags, Flags.IncludeLatestVersionOnly);
		}

		/**
		 * If versions criteria exist, then remove IncludeLatestVersionOnly flag and add IncludeVersions flag.
		 */
		if (criteria.versions?.length) {
			query = query.withFlags(query.flags & ~Flags.IncludeLatestVersionOnly, Flags.IncludeVersions);
		}

		/**
		 * Add necessary extension flags
		 */
		query = query.withFlags(query.flags, Flags.IncludeAssetUri, Flags.IncludeCategoryAndTags, Flags.IncludeFiles, Flags.IncludeStatistics, Flags.IncludeVersionProperties);
		const { galleryExtensions: rawGalleryExtensions, total, context } = await this.queryRawGalleryExtensions(query, token);

		const hasAllVersions: boolean = !(query.flags & Flags.IncludeLatestVersionOnly);
		if (hasAllVersions) {
			const extensions: IGalleryExtension[] = [];
			for (const rawGalleryExtension of rawGalleryExtensions) {
				const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
				const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
				const includePreRelease = isBoolean(criteria.includePreRelease) ? criteria.includePreRelease : !!criteria.includePreRelease.find(extensionIdentifierWithPreRelease => areSameExtensions(extensionIdentifierWithPreRelease, extensionIdentifier))?.includePreRelease;
				const rawGalleryExtensionVersion = await this.getRawGalleryExtensionVersion(
					rawGalleryExtension,
					{
						compatible: criteria.compatible,
						targetPlatform: criteria.targetPlatform,
						productVersion: criteria.productVersion,
						version: criteria.versions?.find(extensionIdentifierWithVersion => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version
							?? (includePreRelease ? VersionKind.Latest : VersionKind.Release)
					},
					allTargetPlatforms
				);
				if (rawGalleryExtensionVersion) {
					extensions.push(toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, context));
				}
			}
			return { extensions, total };
		}

		const result: [number, IGalleryExtension][] = [];
		const needAllVersions = new Map<string, number>();
		for (let index = 0; index < rawGalleryExtensions.length; index++) {
			const rawGalleryExtension = rawGalleryExtensions[index];
			const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
			const includePreRelease = isBoolean(criteria.includePreRelease) ? criteria.includePreRelease : !!criteria.includePreRelease.find(extensionIdentifierWithPreRelease => areSameExtensions(extensionIdentifierWithPreRelease, extensionIdentifier))?.includePreRelease;
			const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
			if (criteria.compatible) {
				// Skip looking for all versions if requested for a web-compatible extension and it is not a web extension.
				if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, criteria.targetPlatform)) {
					continue;
				}
				// Skip looking for all versions if the extension is not allowed.
				if (this.allowedExtensionsService.isAllowed({ id: extensionIdentifier.id, publisherDisplayName: rawGalleryExtension.publisher.displayName }) !== true) {
					continue;
				}
			}
			const rawGalleryExtensionVersion = await this.getRawGalleryExtensionVersion(
				rawGalleryExtension,
				{
					compatible: criteria.compatible,
					targetPlatform: criteria.targetPlatform,
					productVersion: criteria.productVersion,
					version: criteria.versions?.find(extensionIdentifierWithVersion => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version
						?? (includePreRelease ? VersionKind.Latest : VersionKind.Release)
				},
				allTargetPlatforms
			);
			const extension = rawGalleryExtensionVersion ? toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, context) : null;
			if (!extension
				/** Need all versions if the extension is a pre-release version but
				 * 		- the query is to look for a release version or
				 * 		- the extension has no release version
				 * Get all versions to get or check the release version
				*/
				|| (extension.properties.isPreReleaseVersion && (!includePreRelease || !extension.hasReleaseVersion))
				/**
				 * Need all versions if the extension is a release version with a different target platform than requested and also has a pre-release version
				 * Because, this is a platform specific extension and can have a newer release version supporting this platform.
				 * See https://github.com/microsoft/vscode/issues/139628
				*/
				|| (!extension.properties.isPreReleaseVersion && extension.properties.targetPlatform !== criteria.targetPlatform && extension.hasPreReleaseVersion)
			) {
				needAllVersions.set(rawGalleryExtension.extensionId, index);
			} else {
				result.push([index, extension]);
			}
		}

		if (needAllVersions.size) {
			const stopWatch = new StopWatch();
			const query = new Query()
				.withFlags(flags & ~Flags.IncludeLatestVersionOnly, Flags.IncludeVersions)
				.withPage(1, needAllVersions.size)
				.withFilter(FilterType.ExtensionId, ...needAllVersions.keys());
			const { extensions } = await this.queryGalleryExtensions(query, criteria, token);
			this.telemetryService.publicLog2<GalleryServiceAdditionalQueryEvent, GalleryServiceAdditionalQueryClassification>('galleryService:additionalQuery', {
				duration: stopWatch.elapsed(),
				count: needAllVersions.size
			});
			for (const extension of extensions) {
				const index = needAllVersions.get(extension.identifier.uuid)!;
				result.push([index, extension]);
			}
		}

		return { extensions: result.sort((a, b) => a[0] - b[0]).map(([, extension]) => extension), total };
	}

	private async getRawGalleryExtensionVersion(rawGalleryExtension: IRawGalleryExtension, criteria: ExtensionVersionCriteria, allTargetPlatforms: TargetPlatform[]): Promise<IRawGalleryExtensionVersion | null> {
		const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
		const rawGalleryExtensionVersions = sortExtensionVersions(rawGalleryExtension.versions, criteria.targetPlatform);

		if (criteria.compatible && isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, criteria.targetPlatform)) {
			return null;
		}

		const version = isString(criteria.version) ? criteria.version : undefined;

		for (let index = 0; index < rawGalleryExtensionVersions.length; index++) {
			const rawGalleryExtensionVersion = rawGalleryExtensionVersions[index];
			if (await this.isValidVersion(
				extensionIdentifier.id,
				rawGalleryExtensionVersion,
				criteria,
				rawGalleryExtension.publisher.displayName,
				allTargetPlatforms)
			) {
				if (criteria.compatible && !this.areApiProposalsCompatible(extensionIdentifier, getEnabledApiProposals(rawGalleryExtensionVersion))) {
					continue;
				}
				return rawGalleryExtensionVersion;
			}
			if (version && rawGalleryExtensionVersion.version === version) {
				return null;
			}
		}

		if (version || criteria.compatible) {
			return null;
		}

		/**
		 * Fallback: Return the latest version
		 * This can happen when the extension does not have a release version or does not have a version compatible with the given target platform.
		 */
		return rawGalleryExtension.versions[0];
	}

	private async queryRawGalleryExtensions(query: Query, token: CancellationToken): Promise<IRawGalleryExtensionsResult> {
		if (!this.isEnabled()) {
			throw new Error('No extension gallery service configured.');
		}

		query = query
			/* Always exclude non validated extensions */
			.withFlags(query.flags, Flags.ExcludeNonValidated)
			.withFilter(FilterType.Target, 'Microsoft.VisualStudio.Code')
			/* Always exclude unpublished extensions */
			.withFilter(FilterType.ExcludeWithFlags, flagsToString(Flags.Unpublished));

		const commonHeaders = await this.commonHeadersPromise;
		const data = JSON.stringify(query.raw);
		const headers = {
			...commonHeaders,
			'Content-Type': 'application/json',
			'Accept': 'application/json;api-version=3.0-preview.1',
			'Accept-Encoding': 'gzip',
			'Content-Length': String(data.length),
		};

		const stopWatch = new StopWatch();
		let context: IRequestContext | undefined, errorCode: ExtensionGalleryErrorCode | undefined, total: number = 0;

		try {
			context = await this.requestService.request({
				type: 'POST',
				url: this.api('/extensionquery'),
				data,
				headers
			}, token);

			if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
				return { galleryExtensions: [], total };
			}

			const result = await asJson<IRawGalleryQueryResult>(context);
			if (result) {
				const r = result.results[0];
				const galleryExtensions = r.extensions;
				const resultCount = r.resultMetadata && r.resultMetadata.filter(m => m.metadataType === 'ResultCount')[0];
				total = resultCount && resultCount.metadataItems.filter(i => i.name === 'TotalCount')[0].count || 0;

				return {
					galleryExtensions,
					total,
					context: context.res.headers['activityid'] ? {
						[ACTIVITY_HEADER_NAME]: context.res.headers['activityid']
					} : {}
				};
			}
			return { galleryExtensions: [], total };

		} catch (e) {
			if (isCancellationError(e)) {
				errorCode = ExtensionGalleryErrorCode.Cancelled;
				throw e;
			} else {
				const errorMessage = getErrorMessage(e);
				errorCode = isOfflineError(e)
					? ExtensionGalleryErrorCode.Offline
					: errorMessage.startsWith('XHR timeout')
						? ExtensionGalleryErrorCode.Timeout
						: ExtensionGalleryErrorCode.Failed;
				throw new ExtensionGalleryError(errorMessage, errorCode);
			}
		} finally {
			this.telemetryService.publicLog2<GalleryServiceQueryEvent, GalleryServiceQueryClassification>('galleryService:query', {
				...query.telemetryData,
				requestBodySize: String(data.length),
				duration: stopWatch.elapsed(),
				success: !!context && isSuccess(context),
				responseBodySize: context?.res.headers['Content-Length'],
				statusCode: context ? String(context.res.statusCode) : undefined,
				errorCode,
				count: String(total)
			});
		}
	}

	private async getLatestRawGalleryExtension(extensionId: string, token: CancellationToken): Promise<IRawGalleryExtension | null> {
		let errorCode: string | undefined;
		const stopWatch = new StopWatch();

		try {
			const [publisher, name] = extensionId.split('.');
			const uri = URI.parse(format2(this.extensionUrlTemplate!, { publisher, name }));
			const commonHeaders = await this.commonHeadersPromise;
			const headers = {
				...commonHeaders,
				'Content-Type': 'application/json',
				'Accept': 'application/json;api-version=7.2-preview',
				'Accept-Encoding': 'gzip',
			};

			const context = await this.requestService.request({
				type: 'GET',
				url: uri.toString(true),
				headers,
				timeout: 10000 /*10s*/
			}, token);

			if (context.res.statusCode === 404) {
				errorCode = 'NotFound';
				return null;
			}

			if (context.res.statusCode && context.res.statusCode !== 200) {
				errorCode = `GalleryServiceError:` + context.res.statusCode;
				throw new Error('Unexpected HTTP response: ' + context.res.statusCode);
			}

			const result = await asJson<IRawGalleryExtension>(context);
			if (!result) {
				errorCode = 'NoData';
			}
			return result;
		}

		catch (error) {
			if (isCancellationError(error)) {
				errorCode = ExtensionGalleryErrorCode.Cancelled;
			} else {
				const errorMessage = getErrorMessage(error);
				errorCode = isOfflineError(error)
					? ExtensionGalleryErrorCode.Offline
					: errorMessage.startsWith('XHR timeout')
						? ExtensionGalleryErrorCode.Timeout
						: ExtensionGalleryErrorCode.Failed;
			}
			throw error;
		}

		finally {
			type GalleryServiceGetLatestEventClassification = {
				owner: 'sandy081';
				comment: 'Report the query to the Marketplace for fetching latest version of an extension';
				extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the extension' };
				duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration in ms for the query' };
				errorCode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The error code in case of error' };
			};
			type GalleryServiceGetLatestEvent = {
				extension: string;
				duration: number;
				errorCode?: string;
			};
			this.telemetryService.publicLog2<GalleryServiceGetLatestEvent, GalleryServiceGetLatestEventClassification>('galleryService:getLatest', { extension: extensionId, duration: stopWatch.elapsed(), errorCode });
		}
	}

	async reportStatistic(publisher: string, name: string, version: string, type: StatisticType): Promise<void> {
		if (!this.isEnabled()) {
			return undefined;
		}

		const url = isWeb ? this.api(`/itemName/${publisher}.${name}/version/${version}/statType/${type === StatisticType.Install ? '1' : '3'}/vscodewebextension`) : this.api(`/publishers/${publisher}/extensions/${name}/${version}/stats?statType=${type}`);
		const Accept = isWeb ? 'api-version=6.1-preview.1' : '*/*;api-version=4.0-preview.1';

		const commonHeaders = await this.commonHeadersPromise;
		const headers = { ...commonHeaders, Accept };
		try {
			await this.requestService.request({
				type: 'POST',
				url,
				headers
			}, CancellationToken.None);
		} catch (error) { /* Ignore */ }
	}

	async download(extension: IGalleryExtension, location: URI, operation: InstallOperation): Promise<void> {
		this.logService.trace('ExtensionGalleryService#download', extension.identifier.id);
		const data = getGalleryExtensionTelemetryData(extension);
		const startTime = new Date().getTime();

		const operationParam = operation === InstallOperation.Install ? 'install' : operation === InstallOperation.Update ? 'update' : '';
		const downloadAsset = operationParam ? {
			uri: `${extension.assets.download.uri}${URI.parse(extension.assets.download.uri).query ? '&' : '?'}${operationParam}=true`,
			fallbackUri: `${extension.assets.download.fallbackUri}${URI.parse(extension.assets.download.fallbackUri).query ? '&' : '?'}${operationParam}=true`
		} : extension.assets.download;

		const headers: IHeaders | undefined = extension.queryContext?.[ACTIVITY_HEADER_NAME] ? { [ACTIVITY_HEADER_NAME]: extension.queryContext[ACTIVITY_HEADER_NAME] } : undefined;
		const context = await this.getAsset(extension.identifier.id, downloadAsset, AssetType.VSIX, extension.version, headers ? { headers } : undefined);

		try {
			await this.fileService.writeFile(location, context.stream);
		} catch (error) {
			try {
				await this.fileService.del(location);
			} catch (e) {
				/* ignore */
				this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
			}
			throw new ExtensionGalleryError(getErrorMessage(error), ExtensionGalleryErrorCode.DownloadFailedWriting);
		}

		/* __GDPR__
			"galleryService:downloadVSIX" : {
				"owner": "sandy081",
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"${include}": [
					"${GalleryExtensionTelemetryData}"
				]
			}
		*/
		this.telemetryService.publicLog('galleryService:downloadVSIX', { ...data, duration: new Date().getTime() - startTime });
	}

	async downloadSignatureArchive(extension: IGalleryExtension, location: URI): Promise<void> {
		if (!extension.assets.signature) {
			throw new Error('No signature asset found');
		}

		this.logService.trace('ExtensionGalleryService#downloadSignatureArchive', extension.identifier.id);

		const context = await this.getAsset(extension.identifier.id, extension.assets.signature, AssetType.Signature, extension.version);
		try {
			await this.fileService.writeFile(location, context.stream);
		} catch (error) {
			try {
				await this.fileService.del(location);
			} catch (e) {
				/* ignore */
				this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
			}
			throw new ExtensionGalleryError(getErrorMessage(error), ExtensionGalleryErrorCode.DownloadFailedWriting);
		}

	}

	async getReadme(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		if (extension.assets.readme) {
			const context = await this.getAsset(extension.identifier.id, extension.assets.readme, AssetType.Details, extension.version, {}, token);
			const content = await asTextOrError(context);
			return content || '';
		}
		return '';
	}

	async getManifest(extension: IGalleryExtension, token: CancellationToken): Promise<IExtensionManifest | null> {
		if (extension.assets.manifest) {
			const context = await this.getAsset(extension.identifier.id, extension.assets.manifest, AssetType.Manifest, extension.version, {}, token);
			const text = await asTextOrError(context);
			return text ? JSON.parse(text) : null;
		}
		return null;
	}

	private async getManifestFromRawExtensionVersion(extension: string, rawExtensionVersion: IRawGalleryExtensionVersion, token: CancellationToken): Promise<IExtensionManifest | null> {
		const manifestAsset = getVersionAsset(rawExtensionVersion, AssetType.Manifest);
		if (!manifestAsset) {
			throw new Error('Manifest was not found');
		}
		const headers = { 'Accept-Encoding': 'gzip' };
		const context = await this.getAsset(extension, manifestAsset, AssetType.Manifest, rawExtensionVersion.version, { headers });
		return await asJson<IExtensionManifest>(context);
	}

	async getCoreTranslation(extension: IGalleryExtension, languageId: string): Promise<ITranslation | null> {
		const asset = extension.assets.coreTranslations.filter(t => t[0] === languageId.toUpperCase())[0];
		if (asset) {
			const context = await this.getAsset(extension.identifier.id, asset[1], asset[0], extension.version);
			const text = await asTextOrError(context);
			return text ? JSON.parse(text) : null;
		}
		return null;
	}

	async getChangelog(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		if (extension.assets.changelog) {
			const context = await this.getAsset(extension.identifier.id, extension.assets.changelog, AssetType.Changelog, extension.version, {}, token);
			const content = await asTextOrError(context);
			return content || '';
		}
		return '';
	}

	async getAllCompatibleVersions(extensionIdentifier: IExtensionIdentifier, includePreRelease: boolean, targetPlatform: TargetPlatform): Promise<IGalleryExtensionVersion[]> {
		let query = new Query()
			.withFlags(Flags.IncludeVersions, Flags.IncludeCategoryAndTags, Flags.IncludeFiles, Flags.IncludeVersionProperties)
			.withPage(1, 1);

		if (extensionIdentifier.uuid) {
			query = query.withFilter(FilterType.ExtensionId, extensionIdentifier.uuid);
		} else {
			query = query.withFilter(FilterType.ExtensionName, extensionIdentifier.id);
		}

		const { galleryExtensions } = await this.queryRawGalleryExtensions(query, CancellationToken.None);
		if (!galleryExtensions.length) {
			return [];
		}

		const allTargetPlatforms = getAllTargetPlatforms(galleryExtensions[0]);
		if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, targetPlatform)) {
			return [];
		}

		const validVersions: IRawGalleryExtensionVersion[] = [];
		const productVersion = { version: this.productService.version, date: this.productService.date };
		await Promise.all(galleryExtensions[0].versions.map(async (version) => {
			try {
				if (
					(await this.isValidVersion(
						extensionIdentifier.id,
						version,
						{
							compatible: true,
							productVersion,
							targetPlatform,
							version: includePreRelease ? VersionKind.Latest : VersionKind.Release
						},
						galleryExtensions[0].publisher.displayName,
						allTargetPlatforms))
					&& this.areApiProposalsCompatible(extensionIdentifier, getEnabledApiProposals(version))
				) {
					validVersions.push(version);
				}
			} catch (error) { /* Ignore error and skip version */ }
		}));

		const result: IGalleryExtensionVersion[] = [];
		const seen = new Set<string>();
		for (const version of sortExtensionVersions(validVersions, targetPlatform)) {
			if (!seen.has(version.version)) {
				seen.add(version.version);
				result.push({ version: version.version, date: version.lastUpdated, isPreReleaseVersion: isPreReleaseVersion(version) });
			}
		}

		return result;
	}

	private async getAsset(extension: string, asset: IGalleryExtensionAsset, assetType: string, extensionVersion: string, options: IRequestOptions = {}, token: CancellationToken = CancellationToken.None): Promise<IRequestContext> {
		const commonHeaders = await this.commonHeadersPromise;
		const baseOptions = { type: 'GET' };
		const headers = { ...commonHeaders, ...(options.headers || {}) };
		options = { ...options, ...baseOptions, headers };

		const url = asset.uri;
		const fallbackUrl = asset.fallbackUri;
		const firstOptions = { ...options, url };

		try {
			const context = await this.requestService.request(firstOptions, token);
			if (context.res.statusCode === 200) {
				return context;
			}
			const message = await asTextOrError(context);
			throw new Error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`);
		} catch (err) {
			if (isCancellationError(err)) {
				throw err;
			}

			const message = getErrorMessage(err);
			type GalleryServiceCDNFallbackClassification = {
				owner: 'sandy081';
				comment: 'Fallback request information when the primary asset request to CDN fails';
				extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'extension name' };
				assetType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'asset that failed' };
				message: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'error message' };
				extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'version' };
			};
			type GalleryServiceCDNFallbackEvent = {
				extension: string;
				assetType: string;
				message: string;
				extensionVersion: string;
			};
			this.telemetryService.publicLog2<GalleryServiceCDNFallbackEvent, GalleryServiceCDNFallbackClassification>('galleryService:cdnFallback', { extension, assetType, message, extensionVersion });

			const fallbackOptions = { ...options, url: fallbackUrl };
			return this.requestService.request(fallbackOptions, token);
		}
	}

	private async getEngine(extension: string, rawExtensionVersion: IRawGalleryExtensionVersion): Promise<string> {
		let engine = getEngine(rawExtensionVersion);
		if (!engine) {
			type GalleryServiceEngineFallbackClassification = {
				owner: 'sandy081';
				comment: 'Fallback request when engine is not found in properties of an extension version';
				extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'extension name' };
				extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'version' };
			};
			type GalleryServiceEngineFallbackEvent = {
				extension: string;
				extensionVersion: string;
			};
			this.telemetryService.publicLog2<GalleryServiceEngineFallbackEvent, GalleryServiceEngineFallbackClassification>('galleryService:engineFallback', { extension, extensionVersion: rawExtensionVersion.version });
			const manifest = await this.getManifestFromRawExtensionVersion(extension, rawExtensionVersion, CancellationToken.None);
			if (!manifest) {
				throw new Error('Manifest was not found');
			}
			engine = manifest.engines.vscode;
		}
		return engine;
	}

	async getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
		if (!this.isEnabled()) {
			throw new Error('No extension gallery service configured.');
		}

		if (!this.extensionsControlUrl) {
			return { malicious: [], deprecated: {}, search: [] };
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: this.extensionsControlUrl,
			timeout: 10000 /*10s*/
		}, CancellationToken.None);

		if (context.res.statusCode !== 200) {
			throw new Error('Could not get extensions report.');
		}

		const result = await asJson<IRawExtensionsControlManifest>(context);
		const malicious: Array<IExtensionIdentifier | string> = [];
		const deprecated: IStringDictionary<IDeprecationInfo> = {};
		const search: ISearchPrefferedResults[] = [];
		const extensionsEnabledWithPreRelease: string[] = [];
		if (result) {
			for (const id of result.malicious) {
				if (EXTENSION_IDENTIFIER_REGEX.test(id)) {
					malicious.push({ id });
				} else {
					malicious.push(id);
				}
			}
			if (result.migrateToPreRelease) {
				for (const [unsupportedPreReleaseExtensionId, preReleaseExtensionInfo] of Object.entries(result.migrateToPreRelease)) {
					if (!preReleaseExtensionInfo.engine || isEngineValid(preReleaseExtensionInfo.engine, this.productService.version, this.productService.date)) {
						deprecated[unsupportedPreReleaseExtensionId.toLowerCase()] = {
							disallowInstall: true,
							extension: {
								id: preReleaseExtensionInfo.id,
								displayName: preReleaseExtensionInfo.displayName,
								autoMigrate: { storage: !!preReleaseExtensionInfo.migrateStorage },
								preRelease: true
							}
						};
					}
				}
			}
			if (result.deprecated) {
				for (const [deprecatedExtensionId, deprecationInfo] of Object.entries(result.deprecated)) {
					if (deprecationInfo) {
						deprecated[deprecatedExtensionId.toLowerCase()] = isBoolean(deprecationInfo) ? {} : deprecationInfo;
					}
				}
			}
			if (result.search) {
				for (const s of result.search) {
					search.push(s);
				}
			}
			if (Array.isArray(result.extensionsEnabledWithPreRelease)) {
				for (const id of result.extensionsEnabledWithPreRelease) {
					extensionsEnabledWithPreRelease.push(id.toLowerCase());
				}
			}
		}

		return { malicious, deprecated, search, extensionsEnabledWithPreRelease };
	}
}

export class ExtensionGalleryService extends AbstractExtensionGalleryService {

	constructor(
		@IStorageService storageService: IStorageService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAllowedExtensionsService allowedExtensionsService: IAllowedExtensionsService,
	) {
		super(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService);
	}
}

export class ExtensionGalleryServiceWithNoStorageService extends AbstractExtensionGalleryService {

	constructor(
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAllowedExtensionsService allowedExtensionsService: IAllowedExtensionsService,
	) {
		super(undefined, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService);
	}
}
