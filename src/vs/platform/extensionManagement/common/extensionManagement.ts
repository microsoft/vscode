/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionManifest, IExtension, ExtensionType } from 'vs/platform/extensions/common/extensions';

export const EXTENSION_IDENTIFIER_PATTERN = '^([a-z0-9A-Z][a-z0-9\-A-Z]*)\\.([a-z0-9A-Z][a-z0-9\-A-Z]*)$';
export const EXTENSION_IDENTIFIER_REGEX = new RegExp(EXTENSION_IDENTIFIER_PATTERN);

export interface IGalleryExtensionProperties {
	dependencies?: string[];
	extensionPack?: string[];
	engine?: string;
	localizedLanguages?: string[];
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
	icon: IGalleryExtensionAsset;
	coreTranslations: { [languageId: string]: IGalleryExtensionAsset };
}

export function isIExtensionIdentifier(thing: any): thing is IExtensionIdentifier {
	return thing
		&& typeof thing === 'object'
		&& typeof thing.id === 'string'
		&& (!thing.uuid || typeof thing.uuid === 'string');
}

/* __GDPR__FRAGMENT__
	"ExtensionIdentifier" : {
		"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"uuid": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	}
 */
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
}

export interface IGalleryExtension {
	name: string;
	identifier: IGalleryExtensionIdentifier;
	version: string;
	date: string;
	displayName: string;
	publisherId: string;
	publisher: string;
	publisherDisplayName: string;
	description: string;
	installCount: number;
	rating: number;
	ratingCount: number;
	assets: IGalleryExtensionAssets;
	properties: IGalleryExtensionProperties;
	telemetryData: any;
	preview: boolean;
}

export interface IGalleryMetadata {
	id: string;
	publisherId: string;
	publisherDisplayName: string;
}

export interface ILocalExtension extends IExtension {
	readonly manifest: IExtensionManifest;
	metadata: IGalleryMetadata;
	readmeUrl: URI | null;
	changelogUrl: URI | null;
}

export const IExtensionManagementService = createDecorator<IExtensionManagementService>('extensionManagementService');
export const IExtensionGalleryService = createDecorator<IExtensionGalleryService>('extensionGalleryService');

export const enum SortBy {
	NoneOrRelevance = 0,
	LastUpdatedDate = 1,
	Title = 2,
	PublisherName = 3,
	InstallCount = 4,
	PublishedDate = 5,
	AverageRating = 6,
	WeightedRating = 12
}

export const enum SortOrder {
	Default = 0,
	Ascending = 1,
	Descending = 2
}

export interface IQueryOptions {
	text?: string;
	ids?: string[];
	names?: string[];
	pageSize?: number;
	sortBy?: SortBy;
	sortOrder?: SortOrder;
	source?: string;
}

export const enum StatisticType {
	Uninstall = 'uninstall'
}

export interface IReportedExtension {
	id: IExtensionIdentifier;
	malicious: boolean;
}

export const enum InstallOperation {
	None = 0,
	Install,
	Update
}

export interface ITranslation {
	contents: { [key: string]: {} };
}

export interface IExtensionGalleryService {
	_serviceBrand: any;
	isEnabled(): boolean;
	query(token: CancellationToken): Promise<IPager<IGalleryExtension>>;
	query(options: IQueryOptions, token: CancellationToken): Promise<IPager<IGalleryExtension>>;
	download(extension: IGalleryExtension, operation: InstallOperation): Promise<string>;
	reportStatistic(publisher: string, name: string, version: string, type: StatisticType): Promise<void>;
	getReadme(extension: IGalleryExtension, token: CancellationToken): Promise<string>;
	getManifest(extension: IGalleryExtension, token: CancellationToken): Promise<IExtensionManifest | null>;
	getChangelog(extension: IGalleryExtension, token: CancellationToken): Promise<string>;
	getCoreTranslation(extension: IGalleryExtension, languageId: string): Promise<ITranslation | null>;
	getAllVersions(extension: IGalleryExtension, compatible: boolean): Promise<IGalleryExtensionVersion[]>;
	getExtensionsReport(): Promise<IReportedExtension[]>;
	getCompatibleExtension(extension: IGalleryExtension): Promise<IGalleryExtension | null>;
	getCompatibleExtension(id: IExtensionIdentifier, version?: string): Promise<IGalleryExtension | null>;
}

export interface InstallExtensionEvent {
	identifier: IExtensionIdentifier;
	zipPath?: string;
	gallery?: IGalleryExtension;
}

export interface DidInstallExtensionEvent {
	identifier: IExtensionIdentifier;
	operation: InstallOperation;
	zipPath?: string;
	gallery?: IGalleryExtension;
	local?: ILocalExtension;
	error?: string;
}

export interface DidUninstallExtensionEvent {
	identifier: IExtensionIdentifier;
	error?: string;
}

export const INSTALL_ERROR_MALICIOUS = 'malicious';
export const INSTALL_ERROR_INCOMPATIBLE = 'incompatible';

export interface IExtensionManagementService {
	_serviceBrand: any;

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<IExtensionIdentifier>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	zip(extension: ILocalExtension): Promise<URI>;
	unzip(zipLocation: URI, type: ExtensionType): Promise<IExtensionIdentifier>;
	install(vsix: URI): Promise<IExtensionIdentifier>;
	installFromGallery(extension: IGalleryExtension): Promise<void>;
	uninstall(extension: ILocalExtension, force?: boolean): Promise<void>;
	reinstallFromGallery(extension: ILocalExtension): Promise<void>;
	getInstalled(type?: ExtensionType): Promise<ILocalExtension[]>;
	getExtensionsReport(): Promise<IReportedExtension[]>;

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension>;
}

export const IExtensionManagementServerService = createDecorator<IExtensionManagementServerService>('extensionManagementServerService');

export interface IExtensionManagementServer {
	extensionManagementService: IExtensionManagementService;
	authority: string;
	label: string;
}

export interface IExtensionManagementServerService {
	_serviceBrand: any;
	readonly localExtensionManagementServer: IExtensionManagementServer;
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null;
	getExtensionManagementServer(location: URI): IExtensionManagementServer | null;
}

export const enum EnablementState {
	Disabled,
	WorkspaceDisabled,
	Enabled,
	WorkspaceEnabled
}

export const IExtensionEnablementService = createDecorator<IExtensionEnablementService>('extensionEnablementService');

export interface IExtensionEnablementService {
	_serviceBrand: any;

	readonly allUserExtensionsDisabled: boolean;

	/**
	 * Event to listen on for extension enablement changes
	 */
	onEnablementChanged: Event<IExtension[]>;

	/**
	 * Returns the enablement state for the given extension
	 */
	getEnablementState(extension: IExtension): EnablementState;

	/**
	 * Returns `true` if the enablement can be changed.
	 */
	canChangeEnablement(extension: IExtension): boolean;

	/**
	 * Returns `true` if the given extension identifier is enabled.
	 */
	isEnabled(extension: IExtension): boolean;

	/**
	 * Enable or disable the given extension.
	 * if `workspace` is `true` then enablement is done for workspace, otherwise globally.
	 *
	 * Returns a promise that resolves to boolean value.
	 * if resolves to `true` then requires restart for the change to take effect.
	 *
	 * Throws error if enablement is requested for workspace and there is no workspace
	 */
	setEnablement(extensions: IExtension[], state: EnablementState): Promise<boolean[]>;
}

export interface IExtensionsConfigContent {
	recommendations: string[];
	unwantedRecommendations: string[];
}

export type RecommendationChangeNotification = {
	extensionId: string,
	isRecommended: boolean
};

export type DynamicRecommendation = 'dynamic';
export type ExecutableRecommendation = 'executable';
export type CachedRecommendation = 'cached';
export type ApplicationRecommendation = 'application';
export type ExtensionRecommendationSource = IWorkspace | IWorkspaceFolder | URI | DynamicRecommendation | ExecutableRecommendation | CachedRecommendation | ApplicationRecommendation;

export interface IExtensionRecommendation {
	extensionId: string;
	sources: ExtensionRecommendationSource[];
}

export const IExtensionTipsService = createDecorator<IExtensionTipsService>('extensionTipsService');

export interface IExtensionTipsService {
	_serviceBrand: any;
	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; };
	getFileBasedRecommendations(): IExtensionRecommendation[];
	getOtherRecommendations(): Promise<IExtensionRecommendation[]>;
	getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]>;
	getKeymapRecommendations(): IExtensionRecommendation[];
	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean): void;
	getAllIgnoredRecommendations(): { global: string[], workspace: string[] };
	onRecommendationChange: Event<RecommendationChangeNotification>;
}

export const enum ExtensionRecommendationReason {
	Workspace,
	File,
	Executable,
	DynamicWorkspace,
	Experimental
}

export const ExtensionsLabel = localize('extensions', "Extensions");
export const ExtensionsChannelId = 'extensions';
export const PreferencesLabel = localize('preferences', "Preferences");
