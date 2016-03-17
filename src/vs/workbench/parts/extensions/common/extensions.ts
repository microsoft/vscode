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
	downloadUrl: string;
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
	galleryInformation?: IGalleryMetadata;
	path?: string;
}

export const IExtensionsService = createDecorator<IExtensionsService>('extensionsService');
export const IGalleryService = createDecorator<IGalleryService>('galleryService');

export interface IGalleryService {
	serviceId: ServiceIdentifier<any>;
	isEnabled(): boolean;
	query(): TPromise<IExtension[]>;
}

export interface IExtensionsService {
	serviceId: ServiceIdentifier<any>;
	onInstallExtension: Event<IExtensionManifest>;
	onDidInstallExtension: Event<{ extension: IExtension; error?: Error; }>;
	onUninstallExtension: Event<IExtension>;
	onDidUninstallExtension: Event<IExtension>;

	install(extension: IExtension): TPromise<IExtension>;
	install(zipPath: string): TPromise<IExtension>;
	uninstall(extension: IExtension): TPromise<void>;
	getInstalled(includeDuplicateVersions?: boolean): TPromise<IExtension[]>;
}

export const IExtensionTipsService = createDecorator<IExtensionTipsService>('extensionTipsService');

export interface IExtensionTipsService {
	serviceId: ServiceIdentifier<any>;
	getRecommendations(): TPromise<IExtension[]>;
}

export const ExtensionsLabel = nls.localize('extensions', "Extensions");