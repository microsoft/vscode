/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppResourcePath, FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import product from '../../product/common/product.js';

function hasUnpackedNodeModulesArchive(): boolean {
	return !!process.versions['electron'] && !!product.commit && !process.env['VSCODE_DEV'];
}

function getAppNodeModulesPath(): AppResourcePath {
	return hasUnpackedNodeModulesArchive() ? nodeModulesAsarUnpackedPath : nodeModulesPath;
}

/**
 * The URI of the `node_modules` root that holds VS Code's runtime modules.
 */
export function getAppNodeModulesUri(injectedNodeModulesPath = process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']): URI {
	return injectedNodeModulesPath ? URI.file(injectedNodeModulesPath) : FileAccess.asFileUri(getAppNodeModulesPath());
}
