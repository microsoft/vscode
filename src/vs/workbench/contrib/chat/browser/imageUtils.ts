/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/**
 * Resizes an image provided as a UInt8Array string. Resizing is based on Open AI's algorithm for tokenzing images.
 * https://platform.openai.com/docs/guides/vision#calculating-costs
 * @param data - The UInt8Array string of the image to resize.
 * @returns A promise that resolves to the UInt8Array string of the resized image.
 */

export async function resizeImage(data: Uint8Array | string, mimeType?: string): Promise<Uint8Array> {
	const isGif = mimeType === 'image/gif';

	if (typeof data === 'string') {
		data = convertStringToUInt8Array(data);
	}

	return new Promise((resolve, reject) => {
		const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType });
		const img = new Image();
		const url = URL.createObjectURL(blob);
		img.src = url;

		img.onload = () => {
			URL.revokeObjectURL(url);
			let { width, height } = img;

			if ((width <= 768 || height <= 768) && !isGif) {
				resolve(data);
				return;
			}

			// Calculate the new dimensions while maintaining the aspect ratio
			if (width > 2048 || height > 2048) {
				const scaleFactor = 2048 / Math.max(width, height);
				width = Math.round(width * scaleFactor);
				height = Math.round(height * scaleFactor);
			}

			const scaleFactor = 768 / Math.min(width, height);
			width = Math.round(width * scaleFactor);
			height = Math.round(height * scaleFactor);

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.drawImage(img, 0, 0, width, height);

				const jpegTypes = ['image/jpeg', 'image/jpg'];
				const outputMimeType = mimeType && jpegTypes.includes(mimeType) ? 'image/jpeg' : 'image/png';

				canvas.toBlob(blob => {
					if (blob) {
						const reader = new FileReader();
						reader.onload = () => {
							resolve(new Uint8Array(reader.result as ArrayBuffer));
						};
						reader.onerror = (error) => reject(error);
						reader.readAsArrayBuffer(blob);
					} else {
						reject(new Error('Failed to create blob from canvas'));
					}
				}, outputMimeType);
			} else {
				reject(new Error('Failed to get canvas context'));
			}
		};
		img.onerror = (error) => {
			URL.revokeObjectURL(url);
			reject(error);
		};
	});
}

export function convertStringToUInt8Array(data: string): Uint8Array {
	const base64Data = data.includes(',') ? data.split(',')[1] : data;
	if (isValidBase64(base64Data)) {
		return decodeBase64(base64Data).buffer;
	}
	return new TextEncoder().encode(data);
}

// Only used for URLs
export function convertUint8ArrayToString(data: Uint8Array): string {
	try {
		const decoder = new TextDecoder();
		const decodedString = decoder.decode(data);
		return decodedString;
	} catch {
		return '';
	}
}

function isValidBase64(str: string): boolean {
	// checks if the string is a valid base64 string that is NOT encoded
	return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && (() => {
		try {
			atob(str);
			return true;
		} catch {
			return false;
		}
	})();
}

export async function createFileForMedia(fileService: IFileService, imagesFolder: URI, dataTransfer: Uint8Array, mimeType: string): Promise<URI | undefined> {
	const exists = await fileService.exists(imagesFolder);
	if (!exists) {
		await fileService.createFolder(imagesFolder);
	}

	const ext = mimeType.split('/')[1] || 'png';
	const filename = `image-${Date.now()}.${ext}`;
	const fileUri = joinPath(imagesFolder, filename);

	const buffer = VSBuffer.wrap(dataTransfer);
	await fileService.writeFile(fileUri, buffer);

	return fileUri;
}

export async function cleanupOldImages(fileService: IFileService, logService: ILogService, imagesFolder: URI): Promise<void> {
	const exists = await fileService.exists(imagesFolder);
	if (!exists) {
		return;
	}

	const duration = 7 * 24 * 60 * 60 * 1000; // 7 days
	const files = await fileService.resolve(imagesFolder);
	if (!files.children) {
		return;
	}

	await Promise.all(files.children.map(async (file) => {
		try {
			const timestamp = getTimestampFromFilename(file.name);
			if (timestamp && (Date.now() - timestamp > duration)) {
				await fileService.del(file.resource);
			}
		} catch (err) {
			logService.error('Failed to clean up old images', err);
		}
	}));
}

function getTimestampFromFilename(filename: string): number | undefined {
	const match = filename.match(/image-(\d+)\./);
	if (match) {
		return parseInt(match[1], 10);
	}
	return undefined;
}
