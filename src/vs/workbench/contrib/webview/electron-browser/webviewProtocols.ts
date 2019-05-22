/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getMediaMime, MIME_UNKNOWN } from 'vs/base/common/mime';
import { extname, sep } from 'vs/base/common/path';
import { startsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IFileService } from 'vs/platform/files/common/files';
import * as electron from 'electron';

type BufferProtocolCallback = (buffer?: Buffer | electron.MimeTypedBuffer | { error: number }) => void;

export const enum WebviewProtocol {
	CoreResource = 'vscode-core-resource',
	VsCodeResource = 'vscode-resource',
}

function resolveContent(fileService: IFileService, resource: URI, mime: string, callback: BufferProtocolCallback): void {
	fileService.readFile(resource).then(contents => {
		callback({
			data: Buffer.from(contents.value.buffer),
			mimeType: mime
		});
	}, (err) => {
		console.log(err);
		callback({ error: -2 /* FAILED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
	});
}

export function registerFileProtocol(
	contents: electron.WebContents,
	protocol: WebviewProtocol,
	fileService: IFileService,
	extensionLocation: URI | undefined,
	getRoots: () => ReadonlyArray<URI>
) {
	contents.session.protocol.registerBufferProtocol(protocol, (request, callback: any) => {
		const requestPath = URI.parse(request.url).path;
		const normalizedPath = URI.file(requestPath);
		for (const root of getRoots()) {
			if (!startsWith(normalizedPath.fsPath, root.fsPath + sep)) {
				continue;
			}

			if (extensionLocation && extensionLocation.scheme === REMOTE_HOST_SCHEME) {
				const requestUri = URI.parse(request.url);
				const redirectedUri = URI.from({
					scheme: REMOTE_HOST_SCHEME,
					authority: extensionLocation.authority,
					path: '/vscode-resource',
					query: JSON.stringify({
						requestResourcePath: requestUri.path
					})
				});
				resolveContent(fileService, redirectedUri, getMimeType(requestUri), callback);
				return;
			} else {
				resolveContent(fileService, normalizedPath, getMimeType(normalizedPath), callback);
				return;
			}
		}
		console.error('Webview: Cannot load resource outside of protocol root');
		callback({ error: -10 /* ACCESS_DENIED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
	}, (error) => {
		if (error) {
			console.error(`Failed to register '${protocol}' protocol`);
		}
	});
}

const webviewMimeTypes = {
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.html': 'text/html',
	'.htm': 'text/html',
	'.xhtml': 'application/xhtml+xml',
	'.oft': 'font/otf',
	'.xml': 'application/xml',
};

function getMimeType(normalizedPath: URI): string {
	const ext = extname(normalizedPath.fsPath).toLowerCase();
	return webviewMimeTypes[ext] || getMediaMime(normalizedPath.fsPath) || MIME_UNKNOWN;
}
