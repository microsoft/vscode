/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtensionIdentity, ILocalExtension, IGalleryExtension, IExtensionManagementService, IExtensionGalleryService, LocalExtensionType } from 'vs/platform/extensionManagement/common/extensionManagement';
import { TPromise } from 'vs/base/common/winjs.base';
import * as semver from 'semver';

export function extensionEquals(one: IExtensionIdentity, other: IExtensionIdentity): boolean {
	return one.publisher === other.publisher && one.name === other.name;
}

export function getTelemetryData(extension: ILocalExtension | IGalleryExtension) {
	const local = extension as ILocalExtension;
	const gallery = extension as IGalleryExtension;

	if (local.path) {
		return {
			id: `${local.manifest.publisher}.${local.manifest.name}`,
			name: local.manifest.name,
			galleryId: local.metadata ? local.metadata.id : null,
			publisherId: local.metadata ? local.metadata.publisherId : null,
			publisherName: local.manifest.publisher,
			publisherDisplayName: local.metadata ? local.metadata.publisherDisplayName : null
		};
	} else {
		return {
			id: `${gallery.publisher}.${gallery.name}`,
			name: gallery.name,
			galleryId: gallery.id,
			publisherId: gallery.publisherId,
			publisherName: gallery.publisher,
			publisherDisplayName: gallery.publisherDisplayName
		};
	}
}

export function getOutdatedExtensions(extensionsService: IExtensionManagementService, galleryService: IExtensionGalleryService): TPromise<ILocalExtension[]> {
	if (!galleryService.isEnabled()) {
		return TPromise.as([]);
	}

	return extensionsService.getInstalled(LocalExtensionType.User).then(installed => {
		const names = installed.map(({ manifest }) => `${manifest.publisher}.${manifest.name}`);

		if (installed.length === 0) {
			return TPromise.as([]);
		}

		return galleryService.query({ names, pageSize: names.length }).then(result => {
			const available = result.firstPage;

			return available.map(extension => {
				const local = installed.filter(local => extensionEquals(local.manifest, extension))[0];
				if (local && semver.lt(local.manifest.version, extension.version)) {
					return local;
				} else {
					return null;
				}
			}).filter(e => !!e);
		});
	});
}