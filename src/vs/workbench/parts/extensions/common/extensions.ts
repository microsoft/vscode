/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export interface IExtensionManifest {
	name: string;
	publisher: string;
	version: string;
	displayName?: string;
	description?: string;
}

export interface IGalleryInformation {
	galleryApiUrl: string;
	id: string;
	downloadUrl: string;
	publisherId: string;
	publisherDisplayName: string;
	installCount: number;
	date: string;
}

export interface IExtension extends IExtensionManifest {
	galleryInformation?: IGalleryInformation;
	path?: string;
}

export var IExtensionsService = createDecorator<IExtensionsService>('extensionsService');
export var IGalleryService = createDecorator<IGalleryService>('galleryService');

export interface IGalleryService {
	serviceId: ServiceIdentifier<any>;
	isEnabled(): boolean;
	query(): TPromise<IExtension[]>;
}

export interface IExtensionsService {
	serviceId: ServiceIdentifier<any>;
	onInstallExtension: Event<IExtensionManifest>;
	onDidInstallExtension: Event<IExtension>;
	onUninstallExtension: Event<IExtension>;
	onDidUninstallExtension: Event<IExtension>;

	install(extension: IExtension): TPromise<IExtension>;
	install(zipPath: string): TPromise<IExtension>;
	uninstall(extension: IExtension): TPromise<void>;
	getInstalled(includeDuplicateVersions?: boolean): TPromise<IExtension[]>;
}

export var IExtensionTipsService = createDecorator<IExtensionTipsService>('extensionTipsService');

export interface IExtensionTipsService {
	serviceId: ServiceIdentifier<any>;
	tips: IExtension[];
	onDidChangeTips: Event<IExtension[]>;
}