/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const ImageCarouselContextMenu = MenuId.for('ImageCarouselContext');
export const ImageCarouselContextKeys = {
	hasMedia: new RawContextKey<boolean>('imageCarouselHasMedia', false),
	canCopy: new RawContextKey<boolean>('imageCarouselCanCopy', false),
	hasSource: new RawContextKey<boolean>('imageCarouselHasSource', false),
	canReveal: new RawContextKey<boolean>('imageCarouselCanReveal', false),
};

export interface ICarouselImage {
	readonly id: string;
	readonly name: string;
	readonly mimeType: string;
	/** In-memory image data. Omit when the image can be loaded lazily from `uri`. */
	readonly data?: VSBuffer;
	readonly uri?: URI;
	/** The original file, distinct from a generated image's content URI. */
	readonly sourceUri?: URI;
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
