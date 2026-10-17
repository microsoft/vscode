/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { NKeyMap } from '../../../../base/common/map.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import type { DecorationStyleCache } from '../css/decorationStyleCache.js';
import { GlyphRasterizer } from '../raster/glyphRasterizer.js';
import type { IGlyphRasterizer } from '../raster/raster.js';
import type { IReadableTextureAtlasPage, ITextureAtlasPageGlyph, GlyphMap } from './atlas.js';
import { AllocatorType, TextureAtlasPage } from './textureAtlasPage.js';

export interface ITextureAtlasOptions {
	allocatorType?: AllocatorType;
}

export class TextureAtlas extends Disposable {
	private _colorMap?: string[];
	private readonly _allocatorType: AllocatorType;

	/**
	 * The maximum number of texture atlas pages. This is currently a hard static cap that must not
	 * be reached.
	 */
	static readonly maximumPageCount = 16;

	/**
	 * The main texture atlas pages which are both larger textures and more efficiently packed
	 * relative to the scratch page. The idea is the main pages are drawn to and uploaded to the GPU
	 * much less frequently so as to not drop frames.
	 */
	private readonly _pages: TextureAtlasPage[] = [];
	get pages(): IReadableTextureAtlasPage[] { return this._pages; }

	readonly pageSize: number;

	/**
	 * A maps of glyph keys to the page to start searching for the glyph. This is set before
	 * searching to have as little runtime overhead (branching, intermediate variables) as possible,
	 * so it is not guaranteed to be the actual page the glyph is on. But it is guaranteed that all
	 * pages with a lower index do not contain the glyph.
	 */
	private readonly _glyphPageIndex: GlyphMap<number> = new NKeyMap();

	private readonly _onDidDeleteGlyphs = this._register(new Emitter<void>());
	readonly onDidDeleteGlyphs = this._onDidDeleteGlyphs.event;

	constructor(
		/** The maximum texture size supported by the GPU. */
		private readonly _maxTextureSize: number,
		options: ITextureAtlasOptions | undefined,
		private readonly _decorationStyleCache: DecorationStyleCache,
		@IThemeService private readonly _themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._allocatorType = options?.allocatorType ?? 'slab';

		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => {
			if (this._colorMap) {
				this.clear();
			}
			this._colorMap = this._themeService.getColorTheme().tokenColorMap;
		}));

		const dprFactor = Math.max(1, Math.floor(getActiveWindow().devicePixelRatio));

		this.pageSize = Math.min(1024 * dprFactor, this._maxTextureSize);
		this._initFirstPage();

		this._register(toDisposable(() => dispose(this._pages)));
	}

	private _initFirstPage() {
		const firstPage = this._instantiationService.createInstance(TextureAtlasPage, 0, this.pageSize, this._allocatorType);
		this._pages.push(firstPage);

		// IMPORTANT: The first glyph on the first page must be an empty glyph such that zeroed out
		// cells end up rendering nothing
		// TODO: This currently means the first slab is for 0x0 glyphs and is wasted
		const nullRasterizer = new GlyphRasterizer(1, '', 1, this._decorationStyleCache);
		firstPage.getGlyph(nullRasterizer, '', 0, 0);
		nullRasterizer.dispose();
	}

	clear() {
		// Clear all pages
		for (const page of this._pages) {
			page.dispose();
		}
		this._pages.length = 0;
		this._glyphPageIndex.clear();

		// Recreate first
		this._initFirstPage();

		// Tell listeners
		this._onDidDeleteGlyphs.fire();
	}

	getGlyph(rasterizer: IGlyphRasterizer, chars: string, tokenMetadata: number, decorationStyleSetId: number, x: number): Readonly<ITextureAtlasPageGlyph> {
		// TODO: Encode font size and family into key
		// Ignore metadata that doesn't affect the glyph
		tokenMetadata &= ~(MetadataConsts.LANGUAGEID_MASK | MetadataConsts.TOKEN_TYPE_MASK | MetadataConsts.BALANCED_BRACKETS_MASK);

		// Add x offset for sub-pixel rendering to the unused portion or tokenMetadata. This
		// converts the decimal part of the x to a range from 0 to 9, where 0 = 0.0px x offset,
		// 9 = 0.9px x offset
		tokenMetadata |= Math.floor((x % 1) * 10);

		// Try get the glyph, overflowing to a new page if necessary
		return this._tryGetGlyph(this._glyphPageIndex.get(chars, tokenMetadata, decorationStyleSetId, rasterizer.cacheKey) ?? 0, rasterizer, chars, tokenMetadata, decorationStyleSetId);
	}

	private _tryGetGlyph(pageIndex: number, rasterizer: IGlyphRasterizer, chars: string, tokenMetadata: number, decorationStyleSetId: number): Readonly<ITextureAtlasPageGlyph> {
		this._glyphPageIndex.set(pageIndex, chars, tokenMetadata, decorationStyleSetId, rasterizer.cacheKey);
		return (
			this._pages[pageIndex].getGlyph(rasterizer, chars, tokenMetadata, decorationStyleSetId)
			?? (pageIndex + 1 < this._pages.length
				? this._tryGetGlyph(pageIndex + 1, rasterizer, chars, tokenMetadata, decorationStyleSetId)
				: undefined)
			?? this._getGlyphFromNewPage(rasterizer, chars, tokenMetadata, decorationStyleSetId)
		);
	}

	private _getGlyphFromNewPage(rasterizer: IGlyphRasterizer, chars: string, tokenMetadata: number, decorationStyleSetId: number): Readonly<ITextureAtlasPageGlyph> {
		if (this._pages.length >= TextureAtlas.maximumPageCount) {
			throw new Error(`Attempt to create a texture atlas page past the limit ${TextureAtlas.maximumPageCount}`);
		}
		this._pages.push(this._instantiationService.createInstance(TextureAtlasPage, this._pages.length, this.pageSize, this._allocatorType));
		this._glyphPageIndex.set(this._pages.length - 1, chars, tokenMetadata, decorationStyleSetId, rasterizer.cacheKey);
		return this._pages[this._pages.length - 1].getGlyph(rasterizer, chars, tokenMetadata, decorationStyleSetId)!;
	}

	public getUsagePreview(): Promise<Blob[]> {
		return Promise.all(this._pages.map(e => e.getUsagePreview()));
	}

	public getStats(): string[] {
		return this._pages.map(e => e.getStats());
	}
}

