/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IImageResizeService = createDecorator<IImageResizeService>('imageResizeService');
export interface IImageResizeService extends ICommonImageResizeService { }

export const IImageResizeMainService = createDecorator<IImageResizeMainService>('imageResizeMainService');
export interface IImageResizeMainService extends ICommonImageResizeService { }



export interface ICommonImageResizeService {

	readonly _serviceBrand: undefined;

	/**
	 * Resizes an image to a maximum dimension of 768px while maintaining aspect ratio.
	 * Large images (>2048px) are first downsized to 2048px before the final resize.
	 * @param data Image data as Uint8Array or base64/dataUrl string
	 * @param mimeType The MIME type of the image (e.g., image/png, image/jpeg)
	 * @returns Serialized image data with a number[] array that can be converted to a VSBuffer using:
	 *         VSBuffer.wrap(new Uint8Array(resultData.data))
	 */
	resizeImage(data: Uint8Array | string, mimeType?: string): Promise<Uint8Array>;
}
