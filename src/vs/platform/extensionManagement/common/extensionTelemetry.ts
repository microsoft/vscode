/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILocalExtension, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export function getLocalExtensionTelemetryData(extension: ILocalExtension): any {
	return {
		id: `${ extension.manifest.publisher }.${ extension.manifest.name }`,
		name: extension.manifest.name,
		galleryId: extension.metadata ? extension.metadata.id : null,
		publisherId: extension.metadata ? extension.metadata.publisherId : null,
		publisherName: extension.manifest.publisher,
		publisherDisplayName: extension.metadata ? extension.metadata.publisherDisplayName : null
	};
}

export function getGalleryExtensionTelemetryData(extension: IGalleryExtension): any {
	return {
		id: `${ extension.publisher }.${ extension.name }`,
		name: extension.name,
		galleryId: extension.id,
		publisherId: extension.publisherId,
		publisherName: extension.publisher,
		publisherDisplayName: extension.publisherDisplayName
	};
}