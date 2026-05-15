/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { URI } from '../../../util/vs/base/common/uri';

export const IImageService = createServiceIdentifier<IImageService>('IImageService');

export interface IImageService {
	readonly _serviceBrand: undefined;

	/**
	 * Upload image data to GitHub Copilot chat attachments endpoint
	 * @param binaryData The image binary data as Uint8Array
	 * @param name The name for the uploaded file
	 * @param mimeType The MIME type of the image
	 * @param token The authentication token for GitHub API
	 * @returns Promise<URI> The URI of the uploaded image
	 */
	uploadChatImageAttachment(binaryData: Uint8Array, name: string, mimeType: string | undefined, token: string | undefined): Promise<URI>;

	/**
	 * Resize an image to reduce token consumption when sending to language models.
	 * Returns the original data and MIME type unchanged if resizing is not available or fails.
	 * The output MIME type may differ from the input (e.g. GIF/WebP inputs are re-encoded as PNG).
	 */
	resizeImage(data: Uint8Array, mimeType: string): Promise<{ data: Uint8Array; mimeType: string }>;
}

export const nullImageService: IImageService = {
	_serviceBrand: undefined,
	async uploadChatImageAttachment(): Promise<URI> {
		throw new Error('Image service not implemented');
	},
	async resizeImage(data: Uint8Array, mimeType: string): Promise<{ data: Uint8Array; mimeType: string }> {
		return { data, mimeType };
	}
};
