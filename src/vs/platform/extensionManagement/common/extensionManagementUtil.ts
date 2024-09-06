/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareIgnoreCase } from '../../../base/common/strings.js';
import { IExtensionIdentifier, IGalleryExtension, ILocalExtension, getTargetPlatform } from './extensionManagement.js';
import { ExtensionIdentifier, IExtension, TargetPlatform, UNDEFINED_PUBLISHER } from '../../extensions/common/extensions.js';
import { IFileService } from '../../files/common/files.js';
import { isLinux, platform } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { ILogService } from '../../log/common/log.js';
import { arch } from '../../../base/common/process.js';
import { TelemetryTrustedValue } from '../../telemetry/common/telemetryUtils.js';

export function areSameExtensions(a: IExtensionIdentifier, b: IExtensionIdentifier): boolean {
	if (a.uuid && b.uuid) {
		return a.uuid === b.uuid;
	}
	if (a.id === b.id) {
		return true;
	}
	return compareIgnoreCase(a.id, b.id) === 0;
}

const ExtensionKeyRegex = /^([^.]+\..+)-(\d+\.\d+\.\d+)(-(.+))?$/;

export class ExtensionKey {

	static create(extension: IExtension | IGalleryExtension): ExtensionKey {
		const version = (extension as IExtension).manifest ? (extension as IExtension).manifest.version : (extension as IGalleryExtension).version;
		const targetPlatform = (extension as IExtension).manifest ? (extension as IExtension).targetPlatform : (extension as IGalleryExtension).properties.targetPlatform;
		return new ExtensionKey(extension.identifier, version, targetPlatform);
	}

	static parse(key: string): ExtensionKey | null {
		const matches = ExtensionKeyRegex.exec(key);
		return matches && matches[1] && matches[2] ? new ExtensionKey({ id: matches[1] }, matches[2], matches[4] as TargetPlatform || undefined) : null;
	}

	readonly id: string;

	constructor(
		readonly identifier: IExtensionIdentifier,
		readonly version: string,
		readonly targetPlatform: TargetPlatform = TargetPlatform.UNDEFINED,
	) {
		this.id = identifier.id;
	}

	toString(): string {
		return `${this.id}-${this.version}${this.targetPlatform !== TargetPlatform.UNDEFINED ? `-${this.targetPlatform}` : ''}`;
	}

	equals(o: any): boolean {
		if (!(o instanceof ExtensionKey)) {
			return false;
		}
		return areSameExtensions(this, o) && this.version === o.version && this.targetPlatform === o.targetPlatform;
	}
}

const EXTENSION_IDENTIFIER_WITH_VERSION_REGEX = /^([^.]+\..+)@((prerelease)|(\d+\.\d+\.\d+(-.*)?))$/;
export function getIdAndVersion(id: string): [string, string | undefined] {
	const matches = EXTENSION_IDENTIFIER_WITH_VERSION_REGEX.exec(id);
	if (matches && matches[1]) {
		return [adoptToGalleryExtensionId(matches[1]), matches[2]];
	}
	return [adoptToGalleryExtensionId(id), undefined];
}

export function getExtensionId(publisher: string, name: string): string {
	return `${publisher}.${name}`;
}

export function adoptToGalleryExtensionId(id: string): string {
	return id.toLowerCase();
}

export function getGalleryExtensionId(publisher: string | undefined, name: string): string {
	return adoptToGalleryExtensionId(getExtensionId(publisher ?? UNDEFINED_PUBLISHER, name));
}

export function groupByExtension<T>(extensions: T[], getExtensionIdentifier: (t: T) => IExtensionIdentifier): T[][] {
	const byExtension: T[][] = [];
	const findGroup = (extension: T) => {
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
		id: extension.identifier.id,
		name: extension.manifest.name,
		galleryId: null,
		publisherId: extension.publisherId,
		publisherName: extension.manifest.publisher,
		publisherDisplayName: extension.publisherDisplayName,
		dependencies: extension.manifest.extensionDependencies && extension.manifest.extensionDependencies.length > 0
	};
}


/* __GDPR__FRAGMENT__
	"GalleryExtensionTelemetryData" : {
		"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"name": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"version": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"galleryId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"publisherId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"publisherName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"publisherDisplayName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"isPreReleaseVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"dependencies": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"isSigned": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"${include}": [
			"${GalleryExtensionTelemetryData2}"
		]
	}
*/
export function getGalleryExtensionTelemetryData(extension: IGalleryExtension): any {
	return {
		id: new TelemetryTrustedValue(extension.identifier.id),
		name: new TelemetryTrustedValue(extension.name),
		version: extension.version,
		galleryId: extension.identifier.uuid,
		publisherId: extension.publisherId,
		publisherName: extension.publisher,
		publisherDisplayName: extension.publisherDisplayName,
		isPreReleaseVersion: extension.properties.isPreReleaseVersion,
		dependencies: !!(extension.properties.dependencies && extension.properties.dependencies.length > 0),
		isSigned: extension.isSigned,
		...extension.telemetryData
	};
}

export const BetterMergeId = new ExtensionIdentifier('pprice.better-merge');

export function getExtensionDependencies(installedExtensions: ReadonlyArray<IExtension>, extension: IExtension): IExtension[] {
	const dependencies: IExtension[] = [];
	const extensions = extension.manifest.extensionDependencies?.slice(0) ?? [];

	while (extensions.length) {
		const id = extensions.shift();

		if (id && dependencies.every(e => !areSameExtensions(e.identifier, { id }))) {
			const ext = installedExtensions.filter(e => areSameExtensions(e.identifier, { id }));
			if (ext.length === 1) {
				dependencies.push(ext[0]);
				extensions.push(...ext[0].manifest.extensionDependencies?.slice(0) ?? []);
			}
		}
	}

	return dependencies;
}

async function isAlpineLinux(fileService: IFileService, logService: ILogService): Promise<boolean> {
	if (!isLinux) {
		return false;
	}
	let content: string | undefined;
	try {
		const fileContent = await fileService.readFile(URI.file('/etc/os-release'));
		content = fileContent.value.toString();
	} catch (error) {
		try {
			const fileContent = await fileService.readFile(URI.file('/usr/lib/os-release'));
			content = fileContent.value.toString();
		} catch (error) {
			/* Ignore */
			logService.debug(`Error while getting the os-release file.`, getErrorMessage(error));
		}
	}
	return !!content && (content.match(/^ID=([^\u001b\r\n]*)/m) || [])[1] === 'alpine';
}

export async function computeTargetPlatform(fileService: IFileService, logService: ILogService): Promise<TargetPlatform> {
	const alpineLinux = await isAlpineLinux(fileService, logService);
	const targetPlatform = getTargetPlatform(alpineLinux ? 'alpine' : platform, arch);
	logService.debug('ComputeTargetPlatform:', targetPlatform);
	return targetPlatform;
}
