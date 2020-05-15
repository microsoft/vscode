/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcMain as ipc, IpcMainEvent, MimeTypedBuffer, protocol } from 'electron';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { loadLocalResource, WebviewResourceResponse } from 'vs/platform/webview/common/resourceLoader';

export interface RegisterWebviewMetadata {
	readonly extensionLocation: URI | undefined;
	readonly localResourceRoots: readonly URI[];
}

type ErrorCallback = (response: MimeTypedBuffer | { error: number }) => void;


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
			this.webviewMetadata.set(id, {
				extensionLocation: data.extensionLocation ? URI.from(data.extensionLocation) : undefined,
				localResourceRoots: data.localResourceRoots.map((x: UriComponents) => URI.from(x)),
			});

			event.sender.send(`vscode:didRegisterWebview-${id}`);
		});

		ipc.on('vscode:updateWebviewLocalResourceRoots', (event: IpcMainEvent, id: string, localResourceRoots: readonly URI[]) => {
			const entry = this.webviewMetadata.get(id);
			if (entry) {
				this.webviewMetadata.set(id, {
					extensionLocation: entry.extensionLocation,
					localResourceRoots: localResourceRoots.map((x: UriComponents) => URI.from(x)),
				});
			}
			event.sender.send(`vscode:didUpdateWebviewLocalResourceRoots-${id}`);
		});

		ipc.on('vscode:unregisterWebview', (_event: IpcMainEvent, id: string) => {
			this.webviewMetadata.delete(id);
		});

		protocol.registerBufferProtocol(Schemas.vscodeWebviewResource, async (request, callback): Promise<void> => {
			try {
				const uri = URI.parse(request.url);

				const id = uri.authority;
				const metadata = this.webviewMetadata.get(id);
				if (metadata) {
					const result = await loadLocalResource(uri, this.fileService, metadata.extensionLocation, metadata.localResourceRoots);
					if (result.type === WebviewResourceResponse.Type.Success) {
						return callback({
							data: Buffer.from(result.data.buffer),
							mimeType: result.mimeType
						});
					}

					if (result.type === WebviewResourceResponse.Type.AccessDenied) {
						console.error('Webview: Cannot load resource outside of protocol root');
						return (callback as ErrorCallback)({ error: -10 /* ACCESS_DENIED: https://cs.chromium.org/chromium/src/net/base/net_error_list.h */ });
					}
				}
			} catch {
				// noop
			}

			return (callback as ErrorCallback)({ error: -2 });
		});

		this._register(toDisposable(() => protocol.unregisterProtocol(Schemas.vscodeWebviewResource)));
	}
}
