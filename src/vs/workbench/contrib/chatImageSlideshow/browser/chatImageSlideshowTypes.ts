/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

/**
 * Represents an image to be displayed in the slideshow
 */
export interface ISlideshowImage {
	/**
	 * Unique identifier for the image
	 */
	readonly id: string;

	/**
	 * Display name of the image
	 */
	readonly name: string;

	/**
	 * MIME type of the image (e.g., 'image/png', 'image/jpeg')
	 */
	readonly mimeType: string;

	/**
	 * The image data
	 */
	readonly data: VSBuffer;

	/**
	 * Optional URI if the image is from a file
	 */
	readonly uri?: URI;

	/**
	 * Optional source information (e.g., "Chat Tool: fetch_web_page")
	 */
	readonly source?: string;
}

/**
 * Collection of images for a slideshow
 */
export interface ISlideshowImageCollection {
	/**
	 * Unique identifier for this collection
	 */
	readonly id: string;

	/**
	 * Display title for the collection
	 */
	readonly title: string;

	/**
	 * Images in the collection
	 */
	readonly images: ReadonlyArray<ISlideshowImage>;
}
