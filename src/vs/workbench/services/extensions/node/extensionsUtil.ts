/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { isUIExtension as _isUIExtension } from 'vs/platform/extensions/node/extensionsUtil';

export function isUIExtension(manifest: IExtensionManifest, configurationService: IConfigurationService): boolean {
	const uiExtensionPoints = ExtensionsRegistry.getExtensionPoints().filter(e => e.defaultExtensionKind !== 'workspace').map(e => e.name);
	return _isUIExtension(manifest, uiExtensionPoints, configurationService);
}
