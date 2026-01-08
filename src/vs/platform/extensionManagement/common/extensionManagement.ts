/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { IPager } from '../../../base/common/paging.js';
import { Platform } from '../../../base/common/platform.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import { URI } from '../../../base/common/uri.js';
import { localize, localize2 } from '../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { ExtensionType, IExtension, IExtensionManifest, TargetPlatform } from '../../extensions/common/extensions.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStat } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';
import { IExtensionGalleryManifest } from './extensionGalleryManifest.js';

export const EXTENSION_IDENTIFIER_PATTERN = '^([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$';
export const EXTENSION_IDENTIFIER_REGEX = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
export const WEB_EXTENSION_TAG = '__web_extension';
export const EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT = 'skipWalkthrough';
export const EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT = 'skipPublisherTrust';
export const EXTENSION_INSTALL_SOURCE_CONTEXT = 'extensionInstallSource';
export const EXTENSION_INSTALL_DEP_PACK_CONTEXT = 'dependecyOrPackExtensionInstall';
export const EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT = 'clientTargetPlatform';

export const enum ExtensionInstallSource {
	COMMAND = 'command',
	SETTINGS_SYNC = 'settingsSync',
}

export interface IProductVersion {
	readonly version: string;
	readonly date?: string;
}

export function TargetPlatformToString(targetPlatform: TargetPlatform) {
	switch (targetPlatform) {
		case TargetPlatform.WIN32_X64: return 'Windows 64 bit';
		case TargetPlatform.WIN32_ARM64: return 'Windows ARM';

		case TargetPlatform.LINUX_X64: return 'Linux 64 bit';
		case TargetPlatform.LINUX_ARM64: return 'Linux ARM 64';
		case TargetPlatform.LINUX_ARMHF: return 'Linux ARM';

		case TargetPlatform.ALPINE_X64: return 'Alpine Linux 64 bit';
		case TargetPlatform.ALPINE_ARM64: return 'Alpine ARM 64';

		case TargetPlatform.DARWIN_X64: return 'Mac';
		case TargetPlatform.DARWIN_ARM64: return 'Mac Silicon';

		case TargetPlatform.WEB: return 'Web';

		case TargetPlatform.UNIVERSAL: return TargetPlatform.UNIVERSAL;
		case TargetPlatform.UNKNOWN: return TargetPlatform.UNKNOWN;
		case TargetPlatform.UNDEFINED: return TargetPlatform.UNDEFINED;
	}
}

export function toTargetPlatform(targetPlatform: string): TargetPlatform {
	switch (targetPlatform) {
		case TargetPlatform.WIN32_X64: return TargetPlatform.WIN32_X64;
		case TargetPlatform.WIN32_ARM64: return TargetPlatform.WIN32_ARM64;

		case TargetPlatform.LINUX_X64: return TargetPlatform.LINUX_X64;
		case TargetPlatform.LINUX_ARM64: return TargetPlatform.LINUX_ARM64;
		case TargetPlatform.LINUX_ARMHF: return TargetPlatform.LINUX_ARMHF;

		case TargetPlatform.ALPINE_X64: return TargetPlatform.ALPINE_X64;
		case TargetPlatform.ALPINE_ARM64: return TargetPlatform.ALPINE_ARM64;

		case TargetPlatform.DARWIN_X64: return TargetPlatform.DARWIN_X64;
		case TargetPlatform.DARWIN_ARM64: return TargetPlatform.DARWIN_ARM64;

		case TargetPlatform.WEB: return TargetPlatform.WEB;

		case TargetPlatform.UNIVERSAL: return TargetPlatform.UNIVERSAL;
		default: return TargetPlatform.UNKNOWN;
	}
}

export function getTargetPlatform(platform: Platform | 'alpine', arch: string | undefined): TargetPlatform {
	switch (platform) {
		case Platform.Windows:
			if (arch === 'x64') {
				return TargetPlatform.WIN32_X64;
			}
			if (arch === 'arm64') {
				return TargetPlatform.WIN32_ARM64;
			}
			return TargetPlatform.UNKNOWN;

		case Platform.Linux:
			if (arch === 'x64') {
				return TargetPlatform.LINUX_X64;
			}
			if (arch === 'arm64') {
				return TargetPlatform.LINUX_ARM64;
			}
			if (arch === 'arm') {
				return TargetPlatform.LINUX_ARMHF;
			}
			return TargetPlatform.UNKNOWN;

		case 'alpine':
			if (arch === 'x64') {
				return TargetPlatform.ALPINE_X64;
			}
			if (arch === 'arm64') {
				return TargetPlatform.ALPINE_ARM64;
			}
			return TargetPlatform.UNKNOWN;

		case Platform.Mac:
			if (arch === 'x64') {
				return TargetPlatform.DARWIN_X64;
			}
			if (arch === 'arm64') {
				return TargetPlatform.DARWIN_ARM64;
			}
			return TargetPlatform.UNKNOWN;

		case Platform.Web: return TargetPlatform.WEB;
	}
}

export function isNotWebExtensionInWebTargetPlatform(allTargetPlatforms: TargetPlatform[], productTargetPlatform: TargetPlatform): boolean {
	// Not a web extension in web target platform
	return productTargetPlatform === TargetPlatform.WEB && !allTargetPlatforms.includes(TargetPlatform.WEB);
}

export function isTargetPlatformCompatible(extensionTargetPlatform: TargetPlatform, allTargetPlatforms: TargetPlatform[], productTargetPlatform: TargetPlatform): boolean {
	// Not compatible when extension is not a web extension in web target platform
	if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, productTargetPlatform)) {
		return false;
	}

	// Compatible when extension target platform is not defined
	if (extensionTargetPlatform === TargetPlatform.UNDEFINED) {
		return true;
	}

	// Compatible when extension target platform is universal
	if (extensionTargetPlatform === TargetPlatform.UNIVERSAL) {
		return true;
	}

	// Not compatible when extension target platform is unknown
	if (extensionTargetPlatform === TargetPlatform.UNKNOWN) {
		return false;
	}

	// Compatible when extension and product target platforms matches
	if (extensionTargetPlatform === productTargetPlatform) {
		return true;
	}

	return false;
}

export interface IGalleryExtensionProperties {
	dependencies?: string[];
	extensionPack?: string[];
	engine?: string;
	enabledApiProposals?: string[];
	localizedLanguages?: string[];
	targetPlatform: TargetPlatform;
	isPreReleaseVersion: boolean;
	executesCode?: boolean;
}

export interface IGalleryExtensionAsset {
	uri: string;
	fallbackUri: string;
}

export interface IGalleryExtensionAssets {
	manifest: IGalleryExtensionAsset | null;
	readme: IGalleryExtensionAsset | null;
	changelog: IGalleryExtensionAsset | null;
	license: IGalleryExtensionAsset | null;
	repository: IGalleryExtensionAsset | null;
	download: IGalleryExtensionAsset;
	icon: IGalleryExtensionAsset | null;
	signature: IGalleryExtensionAsset | null;
	coreTranslations: [string, IGalleryExtensionAsset][];
}

export function isIExtensionIdentifier(obj: unknown): obj is IExtensionIdentifier {
	const thing = obj as IExtensionIdentifier | undefined;
	return !!thing
		&& typeof thing === 'object'
		&& typeof thing.id === 'string'
		&& (!thing.uuid || typeof thing.uuid === 'string');
}

export interface IExtensionIdentifier {
	id: string;
	uuid?: string;
}

export interface IGalleryExtensionIdentifier extends IExtensionIdentifier {
	uuid: string;
}

export interface IGalleryExtensionVersion {
	version: string;
	date: string;
	isPreReleaseVersion: boolean;
	targetPlatforms: TargetPlatform[];
}

export interface IGalleryExtension {
	type: 'gallery';
	name: string;
	identifier: IGalleryExtensionIdentifier;
	version: string;
	displayName: string;
	publisherId: string;
	publisher: string;
	publisherDisplayName: string;
	publisherDomain?: { link: string; verified: boolean };
	publisherLink?: string;
	publisherSponsorLink?: string;
	description: string;
	installCount: number;
	rating: number;
	ratingCount: number;
	categories: readonly string[];
	tags: readonly string[];
	releaseDate: number;
	lastUpdated: number;
	preview: boolean;
	private: boolean;
	hasPreReleaseVersion: boolean;
	hasReleaseVersion: boolean;
	isSigned: boolean;
	allTargetPlatforms: TargetPlatform[];
	assets: IGalleryExtensionAssets;
	properties: IGalleryExtensionProperties;
	detailsLink?: string;
	ratingLink?: string;
	supportLink?: string;
	telemetryData?: IStringDictionary<unknown>;
	queryContext?: IStringDictionary<unknown>;
}

export type InstallSource = 'gallery' | 'vsix' | 'resource';

export interface IGalleryMetadata {
	id: string;
	publisherId: string;
	private: boolean;
	publisherDisplayName: string;
	isPreReleaseVersion: boolean;
	targetPlatform?: TargetPlatform;
}

export type Metadata = Partial<IGalleryMetadata & {
	isApplicationScoped: boolean;
	isMachineScoped: boolean;
	isBuiltin: boolean;
	isSystem: boolean;
	updated: boolean;
	preRelease: boolean;
	hasPreReleaseVersion: boolean;
	installedTimestamp: number;
	pinned: boolean;
	source: InstallSource;
	size: number;
}>;

export interface ILocalExtension extends IExtension {
	isWorkspaceScoped: boolean;
	isMachineScoped: boolean;
	isApplicationScoped: boolean;
	publisherId: string | null;
	installedTimestamp?: number;
	isPreReleaseVersion: boolean;
	hasPreReleaseVersion: boolean;
	private: boolean;
	preRelease: boolean;
	updated: boolean;
	pinned: boolean;
	source: InstallSource;
	size: number;
}

export const enum SortBy {
	NoneOrRelevance = 'NoneOrRelevance',
	LastUpdatedDate = 'LastUpdatedDate',
	Title = 'Title',
	PublisherName = 'PublisherName',
	InstallCount = 'InstallCount',
	PublishedDate = 'PublishedDate',
	AverageRating = 'AverageRating',
	WeightedRating = 'WeightedRating'
}

export const enum SortOrder {
	Default = 0,
	Ascending = 1,
	Descending = 2
}

export const enum FilterType {
	Category = 'Category',
	ExtensionId = 'ExtensionId',
	ExtensionName = 'ExtensionName',
	ExcludeWithFlags = 'ExcludeWithFlags',
	Featured = 'Featured',
	SearchText = 'SearchText',
	Tag = 'Tag',
	Target = 'Target',
}

export interface IQueryOptions {
	text?: string;
	exclude?: string[];
	pageSize?: number;
	sortBy?: SortBy;
	sortOrder?: SortOrder;
	source?: string;
	includePreRelease?: boolean;
	productVersion?: IProductVersion;
}

export const enum StatisticType {
	Install = 'install',
	Uninstall = 'uninstall'
}

export interface IDeprecationInfo {
	readonly disallowInstall?: boolean;
	readonly extension?: {
		readonly id: string;
		readonly displayName: string;
		readonly autoMigrate?: { readonly storage: boolean };
		readonly preRelease?: boolean;
	};
	readonly settings?: readonly string[];
	readonly additionalInfo?: string;
}

export interface ISearchPrefferedResults {
	readonly query?: string;
	readonly preferredResults?: string[];
}

export type MaliciousExtensionInfo = {
	readonly extensionOrPublisher: IExtensionIdentifier | string;
	readonly learnMoreLink?: string;
};

export interface IExtensionsControlManifest {
	readonly malicious: ReadonlyArray<MaliciousExtensionInfo>;
	readonly deprecated: IStringDictionary<IDeprecationInfo>;
	readonly search: ISearchPrefferedResults[];
	readonly autoUpdate?: IStringDictionary<string>;
}

export const enum InstallOperation {
	None = 1,
	Install,
	Update,
	Migrate,
}

export interface ITranslation {
	contents: { [key: string]: {} };
}

export interface IExtensionInfo extends IExtensionIdentifier {
	version?: string;
	preRelease?: boolean;
	hasPreRelease?: boolean;
}

export interface IExtensionQueryOptions {
	targetPlatform?: TargetPlatform;
	productVersion?: IProductVersion;
	compatible?: boolean;
	queryAllVersions?: boolean;
	source?: string;
}

export interface IExtensionGalleryCapabilities {
	readonly query: {
		readonly sortBy: readonly SortBy[];
		readonly filters: readonly FilterType[];
	};
	readonly allRepositorySigned: boolean;
}

export const IExtensionGalleryService = createDecorator<IExtensionGalleryService>('extensionGalleryService');

/**
 * Service to interact with the Visual Studio Code Marketplace to get extensions.
 * @throws Error if the Marketplace is not enabled or not reachable.
 */
export interface IExtensionGalleryService {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	query(options: IQueryOptions, token: CancellationToken): Promise<IPager<IGalleryExtension>>;
	getExtensions(extensionInfos: ReadonlyArray<IExtensionInfo>, token: CancellationToken): Promise<IGalleryExtension[]>;
	getExtensions(extensionInfos: ReadonlyArray<IExtensionInfo>, options: IExtensionQueryOptions, token: CancellationToken): Promise<IGalleryExtension[]>;
	isExtensionCompatible(extension: IGalleryExtension, includePreRelease: boolean, targetPlatform: TargetPlatform, productVersion?: IProductVersion): Promise<boolean>;
	getCompatibleExtension(extension: IGalleryExtension, includePreRelease: boolean, targetPlatform: TargetPlatform, productVersion?: IProductVersion): Promise<IGalleryExtension | null>;
	getAllCompatibleVersions(extensionIdentifier: IExtensionIdentifier, includePreRelease: boolean, targetPlatform: TargetPlatform): Promise<IGalleryExtensionVersion[]>;
	getAllVersions(extensionIdentifier: IExtensionIdentifier): Promise<IGalleryExtensionVersion[]>;
	download(extension: IGalleryExtension, location: URI, operation: InstallOperation): Promise<void>;
	downloadSignatureArchive(extension: IGalleryExtension, location: URI): Promise<void>;
	reportStatistic(publisher: string, name: string, version: string, type: StatisticType): Promise<void>;
	getReadme(extension: IGalleryExtension, token: CancellationToken): Promise<string>;
	getManifest(extension: IGalleryExtension, token: CancellationToken): Promise<IExtensionManifest | null>;
	getChangelog(extension: IGalleryExtension, token: CancellationToken): Promise<string>;
	getCoreTranslation(extension: IGalleryExtension, languageId: string): Promise<ITranslation | null>;
	getExtensionsControlManifest(): Promise<IExtensionsControlManifest>;
}

export interface InstallExtensionEvent {
	readonly identifier: IExtensionIdentifier;
	readonly source: URI | IGalleryExtension;
	readonly profileLocation: URI;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}

export interface InstallExtensionResult {
	readonly identifier: IExtensionIdentifier;
	readonly operation: InstallOperation;
	readonly source?: URI | IGalleryExtension;
	readonly local?: ILocalExtension;
	readonly error?: Error;
	readonly context?: IStringDictionary<unknown>;
	readonly profileLocation: URI;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}

export interface UninstallExtensionEvent {
	readonly identifier: IExtensionIdentifier;
	readonly profileLocation: URI;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}

export interface DidUninstallExtensionEvent {
	readonly identifier: IExtensionIdentifier;
	readonly error?: string;
	readonly profileLocation: URI;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}

export interface DidUpdateExtensionMetadata {
	readonly profileLocation: URI;
	readonly local: ILocalExtension;
}

export const enum ExtensionGalleryErrorCode {
	Timeout = 'Timeout',
	Cancelled = 'Cancelled',
	ClientError = 'ClientError',
	ServerError = 'ServerError',
	Failed = 'Failed',
	DownloadFailedWriting = 'DownloadFailedWriting',
	Offline = 'Offline',
}

export class ExtensionGalleryError extends Error {
	constructor(message: string, readonly code: ExtensionGalleryErrorCode) {
		super(message);
		this.name = code;
	}
}

export const enum ExtensionManagementErrorCode {
	NotFound = 'NotFound',
	Unsupported = 'Unsupported',
	Deprecated = 'Deprecated',
	Malicious = 'Malicious',
	Incompatible = 'Incompatible',
	IncompatibleApi = 'IncompatibleApi',
	IncompatibleTargetPlatform = 'IncompatibleTargetPlatform',
	ReleaseVersionNotFound = 'ReleaseVersionNotFound',
	Invalid = 'Invalid',
	Download = 'Download',
	DownloadSignature = 'DownloadSignature',
	DownloadFailedWriting = ExtensionGalleryErrorCode.DownloadFailedWriting,
	UpdateMetadata = 'UpdateMetadata',
	Extract = 'Extract',
	Scanning = 'Scanning',
	ScanningExtension = 'ScanningExtension',
	ReadRemoved = 'ReadRemoved',
	UnsetRemoved = 'UnsetRemoved',
	Delete = 'Delete',
	Rename = 'Rename',
	IntializeDefaultProfile = 'IntializeDefaultProfile',
	AddToProfile = 'AddToProfile',
	InstalledExtensionNotFound = 'InstalledExtensionNotFound',
	PostInstall = 'PostInstall',
	CorruptZip = 'CorruptZip',
	IncompleteZip = 'IncompleteZip',
	PackageNotSigned = 'PackageNotSigned',
	SignatureVerificationInternal = 'SignatureVerificationInternal',
	SignatureVerificationFailed = 'SignatureVerificationFailed',
	NotAllowed = 'NotAllowed',
	Gallery = 'Gallery',
	Cancelled = 'Cancelled',
	Unknown = 'Unknown',
	Internal = 'Internal',
}

export enum ExtensionSignatureVerificationCode {
	'NotSigned' = 'NotSigned',
	'Success' = 'Success',
	'RequiredArgumentMissing' = 'RequiredArgumentMissing', // A required argument is missing.
	'InvalidArgument' = 'InvalidArgument', // An argument is invalid.
	'PackageIsUnreadable' = 'PackageIsUnreadable', // The extension package is unreadable.
	'UnhandledException' = 'UnhandledException', // An unhandled exception occurred.
	'SignatureManifestIsMissing' = 'SignatureManifestIsMissing', // The extension is missing a signature manifest file (.signature.manifest).
	'SignatureManifestIsUnreadable' = 'SignatureManifestIsUnreadable', // The signature manifest is unreadable.
	'SignatureIsMissing' = 'SignatureIsMissing', // The extension is missing a signature file (.signature.p7s).
	'SignatureIsUnreadable' = 'SignatureIsUnreadable', // The signature is unreadable.
	'CertificateIsUnreadable' = 'CertificateIsUnreadable', // The certificate is unreadable.
	'SignatureArchiveIsUnreadable' = 'SignatureArchiveIsUnreadable',
	'FileAlreadyExists' = 'FileAlreadyExists', // The output file already exists.
	'SignatureArchiveIsInvalidZip' = 'SignatureArchiveIsInvalidZip',
	'SignatureArchiveHasSameSignatureFile' = 'SignatureArchiveHasSameSignatureFile', // The signature archive has the same signature file.
	'PackageIntegrityCheckFailed' = 'PackageIntegrityCheckFailed', // The package integrity check failed.
	'SignatureIsInvalid' = 'SignatureIsInvalid', // The extension has an invalid signature file (.signature.p7s).
	'SignatureManifestIsInvalid' = 'SignatureManifestIsInvalid', // The extension has an invalid signature manifest file (.signature.manifest).
	'SignatureIntegrityCheckFailed' = 'SignatureIntegrityCheckFailed', // The extension's signature integrity check failed.  Extension integrity is suspect.
	'EntryIsMissing' = 'EntryIsMissing', // An entry referenced in the signature manifest was not found in the extension.
	'EntryIsTampered' = 'EntryIsTampered', // The integrity check for an entry referenced in the signature manifest failed.
	'Untrusted' = 'Untrusted', // An X.509 certificate in the extension signature is untrusted.
	'CertificateRevoked' = 'CertificateRevoked', // An X.509 certificate in the extension signature has been revoked.
	'SignatureIsNotValid' = 'SignatureIsNotValid', // The extension signature is invalid.
	'UnknownError' = 'UnknownError', // An unknown error occurred.
	'PackageIsInvalidZip' = 'PackageIsInvalidZip', // The extension package is not valid ZIP format.
	'SignatureArchiveHasTooManyEntries' = 'SignatureArchiveHasTooManyEntries', // The signature archive has too many entries.
}

export class ExtensionManagementError extends Error {
	constructor(message: string, readonly code: ExtensionManagementErrorCode) {
		super(message);
		this.name = code;
	}
}

export interface InstallExtensionSummary {
	failed: {
		id: string;
		installOptions: InstallOptions;
	}[];
}

export type InstallOptions = {
	isBuiltin?: boolean;
	isWorkspaceScoped?: boolean;
	isMachineScoped?: boolean;
	isApplicationScoped?: boolean;
	pinned?: boolean;
	donotIncludePackAndDependencies?: boolean;
	installGivenVersion?: boolean;
	preRelease?: boolean;
	installPreReleaseVersion?: boolean;
	donotVerifySignature?: boolean;
	operation?: InstallOperation;
	profileLocation?: URI;
	productVersion?: IProductVersion;
	keepExisting?: boolean;
	downloadExtensionsLocally?: boolean;
	/**
	 * Context passed through to InstallExtensionResult
	 */
	context?: IStringDictionary<unknown>;
};

export type UninstallOptions = {
	readonly profileLocation?: URI;
	readonly donotIncludePack?: boolean;
	readonly donotCheckDependents?: boolean;
	readonly versionOnly?: boolean;
	readonly remove?: boolean;
};

export interface IExtensionManagementParticipant {
	postInstall(local: ILocalExtension, source: URI | IGalleryExtension, options: InstallOptions, token: CancellationToken): Promise<void>;
	postUninstall(local: ILocalExtension, options: UninstallOptions, token: CancellationToken): Promise<void>;
}

export type InstallExtensionInfo = { readonly extension: IGalleryExtension; readonly options: InstallOptions };
export type UninstallExtensionInfo = { readonly extension: ILocalExtension; readonly options?: UninstallOptions };

export const IExtensionManagementService = createDecorator<IExtensionManagementService>('extensionManagementService');
export interface IExtensionManagementService {
	readonly _serviceBrand: undefined;

	readonly preferPreReleases: boolean;

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;
	onUninstallExtension: Event<UninstallExtensionEvent>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;
	onDidUpdateExtensionMetadata: Event<DidUpdateExtensionMetadata>;

	zip(extension: ILocalExtension): Promise<URI>;
	getManifest(vsix: URI): Promise<IExtensionManifest>;
	install(vsix: URI, options?: InstallOptions): Promise<ILocalExtension>;
	canInstall(extension: IGalleryExtension): Promise<true | IMarkdownString>;
	installFromGallery(extension: IGalleryExtension, options?: InstallOptions): Promise<ILocalExtension>;
	installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]>;
	installFromLocation(location: URI, profileLocation: URI): Promise<ILocalExtension>;
	installExtensionsFromProfile(extensions: IExtensionIdentifier[], fromProfileLocation: URI, toProfileLocation: URI): Promise<ILocalExtension[]>;
	uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void>;
	uninstallExtensions(extensions: UninstallExtensionInfo[]): Promise<void>;
	toggleApplicationScope(extension: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension>;
	getInstalled(type?: ExtensionType, profileLocation?: URI, productVersion?: IProductVersion, language?: string): Promise<ILocalExtension[]>;
	getExtensionsControlManifest(): Promise<IExtensionsControlManifest>;
	copyExtensions(fromProfileLocation: URI, toProfileLocation: URI): Promise<void>;
	updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, profileLocation: URI): Promise<ILocalExtension>;
	resetPinnedStateForAllUserExtensions(pinned: boolean): Promise<void>;

	download(extension: IGalleryExtension, operation: InstallOperation, donotVerifySignature: boolean): Promise<URI>;

	registerParticipant(pariticipant: IExtensionManagementParticipant): void;
	getTargetPlatform(): Promise<TargetPlatform>;

	cleanUp(): Promise<void>;
}

export const DISABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/disabled';
export const ENABLED_EXTENSIONS_STORAGE_PATH = 'extensionsIdentifiers/enabled';
export const IGlobalExtensionEnablementService = createDecorator<IGlobalExtensionEnablementService>('IGlobalExtensionEnablementService');

export interface IGlobalExtensionEnablementService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeEnablement: Event<{ readonly extensions: IExtensionIdentifier[]; readonly source?: string }>;

	getDisabledExtensions(): IExtensionIdentifier[];
	enableExtension(extension: IExtensionIdentifier, source?: string): Promise<boolean>;
	disableExtension(extension: IExtensionIdentifier, source?: string): Promise<boolean>;

}

export type IConfigBasedExtensionTip = {
	readonly extensionId: string;
	readonly extensionName: string;
	readonly isExtensionPack: boolean;
	readonly configName: string;
	readonly important: boolean;
	readonly whenNotInstalled?: string[];
};

export type IExecutableBasedExtensionTip = {
	readonly extensionId: string;
	readonly extensionName: string;
	readonly isExtensionPack: boolean;
	readonly exeName: string;
	readonly exeFriendlyName: string;
	readonly windowsPath?: string;
	readonly whenNotInstalled?: string[];
};

export const IExtensionTipsService = createDecorator<IExtensionTipsService>('IExtensionTipsService');
export interface IExtensionTipsService {
	readonly _serviceBrand: undefined;

	getConfigBasedTips(folder: URI): Promise<IConfigBasedExtensionTip[]>;
	getImportantExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]>;
	getOtherExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]>;
}

export type AllowedExtensionsConfigValueType = IStringDictionary<boolean | string | string[]>;

export const IAllowedExtensionsService = createDecorator<IAllowedExtensionsService>('IAllowedExtensionsService');
export interface IAllowedExtensionsService {
	readonly _serviceBrand: undefined;

	readonly allowedExtensionsConfigValue: AllowedExtensionsConfigValueType | undefined;
	readonly onDidChangeAllowedExtensionsConfigValue: Event<void>;

	isAllowed(extension: IGalleryExtension | IExtension): true | IMarkdownString;
	isAllowed(extension: { id: string; publisherDisplayName: string | undefined; version?: string; prerelease?: boolean; targetPlatform?: TargetPlatform }): true | IMarkdownString;
}

export async function computeSize(location: URI, fileService: IFileService): Promise<number> {
	let stat: IFileStat;
	try {
		stat = await fileService.resolve(location);
	} catch (e) {
		if ((<FileOperationError>e).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
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

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		id: 'extensions',
		order: 30,
		title: localize('extensionsConfigurationTitle', "Extensions"),
		type: 'object',
		properties: {
			[AllowedExtensionsConfigKey]: {
				// Note: Type is set only to object because to support policies generation during build time, where single type is expected.
				type: 'object',
				markdownDescription: localize('extensions.allowed', "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. For more information on how to configure this setting, please visit the [Configure Allowed Extensions](https://code.visualstudio.com/docs/setup/enterprise#_configure-allowed-extensions) section."),
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
				scope: ConfigurationScope.APPLICATION,
				policy: {
					name: 'AllowedExtensions',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.96',
					localization: {
						description: {
							key: 'extensions.allowed.policy',
							value: localize('extensions.allowed.policy', "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. More information: https://code.visualstudio.com/docs/setup/enterprise#_configure-allowed-extensions"),
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

export function shouldRequireRepositorySignatureFor(isPrivate: boolean, galleryManifest: IExtensionGalleryManifest | null): boolean {
	if (isPrivate) {
		return galleryManifest?.capabilities.signing?.allPrivateRepositorySigned === true;
	}
	return galleryManifest?.capabilities.signing?.allPublicRepositorySigned === true;
}

