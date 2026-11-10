/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { getMediaOrTextMime } from '../../../../base/common/mime.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from '../../../../platform/files/common/files.js';
import { IRemoteResourceProvider, IResourceUriProvider } from '../../../browser/web.api.js';
import { IBrowserResourceService } from '../../../../platform/files/common/browserResourceService.js';

export class BrowserRemoteResourceLoader extends Disposable {
	constructor(
		private readonly provider: IRemoteResourceProvider,
		@IFileService fileService: IFileService,
		@IBrowserResourceService browserResourceService: IBrowserResourceService,
	) {
		super();

		this._register(provider.onDidReceiveRequest(async request => {
			const resourceId = new URLSearchParams(request.uri.query).get('resourceId');
			if (resourceId !== null) {
				try {
					const result = await browserResourceService.read(resourceId);
					if (result) {
						request.respondWith(200, result.content.buffer, result.mimeType ? { 'content-type': result.mimeType } : {});
					} else {
						request.respondWith(404, new Uint8Array(), {});
					}
				} catch (error) {
					request.respondWith(
						error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND ? 404 : 500,
						VSBuffer.fromString(toErrorMessage(error)).buffer,
						{},
					);
				}
				return;
			}
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
