/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebWorkerServerRequestHandler } from '../../../../base/common/worker/webWorker.js';

/**
 * Encodes images to PNG off the main thread. On the main thread, Chromium encodes canvases using
 * idle tasks, which can be starved for seconds when the renderer is busy.
 */
export class ImageEncoderWorker implements IWebWorkerServerRequestHandler {
	_requestHandlerBrand: void = undefined;

	async $encodePng(bitmap: ImageBitmap): Promise<ArrayBuffer> {
		try {
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Failed to create a canvas to encode the image');
			}

			context.drawImage(bitmap, 0, 0);
			// Free the source pixels before encoding so only one full-size copy is alive during the encode
			bitmap.close();
			const blob = await canvas.convertToBlob({ type: 'image/png' });
			return await blob.arrayBuffer();
		} finally {
			bitmap.close();
		}
	}
}

export function create(): ImageEncoderWorker {
	return new ImageEncoderWorker();
}
