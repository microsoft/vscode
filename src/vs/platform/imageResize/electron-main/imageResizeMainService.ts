/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IImageResizeMainService } from '../common/imageResizeService.js';
import { ILogService } from '../../log/common/log.js';
import { nativeImage } from 'electron';

export class ImageResizeMainService implements IImageResizeMainService {
	_serviceBrand: undefined;

	constructor(
		@ILogService _logService: ILogService
	) { }

	resizeImage(data: Uint8Array | string, mimeType?: string): Promise<Uint8Array> {
		return new Promise((resolve, reject) => {
			try {
				let image: Electron.NativeImage;
				if (typeof data === 'string') {
					if (!data.startsWith('data:')) {
						const inferredMimeType = mimeType || 'image/png';
						data = `data:${inferredMimeType};base64,${data}`;
					}
					image = nativeImage.createFromDataURL(data);
				} else {
					image = nativeImage.createFromBuffer(Buffer.from(data));
				}

				const size = image.getSize();
				const { width, height } = size;

				if (width === 0 || height === 0) {
					throw new Error('Failed to create valid image from input data');
				}

				const isGif = mimeType?.includes('gif') ?? false;

				if (!((width <= 768 || height <= 768) && !isGif)) {
					let newWidth = width;
					let newHeight = height;

					if (width > 2048 || height > 2048) {
						const scaleFactor = 2048 / Math.max(width, height);
						newWidth = Math.round(width * scaleFactor);
						newHeight = Math.round(height * scaleFactor);
					}

					const scaleFactor = 768 / Math.min(newWidth, newHeight);
					newWidth = Math.round(newWidth * scaleFactor);
					newHeight = Math.round(newHeight * scaleFactor);

					image = image.resize({
						width: newWidth,
						height: newHeight,
						quality: 'better'
					});
				}
				let buffer: Buffer;
				if (mimeType?.includes('png')) {
					buffer = image.toPNG();
				} else if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) {
					buffer = image.toJPEG(90);
				} else if (mimeType?.includes('webp')) {
					buffer = image.toPNG();
				} else {
					buffer = image.toPNG();
				}

				if (!buffer || buffer.length === 0) {
					throw new Error('Generated empty buffer');
				}

				const resultData = new Uint8Array(buffer);
				resolve(resultData);
			} catch (error) {
				reject(error);
			}
		});
	}
}

