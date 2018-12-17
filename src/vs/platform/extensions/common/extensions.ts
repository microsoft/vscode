/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

export const MANIFEST_CACHE_FOLDER = 'CachedExtensions';
export const USER_MANIFEST_CACHE_FILE = 'user';
export const BUILTIN_MANIFEST_CACHE_FILE = 'builtin';

const uiExtensions = new Set<string>();
uiExtensions.add('msjsdiag.debugger-for-chrome');

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
		default: return uiExtensions.has(extensionId) || !manifest.main;
	}
}
