/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import type { GlyphRasterizer } from 'vs/editor/browser/view/gpu/glyphRasterizer';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { TwoKeyMap } from 'vs/editor/browser/view/gpu/multiKeyMap';
import { IdleTaskQueue } from 'vs/editor/browser/view/gpu/taskQueue';
import { ITextureAtlasAllocator, TextureAtlasShelfAllocator } from 'vs/editor/browser/view/gpu/textureAtlasAllocator';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class TextureAtlasPage extends Disposable {

	private readonly _canvas: OffscreenCanvas;
	private readonly _ctx: OffscreenCanvasRenderingContext2D;

	private readonly _glyphMap: TwoKeyMap<string, number, ITextureAtlasGlyph> = new TwoKeyMap();
	// HACK: This is an ordered set of glyphs to be passed to the GPU since currently the shader
	//       uses the index of the glyph. This should be improved to derive from _glyphMap
	private readonly _glyphInOrderSet: Set<ITextureAtlasGlyph> = new Set();
	public get glyphs(): IterableIterator<ITextureAtlasGlyph> {
		return this._glyphInOrderSet.values();
	}

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
		pageSize: number,
		maxTextureSize: number,
		private readonly _glyphRasterizer: GlyphRasterizer,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();

		this._canvas = new OffscreenCanvas(pageSize, pageSize);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
			willReadFrequently: true
		}));

		const activeWindow = getActiveWindow();
		const style = activeWindow.getComputedStyle(parentDomNode);
		const fontSize = Math.ceil(parseInt(style.fontSize) * activeWindow.devicePixelRatio);
		this._ctx.font = `${fontSize}px ${style.fontFamily}`;

		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => {
			// TODO: Clear entire atlas on theme change
			this._colorMap = this._themeService.getColorTheme().tokenColorMap;
			this._warmUpAtlas();
		}));

		this._allocator = new TextureAtlasShelfAllocator(this._canvas, this._ctx);

		// Reduce impact of a memory leak if this object is not released
		this._register(toDisposable(() => {
			this._canvas.width = 1;
			this._canvas.height = 1;
		}));
	}

	// TODO: Color, style etc.
	public getGlyph(chars: string, tokenFg: number): ITextureAtlasGlyph {
		return this._glyphMap.get(chars, tokenFg) ?? this._createGlyph(chars, tokenFg);
	}

	private _createGlyph(chars: string, tokenFg: number): ITextureAtlasGlyph {
		const rasterizedGlyph = this._glyphRasterizer.rasterizeGlyph(chars, this._colorMap[tokenFg]);
		const glyph = this._allocator.allocate(rasterizedGlyph);
		this._glyphMap.set(chars, tokenFg, glyph);
		this._glyphInOrderSet.add(glyph);
		this.hasChanges = true;

		if (!this._warmUpTask) {
			console.debug('New glyph', {
				chars,
				fg: this._colorMap[tokenFg],
				rasterizedGlyph,
				glyph
			});
		}

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
