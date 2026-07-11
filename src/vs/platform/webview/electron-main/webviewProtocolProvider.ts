/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { protocol } from 'electron';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { AppResourcePath, COI, FileAccess, Schemas } from '../../../base/common/network.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { getWebviewContentMimeType } from '../common/mimeTypes.js';
import { WebviewDocumentRegistration } from '../common/webviewManagerService.js';


export class WebviewProtocolProvider implements IDisposable {
	private static readonly documents = new Map<string, WebviewDocumentRegistration>();

	private static validWebviewFilePaths = new Map<string, { readonly mime: string }>([
		['/index.html', { mime: 'text/html' }],
		['/fake.html', { mime: 'text/html' }],
		['/service-worker.js', { mime: 'application/javascript' }],
	]);

	constructor(
		@IFileService private readonly _fileService: IFileService
	) {
		// Register the protocol for loading webview html
		const webviewHandler = this.handleWebviewRequest.bind(this);
		protocol.handle(Schemas.vscodeWebview, webviewHandler);
	}

	dispose(): void {
		protocol.unhandle(Schemas.vscodeWebview);
	}

	public registerWebviewDocument(document: WebviewDocumentRegistration): void {
		WebviewProtocolProvider.documents.set(this.documentKey(document.extensionId, document.webviewId), document);
	}

	public unregisterWebviewDocument(extensionId: string, webviewId: string): void {
		WebviewProtocolProvider.documents.delete(this.documentKey(extensionId, webviewId));
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
		if (!resource || !this.isAllowedResource(resource, document.roots)) {
			return new Response(null, { status: 403 });
		}
		try {
			const content = await this._fileService.readFile(resource);
			return new Response(request.method === 'HEAD' ? null : content.value.buffer as ArrayBufferView<ArrayBuffer>, {
				headers: {
					'Content-Type': getWebviewContentMimeType(resource),
					'Access-Control-Allow-Origin': '*',
					'Cross-Origin-Resource-Policy': 'cross-origin',
					'X-Content-Type-Options': 'nosniff',
				}
			});
		} catch {
			return new Response(null, { status: 404 });
		}
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

	private isAllowedResource(resource: URI, roots: readonly UriComponents[]): boolean {
		for (const rawRoot of roots) {
			const root = URI.revive(rawRoot);
			const normalizedRoot = root.path.endsWith('/') ? root.path : `${root.path}/`;
			if (root.scheme === resource.scheme
				&& root.authority === resource.authority
				&& resource.path.startsWith(normalizedRoot)
				&& !resource.path.split('/').includes('..')) {
				return true;
			}
		}
		return false;
	}
}
