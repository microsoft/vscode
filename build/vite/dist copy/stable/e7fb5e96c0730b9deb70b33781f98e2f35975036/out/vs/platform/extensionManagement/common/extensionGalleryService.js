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
import { distinct } from '../../../base/common/arrays.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import * as semver from '../../../base/common/semver/semver.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../base/common/errors.js';
import { isWeb, platform } from '../../../base/common/platform.js';
import { arch } from '../../../base/common/process.js';
import { isBoolean, isNumber, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { isOfflineError } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { getTargetPlatform, isNotWebExtensionInWebTargetPlatform, isTargetPlatformCompatible, toTargetPlatform, WEB_EXTENSION_TAG, ExtensionGalleryError, IAllowedExtensionsService, EXTENSION_IDENTIFIER_REGEX, ExtensionRequestsTimeoutConfigKey } from './extensionManagement.js';
import { adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId, getGalleryExtensionTelemetryData } from './extensionManagementUtil.js';
import { areApiProposalsCompatible, isEngineValid } from '../../extensions/common/extensionValidator.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, asTextOrError, IRequestService, isClientError, isServerError, isSuccess } from '../../request/common/request.js';
import { resolveMarketplaceHeaders } from '../../externalServices/common/marketplace.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { format2 } from '../../../base/common/strings.js';
import { getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService } from './extensionGalleryManifest.js';
import { TelemetryTrustedValue } from '../../telemetry/common/telemetryUtils.js';
const CURRENT_TARGET_PLATFORM = isWeb ? "web" /* TargetPlatform.WEB */ : getTargetPlatform(platform, arch);
const SEARCH_ACTIVITY_HEADER_NAME = 'X-Market-Search-Activity-Id';
const ACTIVITY_HEADER_NAME = 'Activityid';
const SERVER_HEADER_NAME = 'Server';
const END_END_ID_HEADER_NAME = 'X-Vss-E2eid';
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
    Private: 'PrivateMarketplace',
};
const DefaultPageSize = 10;
const DefaultQueryState = {
    pageNumber: 1,
    pageSize: DefaultPageSize,
    sortBy: "NoneOrRelevance" /* SortBy.NoneOrRelevance */,
    sortOrder: 0 /* SortOrder.Default */,
    flags: [],
    criteria: [],
    assetTypes: []
};
var VersionKind;
(function (VersionKind) {
    VersionKind[VersionKind["Release"] = 0] = "Release";
    VersionKind[VersionKind["Prerelease"] = 1] = "Prerelease";
    VersionKind[VersionKind["Latest"] = 2] = "Latest";
})(VersionKind || (VersionKind = {}));
class Query {
    constructor(state = DefaultQueryState) {
        this.state = state;
    }
    get pageNumber() { return this.state.pageNumber; }
    get pageSize() { return this.state.pageSize; }
    get sortBy() { return this.state.sortBy; }
    get sortOrder() { return this.state.sortOrder; }
    get flags() { return this.state.flags; }
    get criteria() { return this.state.criteria; }
    get assetTypes() { return this.state.assetTypes; }
    get source() { return this.state.source; }
    get searchText() {
        const criterium = this.state.criteria.filter(criterium => criterium.filterType === "SearchText" /* FilterType.SearchText */)[0];
        return criterium && criterium.value ? criterium.value : '';
    }
    withPage(pageNumber, pageSize = this.state.pageSize) {
        return new Query({ ...this.state, pageNumber, pageSize });
    }
    withFilter(filterType, ...values) {
        const criteria = [
            ...this.state.criteria,
            ...values.length ? values.map(value => ({ filterType, value })) : [{ filterType }]
        ];
        return new Query({ ...this.state, criteria });
    }
    withSortBy(sortBy) {
        return new Query({ ...this.state, sortBy });
    }
    withSortOrder(sortOrder) {
        return new Query({ ...this.state, sortOrder });
    }
    withFlags(...flags) {
        return new Query({ ...this.state, flags: distinct(flags) });
    }
    withAssetTypes(...assetTypes) {
        return new Query({ ...this.state, assetTypes });
    }
    withSource(source) {
        return new Query({ ...this.state, source });
    }
}
function getStatistic(statistics, name) {
    const result = (statistics || []).filter(s => s.statisticName === name)[0];
    return result ? result.value : 0;
}
function getCoreTranslationAssets(version) {
    const coreTranslationAssetPrefix = 'Microsoft.VisualStudio.Code.Translation.';
    const result = version.files.filter(f => f.assetType.indexOf(coreTranslationAssetPrefix) === 0);
    return result.reduce((result, file) => {
        const asset = getVersionAsset(version, file.assetType);
        if (asset) {
            result.push([file.assetType.substring(coreTranslationAssetPrefix.length), asset]);
        }
        return result;
    }, []);
}
function getRepositoryAsset(version) {
    if (version.properties) {
        const results = version.properties.filter(p => p.key === AssetType.Repository);
        const gitRegExp = new RegExp('((git|ssh|http(s)?)|(git@[\\w.]+))(:(//)?)([\\w.@:/\\-~]+)(.git)(/)?');
        const uri = results.filter(r => gitRegExp.test(r.value))[0];
        return uri ? { uri: uri.value, fallbackUri: uri.value } : null;
    }
    return getVersionAsset(version, AssetType.Repository);
}
function getDownloadAsset(version) {
    return {
        // always use fallbackAssetUri for download asset to hit the Marketplace API so that downloads are counted
        uri: `${version.fallbackAssetUri}/${AssetType.VSIX}?redirect=true${version.targetPlatform ? `&targetPlatform=${version.targetPlatform}` : ''}`,
        fallbackUri: `${version.fallbackAssetUri}/${AssetType.VSIX}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ''}`
    };
}
function getVersionAsset(version, type) {
    const result = version.files.filter(f => f.assetType === type)[0];
    return result ? {
        uri: `${version.assetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ''}`,
        fallbackUri: `${version.fallbackAssetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ''}`
    } : null;
}
function getExtensions(version, property) {
    const values = version.properties ? version.properties.filter(p => p.key === property) : [];
    const value = values.length > 0 && values[0].value;
    return value ? value.split(',').map(v => adoptToGalleryExtensionId(v)) : [];
}
function getEngine(version) {
    const values = version.properties ? version.properties.filter(p => p.key === PropertyType.Engine) : [];
    return (values.length > 0 && values[0].value) || '';
}
function setEngine(version, engine) {
    version.properties = version.properties ?? [];
    version.properties.push({ key: PropertyType.Engine, value: engine });
}
function isPreReleaseVersion(version) {
    const values = version.properties ? version.properties.filter(p => p.key === PropertyType.PreRelease) : [];
    return values.length > 0 && values[0].value === 'true';
}
function hasPreReleaseForExtension(id, productService) {
    return productService.extensionProperties?.[id.toLowerCase()]?.hasPrereleaseVersion;
}
function getExcludeVersionRangeForExtension(id, productService) {
    return productService.extensionProperties?.[id.toLowerCase()]?.excludeVersionRange;
}
function isPrivateExtension(version) {
    const values = version.properties ? version.properties.filter(p => p.key === PropertyType.Private) : [];
    return values.length > 0 && values[0].value === 'true';
}
function executesCode(version) {
    const values = version.properties ? version.properties.filter(p => p.key === PropertyType.ExecutesCode) : [];
    return values.length > 0 ? values[0].value === 'true' : undefined;
}
function getEnabledApiProposals(version) {
    const values = version.properties ? version.properties.filter(p => p.key === PropertyType.EnabledApiProposals) : [];
    const value = (values.length > 0 && values[0].value) || '';
    return value ? value.split(',') : [];
}
function getLocalizedLanguages(version) {
    const values = version.properties ? version.properties.filter(p => p.key === PropertyType.LocalizedLanguages) : [];
    const value = (values.length > 0 && values[0].value) || '';
    return value ? value.split(',') : [];
}
function getSponsorLink(version) {
    return version.properties?.find(p => p.key === PropertyType.SponsorLink)?.value;
}
function getSupportLink(version) {
    return version.properties?.find(p => p.key === PropertyType.SupportLink)?.value;
}
function getIsPreview(flags) {
    return flags.indexOf('preview') !== -1;
}
function getTargetPlatformForExtensionVersion(version) {
    return version.targetPlatform ? toTargetPlatform(version.targetPlatform) : "undefined" /* TargetPlatform.UNDEFINED */;
}
function getAllTargetPlatforms(rawGalleryExtension) {
    const allTargetPlatforms = distinct(rawGalleryExtension.versions.map(getTargetPlatformForExtensionVersion));
    // Is a web extension only if it has WEB_EXTENSION_TAG
    const isWebExtension = !!rawGalleryExtension.tags?.includes(WEB_EXTENSION_TAG);
    // Include Web Target Platform only if it is a web extension
    const webTargetPlatformIndex = allTargetPlatforms.indexOf("web" /* TargetPlatform.WEB */);
    if (isWebExtension) {
        if (webTargetPlatformIndex === -1) {
            // Web extension but does not has web target platform -> add it
            allTargetPlatforms.push("web" /* TargetPlatform.WEB */);
        }
    }
    else {
        if (webTargetPlatformIndex !== -1) {
            // Not a web extension but has web target platform -> remove it
            allTargetPlatforms.splice(webTargetPlatformIndex, 1);
        }
    }
    return allTargetPlatforms;
}
export function sortExtensionVersions(versions, preferredTargetPlatform) {
    /* It is expected that versions from Marketplace are sorted by version. So we are just sorting by preferred targetPlatform */
    for (let index = 0; index < versions.length; index++) {
        const version = versions[index];
        if (version.version === versions[index - 1]?.version) {
            let insertionIndex = index;
            const versionTargetPlatform = getTargetPlatformForExtensionVersion(version);
            /* put it at the beginning */
            if (versionTargetPlatform === preferredTargetPlatform) {
                while (insertionIndex > 0 && versions[insertionIndex - 1].version === version.version) {
                    insertionIndex--;
                }
            }
            if (insertionIndex !== index) {
                versions.splice(index, 1);
                versions.splice(insertionIndex, 0, version);
            }
        }
    }
    return versions;
}
/**
 * Filters extension versions to return only the relevant versions for a given target platform.
 *
 * This function processes a list of extension versions (expected to be sorted by version descending)
 * and returns a filtered list containing:
 * 1. All versions that are NOT compatible with the target platform (for other platforms)
 * 2. At most one compatible release version (the first/latest one encountered)
 * 3. At most one compatible pre-release version (the first/latest one encountered)
 *
 * When a platform-specific version (exactly matching targetPlatform) is encountered with the same
 * version number as a previously stored universal/undefined version, it replaces that version.
 * This ensures platform-specific builds are preferred over universal builds for the same version.
 *
 * @param versions - Array of extension versions, expected to be sorted by version number descending
 * @param targetPlatform - The target platform to filter for (e.g., LINUX_X64, WIN32_X64)
 * @param allTargetPlatforms - All target platforms the extension supports
 * @returns Filtered array of versions relevant for the target platform
 */
export function filterLatestExtensionVersionsForTargetPlatform(versions, targetPlatform, allTargetPlatforms) {
    const latestVersions = [];
    let preReleaseVersionIndex = -1;
    let releaseVersionIndex = -1;
    for (const version of versions) {
        const versionTargetPlatform = getTargetPlatformForExtensionVersion(version);
        const isCompatibleWithTargetPlatform = isTargetPlatformCompatible(versionTargetPlatform, allTargetPlatforms, targetPlatform);
        // Always include versions that are NOT compatible with the target platform
        if (!isCompatibleWithTargetPlatform) {
            latestVersions.push(version);
            continue;
        }
        // For compatible versions, only include the first (latest) of each type
        // Prefer specific target platform matches over undefined/universal platforms only when version numbers are the same
        if (isPreReleaseVersion(version)) {
            if (preReleaseVersionIndex === -1) {
                preReleaseVersionIndex = latestVersions.length;
                latestVersions.push(version);
            }
            else if (versionTargetPlatform === targetPlatform && latestVersions[preReleaseVersionIndex].version === version.version) {
                latestVersions[preReleaseVersionIndex] = version;
            }
        }
        else {
            if (releaseVersionIndex === -1) {
                releaseVersionIndex = latestVersions.length;
                latestVersions.push(version);
            }
            else if (versionTargetPlatform === targetPlatform && latestVersions[releaseVersionIndex].version === version.version) {
                latestVersions[releaseVersionIndex] = version;
            }
        }
    }
    return latestVersions;
}
function setTelemetry(extension, index, querySource) {
    /* __GDPR__FRAGMENT__
    "GalleryExtensionTelemetryData2" : {
        "index" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
        "querySource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
        "queryActivityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
    }
    */
    extension.telemetryData = { index, querySource, queryActivityId: extension.queryContext?.[SEARCH_ACTIVITY_HEADER_NAME] };
}
function toExtension(galleryExtension, version, allTargetPlatforms, extensionGalleryManifest, productService, queryContext) {
    const latestVersion = galleryExtension.versions[0];
    const assets = {
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
    const detailsViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.linkType ?? "ExtensionDetailsViewUriTemplate" /* ExtensionGalleryResourceType.ExtensionDetailsViewUri */);
    const publisherViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.publisher.linkType ?? "PublisherViewUriTemplate" /* ExtensionGalleryResourceType.PublisherViewUri */);
    const ratingViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.ratingLinkType ?? "ExtensionRatingViewUriTemplate" /* ExtensionGalleryResourceType.ExtensionRatingViewUri */);
    const id = getGalleryExtensionId(galleryExtension.publisher.publisherName, galleryExtension.extensionName);
    return {
        type: 'gallery',
        identifier: {
            id,
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
        hasPreReleaseVersion: hasPreReleaseForExtension(id, productService) ?? isPreReleaseVersion(latestVersion),
        hasReleaseVersion: true,
        private: isPrivateExtension(latestVersion),
        preview: getIsPreview(galleryExtension.flags),
        isSigned: !!assets.signature,
        queryContext,
        supportLink: getSupportLink(latestVersion),
        detailsLink: detailsViewUri ? format2(detailsViewUri, { publisher: galleryExtension.publisher.publisherName, name: galleryExtension.extensionName }) : undefined,
        publisherLink: publisherViewUri ? format2(publisherViewUri, { publisher: galleryExtension.publisher.publisherName }) : undefined,
        ratingLink: ratingViewUri ? format2(ratingViewUri, { publisher: galleryExtension.publisher.publisherName, name: galleryExtension.extensionName }) : undefined,
    };
}
let AbstractExtensionGalleryService = class AbstractExtensionGalleryService {
    constructor(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
        this.requestService = requestService;
        this.logService = logService;
        this.environmentService = environmentService;
        this.telemetryService = telemetryService;
        this.fileService = fileService;
        this.productService = productService;
        this.configurationService = configurationService;
        this.allowedExtensionsService = allowedExtensionsService;
        this.extensionGalleryManifestService = extensionGalleryManifestService;
        this.extensionsControlUrl = productService.extensionsGallery?.controlUrl;
        this.unpkgResourceApi = productService.extensionsGallery?.extensionUrlTemplate;
        this.extensionsEnabledWithApiProposalVersion = productService.extensionsEnabledWithApiProposalVersion?.map(id => id.toLowerCase()) ?? [];
        this.commonHeadersPromise = resolveMarketplaceHeaders(productService.version, productService, this.environmentService, this.configurationService, this.fileService, storageService, this.telemetryService);
    }
    isEnabled() {
        return this.extensionGalleryManifestService.extensionGalleryManifestStatus === "available" /* ExtensionGalleryManifestStatus.Available */;
    }
    async getExtensions(extensionInfos, arg1, arg2) {
        const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
        if (!extensionGalleryManifest) {
            throw new Error('No extension gallery service configured.');
        }
        const options = CancellationToken.isCancellationToken(arg1) ? {} : arg1;
        const token = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2;
        const resourceApi = this.getResourceApi(extensionGalleryManifest);
        const result = resourceApi
            ? await this.getExtensionsUsingResourceApi(extensionInfos, options, resourceApi, extensionGalleryManifest, token)
            : await this.getExtensionsUsingQueryApi(extensionInfos, options, extensionGalleryManifest, token);
        const uuids = result.map(r => r.identifier.uuid);
        const extensionInfosByName = [];
        for (const e of extensionInfos) {
            if (e.uuid && !uuids.includes(e.uuid)) {
                extensionInfosByName.push({ ...e, uuid: undefined });
            }
        }
        if (extensionInfosByName.length) {
            // report telemetry data for additional query
            this.telemetryService.publicLog2('galleryService:additionalQueryByName', {
                count: extensionInfosByName.length
            });
            const extensions = await this.getExtensionsUsingQueryApi(extensionInfosByName, options, extensionGalleryManifest, token);
            result.push(...extensions);
        }
        return result;
    }
    getResourceApi(extensionGalleryManifest) {
        const latestVersionResource = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, "ExtensionLatestVersionUriTemplate" /* ExtensionGalleryResourceType.ExtensionLatestVersionUri */);
        if (latestVersionResource) {
            return {
                uri: latestVersionResource,
                fallback: this.unpkgResourceApi
            };
        }
        return undefined;
    }
    async getExtensionsUsingQueryApi(extensionInfos, options, extensionGalleryManifest, token) {
        const names = [], ids = [], includePreRelease = [], versions = [];
        let isQueryForReleaseVersionFromPreReleaseVersion = true;
        for (const extensionInfo of extensionInfos) {
            if (extensionInfo.uuid) {
                ids.push(extensionInfo.uuid);
            }
            else {
                names.push(extensionInfo.id);
            }
            if (extensionInfo.version) {
                versions.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, version: extensionInfo.version });
            }
            else {
                includePreRelease.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, includePreRelease: !!extensionInfo.preRelease });
            }
            isQueryForReleaseVersionFromPreReleaseVersion = isQueryForReleaseVersionFromPreReleaseVersion && (!!extensionInfo.hasPreRelease && !extensionInfo.preRelease);
        }
        if (!ids.length && !names.length) {
            return [];
        }
        let query = new Query().withPage(1, extensionInfos.length);
        if (ids.length) {
            query = query.withFilter("ExtensionId" /* FilterType.ExtensionId */, ...ids);
        }
        if (names.length) {
            query = query.withFilter("ExtensionName" /* FilterType.ExtensionName */, ...names);
        }
        if (options.queryAllVersions) {
            query = query.withFlags(...query.flags, "IncludeVersions" /* Flag.IncludeVersions */);
        }
        if (options.source) {
            query = query.withSource(options.source);
        }
        const { extensions } = await this.queryGalleryExtensions(query, {
            targetPlatform: options.targetPlatform ?? CURRENT_TARGET_PLATFORM,
            includePreRelease,
            versions,
            compatible: !!options.compatible,
            productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date },
            isQueryForReleaseVersionFromPreReleaseVersion
        }, extensionGalleryManifest, token);
        if (options.source) {
            extensions.forEach((e, index) => setTelemetry(e, index, options.source));
        }
        return extensions;
    }
    async getExtensionsUsingResourceApi(extensionInfos, options, resourceApi, extensionGalleryManifest, token) {
        const result = [];
        const toQuery = [];
        const toFetchLatest = [];
        for (const extensionInfo of extensionInfos) {
            if (!EXTENSION_IDENTIFIER_REGEX.test(extensionInfo.id)) {
                continue;
            }
            if (extensionInfo.version) {
                toQuery.push(extensionInfo);
            }
            else {
                toFetchLatest.push(extensionInfo);
            }
        }
        await Promise.all(toFetchLatest.map(async (extensionInfo) => {
            let galleryExtension;
            try {
                galleryExtension = await this.getLatestGalleryExtension(extensionInfo, options, resourceApi, extensionGalleryManifest, token);
                if (isString(galleryExtension)) {
                    // fallback to query
                    this.telemetryService.publicLog2('galleryService:fallbacktoquery', {
                        extension: extensionInfo.id,
                        preRelease: !!extensionInfo.preRelease,
                        compatible: !!options.compatible,
                        errorCode: galleryExtension
                    });
                    toQuery.push(extensionInfo);
                }
                else {
                    result.push(galleryExtension);
                }
            }
            catch (error) {
                if (error instanceof ExtensionGalleryError) {
                    switch (error.code) {
                        case "Offline" /* ExtensionGalleryErrorCode.Offline */:
                        case "Cancelled" /* ExtensionGalleryErrorCode.Cancelled */:
                        case "Timeout" /* ExtensionGalleryErrorCode.Timeout */:
                            throw error;
                    }
                }
                // fallback to query
                this.logService.error(`Error while getting the latest version for the extension ${extensionInfo.id}.`, getErrorMessage(error));
                this.telemetryService.publicLog2('galleryService:fallbacktoquery', {
                    extension: extensionInfo.id,
                    preRelease: !!extensionInfo.preRelease,
                    compatible: !!options.compatible,
                    errorCode: error instanceof ExtensionGalleryError ? error.code : 'Unknown'
                });
                toQuery.push(extensionInfo);
            }
        }));
        if (toQuery.length) {
            const extensions = await this.getExtensionsUsingQueryApi(toQuery, options, extensionGalleryManifest, token);
            result.push(...extensions);
        }
        return result;
    }
    async getLatestGalleryExtension(extensionInfo, options, resourceApi, extensionGalleryManifest, token) {
        const rawGalleryExtension = await this.getLatestRawGalleryExtensionWithFallback(extensionInfo, resourceApi, token);
        if (!rawGalleryExtension) {
            return 'NOT_FOUND';
        }
        const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
        const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersionFromLatestVersions(rawGalleryExtension, rawGalleryExtension.versions, extensionInfo, options, allTargetPlatforms);
        if (!rawGalleryExtensionVersion) {
            return 'NOT_COMPATIBLE';
        }
        return toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService);
    }
    async getValidRawGalleryExtensionVersionFromLatestVersions(rawGalleryExtension, latestVersions, extensionInfo, options, allTargetPlatforms) {
        const targetPlatform = options.targetPlatform ?? CURRENT_TARGET_PLATFORM;
        const latestExtensionVersionsForTargetPlatform = filterLatestExtensionVersionsForTargetPlatform(latestVersions, targetPlatform, allTargetPlatforms);
        // First, find a valid version matching the requested type (pre-release or release)
        const result = await this.getValidRawGalleryExtensionVersion(rawGalleryExtension, latestExtensionVersionsForTargetPlatform, {
            targetPlatform,
            compatible: !!options.compatible,
            productVersion: options.productVersion ?? {
                version: this.productService.version,
                date: this.productService.date
            },
            version: extensionInfo.preRelease ? 1 /* VersionKind.Prerelease */ : 0 /* VersionKind.Release */
        }, allTargetPlatforms);
        // For release version requests, simply return the found release version
        if (!extensionInfo.preRelease) {
            return result;
        }
        // For pre-release version requests, we need to consider both pre-release and release versions
        const prereleaseVersion = result;
        const releaseVersion = await this.getValidRawGalleryExtensionVersion(rawGalleryExtension, latestExtensionVersionsForTargetPlatform, {
            targetPlatform,
            compatible: !!options.compatible,
            productVersion: options.productVersion ?? {
                version: this.productService.version,
                date: this.productService.date
            },
            version: 0 /* VersionKind.Release */
        }, allTargetPlatforms);
        // When both versions exist, return whichever has the higher version number
        if (prereleaseVersion && releaseVersion) {
            return semver.gt(releaseVersion.version, prereleaseVersion.version) ? releaseVersion : prereleaseVersion;
        }
        // Special handling for compatible version requests
        if (options.compatible) {
            // If we have a compatible release version, check if it's better than any pre-release
            if (releaseVersion) {
                // Check if there exists any pre-release version (ignoring compatibility)
                const anyPrereleaseVersion = await this.getValidRawGalleryExtensionVersion(rawGalleryExtension, latestExtensionVersionsForTargetPlatform, {
                    targetPlatform,
                    compatible: false,
                    productVersion: options.productVersion ?? {
                        version: this.productService.version,
                        date: this.productService.date
                    },
                    version: 1 /* VersionKind.Prerelease */
                }, allTargetPlatforms);
                // If no pre-release exists or the release version is greater, prefer the compatible release
                // This ensures users get a stable compatible version when pre-releases aren't newer or compatible
                if (!anyPrereleaseVersion || semver.gt(releaseVersion.version, anyPrereleaseVersion.version)) {
                    return releaseVersion;
                }
            }
            return prereleaseVersion;
        }
        // Return pre-release if available, otherwise release, otherwise null
        return prereleaseVersion ?? releaseVersion ?? null;
    }
    async getCompatibleExtension(extension, includePreRelease, targetPlatform, productVersion = { version: this.productService.version, date: this.productService.date }) {
        if (isNotWebExtensionInWebTargetPlatform(extension.allTargetPlatforms, targetPlatform)) {
            return null;
        }
        if (await this.isExtensionCompatible(extension, includePreRelease, targetPlatform)) {
            return extension;
        }
        if (this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName }) !== true) {
            return null;
        }
        const result = await this.getExtensions([{
                ...extension.identifier,
                preRelease: includePreRelease,
                hasPreRelease: extension.hasPreReleaseVersion,
            }], {
            compatible: true,
            productVersion,
            queryAllVersions: true,
            targetPlatform,
        }, CancellationToken.None);
        return result[0] ?? null;
    }
    async isExtensionCompatible(extension, includePreRelease, targetPlatform, productVersion = { version: this.productService.version, date: this.productService.date }) {
        return this.isValidVersion({
            id: extension.identifier.id,
            version: extension.version,
            isPreReleaseVersion: extension.properties.isPreReleaseVersion,
            targetPlatform: extension.properties.targetPlatform,
            manifestAsset: extension.assets.manifest,
            engine: extension.properties.engine,
            enabledApiProposals: extension.properties.enabledApiProposals
        }, {
            targetPlatform,
            compatible: true,
            productVersion,
            version: includePreRelease ? 2 /* VersionKind.Latest */ : 0 /* VersionKind.Release */
        }, extension.publisherDisplayName, extension.allTargetPlatforms);
    }
    async isValidVersion(extension, { targetPlatform, compatible, productVersion, version }, publisherDisplayName, allTargetPlatforms) {
        const hasPreRelease = hasPreReleaseForExtension(extension.id, this.productService);
        const excludeVersionRange = getExcludeVersionRangeForExtension(extension.id, this.productService);
        if (extension.isPreReleaseVersion && hasPreRelease === false /* Skip if hasPreRelease is not defined for this extension */) {
            return false;
        }
        if (excludeVersionRange && semver.satisfies(extension.version, excludeVersionRange)) {
            return false;
        }
        // Specific version
        if (isString(version)) {
            if (extension.version !== version) {
                return false;
            }
        }
        // Prerelease or release version kind
        else if (version === 0 /* VersionKind.Release */ || version === 1 /* VersionKind.Prerelease */) {
            if (extension.isPreReleaseVersion !== (version === 1 /* VersionKind.Prerelease */)) {
                return false;
            }
        }
        if (targetPlatform && !isTargetPlatformCompatible(extension.targetPlatform, allTargetPlatforms, targetPlatform)) {
            return false;
        }
        if (compatible) {
            if (this.allowedExtensionsService.isAllowed({ id: extension.id, publisherDisplayName, version: extension.version, prerelease: extension.isPreReleaseVersion, targetPlatform: extension.targetPlatform }) !== true) {
                return false;
            }
            if (!this.areApiProposalsCompatible(extension.id, extension.enabledApiProposals)) {
                return false;
            }
            if (!(await this.isEngineValid(extension.id, extension.version, extension.engine, extension.manifestAsset, productVersion))) {
                return false;
            }
        }
        return true;
    }
    areApiProposalsCompatible(extensionId, enabledApiProposals) {
        if (!enabledApiProposals) {
            return true;
        }
        if (!this.extensionsEnabledWithApiProposalVersion.includes(extensionId.toLowerCase())) {
            return true;
        }
        return areApiProposalsCompatible(enabledApiProposals);
    }
    async isEngineValid(extensionId, version, engine, manifestAsset, productVersion) {
        if (!engine) {
            try {
                engine = await this.getEngine(extensionId, version, manifestAsset);
            }
            catch (error) {
                this.logService.error(`Error while getting the engine for the version ${version}.`, getErrorMessage(error));
                return false;
            }
        }
        if (!engine) {
            this.logService.error(`Missing engine for the extension ${extensionId} with version ${version}`);
            return false;
        }
        return isEngineValid(engine, productVersion.version, productVersion.date);
    }
    async getEngine(extensionId, version, manifestAsset) {
        if (!manifestAsset) {
            this.logService.error(`Missing engine and manifest asset for the extension ${extensionId} with version ${version}`);
            return undefined;
        }
        try {
            this.telemetryService.publicLog2('galleryService:engineFallback', { extension: extensionId, extensionVersion: version });
            const headers = { 'Accept-Encoding': 'gzip' };
            const context = await this.getAsset(extensionId, manifestAsset, AssetType.Manifest, version, 'extensionGalleryService.engineVersion', { headers });
            const manifest = await asJson(context);
            if (!manifest) {
                this.logService.error(`Manifest was not found for the extension ${extensionId} with version ${version}`);
                return undefined;
            }
            return manifest.engines.vscode;
        }
        catch (error) {
            this.logService.error(`Error while getting the engine for the version ${version}.`, getErrorMessage(error));
            return undefined;
        }
    }
    async query(options, token) {
        const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
        if (!extensionGalleryManifest) {
            throw new Error('No extension gallery service configured.');
        }
        let text = options.text || '';
        const pageSize = options.pageSize ?? 50;
        let query = new Query()
            .withPage(1, pageSize);
        if (text) {
            // Use category filter instead of "category:themes"
            text = text.replace(/\bcategory:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategory, category) => {
                query = query.withFilter("Category" /* FilterType.Category */, category || quotedCategory);
                return '';
            });
            // Use tag filter instead of "tag:debuggers"
            text = text.replace(/\btag:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedTag, tag) => {
                query = query.withFilter("Tag" /* FilterType.Tag */, tag || quotedTag);
                return '';
            });
            // Use featured filter
            text = text.replace(/\bfeatured(\s+|\b|$)/g, () => {
                query = query.withFilter("Featured" /* FilterType.Featured */);
                return '';
            });
            text = text.trim();
            if (text) {
                text = text.length < 200 ? text : text.substring(0, 200);
                query = query.withFilter("SearchText" /* FilterType.SearchText */, text);
            }
            if (extensionGalleryManifest.capabilities.extensionQuery.sorting?.some(c => c.name === "NoneOrRelevance" /* SortBy.NoneOrRelevance */)) {
                query = query.withSortBy("NoneOrRelevance" /* SortBy.NoneOrRelevance */);
            }
        }
        else {
            if (extensionGalleryManifest.capabilities.extensionQuery.sorting?.some(c => c.name === "InstallCount" /* SortBy.InstallCount */)) {
                query = query.withSortBy("InstallCount" /* SortBy.InstallCount */);
            }
        }
        if (options.sortBy && extensionGalleryManifest.capabilities.extensionQuery.sorting?.some(c => c.name === options.sortBy)) {
            query = query.withSortBy(options.sortBy);
        }
        if (typeof options.sortOrder === 'number') {
            query = query.withSortOrder(options.sortOrder);
        }
        if (options.source) {
            query = query.withSource(options.source);
        }
        const runQuery = async (query, token) => {
            const { extensions, total } = await this.queryGalleryExtensions(query, { targetPlatform: CURRENT_TARGET_PLATFORM, compatible: false, includePreRelease: !!options.includePreRelease, productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date } }, extensionGalleryManifest, token);
            const result = [];
            let defaultChatAgentExtension;
            for (let index = 0; index < extensions.length; index++) {
                const extension = extensions[index];
                setTelemetry(extension, ((query.pageNumber - 1) * query.pageSize) + index, options.source);
                if (areSameExtensions(extension.identifier, { id: this.productService.defaultChatAgent.extensionId, })) {
                    defaultChatAgentExtension = extension;
                }
                else {
                    result.push(extension);
                }
            }
            if (defaultChatAgentExtension) {
                result.push(defaultChatAgentExtension);
            }
            return { extensions: result, total };
        };
        const { extensions, total } = await runQuery(query, token);
        const getPage = async (pageIndex, ct) => {
            if (ct.isCancellationRequested) {
                throw new CancellationError();
            }
            const { extensions } = await runQuery(query.withPage(pageIndex + 1), ct);
            return extensions;
        };
        return { firstPage: extensions, total, pageSize: query.pageSize, getPage };
    }
    async queryGalleryExtensions(query, criteria, extensionGalleryManifest, token) {
        const flags = query.flags;
        /**
         * If both version flags (IncludeLatestVersionOnly and IncludeVersions) are included, then only include latest versions (IncludeLatestVersionOnly) flag.
         */
        if (query.flags.includes("IncludeLatestVersionOnly" /* Flag.IncludeLatestVersionOnly */) && query.flags.includes("IncludeVersions" /* Flag.IncludeVersions */)) {
            query = query.withFlags(...query.flags.filter(flag => flag !== "IncludeVersions" /* Flag.IncludeVersions */));
        }
        /**
         * If version flags (IncludeLatestVersionOnly and IncludeVersions) are not included, default is to query for latest versions (IncludeLatestVersionOnly).
         */
        if (!query.flags.includes("IncludeLatestVersionOnly" /* Flag.IncludeLatestVersionOnly */) && !query.flags.includes("IncludeVersions" /* Flag.IncludeVersions */)) {
            query = query.withFlags(...query.flags, "IncludeLatestVersionOnly" /* Flag.IncludeLatestVersionOnly */);
        }
        /**
         * If versions criteria exist or every requested extension is for release version and has a pre-release version, then remove latest flags and add all versions flag.
         */
        if (criteria.versions?.length || criteria.isQueryForReleaseVersionFromPreReleaseVersion) {
            query = query.withFlags(...query.flags.filter(flag => flag !== "IncludeLatestVersionOnly" /* Flag.IncludeLatestVersionOnly */), "IncludeVersions" /* Flag.IncludeVersions */);
        }
        /**
         * Add necessary extension flags
         */
        query = query.withFlags(...query.flags, "IncludeAssetUri" /* Flag.IncludeAssetUri */, "IncludeCategoryAndTags" /* Flag.IncludeCategoryAndTags */, "IncludeFiles" /* Flag.IncludeFiles */, "IncludeStatistics" /* Flag.IncludeStatistics */, "IncludeVersionProperties" /* Flag.IncludeVersionProperties */);
        const { galleryExtensions: rawGalleryExtensions, total, context } = await this.queryRawGalleryExtensions(query, extensionGalleryManifest, token);
        const hasAllVersions = !query.flags.includes("IncludeLatestVersionOnly" /* Flag.IncludeLatestVersionOnly */);
        if (hasAllVersions) {
            const extensions = [];
            for (const rawGalleryExtension of rawGalleryExtensions) {
                const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
                const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
                const includePreRelease = isBoolean(criteria.includePreRelease) ? criteria.includePreRelease : !!criteria.includePreRelease.find(extensionIdentifierWithPreRelease => areSameExtensions(extensionIdentifierWithPreRelease, extensionIdentifier))?.includePreRelease;
                const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersion(rawGalleryExtension, rawGalleryExtension.versions, {
                    compatible: criteria.compatible,
                    targetPlatform: criteria.targetPlatform,
                    productVersion: criteria.productVersion,
                    version: criteria.versions?.find(extensionIdentifierWithVersion => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version
                        ?? (includePreRelease ? 2 /* VersionKind.Latest */ : 0 /* VersionKind.Release */)
                }, allTargetPlatforms);
                if (rawGalleryExtensionVersion) {
                    extensions.push(toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService, context));
                }
            }
            return { extensions, total };
        }
        const result = [];
        const needAllVersions = new Map();
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
            const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersion(rawGalleryExtension, rawGalleryExtension.versions, {
                compatible: criteria.compatible,
                targetPlatform: criteria.targetPlatform,
                productVersion: criteria.productVersion,
                version: criteria.versions?.find(extensionIdentifierWithVersion => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version
                    ?? (includePreRelease ? 2 /* VersionKind.Latest */ : 0 /* VersionKind.Release */)
            }, allTargetPlatforms);
            const extension = rawGalleryExtensionVersion ? toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService, context) : null;
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
                || (!extension.properties.isPreReleaseVersion && extension.properties.targetPlatform !== criteria.targetPlatform && extension.hasPreReleaseVersion)) {
                needAllVersions.set(rawGalleryExtension.extensionId, index);
            }
            else {
                result.push([index, extension]);
            }
        }
        if (needAllVersions.size) {
            const stopWatch = new StopWatch();
            const query = new Query()
                .withFlags(...flags.filter(flag => flag !== "IncludeLatestVersionOnly" /* Flag.IncludeLatestVersionOnly */), "IncludeVersions" /* Flag.IncludeVersions */)
                .withPage(1, needAllVersions.size)
                .withFilter("ExtensionId" /* FilterType.ExtensionId */, ...needAllVersions.keys());
            const { extensions } = await this.queryGalleryExtensions(query, criteria, extensionGalleryManifest, token);
            this.telemetryService.publicLog2('galleryService:additionalQuery', {
                duration: stopWatch.elapsed(),
                count: needAllVersions.size
            });
            for (const extension of extensions) {
                const index = needAllVersions.get(extension.identifier.uuid);
                result.push([index, extension]);
            }
        }
        return { extensions: result.sort((a, b) => a[0] - b[0]).map(([, extension]) => extension), total };
    }
    async getValidRawGalleryExtensionVersion(rawGalleryExtension, versions, criteria, allTargetPlatforms) {
        const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
        const rawGalleryExtensionVersions = sortExtensionVersions(versions, criteria.targetPlatform);
        if (criteria.compatible && isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, criteria.targetPlatform)) {
            return null;
        }
        const version = isString(criteria.version) ? criteria.version : undefined;
        for (let index = 0; index < rawGalleryExtensionVersions.length; index++) {
            const rawGalleryExtensionVersion = rawGalleryExtensionVersions[index];
            if (criteria.compatible) {
                await this.setEngineIfNotExists(extensionIdentifier.id, rawGalleryExtensionVersion);
            }
            if (await this.isValidVersion({
                id: extensionIdentifier.id,
                version: rawGalleryExtensionVersion.version,
                isPreReleaseVersion: isPreReleaseVersion(rawGalleryExtensionVersion),
                targetPlatform: getTargetPlatformForExtensionVersion(rawGalleryExtensionVersion),
                engine: getEngine(rawGalleryExtensionVersion),
                manifestAsset: getVersionAsset(rawGalleryExtensionVersion, AssetType.Manifest),
                enabledApiProposals: getEnabledApiProposals(rawGalleryExtensionVersion)
            }, criteria, rawGalleryExtension.publisher.displayName, allTargetPlatforms)) {
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
    async setEngineIfNotExists(extensionId, rawGalleryExtensionVersion) {
        if (getEngine(rawGalleryExtensionVersion)) {
            return;
        }
        try {
            const engine = await this.getEngine(extensionId, rawGalleryExtensionVersion.version, getVersionAsset(rawGalleryExtensionVersion, AssetType.Manifest));
            if (engine) {
                setEngine(rawGalleryExtensionVersion, engine);
            }
        }
        catch (error) {
            this.logService.error(`Error while getting the engine for the version ${rawGalleryExtensionVersion.version}.`, getErrorMessage(error));
        }
    }
    async queryRawGalleryExtensions(query, extensionGalleryManifest, token) {
        const extensionsQueryApi = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, "ExtensionQueryService" /* ExtensionGalleryResourceType.ExtensionQueryService */);
        if (!extensionsQueryApi) {
            throw new Error('No extension gallery query service configured.');
        }
        query = query
            /* Always exclude non validated extensions */
            .withFlags(...query.flags, "ExcludeNonValidated" /* Flag.ExcludeNonValidated */)
            .withFilter("Target" /* FilterType.Target */, 'Microsoft.VisualStudio.Code');
        const unpublishedFlag = extensionGalleryManifest.capabilities.extensionQuery.flags?.find(f => f.name === "Unpublished" /* Flag.Unpublished */);
        /* Always exclude unpublished extensions */
        if (unpublishedFlag) {
            query = query.withFilter("ExcludeWithFlags" /* FilterType.ExcludeWithFlags */, String(unpublishedFlag.value));
        }
        const data = JSON.stringify({
            filters: [
                {
                    criteria: query.criteria.reduce((criteria, c) => {
                        const criterium = extensionGalleryManifest.capabilities.extensionQuery.filtering?.find(f => f.name === c.filterType);
                        if (criterium) {
                            criteria.push({
                                filterType: criterium.value,
                                value: c.value,
                            });
                        }
                        return criteria;
                    }, []),
                    pageNumber: query.pageNumber,
                    pageSize: query.pageSize,
                    sortBy: extensionGalleryManifest.capabilities.extensionQuery.sorting?.find(s => s.name === query.sortBy)?.value,
                    sortOrder: query.sortOrder,
                }
            ],
            assetTypes: query.assetTypes,
            flags: query.flags.reduce((flags, flag) => {
                const flagValue = extensionGalleryManifest.capabilities.extensionQuery.flags?.find(f => f.name === flag);
                if (flagValue) {
                    flags |= flagValue.value;
                }
                return flags;
            }, 0)
        });
        const commonHeaders = await this.commonHeadersPromise;
        const headers = {
            ...commonHeaders,
            'Content-Type': 'application/json',
            'Accept': 'application/json;api-version=3.0-preview.1',
            'Accept-Encoding': 'gzip',
            'Content-Length': String(data.length),
        };
        const stopWatch = new StopWatch();
        let context, errorCode, total = 0;
        try {
            context = await this.requestService.request({
                type: 'POST',
                url: extensionsQueryApi,
                data,
                headers,
                callSite: 'extensionGalleryService.queryRawGalleryExtensions'
            }, token);
            if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
                return { galleryExtensions: [], total };
            }
            const result = await asJson(context);
            if (result) {
                const r = result.results[0];
                const galleryExtensions = r.extensions;
                const resultCount = r.resultMetadata && r.resultMetadata.filter(m => m.metadataType === 'ResultCount')[0];
                total = resultCount && resultCount.metadataItems.filter(i => i.name === 'TotalCount')[0].count || 0;
                return {
                    galleryExtensions,
                    total,
                    context: context.res.headers['activityid'] ? {
                        [SEARCH_ACTIVITY_HEADER_NAME]: context.res.headers['activityid']
                    } : {}
                };
            }
            return { galleryExtensions: [], total };
        }
        catch (e) {
            if (isCancellationError(e)) {
                errorCode = "Cancelled" /* ExtensionGalleryErrorCode.Cancelled */;
                throw e;
            }
            else {
                const errorMessage = getErrorMessage(e);
                errorCode = isOfflineError(e)
                    ? "Offline" /* ExtensionGalleryErrorCode.Offline */
                    : errorMessage.startsWith('XHR timeout')
                        ? "Timeout" /* ExtensionGalleryErrorCode.Timeout */
                        : "Failed" /* ExtensionGalleryErrorCode.Failed */;
                throw new ExtensionGalleryError(errorMessage, errorCode);
            }
        }
        finally {
            this.telemetryService.publicLog2('galleryService:query', {
                filterTypes: query.criteria.map(criterium => criterium.filterType),
                flags: query.flags,
                sortBy: query.sortBy,
                sortOrder: String(query.sortOrder),
                pageNumber: String(query.pageNumber),
                source: query.source,
                searchTextLength: query.searchText.length,
                requestBodySize: String(data.length),
                duration: stopWatch.elapsed(),
                success: !!context && isSuccess(context),
                responseBodySize: context?.res.headers['Content-Length'],
                statusCode: context ? String(context.res.statusCode) : undefined,
                errorCode,
                count: String(total),
                server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
                activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
                endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME),
            });
        }
    }
    getHeaderValue(headers, name) {
        const headerValue = headers?.[name.toLowerCase()];
        const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
        return value ? new TelemetryTrustedValue(value) : undefined;
    }
    async getLatestRawGalleryExtensionWithFallback(extensionInfo, resourceApi, token) {
        const [publisher, name] = extensionInfo.id.split('.');
        let errorCode;
        try {
            const uri = URI.parse(format2(resourceApi.uri, { publisher, name }));
            return await this.getLatestRawGalleryExtension(extensionInfo.id, uri, token);
        }
        catch (error) {
            if (error instanceof ExtensionGalleryError) {
                errorCode = error.code;
                switch (error.code) {
                    case "Offline" /* ExtensionGalleryErrorCode.Offline */:
                    case "Cancelled" /* ExtensionGalleryErrorCode.Cancelled */:
                    case "Timeout" /* ExtensionGalleryErrorCode.Timeout */:
                    case "ClientError" /* ExtensionGalleryErrorCode.ClientError */:
                        throw error;
                }
            }
            else {
                errorCode = 'Unknown';
            }
            if (!resourceApi.fallback) {
                throw error;
            }
        }
        finally {
            this.telemetryService.publicLog2('galleryService:getmarketplacelatest', {
                extension: extensionInfo.id,
                errorCode,
            });
        }
        this.logService.error(`Error while getting the latest version for the extension ${extensionInfo.id} from ${resourceApi.uri}. Trying the fallback ${resourceApi.fallback}`, errorCode);
        try {
            const uri = URI.parse(format2(resourceApi.fallback, { publisher, name }));
            return await this.getLatestRawGalleryExtension(extensionInfo.id, uri, token);
        }
        catch (error) {
            errorCode = error instanceof ExtensionGalleryError ? error.code : 'Unknown';
            throw error;
        }
        finally {
            this.telemetryService.publicLog2('galleryService:fallbacktounpkg', {
                extension: extensionInfo.id,
                errorCode,
            });
        }
    }
    async getLatestRawGalleryExtension(extension, uri, token) {
        let context;
        let errorCode;
        const stopWatch = new StopWatch();
        try {
            const commonHeaders = await this.commonHeadersPromise;
            const headers = {
                ...commonHeaders,
                'Content-Type': 'application/json',
                'Accept': 'application/json;api-version=7.2-preview',
                'Accept-Encoding': 'gzip',
            };
            context = await this.requestService.request({
                type: 'GET',
                url: uri.toString(true),
                headers,
                timeout: this.getRequestTimeout(),
                callSite: 'extensionGalleryService.getLatestRawGalleryExtension'
            }, token);
            if (context.res.statusCode === 404) {
                errorCode = 'NotFound';
                return null;
            }
            if (context.res.statusCode && context.res.statusCode !== 200) {
                throw new Error('Unexpected HTTP response: ' + context.res.statusCode);
            }
            const result = await asJson(context);
            if (!result) {
                errorCode = 'NoData';
            }
            return result;
        }
        catch (error) {
            let galleryErrorCode;
            if (isCancellationError(error)) {
                galleryErrorCode = "Cancelled" /* ExtensionGalleryErrorCode.Cancelled */;
            }
            else if (isOfflineError(error)) {
                galleryErrorCode = "Offline" /* ExtensionGalleryErrorCode.Offline */;
            }
            else if (getErrorMessage(error).startsWith('XHR timeout')) {
                galleryErrorCode = "Timeout" /* ExtensionGalleryErrorCode.Timeout */;
            }
            else if (context && isClientError(context)) {
                galleryErrorCode = "ClientError" /* ExtensionGalleryErrorCode.ClientError */;
            }
            else if (context && isServerError(context)) {
                galleryErrorCode = "ServerError" /* ExtensionGalleryErrorCode.ServerError */;
            }
            else {
                galleryErrorCode = "Failed" /* ExtensionGalleryErrorCode.Failed */;
            }
            errorCode = galleryErrorCode;
            throw new ExtensionGalleryError(error, galleryErrorCode);
        }
        finally {
            this.telemetryService.publicLog2('galleryService:getLatest', {
                extension,
                host: uri.authority,
                duration: stopWatch.elapsed(),
                errorCode,
                statusCode: context?.res.statusCode && context?.res.statusCode !== 200 ? `${context.res.statusCode}` : undefined,
                server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
                activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
                endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME),
            });
        }
    }
    async reportStatistic(publisher, name, version, type) {
        if (isWeb) {
            this.logService.info('ExtensionGalleryService#reportStatistic: Skipped in web');
            return undefined;
        }
        const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
        if (!manifest) {
            return undefined;
        }
        const resource = getExtensionGalleryManifestResourceUri(manifest, "ExtensionStatisticsUriTemplate" /* ExtensionGalleryResourceType.ExtensionStatisticsUri */);
        if (!resource) {
            return;
        }
        const url = format2(resource, { publisher, name, version, statTypeName: type });
        const Accept = '*/*;api-version=4.0-preview.1';
        const commonHeaders = await this.commonHeadersPromise;
        const headers = { ...commonHeaders, Accept };
        try {
            await this.requestService.request({
                type: 'POST',
                url,
                headers,
                callSite: 'extensionGalleryService.reportStatistic'
            }, CancellationToken.None);
        }
        catch (error) { /* Ignore */ }
    }
    async download(extension, location, operation) {
        this.logService.trace('ExtensionGalleryService#download', extension.identifier.id);
        const data = getGalleryExtensionTelemetryData(extension);
        const startTime = new Date().getTime();
        const operationParam = operation === 2 /* InstallOperation.Install */ ? 'install' : operation === 3 /* InstallOperation.Update */ ? 'update' : '';
        const downloadAsset = operationParam ? {
            uri: `${extension.assets.download.uri}${URI.parse(extension.assets.download.uri).query ? '&' : '?'}${operationParam}=true`,
            fallbackUri: `${extension.assets.download.fallbackUri}${URI.parse(extension.assets.download.fallbackUri).query ? '&' : '?'}${operationParam}=true`
        } : extension.assets.download;
        const activityId = extension.queryContext?.[SEARCH_ACTIVITY_HEADER_NAME];
        const headers = activityId && typeof activityId === 'string' ? { [SEARCH_ACTIVITY_HEADER_NAME]: activityId } : undefined;
        const context = await this.getAsset(extension.identifier.id, downloadAsset, AssetType.VSIX, extension.version, 'extensionGalleryService.download', headers ? { headers } : undefined);
        try {
            await this.fileService.writeFile(location, context.stream);
        }
        catch (error) {
            try {
                await this.fileService.del(location);
            }
            catch (e) {
                /* ignore */
                this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
            }
            throw new ExtensionGalleryError(getErrorMessage(error), "DownloadFailedWriting" /* ExtensionGalleryErrorCode.DownloadFailedWriting */);
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
    async downloadSignatureArchive(extension, location) {
        if (!extension.assets.signature) {
            throw new Error('No signature asset found');
        }
        this.logService.trace('ExtensionGalleryService#downloadSignatureArchive', extension.identifier.id);
        const context = await this.getAsset(extension.identifier.id, extension.assets.signature, AssetType.Signature, extension.version, 'extensionGalleryService.signature');
        try {
            await this.fileService.writeFile(location, context.stream);
        }
        catch (error) {
            try {
                await this.fileService.del(location);
            }
            catch (e) {
                /* ignore */
                this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
            }
            throw new ExtensionGalleryError(getErrorMessage(error), "DownloadFailedWriting" /* ExtensionGalleryErrorCode.DownloadFailedWriting */);
        }
    }
    async getReadme(extension, token) {
        if (extension.assets.readme) {
            const context = await this.getAsset(extension.identifier.id, extension.assets.readme, AssetType.Details, extension.version, 'extensionGalleryService.readme', {}, token);
            const content = await asTextOrError(context);
            return content || '';
        }
        return '';
    }
    async getManifest(extension, token) {
        if (extension.assets.manifest) {
            const context = await this.getAsset(extension.identifier.id, extension.assets.manifest, AssetType.Manifest, extension.version, 'extensionGalleryService.manifest', {}, token);
            const text = await asTextOrError(context);
            return text ? JSON.parse(text) : null;
        }
        return null;
    }
    async getCoreTranslation(extension, languageId) {
        const asset = extension.assets.coreTranslations.filter(t => t[0] === languageId.toUpperCase())[0];
        if (asset) {
            const context = await this.getAsset(extension.identifier.id, asset[1], asset[0], extension.version, 'extensionGalleryService.coreTranslation');
            const text = await asTextOrError(context);
            return text ? JSON.parse(text) : null;
        }
        return null;
    }
    async getChangelog(extension, token) {
        if (extension.assets.changelog) {
            const context = await this.getAsset(extension.identifier.id, extension.assets.changelog, AssetType.Changelog, extension.version, 'extensionGalleryService.changelog', {}, token);
            const content = await asTextOrError(context);
            return content || '';
        }
        return '';
    }
    async getAllVersions(extensionIdentifier) {
        return this.getVersions(extensionIdentifier);
    }
    async getAllCompatibleVersions(extensionIdentifier, includePreRelease, targetPlatform) {
        return this.getVersions(extensionIdentifier, { version: includePreRelease ? 2 /* VersionKind.Latest */ : 0 /* VersionKind.Release */, targetPlatform });
    }
    async getVersions(extensionIdentifier, onlyCompatible) {
        const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
        if (!extensionGalleryManifest) {
            throw new Error('No extension gallery service configured.');
        }
        let query = new Query()
            .withFlags("IncludeVersions" /* Flag.IncludeVersions */, "IncludeCategoryAndTags" /* Flag.IncludeCategoryAndTags */, "IncludeFiles" /* Flag.IncludeFiles */, "IncludeVersionProperties" /* Flag.IncludeVersionProperties */)
            .withPage(1, 1);
        if (extensionIdentifier.uuid) {
            query = query.withFilter("ExtensionId" /* FilterType.ExtensionId */, extensionIdentifier.uuid);
        }
        else {
            query = query.withFilter("ExtensionName" /* FilterType.ExtensionName */, extensionIdentifier.id);
        }
        const { galleryExtensions } = await this.queryRawGalleryExtensions(query, extensionGalleryManifest, CancellationToken.None);
        if (!galleryExtensions.length) {
            return [];
        }
        const allTargetPlatforms = getAllTargetPlatforms(galleryExtensions[0]);
        if (onlyCompatible && isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, onlyCompatible.targetPlatform)) {
            return [];
        }
        const versions = [];
        const productVersion = { version: this.productService.version, date: this.productService.date };
        await Promise.all(galleryExtensions[0].versions.map(async (version) => {
            try {
                if ((await this.isValidVersion({
                    id: extensionIdentifier.id,
                    version: version.version,
                    isPreReleaseVersion: isPreReleaseVersion(version),
                    targetPlatform: getTargetPlatformForExtensionVersion(version),
                    engine: getEngine(version),
                    manifestAsset: getVersionAsset(version, AssetType.Manifest),
                    enabledApiProposals: getEnabledApiProposals(version)
                }, {
                    compatible: !!onlyCompatible,
                    productVersion,
                    targetPlatform: onlyCompatible?.targetPlatform,
                    version: onlyCompatible?.version ?? version.version
                }, galleryExtensions[0].publisher.displayName, allTargetPlatforms))) {
                    versions.push(version);
                }
            }
            catch (error) { /* Ignore error and skip version */ }
        }));
        const result = [];
        const seen = new Map();
        for (const version of sortExtensionVersions(versions, onlyCompatible?.targetPlatform ?? CURRENT_TARGET_PLATFORM)) {
            const index = seen.get(version.version);
            const existing = index !== undefined ? result[index] : undefined;
            const targetPlatform = getTargetPlatformForExtensionVersion(version);
            if (!existing) {
                seen.set(version.version, result.length);
                result.push({ version: version.version, date: version.lastUpdated, isPreReleaseVersion: isPreReleaseVersion(version), targetPlatforms: [targetPlatform] });
            }
            else {
                existing.targetPlatforms.push(targetPlatform);
            }
        }
        return result;
    }
    async getAsset(extension, asset, assetType, extensionVersion, callSite, options = {}, token = CancellationToken.None) {
        const commonHeaders = await this.commonHeadersPromise;
        const baseOptions = { type: 'GET' };
        const headers = { ...commonHeaders, ...(options.headers || {}) };
        options = { ...options, ...baseOptions, headers };
        const url = asset.uri;
        const fallbackUrl = asset.fallbackUri;
        const firstOptions = { ...options, url, timeout: this.getRequestTimeout(), callSite };
        let context;
        try {
            context = await this.requestService.request(firstOptions, token);
            if (context.res.statusCode === 200) {
                return context;
            }
            const message = await asTextOrError(context);
            throw new Error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`);
        }
        catch (err) {
            if (isCancellationError(err)) {
                throw err;
            }
            const message = getErrorMessage(err);
            this.telemetryService.publicLog2('galleryService:cdnFallback', {
                extension,
                assetType,
                message,
                extensionVersion,
                server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
                activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
                endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME),
            });
            const fallbackOptions = { ...options, url: fallbackUrl, timeout: this.getRequestTimeout(), callSite: `${callSite}.fallback` };
            return this.requestService.request(fallbackOptions, token);
        }
    }
    async getExtensionsControlManifest() {
        const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
        if (!manifest) {
            throw new Error('No extension gallery service configured.');
        }
        if (!this.extensionsControlUrl) {
            return { malicious: [], deprecated: {}, search: [], autoUpdate: {} };
        }
        const context = await this.requestService.request({
            type: 'GET',
            url: this.extensionsControlUrl,
            timeout: this.getRequestTimeout(),
            callSite: 'extensionGalleryService.getExtensionsControlManifest'
        }, CancellationToken.None);
        if (context.res.statusCode !== 200) {
            throw new Error('Could not get extensions report.');
        }
        const result = await asJson(context);
        const malicious = [];
        const deprecated = {};
        const search = [];
        const autoUpdate = result?.autoUpdate ?? {};
        if (result) {
            for (const id of result.malicious) {
                if (!isString(id)) {
                    continue;
                }
                const publisherOrExtension = EXTENSION_IDENTIFIER_REGEX.test(id) ? { id } : id;
                malicious.push({ extensionOrPublisher: publisherOrExtension, learnMoreLink: result.learnMoreLinks?.[id] });
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
        }
        deprecated[this.productService.defaultChatAgent.extensionId.toLowerCase()] = {
            disallowInstall: true,
            extension: {
                id: this.productService.defaultChatAgent.chatExtensionId,
                displayName: 'GitHub Copilot Chat',
                autoMigrate: { storage: false, donotDisable: true },
                preRelease: this.productService.quality !== 'stable'
            }
        };
        return { malicious, deprecated, search, autoUpdate };
    }
    getRequestTimeout() {
        const configuredTimeout = this.configurationService.getValue(ExtensionRequestsTimeoutConfigKey);
        return isNumber(configuredTimeout) && configuredTimeout >= 0 ? configuredTimeout : 60_000;
    }
};
AbstractExtensionGalleryService = __decorate([
    __param(1, IRequestService),
    __param(2, ILogService),
    __param(3, IEnvironmentService),
    __param(4, ITelemetryService),
    __param(5, IFileService),
    __param(6, IProductService),
    __param(7, IConfigurationService),
    __param(8, IAllowedExtensionsService),
    __param(9, IExtensionGalleryManifestService)
], AbstractExtensionGalleryService);
export { AbstractExtensionGalleryService };
let ExtensionGalleryService = class ExtensionGalleryService extends AbstractExtensionGalleryService {
    constructor(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
        super(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService);
    }
};
ExtensionGalleryService = __decorate([
    __param(0, IStorageService),
    __param(1, IRequestService),
    __param(2, ILogService),
    __param(3, IEnvironmentService),
    __param(4, ITelemetryService),
    __param(5, IFileService),
    __param(6, IProductService),
    __param(7, IConfigurationService),
    __param(8, IAllowedExtensionsService),
    __param(9, IExtensionGalleryManifestService)
], ExtensionGalleryService);
export { ExtensionGalleryService };
let ExtensionGalleryServiceWithNoStorageService = class ExtensionGalleryServiceWithNoStorageService extends AbstractExtensionGalleryService {
    constructor(requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
        super(undefined, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService);
    }
};
ExtensionGalleryServiceWithNoStorageService = __decorate([
    __param(0, IRequestService),
    __param(1, ILogService),
    __param(2, IEnvironmentService),
    __param(3, ITelemetryService),
    __param(4, IFileService),
    __param(5, IProductService),
    __param(6, IConfigurationService),
    __param(7, IAllowedExtensionsService),
    __param(8, IExtensionGalleryManifestService)
], ExtensionGalleryServiceWithNoStorageService);
export { ExtensionGalleryServiceWithNoStorageService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxLQUFLLE1BQU0sTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFekcsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBOEMsY0FBYyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0gsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGlCQUFpQixFQUE2TixvQ0FBb0MsRUFBRSwwQkFBMEIsRUFBMEMsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQXFFLHFCQUFxQixFQUE4Qyx5QkFBeUIsRUFBRSwwQkFBMEIsRUFBOEMsaUNBQWlDLEVBQUUsTUFBTSwwQkFBMEIs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QUMsR0FBRyxLQUFLLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDcEgsTUFBTSxLQUFLLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzNELE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDdEMsQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQUMsT0FBb0M7SUFDbEUsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDbkgsTUFBTSxLQUFLLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzNELE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDdEMsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLE9BQW9DO0lBQzNELE9BQU8sT0FBTyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLFlBQVksQ0FBQyxXQUFXLENBQUMsRUFBRSxLQUFLLENBQUM7QUFDakYsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLE9BQW9DO0lBQzNELE9BQU8sT0FBTyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FB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