/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThreeKeyMap } from '../../../../base/common/map.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import type { IBoundingBox, IGlyphRasterizer } from '../raster/raster.js';
import type { IReadableTextureAtlasPage, ITextureAtlasAllocator, ITextureAtlasPageGlyph, GlyphMap } from './atlas.js';
import { TextureAtlasShelfAllocator } from './textureAtlasShelfAllocator.js';
import { TextureAtlasSlabAllocator } from './textureAtlasSlabAllocator.js';

export type AllocatorType = 'shelf' | 'slab' | ((canvas: OffscreenCanvas, textureIndex: number) => ITextureAtlasAllocator);

export class TextureAtlasPage extends Disposable implements IReadableTextureAtlasPage {

	private _version: number = 0;
	get version(): number { return this._version; }

	/**
	 * The maximum number of glyphs that can be drawn to the page. This is currently a hard static
	 * cap that must not be reached as it will cause the GPU buffer to overflow.
	 */
	static readonly maximumGlyphCount = 5_000;

	private _usedArea: IBoundingBox = { left: 0, top: 0, right: 0, bottom: 0 };
	public get usedArea(): Readonly<IBoundingBox> { return this._usedArea; }

	private readonly _canvas: OffscreenCanvas;
	get source(): OffscreenCanvas { return this._canvas; }

	private readonly _glyphMap: GlyphMap<ITextureAtlasPageGlyph> = new ThreeKeyMap();
	private readonly _glyphInOrderSet: Set<ITextureAtlasPageGlyph> = new Set();
	get glyphs(): IterableIterator<ITextureAtlasPageGlyph> {
		return this._glyphInOrderSet.values();
	}

	private readonly _allocator: ITextureAtlasAllocator;
	private _colorMap!: string[];

	constructor(
		textureIndex: number,
		pageSize: number,
		allocatorType: AllocatorType,
		@ILogService private readonly _logService: ILogService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this._canvas = new OffscreenCanvas(pageSize, pageSize);

		switch (allocatorType) {
			case 'shelf': this._allocator = new TextureAtlasShelfAllocator(this._canvas, textureIndex); break;
			case 'slab': this._allocator = new TextureAtlasSlabAllocator(this._canvas, textureIndex); break;
			default: this._allocator = allocatorType(this._canvas, textureIndex); break;
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

	public getGlyph(rasterizer: IGlyphRasterizer, chars: string, metadata: number): Readonly<ITextureAtlasPageGlyph> | undefined {
		// IMPORTANT: There are intentionally no intermediate variables here to aid in runtime
		// optimization as it's a very hot function
		return this._glyphMap.get(chars, metadata, rasterizer.cacheKey) ?? this._createGlyph(rasterizer, chars, metadata);
	}

	private _createGlyph(rasterizer: IGlyphRasterizer, chars: string, metadata: number): Readonly<ITextureAtlasPageGlyph> | undefined {
		// Ensure the glyph can fit on the page
		if (this._glyphInOrderSet.size >= TextureAtlasPage.maximumGlyphCount) {
			return undefined;
		}

		// Rasterize and allocate the glyph
		const rasterizedGlyph = rasterizer.rasterizeGlyph(chars, metadata, this._colorMap);
		const glyph = this._allocator.allocate(rasterizedGlyph);

		// Ensure the glyph was allocated
		if (glyph === undefined) {
			return undefined;
		}

		// Save the glyph
		this._glyphMap.set(chars, metadata, rasterizer.cacheKey, glyph);
		this._glyphInOrderSet.add(glyph);

		// Update page version and it's tracked used area
		this._version++;
		this._usedArea.right = Math.max(this._usedArea.right, glyph.x + glyph.w - 1);
		this._usedArea.bottom = Math.max(this._usedArea.bottom, glyph.y + glyph.h - 1);

		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace('New glyph', {
				chars,
				metadata,
				rasterizedGlyph,
				glyph
			});
		}

		return glyph;
	}

	getUsagePreview(): Promise<Blob> {
		return this._allocator.getUsagePreview();
	}

	getStats(): string {
		return this._allocator.getStats();
	}
}
