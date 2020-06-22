/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session } from 'electron';
import { Readable } from 'stream';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IRemoteConnectionData } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRequestService } from 'vs/platform/request/common/request';
import { loadLocalResource, webviewPartitionId, WebviewResourceResponse } from 'vs/platform/webview/common/resourceLoader';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';

interface WebviewMetadata {
	readonly extensionLocation: URI | undefined;
	readonly localResourceRoots: readonly URI[];
	readonly remoteConnectionData: IRemoteConnectionData | null;
}

export class WebviewProtocolProvider extends Disposable {

	private readonly webviewMetadata = new Map<string, WebviewMetadata>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();

		const sess = session.fromPartition(webviewPartitionId);

		sess.protocol.registerStreamProtocol(Schemas.vscodeWebviewResource, async (request, callback): Promise<void> => {
			try {
				const uri = URI.parse(request.url);

				const id = uri.authority;
				const metadata = this.webviewMetadata.get(id);
				if (metadata) {

					// Try to further rewrite remote uris so that they go to the resolved server on the main thread
					let rewriteUri: undefined | ((uri: URI) => URI);
					if (metadata.remoteConnectionData) {
						rewriteUri = (uri) => {
							if (metadata.remoteConnectionData) {
								if (uri.scheme === Schemas.vscodeRemote || (metadata.extensionLocation?.scheme === REMOTE_HOST_SCHEME)) {
									const scheme = metadata.remoteConnectionData.host === 'localhost' || metadata.remoteConnectionData.host === '127.0.0.1' ? 'http' : 'https';
									return URI.parse(`${scheme}://${metadata.remoteConnectionData.host}:${metadata.remoteConnectionData.port}`).with({
										path: '/vscode-remote-resource',
										query: `tkn=${metadata.remoteConnectionData.connectionToken}&path=${encodeURIComponent(uri.path)}`,
									});
								}
							}
							return uri;
						};
					}

					const result = await loadLocalResource(uri, {
						extensionLocation: metadata.extensionLocation,
						roots: metadata.localResourceRoots,
						remoteConnectionData: metadata.remoteConnectionData,
						rewriteUri,
					}, this.fileService, this.requestService);

					if (result.type === WebviewResourceResponse.Type.Success) {
						return callback({
							statusCode: 200,
							data: this.streamToNodeReadable(result.stream),
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

		this._register(toDisposable(() => sess.protocol.unregisterProtocol(Schemas.vscodeWebviewResource)));
	}

	private streamToNodeReadable(stream: VSBufferReadableStream): Readable {
		return new class extends Readable {
			private listening = false;

			_read(size?: number): void {
				if (!this.listening) {
					this.listening = true;

					// Data
					stream.on('data', data => {
						try {
							if (!this.push(data.buffer)) {
								stream.pause(); // pause the stream if we should not push anymore
							}
						} catch (error) {
							this.emit(error);
						}
					});

					// End
					stream.on('end', () => {
						try {
							this.push(null); // signal EOS
						} catch (error) {
							this.emit(error);
						}
					});

					// Error
					stream.on('error', error => this.emit('error', error));
				}

				// ensure the stream is flowing
				stream.resume();
			}

			_destroy(error: Error | null, callback: (error: Error | null) => void): void {
				stream.destroy();

				callback(null);
			}
		};
	}

	public async registerWebview(id: string, metadata: WebviewMetadata): Promise<void> {
		this.webviewMetadata.set(id, metadata);
	}

	public unregisterWebview(id: string): void {
		this.webviewMetadata.delete(id);
	}

	public async updateWebviewMetadata(id: string, metadataDelta: Partial<WebviewMetadata>): Promise<void> {
		const entry = this.webviewMetadata.get(id);
		if (entry) {
			this.webviewMetadata.set(id, {
				...entry,
				...metadataDelta,
			});
		}
	}
}
