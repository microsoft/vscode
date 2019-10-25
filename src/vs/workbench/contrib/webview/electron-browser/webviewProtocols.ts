/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as electron from 'electron';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { loadLocalResource } from 'vs/workbench/contrib/webview/common/resourceLoader';

export function registerFileProtocol(
	contents: electron.WebContents,
	protocol: string,
	fileService: IFileService,
	extensionLocation: URI | undefined,
	getRoots: () => ReadonlyArray<URI>
) {
	contents.session.protocol.registerBufferProtocol(protocol, async (request, callback: any) => {
		try {
			const result = await loadLocalResource(URI.parse(request.url), fileService, extensionLocation, getRoots);
			if (result.type === 'success') {
				return callback({
					data: Buffer.from(result.data.buffer),
					mimeType: result.mimeType
				});
			}
			if (result.type === 'access-denied') {
				console.error('Webview: Cannot load resource outside of protocol root');
				return callback({ error: -10 /* ACCESS_DENIED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
			}
		} catch  {
			// noop
		}

		return callback({ error: -2 /* FAILED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
	}, (error) => {
		if (error) {
			console.error(`Failed to register '${protocol}' protocol`);
		}
	});
}

