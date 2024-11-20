/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ThreeKeyMap } from '../../../../base/common/map.js';
import type { IBoundingBox, IRasterizedGlyph } from '../raster/raster.js';

/**
 * Information about a {@link IRasterizedGlyph rasterized glyph} that has been drawn to a texture
 * atlas page.
 */
export interface ITextureAtlasPageGlyph {
	/**
	 * The page index of the texture atlas page that the glyph was drawn to.
	 */
	pageIndex: number;
	/**
	 * The index of the glyph in the texture atlas page.
	 */
	glyphIndex: number;
	/** The x coordinate of the glyph on the texture atlas page. */
	x: number;
	/** The y coordinate of the glyph on the texture atlas page. */
	y: number;
	/** The width of the glyph in pixels. */
	w: number;
	/** The height of the glyph in pixels. */
	h: number;
	/** The x offset from {@link x} of the glyph's origin. */
	originOffsetX: number;
	/** The y offset from {@link y} of the glyph's origin. */
	originOffsetY: number;
}

/**
 * A texture atlas allocator is responsible for taking rasterized glyphs, drawing them to a texture
 * atlas page canvas and return information on the texture atlas glyph.
 */
export interface ITextureAtlasAllocator {
	/**
	 * Allocates a rasterized glyph to the canvas, drawing it and returning information on its
	 * position in the canvas. This will return undefined if the glyph does not fit on the canvas.
	 */
	allocate(rasterizedGlyph: Readonly<IRasterizedGlyph>): Readonly<ITextureAtlasPageGlyph> | undefined;
	/**
	 * Gets a usage preview of the atlas for debugging purposes.
	 */
	getUsagePreview(): Promise<Blob>;
	/**
	 * Gets statistics about the allocator's current state for debugging purposes.
	 */
	getStats(): string;
}

/**
 * A texture atlas page that can be read from but not modified.
 */
export interface IReadableTextureAtlasPage {
	/**
	 * A unique identifier for the current state of the texture atlas page. This is a number that
	 * increments whenever a glyph is drawn to the page.
	 */
	readonly version: number;
	/**
	 * A bounding box representing the area of the texture atlas page that is currently in use.
	 */
	readonly usedArea: Readonly<IBoundingBox>;
	/**
	 * An iterator over all glyphs that have been drawn to the page. This will iterate through
	 * glyphs in the order they have been drawn.
	 */
	readonly glyphs: IterableIterator<Readonly<ITextureAtlasPageGlyph>>;
	/**
	 * The source canvas for the texture atlas page.
	 */
	readonly source: OffscreenCanvas;
	/**
	 * Gets a usage preview of the atlas for debugging purposes.
	 */
	getUsagePreview(): Promise<Blob>;
	/**
	 * Gets statistics about the allocator's current state for debugging purposes.
	 */
	getStats(): string;
}

export const enum UsagePreviewColors {
	Unused = '#808080',
	Used = '#4040FF',
	Wasted = '#FF0000',
	Restricted = '#FF000088',
}

export type GlyphMap<T> = ThreeKeyMap</*chars*/string, /*metadata*/number, /*rasterizerCacheKey*/string, T>;
