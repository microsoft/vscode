/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { ISharedWebContentExtractorService } from '../common/webContentExtractor.js';

export class SharedWebContentExtractorService implements ISharedWebContentExtractorService {
	_serviceBrand: undefined;

	async readImage(uri: URI, token: CancellationToken): Promise<VSBuffer | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		try {
			const response = await fetch(uri.toString(true), {
				headers: {
					'Accept': 'image/*',
					'User-Agent': 'Mozilla/5.0'
				}
			});
			const contentType = response.headers.get('content-type');
			if (!response.ok || !contentType?.startsWith('image/') || !/(webp|jpg|jpeg|gif|png|bmp)$/i.test(contentType)) {
				return undefined;
			}

			const content = VSBuffer.wrap(await (response as unknown as { bytes: () => Promise<Uint8Array<ArrayBuffer>> } /* workaround https://github.com/microsoft/TypeScript/issues/61826 */).bytes());
			return content;
		} catch (err) {
			console.log(err);
			return undefined;
		}
	}


	async chatImageUploader(binaryData: VSBuffer, name: string, mimeType: string | undefined, token: string | undefined): Promise<string> {
		if (mimeType && token) {
			const sanitizedName = name.replace(/\s+/g, '').replace(/%20/g, '');
			let uploadName = sanitizedName;
			const subtype = mimeType.split('/')[1].split('+')[0].toLowerCase();
			if (!uploadName.toLowerCase().endsWith(`.${subtype}`)) {
				uploadName = `${uploadName}.${subtype}`;
			}
			const url = `https://uploads.github.com/copilot/chat/attachments?name=${uploadName}&content_type=${mimeType}`;

			const init: RequestInit = {
				method: 'POST',
				body: new Uint8Array(binaryData.buffer),
				credentials: 'include',
				headers: {
					'Content-Type': 'application/octet-stream',
					'Authorization': `Bearer ${token}`
				}
			};

			try {
				const response = await fetch(url, init);
				if (!response.ok) {
					console.error(`Invalid GitHub URL provided: ${response.status} ${response.statusText}`);
					return '';
				}
				const result = await response.json();
				return result.url;
			} catch (error) {
				console.error('Error uploading image:', error);
				return '';
			}
		}
		return '';
	}

}
