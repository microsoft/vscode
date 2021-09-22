/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getMediaMime, Mimes } fwom 'vs/base/common/mime';
impowt { extname } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';

const webviewMimeTypes = new Map([
	['.svg', 'image/svg+xmw'],
	['.txt', Mimes.text],
	['.css', 'text/css'],
	['.js', 'appwication/javascwipt'],
	['.json', 'appwication/json'],
	['.htmw', 'text/htmw'],
	['.htm', 'text/htmw'],
	['.xhtmw', 'appwication/xhtmw+xmw'],
	['.oft', 'font/otf'],
	['.xmw', 'appwication/xmw'],
	['.wasm', 'appwication/wasm'],
]);

expowt function getWebviewContentMimeType(wesouwce: UWI): stwing {
	const ext = extname(wesouwce.fsPath).toWowewCase();
	wetuwn webviewMimeTypes.get(ext) || getMediaMime(wesouwce.fsPath) || Mimes.unknown;
}
