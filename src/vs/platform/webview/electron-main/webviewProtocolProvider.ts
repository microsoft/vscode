/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IpcMainEvent, ipcMain as ipc, session, Session } from 'electron';
import { Schemas } from 'vs/base/common/network';
import { loadLocalResource, WebviewResourceResponse } from 'vs/platform/webview/common/resourceLoader';
import { Disposable } from 'vs/base/common/lifecycle';

export interface RegisterWebviewMetadata {
	readonly extensionLocation: URI | undefined;
	readonly localResourceRoots: readonly URI[];
}

export class WebviewProtocolProvider extends Disposable {

	private readonly webviewMetadata = new Map<string, {
		readonly extensionLocation: URI | undefined;
		readonly localResourceRoots: URI[];
	}>();

	constructor(
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		ipc.on('vscode:registerWebview', (event: IpcMainEvent, id: string, data: RegisterWebviewMetadata) => {
			if (!this.webviewMetadata.has(id)) {
				const ses = session.fromPartition(id);
				this.register(ses);
			}

			this.webviewMetadata.set(id, {
				extensionLocation: data.extensionLocation ? URI.from(data.extensionLocation) : undefined,
				localResourceRoots: data.localResourceRoots.map((x: UriComponents) => URI.from(x)),
			});

			event.sender.send(`vscode:didRegisterWebview-${id}`);
		});

		ipc.on('vscode:unregisterWebview', (_event: IpcMainEvent, id: string) => {
			this.webviewMetadata.delete(id);
		});
	}

	private register(session: Session) {
		session.protocol.registerBufferProtocol(Schemas.vscodeWebviewResource, async (request, callback: any) => {
			try {
				const uri = URI.parse(request.url);
				const resource = URI.parse(uri.path.replace(/^\/(\w+)/, '$1:'));

				const id = uri.authority;
				const metadata = this.webviewMetadata.get(id);
				if (metadata) {
					const result = await loadLocalResource(resource, this.fileService, metadata.extensionLocation, () => metadata.localResourceRoots);
					if (result.type === WebviewResourceResponse.Type.Success) {
						return callback({
							data: Buffer.from(result.data.buffer),
							mimeType: result.mimeType
						});
					}

					if (result.type === WebviewResourceResponse.Type.AccessDenied) {
						console.error('Webview: Cannot load resource outside of protocol root');
						return callback({ error: -10 /* ACCESS_DENIED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
					}
				}
			} catch {
				// noop
			}

			return callback({ error: -2 /* FAILED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
		});
	}
}
