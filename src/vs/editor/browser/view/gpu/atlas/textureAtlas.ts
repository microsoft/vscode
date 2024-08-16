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
	private readonly _glyphRasterizer: GlyphRasterizer;

	private _colorMap!: string[];
	private readonly _warmUpTask: MutableDisposable<IdleTaskQueue> = this._register(new MutableDisposable());

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
