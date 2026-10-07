/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../base/common/buffer.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IImageResizeService } from '../common/imageResizeService.js';


export class ImageResizeService implements IImageResizeService {

	declare readonly _serviceBrand: undefined;

	/**
	 * Resizes an image provided as a UInt8Array string. Resizing is based on Open AI's algorithm for tokenzing images.
	 * https://platform.openai.com/docs/guides/vision#calculating-costs
	 * @param data - The UInt8Array string of the image to resize.
	 * @returns A promise that resolves to the UInt8Array string of the resized image.
	 */

	async resizeImage(data: Uint8Array | string, mimeType?: string): Promise<Uint8Array> {
		const isGif = mimeType === 'image/gif';

		if (typeof data === 'string') {
			data = this.convertStringToUInt8Array(data);
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

	convertStringToUInt8Array(data: string): Uint8Array {
		const base64Data = data.includes(',') ? data.split(',')[1] : data;
		if (this.isValidBase64(base64Data)) {
			return decodeBase64(base64Data).buffer;
		}
		return new TextEncoder().encode(data);
	}

	isValidBase64(str: string): boolean {
		try {
			decodeBase64(str);
			return true;
		} catch {
			return false;
		}
	}
}

registerSingleton(IImageResizeService, ImageResizeService, InstantiationType.Delayed);
