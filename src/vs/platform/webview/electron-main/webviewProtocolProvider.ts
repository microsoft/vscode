/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { protocol } from 'electron';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { streamToNodeReadable } from 'vs/base/node/stream';
import { IFileService } from 'vs/platform/files/common/files';
import { loadLocalResourceStream, WebviewResourceResponse } from 'vs/platform/webview/common/resourceLoader';

export class WebviewProtocolProvider extends Disposable {

	private readonly webviewMetadata = new Map<string, {
		readonly extensionLocation: URI | undefined;
		readonly localResourceRoots: readonly URI[];
	}>();

	constructor(
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		protocol.registerStreamProtocol(Schemas.vscodeWebviewResource, async (request, callback): Promise<void> => {
			try {
				const uri = URI.parse(request.url);

				const id = uri.authority;
				const metadata = this.webviewMetadata.get(id);
				if (metadata) {
					const result = await loadLocalResourceStream(uri, this.fileService, metadata.extensionLocation, metadata.localResourceRoots);
					if (result.type === WebviewResourceResponse.Type.Success) {
						return callback({
							statusCode: 200,
							data: streamToNodeReadable(result.stream),
							headers: {
								'Content-Type': result.mimeType,
								'Access-Control-Allow-Origin': '*',
							}
						});
					}

					if (result.type === WebviewResourceResponse.Type.AccessDenied) {
						console.error('Webview: Cannot load resource outside of protocol root');
						return callback({ data: null, statusCode: 401 });
					}
				}
			} catch {
				// noop
			}

			return callback({ data: null, statusCode: 404 });
		});

		this._register(toDisposable(() => protocol.unregisterProtocol(Schemas.vscodeWebviewResource)));
	}

	public registerWebview(id: string, extensionLocation: URI | undefined, localResourceRoots: readonly URI[]): void {
		this.webviewMetadata.set(id, { extensionLocation, localResourceRoots });
	}

	public unreigsterWebview(id: string): void {
		this.webviewMetadata.delete(id);
	}

	public updateLocalResourceRoots(id: string, localResourceRoots: readonly URI[]) {
		const entry = this.webviewMetadata.get(id);
		if (entry) {
			this.webviewMetadata.set(id, {
				extensionLocation: entry.extensionLocation,
				localResourceRoots: localResourceRoots,
			});
		}
	}
}
