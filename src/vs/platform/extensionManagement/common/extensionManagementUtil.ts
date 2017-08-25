/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILocalExtension, IGalleryExtension, IExtensionManifest, EXTENSION_IDENTIFIER_REGEX, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

export function areSameExtensions(a: { id: string }, b: { id: string }): boolean {
	if (a.id === b.id) {
		return true;
	}
	return adoptToGalleryExtensionId(a.id) === adoptToGalleryExtensionId(b.id);
}

export function getGalleryExtensionId(publisher: string, name: string): string {
	return `${publisher}.${name.toLocaleLowerCase()}`;
}

export function getLocalExtensionIdFromGallery(extension: IGalleryExtension, version: string): string {
	return getLocalExtensionId(extension.id, version);
}

export function getLocalExtensionIdFromManifest(manifest: IExtensionManifest): string {
	return getLocalExtensionId(getGalleryExtensionId(manifest.publisher, manifest.name), manifest.version);
}

export function getGalleryExtensionIdFromLocal(local: ILocalExtension): string {
	return getGalleryExtensionId(local.manifest.publisher, local.manifest.name);
}

export function getIdAndVersionFromLocalExtensionId(localExtensionId: string): { id: string, version: string } {
	const matches = /^([^.]+\..+)-(\d+\.\d+\.\d+)$/.exec(localExtensionId);
	if (matches && matches[1] && matches[2]) {
		return { id: adoptToGalleryExtensionId(matches[1]), version: matches[2] };
	}
	return {
		id: adoptToGalleryExtensionId(localExtensionId),
		version: null
	};
}

export function adoptToGalleryExtensionId(id: string): string {
	return id.replace(EXTENSION_IDENTIFIER_REGEX, (match, publisher: string, name: string) => getGalleryExtensionId(publisher, name));
}

function getLocalExtensionId(id: string, version: string): string {
	return `${id}-${version}`;
}

export function getLocalExtensionTelemetryData(extension: ILocalExtension): any {
	return {
		id: getGalleryExtensionIdFromLocal(extension),
		name: extension.manifest.name,
		galleryId: null,
		publisherId: extension.metadata ? extension.metadata.publisherId : null,
		publisherName: extension.manifest.publisher,
		publisherDisplayName: extension.metadata ? extension.metadata.publisherDisplayName : null,
		dependencies: extension.manifest.extensionDependencies && extension.manifest.extensionDependencies.length > 0
	};
}

export function getGalleryExtensionTelemetryData(extension: IGalleryExtension): any {
	return {
		id: extension.id,
		name: extension.name,
		galleryId: extension.uuid,
		publisherId: extension.publisherId,
		publisherName: extension.publisher,
		publisherDisplayName: extension.publisherDisplayName,
		dependencies: extension.properties.dependencies.length > 0,
		...extension.telemetryData
	};
}


const BetterMergeCheckKey = 'extensions/bettermergecheck';
export const BetterMergeDisabledNowKey = 'extensions/bettermergedisablednow';
export const BetterMergeId = 'pprice.better-merge';

/**
 * Globally disabled extensions, taking care of disabling obsolete extensions.
 */
export function getGloballyDisabledExtensions(extensionEnablementService: IExtensionEnablementService, storageService: IStorageService, installedExtensions: { id: string; }[]) {
	const globallyDisabled = extensionEnablementService.getGloballyDisabledExtensions();
	if (!storageService.getBoolean(BetterMergeCheckKey, StorageScope.GLOBAL, false)) {
		storageService.store(BetterMergeCheckKey, true);
		if (globallyDisabled.indexOf(BetterMergeId) === -1 && installedExtensions.some(d => d.id === BetterMergeId)) {
			globallyDisabled.push(BetterMergeId);
			extensionEnablementService.setEnablement(BetterMergeId, false);
			storageService.store(BetterMergeDisabledNowKey, true);
		}
	}
	return globallyDisabled;
}