/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IImageResizeService = createDecorator<IImageResizeService>('imageResizeMainService');


export interface IImageResizeService {

	readonly _serviceBrand: undefined;

	/**
	 * Resizes an image to a maximum dimension of 768px while maintaining aspect ratio.
	 */
	resizeImage(data: Uint8Array | string, mimeType?: string): Promise<Uint8Array>;
}
