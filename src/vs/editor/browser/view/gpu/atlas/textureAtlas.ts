/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { GlyphRasterizer } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';
import { IdleTaskQueue } from 'vs/editor/browser/view/gpu/taskQueue';
import { TextureAtlasPage } from 'vs/editor/browser/view/gpu/atlas/textureAtlasPage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import type { ITextureAtlasGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';

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
	public get glyphs(): IterableIterator<ITextureAtlasGlyph> {
		return this._page.glyphs;
	}

	private readonly _glyphRasterizer: GlyphRasterizer;

	private _colorMap!: string[];
	private readonly _warmUpTask: MutableDisposable<IdleTaskQueue> = this._register(new MutableDisposable());

	public get source(): OffscreenCanvas {
		return this._page.source;
	}

	public get hasChanges(): boolean {
		return this._page.hasChanges;
	}
	public set hasChanges(value: boolean) {
		this._page.hasChanges = value;
	}

	private readonly _page: TextureAtlasPage;

	// TODO: Should pull in the font size from config instead of random dom node
	constructor(
		parentDomNode: HTMLElement,
		pageSize: number,
		maxTextureSize: number,
		@IThemeService private readonly _themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		const activeWindow = getActiveWindow();
		const style = activeWindow.getComputedStyle(parentDomNode);
		const fontSize = Math.ceil(parseInt(style.fontSize) * activeWindow.devicePixelRatio);

		this._register(Event.runAndSubscribe(this._themeService.onDidColorThemeChange, () => {
			// TODO: Clear entire atlas on theme change
			this._colorMap = this._themeService.getColorTheme().tokenColorMap;
			this._warmUpAtlas();
		}));

		this._glyphRasterizer = this._register(new GlyphRasterizer(fontSize, style.fontFamily));

		this._page = this._register(this._instantiationService.createInstance(TextureAtlasPage, parentDomNode, pageSize, maxTextureSize, this._glyphRasterizer));
	}

	// TODO: Color, style etc.
	public getGlyph(chars: string, tokenFg: number): ITextureAtlasGlyph {
		return this._page.getGlyph(chars, tokenFg);
	}

	public getUsagePreview(): Promise<Blob> {
		return this._page.getUsagePreview();
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
