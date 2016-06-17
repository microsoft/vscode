/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtensionIdentity, IExtension, IGalleryExtension, IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { TPromise } from 'vs/base/common/winjs.base';
import * as semver from 'semver';

export function extensionEquals(one: IExtensionIdentity, other: IExtensionIdentity): boolean {
	return one.publisher === other.publisher && one.name === other.name;
}

export function getTelemetryData(extension: IExtension | IGalleryExtension): any {
	const local = extension as IExtension;
	const gallery = extension as IGalleryExtension;

	if (local.path) {
		return {
			id: `${ local.manifest.publisher }.${ local.manifest.name }`,
			name: local.manifest.name,
			galleryId: local.metadata ? local.metadata.id : null,
			publisherId: local.metadata ? local.metadata.publisherId : null,
			publisherName: local.manifest.publisher,
			publisherDisplayName: local.metadata ? local.metadata.publisherDisplayName : null
		};
	} else {
		return {
			id: `${ gallery.publisher }.${ gallery.name }`,
			name: gallery.name,
			galleryId: gallery.id,
			publisherId: gallery.publisherId,
			publisherName: gallery.publisher,
			publisherDisplayName: gallery.publisherDisplayName
		};
	}
}

export function getOutdatedExtensions(extensionsService: IExtensionManagementService, galleryService: IExtensionGalleryService): TPromise<IExtension[]> {
	if (!galleryService.isEnabled()) {
		return TPromise.as([]);
	}

	return extensionsService.getInstalled().then(installed => {
		const ids = installed.map(({ manifest }) => `${ manifest.publisher }.${ manifest.name }`);

		return galleryService.query({ ids, pageSize: 1000 }).then(result => {
			const available = result.firstPage;

			return available.map(extension => {
				const local = installed.filter(local => extensionEquals(local.manifest, extension))[0];
				if (local && semver.lt(local.manifest.version, extension.versions[0].version)) {
					return local;
				} else {
					return null;
				}
			}).filter(e => !!e);
		});
	});
}