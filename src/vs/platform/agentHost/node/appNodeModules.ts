/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppResourcePath, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../base/common/network.js';
import product from '../../product/common/product.js';

function hasUnpackedNodeModulesArchive(): boolean {
	return !!process.versions['electron'] && !!product.commit && !process.env['VSCODE_DEV'];
}

/**
 * The {@link AppResourcePath} of the `node_modules` root that actually holds VS
 * Code's bundled modules, suitable for passing to `FileAccess.asFileUri`.
 */
export function getAppNodeModulesPath(): AppResourcePath {
	return hasUnpackedNodeModulesArchive() ? nodeModulesAsarUnpackedPath : nodeModulesPath;
}

/**
 * The bare directory name (`node_modules` or `node_modules.asar.unpacked`) of the
 * resolved root, for callers that build paths from an app root themselves.
 */
export function getAppNodeModulesDirName(): 'node_modules' | 'node_modules.asar.unpacked' {
	return hasUnpackedNodeModulesArchive() ? 'node_modules.asar.unpacked' : 'node_modules';
}
