/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';

export class TextureAtlas extends Disposable {
	private _canvas: OffscreenCanvas;
	private _ctx: OffscreenCanvasRenderingContext2D;

	private _glyphMap: Map<string, ITextureAtlasGlyph> = new Map();

	private _glyphRasterizer: GlyphRasterizer;

	public get source(): OffscreenCanvas {
		return this._canvas;
	}

	// TODO: Should pull in the font size from config instead of random dom node
	constructor(parentDomNode: HTMLElement, maxTextureSize: number) {
		super();

		this._canvas = new OffscreenCanvas(maxTextureSize, maxTextureSize);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d'));

		const activeWindow = getActiveWindow();
		const style = activeWindow.getComputedStyle(parentDomNode);
		const fontSize = Math.ceil(parseInt(style.fontSize.replace('px', '')) * activeWindow.devicePixelRatio);
		this._ctx.font = `${fontSize}px ${style.fontFamily}`;
		this._ctx.textBaseline = 'top';

		this._glyphRasterizer = new GlyphRasterizer(fontSize, style.fontFamily);

		// Reduce impact of a memory leak if this object is not released
		this._register(toDisposable(() => {
			this._canvas.width = 1;
			this._canvas.height = 1;
		}));
	}

	// TODO: Color, style etc.
	public getGlyph(lineContent: string, glyphIndex: number): ITextureAtlasGlyph {
		const chars = lineContent.charAt(glyphIndex);
		const rasterizedGlyph = this._glyphRasterizer.rasterizeGlyph(chars);
		this._ctx.drawImage(
			rasterizedGlyph.source,
			// source
			rasterizedGlyph.boundingBox.left,
			rasterizedGlyph.boundingBox.top,
			rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left,
			rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top,
			// destination
			0,
			0,
			rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left,
			rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top
		);
		let glyph: ITextureAtlasGlyph | undefined = this._glyphMap.get(chars);
		if (glyph) {
			return glyph;
		}
		// TODO: Implement allocation
		glyph = {
			x: 0,
			y: 0,
			w: rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left,
			h: rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top
		};
		console.log('Allocating glyph', {
			rasterizedGlyph,
			glyph
		});
		this._glyphMap.set(chars, glyph);
		return glyph;
	}
}

class GlyphRasterizer extends Disposable {
	private _canvas: OffscreenCanvas;
	// A temporary context that glyphs are drawn to before being transfered to the atlas.
	private _ctx: OffscreenCanvasRenderingContext2D;

	constructor(private readonly _fontSize: number, fontFamily: string) {
		super();

		this._canvas = new OffscreenCanvas(this._fontSize * 3, this._fontSize * 3);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d'));
		this._ctx.font = `${this._fontSize}px ${fontFamily}`;
		this._ctx.fillStyle = '#FFFFFF';
	}

	// TODO: Support drawing multiple fonts and sizes
	// TODO: Should pull in the font size from config instead of random dom node
	public rasterizeGlyph(chars: string): IRasterizedGlyph {
		this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

		// TODO: Draw in middle using alphabetical baseline
		this._ctx.fillText(chars, this._fontSize, this._fontSize);

		const imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
		// TODO: Hot path: Reuse object
		const result: IRasterizedGlyph = {
			source: this._canvas,
			boundingBox: this._findGlyphBoundingBox(imageData)
		};
		return result;
	}

	private _findGlyphBoundingBox(imageData: ImageData): IBoundingBox {
		// TODO: Hot path: Reuse object
		const boundingBox = {
			left: 0,
			top: 0,
			right: 0,
			bottom: 0
		};
		// TODO: This could be optimized to be aware of the font size padding on all sides
		const height = this._canvas.height;
		const width = this._canvas.width;
		let found = false;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.top = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		boundingBox.left = 0;
		found = false;
		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.left = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		boundingBox.right = width;
		found = false;
		for (let x = width - 1; x >= boundingBox.left; x--) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.right = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		boundingBox.bottom = boundingBox.top;
		found = false;
		for (let y = height - 1; y >= 0; y--) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.bottom = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		return boundingBox;
	}
}

export interface ITextureAtlasGlyph {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface IBoundingBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

interface IRasterizedGlyph {
	source: CanvasImageSource;
	boundingBox: IBoundingBox;
}
