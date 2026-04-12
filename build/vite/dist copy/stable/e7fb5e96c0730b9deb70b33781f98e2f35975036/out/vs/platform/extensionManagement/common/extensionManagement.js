/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { PolicyCategory } from '../../../base/common/policy.js';
import { localize, localize2 } from '../../../nls.js';
import { Extensions } from '../../configuration/common/configurationRegistry.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';
export const EXTENSION_IDENTIFIER_PATTERN = '^([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$';
export const EXTENSION_IDENTIFIER_REGEX = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
export const WEB_EXTENSION_TAG = '__web_extension';
export const EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT = 'skipWalkthrough';
export const EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT = 'skipPublisherTrust';
export const EXTENSION_INSTALL_SOURCE_CONTEXT = 'extensionInstallSource';
export const EXTENSION_INSTALL_DEP_PACK_CONTEXT = 'dependecyOrPackExtensionInstall';
export const EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT = 'clientTargetPlatform';
export var ExtensionInstallSource;
(function (ExtensionInstallSource) {
    ExtensionInstallSource["COMMAND"] = "command";
    ExtensionInstallSource["SETTINGS_SYNC"] = "settingsSync";
})(ExtensionInstallSource || (ExtensionInstallSource = {}));
export function TargetPlatformToString(targetPlatform) {
    switch (targetPlatform) {
        case "win32-x64" /* TargetPlatform.WIN32_X64 */: return 'Windows 64 bit';
        case "win32-arm64" /* TargetPlatform.WIN32_ARM64 */: return 'Windows ARM';
        case "linux-x64" /* TargetPlatform.LINUX_X64 */: return 'Linux 64 bit';
        case "linux-arm64" /* TargetPlatform.LINUX_ARM64 */: return 'Linux ARM 64';
        case "linux-armhf" /* TargetPlatform.LINUX_ARMHF */: return 'Linux ARM';
        case "alpine-x64" /* TargetPlatform.ALPINE_X64 */: return 'Alpine Linux 64 bit';
        case "alpine-arm64" /* TargetPlatform.ALPINE_ARM64 */: return 'Alpine ARM 64';
        case "darwin-x64" /* TargetPlatform.DARWIN_X64 */: return 'Mac';
        case "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */: return 'Mac Silicon';
        case "web" /* TargetPlatform.WEB */: return 'Web';
        case "universal" /* TargetPlatform.UNIVERSAL */: return "universal" /* TargetPlatform.UNIVERSAL */;
        case "unknown" /* TargetPlatform.UNKNOWN */: return "unknown" /* TargetPlatform.UNKNOWN */;
        case "undefined" /* TargetPlatform.UNDEFINED */: return "undefined" /* TargetPlatform.UNDEFINED */;
    }
}
export function toTargetPlatform(targetPlatform) {
    switch (targetPlatform) {
        case "win32-x64" /* TargetPlatform.WIN32_X64 */: return "win32-x64" /* TargetPlatform.WIN32_X64 */;
        case "win32-arm64" /* TargetPlatform.WIN32_ARM64 */: return "win32-arm64" /* TargetPlatform.WIN32_ARM64 */;
        case "linux-x64" /* TargetPlatform.LINUX_X64 */: return "linux-x64" /* TargetPlatform.LINUX_X64 */;
        case "linux-arm64" /* TargetPlatform.LINUX_ARM64 */: return "linux-arm64" /* TargetPlatform.LINUX_ARM64 */;
        case "linux-armhf" /* TargetPlatform.LINUX_ARMHF */: return "linux-armhf" /* TargetPlatform.LINUX_ARMHF */;
        case "alpine-x64" /* TargetPlatform.ALPINE_X64 */: return "alpine-x64" /* TargetPlatform.ALPINE_X64 */;
        case "alpine-arm64" /* TargetPlatform.ALPINE_ARM64 */: return "alpine-arm64" /* TargetPlatform.ALPINE_ARM64 */;
        case "darwin-x64" /* TargetPlatform.DARWIN_X64 */: return "darwin-x64" /* TargetPlatform.DARWIN_X64 */;
        case "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */: return "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */;
        case "web" /* TargetPlatform.WEB */: return "web" /* TargetPlatform.WEB */;
        case "universal" /* TargetPlatform.UNIVERSAL */: return "universal" /* TargetPlatform.UNIVERSAL */;
        default: return "unknown" /* TargetPlatform.UNKNOWN */;
    }
}
export function getTargetPlatform(platform, arch) {
    switch (platform) {
        case 3 /* Platform.Windows */:
            if (arch === 'x64') {
                return "win32-x64" /* TargetPlatform.WIN32_X64 */;
            }
            if (arch === 'arm64') {
                return "win32-arm64" /* TargetPlatform.WIN32_ARM64 */;
            }
            return "unknown" /* TargetPlatform.UNKNOWN */;
        case 2 /* Platform.Linux */:
            if (arch === 'x64') {
                return "linux-x64" /* TargetPlatform.LINUX_X64 */;
            }
            if (arch === 'arm64') {
                return "linux-arm64" /* TargetPlatform.LINUX_ARM64 */;
            }
            if (arch === 'arm') {
                return "linux-armhf" /* TargetPlatform.LINUX_ARMHF */;
            }
            return "unknown" /* TargetPlatform.UNKNOWN */;
        case 'alpine':
            if (arch === 'x64') {
                return "alpine-x64" /* TargetPlatform.ALPINE_X64 */;
            }
            if (arch === 'arm64') {
                return "alpine-arm64" /* TargetPlatform.ALPINE_ARM64 */;
            }
            return "unknown" /* TargetPlatform.UNKNOWN */;
        case 1 /* Platform.Mac */:
            if (arch === 'x64') {
                return "darwin-x64" /* TargetPlatform.DARWIN_X64 */;
            }
            if (arch === 'arm64') {
                return "darwin-arm64" /* TargetPlatform.DARWIN_ARM64 */;
            }
            return "unknown" /* TargetPlatform.UNKNOWN */;
        case 0 /* Platform.Web */: return "web" /* TargetPlatform.WEB */;
    }
}
export function isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, productTargetPlatform) {
    // Not a web extension in web target platform
    return productTargetPlatform === "web" /* TargetPlatform.WEB */ && !allTargetPlatforms.includes("web" /* TargetPlatform.WEB */);
}
export function isTargetPlatformCompatible(extensionTargetPlatform, allTargetPlatforms, productTargetPlatform) {
    // Not compatible when extension is not a web extension in web target platform
    if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, productTargetPlatform)) {
        return false;
    }
    // Compatible when extension target platform is not defined
    if (extensionTargetPlatform === "undefined" /* TargetPlatform.UNDEFINED */) {
        return true;
    }
    // Compatible when extension target platform is universal
    if (extensionTargetPlatform === "universal" /* TargetPlatform.UNIVERSAL */) {
        return true;
    }
    // Not compatible when extension target platform is unknown
    if (extensionTargetPlatform === "unknown" /* TargetPlatform.UNKNOWN */) {
        return false;
    }
    // Compatible when extension and product target platforms matches
    if (extensionTargetPlatform === productTargetPlatform) {
        return true;
    }
    return false;
}
export function isIExtensionIdentifier(obj) {
    const thing = obj;
    return !!thing
        && typeof thing === 'object'
        && typeof thing.id === 'string'
        && (!thing.uuid || typeof thing.uuid === 'string');
}
export var SortBy;
(function (SortBy) {
    SortBy["NoneOrRelevance"] = "NoneOrRelevance";
    SortBy["LastUpdatedDate"] = "LastUpdatedDate";
    SortBy["Title"] = "Title";
    SortBy["PublisherName"] = "PublisherName";
    SortBy["InstallCount"] = "InstallCount";
    SortBy["PublishedDate"] = "PublishedDate";
    SortBy["AverageRating"] = "AverageRating";
    SortBy["WeightedRating"] = "WeightedRating";
})(SortBy || (SortBy = {}));
export var SortOrder;
(function (SortOrder) {
    SortOrder[SortOrder["Default"] = 0] = "Default";
    SortOrder[SortOrder["Ascending"] = 1] = "Ascending";
    SortOrder[SortOrder["Descending"] = 2] = "Descending";
})(SortOrder || (SortOrder = {}));
export var FilterType;
(function (FilterType) {
    FilterType["Category"] = "Category";
    FilterType["ExtensionId"] = "ExtensionId";
    FilterType["ExtensionName"] = "ExtensionName";
    FilterType["ExcludeWithFlags"] = "ExcludeWithFlags";
    FilterType["Featured"] = "Featured";
    FilterType["SearchText"] = "SearchText";
    FilterType["Tag"] = "Tag";
    FilterType["Target"] = "Target";
})(FilterType || (FilterType = {}));
export var StatisticType;
(function (StatisticType) {
    StatisticType["Install"] = "install";
    StatisticType["Uninstall"] = "uninstall";
})(StatisticType || (StatisticType = {}));
export var InstallOperation;
(function (InstallOperation) {
    InstallOperation[InstallOperation["None"] = 1] = "None";
    InstallOperation[InstallOperation["Install"] = 2] = "Install";
    InstallOperation[InstallOperation["Update"] = 3] = "Update";
    InstallOperation[InstallOperation["Migrate"] = 4] = "Migrate";
})(InstallOperation || (InstallOperation = {}));
export const IExtensionGalleryService = createDecorator('extensionGalleryService');
export var ExtensionGalleryErrorCode;
(function (ExtensionGalleryErrorCode) {
    ExtensionGalleryErrorCode["Timeout"] = "Timeout";
    ExtensionGalleryErrorCode["Cancelled"] = "Cancelled";
    ExtensionGalleryErrorCode["ClientError"] = "ClientError";
    ExtensionGalleryErrorCode["ServerError"] = "ServerError";
    ExtensionGalleryErrorCode["Failed"] = "Failed";
    ExtensionGalleryErrorCode["DownloadFailedWriting"] = "DownloadFailedWriting";
    ExtensionGalleryErrorCode["Offline"] = "Offline";
})(ExtensionGalleryErrorCode || (ExtensionGalleryErrorCode = {}));
export class ExtensionGalleryError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = code;
    }
}
export var ExtensionManagementErrorCode;
(function (ExtensionManagementErrorCode) {
    ExtensionManagementErrorCode["NotFound"] = "NotFound";
    ExtensionManagementErrorCode["Unsupported"] = "Unsupported";
    ExtensionManagementErrorCode["Deprecated"] = "Deprecated";
    ExtensionManagementErrorCode["Malicious"] = "Malicious";
    ExtensionManagementErrorCode["Incompatible"] = "Incompatible";
    ExtensionManagementErrorCode["IncompatibleApi"] = "IncompatibleApi";
    ExtensionManagementErrorCode["IncompatibleTargetPlatform"] = "IncompatibleTargetPlatform";
    ExtensionManagementErrorCode["ReleaseVersionNotFound"] = "ReleaseVersionNotFound";
    ExtensionManagementErrorCode["Invalid"] = "Invalid";
    ExtensionManagementErrorCode["Download"] = "Download";
    ExtensionManagementErrorCode["DownloadSignature"] = "DownloadSignature";
    ExtensionManagementErrorCode["DownloadFailedWriting"] = "DownloadFailedWriting";
    ExtensionManagementErrorCode["UpdateMetadata"] = "UpdateMetadata";
    ExtensionManagementErrorCode["Extract"] = "Extract";
    ExtensionManagementErrorCode["Scanning"] = "Scanning";
    ExtensionManagementErrorCode["ScanningExtension"] = "ScanningExtension";
    ExtensionManagementErrorCode["ReadRemoved"] = "ReadRemoved";
    ExtensionManagementErrorCode["UnsetRemoved"] = "UnsetRemoved";
    ExtensionManagementErrorCode["Delete"] = "Delete";
    ExtensionManagementErrorCode["Rename"] = "Rename";
    ExtensionManagementErrorCode["IntializeDefaultProfile"] = "IntializeDefaultProfile";
    ExtensionManagementErrorCode["AddToProfile"] = "AddToProfile";
    ExtensionManagementErrorCode["InstalledExtensionNotFound"] = "InstalledExtensionNotFound";
    ExtensionManagementErrorCode["PostInstall"] = "PostInstall";
    ExtensionManagementErrorCode["CorruptZip"] = "CorruptZip";
    ExtensionManagementErrorCode["IncompleteZip"] = "IncompleteZip";
    ExtensionManagementErrorCode["PackageNotSigned"] = "PackageNotSigned";
    ExtensionManagementErrorCode["SignatureVerificationInternal"] = "SignatureVerificationInternal";
    ExtensionManagementErrorCode["SignatureVerificationFailed"] = "SignatureVerificationFailed";
    ExtensionManagementErrorCode["NotAllowed"] = "NotAllowed";
    ExtensionManagementErrorCode["Gallery"] = "Gallery";
    ExtensionManagementErrorCode["Cancelled"] = "Cancelled";
    ExtensionManagementErrorCode["Unknown"] = "Unknown";
    ExtensionManagementErrorCode["Internal"] = "Internal";
})(ExtensionManagementErrorCode || (ExtensionManagementErrorCode = {}));
export var ExtensionSignatureVerificationCode;
(function (ExtensionSignatureVerificationCode) {
    ExtensionSignatureVerificationCode["NotSigned"] = "NotSigned";
    ExtensionSignatureVerificationCode["Success"] = "Success";
    ExtensionSignatureVerificationCode["RequiredArgumentMissing"] = "RequiredArgumentMissing";
    ExtensionSignatureVerificationCode["InvalidArgument"] = "InvalidArgument";
    ExtensionSignatureVerificationCode["PackageIsUnreadable"] = "PackageIsUnreadable";
    ExtensionSignatureVerificationCode["UnhandledException"] = "UnhandledException";
    ExtensionSignatureVerificationCode["SignatureManifestIsMissing"] = "SignatureManifestIsMissing";
    ExtensionSignatureVerificationCode["SignatureManifestIsUnreadable"] = "SignatureManifestIsUnreadable";
    ExtensionSignatureVerificationCode["SignatureIsMissing"] = "SignatureIsMissing";
    ExtensionSignatureVerificationCode["SignatureIsUnreadable"] = "SignatureIsUnreadable";
    ExtensionSignatureVerificationCode["CertificateIsUnreadable"] = "CertificateIsUnreadable";
    ExtensionSignatureVerificationCode["SignatureArchiveIsUnreadable"] = "SignatureArchiveIsUnreadable";
    ExtensionSignatureVerificationCode["FileAlreadyExists"] = "FileAlreadyExists";
    ExtensionSignatureVerificationCode["SignatureArchiveIsInvalidZip"] = "SignatureArchiveIsInvalidZip";
    ExtensionSignatureVerificationCode["SignatureArchiveHasSameSignatureFile"] = "SignatureArchiveHasSameSignatureFile";
    ExtensionSignatureVerificationCode["PackageIntegrityCheckFailed"] = "PackageIntegrityCheckFailed";
    ExtensionSignatureVerificationCode["SignatureIsInvalid"] = "SignatureIsInvalid";
    ExtensionSignatureVerificationCode["SignatureManifestIsInvalid"] = "SignatureManifestIsInvalid";
    ExtensionSignatureVerificationCode["SignatureIntegrityCheckFailed"] = "SignatureIntegrityCheckFailed";
    ExtensionSignatureVerificationCode["EntryIsMissing"] = "EntryIsMissing";
    ExtensionSignatureVerificationCode["EntryIsTampered"] = "EntryIsTampered";
    ExtensionSignatureVerificationCode["Untrusted"] = "Untrusted";
    ExtensionSignatureVerificationCode["CertificateRevoked"] = "CertificateRevoked";
    ExtensionSignatureVerificationCode["SignatureIsNotValid"] = "SignatureIsNotValid";
    ExtensionSignatureVerificationCode["UnknownError"] = "UnknownError";
    ExtensionSignatureVerificationCode["PackageIsInvalidZip"] = "PackageIsInvalidZip";
    ExtensionSignatureVerificationCode["SignatureArchiveHasTooManyEntries"] = "SignatureArchiveHasTooManyEntries";
})(ExtensionSignatureVerificationCode || (ExtensionSignatureVerificationCode = {}));
export class ExtensionManagementError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = code;
    }
}
export const IExtensionManagementService = createDecorator('extensionManagementService');
export const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/disabled';
export const ENABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/enabled';
export const IGlobalExtensionEnablementService = createDecorator('IGlobalExtensionEnablementService');
export const IExtensionTipsService = createDecorator('IExtensionTipsService');
export const IAllowedExtensionsService = createDecorator('IAllowedExtensionsService');
export async function computeSize(location, fileService) {
    let stat;
    try {
        stat = await fileService.resolve(location);
    }
    catch (e) {
        if (e.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
            return 0;
        }
        throw e;
    }
    if (stat.children) {
        const sizes = await Promise.all(stat.children.map(c => computeSize(c.resource, fileService)));
        return sizes.reduce((r, s) => r + s, 0);
    }
    return stat.size ?? 0;
}
export const ExtensionsLocalizedLabel = localize2('extensions', "Extensions");
export const PreferencesLocalizedLabel = localize2('preferences', 'Preferences');
export const AllowedExtensionsConfigKey = 'extensions.allowed';
export const VerifyExtensionSignatureConfigKey = 'extensions.verifySignature';
export const ExtensionRequestsTimeoutConfigKey = 'extensions.requestTimeout';
Registry.as(Extensions.Configuration)
    .registerConfiguration({
    id: 'extensions',
    order: 30,
    title: localize('extensionsConfigurationTitle', "Extensions"),
    type: 'object',
    properties: {
        [AllowedExtensionsConfigKey]: {
            // Note: Type is set only to object because to support policies generation during build time, where single type is expected.
            type: 'object',
            markdownDescription: localize('extensions.allowed', "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. For more information on how to configure this setting, please visit the [Configure Allowed Extensions](https://aka.ms/vscode/enterprise/extensions/allowed) section."),
            default: '*',
            defaultSnippets: [{
                    body: {},
                    description: localize('extensions.allowed.none', "No extensions are allowed."),
                }, {
                    body: {
                        '*': true
                    },
                    description: localize('extensions.allowed.all', "All extensions are allowed."),
                }],
            scope: 1 /* ConfigurationScope.APPLICATION */,
            policy: {
                name: 'AllowedExtensions',
                category: PolicyCategory.Extensions,
                minimumVersion: '1.96',
                localization: {
                    description: {
                        key: 'extensions.allowed.policy',
                        value: localize('extensions.allowed.policy', "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. More information: https://aka.ms/vscode/enterprise/extensions/allowed"),
                    }
                }
            },
            additionalProperties: false,
            patternProperties: {
                '([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
                    anyOf: [
                        {
                            type: ['boolean', 'string'],
                            enum: [true, false, 'stable'],
                            description: localize('extensions.allow.description', "Allow or disallow the extension."),
                            enumDescriptions: [
                                localize('extensions.allowed.enable.desc', "Extension is allowed."),
                                localize('extensions.allowed.disable.desc', "Extension is not allowed."),
                                localize('extensions.allowed.disable.stable.desc', "Allow only stable versions of the extension."),
                            ],
                        },
                        {
                            type: 'array',
                            items: {
                                type: 'string',
                            },
                            description: localize('extensions.allow.version.description', "Allow or disallow specific versions of the extension. To specifcy a platform specific version, use the format `platform@1.2.3`, e.g. `win32-x64@1.2.3`. Supported platforms are `win32-x64`, `win32-arm64`, `linux-x64`, `linux-arm64`, `linux-armhf`, `alpine-x64`, `alpine-arm64`, `darwin-x64`, `darwin-arm64`"),
                        },
                    ]
                },
                '([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
                    type: ['boolean', 'string'],
                    enum: [true, false, 'stable'],
                    description: localize('extension.publisher.allow.description', "Allow or disallow all extensions from the publisher."),
                    enumDescriptions: [
                        localize('extensions.publisher.allowed.enable.desc', "All extensions from the publisher are allowed."),
                        localize('extensions.publisher.allowed.disable.desc', "All extensions from the publisher are not allowed."),
                        localize('extensions.publisher.allowed.disable.stable.desc', "Allow only stable versions of the extensions from the publisher."),
                    ],
                },
                '\\*': {
                    type: 'boolean',
                    enum: [true, false],
                    description: localize('extensions.allow.all.description', "Allow or disallow all extensions."),
                    enumDescriptions: [
                        localize('extensions.allow.all.enable', "Allow all extensions."),
                        localize('extensions.allow.all.disable', "Disallow all extensions.")
                    ],
                }
            }
        }
    }
});
export function shouldRequireRepositorySignatureFor(isPrivate, galleryManifest) {
    if (isPrivate) {
        return galleryManifest?.capabilities.signing?.allPrivateRepositorySigned === true;
    }
    return galleryManifest?.capabilities.signing?.allPublicRepositorySigned === true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFRaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDdEQsT0FBTyxFQUFzQixVQUFVLEVBQTBCLE1BQU0scURBQXFELENBQUM7QUFHN0gsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUc3RCxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRywyREFBMkQsQ0FBQztBQUN4RyxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLE1BQU0sQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0FBQ25GLE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDO0FBQ25ELE1BQU0sQ0FBQyxNQUFNLDBDQUEwQyxHQUFHLGlCQUFpQixDQUFDO0FBQzVFLE1BQU0sQ0FBQyxNQUFNLDhDQUE4QyxHQUFHLG9CQUFvQixDQUFDO0FBQ25GLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLHdCQUF3QixDQUFDO0FBQ3pFLE1BQU0sQ0FBQyxNQUFNLGtDQUFrQyxHQUFHLGlDQUFpQyxDQUFDO0FBQ3BGLE1BQU0sQ0FBQyxNQUFNLGdEQUFnRCxHQUFHLHNCQUFzQixDQUFDO0FBRXZGLE1BQU0sQ0FBTixJQUFrQixzQkFHakI7QUFIRCxXQUFrQixzQkFBc0I7SUFDdkMsNkNBQW1CLENBQUE7SUFDbkIsd0RBQThCLENBQUE7QUFDL0IsQ0FBQyxFQUhpQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBR3ZDO0FBT0QsTUFBTSxVQUFVLHNCQUFzQixDQUFDLGNBQThCO0lBQ3BFLFFBQVEsY0FBYyxFQUFFLENBQUM7UUFDeEIsK0NBQTZCLENBQUMsQ0FBQyxPQUFPLGdCQUFnQixDQUFDO1FBQ3ZELG1EQUErQixDQUFDLENBQUMsT0FBTyxhQUFhLENBQUM7UUFFdEQsK0NBQTZCLENBQUMsQ0FBQyxPQUFPLGNBQWMsQ0FBQztRQUNyRCxtREFBK0IsQ0FBQyxDQUFDLE9BQU8sY0FBYyxDQUFDO1FBQ3ZELG1EQUErQixDQUFDLENBQUMsT0FBTyxXQUFXLENBQUM7UUFFcEQsaURBQThCLENBQUMsQ0FBQyxPQUFPLHFCQUFxQixDQUFDO1FBQzdELHFEQUFnQyxDQUFDLENBQUMsT0FBTyxlQUFlLENBQUM7UUFFekQsaURBQThCLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQztRQUM3QyxxREFBZ0MsQ0FBQyxDQUFDLE9BQU8sYUFBYSxDQUFDO1FBRXZELG1DQUF1QixDQUFDLENBQUMsT0FBTyxLQUFLLENBQUM7UUFFdEMsK0NBQTZCLENBQUMsQ0FBQyxrREFBZ0M7UUFDL0QsMkNBQTJCLENBQUMsQ0FBQyw4Q0FBOEI7UUFDM0QsK0NBQTZCLENBQUMsQ0FBQyxrREFBZ0M7SUFDaEUsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsY0FBc0I7SUFDdEQsUUFBUSxjQUFjLEVBQUUsQ0FBQztRQUN4QiwrQ0FBNkIsQ0FBQyxDQUFDLGtEQUFnQztRQUMvRCxtREFBK0IsQ0FBQyxDQUFDLHNEQUFrQztRQUVuRSwrQ0FBNkIsQ0FBQyxDQUFDLGtEQUFnQztRQUMvRCxtREFBK0IsQ0FBQyxDQUFDLHNEQUFrQztRQUNuRSxtREFBK0IsQ0FBQyxDQUFDLHNEQUFrQztRQUVuRSxpREFBOEIsQ0FBQyxDQUFDLG9EQUFpQztRQUNqRSxxREFBZ0MsQ0FBQyxDQUFDLHdEQUFtQztRQUVyRSxpREFBOEIsQ0FBQyxDQUFDLG9EQUFpQztRQUNqRSxxREFBZ0MsQ0FBQyxDQUFDLHdEQUFtQztRQUVyRSxtQ0FBdUIsQ0FBQyxDQUFDLHNDQUEwQjtRQUVuRCwrQ0FBNkIsQ0FBQyxDQUFDLGtEQUFnQztRQUMvRCxPQUFPLENBQUMsQ0FBQyw4Q0FBOEI7SUFDeEMsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsUUFBNkIsRUFBRSxJQUF3QjtJQUN4RixRQUFRLFFBQVEsRUFBRSxDQUFDO1FBQ2xCO1lBQ0MsSUFBSSxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ3BCLGtEQUFnQztZQUNqQyxDQUFDO1lBQ0QsSUFBSSxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQ3RCLHNEQUFrQztZQUNuQyxDQUFDO1lBQ0QsOENBQThCO1FBRS9CO1lBQ0MsSUFBSSxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ3BCLGtEQUFnQztZQUNqQyxDQUFDO1lBQ0QsSUFBSSxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQ3RCLHNEQUFrQztZQUNuQyxDQUFDO1lBQ0QsSUFBSSxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ3BCLHNEQUFrQztZQUNuQyxDQUFDO1lBQ0QsOENBQThCO1FBRS9CLEtBQUssUUFBUTtZQUNaLElBQUksSUFBSSxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUNwQixvREFBaUM7WUFDbEMsQ0FBQztZQUNELElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUN0Qix3REFBbUM7WUFDcEMsQ0FBQztZQUNELDhDQUE4QjtRQUUvQjtZQUNDLElBQUksSUFBSSxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUNwQixvREFBaUM7WUFDbEMsQ0FBQztZQUNELElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUN0Qix3REFBbUM7WUFDcEMsQ0FBQztZQUNELDhDQUE4QjtRQUUvQix5QkFBaUIsQ0FBQyxDQUFDLHNDQUEwQjtJQUM5QyxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sVUFBVSxvQ0FBb0MsQ0FBQyxrQkFBb0MsRUFBRSxxQkFBcUM7SUFDL0gsNkNBQTZDO0lBQzdDLE9BQU8scUJBQXFCLG1DQUF1QixJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxnQ0FBb0IsQ0FBQztBQUN6RyxDQUFDO0FBRUQsTUFBTSxVQUFVLDBCQUEwQixDQUFDLHVCQUF1QyxFQUFFLGtCQUFvQyxFQUFFLHFCQUFxQztJQUM5Siw4RUFBOEU7SUFDOUUsSUFBSSxvQ0FBb0MsQ0FBQyxrQkFBa0IsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLENBQUM7UUFDckYsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsMkRBQTJEO0lBQzNELElBQUksdUJBQXVCLCtDQUE2QixFQUFFLENBQUM7UUFDMUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQseURBQXlEO0lBQ3pELElBQUksdUJBQXVCLCtDQUE2QixFQUFFLENBQUM7UUFDMUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsMkRBQTJEO0lBQzNELElBQUksdUJBQXVCLDJDQUEyQixFQUFFLENBQUM7UUFDeEQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsaUVBQWlFO0lBQ2pFLElBQUksdUJBQXVCLEtBQUsscUJBQXFCLEVBQUUsQ0FBQztRQUN2RCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUE4QkQsTUFBTSxVQUFVLHNCQUFzQixDQUFDLEdBQVk7SUFDbEQsTUFBTSxLQUFLLEdBQUcsR0FBdUMsQ0FBQztJQUN0RCxPQUFPLENBQUMsQ0FBQyxLQUFLO1dBQ1YsT0FBTyxLQUFLLEtBQUssUUFBUTtXQUN6QixPQUFPLEtBQUssQ0FBQyxFQUFFLEtBQUssUUFBUTtXQUM1QixDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUM7QUFDckQsQ0FBQztBQThGRCxNQUFNLENBQU4sSUFBa0IsTUFTakI7QUFURCxXQUFrQixNQUFNO0lBQ3ZCLDZDQUFtQyxDQUFBO0lBQ25DLDZDQUFtQyxDQUFBO0lBQ25DLHlCQUFlLENBQUE7SUFDZix5Q0FBK0IsQ0FBQTtJQUMvQix1Q0FBNkIsQ0FBQTtJQUM3Qix5Q0FBK0IsQ0FBQTtJQUMvQix5Q0FBK0IsQ0FBQTtJQUMvQiwyQ0FBaUMsQ0FBQTtBQUNsQyxDQUFDLEVBVGlCLE1BQU0sS0FBTixNQUFNLFFBU3ZCO0FBRUQsTUFBTSxDQUFOLElBQWtCLFNBSWpCO0FBSkQsV0FBa0IsU0FBUztJQUMxQiwrQ0FBVyxDQUFBO0lBQ1gsbURBQWEsQ0FBQTtJQUNiLHFEQUFjLENBQUE7QUFDZixDQUFDLEVBSmlCLFNBQVMsS0FBVCxTQUFTLFFBSTFCO0FBRUQsTUFBTSxDQUFOLElBQWtCLFVBU2pCO0FBVEQsV0FBa0IsVUFBVTtJQUMzQixtQ0FBcUIsQ0FBQTtJQUNyQix5Q0FBMkIsQ0FBQTtJQUMzQiw2Q0FBK0IsQ0FBQTtJQUMvQixtREFBcUMsQ0FBQTtJQUNyQyxtQ0FBcUIsQ0FBQTtJQUNyQix1Q0FBeUIsQ0FBQTtJQUN6Qix5QkFBVyxDQUFBO0lBQ1gsK0JBQWlCLENBQUE7QUFDbEIsQ0FBQyxFQVRpQixVQUFVLEtBQVYsVUFBVSxRQVMzQjtBQWFELE1BQU0sQ0FBTixJQUFrQixhQUdqQjtBQUhELFdBQWtCLGFBQWE7SUFDOUIsb0NBQW1CLENBQUE7SUFDbkIsd0NBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQUhpQixhQUFhLEtBQWIsYUFBYSxRQUc5QjtBQWtDRCxNQUFNLENBQU4sSUFBa0IsZ0JBS2pCO0FBTEQsV0FBa0IsZ0JBQWdCO0lBQ2pDLHVEQUFRLENBQUE7SUFDUiw2REFBTyxDQUFBO0lBQ1AsMkRBQU0sQ0FBQTtJQUNOLDZEQUFPLENBQUE7QUFDUixDQUFDLEVBTGlCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFLakM7QUE0QkQsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsZUFBZSxDQUEyQix5QkFBeUIsQ0FBQyxDQUFDO0FBa0U3RyxNQUFNLENBQU4sSUFBa0IseUJBUWpCO0FBUkQsV0FBa0IseUJBQXlCO0lBQzFDLGdEQUFtQixDQUFBO0lBQ25CLG9EQUF1QixDQUFBO0lBQ3ZCLHdEQUEyQixDQUFBO0lBQzNCLHdEQUEyQixDQUFBO0lBQzNCLDhDQUFpQixDQUFBO0lBQ2pCLDRFQUErQyxDQUFBO0lBQy9DLGdEQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFSaUIseUJBQXlCLEtBQXpCLHlCQUF5QixRQVExQztBQUVELE1BQU0sT0FBTyxxQkFBc0IsU0FBUSxLQUFLO0lBQy9DLFlBQVksT0FBZSxFQUFXLElBQStCO1FBQ3BFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQURzQixTQUFJLEdBQUosSUFBSSxDQUEyQjtRQUVwRSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNsQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLENBQU4sSUFBa0IsNEJBbUNqQjtBQW5DRCxXQUFrQiw0QkFBNEI7SUFDN0MscURBQXFCLENBQUE7SUFDckIsMkRBQTJCLENBQUE7SUFDM0IseURBQXlCLENBQUE7SUFDekIsdURBQXVCLENBQUE7SUFDdkIsNkRBQTZCLENBQUE7SUFDN0IsbUVBQW1DLENBQUE7SUFDbkMseUZBQXlELENBQUE7SUFDekQsaUZBQWlELENBQUE7SUFDakQsbURBQW1CLENBQUE7SUFDbkIscURBQXFCLENBQUE7SUFDckIsdUVBQXVDLENBQUE7SUFDdkMsK0VBQXVFLENBQUE7SUFDdkUsaUVBQWlDLENBQUE7SUFDakMsbURBQW1CLENBQUE7SUFDbkIscURBQXFCLENBQUE7SUFDckIsdUVBQXVDLENBQUE7SUFDdkMsMkRBQTJCLENBQUE7SUFDM0IsNkRBQTZCLENBQUE7SUFDN0IsaURBQWlCLENBQUE7SUFDakIsaURBQWlCLENBQUE7SUFDakIsbUZBQW1ELENBQUE7SUFDbkQsNkRBQTZCLENBQUE7SUFDN0IseUZBQXlELENBQUE7SUFDekQsMkRBQTJCLENBQUE7SUFDM0IseURBQXlCLENBQUE7SUFDekIsK0RBQStCLENBQUE7SUFDL0IscUVBQXFDLENBQUE7SUFDckMsK0ZBQStELENBQUE7SUFDL0QsMkZBQTJELENBQUE7SUFDM0QseURBQXlCLENBQUE7SUFDekIsbURBQW1CLENBQUE7SUFDbkIsdURBQXVCLENBQUE7SUFDdkIsbURBQW1CLENBQUE7SUFDbkIscURBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQW5DaUIsNEJBQTRCLEtBQTVCLDRCQUE0QixRQW1DN0M7QUFFRCxNQUFNLENBQU4sSUFBWSxrQ0E0Qlg7QUE1QkQsV0FBWSxrQ0FBa0M7SUFDN0MsNkRBQXlCLENBQUE7SUFDekIseURBQXFCLENBQUE7SUFDckIseUZBQXFELENBQUE7SUFDckQseUVBQXFDLENBQUE7SUFDckMsaUZBQTZDLENBQUE7SUFDN0MsK0VBQTJDLENBQUE7SUFDM0MsK0ZBQTJELENBQUE7SUFDM0QscUdBQWlFLENBQUE7SUFDakUsK0VBQTJDLENBQUE7SUFDM0MscUZBQWlELENBQUE7SUFDakQseUZBQXFELENBQUE7SUFDckQsbUdBQStELENBQUE7SUFDL0QsNkVBQXlDLENBQUE7SUFDekMsbUdBQStELENBQUE7SUFDL0QsbUhBQStFLENBQUE7SUFDL0UsaUdBQTZELENBQUE7SUFDN0QsK0VBQTJDLENBQUE7SUFDM0MsK0ZBQTJELENBQUE7SUFDM0QscUdBQWlFLENBQUE7SUFDakUsdUVBQW1DLENBQUE7SUFDbkMseUVBQXFDLENBQUE7SUFDckMsNkRBQXlCLENBQUE7SUFDekIsK0VBQTJDLENBQUE7SUFDM0MsaUZBQTZDLENBQUE7SUFDN0MsbUVBQStCLENBQUE7SUFDL0IsaUZBQTZDLENBQUE7SUFDN0MsNkdBQXlFLENBQUE7QUFDMUUsQ0FBQyxFQTVCVyxrQ0FBa0MsS0FBbEMsa0NBQWtDLFFBNEI3QztBQUVELE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxLQUFLO0lBQ2xELFlBQVksT0FBZSxFQUFXLElBQWtDO1FBQ3ZFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQURzQixTQUFJLEdBQUosSUFBSSxDQUE4QjtRQUV2RSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNsQixDQUFDO0NBQ0Q7QUErQ0QsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUE4Qiw0QkFBNEIsQ0FBQyxDQUFDO0FBcUN0SCxNQUFNLENBQUMsTUFBTSxnQ0FBZ0MsR0FBRyxnQ0FBZ0MsQ0FBQztBQUNqRixNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRywrQkFBK0IsQ0FBQztBQUMvRSxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxlQUFlLENBQW9DLG1DQUFtQyxDQUFDLENBQUM7QUErQnpJLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLGVBQWUsQ0FBd0IsdUJBQXVCLENBQUMsQ0FBQztBQVdyRyxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxlQUFlLENBQTRCLDJCQUEyQixDQUFDLENBQUM7QUFXakgsTUFBTSxDQUFDLEtBQUssVUFBVSxXQUFXLENBQUMsUUFBYSxFQUFFLFdBQXlCO0lBQ3pFLElBQUksSUFBZSxDQUFDO0lBQ3BCLElBQUksQ0FBQztRQUNKLElBQUksR0FBRyxNQUFNLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWixJQUF5QixDQUFFLENBQUMsbUJBQW1CLCtDQUF1QyxFQUFFLENBQUM7WUFDeEYsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO1FBQ0QsTUFBTSxDQUFDLENBQUM7SUFDVCxDQUFDO0lBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbkIsTUFBTSxLQUFLLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUM7QUFDdkIsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLFNBQVMsQ0FBQyxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFDOUUsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsU0FBUyxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQztBQUNqRixNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxvQkFBb0IsQ0FBQztBQUMvRCxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyw0QkFBNEIsQ0FBQztBQUM5RSxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRywyQkFBMkIsQ0FBQztBQUU3RSxRQUFRLENBQUMsRUFBRSxDQUF5QixVQUFVLENBQUMsYUFBYSxDQUFDO0tBQzNELHFCQUFxQixDQUFDO0lBQ3RCLEVBQUUsRUFBRSxZQUFZO0lBQ2hCLEtBQUssRUFBRSxFQUFFO0lBQ1QsS0FBSyxFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxZQUFZLENBQUM7SUFDN0QsSUFBSSxFQUFFLFFBQVE7SUFDZCxVQUFVLEVBQUU7UUFDWCxDQUFDLDBCQUEwQixDQUFDLEVBQUU7WUFDN0IsNEhBQTRIO1lBQzVILElBQUksRUFBRSxRQUFRO1lBQ2QsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLG1WQUFtVixDQUFDO1lBQ3hZLE9BQU8sRUFBRSxHQUFHO1lBQ1osZUFBZSxFQUFFLENBQUM7b0JBQ2pCLElBQUksRUFBRSxFQUFFO29CQUNSLFdBQVcsRUFBRSxRQUFRLENBQUMseUJBQXlCLEVBQUUsNEJBQTRCLENBQUM7aUJBQzlFLEVBQUU7b0JBQ0YsSUFBSSxFQUFFO3dCQUNMLEdBQUcsRUFBRSxJQUFJO3FCQUNUO29CQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsNkJBQTZCLENBQUM7aUJBQzlFLENBQUM7WUFDRixLQUFLLHdDQUFnQztZQUNyQyxNQUFNLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLG1CQUFtQjtnQkFDekIsUUFBUSxFQUFFLGNBQWMsQ0FBQyxVQUFVO2dCQUNuQyxjQUFjLEVBQUUsTUFBTTtnQkFDdEIsWUFBWSxFQUFFO29CQUNiLFdBQVcsRUFBRTt3QkFDWixHQUFHLEVBQUUsMkJBQTJCO3dCQUNoQyxLQUFLLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLG9QQUFvUCxDQUFDO3FCQUNsUztpQkFDRDthQUNEO1lBQ0Qsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixpQkFBaUIsRUFBRTtnQkFDbEIsMERBQTBELEVBQUU7b0JBQzNELEtBQUssRUFBRTt3QkFDTjs0QkFDQyxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDOzRCQUMzQixJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQzs0QkFDN0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxrQ0FBa0MsQ0FBQzs0QkFDekYsZ0JBQWdCLEVBQUU7Z0NBQ2pCLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSx1QkFBdUIsQ0FBQztnQ0FDbkUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLDJCQUEyQixDQUFDO2dDQUN4RSxRQUFRLENBQUMsd0NBQXdDLEVBQUUsOENBQThDLENBQUM7NkJBQ2xHO3lCQUNEO3dCQUNEOzRCQUNDLElBQUksRUFBRSxPQUFPOzRCQUNiLEtBQUssRUFBRTtnQ0FDTixJQUFJLEVBQUUsUUFBUTs2QkFDZDs0QkFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLG1UQUFtVCxDQUFDO3lCQUNsWDtxQkFDRDtpQkFDRDtnQkFDRCw2QkFBNkIsRUFBRTtvQkFDOUIsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQztvQkFDM0IsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUM7b0JBQzdCLFdBQVcsRUFBRSxRQUFRLENBQUMsdUNBQXVDLEVBQUUsc0RBQXNELENBQUM7b0JBQ3RILGdCQUFnQixFQUFFO3dCQUNqQixRQUFRLENBQUMsMENBQTBDLEVBQUUsZ0RBQWdELENBQUM7d0JBQ3RHLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSxvREFBb0QsQ0FBQzt3QkFDM0csUUFBUSxDQUFDLGtEQUFrRCxFQUFFLGtFQUFrRSxDQUFDO3FCQUNoSTtpQkFDRDtnQkFDRCxLQUFLLEVBQUU7b0JBQ04sSUFBSSxFQUFFLFNBQVM7b0JBQ2YsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQztvQkFDbkIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSxtQ0FBbUMsQ0FBQztvQkFDOUYsZ0JBQWdCLEVBQUU7d0JBQ2pCLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx1QkFBdUIsQ0FBQzt3QkFDaEUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLDBCQUEwQixDQUFDO3FCQUNwRTtpQkFDRDthQUNEO1NBQ0Q7S0FDRDtDQUNELENBQUMsQ0FBQztBQUVKLE1BQU0sVUFBVSxtQ0FBbUMsQ0FBQyxTQUFrQixFQUFFLGVBQWlEO0lBQ3hILElBQUksU0FBUyxFQUFFLENBQUM7UUFDZixPQUFPLGVBQWUsRUFBRSxZQUFZLENBQUMsT0FBTyxFQUFFLDBCQUEwQixLQUFLLElBQUksQ0FBQztJQUNuRixDQUFDO0lBQ0QsT0FBTyxlQUFlLEVBQUUsWUFBWSxDQUFDLE9BQU8sRUFBRSx5QkFBeUIsS0FBSyxJQUFJLENBQUM7QUFDbEYsQ0FBQyJ9