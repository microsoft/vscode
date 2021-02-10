/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { protocol, session } from 'electron';
import { Readable } from 'stream';
import { bufferToStream, VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { listenStream } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteConnectionData } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRequestService } from 'vs/platform/request/common/request';
import { loadLocalResource, readFileStream, WebviewFileReadResponse, webviewPartitionId, WebviewResourceFileReader, WebviewResourceResponse } from 'vs/platform/webview/common/resourceLoader';
import { WebviewManagerDidLoadResourceResponse } from 'vs/platform/webview/common/webviewManagerService';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

interface WebviewMetadata {
	readonly windowId: number;
	readonly extensionLocation: URI | undefined;
	readonly localResourceRoots: readonly URI[];
	readonly remoteConnectionData: IRemoteConnectionData | null;
}

export class WebviewProtocolProvider extends Disposable {

	private static validWebviewFilePaths = new Map([
		['/index.html', 'index.html'],
		['/electron-browser/index.html', 'index.html'],
		['/main.js', 'main.js'],
		['/host.js', 'host.js'],
	]);

	private readonly webviewMetadata = new Map<string, WebviewMetadata>();

	private requestIdPool = 1;
	private readonly pendingResourceReads = new Map<number, { resolve: (content: WebviewManagerDidLoadResourceResponse) => void }>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
	) {
		super();

		const sess = session.fromPartition(webviewPartitionId);

		// Register the protocol loading webview html
		const webviewHandler = this.handleWebviewRequest.bind(this);
		protocol.registerFileProtocol(Schemas.vscodeWebview, webviewHandler);
		sess.protocol.registerFileProtocol(Schemas.vscodeWebview, webviewHandler);

		// Register the protocol loading webview resources both inside the webview and at the top level
		const webviewResourceHandler = this.handleWebviewResourceRequest.bind(this);
		protocol.registerStreamProtocol(Schemas.vscodeWebviewResource, webviewResourceHandler);
		sess.protocol.registerStreamProtocol(Schemas.vscodeWebviewResource, webviewResourceHandler);

		this._register(toDisposable(() => {
			protocol.unregisterProtocol(Schemas.vscodeWebviewResource);
			sess.protocol.unregisterProtocol(Schemas.vscodeWebviewResource);
			protocol.unregisterProtocol(Schemas.vscodeWebview);
			sess.protocol.unregisterProtocol(Schemas.vscodeWebview);
		}));
	}

	private streamToNodeReadable(stream: VSBufferReadableStream): Readable {
		return new class extends Readable {
			private listening = false;

			_read(size?: number): void {
				if (!this.listening) {
					this.listening = true;

					listenStream(stream, {
						onData: data => {
							try {
								if (!this.push(data.buffer)) {
									stream.pause(); // pause the stream if we should not push anymore
								}
							} catch (error) {
								this.emit(error);
							}
						},
						onError: error => {
							this.emit('error', error);
						},
						onEnd: () => {
							try {
								this.push(null); // signal EOS
							} catch (error) {
								this.emit(error);
							}
						}
					});
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

	private async handleWebviewRequest(
		request: Electron.ProtocolRequest,
		callback: (response: string | Electron.ProtocolResponse) => void
	) {
		try {
			const uri = URI.parse(request.url);
			const entry = WebviewProtocolProvider.validWebviewFilePaths.get(uri.path);
			if (typeof entry === 'string') {
				const relativeResourcePath = uri.path.startsWith('/electron-browser')
					? `vs/workbench/contrib/webview/electron-browser/pre/${entry}`
					: `vs/workbench/contrib/webview/browser/pre/${entry}`;

				const url = FileAccess.asFileUri(relativeResourcePath, require);
				return callback(decodeURIComponent(url.fsPath));
			}
		} catch {
			// noop
		}
		callback({ error: -10 /* ACCESS_DENIED - https://cs.chromium.org/chromium/src/net/base/net_error_list.h?l=32 */ });
	}

	private async handleWebviewResourceRequest(
		request: Electron.ProtocolRequest,
		callback: (stream: NodeJS.ReadableStream | Electron.ProtocolResponse) => void
	) {
		try {
			const uri = URI.parse(request.url);
			const ifNoneMatch = request.headers['If-None-Match'];

			const id = uri.authority;
			const metadata = this.webviewMetadata.get(id);
			if (metadata) {

				// Try to further rewrite remote uris so that they go to the resolved server on the main thread
				let rewriteUri: undefined | ((uri: URI) => URI);
				if (metadata.remoteConnectionData) {
					rewriteUri = (uri) => {
						if (metadata.remoteConnectionData) {
							if (uri.scheme === Schemas.vscodeRemote || (metadata.extensionLocation?.scheme === Schemas.vscodeRemote)) {
								let host = metadata.remoteConnectionData.host;
								if (host && host.indexOf(':') !== -1) { // IPv6 address
									host = `[${host}]`;
								}
								return URI.parse(`http://${host}:${metadata.remoteConnectionData.port}`).with({
									path: '/vscode-remote-resource',
									query: `tkn=${metadata.remoteConnectionData.connectionToken}&path=${encodeURIComponent(uri.path)}`,
								});
							}
						}
						return uri;
					};
				}

				const fileReader: WebviewResourceFileReader = {
					readFileStream: async (resource: URI, etag: string | undefined): Promise<WebviewFileReadResponse.Response> => {
						if (resource.scheme === Schemas.file) {
							return readFileStream(this.fileService, resource, etag);
						}

						// Unknown uri scheme. Try delegating the file read back to the renderer
						// process which should have a file system provider registered for the uri.

						const window = this.windowsMainService.getWindowById(metadata.windowId);
						if (!window) {
							throw new FileOperationError('Could not find window for resource', FileOperationResult.FILE_NOT_FOUND);
						}

						const requestId = this.requestIdPool++;
						const p = new Promise<WebviewManagerDidLoadResourceResponse>(resolve => {
							this.pendingResourceReads.set(requestId, { resolve });
						});

						window.send(`vscode:loadWebviewResource-${id}`, requestId, uri);

						const result = await p;
						switch (result) {
							case 'access-denied':
								throw new FileOperationError('Could not read file', FileOperationResult.FILE_PERMISSION_DENIED);

							case 'not-found':
								throw new FileOperationError('Could not read file', FileOperationResult.FILE_NOT_FOUND);

							case 'not-modified':
								return WebviewFileReadResponse.NotModified;

							default:
								return new WebviewFileReadResponse.StreamSuccess(bufferToStream(result.buffer), result.etag);
						}
					}
				};

				const result = await loadLocalResource(uri, ifNoneMatch, {
					extensionLocation: metadata.extensionLocation,
					roots: metadata.localResourceRoots,
					remoteConnectionData: metadata.remoteConnectionData,
					rewriteUri,
				}, fileReader, this.requestService, this.logService, CancellationToken.None);

				switch (result.type) {
					case WebviewResourceResponse.Type.Success:
						{
							const cacheHeaders: Record<string, string> = result.etag ? {
								'ETag': result.etag,
								'Cache-Control': 'no-cache'
							} : {};

							const ifNoneMatch = request.headers['If-None-Match'];
							if (ifNoneMatch && result.etag === ifNoneMatch) {
								/*
								 * Note that the server generating a 304 response MUST
								 * generate any of the following header fields that would
								 * have been sent in a 200 (OK) response to the same request:
								 * Cache-Control, Content-Location, Date, ETag, Expires, and Vary.
								 * (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match)
								 */
								return callback({
									statusCode: 304, // not modified
									data: undefined, // The request fails if `data` is not set
									headers: {
										'Content-Type': result.mimeType,
										'Access-Control-Allow-Origin': '*',
										...cacheHeaders
									}
								});
							}

							return callback({
								statusCode: 200,
								data: this.streamToNodeReadable(result.stream),
								headers: {
									'Content-Type': result.mimeType,
									'Access-Control-Allow-Origin': '*',
									...cacheHeaders
								}
							});
						}
					case WebviewResourceResponse.Type.NotModified:
						{
							/*
							 * Note that the server generating a 304 response MUST
							 * generate any of the following header fields that would
							 * have been sent in a 200 (OK) response to the same request:
							 * Cache-Control, Content-Location, Date, ETag, Expires, and Vary.
							 * (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match)
							 */
							return callback({
								statusCode: 304, // not modified
								data: undefined, // The request fails if `data` is not set
								headers: {
									'Content-Type': result.mimeType,
									'Access-Control-Allow-Origin': '*',
								}
							});
						}
					case WebviewResourceResponse.Type.AccessDenied:
						{
							console.error('Webview: Cannot load resource outside of protocol root');
							return callback({ data: undefined, statusCode: 401 });
						}
				}
			}
		} catch {
			// noop
		}

		return callback({ data: undefined, statusCode: 404 });
	}

	public didLoadResource(requestId: number, response: WebviewManagerDidLoadResourceResponse) {
		const pendingRead = this.pendingResourceReads.get(requestId);
		if (!pendingRead) {
			throw new Error('Unknown request');
		}
		this.pendingResourceReads.delete(requestId);
		pendingRead.resolve(response);
	}
}
