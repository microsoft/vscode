/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MetadataConsts } from '../../../common/encodedTokenAttributes.js';

export interface IGlyphRasterizer {
	/**
	 * A unique identifier for the rasterizer.
	 */
	readonly id: number;

	/**
	 * An identifier for properties inherent to rendering with this rasterizer. This will be the
	 * same as other rasterizer cache keys provided they share the same property values in question.
	 */
	readonly cacheKey: string;

	/**
	 * Rasterizes a glyph.
	 * @param chars The character(s) to rasterize. This can be a single character, a ligature, an
	 * emoji, etc.
	 * @param tokenMetadata The token metadata of the glyph to rasterize. See {@link MetadataConsts}
	 * for how this works.
	 * @param charMetadata The chracter metadata of the glyph to rasterize.
	 * @param colorMap A theme's color map.
	 */
	rasterizeGlyph(
		chars: string,
		tokenMetadata: number,
		charMetadata: number,
		colorMap: string[],
	): Readonly<IRasterizedGlyph>;
}

/**
 * A simple bounding box in a 2D plane.
 */
export interface IBoundingBox {
	/** The left x coordinate (inclusive). */
	left: number;
	/** The top y coordinate (inclusive). */
	top: number;
	/** The right x coordinate (inclusive). */
	right: number;
	/** The bottom y coordinate (inclusive). */
	bottom: number;
}

/**
 * A glyph that has been rasterized to a canvas.
 */
export interface IRasterizedGlyph {
	/**
	 * The source canvas the glyph was rasterized to.
	 */
	source: OffscreenCanvas;
	/**
	 * The bounding box of the glyph within {@link source}.
	 */
	boundingBox: IBoundingBox;
	/**
	 * The offset to the glyph's origin (where it should be drawn to).
	 */
	originOffset: { x: number; y: number };
	/**
	 * The distance from the the glyph baseline to the top of the highest bounding rectangle of all
	 * fonts used to render the text.
	 *
	 * @see {@link TextMetrics.fontBoundingBoxAscent}
	 */
	fontBoundingBoxAscent: number;
	/**
	 * The distance from the the glyph baseline to the bottom of the bounding rectangle of all fonts
	 * used to render the text.
	 *
	 * @see {@link TextMetrics.fontBoundingBoxDescent}
	 */
	fontBoundingBoxDescent: number;
}
