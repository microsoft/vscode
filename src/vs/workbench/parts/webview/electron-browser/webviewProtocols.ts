/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { extname } from 'path';
import { getMediaMime, guessMimeTypes } from 'vs/base/common/mime';
import { nativeSep } from 'vs/base/common/paths';
import { startsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';

export const enum WebviewProtocol {
	CoreResource = 'vscode-core-resource',
	VsCodeResource = 'vscode-resource'
}

export function registerFileProtocol(
	contents: Electron.WebContents,
	protocol: WebviewProtocol,
	fileService: IFileService,
	getRoots: () => ReadonlyArray<URI>
) {
	contents.session.protocol.registerBufferProtocol(protocol, (request, callback: any) => {
		const requestPath = URI.parse(request.url).path;
		const normalizedPath = URI.file(requestPath);
		for (const root of getRoots()) {
			if (startsWith(normalizedPath.fsPath, root.fsPath + nativeSep)) {
				fileService.resolveContent(normalizedPath, { encoding: 'binary' }).then(contents => {
					const mime = getMimeType(normalizedPath);
					callback({
						data: Buffer.from(contents.value, contents.encoding),
						mimeType: mime
					});
				}, () => {
					callback({ error: -2 /* FAILED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
				});
				return;
			}
		}
		console.error('Webview: Cannot load resource outside of protocol root');
		callback({ error: -10 /* ACCESS_DENIED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
	}, (error) => {
		if (error) {
			console.error('Failed to register protocol ' + protocol);
		}
	});
}

const webviewMimeTypes = {
	'.svg': 'image/svg+xml'
};

function getMimeType(normalizedPath: URI) {
	const ext = extname(normalizedPath.fsPath).toLowerCase();
	return webviewMimeTypes[ext] || getMediaMime(normalizedPath.fsPath) || guessMimeTypes(normalizedPath.fsPath)[0];
}
