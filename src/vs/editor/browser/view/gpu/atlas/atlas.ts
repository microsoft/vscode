/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TwoKeyMap } from 'vs/base/common/map';
import type { IRasterizedGlyph } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';

export interface ITextureAtlasGlyph {
	textureIndex: number;
	index: number;
	x: number;
	y: number;
	w: number;
	h: number;
	originOffsetX: number;
	originOffsetY: number;
}

export interface IBoundingBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface ITextureAtlasAllocator {
	readonly glyphMap: TwoKeyMap<string, number, ITextureAtlasGlyph>;
	/**
	 * Allocates a rasterized glyph to the canvas, drawing it and returning information on its
	 * position in the canvas. This will return undefined if the glyph does not fit on the canvas.
	 */
	allocate(chars: string, tokenFg: number, rasterizedGlyph: IRasterizedGlyph): ITextureAtlasGlyph | undefined;
	/**
	 * Gets a usage preview of the atlas for debugging purposes.
	 */
	getUsagePreview(): Promise<Blob>;
}

export interface IReadableTextureAtlasPage {
	readonly version: number;
	readonly glyphs: IterableIterator<ITextureAtlasGlyph>;
	readonly source: OffscreenCanvas;
	getUsagePreview(): Promise<Blob>;
}
