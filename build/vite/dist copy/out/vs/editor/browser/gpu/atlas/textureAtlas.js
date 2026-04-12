/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TextureAtlas_1;
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, dispose, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { NKeyMap } from '../../../../base/common/map.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { GlyphRasterizer } from '../raster/glyphRasterizer.js';
import { IdleTaskQueue } from '../taskQueue.js';
import { TextureAtlasPage } from './textureAtlasPage.js';
let TextureAtlas = class TextureAtlas extends Disposable {
    static { TextureAtlas_1 = this; }
    /**
     * The maximum number of texture atlas pages. This is currently a hard static cap that must not
     * be reached.
     */
    static { this.maximumPageCount = 16; }
    get pages() { return this._pages; }
    constructor(
    /** The maximum texture size supported by the GPU. */
    _maxTextureSize, options, _decorationStyleCache, _themeService, _instantiationService) {
        super();
        this._maxTextureSize = _maxTextureSize;
        this._decorationStyleCache = _decorationStyleCache;
        this._themeService = _themeService;
        this._instantiationService = _instantiationService;
        this._warmUpTask = this._register(new MutableDisposable());
        this._warmedUpRasterizers = new Set();
        /**
         * The main texture atlas pages which are both larger textures and more efficiently packed
         * relative to the scratch page. The idea is the main pages are drawn to and uploaded to the GPU
         * much less frequently so as to not drop frames.
         */
        this._pages = [];
        /**
         * A maps of glyph keys to the page to start searching for the glyph. This is set before
         * searching to have as little runtime overhead (branching, intermediate variables) as possible,
         * so it is not guaranteed to be the actual page the glyph is on. But it is guaranteed that all
         * pages with a lower index do not contain the glyph.
         */
        this._glyphPageIndex = new NKeyMap();
        this._onDidDeleteGlyphs = this._register(new Emitter());
        this.onDidDeleteGlyphs = this._onDidDeleteGlyphs.event;
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
    _initFirstPage() {
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
        this._warmedUpRasterizers.clear();
        this._warmUpTask.clear();
        // Recreate first
        this._initFirstPage();
        // Tell listeners
        this._onDidDeleteGlyphs.fire();
    }
    getGlyph(rasterizer, chars, tokenMetadata, decorationStyleSetId, x) {
        // TODO: Encode font size and family into key
        // Ignore metadata that doesn't affect the glyph
        tokenMetadata &= ~(255 /* MetadataConsts.LANGUAGEID_MASK */ | 768 /* MetadataConsts.TOKEN_TYPE_MASK */ | 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */);
        // Add x offset for sub-pixel rendering to the unused portion or tokenMetadata. This
        // converts the decimal part of the x to a range from 0 to 9, where 0 = 0.0px x offset,
        // 9 = 0.9px x offset
        tokenMetadata |= Math.floor((x % 1) * 10);
        // Warm up common glyphs
        if (!this._warmedUpRasterizers.has(rasterizer.id)) {
            this._warmUpAtlas(rasterizer);
            this._warmedUpRasterizers.add(rasterizer.id);
        }
        // Try get the glyph, overflowing to a new page if necessary
        return this._tryGetGlyph(this._glyphPageIndex.get(chars, tokenMetadata, decorationStyleSetId, rasterizer.cacheKey) ?? 0, rasterizer, chars, tokenMetadata, decorationStyleSetId);
    }
    _tryGetGlyph(pageIndex, rasterizer, chars, tokenMetadata, decorationStyleSetId) {
        this._glyphPageIndex.set(pageIndex, chars, tokenMetadata, decorationStyleSetId, rasterizer.cacheKey);
        return (this._pages[pageIndex].getGlyph(rasterizer, chars, tokenMetadata, decorationStyleSetId)
            ?? (pageIndex + 1 < this._pages.length
                ? this._tryGetGlyph(pageIndex + 1, rasterizer, chars, tokenMetadata, decorationStyleSetId)
                : undefined)
            ?? this._getGlyphFromNewPage(rasterizer, chars, tokenMetadata, decorationStyleSetId));
    }
    _getGlyphFromNewPage(rasterizer, chars, tokenMetadata, decorationStyleSetId) {
        if (this._pages.length >= TextureAtlas_1.maximumPageCount) {
            throw new Error(`Attempt to create a texture atlas page past the limit ${TextureAtlas_1.maximumPageCount}`);
        }
        this._pages.push(this._instantiationService.createInstance(TextureAtlasPage, this._pages.length, this.pageSize, this._allocatorType));
        this._glyphPageIndex.set(this._pages.length - 1, chars, tokenMetadata, decorationStyleSetId, rasterizer.cacheKey);
        return this._pages[this._pages.length - 1].getGlyph(rasterizer, chars, tokenMetadata, decorationStyleSetId);
    }
    getUsagePreview() {
        return Promise.all(this._pages.map(e => e.getUsagePreview()));
    }
    getStats() {
        return this._pages.map(e => e.getStats());
    }
    /**
     * Warms up the atlas by rasterizing all printable ASCII characters for each token color. This
     * is distrubuted over multiple idle callbacks to avoid blocking the main thread.
     */
    _warmUpAtlas(rasterizer) {
        const colorMap = this._colorMap;
        if (!colorMap) {
            throw new BugIndicatingError('Cannot warm atlas without color map');
        }
        this._warmUpTask.value?.clear();
        const taskQueue = this._warmUpTask.value = this._instantiationService.createInstance(IdleTaskQueue);
        // Warm up using roughly the larger glyphs first to help optimize atlas allocation
        // A-Z
        for (let code = 65 /* CharCode.A */; code <= 90 /* CharCode.Z */; code++) {
            for (const fgColor of colorMap.keys()) {
                taskQueue.enqueue(() => {
                    for (let x = 0; x < 1; x += 0.1) {
                        this.getGlyph(rasterizer, String.fromCharCode(code), (fgColor << 15 /* MetadataConsts.FOREGROUND_OFFSET */) & 16744448 /* MetadataConsts.FOREGROUND_MASK */, 0, x);
                    }
                });
            }
        }
        // a-z
        for (let code = 97 /* CharCode.a */; code <= 122 /* CharCode.z */; code++) {
            for (const fgColor of colorMap.keys()) {
                taskQueue.enqueue(() => {
                    for (let x = 0; x < 1; x += 0.1) {
                        this.getGlyph(rasterizer, String.fromCharCode(code), (fgColor << 15 /* MetadataConsts.FOREGROUND_OFFSET */) & 16744448 /* MetadataConsts.FOREGROUND_MASK */, 0, x);
                    }
                });
            }
        }
        // Remaining ascii
        for (let code = 33 /* CharCode.ExclamationMark */; code <= 126 /* CharCode.Tilde */; code++) {
            for (const fgColor of colorMap.keys()) {
                taskQueue.enqueue(() => {
                    for (let x = 0; x < 1; x += 0.1) {
                        this.getGlyph(rasterizer, String.fromCharCode(code), (fgColor << 15 /* MetadataConsts.FOREGROUND_OFFSET */) & 16744448 /* MetadataConsts.FOREGROUND_MASK */, 0, x);
                    }
                });
            }
        }
    }
};
TextureAtlas = TextureAtlas_1 = __decorate([
    __param(3, IThemeService),
    __param(4, IInstantiationService)
], TextureAtlas);
export { TextureAtlas };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHVyZUF0bGFzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvZ3B1L2F0bGFzL3RleHR1cmVBdGxhcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUdsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFL0QsT0FBTyxFQUFFLGFBQWEsRUFBbUIsTUFBTSxpQkFBaUIsQ0FBQztBQUVqRSxPQUFPLEVBQWlCLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFNakUsSUFBTSxZQUFZLEdBQWxCLE1BQU0sWUFBYSxTQUFRLFVBQVU7O0lBTTNDOzs7T0FHRzthQUNhLHFCQUFnQixHQUFHLEVBQUUsQUFBTCxDQUFNO0lBUXRDLElBQUksS0FBSyxLQUFrQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBZWhFO0lBQ0MscURBQXFEO0lBQ3BDLGVBQXVCLEVBQ3hDLE9BQXlDLEVBQ3hCLHFCQUEyQyxFQUM3QyxhQUE2QyxFQUNyQyxxQkFB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