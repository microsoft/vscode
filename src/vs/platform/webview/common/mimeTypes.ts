/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getMediaMime, Mimes } from '../../../base/common/mime.js';
import { extname } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';

const webviewMimeTypes = new Map([
	['.svg', 'image/svg+xml'],
	['.txt', Mimes.text],
	['.css', 'text/css'],
	['.js', 'application/javascript'],
	['.cjs', 'application/javascript'],
	['.mjs', 'application/javascript'],
	['.json', 'application/json'],
	['.html', 'text/html'],
	['.htm', 'text/html'],
	['.xhtml', 'application/xhtml+xml'],
	['.oft', 'font/otf'],
	['.xml', 'application/xml'],
	['.wasm', 'application/wasm'],
]);

export function getWebviewContentMimeType(resource: URI): string {
	const ext = extname(resource.fsPath).toLowerCase();
	return webviewMimeTypes.get(ext) || getMediaMime(resource.fsPath) || Mimes.unknown;
}
