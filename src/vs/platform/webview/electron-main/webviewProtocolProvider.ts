/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { net, protocol } from 'electron';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { AppResourcePath, COI, FileAccess, Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { getWebviewContentMimeType } from '../common/mimeTypes.js';
import { isWebviewResourceAllowed } from '../common/resourceLoading.js';
import { WebviewDocumentRegistration, WebviewPortMappingRequest, WebviewResourceRequest, WebviewResourceResponse } from '../common/webviewManagerService.js';

export interface RegisteredWebviewDocument extends WebviewDocumentRegistration {
	readonly frameTreeNodeId: number;
}

export class WebviewProtocolProvider implements IDisposable {
	private static instance: WebviewProtocolProvider | undefined;
	private static readonly documents = new Map<string, RegisteredWebviewDocument>();

	private static validWebviewFilePaths = new Map<string, { readonly mime: string }>([
		['/index.html', { mime: 'text/html' }],
		['/fake.html', { mime: 'text/html' }],
		['/service-worker.js', { mime: 'application/javascript' }],
		['/defaultStyles.js', { mime: 'application/javascript' }],
	]);
	private readonly pendingResources = new Map<number, {
		readonly resolve: (response: Response) => void;
		readonly method: string;
		readonly extensionId: string;
		readonly webviewId: string;
		controller: ReadableStreamDefaultController<Uint8Array> | undefined;
	}>();
	private nextRequestId = 1;
	private readonly pendingPortMappings = new Map<number, (redirect: string | undefined) => void>();

	constructor(
		private readonly requestResource: (request: WebviewResourceRequest) => void,
		private readonly cancelResource: (requestId: number) => void,
		private readonly requestPortMapping: (request: WebviewPortMappingRequest) => void,
		private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly _fileService: IFileService
	) {
		// Register the protocol for loading webview html
		const webviewHandler = this.handleWebviewRequest.bind(this);
		protocol.handle(Schemas.vscodeWebview, webviewHandler);
		WebviewProtocolProvider.instance = this;
	}

	dispose(): void {
		protocol.unhandle(Schemas.vscodeWebview);
		for (const [requestId, pending] of this.pendingResources) {
			pending.resolve(new Response(null, { status: 499 }));
			this.cancelResource(requestId);
		}
		this.pendingResources.clear();
		WebviewProtocolProvider.documents.clear();
		for (const resolve of this.pendingPortMappings.values()) { resolve(undefined); }
		this.pendingPortMappings.clear();
		if (WebviewProtocolProvider.instance === this) { WebviewProtocolProvider.instance = undefined; }
	}

	public registerWebviewDocument(document: RegisteredWebviewDocument): void {
		if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/.test(document.extensionId.toLowerCase()) || !document.webviewId || document.webviewId.includes('/')) {
			throw new Error('Invalid direct webview route');
		}
		const key = this.documentKey(document.extensionId, document.webviewId);
		WebviewProtocolProvider.documents.set(key, document);
	}

	public unregisterWebviewDocument(extensionId: string, webviewId: string): void {
		const key = this.documentKey(extensionId, webviewId);
		WebviewProtocolProvider.documents.delete(key);
		for (const [requestId, pending] of this.pendingResources) {
			if (pending.extensionId.toLowerCase() === extensionId.toLowerCase() && pending.webviewId === webviewId) {
				this.pendingResources.delete(requestId);
				pending.controller?.error(new Error('Webview disposed'));
				pending.resolve(new Response(null, { status: 499 }));
				this.cancelResource(requestId);
			}
		}
	}

	public unregisterWebviewWindow(windowId: number): void {
		for (const document of [...WebviewProtocolProvider.documents.values()]) {
			if (document.windowId === windowId) {
				this.unregisterWebviewDocument(document.extensionId, document.webviewId);
			}
		}
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

	public static getWebviewDocument(url: URI): RegisteredWebviewDocument | undefined {
		const match = /^\/([^/]+)\/(?:index\.html|_vscode\/resource\/)/.exec(url.path);
		if (!match) {
			return undefined;
		}
		return this.documents.get(`${url.authority.toLowerCase()}\0${decodeURIComponent(match[1])}`);
	}

	public static getWebviewPortMapping(frameUrl: string, targetUrl: string): Promise<string | undefined> | undefined {
		const instance = this.instance;
		if (!instance) { return undefined; }
		let frameUri: URI;
		let target: URL;
		try {
			frameUri = URI.parse(frameUrl);
			target = new URL(targetUrl);
		} catch {
			return undefined;
		}
		const document = this.getWebviewDocument(frameUri);
		if (!document || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
			return undefined;
		}
		const route = `${Schemas.vscodeWebview}://${document.extensionId.toLowerCase()}/${encodeURIComponent(document.webviewId)}/`;
		if (!frameUrl.startsWith(route)) {
			return undefined;
		}
		return instance.requestPortMappingForDocument(document, target.origin);
	}

	private requestPortMappingForDocument(document: WebviewDocumentRegistration, origin: string): Promise<string | undefined> {
		const requestId = this.nextRequestId++;
		return new Promise(resolve => {
			this.pendingPortMappings.set(requestId, resolve);
			this.requestPortMapping({ requestId, extensionId: document.extensionId, webviewId: document.webviewId, origin });
			setTimeout(() => this.resolvePortMapping(requestId, undefined), 10_000);
		});
	}

	public resolvePortMapping(requestId: number, redirect: string | undefined): void {
		const resolve = this.pendingPortMappings.get(requestId);
		if (resolve) {
			this.pendingPortMappings.delete(requestId);
			resolve(redirect);
		}
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

		const resource = this.decodeResourceUri(match[3], uri.query);
		if (!resource) {
			return new Response(null, { status: 403 });
		}
		const localResponse = await this.tryLoadLocalFileResource(request, resource, document);
		if (localResponse) {
			return localResponse;
		}
		if (this.pendingResources.size >= 128) {
			return new Response(null, { status: 429 });
		}
		const requestId = this.nextRequestId++;
		const range = this.parseRange(request.headers.get('range'));
		return new Promise<Response>(resolve => {
			this.pendingResources.set(requestId, {
				resolve,
				method: request.method,
				extensionId: document.extensionId,
				webviewId: document.webviewId,
				controller: undefined,
			});
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

	private async tryLoadLocalFileResource(request: GlobalRequest, resource: URI, document: WebviewDocumentRegistration): Promise<Response | undefined> {
		if (resource.scheme !== Schemas.file
			|| request.headers.has('range')
			|| request.headers.has('if-none-match')
			|| !isWebviewResourceAllowed(resource, document.roots.map(root => URI.revive(root)), this.uriIdentityService)) {
			return undefined;
		}

		try {
			const response = await net.fetch(resource.toString(true), {
				method: request.method,
				signal: request.signal,
				bypassCustomProtocolHandlers: true,
			});
			const headers = new Headers(response.headers);
			headers.set('Content-Type', getWebviewContentMimeType(resource));
			headers.set('Access-Control-Allow-Origin', '*');
			headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
			headers.set('X-Content-Type-Options', 'nosniff');
			return new Response(request.method === 'HEAD' ? null : response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		} catch {
			return undefined;
		}
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

	private decodeResourceUri(value: string, query: string): URI | undefined {
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
				query,
			});
		} catch {
			return undefined;
		}
	}

	private decodeAuthority(authority: string): string {
		return authority.replace(/-([0-9a-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
	}

}
