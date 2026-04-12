/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindowId } from '../../../base/browser/dom.js';
import { PixelRatio } from '../../../base/browser/pixelRatio.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { CharWidthRequest, readCharWidths } from './charWidthReader.js';
import { EditorFontLigatures } from '../../common/config/editorOptions.js';
import { FontInfo, SERIALIZED_FONT_INFO_VERSION } from '../../common/config/fontInfo.js';
export class FontMeasurementsImpl extends Disposable {
    constructor() {
        super(...arguments);
        this._cache = new Map();
        this._evictUntrustedReadingsTimeout = -1;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
    }
    dispose() {
        if (this._evictUntrustedReadingsTimeout !== -1) {
            clearTimeout(this._evictUntrustedReadingsTimeout);
            this._evictUntrustedReadingsTimeout = -1;
        }
        super.dispose();
    }
    /**
     * Clear all cached font information and trigger a change event.
     */
    clearAllFontInfos() {
        this._cache.clear();
        this._onDidChange.fire();
    }
    _ensureCache(targetWindow) {
        const windowId = getWindowId(targetWindow);
        let cache = this._cache.get(windowId);
        if (!cache) {
            cache = new FontMeasurementsCache();
            this._cache.set(windowId, cache);
        }
        return cache;
    }
    _writeToCache(targetWindow, item, value) {
        const cache = this._ensureCache(targetWindow);
        cache.put(item, value);
        if (!value.isTrusted && this._evictUntrustedReadingsTimeout === -1) {
            // Try reading again after some time
            this._evictUntrustedReadingsTimeout = targetWindow.setTimeout(() => {
                this._evictUntrustedReadingsTimeout = -1;
                this._evictUntrustedReadings(targetWindow);
            }, 5000);
        }
    }
    _evictUntrustedReadings(targetWindow) {
        const cache = this._ensureCache(targetWindow);
        const values = cache.getValues();
        let somethingRemoved = false;
        for (const item of values) {
            if (!item.isTrusted) {
                somethingRemoved = true;
                cache.remove(item);
            }
        }
        if (somethingRemoved) {
            this._onDidChange.fire();
        }
    }
    /**
     * Serialized currently cached font information.
     */
    serializeFontInfo(targetWindow) {
        // Only save trusted font info (that has been measured in this running instance)
        const cache = this._ensureCache(targetWindow);
        return cache.getValues().filter(item => item.isTrusted);
    }
    /**
     * Restore previously serialized font informations.
     */
    restoreFontInfo(targetWindow, savedFontInfos) {
        // Take all the saved font info and insert them in the cache without the trusted flag.
        // The reason for this is that a font might have been installed on the OS in the meantime.
        for (const savedFontInfo of savedFontInfos) {
            if (savedFontInfo.version !== SERIALIZED_FONT_INFO_VERSION) {
                // cannot use older version
                continue;
            }
            const fontInfo = new FontInfo(savedFontInfo, false);
            this._writeToCache(targetWindow, fontInfo, fontInfo);
        }
    }
    /**
     * Read font information.
     */
    readFontInfo(targetWindow, bareFontInfo) {
        const cache = this._ensureCache(targetWindow);
        if (!cache.has(bareFontInfo)) {
            let readConfig = this._actualReadFontInfo(targetWindow, bareFontInfo);
            if (readConfig.typicalHalfwidthCharacterWidth <= 2 || readConfig.typicalFullwidthCharacterWidth <= 2 || readConfig.spaceWidth <= 2 || readConfig.maxDigitWidth <= 2) {
                // Hey, it's Bug 14341 ... we couldn't read
                readConfig = new FontInfo({
                    pixelRatio: PixelRatio.getInstance(targetWindow).value,
                    fontFamily: readConfig.fontFamily,
                    fontWeight: readConfig.fontWeight,
                    fontSize: readConfig.fontSize,
                    fontFeatureSettings: readConfig.fontFeatureSettings,
                    fontVariationSettings: readConfig.fontVariationSettings,
                    lineHeight: readConfig.lineHeight,
                    letterSpacing: readConfig.letterSpacing,
                    isMonospace: readConfig.isMonospace,
                    typicalHalfwidthCharacterWidth: Math.max(readConfig.typicalHalfwidthCharacterWidth, 5),
                    typicalFullwidthCharacterWidth: Math.max(readConfig.typicalFullwidthCharacterWidth, 5),
                    canUseHalfwidthRightwardsArrow: readConfig.canUseHalfwidthRightwardsArrow,
                    spaceWidth: Math.max(readConfig.spaceWidth, 5),
                    middotWidth: Math.max(readConfig.middotWidth, 5),
                    wsmiddotWidth: Math.max(readConfig.wsmiddotWidth, 5),
                    maxDigitWidth: Math.max(readConfig.maxDigitWidth, 5),
                }, false);
            }
            this._writeToCache(targetWindow, bareFontInfo, readConfig);
        }
        return cache.get(bareFontInfo);
    }
    _createRequest(chr, type, all, monospace) {
        const result = new CharWidthRequest(chr, type);
        all.push(result);
        monospace?.push(result);
        return result;
    }
    _actualReadFontInfo(targetWindow, bareFontInfo) {
        const all = [];
        const monospace = [];
        const typicalHalfwidthCharacter = this._createRequest('n', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const typicalFullwidthCharacter = this._createRequest('\uff4d', 0 /* CharWidthRequestType.Regular */, all, null);
        const space = this._createRequest(' ', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit0 = this._createRequest('0', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit1 = this._createRequest('1', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit2 = this._createRequest('2', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit3 = this._createRequest('3', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit4 = this._createRequest('4', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit5 = this._createRequest('5', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit6 = this._createRequest('6', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit7 = this._createRequest('7', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit8 = this._createRequest('8', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const digit9 = this._createRequest('9', 0 /* CharWidthRequestType.Regular */, all, monospace);
        // monospace test: used for whitespace rendering
        const rightwardsArrow = this._createRequest('→', 0 /* CharWidthRequestType.Regular */, all, monospace);
        const halfwidthRightwardsArrow = this._createRequest('￫', 0 /* CharWidthRequestType.Regular */, all, null);
        // U+00B7 - MIDDLE DOT
        const middot = this._createRequest('·', 0 /* CharWidthRequestType.Regular */, all, monospace);
        // U+2E31 - WORD SEPARATOR MIDDLE DOT
        const wsmiddotWidth = this._createRequest(String.fromCharCode(0x2E31), 0 /* CharWidthRequestType.Regular */, all, null);
        // monospace test: some characters
        const monospaceTestChars = '|/-_ilm%';
        for (let i = 0, len = monospaceTestChars.length; i < len; i++) {
            this._createRequest(monospaceTestChars.charAt(i), 0 /* CharWidthRequestType.Regular */, all, monospace);
            this._createRequest(monospaceTestChars.charAt(i), 1 /* CharWidthRequestType.Italic */, all, monospace);
            this._createRequest(monospaceTestChars.charAt(i), 2 /* CharWidthRequestType.Bold */, all, monospace);
        }
        readCharWidths(targetWindow, bareFontInfo, all);
        const maxDigitWidth = Math.max(digit0.width, digit1.width, digit2.width, digit3.width, digit4.width, digit5.width, digit6.width, digit7.width, digit8.width, digit9.width);
        let isMonospace = (bareFontInfo.fontFeatureSettings === EditorFontLigatures.OFF);
        const referenceWidth = monospace[0].width;
        for (let i = 1, len = monospace.length; isMonospace && i < len; i++) {
            const diff = referenceWidth - monospace[i].width;
            if (diff < -0.001 || diff > 0.001) {
                isMonospace = false;
                break;
            }
        }
        let canUseHalfwidthRightwardsArrow = true;
        if (isMonospace && halfwidthRightwardsArrow.width !== referenceWidth) {
            // using a halfwidth rightwards arrow would break monospace...
            canUseHalfwidthRightwardsArrow = false;
        }
        if (halfwidthRightwardsArrow.width > rightwardsArrow.width) {
            // using a halfwidth rightwards arrow would paint a larger arrow than a regular rightwards arrow
            canUseHalfwidthRightwardsArrow = false;
        }
        return new FontInfo({
            pixelRatio: PixelRatio.getInstance(targetWindow).value,
            fontFamily: bareFontInfo.fontFamily,
            fontWeight: bareFontInfo.fontWeight,
            fontSize: bareFontInfo.fontSize,
            fontFeatureSettings: bareFontInfo.fontFeatureSettings,
            fontVariationSettings: bareFontInfo.fontVariationSettings,
            lineHeight: bareFontInfo.lineHeight,
            letterSpacing: bareFontInfo.letterSpacing,
            isMonospace: isMonospace,
            typicalHalfwidthCharacterWidth: typicalHalfwidthCharacter.width,
            typicalFullwidthCharacterWidth: typicalFullwidthCharacter.width,
            canUseHalfwidthRightwardsArrow: canUseHalfwidthRightwardsArrow,
            spaceWidth: space.width,
            middotWidth: middot.width,
            wsmiddotWidth: wsmiddotWidth.width,
            maxDigitWidth: maxDigitWidth
        }, true);
    }
}
class FontMeasurementsCache {
    constructor() {
        this._keys = Object.create(null);
        this._values = Object.create(null);
    }
    has(item) {
        const itemId = item.getId();
        return !!this._values[itemId];
    }
    get(item) {
        const itemId = item.getId();
        return this._values[itemId];
    }
    put(item, value) {
        const itemId = item.getId();
        this._keys[itemId] = item;
        this._values[itemId] = value;
    }
    remove(item) {
        const itemId = item.getId();
        delete this._keys[itemId];
        delete this._values[itemId];
    }
    getValues() {
        return Object.keys(this._keys).map(id => this._values[id]);
    }
}
export const FontMeasurements = new FontMeasurementsImpl();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9udE1lYXN1cmVtZW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2NvbmZpZy9mb250TWVhc3VyZW1lbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQXdCLGNBQWMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzlGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNFLE9BQU8sRUFBZ0IsUUFBUSxFQUFFLDRCQUE0QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUF5QnZHLE1BQU0sT0FBTyxvQkFBcUIsU0FBUSxVQUFVO0lBQXBEOztRQUVrQixXQUFNLEdBQUcsSUFBSSxHQUFHLEVBQWlDLENBQUM7UUFFM0QsbUNBQThCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFM0IsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNwRCxnQkFBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO0lBME12RCxDQUFDO0lBeE1nQixPQUFPO1FBQ3RCLElBQUksSUFBSSxDQUFDLDhCQUE4QixLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDaEQsWUFBWSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1lBQ2xELElBQUksQ0FBQyw4QkFBOEIsR0FBRyxDQUFDLENBQUMs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RyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3pHLE1BQU0seUJBQXlCLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLHdDQUFnQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekcsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLHdDQUFnQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEYsTUFBTSxNQUFNLEdB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