/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

/**
 * @deprecated use `FileAccess.asFileUri(relativePath, requireFn).fsPath`
 */
export function getPathFromAmdModule(requirefn: typeof require, relativePath: string): string {
	return getUriFromAmdModule(requirefn, relativePath).fsPath;
}

/**
 * @deprecated use `FileAccess.asFileUri()` for node.js contexts or `FileAccess.asBrowserUri` for browser contexts.
 */
export function getUriFromAmdModule(requirefn: typeof require, relativePath: string): URI {
	return URI.parse(requirefn.toUrl(relativePath));
}
