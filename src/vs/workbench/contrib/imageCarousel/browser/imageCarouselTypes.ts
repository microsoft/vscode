/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export interface ICarouselImage {
	readonly id: string;
	readonly name: string;
	readonly mimeType: string;
	/** In-memory image data. Omit when the image can be loaded lazily from `uri`. */
	readonly data?: VSBuffer;
	readonly uri?: URI;
	readonly source?: string;
	readonly caption?: string;
}

export interface ICarouselSection {
	readonly title: string;
	readonly images: ReadonlyArray<ICarouselImage>;
}

export interface IImageCarouselCollection {
	readonly id: string;
	readonly title: string;
	readonly sections: ReadonlyArray<ICarouselSection>;
}

export function isVideoMimeType(mimeType: string): boolean {
	return mimeType.startsWith('video/');
}
