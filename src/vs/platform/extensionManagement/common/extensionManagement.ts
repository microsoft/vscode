/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRequestContext } from 'vs/base/node/request';

export interface ICommand {
	command: string;
	title: string;
	category?: string;
}

export interface IConfigurationProperty {
	description: string;
	type: string | string[];
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
	contributes?: IExtensionContributions;
}

export interface IExtensionIdentity {
	name: string;
	publisher: string;
}

export interface IGalleryExtensionAssets {
	manifest: string;
	readme: string;
	download: string;
	icon: string;
	iconFallback: string;
	license: string;
}

export interface IGalleryExtension {
	id: string;
	name: string;
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
	downloadHeaders: { [key: string]: string; };
}

export interface IGalleryMetadata {
	id: string;
	publisherId: string;
	publisherDisplayName: string;
}

export interface ILocalExtension {
	id: string;
	manifest: IExtensionManifest;
	metadata: IGalleryMetadata;
	path: string;
	readmeUrl: string;
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
	AverageRating = 6
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
}

export interface IExtensionGalleryService {
	_serviceBrand: any;
	isEnabled(): boolean;
	query(options?: IQueryOptions): TPromise<IPager<IGalleryExtension>>;
	download(extension: IGalleryExtension): TPromise<string>;
	getAsset(url: string): TPromise<IRequestContext>;
}

export type InstallExtensionEvent = { id: string; gallery?: IGalleryExtension; };
export type DidInstallExtensionEvent = { id: string; local?: ILocalExtension; error?: Error; };

export interface IExtensionManagementService {
	_serviceBrand: any;

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<string>;
	onDidUninstallExtension: Event<string>;

	install(zipPath: string): TPromise<void>;
	installFromGallery(extension: IGalleryExtension): TPromise<void>;
	uninstall(extension: ILocalExtension): TPromise<void>;
	getInstalled(): TPromise<ILocalExtension[]>;
}

export const IExtensionTipsService = createDecorator<IExtensionTipsService>('extensionTipsService');

export interface IExtensionTipsService {
	_serviceBrand: any;
	getRecommendations(): string[];
}

export const ExtensionsLabel = nls.localize('extensions', "Extensions");
export const ExtensionsChannelId = 'extensions';