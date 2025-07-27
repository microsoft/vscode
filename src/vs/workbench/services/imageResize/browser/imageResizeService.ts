/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IImageResizeService } from '../../../../platform/imageResize/common/imageResizeService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class ImageResizeService implements IImageResizeService {
	resizeImage(data: Uint8Array | string, mimeType?: string): Promise<Uint8Array> {
		throw new Error('Method not implemented.');
	}

	declare readonly _serviceBrand: undefined;
}

registerSingleton(IImageResizeService, ImageResizeService, InstantiationType.Delayed);
