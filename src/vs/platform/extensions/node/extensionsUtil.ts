/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { getGalleryExtensionId, areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import product from 'vs/platform/product/node/product';

export function isUIExtension(manifest: IExtensionManifest, uiContributions: string[], configurationService: IConfigurationService): boolean {
	const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
	const extensionKind = getExtensionKind(manifest, configurationService);
	switch (extensionKind) {
		case 'ui': return true;
		case 'workspace': return false;
		default: {
			if (isNonEmptyArray(product.uiExtensions) && product.uiExtensions.some(id => areSameExtensions({ id }, { id: extensionId }))) {
				return true;
			}
			if (manifest.main) {
				return false;
			}
			if (manifest.contributes) {
				if (!uiContributions.length || Object.keys(manifest.contributes).some(contribution => uiContributions.indexOf(contribution) === -1)) {
					return false;
				}
			}
			// Default is UI Extension
			return true;
		}
	}
}

function getExtensionKind(manifest: IExtensionManifest, configurationService: IConfigurationService): string | undefined {
	const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
	const configuredExtensionKinds = configurationService.getValue<{ [key: string]: string }>('remote.extensionKind') || {};
	for (const id of Object.keys(configuredExtensionKinds)) {
		if (areSameExtensions({ id: extensionId }, { id })) {
			return configuredExtensionKinds[id];
		}
	}
	return manifest.extensionKind;
}
