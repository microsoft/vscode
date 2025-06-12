/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../base/common/errors.js';
import { ensureNonNullable } from '../gpuUtils.js';
import type { IRasterizedGlyph } from '../raster/raster.js';
import { UsagePreviewColors, type ITextureAtlasAllocator, type ITextureAtlasPageGlyph } from './atlas.js';

/**
 * The shelf allocator is a simple allocator that places glyphs in rows, starting a new row when the
 * current row is full. Due to its simplicity, it can waste space but it is very fast.
 */
export class TextureAtlasShelfAllocator implements ITextureAtlasAllocator {

	private readonly _ctx: OffscreenCanvasRenderingContext2D;

	private _currentRow: ITextureAtlasShelf = {
		x: 0,
		y: 0,
		h: 0
	};

	/** A set of all glyphs allocated, this is only tracked to enable debug related functionality */
	private readonly _allocatedGlyphs: Set<Readonly<ITextureAtlasPageGlyph>> = new Set();

	private _nextIndex = 0;

	constructor(
		private readonly _canvas: OffscreenCanvas,
		private readonly _textureIndex: number,
	) {
		this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
			willReadFrequently: true
		}));
	}

	public allocate(rasterizedGlyph: IRasterizedGlyph): ITextureAtlasPageGlyph | undefined {
		// The glyph does not fit into the atlas page
		const glyphWidth = rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1;
		const glyphHeight = rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1;
		if (glyphWidth > this._canvas.width || glyphHeight > this._canvas.height) {
			throw new BugIndicatingError('Glyph is too large for the atlas page');
		}

		// Finalize and increment row if it doesn't fix horizontally
		if (rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1 > this._canvas.width - this._currentRow.x) {
			this._currentRow.x = 0;
			this._currentRow.y += this._currentRow.h;
			this._currentRow.h = 1;
		}

		// Return undefined if there isn't any room left
		if (this._currentRow.y + rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1 > this._canvas.height) {
			return undefined;
		}

		// Draw glyph
		this._ctx.drawImage(
			rasterizedGlyph.source,
			// source
			rasterizedGlyph.boundingBox.left,
			rasterizedGlyph.boundingBox.top,
			glyphWidth,
			glyphHeight,
			// destination
			this._currentRow.x,
			this._currentRow.y,
			glyphWidth,
			glyphHeight
		);

		// Create glyph object
		const glyph: ITextureAtlasPageGlyph = {
			pageIndex: this._textureIndex,
			glyphIndex: this._nextIndex++,
			x: this._currentRow.x,
			y: this._currentRow.y,
			w: glyphWidth,
			h: glyphHeight,
			originOffsetX: rasterizedGlyph.originOffset.x,
			originOffsetY: rasterizedGlyph.originOffset.y,
			fontBoundingBoxAscent: rasterizedGlyph.fontBoundingBoxAscent,
			fontBoundingBoxDescent: rasterizedGlyph.fontBoundingBoxDescent,
		};

		// Shift current row
		this._currentRow.x += glyphWidth;
		this._currentRow.h = Math.max(this._currentRow.h, glyphHeight);

		// Set the glyph
		this._allocatedGlyphs.add(glyph);

		return glyph;
	}

	public getUsagePreview(): Promise<Blob> {
		const w = this._canvas.width;
		const h = this._canvas.height;
		const canvas = new OffscreenCanvas(w, h);
		const ctx = ensureNonNullable(canvas.getContext('2d'));
		ctx.fillStyle = UsagePreviewColors.Unused;
		ctx.fillRect(0, 0, w, h);

		const rowHeight: Map<number, number> = new Map(); // y -> h
		const rowWidth: Map<number, number> = new Map(); // y -> w
		for (const g of this._allocatedGlyphs) {
			rowHeight.set(g.y, Math.max(rowHeight.get(g.y) ?? 0, g.h));
			rowWidth.set(g.y, Math.max(rowWidth.get(g.y) ?? 0, g.x + g.w));
		}
		for (const g of this._allocatedGlyphs) {
			ctx.fillStyle = UsagePreviewColors.Used;
			ctx.fillRect(g.x, g.y, g.w, g.h);
			ctx.fillStyle = UsagePreviewColors.Wasted;
			ctx.fillRect(g.x, g.y + g.h, g.w, rowHeight.get(g.y)! - g.h);
		}
		for (const [rowY, rowW] of rowWidth.entries()) {
			if (rowY !== this._currentRow.y) {
				ctx.fillStyle = UsagePreviewColors.Wasted;
				ctx.fillRect(rowW, rowY, w - rowW, rowHeight.get(rowY)!);
			}
		}
		return canvas.convertToBlob();
	}

	getStats(): string {
		const w = this._canvas.width;
		const h = this._canvas.height;

		let usedPixels = 0;
		let wastedPixels = 0;
		const totalPixels = w * h;

		const rowHeight: Map<number, number> = new Map(); // y -> h
		const rowWidth: Map<number, number> = new Map(); // y -> w
		for (const g of this._allocatedGlyphs) {
			rowHeight.set(g.y, Math.max(rowHeight.get(g.y) ?? 0, g.h));
			rowWidth.set(g.y, Math.max(rowWidth.get(g.y) ?? 0, g.x + g.w));
		}
		for (const g of this._allocatedGlyphs) {
			usedPixels += g.w * g.h;
			wastedPixels += g.w * (rowHeight.get(g.y)! - g.h);
		}
		for (const [rowY, rowW] of rowWidth.entries()) {
			if (rowY !== this._currentRow.y) {
				wastedPixels += (w - rowW) * rowHeight.get(rowY)!;
			}
		}
		return [
			`page${this._textureIndex}:`,
			`     Total: ${totalPixels} (${w}x${h})`,
			`      Used: ${usedPixels} (${((usedPixels / totalPixels) * 100).toPrecision(2)}%)`,
			`    Wasted: ${wastedPixels} (${((wastedPixels / totalPixels) * 100).toPrecision(2)}%)`,
			`Efficiency: ${((usedPixels / (usedPixels + wastedPixels)) * 100).toPrecision(2)}%`,
		].join('\n');
	}
}

interface ITextureAtlasShelf {
	x: number;
	y: number;
	h: number;
}
