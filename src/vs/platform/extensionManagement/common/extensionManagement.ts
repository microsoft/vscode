/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILocalization } from 'vs/platform/localizations/common/localizations';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { CancellationToken } from 'vs/base/common/cancellation';

export const EXTENSION_IDENTIFIER_PATTERN = '^([a-z0-9A-Z][a-z0-9\-A-Z]*)\\.([a-z0-9A-Z][a-z0-9\-A-Z]*)$';
export const EXTENSION_IDENTIFIER_REGEX = new RegExp(EXTENSION_IDENTIFIER_PATTERN);

export interface ICommand {
	command: string;
	title: string;
	category?: string;
}

export interface IConfigurationProperty {
	description: string;
	type: string | string[];
	default?: any;
}

export interface IConfiguration {
	properties: { [key: string]: IConfigurationProperty; };
}

export interface IDebugger {
	label?: string;
	type: string;
	runtime: string;
}

export interface IGrammar {
	language: string;
}

export interface IJSONValidation {
	fileMatch: string;
	url: string;
}

export interface IKeyBinding {
	command: string;
	key: string;
	when?: string;
	mac?: string;
	linux?: string;
	win?: string;
}

export interface ILanguage {
	id: string;
	extensions: string[];
	aliases: string[];
}

export interface IMenu {
	command: string;
	alt?: string;
	when?: string;
	group?: string;
}

export interface ISnippet {
	language: string;
}

export interface ITheme {
	label: string;
}

export interface IViewContainer {
	id: string;
	title: string;
}

export interface IView {
	id: string;
	name: string;
}

export interface IColor {
	id: string;
	description: string;
	defaults: { light: string, dark: string, highContrast: string };
}

export interface IExtensionContributions {
	commands?: ICommand[];
	configuration?: IConfiguration | IConfiguration[];
	debuggers?: IDebugger[];
	grammars?: IGrammar[];
	jsonValidation?: IJSONValidation[];
	keybindings?: IKeyBinding[];
	languages?: ILanguage[];
	menus?: { [context: string]: IMenu[] };
	snippets?: ISnippet[];
	themes?: ITheme[];
	iconThemes?: ITheme[];
	viewsContainers?: { [location: string]: IViewContainer[] };
	views?: { [location: string]: IView[] };
	colors?: IColor[];
	localizations?: ILocalization[];
}

export type ExtensionKind = 'ui' | 'workspace';

export interface IExtensionManifest {
	name: string;
	publisher: string;
	version: string;
	engines: { vscode: string };
	displayName?: string;
	description?: string;
	main?: string;
	icon?: string;
	categories?: string[];
	keywords?: string[];
	activationEvents?: string[];
	extensionDependencies?: string[];
	extensionPack?: string[];
	extensionKind?: ExtensionKind;
	contributes?: IExtensionContributions;
	repository?: {
		url: string;
	};
	bugs?: {
		url: string;
	};
}

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

export const enum LocalExtensionType {
	System,
	User
}

export interface ILocalExtension {
	type: LocalExtensionType;
	identifier: IExtensionIdentifier;
	galleryIdentifier: IExtensionIdentifier;
	manifest: IExtensionManifest;
	metadata: IGalleryMetadata;
	location: URI;
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
	query(options?: IQueryOptions): Promise<IPager<IGalleryExtension>>;
	download(extension: IGalleryExtension, operation: InstallOperation): Promise<string>;
	reportStatistic(publisher: string, name: string, version: string, type: StatisticType): Promise<void>;
	getReadme(extension: IGalleryExtension, token: CancellationToken): Promise<string>;
	getManifest(extension: IGalleryExtension, token: CancellationToken): Promise<IExtensionManifest | null>;
	getChangelog(extension: IGalleryExtension, token: CancellationToken): Promise<string>;
	getCoreTranslation(extension: IGalleryExtension, languageId: string): Promise<ITranslation | null>;
	loadCompatibleVersion(extension: IGalleryExtension, fromVersion?: string): Promise<IGalleryExtension | null>;
	getAllVersions(extension: IGalleryExtension, compatible: boolean): Promise<IGalleryExtensionVersion[]>;
	loadAllDependencies(dependencies: IExtensionIdentifier[], token: CancellationToken): Promise<IGalleryExtension[]>;
	getExtensionsReport(): Promise<IReportedExtension[]>;
	getExtension(id: IExtensionIdentifier, version?: string): Promise<IGalleryExtension | null>;
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
	unzip(zipLocation: URI, type: LocalExtensionType): Promise<IExtensionIdentifier>;
	install(vsix: URI): Promise<IExtensionIdentifier>;
	installFromGallery(extension: IGalleryExtension): Promise<void>;
	uninstall(extension: ILocalExtension, force?: boolean): Promise<void>;
	reinstallFromGallery(extension: ILocalExtension): Promise<void>;
	getInstalled(type?: LocalExtensionType): Promise<ILocalExtension[]>;
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
	onEnablementChanged: Event<IExtensionIdentifier>;

	/**
	 * Returns all disabled extension identifiers for current workspace
	 * Returns an empty array if none exist
	 */
	getDisabledExtensions(): Promise<IExtensionIdentifier[]>;

	/**
	 * Returns the enablement state for the given extension
	 */
	getEnablementState(extension: ILocalExtension): EnablementState;

	/**
	 * Returns `true` if the enablement can be changed.
	 */
	canChangeEnablement(extension: ILocalExtension): boolean;

	/**
	 * Returns `true` if the given extension identifier is enabled.
	 */
	isEnabled(extension: ILocalExtension): boolean;

	/**
	 * Enable or disable the given extension.
	 * if `workspace` is `true` then enablement is done for workspace, otherwise globally.
	 *
	 * Returns a promise that resolves to boolean value.
	 * if resolves to `true` then requires restart for the change to take effect.
	 *
	 * Throws error if enablement is requested for workspace and there is no workspace
	 */
	setEnablement(extension: ILocalExtension, state: EnablementState): Promise<boolean>;
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
