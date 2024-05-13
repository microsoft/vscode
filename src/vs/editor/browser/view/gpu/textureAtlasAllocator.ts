/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IRasterizedGlyph } from 'vs/editor/browser/view/gpu/glyphRasterizer';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { TwoKeyMap } from 'vs/editor/browser/view/gpu/multiKeyMap';
import type { ITextureAtlasGlyph } from 'vs/editor/browser/view/gpu/textureAtlas';

export interface ITextureAtlasAllocator {
	readonly glyphMap: TwoKeyMap<string, number, ITextureAtlasGlyph>;
	allocate(chars: string, tokenFg: number, rasterizedGlyph: IRasterizedGlyph): ITextureAtlasGlyph;
	getUsagePreview(): Promise<Blob>;
}

export class TextureAtlasShelfAllocator implements ITextureAtlasAllocator {
	private _currentRow: ITextureAtlasShelf = {
		x: 0,
		y: 0,
		h: 0
	};

	// TODO: Allow for multiple active rows
	// public readonly fixedRows: ICharAtlasActiveRow[] = [];

	readonly glyphMap: TwoKeyMap<string, number, ITextureAtlasGlyph> = new TwoKeyMap();

	private _nextIndex = 0;

	constructor(
		private readonly _canvas: OffscreenCanvas,
		private readonly _ctx: OffscreenCanvasRenderingContext2D,
	) {
	}

	public allocate(chars: string, tokenFg: number, rasterizedGlyph: IRasterizedGlyph): ITextureAtlasGlyph {
		// Finalize row if it doesn't fix
		if (rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left > this._canvas.width - this._currentRow.x) {
			this._currentRow.x = 0;
			this._currentRow.y += this._currentRow.h;
			this._currentRow.h = 1;
		}

		// TODO: Handle end of atlas page

		// Draw glyph
		const glyphWidth = rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1;
		const glyphHeight = rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1;
		// TODO: Prefer putImageData as it doesn't do blending or scaling
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
		const glyph: ITextureAtlasGlyph = {
			index: this._nextIndex++,
			x: this._currentRow.x,
			y: this._currentRow.y,
			w: glyphWidth,
			h: glyphHeight,
			originOffsetX: rasterizedGlyph.originOffset.x,
			originOffsetY: rasterizedGlyph.originOffset.y
		};

		// Shift current row
		this._currentRow.x += glyphWidth;
		this._currentRow.h = Math.max(this._currentRow.h, glyphHeight);

		// Set the glyph
		this.glyphMap.set(chars, tokenFg, glyph);

		return glyph;
	}

	public getUsagePreview(): Promise<Blob> {
		// TODO: This is specific to the simple shelf allocator
		const w = this._canvas.width;
		const h = this._canvas.height;
		const canvas = new OffscreenCanvas(w, h);
		const ctx = ensureNonNullable(canvas.getContext('2d'));
		ctx.fillStyle = '#808080';
		ctx.fillRect(0, 0, w, h);

		let usedPixels = 0;
		let wastedPixels = 0;
		const totalPixels = w * h;

		const rowHeight: Map<number, number> = new Map(); // y -> h
		const rowWidth: Map<number, number> = new Map(); // y -> w
		for (const g of this.glyphMap.values()) {
			rowHeight.set(g.y, Math.max(rowHeight.get(g.y) ?? 0, g.h));
			rowWidth.set(g.y, Math.max(rowWidth.get(g.y) ?? 0, g.x + g.w));
		}
		for (const g of this.glyphMap.values()) {
			usedPixels += g.w * g.h;
			wastedPixels += g.w * (rowHeight.get(g.y)! - g.h);
			ctx.fillStyle = '#4040FF';
			ctx.fillRect(g.x, g.y, g.w, g.h);
			ctx.fillStyle = '#FF0000';
			ctx.fillRect(g.x, g.y + g.h, g.w, rowHeight.get(g.y)! - g.h);
		}
		for (const [rowY, rowW] of rowWidth.entries()) {
			if (rowY !== this._currentRow.y) {
				ctx.fillStyle = '#FF0000';
				ctx.fillRect(rowW, rowY, w - rowW, rowHeight.get(rowY)!);
				wastedPixels += (w - rowW) * rowHeight.get(rowY)!;
			}
		}
		console.log([
			`Texture atlas stats:`,
			`     Total: ${totalPixels}`,
			`      Used: ${usedPixels} (${((usedPixels / totalPixels) * 100).toPrecision(2)}%)`,
			`    Wasted: ${wastedPixels} (${((wastedPixels / totalPixels) * 100).toPrecision(2)}%)`,
			`Efficiency: ${((usedPixels / (usedPixels + wastedPixels)) * 100).toPrecision(2)}%`,
		].join('\n'));
		return canvas.convertToBlob();
	}
}

interface ITextureAtlasShelf {
	x: number;
	y: number;
	h: number;
}
