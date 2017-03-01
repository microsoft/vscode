/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILocalExtension, IGalleryExtension, IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';

export function getGalleryExtensionId(publisher: string, name: string): string {
	return adoptToGalleryExtensioId(`${publisher}.${name}`);
}

export function getLocalExtensionIdFromGallery(extension: IGalleryExtension, version: string): string {
	return getLocalExtensionId(extension.id, version);
}

export function getLocalExtensionIdFromManifest(manifest: IExtensionManifest): string {
	return getLocalExtensionId(getGalleryExtensionId(manifest.publisher, manifest.name), manifest.version);
}

export function getGalleryExtensionIdFromLocal(local: ILocalExtension): string {
	return adoptToGalleryExtensioId(local.id.replace(/-\d+\.\d+\.\d+$/, ''));
}

export function getIdAndVersionFromLocalExtensionId(localExtensionId: string): { id: string, version: string } {
	const matches = /^([^.]+\..+)-(\d+\.\d+\.\d+)$/.exec(localExtensionId);
	return matches ? { id: matches[1] ? adoptToGalleryExtensioId(matches[1]) : null, version: matches[2] } : { id: null, version: null };
}

export function adoptToGalleryExtensioId(id: string): string {
	return id.toLocaleLowerCase();
}

export function areSameExtensions(a: { id: string }, b: { id: string }): boolean {
	return adoptToGalleryExtensioId(a.id) === adoptToGalleryExtensioId(b.id);
}

function getLocalExtensionId(id: string, version: string): string {
	return `${id}-${version}`;
}

export function getLocalExtensionTelemetryData(extension: ILocalExtension): any {
	return {
		id: getGalleryExtensionIdFromLocal(extension),
		name: extension.manifest.name,
		galleryId: extension.metadata ? extension.metadata.uuid : null,
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
		dependencies: extension.properties.dependencies.length > 0
	};
}