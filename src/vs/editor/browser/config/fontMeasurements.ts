/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindowId } from '../../../base/browser/dom.js';
import { PixelRatio } from '../../../base/browser/pixelRatio.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { CharWidthRequest, CharWidthRequestType, readCharWidths } from './charWidthReader.js';
import { EditorFontLigatures } from '../../common/config/editorOptions.js';
import { BareFontInfo, FontInfo, SERIALIZED_FONT_INFO_VERSION } from '../../common/config/fontInfo.js';

/**
 * Serializable font information.
 */
export interface ISerializedFontInfo {
	readonly version: number;
	readonly pixelRatio: number;
	readonly fontFamily: string;
	readonly fontWeight: string;
	readonly fontSize: number;
	readonly fontFeatureSettings: string;
	readonly fontVariationSettings: string;
	readonly lineHeight: number;
	readonly letterSpacing: number;
	readonly isMonospace: boolean;
	readonly typicalHalfwidthCharacterWidth: number;
	readonly typicalFullwidthCharacterWidth: number;
	readonly canUseHalfwidthRightwardsArrow: boolean;
	readonly spaceWidth: number;
	readonly middotWidth: number;
	readonly wsmiddotWidth: number;
	readonly maxDigitWidth: number;
}

export class FontMeasurementsImpl extends Disposable {

	private readonly _cache = new Map<number, FontMeasurementsCache>();

	private _evictUntrustedReadingsTimeout = -1;

	private readonly _onDidChange = this._register(new Emitter<void>());
	public readonly onDidChange = this._onDidChange.event;

	public override dispose(): void {
		if (this._evictUntrustedReadingsTimeout !== -1) {
			clearTimeout(this._evictUntrustedReadingsTimeout);
			this._evictUntrustedReadingsTimeout = -1;
		}
		super.dispose();
	}

	/**
	 * Clear all cached font information and trigger a change event.
	 */
	public clearAllFontInfos(): void {
		this._cache.clear();
		this._onDidChange.fire();
	}

	private _ensureCache(targetWindow: Window): FontMeasurementsCache {
		const windowId = getWindowId(targetWindow);
		let cache = this._cache.get(windowId);
		if (!cache) {
			cache = new FontMeasurementsCache();
			this._cache.set(windowId, cache);
		}
		return cache;
	}

	private _writeToCache(targetWindow: Window, item: BareFontInfo, value: FontInfo): void {
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

	private _evictUntrustedReadings(targetWindow: Window): void {
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
	public serializeFontInfo(targetWindow: Window): ISerializedFontInfo[] {
		// Only save trusted font info (that has been measured in this running instance)
		const cache = this._ensureCache(targetWindow);
		return cache.getValues().filter(item => item.isTrusted);
	}

	/**
	 * Restore previously serialized font informations.
	 */
	public restoreFontInfo(targetWindow: Window, savedFontInfos: ISerializedFontInfo[]): void {
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
	public readFontInfo(targetWindow: Window, bareFontInfo: BareFontInfo): FontInfo {
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

	private _createRequest(chr: string, type: CharWidthRequestType, all: CharWidthRequest[], monospace: CharWidthRequest[] | null): CharWidthRequest {
		const result = new CharWidthRequest(chr, type);
		all.push(result);
		monospace?.push(result);
		return result;
	}

	private _actualReadFontInfo(targetWindow: Window, bareFontInfo: BareFontInfo): FontInfo {
		const all: CharWidthRequest[] = [];
		const monospace: CharWidthRequest[] = [];

		const typicalHalfwidthCharacter = this._createRequest('n', CharWidthRequestType.Regular, all, monospace);
		const typicalFullwidthCharacter = this._createRequest('\uff4d', CharWidthRequestType.Regular, all, null);
		const space = this._createRequest(' ', CharWidthRequestType.Regular, all, monospace);
		const digit0 = this._createRequest('0', CharWidthRequestType.Regular, all, monospace);
		const digit1 = this._createRequest('1', CharWidthRequestType.Regular, all, monospace);
		const digit2 = this._createRequest('2', CharWidthRequestType.Regular, all, monospace);
		const digit3 = this._createRequest('3', CharWidthRequestType.Regular, all, monospace);
		const digit4 = this._createRequest('4', CharWidthRequestType.Regular, all, monospace);
		const digit5 = this._createRequest('5', CharWidthRequestType.Regular, all, monospace);
		const digit6 = this._createRequest('6', CharWidthRequestType.Regular, all, monospace);
		const digit7 = this._createRequest('7', CharWidthRequestType.Regular, all, monospace);
		const digit8 = this._createRequest('8', CharWidthRequestType.Regular, all, monospace);
		const digit9 = this._createRequest('9', CharWidthRequestType.Regular, all, monospace);

		// monospace test: used for whitespace rendering
		const rightwardsArrow = this._createRequest('→', CharWidthRequestType.Regular, all, monospace);
		const halfwidthRightwardsArrow = this._createRequest('￫', CharWidthRequestType.Regular, all, null);

		// U+00B7 - MIDDLE DOT
		const middot = this._createRequest('·', CharWidthRequestType.Regular, all, monospace);

		// U+2E31 - WORD SEPARATOR MIDDLE DOT
		const wsmiddotWidth = this._createRequest(String.fromCharCode(0x2E31), CharWidthRequestType.Regular, all, null);

		// monospace test: some characters
		const monospaceTestChars = '|/-_ilm%';
		for (let i = 0, len = monospaceTestChars.length; i < len; i++) {
			this._createRequest(monospaceTestChars.charAt(i), CharWidthRequestType.Regular, all, monospace);
			this._createRequest(monospaceTestChars.charAt(i), CharWidthRequestType.Italic, all, monospace);
			this._createRequest(monospaceTestChars.charAt(i), CharWidthRequestType.Bold, all, monospace);
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

	private readonly _keys: { [key: string]: BareFontInfo };
	private readonly _values: { [key: string]: FontInfo };

	constructor() {
		this._keys = Object.create(null);
		this._values = Object.create(null);
	}

	public has(item: BareFontInfo): boolean {
		const itemId = item.getId();
		return !!this._values[itemId];
	}

	public get(item: BareFontInfo): FontInfo {
		const itemId = item.getId();
		return this._values[itemId];
	}

	public put(item: BareFontInfo, value: FontInfo): void {
		const itemId = item.getId();
		this._keys[itemId] = item;
		this._values[itemId] = value;
	}

	public remove(item: BareFontInfo): void {
		const itemId = item.getId();
		delete this._keys[itemId];
		delete this._values[itemId];
	}

	public getValues(): FontInfo[] {
		return Object.keys(this._keys).map(id => this._values[id]);
	}
}

export const FontMeasurements = new FontMeasurementsImpl();
