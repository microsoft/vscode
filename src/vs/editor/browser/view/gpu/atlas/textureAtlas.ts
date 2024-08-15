/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Disposable, dispose, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import type { IReadableTextureAtlasPage, ITextureAtlasGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlasPage } from 'vs/editor/browser/view/gpu/atlas/textureAtlasPage';
import { GlyphRasterizer } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';
import { IdleTaskQueue } from 'vs/editor/browser/view/gpu/taskQueue';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class TextureAtlas extends Disposable {
	// TODO: Expose all page glyphs - the glyphs will need a textureId association
	public get scratchGlyphs(): IterableIterator<ITextureAtlasGlyph> {
		return this._scratchPage.glyphs;
	}
	// public get glyphs(): IterableIterator<ITextureAtlasGlyph> {
	// 	return this._pages.glyphs;
	// }

	private readonly _glyphRasterizer: GlyphRasterizer;

	private _colorMap!: string[];
	private readonly _warmUpTask: MutableDisposable<IdleTaskQueue> = this._register(new MutableDisposable());

	// get source(): OffscreenCanvas {
	// 	return this._pages.source;
	// }

	// TODO: Should check changes independently
	get hasChanges(): boolean {
		// return this._scratchPage.hasChanges || this._pages.hasChanges;
		return this._pages.some(e => e.hasChanges);
	}
	set hasChanges(value: boolean) {
		// this._scratchPage.hasChanges = value;
		// this._pages.hasChanges = value;
		this._pages[0].hasChanges = value;
	}

	/**
	 * The scratch texture atlas page is a relatively small texture where glyphs that are required
	 * immediately are drawn to which reduces the latency of their first draw. In some future idle
	 * callback, the glyph will be transferred into one of the main pages.
	 */
	private readonly _scratchPage: TextureAtlasPage;
	// TODO: Generically get pages externally - gpu shouldn't care about the details of the pages
	get scratchSource(): OffscreenCanvas {
		return this._scratchPage.source;
	}

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
		parentDomNode: HTMLElement,
		/** The maximum texture size supported by the GPU. */
		private readonly _maxTextureSize: number,
		@IThemeService private readonly _themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		// TODO: Should pull in the font size from config instead of random dom node
		const activeWindow = getActiveWindow();
		const style = activeWindow.getComputedStyle(parentDomNode);
		const fontSize = Math.ceil(parseInt(style.fontSize) * activeWindow.devicePixelRatio);

		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => {
			// TODO: Clear entire atlas on theme change
			this._colorMap = this._themeService.getColorTheme().tokenColorMap;
			this._warmUpAtlas();
		}));

		this._glyphRasterizer = this._register(new GlyphRasterizer(fontSize, style.fontFamily));

		const dprFactor = Math.max(1, Math.floor(activeWindow.devicePixelRatio));

		// TODO: Scratch should be smaller
		// TODO: Hook up scratch page to renderer
		const scratchPageSize = Math.min(1024 * dprFactor, this._maxTextureSize);
		// TODO: General way of assigning texture identifier
		// TODO: Identify texture via a name, the texture index should be only known to the GPU code
		this._scratchPage = this._register(this._instantiationService.createInstance(TextureAtlasPage, 0, scratchPageSize, 'shelf', this._glyphRasterizer));

		this.pageSize = Math.min(1024 * dprFactor, this._maxTextureSize);
		this._pages.push(this._instantiationService.createInstance(TextureAtlasPage, 0, this.pageSize, 'slab', this._glyphRasterizer));
		this._pages.push(this._instantiationService.createInstance(TextureAtlasPage, 1, this.pageSize, 'slab', this._glyphRasterizer));
		this._register(toDisposable(() => dispose(this._pages)));
	}

	// TODO: Color, style etc.
	public getGlyph(chars: string, tokenFg: number): ITextureAtlasGlyph {
		// HACK: Draw glyphs to different pages to test out multiple textures while there's no overflow logic
		const targetPage = chars.match(/[a-z]/i) ? 0 : 1;
		return this._pages[targetPage].getGlyph(chars, tokenFg);
	}

	public getUsagePreview(): Promise<Blob[]> {
		// TODO: Include scratch page
		return Promise.all(this._pages.map(e => e.getUsagePreview()));
	}

	/**
	 * Warms up the atlas by rasterizing all printable ASCII characters for each token color. This
	 * is distrubuted over multiple idle callbacks to avoid blocking the main thread.
	 */
	private _warmUpAtlas(): void {
		this._warmUpTask.value?.clear();
		const taskQueue = this._warmUpTask.value = new IdleTaskQueue();
		// Warm up using roughly the larger glyphs first to help optimize atlas allocation
		// A-Z
		for (let code = 65; code <= 90; code++) {
			taskQueue.enqueue(() => {
				for (const tokenFg of this._colorMap.keys()) {
					this.getGlyph(String.fromCharCode(code), tokenFg);
				}
			});
		}
		// a-z
		for (let code = 97; code <= 122; code++) {
			taskQueue.enqueue(() => {
				for (const tokenFg of this._colorMap.keys()) {
					this.getGlyph(String.fromCharCode(code), tokenFg);
				}
			});
		}
		// Remaining ascii
		for (let code = 33; code <= 126; code++) {
			taskQueue.enqueue(() => {
				for (const tokenFg of this._colorMap.keys()) {
					this.getGlyph(String.fromCharCode(code), tokenFg);
				}
			});
		}
	}
}
