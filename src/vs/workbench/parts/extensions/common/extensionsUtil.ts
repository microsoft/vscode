/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExtension, IExtensionsService, IGalleryService } from 'vs/workbench/parts/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
// import * as semver from 'semver';

'use strict';

export function getExtensionId(extension: IExtension): string {
	return `${ extension.publisher }.${ extension.name }`;
}

export function extensionEquals(one: IExtension, other: IExtension): boolean {
	return one.publisher === other.publisher && one.name === other.name;
}

export function getOutdatedExtensions(accessor: ServicesAccessor): TPromise<IExtension[]> {
	const extensionsService = accessor.get(IExtensionsService);
	const galleryService = accessor.get(IGalleryService);

	if (!galleryService.isEnabled()) {
		return TPromise.as([]);
	}

	return extensionsService.getInstalled().then(installed => {
		const ids = installed.map(getExtensionId);

		return galleryService.query({ ids, pageSize: 1000 }).then(available => {

			return [];
		});
	});
}