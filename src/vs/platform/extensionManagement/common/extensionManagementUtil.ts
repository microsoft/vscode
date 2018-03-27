/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILocalExtension, IGalleryExtension, EXTENSION_IDENTIFIER_REGEX, IExtensionIdentifier, IReportedExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export function areSameExtensions(a: IExtensionIdentifier, b: IExtensionIdentifier): boolean {
	if (a.uuid && b.uuid) {
		return a.uuid === b.uuid;
	}
	if (a.id === b.id) {
		return true;
	}
	return adoptToGalleryExtensionId(a.id) === adoptToGalleryExtensionId(b.id);
}

export function getGalleryExtensionId(publisher: string, name: string): string {
	return `${publisher}.${name.toLocaleLowerCase()}`;
}

export function getGalleryExtensionIdFromLocal(local: ILocalExtension): string {
	return local.manifest ? getGalleryExtensionId(local.manifest.publisher, local.manifest.name) : local.identifier.id;
}

export const LOCAL_EXTENSION_ID_REGEX = /^([^.]+\..+)-(\d+\.\d+\.\d+(-.*)?)$/;

export function getIdFromLocalExtensionId(localExtensionId: string): string {
	const matches = LOCAL_EXTENSION_ID_REGEX.exec(localExtensionId);
	if (matches && matches[1]) {
		return adoptToGalleryExtensionId(matches[1]);
	}
	return adoptToGalleryExtensionId(localExtensionId);
}

export function adoptToGalleryExtensionId(id: string): string {
	return id.replace(EXTENSION_IDENTIFIER_REGEX, (match, publisher: string, name: string) => getGalleryExtensionId(publisher, name));
}

export function getLocalExtensionId(id: string, version: string): string {
	return `${id}-${version}`;
}

export function groupByExtension<T>(extensions: T[], getExtensionIdentifier: (t: T) => IExtensionIdentifier): T[][] {
	const byExtension: T[][] = [];
	const findGroup = extension => {
		for (const group of byExtension) {
			if (group.some(e => areSameExtensions(getExtensionIdentifier(e), getExtensionIdentifier(extension)))) {
				return group;
			}
		}
		return null;
	};
	for (const extension of extensions) {
		const group = findGroup(extension);
		if (group) {
			group.push(extension);
		} else {
			byExtension.push([extension]);
		}
	}
	return byExtension;
}

export function getLocalExtensionTelemetryData(extension: ILocalExtension): any {
	return {
		id: getGalleryExtensionIdFromLocal(extension),
		name: extension.manifest.name,
		galleryId: null,
		dependencies: extension.manifest.extensionDependencies && extension.manifest.extensionDependencies.length > 0
	};
}


/* __GDPR__FRAGMENT__
	"GalleryExtensionTelemetryData" : {
		"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"name": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"galleryId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"publisherId": { "classification": "PublicPersonalData", "purpose": "FeatureInsight" },
		"publisherName": { "classification": "PublicPersonalData", "purpose": "FeatureInsight" },
		"publisherDisplayName": { "classification": "PublicPersonalData", "purpose": "FeatureInsight" },
		"galleryPublisherId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
		"galleryPublisherName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
		"galleryPublisherDisplayName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
		"dependencies": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"${include}": [
			"${GalleryExtensionTelemetryData2}"
		]
	}
*/
export function getGalleryExtensionTelemetryData(extension: IGalleryExtension): any {
	return {
		id: extension.identifier.id,
		name: extension.name,
		galleryId: extension.identifier.uuid,
		publisherId: extension.publisherId,
		publisherName: extension.publisher,
		publisherDisplayName: extension.publisherDisplayName,
		galleryPublisherId: extension.publisherId,
		galleryPublisherName: extension.publisher,
		galleryPublisherDisplayName: extension.publisherDisplayName,
		dependencies: extension.properties.dependencies.length > 0,
		...extension.telemetryData
	};
}

export const BetterMergeDisabledNowKey = 'extensions/bettermergedisablednow';
export const BetterMergeId = 'pprice.better-merge';

export function getMaliciousExtensionsSet(report: IReportedExtension[]): Set<string> {
	const result = new Set<string>();

	for (const extension of report) {
		if (extension.malicious) {
			result.add(extension.id.id);
		}
	}

	return result;
}