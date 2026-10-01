/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { createPngBytes } from '../../common/test/testImageData';
import { ImageServiceImpl } from '../imageServiceImpl';

const uploadedUrl = 'https://github.com/github-copilot/chat/attachments/0f8fad5b-d9cb-469f-a165-70867728950e';

function createService(url = uploadedUrl) {
	const makeRequest = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) });
	const service = new ImageServiceImpl({ makeRequest } as unknown as ICAPIClientService);
	return { service, makeRequest };
}

describe('ImageServiceImpl uploaded attachment metadata', () => {
	it('remembers size, dimensions and token estimate of an uploaded image by its URL', async () => {
		const { service } = createService();
		const bytes = createPngBytes(64, 32);

		const uri = await service.uploadChatImageAttachment(bytes, 'screenshot', 'image/png', 'token');

		expect(uri.toString()).toBe(uploadedUrl);
		expect(service.getUploadedAttachmentMetadata(uri.toString())).toEqual({
			mimeType: 'image/png',
			sizeBytes: bytes.byteLength,
			width: 64,
			height: 32,
			// 64x32 → 1536x768 → 3x2 tiles
			estimatedTokens: 6 * 170 + 85,
		});
	});

	it('keeps the size when the image header cannot be read', async () => {
		const { service } = createService();
		const bytes = new TextEncoder().encode('not an image');

		const uri = await service.uploadChatImageAttachment(bytes, 'blob', 'image/png', 'token');

		expect(service.getUploadedAttachmentMetadata(uri.toString())).toEqual({ mimeType: 'image/png', sizeBytes: bytes.byteLength });
	});

	it('keeps only the size when the header reports a zero dimension', async () => {
		const { service } = createService();
		const bytes = createPngBytes(0, 32);

		const uri = await service.uploadChatImageAttachment(bytes, 'blob', 'image/png', 'token');

		expect(service.getUploadedAttachmentMetadata(uri.toString())).toEqual({ mimeType: 'image/png', sizeBytes: bytes.byteLength });
	});

	it('knows nothing about URLs it did not upload', () => {
		const { service } = createService();
		expect(service.getUploadedAttachmentMetadata('https://example.com/other.png')).toBeUndefined();
	});

	it('remembers nothing when the upload fails', async () => {
		const makeRequest = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'boom' });
		const service = new ImageServiceImpl({ makeRequest } as unknown as ICAPIClientService);

		await expect(service.uploadChatImageAttachment(createPngBytes(8, 8), 'x', 'image/png', 'token')).rejects.toThrow();
		expect(service.getUploadedAttachmentMetadata(uploadedUrl)).toBeUndefined();
	});
});
