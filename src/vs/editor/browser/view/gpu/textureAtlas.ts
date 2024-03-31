/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { TwoKeyMap } from 'vs/editor/browser/view/gpu/multiKeyMap';
import { IdleTaskQueue } from 'vs/editor/browser/view/gpu/taskQueue';
import { ITextureAtlasAllocator, TextureAtlasShelfAllocator } from 'vs/editor/browser/view/gpu/textureAtlasAllocator';
import { IThemeService } from 'vs/platform/theme/common/themeService';

// DEBUG: This helper can be used to draw image data to the console, it's commented out as we don't
//        want to ship it, but this is very useful for investigating texture atlas issues.
// (console as any).image = (source: ImageData | HTMLCanvasElement, scale: number = 1) => {
// 	function getBox(width: number, height: number) {
// 		return {
// 			string: '+',
// 			style: 'font-size: 1px; padding: ' + Math.floor(height / 2) + 'px ' + Math.floor(width / 2) + 'px; line-height: ' + height + 'px;'
// 		};
// 	}
// 	if (source instanceof HTMLCanvasElement) {
// 		source = source.getContext('2d')?.getImageData(0, 0, source.width, source.height)!;
// 	}
// 	const canvas = document.createElement('canvas');
// 	canvas.width = source.width;
// 	canvas.height = source.height;
// 	const ctx = canvas.getContext('2d')!;
// 	ctx.putImageData(source, 0, 0);

// 	const sw = source.width * scale;
// 	const sh = source.height * scale;
// 	const dim = getBox(sw, sh);
// 	console.log(
// 		`Image: ${source.width} x ${source.height}\n%c${dim.string}`,
// 		`${dim.style}background: url(${canvas.toDataURL()}); background-size: ${sw}px ${sh}px; background-repeat: no-repeat; color: transparent;`
// 	);
// 	console.groupCollapsed('Zoomed');
// 	console.log(
// 		`%c${dim.string}`,
// 		`${getBox(sw * 10, sh * 10).style}background: url(${canvas.toDataURL()}); background-size: ${sw * 10}px ${sh * 10}px; background-repeat: no-repeat; color: transparent; image-rendering: pixelated;-ms-interpolation-mode: nearest-neighbor;`
// 	);
// 	console.groupEnd();
// };

export class TextureAtlas extends Disposable {
	private readonly _canvas: OffscreenCanvas;
	private readonly _ctx: OffscreenCanvasRenderingContext2D;

	private readonly _glyphMap: TwoKeyMap<string, number, ITextureAtlasGlyph> = new TwoKeyMap();
	// HACK: This is an ordered set of glyphs to be passed to the GPU since currently the shader
	//       uses the index of the glyph. This should be improved to derive from _glyphMap
	private readonly _glyphInOrderSet: Set<ITextureAtlasGlyph> = new Set();
	public get glyphs(): IterableIterator<ITextureAtlasGlyph> {
		return this._glyphInOrderSet.values();
	}

	private readonly _glyphRasterizer: GlyphRasterizer;
	private readonly _allocator: ITextureAtlasAllocator;

	private _colorMap!: string[];
	private _warmUpTask?: IdleTaskQueue;

	public get source(): OffscreenCanvas {
		return this._canvas;
	}

	public hasChanges = false;

	// TODO: Should pull in the font size from config instead of random dom node
	constructor(
		parentDomNode: HTMLElement,
		maxTextureSize: number,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();

		this._canvas = new OffscreenCanvas(maxTextureSize, maxTextureSize);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
			willReadFrequently: true
		}));

		const activeWindow = getActiveWindow();
		const style = activeWindow.getComputedStyle(parentDomNode);
		const fontSize = Math.ceil(parseInt(style.fontSize.replace('px', '')) * activeWindow.devicePixelRatio);
		this._ctx.font = `${fontSize}px ${style.fontFamily}`;

		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => {
			// TODO: Clear entire atlas on theme change
			this._colorMap = this._themeService.getColorTheme().tokenColorMap;
			this._warmUpAtlas();
		}));

		this._glyphRasterizer = new GlyphRasterizer(fontSize, style.fontFamily);
		this._allocator = new TextureAtlasShelfAllocator(this._canvas, this._ctx);

		// Reduce impact of a memory leak if this object is not released
		this._register(toDisposable(() => {
			this._canvas.width = 1;
			this._canvas.height = 1;
		}));
	}

	// TODO: Color, style etc.
	public getGlyph(chars: string, tokenFg: number): ITextureAtlasGlyph {
		let glyph: ITextureAtlasGlyph | undefined = this._glyphMap.get(chars, tokenFg);
		if (glyph) {
			return glyph;
		}
		const rasterizedGlyph = this._glyphRasterizer.rasterizeGlyph(chars, this._colorMap[tokenFg]);
		glyph = this._allocator.allocate(rasterizedGlyph);
		this._glyphMap.set(chars, tokenFg, glyph);
		this._glyphInOrderSet.add(glyph);
		this.hasChanges = true;

		console.log('New glyph', {
			chars,
			fg: this._colorMap[tokenFg],
			rasterizedGlyph,
			glyph
		});

		return glyph;
	}

	/**
	 * Warms up the atlas by rasterizing all printable ASCII characters for each token color. This
	 * is distrubuted over multiple idle callbacks to avoid blocking the main thread.
	 */
	private _warmUpAtlas(): void {
		// TODO: Clean up on dispose
		this._warmUpTask?.clear();
		this._warmUpTask = new IdleTaskQueue();
		for (const tokenFg of this._colorMap.keys()) {
			this._warmUpTask.enqueue(() => {
				for (let code = 33; code <= 126; code++) {
					this.getGlyph(String.fromCharCode(code), tokenFg);
				}
			});
		}
	}
}

class GlyphRasterizer extends Disposable {
	private _canvas: OffscreenCanvas;
	// A temporary context that glyphs are drawn to before being transfered to the atlas.
	private _ctx: OffscreenCanvasRenderingContext2D;

	constructor(private readonly _fontSize: number, fontFamily: string) {
		super();

		this._canvas = new OffscreenCanvas(this._fontSize * 3, this._fontSize * 3);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
			willReadFrequently: true
		}));
		this._ctx.font = `${this._fontSize}px ${fontFamily}`;
		this._ctx.textBaseline = 'top';
		this._ctx.fillStyle = '#FFFFFF';
	}

	// TODO: Support drawing multiple fonts and sizes
	// TODO: Should pull in the font size from config instead of random dom node
	public rasterizeGlyph(chars: string, fg: string): IRasterizedGlyph {
		this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

		// TODO: Draw in middle using alphabetical baseline
		const originX = this._fontSize;
		const originY = this._fontSize;
		this._ctx.fillStyle = fg;
		this._ctx.fillText(chars, originX, originY);

		const imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
		// TODO: Hot path: Reuse object
		const boundingBox = this._findGlyphBoundingBox(imageData);
		const result: IRasterizedGlyph = {
			source: this._canvas,
			boundingBox,
			originOffset: {
				x: boundingBox.left - originX,
				y: boundingBox.top - originY
			}
		};

		// DEBUG: Show image data in console
		// (console as any).image(imageData);

		return result;
	}

	// TODO: Pass back origin offset
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

export interface IRasterizedGlyph {
	source: CanvasImageSource;
	boundingBox: IBoundingBox;
	originOffset: { x: number; y: number };
}
