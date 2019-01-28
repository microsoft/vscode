/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { getGalleryExtensionId, areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import product from 'vs/platform/node/product';

export function isUIExtension(manifest: IExtensionManifest, configurationService: IConfigurationService): boolean {
	const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
	const configuredUIExtensions = configurationService.getValue<string[]>('_workbench.uiExtensions') || [];
	if (configuredUIExtensions.length) {
		if (configuredUIExtensions.indexOf(extensionId) !== -1) {
			return true;
		}
		if (configuredUIExtensions.indexOf(`-${extensionId}`) !== -1) {
			return false;
		}
	}
	switch (manifest.extensionKind) {
		case 'ui': return true;
		case 'workspace': return false;
		default: {
			if (isNonEmptyArray(product.uiExtensions) && product.uiExtensions.some(id => areSameExtensions({ id }, { id: extensionId }))) {
				return true;
			}
			if (manifest.main) {
				return false;
			}
			if (manifest.contributes && isNonEmptyArray(manifest.contributes.debuggers)) {
				return false;
			}
			// Default is UI Extension
			return true;
		}
	}
}
