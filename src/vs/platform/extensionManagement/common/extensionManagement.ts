/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILocalization } from 'vs/platform/localizations/common/localizations';
import URI from 'vs/base/common/uri';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';

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
	configuration?: IConfiguration;
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
	activationEvents?: string[];
	extensionDependencies?: string[];
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
	engine?: string;
}

export interface IGalleryExtensionAsset {
	uri: string;
	fallbackUri: string;
}

export interface IGalleryExtensionAssets {
	manifest: IGalleryExtensionAsset;
	readme: IGalleryExtensionAsset;
	changelog: IGalleryExtensionAsset;
	download: IGalleryExtensionAsset;
	icon: IGalleryExtensionAsset;
	license: IGalleryExtensionAsset;
	repository: IGalleryExtensionAsset;
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

export interface IGalleryExtension {
	name: string;
	identifier: IExtensionIdentifier;
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

export enum LocalExtensionType {
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
	readmeUrl: string;
	changelogUrl: string;
}

export const IExtensionManagementService = createDecorator<IExtensionManagementService>('extensionManagementService');
export const IExtensionGalleryService = createDecorator<IExtensionGalleryService>('extensionGalleryService');

export enum SortBy {
	NoneOrRelevance = 0,
	LastUpdatedDate = 1,
	Title = 2,
	PublisherName = 3,
	InstallCount = 4,
	PublishedDate = 5,
	AverageRating = 6,
	WeightedRating = 12
}

export enum SortOrder {
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

export enum StatisticType {
	Uninstall = 'uninstall'
}

export interface IReportedExtension {
	id: IExtensionIdentifier;
	malicious: boolean;
}

export enum InstallOperation {
	Install = 1,
	Update
}

export interface ITranslation {
	contents: { [key: string]: {} };
}

export interface IExtensionGalleryService {
	_serviceBrand: any;
	isEnabled(): boolean;
	query(options?: IQueryOptions): TPromise<IPager<IGalleryExtension>>;
	download(extension: IGalleryExtension, operation: InstallOperation): TPromise<string>;
	reportStatistic(publisher: string, name: string, version: string, type: StatisticType): TPromise<void>;
	getReadme(extension: IGalleryExtension): TPromise<string>;
	getManifest(extension: IGalleryExtension): TPromise<IExtensionManifest>;
	getChangelog(extension: IGalleryExtension): TPromise<string>;
	getCoreTranslation(extension: IGalleryExtension, languageId: string): TPromise<ITranslation>;
	loadCompatibleVersion(extension: IGalleryExtension): TPromise<IGalleryExtension>;
	loadAllDependencies(dependencies: IExtensionIdentifier[]): TPromise<IGalleryExtension[]>;
	getExtensionsReport(): TPromise<IReportedExtension[]>;
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

export interface IExtensionManagementService {
	_serviceBrand: any;

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<IExtensionIdentifier>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	install(zipPath: string): TPromise<void>;
	installFromGallery(extension: IGalleryExtension): TPromise<void>;
	uninstall(extension: ILocalExtension, force?: boolean): TPromise<void>;
	reinstallFromGallery(extension: ILocalExtension): TPromise<void>;
	getInstalled(type?: LocalExtensionType): TPromise<ILocalExtension[]>;
	getExtensionsReport(): TPromise<IReportedExtension[]>;

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): TPromise<ILocalExtension>;
}

export const IExtensionManagementServerService = createDecorator<IExtensionManagementServerService>('extensionManagementServerService');

export interface IExtensionManagementServer {
	extensionManagementService: IExtensionManagementService;
	location: URI;
}

export interface IExtensionManagementServerService {
	_serviceBrand: any;
	readonly extensionManagementServers: IExtensionManagementServer[];
	getDefaultExtensionManagementServer(): IExtensionManagementServer;
	getExtensionManagementServer(location: URI): IExtensionManagementServer;
}

export enum EnablementState {
	Disabled,
	WorkspaceDisabled,
	Enabled,
	WorkspaceEnabled
}

export const IExtensionEnablementService = createDecorator<IExtensionEnablementService>('extensionEnablementService');

// TODO: @sandy: Merge this into IExtensionManagementService when we have a storage service available in Shared process
export interface IExtensionEnablementService {
	_serviceBrand: any;

	/**
	 * Event to listen on for extension enablement changes
	 */
	onEnablementChanged: Event<IExtensionIdentifier>;

	/**
	 * Returns all disabled extension identifiers for current workspace
	 * Returns an empty array if none exist
	 */
	getDisabledExtensions(): TPromise<IExtensionIdentifier[]>;

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
	setEnablement(extension: ILocalExtension, state: EnablementState): TPromise<boolean>;
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
	getOtherRecommendations(): TPromise<IExtensionRecommendation[]>;
	getWorkspaceRecommendations(): TPromise<IExtensionRecommendation[]>;
	getKeymapRecommendations(): IExtensionRecommendation[];
	getAllRecommendations(): TPromise<IExtensionRecommendation[]>;
	getKeywordsForExtension(extension: string): string[];
	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean): void;
	getAllIgnoredRecommendations(): { global: string[], workspace: string[] };
	onRecommendationChange: Event<RecommendationChangeNotification>;
}

export enum ExtensionRecommendationReason {
	Workspace,
	File,
	Executable,
	DynamicWorkspace,
	Experimental
}

export const ExtensionsLabel = localize('extensions', "Extensions");
export const ExtensionsChannelId = 'extensions';
export const PreferencesLabel = localize('preferences', "Preferences");
