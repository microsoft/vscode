/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Disposable, dispose, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import type { IReadableTextureAtlasPage, ITextureAtlasPageGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlasPage } from 'vs/editor/browser/view/gpu/atlas/textureAtlasPage';
import type { IGlyphRasterizer } from 'vs/editor/browser/view/gpu/raster/raster';
import { IdleTaskQueue } from 'vs/editor/browser/view/gpu/taskQueue';
import { MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class TextureAtlas extends Disposable {
	private _colorMap!: string[];
	private readonly _warmUpTask: MutableDisposable<IdleTaskQueue> = this._register(new MutableDisposable());

	private readonly _warmedUpRasterizers = new Set<number>();

	/**
	 * The main texture atlas pages which are both larger textures and more efficiently packed
	 * relative to the scratch page. The idea is the main pages are drawn to and uploaded to the GPU
	 * much less frequently so as to not drop frames.
	 */
	private readonly _pages: TextureAtlasPage[] = [];
	get pages(): IReadableTextureAtlasPage[] {
		return this._pages;
	}

	readonly pageSize: number;

	constructor(
		/** The maximum texture size supported by the GPU. */
		private readonly _maxTextureSize: number,
		@IThemeService private readonly _themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => {
			// TODO: Clear entire atlas on theme change
			this._colorMap = this._themeService.getColorTheme().tokenColorMap;
		}));

		const dprFactor = Math.max(1, Math.floor(getActiveWindow().devicePixelRatio));

		this.pageSize = Math.min(1024 * dprFactor, this._maxTextureSize);
		this._pages.push(this._instantiationService.createInstance(TextureAtlasPage, 0, this.pageSize, 'slab'));
		this._register(toDisposable(() => dispose(this._pages)));
	}

	// TODO: Color, style etc.
	public getGlyph(rasterizer: IGlyphRasterizer, chars: string, metadata: number): Readonly<ITextureAtlasPageGlyph> {
		if (!this._warmedUpRasterizers.has(rasterizer.id)) {
			this._warmUpAtlas(rasterizer);
			this._warmedUpRasterizers.add(rasterizer.id);
		}
		return this._tryGetGlyph(0, rasterizer, chars, metadata);
	}

	private _tryGetGlyph(pageIndex: number, rasterizer: IGlyphRasterizer, chars: string, metadata: number): Readonly<ITextureAtlasPageGlyph> {
		// TODO: This should only rasterize a single time, currently it rasterized for each full page before it creates a new page
		return (
			this._pages[pageIndex].getGlyph(rasterizer, chars, metadata) ?? (
				(pageIndex + 1 < this._pages.length
					? this._tryGetGlyph(pageIndex + 1, rasterizer, chars, metadata)
					: undefined)
			) ?? this._getGlyphFromNewPage(rasterizer, chars, metadata)
		);
	}

	private _getGlyphFromNewPage(rasterizer: IGlyphRasterizer, chars: string, metadata: number): Readonly<ITextureAtlasPageGlyph> {
		// TODO: Support more than 2 pages and the GPU texture layer limit
		this._pages.push(this._instantiationService.createInstance(TextureAtlasPage, this._pages.length, this.pageSize, 'slab'));
		return this._pages[this._pages.length - 1].getGlyph(rasterizer, chars, metadata)!;
	}

	public getUsagePreview(): Promise<Blob[]> {
		return Promise.all(this._pages.map(e => e.getUsagePreview()));
	}

	public getStats(): string[] {
		return this._pages.map(e => e.getStats());
	}

	/**
	 * Warms up the atlas by rasterizing all printable ASCII characters for each token color. This
	 * is distrubuted over multiple idle callbacks to avoid blocking the main thread.
	 */
	private _warmUpAtlas(rasterizer: IGlyphRasterizer): void {
		this._warmUpTask.value?.clear();
		const taskQueue = this._warmUpTask.value = new IdleTaskQueue();
		// Warm up using roughly the larger glyphs first to help optimize atlas allocation
		// A-Z
		for (let code = 65; code <= 90; code++) {
			taskQueue.enqueue(() => {
				for (const fgColor of this._colorMap.keys()) {
					this.getGlyph(rasterizer, String.fromCharCode(code), (fgColor << MetadataConsts.FOREGROUND_OFFSET) & MetadataConsts.FOREGROUND_MASK);
				}
			});
		}
		// a-z
		for (let code = 97; code <= 122; code++) {
			taskQueue.enqueue(() => {
				for (const fgColor of this._colorMap.keys()) {
					this.getGlyph(rasterizer, String.fromCharCode(code), (fgColor << MetadataConsts.FOREGROUND_OFFSET) & MetadataConsts.FOREGROUND_MASK);
				}
			});
		}
		// Remaining ascii
		for (let code = 33; code <= 126; code++) {
			taskQueue.enqueue(() => {
				for (const fgColor of this._colorMap.keys()) {
					this.getGlyph(rasterizer, String.fromCharCode(code), (fgColor << MetadataConsts.FOREGROUND_OFFSET) & MetadataConsts.FOREGROUND_MASK);
				}
			});
		}
	}
}

