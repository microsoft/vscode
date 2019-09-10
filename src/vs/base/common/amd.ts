/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

export function getPathFromAmdModule(requirefn: typeof require, relativePath: string): string {
	return URI.parse(requirefn.toUrl(relativePath)).fsPath;
}

/**
 * Reference a resource that might be inlined.
 * Do not rename this method unless you adopt the build scripts.
 */
export function registerAndGetAmdImageURL(absolutePath: string): string {
	return require.toUrl(absolutePath);
}
