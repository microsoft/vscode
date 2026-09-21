/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { getImageDimensionsFromBytes } from '../../../util/common/imageUtils';
import { URI } from '../../../util/vs/base/common/uri';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { calculateImageTokenCostForDimensions } from '../../tokenizer/common/attachmentTokenCost';
import { IImageService, UploadedAttachmentMetadata } from '../common/imageService';

/** Upper bound on remembered uploads; a session rarely gets anywhere near it. */
const MAX_REMEMBERED_UPLOADS = 500;

export class ImageServiceImpl implements IImageService {
	declare readonly _serviceBrand: undefined;

	private readonly _uploadedAttachments = new Map<string, UploadedAttachmentMetadata>();

	constructor(
		@ICAPIClientService private readonly capiClient: ICAPIClientService,
	) { }

	async uploadChatImageAttachment(binaryData: Uint8Array, name: string, mimeType: string | undefined, token: string | undefined): Promise<URI> {
		if (!mimeType || !token) {
			throw new Error('Missing required mimeType or token for image upload');
		}

		const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '');
		let uploadName = sanitizedName;

		// can catch unexpected types like "IMAGE/JPEG", "image/svg+xml", or "image/png; charset=UTF-8"
		const subtypeMatch = mimeType.toLowerCase().match(/^[^\/]+\/([^+;]+)/);
		const subtype = subtypeMatch?.[1];

		// add the extension if it is missing.
		if (subtype && !uploadName.toLowerCase().endsWith(`.${subtype}`)) {
			uploadName = `${uploadName}.${subtype}`;
		}

		try {
			const response = await this.capiClient.makeRequest<Response>({
				method: 'POST',
				body: binaryData,
				headers: {
					'Content-Type': 'application/octet-stream',
					Authorization: `Bearer ${token}`,
				}
			}, { type: RequestType.ChatAttachmentUpload, uploadName, mimeType });
			if (!response.ok) {
				throw new Error(`Image upload failed: ${response.status} ${response.statusText}`);
			}
			const result = await response.json() as { url: string };
			const uri = URI.parse(result.url);
			this.rememberUpload(uri.toString(), binaryData, mimeType);
			return uri;
		} catch (error) {
			throw new Error(`Error uploading image: ${error}`);
		}
	}

	getUploadedAttachmentMetadata(uri: string): UploadedAttachmentMetadata | undefined {
		return this._uploadedAttachments.get(uri);
	}

	private rememberUpload(uri: string, binaryData: Uint8Array, mimeType: string): void {
		const metadata: UploadedAttachmentMetadata = { mimeType, sizeBytes: binaryData.byteLength };
		try {
			const { width, height } = getImageDimensionsFromBytes(binaryData, mimeType);
			metadata.width = width;
			metadata.height = height;
			// Attachments are sent at `detail: 'high'`, which is also the formula's default.
			metadata.estimatedTokens = calculateImageTokenCostForDimensions(width, height, 'high');
		} catch {
			// Unreadable header: keep the size only.
		}
		if (this._uploadedAttachments.size >= MAX_REMEMBERED_UPLOADS) {
			const oldest = this._uploadedAttachments.keys().next().value;
			if (oldest !== undefined) {
				this._uploadedAttachments.delete(oldest);
			}
		}
		this._uploadedAttachments.set(uri, metadata);
	}

	async resizeImage(data: Uint8Array, mimeType: string): Promise<{ data: Uint8Array; mimeType: string }> {
		return { data, mimeType };
	}
}
