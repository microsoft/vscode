/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

/** An image that a markup changed. */
export interface IImageCarouselMarkUpResult {
	readonly data: VSBuffer;
	readonly mimeType: string;
}

/**
 * Marks up an image in the Images Preview, see {@link ICarouselImage.markUp}. Disposing it can discard changes that it
 * has not applied yet, so the Images Preview only disposes it once `result` has settled.
 */
export interface IImageCarouselMarkUp extends IDisposable {
	/** Resolves once the markup ends, with the changed image, or `undefined` when it did not change. */
	readonly result: Promise<IImageCarouselMarkUpResult | undefined>;
	focus(): void;
	/** Ends the markup and keeps its changes, like its own Done does. `result` settles once they are applied. */
	finish(): void;
}

export interface ICarouselImage {
	readonly id: string;
	readonly name: string;
	readonly mimeType: string;
	/** In-memory image data. Omit when the image can be loaded lazily from `uri`. */
	readonly data?: VSBuffer;
	/** Original resource, preferred for downloads when `data` is a resized preview. */
	readonly uri?: URI;
	readonly source?: string;
	readonly caption?: string;
	/**
	 * Shows a markup of the image in `container`, for an image that can be marked up. When the markup ends,
	 * the Images Preview shows the image again, with its changes.
	 */
	readonly markUp?: (container: HTMLElement) => IImageCarouselMarkUp;
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
