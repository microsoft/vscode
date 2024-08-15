/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { TwoKeyMap } from 'vs/base/common/map';
import type { ITextureAtlasAllocator, ITextureAtlasGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlasShelfAllocator } from 'vs/editor/browser/view/gpu/atlas/textureAtlasShelfAllocator';
import { TextureAtlasSlabAllocator } from 'vs/editor/browser/view/gpu/atlas/textureAtlasSlabAllocator';
import type { GlyphRasterizer } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class TextureAtlasPage extends Disposable {

	private readonly _canvas: OffscreenCanvas;

	private readonly _glyphMap: TwoKeyMap<string, number, ITextureAtlasGlyph> = new TwoKeyMap();
	// HACK: This is an ordered set of glyphs to be passed to the GPU since currently the shader
	//       uses the index of the glyph. This should be improved to derive from _glyphMap
	private readonly _glyphInOrderSet: Set<ITextureAtlasGlyph> = new Set();
	public get glyphs(): IterableIterator<ITextureAtlasGlyph> {
		return this._glyphInOrderSet.values();
	}

	private readonly _allocator: ITextureAtlasAllocator;

	private _colorMap!: string[];

	public get source(): OffscreenCanvas {
		return this._canvas;
	}

	public hasChanges = false;

	// TODO: Should pull in the font size from config instead of random dom node
	constructor(
		textureIndex: number,
		pageSize: number,
		allocatorType: 'shelf' | 'slab',
		private readonly _glyphRasterizer: GlyphRasterizer,
		@ILogService private readonly _logService: ILogService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this._canvas = new OffscreenCanvas(pageSize, pageSize);

		switch (allocatorType) {
			case 'shelf': this._allocator = new TextureAtlasShelfAllocator(this._canvas, textureIndex); break;
			case 'slab': this._allocator = new TextureAtlasSlabAllocator(this._canvas, textureIndex); break;
		}

		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => {
			// TODO: Clear entire atlas on theme change
			this._colorMap = this._themeService.getColorTheme().tokenColorMap;
		}));

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
		// TODO: Handle undefined allocate result
		const glyph = this._allocator.allocate(chars, tokenFg, rasterizedGlyph)!;
		this._glyphMap.set(chars, tokenFg, glyph);
		this._glyphInOrderSet.add(glyph);
		this.hasChanges = true;

		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace('New glyph', {
				chars,
				fg: this._colorMap[tokenFg],
				rasterizedGlyph,
				glyph
			});
		}

		return glyph;
	}

	getUsagePreview(): Promise<Blob> {
		// TODO: Standardize usage stats and make them loggable
		return this._allocator.getUsagePreview();
	}
}
