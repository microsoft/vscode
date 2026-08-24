/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { LRUCache } from '../../../../base/common/map.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';

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

/**
 * Creates a small downscaled thumbnail of an image. Useful for compact previews
 * (e.g. attachment pills) where the UI should retain a small rendered image
 * instead of a full-resolution object URL.
 *
 * The thumbnail is re-encoded as JPEG when the source is a JPEG and as PNG
 * otherwise, so that photographic images don't balloon in size from being
 * re-encoded as PNG.
 * @param data The image bytes.
 * @param maxSize The maximum width or height of the thumbnail, in pixels.
 * @returns A promise that resolves to a {@link Blob} of the thumbnail, or `undefined` on failure.
 */
function createImageThumbnail(data: Uint8Array, maxSize: number): Promise<Blob | undefined> {
	return new Promise((resolve) => {
		const blob = new Blob([data as Uint8Array<ArrayBuffer>]);
		const img = document.createElement('img');
		const url = URL.createObjectURL(blob);
		img.src = url;

		img.onload = () => {
			URL.revokeObjectURL(url);
			const { width, height } = img;
			const scaleFactor = Math.min(1, maxSize / Math.max(width, height));
			const targetWidth = Math.max(1, Math.round(width * scaleFactor));
			const targetHeight = Math.max(1, Math.round(height * scaleFactor));

			const canvas = document.createElement('canvas');
			canvas.width = targetWidth;
			canvas.height = targetHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				resolve(undefined);
				return;
			}

			ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
			// JPEG (FF D8 FF) re-encodes far smaller than PNG for photos, so keep it as JPEG.
			const outputMimeType = data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF ? 'image/jpeg' : 'image/png';
			canvas.toBlob(thumbnail => resolve(thumbnail ?? undefined), outputMimeType);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(undefined);
		};
	});
}

/**
 * Bounded cache of generated image thumbnails, keyed by a caller-provided stable
 * identifier (e.g. an attachment id). Attachment widgets are torn down and
 * recreated whenever the attachment list re-renders, so memoizing the downscaled
 * blob avoids re-decoding and re-resizing the full-resolution image every time.
 *
 * Only the small thumbnail bytes are retained, and the cache is bounded so memory
 * stays predictable. The cached value is a `Promise` so concurrent renders of the
 * same image share a single in-flight decode.
 */
const thumbnailCache = new LRUCache<string, Promise<Blob | undefined>>(50);

/**
 * Safety net so a cached decode always settles. {@link createImageThumbnail}
 * only resolves via the image element's load/error events, which may never fire
 * if the {@link Window} it decodes in is torn down mid-decode. Without this, the
 * cached (pending) promise would never resolve, blocking every later render of
 * that image. The value is far larger than any real decode of an already-resized
 * image, so it never trips in the normal path. The timer is cleared the instant
 * the decode settles, so this adds negligible cost.
 */
const THUMBNAIL_DECODE_TIMEOUT_MS = 10_000;
export const CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE = 768;

/**
 * Memoized variant of {@link createImageThumbnail}. Repeated calls with the same
 * {@link cacheKey} (and matching size/byte length) reuse the previously generated
 * thumbnail instead of decoding and resizing the original image again.
 * @param cacheKey A stable identifier for the source image (e.g. the attachment id).
 * @param data The image bytes.
 * @param maxSize The maximum width or height of the thumbnail, in pixels.
 * @returns A promise that resolves to a {@link Blob} of the thumbnail, or `undefined` on failure.
 */
export function getOrCreateImageThumbnail(cacheKey: string, data: Uint8Array, maxSize: number): Promise<Blob | undefined> {
	// Include the size and byte length so a reused id with different content or a
	// different target size doesn't return a stale thumbnail.
	const key = `${cacheKey}:${maxSize}:${data.byteLength}`;
	const cached = thumbnailCache.get(key);
	if (cached) {
		return cached;
	}

	const thumbnail: Promise<Blob | undefined> = raceTimeout(createImageThumbnail(data, maxSize), THUMBNAIL_DECODE_TIMEOUT_MS).then(blob => {
		// Don't keep failures cached so a later render can retry. Only evict our own
		// entry in case LRU eviction already replaced it with a newer decode.
		if (!blob && thumbnailCache.peek(key) === thumbnail) {
			thumbnailCache.delete(key);
		}
		return blob;
	});
	thumbnailCache.set(key, thumbnail);
	return thumbnail;
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

CommandsRegistry.registerCommand('_chat.resizeImage', async (_accessor, data: Uint8Array | VSBuffer, mimeType?: string): Promise<Uint8Array> => {
	if (data instanceof VSBuffer) {
		data = data.buffer;
	}
	return resizeImage(data, mimeType);
});
