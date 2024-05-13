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

// #region Shelf allocator

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

// #endregion

// #region Slab allocator

export class TextureAtlasSlabAllocator implements ITextureAtlasAllocator {
	// TODO: Is there a better way to index slabs other than an unsorted list?
	private _slabs: ITextureAtlasSlab[] = [];
	private _activeSlabsByDims: TwoKeyMap<number, number, ITextureAtlasSlab> = new TwoKeyMap();

	readonly glyphMap: TwoKeyMap<string, number, ITextureAtlasGlyph> = new TwoKeyMap();

	private _nextIndex = 0;

	constructor(
		private readonly _canvas: OffscreenCanvas,
		private readonly _ctx: OffscreenCanvasRenderingContext2D,
	) {
	}

	public allocate(chars: string, tokenFg: number, rasterizedGlyph: IRasterizedGlyph): ITextureAtlasGlyph {
		// Find ideal slab, creating it if there is none suitable

		// Slabs are sized: 1x1, 1x2, 1x4, 1x8, ...
		//                  2x1, 2x2, 2x4, 2x8, ...
		//                  4x1, 4x2, 4x4, 4x8, ...
		//                  ...
		const glyphWidth = rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1;
		const glyphHeight = rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1;
		const desiredSlabSize = {
			// TODO: This can probably be optimized
			w: 1 << Math.ceil(Math.sqrt(glyphWidth)),
			h: 1 << Math.ceil(Math.sqrt(glyphHeight)),

			// w: glyphWidth % 0 === 1 ? glyphWidth + 1 : glyphWidth,
			// h: glyphHeight % 0 === 1 ? glyphHeight + 1 : glyphHeight,

			// w: glyphWidth,
			// h: glyphHeight,
		};

		const slabW = 256; // this._canvas.width / 8;
		const slabH = 256; // this._canvas.height / 8;
		const slabsPerRow = Math.floor(this._canvas.width / slabW);

		let slab = this._activeSlabsByDims.get(desiredSlabSize.w, desiredSlabSize.h);
		if (!slab) {
			slab = {
				x: Math.floor(this._slabs.length % slabsPerRow) * slabW,
				y: Math.floor(this._slabs.length / slabsPerRow) * slabH,
				entryW: desiredSlabSize.w,
				entryH: desiredSlabSize.h,
				count: 0
			};
			// console.log('new slab (full slab)', slab);
			this._slabs.push(slab);
			this._activeSlabsByDims.set(desiredSlabSize.w, desiredSlabSize.h, slab);
		}

		// Create another slab if this one is full
		const glyphsPerSlab = Math.floor(slabW / slab.entryW) * Math.floor(slabH / slab.entryH);
		if (slab.count >= glyphsPerSlab) {
			slab = {
				x: Math.floor(this._slabs.length % slabsPerRow) * slabW,
				y: Math.floor(this._slabs.length / slabsPerRow) * slabH,
				entryW: desiredSlabSize.w,
				entryH: desiredSlabSize.h,
				count: 0
			};
			// console.log('new slab (full slab)', slab);
			this._slabs.push(slab);
			this._activeSlabsByDims.set(desiredSlabSize.w, desiredSlabSize.h, slab);
		}

		// Draw glyph
		// TODO: Prefer putImageData as it doesn't do blending or scaling
		const glyphsPerRow = Math.floor(slabW / slab.entryW);
		const dx = slab.x + Math.floor(slab.count % glyphsPerRow) * slab.entryW;
		const dy = slab.y + Math.floor(slab.count / glyphsPerRow) * slab.entryH;
		console.log('dx dy', dx, dy);
		this._ctx.drawImage(
			rasterizedGlyph.source,
			// source
			rasterizedGlyph.boundingBox.left,
			rasterizedGlyph.boundingBox.top,
			glyphWidth,
			glyphHeight,
			// destination
			dx,
			dy,
			glyphWidth,
			glyphHeight
		);

		// Create glyph object
		const glyph: ITextureAtlasGlyph = {
			index: this._nextIndex++,
			x: dx,
			y: dy,
			w: glyphWidth,
			h: glyphHeight,
			originOffsetX: rasterizedGlyph.originOffset.x,
			originOffsetY: rasterizedGlyph.originOffset.y
		};

		// Shift current row
		slab.count++;

		// Set the glyph
		this.glyphMap.set(chars, tokenFg, glyph);

		return glyph;
	}

	public getUsagePreview(): Promise<Blob> {
		// TODO: Impl
		return this._canvas.convertToBlob();
	}
}

interface ITextureAtlasSlab {
	x: number;
	y: number;
	entryH: number;
	entryW: number;
	count: number;
}

// #endregion
