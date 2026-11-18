/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ISharedWebContentExtractorService } from '../common/webContentExtractor.js';

export class SharedWebContentExtractorService implements ISharedWebContentExtractorService {
	_serviceBrand: undefined;

	async readImage(uri: URI, token: CancellationToken): Promise<VSBuffer | undefined> {
		try {
			const image = await this.readImageWithMetadata(uri, token);
			return image && /^image\/(webp|jpg|jpeg|gif|png|bmp)$/.test(image.mimeType) ? image.data : undefined;
		} catch (err) {
			console.error(err);
			return undefined;
		}
	}

	async readImageWithMetadata(uri: URI, token: CancellationToken): Promise<{ data: VSBuffer; mimeType: string } | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const response = await fetch(uri.toString(true), {
			headers: {
				'Accept': 'image/*',
				'User-Agent': 'Mozilla/5.0'
			}
		});
		if (!response.ok) {
			throw new Error(localize('imageRequestFailed', "Image request failed ({0}).", response.status));
		}
		const mimeType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || 'application/octet-stream';
		if (!mimeType.startsWith('image/') && mimeType !== 'application/octet-stream') {
			throw new Error(localize('imageTypeUnsupported', "The response is not a supported image."));
		}
		return { data: VSBuffer.wrap(new Uint8Array(await response.arrayBuffer())), mimeType };
	}
}
