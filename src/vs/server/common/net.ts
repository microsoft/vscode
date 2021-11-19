/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from 'vs/base/common/path';

/**
 * See [Web app manifest on MDN](https://developer.mozilla.org/en-US/docs/Web/Manifest) for additional information.
 */
export interface WebManifest {
	name: string;
	short_name: string;
	start_url: string;
	display: string;
	'background-color': string;
	description: string;
	icons: Array<{ src: string; type: string; sizes: string }>;
}

export interface ClientTheme {
	backgroundColor: string;
	foregroundColor: string;
}

export const ICON_SIZES = [192, 512];

/**
 * Returns the relative path prefix for a given URL path.
 * @remark This is especially useful when creating URLs which have to remain
 * relative to an initial request.
 *
 * @example
 * ```ts
 * const url = new URL('https://www.example.com/foo/bar/baz.js')
 * getPathPrefix(url.pathname) // '/foo/bar/'
 * ```
 */
export function getPathPrefix(pathname: string) {
	return posix.join(posix.dirname(pathname), '/');
}
