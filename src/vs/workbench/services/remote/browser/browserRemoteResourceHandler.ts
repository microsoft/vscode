/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Disposable } from 'vs/base/common/lifecycle';
import { getMediaOrTextMime } from 'vs/base/common/mime';
import { URI, UriComponents } from 'vs/base/common/uri';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from 'vs/platform/files/common/files';
import { IRemoteResourceProvider, IResourceUriProvider } from 'vs/workbench/browser/web.api';

export class BrowserRemoteResourceLoader extends Disposable {
	constructor(
		@IFileService fileService: IFileService,
		private readonly provider: IRemoteResourceProvider,
	) {
		super();

		this._register(provider.onDidReceiveRequest(async request => {
			let uri: UriComponents;
			try {
				uri = JSON.parse(decodeURIComponent(request.uri.query));
			} catch {
				return request.respondWith(404, new Uint8Array(), {});
			}

			let content: IFileContent;
			try {
				content = await fileService.readFile(URI.from(uri, true));
			} catch (e) {
				const str = VSBuffer.fromString(e.message).buffer;
				if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					return request.respondWith(404, str, {});
				} else {
					return request.respondWith(500, str, {});
				}
			}

			const mime = uri.path && getMediaOrTextMime(uri.path);
			request.respondWith(200, content.value.buffer, mime ? { 'content-type': mime } : {});
		}));
	}

	public getResourceUriProvider(): IResourceUriProvider {
		const baseUri = URI.parse(document.location.href);
		return uri => baseUri.with({
			path: this.provider.path,
			query: JSON.stringify(uri),
		});
	}
}
