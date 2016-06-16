/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export interface IExtensionManifest {
	name: string;
	publisher: string;
	version: string;
	engines: { vscode: string };
	displayName?: string;
	description?: string;
	main?: string;
}

export interface IGalleryVersion {
	version: string;
	date: string;
	manifestUrl: string;
	readmeUrl: string;
	downloadUrl: string;
	iconUrl: string;
	downloadHeaders: { [key: string]: string; };
}

export interface IGalleryMetadata {
	galleryApiUrl: string;
	id: string;
	publisherId: string;
	publisherDisplayName: string;
	installCount: number;
	versions: IGalleryVersion[];
}

export interface IExtension extends IExtensionManifest {
	path?: string;
}

export interface IGalleryExtension extends IGalleryMetadata {
	manifest: IExtensionManifest;
		// name: galleryExtension.extensionName,
		// displayName: galleryExtension.displayName || galleryExtension.extensionName,
		// publisher: galleryExtension.publisher.publisherName,
		// version: versions[0].version,
		// engines: { vscode: void 0 }, // TODO: ugly
		// description: galleryExtension.shortDescription || '',
}

export const IExtensionManagementService = createDecorator<IExtensionManagementService>('extensionManagementService');
export const IExtensionGalleryService = createDecorator<IExtensionGalleryService>('extensionGalleryService');

export interface IQueryOptions {
	text?: string;
	ids?: string[];
	pageSize?: number;
}

export interface IQueryResult {
	firstPage: IGalleryExtension[];
	total: number;
	pageSize: number;
	getPage(pageNumber: number): TPromise<IGalleryExtension[]>;
}

export interface IExtensionGalleryService {
	serviceId: ServiceIdentifier<any>;
	isEnabled(): boolean;
	query(options?: IQueryOptions): TPromise<IQueryResult>;
}

export type DidInstallExtensionEvent = { id: string; error?: Error; };

export interface IExtensionManagementService {
	serviceId: ServiceIdentifier<any>;

	onInstallExtension: Event<string>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<string>;
	onDidUninstallExtension: Event<string>;

	install(extension: IGalleryExtension): TPromise<void>;
	install(zipPath: string): TPromise<void>;
	uninstall(extension: IExtension): TPromise<void>;
	getInstalled(includeDuplicateVersions?: boolean): TPromise<IExtension[]>;
}

export const IExtensionTipsService = createDecorator<IExtensionTipsService>('extensionTipsService');

export interface IExtensionTipsService {
	serviceId: ServiceIdentifier<IExtensionTipsService>;
	getRecommendations(): TPromise<IExtension[]>;
}

export const ExtensionsLabel = nls.localize('extensions', "Extensions");
export const ExtensionsChannelId = 'extensions';