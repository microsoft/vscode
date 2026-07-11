/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { protocol } from 'electron';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { AppResourcePath, COI, FileAccess, Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { WebviewDocumentRegistration, WebviewResourceRequest, WebviewResourceResponse } from '../common/webviewManagerService.js';


export class WebviewProtocolProvider implements IDisposable {
	private static readonly documents = new Map<string, WebviewDocumentRegistration>();

	private static validWebviewFilePaths = new Map<string, { readonly mime: string }>([
		['/index.html', { mime: 'text/html' }],
		['/fake.html', { mime: 'text/html' }],
		['/service-worker.js', { mime: 'application/javascript' }],
	]);
	private readonly pendingResources = new Map<number, {
		readonly resolve: (response: Response) => void;
		readonly method: string;
		controller: ReadableStreamDefaultController<Uint8Array> | undefined;
	}>();
	private nextRequestId = 1;

	constructor(
		private readonly requestResource: (request: WebviewResourceRequest) => void,
		private readonly cancelResource: (requestId: number) => void,
		@IFileService private readonly _fileService: IFileService
	) {
		// Register the protocol for loading webview html
		const webviewHandler = this.handleWebviewRequest.bind(this);
		protocol.handle(Schemas.vscodeWebview, webviewHandler);
	}

	dispose(): void {
		protocol.unhandle(Schemas.vscodeWebview);
		for (const [requestId, pending] of this.pendingResources) {
			pending.resolve(new Response(null, { status: 410 }));
			this.cancelResource(requestId);
		}
		this.pendingResources.clear();
		WebviewProtocolProvider.documents.clear();
	}

	public registerWebviewDocument(document: WebviewDocumentRegistration): void {
		if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/.test(document.extensionId.toLowerCase()) || !document.webviewId || document.webviewId.includes('/')) {
			throw new Error('Invalid direct webview route');
		}
		WebviewProtocolProvider.documents.set(this.documentKey(document.extensionId, document.webviewId), document);
	}

	public unregisterWebviewDocument(extensionId: string, webviewId: string): void {
		WebviewProtocolProvider.documents.delete(this.documentKey(extensionId, webviewId));
	}

	public startResourceResponse(response: WebviewResourceResponse): void {
		const pending = this.pendingResources.get(response.requestId);
		if (!pending) {
			return;
		}
		const headers: Record<string, string> = {
			'Access-Control-Allow-Origin': '*',
			'Cross-Origin-Resource-Policy': 'cross-origin',
			'X-Content-Type-Options': 'nosniff',
		};
		if (response.mime) { headers['Content-Type'] = response.mime; }
		if (response.etag) { headers['ETag'] = response.etag; }
		if (response.mtime !== undefined) { headers['Last-Modified'] = new Date(response.mtime).toUTCString(); }
		if (response.range) { headers['Content-Range'] = response.range; headers['Accept-Ranges'] = 'bytes'; }
		if (response.size !== undefined) { headers['Content-Length'] = String(response.range ? this.rangeLength(response.range) : response.size); }

		if (pending.method === 'HEAD' || response.status === 304 || response.status >= 400) {
			this.pendingResources.delete(response.requestId);
			pending.resolve(new Response(null, { status: response.status, headers }));
			return;
		}
		const body = new ReadableStream<Uint8Array>({
			start: controller => pending.controller = controller,
			cancel: () => {
				this.pendingResources.delete(response.requestId);
				this.cancelResource(response.requestId);
			},
		});
		pending.resolve(new Response(body, { status: response.status, headers }));
	}

	public streamResourceResponse(requestId: number, data: VSBuffer): void {
		this.pendingResources.get(requestId)?.controller?.enqueue(data.buffer);
	}

	public endResourceResponse(requestId: number, error?: boolean): void {
		const pending = this.pendingResources.get(requestId);
		if (!pending) {
			return;
		}
		this.pendingResources.delete(requestId);
		if (error) {
			pending.controller?.error(new Error('Webview resource read failed'));
		} else {
			pending.controller?.close();
		}
	}

	public static getWebviewDocument(url: URI): WebviewDocumentRegistration | undefined {
		const match = /^\/([^/]+)\/(?:index\.html|_vscode\/resource\/)/.exec(url.path);
		if (!match) {
			return undefined;
		}
		return this.documents.get(`${url.authority.toLowerCase()}\0${decodeURIComponent(match[1])}`);
	}

	private documentKey(extensionId: string, webviewId: string): string {
		return `${extensionId.toLowerCase()}\0${webviewId}`;
	}

	private async handleWebviewRequest(request: GlobalRequest): Promise<GlobalResponse> {
		try {
			const uri = URI.parse(request.url);
			const directResponse = await this.handleDirectWebviewRequest(request, uri);
			if (directResponse) {
				return directResponse;
			}
			const entry = WebviewProtocolProvider.validWebviewFilePaths.get(uri.path);
			if (entry) {
				const relativeResourcePath: AppResourcePath = `vs/workbench/contrib/webview/browser/pre${uri.path}`;
				const url = FileAccess.asFileUri(relativeResourcePath);

				const content = await this._fileService.readFile(url);
				return new Response(content.value.buffer as ArrayBufferView<ArrayBuffer>, {
					headers: {
						'Content-Type': entry.mime,
						...COI.getHeadersFromQuery(request.url),
						'Cross-Origin-Resource-Policy': 'cross-origin',
					}
				});
			} else {
				return new Response(null, { status: 403 });
			}
		} catch {
			// noop
		}
		return new Response(null, { status: 500 });
	}

	private async handleDirectWebviewRequest(request: GlobalRequest, uri: URI): Promise<Response | undefined> {
		const match = /^\/([^/]+)\/(index\.html|_vscode\/resource\/(.+))$/.exec(uri.path);
		if (!match) {
			return undefined;
		}
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return new Response(null, { status: 405 });
		}

		const webviewId = decodeURIComponent(match[1]);
		const document = WebviewProtocolProvider.documents.get(this.documentKey(uri.authority, webviewId));
		if (!document) {
			return new Response(null, { status: 404 });
		}

		if (match[2] === 'index.html') {
			const revision = Number(new URL(request.url).searchParams.get('revision'));
			if (revision !== document.revision) {
				return new Response(null, { status: 410 });
			}
			return new Response(request.method === 'HEAD' ? null : document.html, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Content-Security-Policy': document.csp,
					'Cache-Control': 'no-store',
					'Referrer-Policy': 'no-referrer',
					'X-Content-Type-Options': 'nosniff',
					'Cross-Origin-Resource-Policy': 'cross-origin',
				}
			});
		}

		const resource = this.decodeResourceUri(match[3]);
		if (!resource) {
			return new Response(null, { status: 403 });
		}
		if (this.pendingResources.size >= 128) {
			return new Response(null, { status: 429 });
		}
		const requestId = this.nextRequestId++;
		const range = this.parseRange(request.headers.get('range'));
		return new Promise<Response>(resolve => {
			this.pendingResources.set(requestId, { resolve, method: request.method, controller: undefined });
			request.signal.addEventListener('abort', () => {
				if (this.pendingResources.delete(requestId)) {
					this.cancelResource(requestId);
					resolve(new Response(null, { status: 499 }));
				}
			}, { once: true });
			this.requestResource({
				requestId,
				extensionId: document.extensionId,
				webviewId: document.webviewId,
				method: request.method as 'GET' | 'HEAD',
				uri: resource,
				ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
				range,
			});
		});
	}

	private parseRange(value: string | null): { start: number; end?: number } | undefined {
		if (!value) { return undefined; }
		const match = /^bytes=(\d+)-(\d*)$/.exec(value);
		if (!match) { return undefined; }
		return { start: Number(match[1]), end: match[2] ? Number(match[2]) : undefined };
	}

	private rangeLength(value: string): number {
		const match = /^bytes (\d+)-(\d+)\//.exec(value);
		return match ? Number(match[2]) - Number(match[1]) + 1 : 0;
	}

	private decodeResourceUri(value: string): URI | undefined {
		try {
			const slash = value.indexOf('/');
			const encodedOrigin = slash < 0 ? value : value.slice(0, slash);
			const plus = encodedOrigin.indexOf('+');
			if (plus <= 0) {
				return undefined;
			}
			return URI.from({
				scheme: encodedOrigin.slice(0, plus),
				authority: this.decodeAuthority(encodedOrigin.slice(plus + 1)),
				path: slash < 0 ? '/' : value.slice(slash),
			});
		} catch {
			return undefined;
		}
	}

	private decodeAuthority(authority: string): string {
		return authority.replace(/-([0-9a-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
	}

}
