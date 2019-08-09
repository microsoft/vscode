/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { CharWidthRequest, CharWidthRequestType, readCharWidths } from 'vs/editor/browser/config/charWidthReader';
import { ElementSizeObserver } from 'vs/editor/browser/config/elementSizeObserver';
import { CommonEditorConfiguration, IEnvConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo, FontInfo } from 'vs/editor/common/config/fontInfo';
import { IDimension } from 'vs/editor/common/editorCommon';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

class CSSBasedConfigurationCache {

	private readonly _keys: { [key: string]: BareFontInfo; };
	private readonly _values: { [key: string]: FontInfo; };

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

export function clearAllFontInfos(): void {
	CSSBasedConfiguration.INSTANCE.clearCache();
}

export function readFontInfo(bareFontInfo: BareFontInfo): FontInfo {
	return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
}

export function restoreFontInfo(fontInfo: ISerializedFontInfo[]): void {
	CSSBasedConfiguration.INSTANCE.restoreFontInfo(fontInfo);
}

export function serializeFontInfo(): ISerializedFontInfo[] | null {
	const fontInfo = CSSBasedConfiguration.INSTANCE.saveFontInfo();
	if (fontInfo.length > 0) {
		return fontInfo;
	}

	return null;
}

export interface ISerializedFontInfo {
	readonly zoomLevel: number;
	readonly fontFamily: string;
	readonly fontWeight: string;
	readonly fontSize: number;
	readonly lineHeight: number;
	readonly letterSpacing: number;
	readonly isMonospace: boolean;
	readonly typicalHalfwidthCharacterWidth: number;
	readonly typicalFullwidthCharacterWidth: number;
	readonly canUseHalfwidthRightwardsArrow: boolean;
	readonly spaceWidth: number;
	readonly maxDigitWidth: number;
}

class CSSBasedConfiguration extends Disposable {

	public static readonly INSTANCE = new CSSBasedConfiguration();

	private _cache: CSSBasedConfigurationCache;
	private _evictUntrustedReadingsTimeout: any;

	private _onDidChange = this._register(new Emitter<void>());
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor() {
		super();

		this._cache = new CSSBasedConfigurationCache();
		this._evictUntrustedReadingsTimeout = -1;
	}

	public dispose(): void {
		if (this._evictUntrustedReadingsTimeout !== -1) {
			clearTimeout(this._evictUntrustedReadingsTimeout);
			this._evictUntrustedReadingsTimeout = -1;
		}
		super.dispose();
	}

	public clearCache(): void {
		this._cache = new CSSBasedConfigurationCache();
		this._onDidChange.fire();
	}

	private _writeToCache(item: BareFontInfo, value: FontInfo): void {
		this._cache.put(item, value);

		if (!value.isTrusted && this._evictUntrustedReadingsTimeout === -1) {
			// Try reading again after some time
			this._evictUntrustedReadingsTimeout = setTimeout(() => {
				this._evictUntrustedReadingsTimeout = -1;
				this._evictUntrustedReadings();
			}, 5000);
		}
	}

	private _evictUntrustedReadings(): void {
		const values = this._cache.getValues();
		let somethingRemoved = false;
		for (let i = 0, len = values.length; i < len; i++) {
			const item = values[i];
			if (!item.isTrusted) {
				somethingRemoved = true;
				this._cache.remove(item);
			}
		}
		if (somethingRemoved) {
			this._onDidChange.fire();
		}
	}

	public saveFontInfo(): ISerializedFontInfo[] {
		// Only save trusted font info (that has been measured in this running instance)
		return this._cache.getValues().filter(item => item.isTrusted);
	}

	public restoreFontInfo(savedFontInfo: ISerializedFontInfo[]): void {
		// Take all the saved font info and insert them in the cache without the trusted flag.
		// The reason for this is that a font might have been installed on the OS in the meantime.
		for (let i = 0, len = savedFontInfo.length; i < len; i++) {
			const fontInfo = new FontInfo(savedFontInfo[i], false);
			this._writeToCache(fontInfo, fontInfo);
		}
	}

	public readConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		if (!this._cache.has(bareFontInfo)) {
			let readConfig = CSSBasedConfiguration._actualReadConfiguration(bareFontInfo);

			if (readConfig.typicalHalfwidthCharacterWidth <= 2 || readConfig.typicalFullwidthCharacterWidth <= 2 || readConfig.spaceWidth <= 2 || readConfig.maxDigitWidth <= 2) {
				// Hey, it's Bug 14341 ... we couldn't read
				readConfig = new FontInfo({
					zoomLevel: browser.getZoomLevel(),
					fontFamily: readConfig.fontFamily,
					fontWeight: readConfig.fontWeight,
					fontSize: readConfig.fontSize,
					lineHeight: readConfig.lineHeight,
					letterSpacing: readConfig.letterSpacing,
					isMonospace: readConfig.isMonospace,
					typicalHalfwidthCharacterWidth: Math.max(readConfig.typicalHalfwidthCharacterWidth, 5),
					typicalFullwidthCharacterWidth: Math.max(readConfig.typicalFullwidthCharacterWidth, 5),
					canUseHalfwidthRightwardsArrow: readConfig.canUseHalfwidthRightwardsArrow,
					spaceWidth: Math.max(readConfig.spaceWidth, 5),
					maxDigitWidth: Math.max(readConfig.maxDigitWidth, 5),
				}, false);
			}

			this._writeToCache(bareFontInfo, readConfig);
		}
		return this._cache.get(bareFontInfo);
	}

	private static createRequest(chr: string, type: CharWidthRequestType, all: CharWidthRequest[], monospace: CharWidthRequest[] | null): CharWidthRequest {
		const result = new CharWidthRequest(chr, type);
		all.push(result);
		if (monospace) {
			monospace.push(result);
		}
		return result;
	}

	private static _actualReadConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		const all: CharWidthRequest[] = [];
		const monospace: CharWidthRequest[] = [];

		const typicalHalfwidthCharacter = this.createRequest('n', CharWidthRequestType.Regular, all, monospace);
		const typicalFullwidthCharacter = this.createRequest('\uff4d', CharWidthRequestType.Regular, all, null);
		const space = this.createRequest(' ', CharWidthRequestType.Regular, all, monospace);
		const digit0 = this.createRequest('0', CharWidthRequestType.Regular, all, monospace);
		const digit1 = this.createRequest('1', CharWidthRequestType.Regular, all, monospace);
		const digit2 = this.createRequest('2', CharWidthRequestType.Regular, all, monospace);
		const digit3 = this.createRequest('3', CharWidthRequestType.Regular, all, monospace);
		const digit4 = this.createRequest('4', CharWidthRequestType.Regular, all, monospace);
		const digit5 = this.createRequest('5', CharWidthRequestType.Regular, all, monospace);
		const digit6 = this.createRequest('6', CharWidthRequestType.Regular, all, monospace);
		const digit7 = this.createRequest('7', CharWidthRequestType.Regular, all, monospace);
		const digit8 = this.createRequest('8', CharWidthRequestType.Regular, all, monospace);
		const digit9 = this.createRequest('9', CharWidthRequestType.Regular, all, monospace);

		// monospace test: used for whitespace rendering
		const rightwardsArrow = this.createRequest('→', CharWidthRequestType.Regular, all, monospace);
		const halfwidthRightwardsArrow = this.createRequest('￫', CharWidthRequestType.Regular, all, null);

		this.createRequest('·', CharWidthRequestType.Regular, all, monospace);

		// monospace test: some characters
		this.createRequest('|', CharWidthRequestType.Regular, all, monospace);
		this.createRequest('/', CharWidthRequestType.Regular, all, monospace);
		this.createRequest('-', CharWidthRequestType.Regular, all, monospace);
		this.createRequest('_', CharWidthRequestType.Regular, all, monospace);
		this.createRequest('i', CharWidthRequestType.Regular, all, monospace);
		this.createRequest('l', CharWidthRequestType.Regular, all, monospace);
		this.createRequest('m', CharWidthRequestType.Regular, all, monospace);

		// monospace italic test
		this.createRequest('|', CharWidthRequestType.Italic, all, monospace);
		this.createRequest('_', CharWidthRequestType.Italic, all, monospace);
		this.createRequest('i', CharWidthRequestType.Italic, all, monospace);
		this.createRequest('l', CharWidthRequestType.Italic, all, monospace);
		this.createRequest('m', CharWidthRequestType.Italic, all, monospace);
		this.createRequest('n', CharWidthRequestType.Italic, all, monospace);

		// monospace bold test
		this.createRequest('|', CharWidthRequestType.Bold, all, monospace);
		this.createRequest('_', CharWidthRequestType.Bold, all, monospace);
		this.createRequest('i', CharWidthRequestType.Bold, all, monospace);
		this.createRequest('l', CharWidthRequestType.Bold, all, monospace);
		this.createRequest('m', CharWidthRequestType.Bold, all, monospace);
		this.createRequest('n', CharWidthRequestType.Bold, all, monospace);

		readCharWidths(bareFontInfo, all);

		const maxDigitWidth = Math.max(digit0.width, digit1.width, digit2.width, digit3.width, digit4.width, digit5.width, digit6.width, digit7.width, digit8.width, digit9.width);

		let isMonospace = true;
		const referenceWidth = monospace[0].width;
		for (let i = 1, len = monospace.length; i < len; i++) {
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

		// let's trust the zoom level only 2s after it was changed.
		const canTrustBrowserZoomLevel = (browser.getTimeSinceLastZoomLevelChanged() > 2000);
		return new FontInfo({
			zoomLevel: browser.getZoomLevel(),
			fontFamily: bareFontInfo.fontFamily,
			fontWeight: bareFontInfo.fontWeight,
			fontSize: bareFontInfo.fontSize,
			lineHeight: bareFontInfo.lineHeight,
			letterSpacing: bareFontInfo.letterSpacing,
			isMonospace: isMonospace,
			typicalHalfwidthCharacterWidth: typicalHalfwidthCharacter.width,
			typicalFullwidthCharacterWidth: typicalFullwidthCharacter.width,
			canUseHalfwidthRightwardsArrow: canUseHalfwidthRightwardsArrow,
			spaceWidth: space.width,
			maxDigitWidth: maxDigitWidth
		}, canTrustBrowserZoomLevel);
	}
}

export class Configuration extends CommonEditorConfiguration {

	public static applyFontInfoSlow(domNode: HTMLElement, fontInfo: BareFontInfo): void {
		domNode.style.fontFamily = fontInfo.getMassagedFontFamily();
		domNode.style.fontWeight = fontInfo.fontWeight;
		domNode.style.fontSize = fontInfo.fontSize + 'px';
		domNode.style.lineHeight = fontInfo.lineHeight + 'px';
		domNode.style.letterSpacing = fontInfo.letterSpacing + 'px';
	}

	public static applyFontInfo(domNode: FastDomNode<HTMLElement>, fontInfo: BareFontInfo): void {
		domNode.setFontFamily(fontInfo.getMassagedFontFamily());
		domNode.setFontWeight(fontInfo.fontWeight);
		domNode.setFontSize(fontInfo.fontSize);
		domNode.setLineHeight(fontInfo.lineHeight);
		domNode.setLetterSpacing(fontInfo.letterSpacing);
	}

	private readonly _elementSizeObserver: ElementSizeObserver;

	constructor(
		isSimpleWidget: boolean,
		options: IEditorOptions,
		referenceDomElement: HTMLElement | null = null,
		private readonly accessibilityService: IAccessibilityService
	) {
		super(isSimpleWidget, options);

		this._elementSizeObserver = this._register(new ElementSizeObserver(referenceDomElement, () => this._onReferenceDomElementSizeChanged()));

		this._register(CSSBasedConfiguration.INSTANCE.onDidChange(() => this._onCSSBasedConfigurationChanged()));

		if (this._validatedOptions.automaticLayout) {
			this._elementSizeObserver.startObserving();
		}

		this._register(browser.onDidChangeZoomLevel(_ => this._recomputeOptions()));
		this._register(this.accessibilityService.onDidChangeAccessibilitySupport(() => this._recomputeOptions()));

		this._recomputeOptions();
	}

	private _onReferenceDomElementSizeChanged(): void {
		this._recomputeOptions();
	}

	private _onCSSBasedConfigurationChanged(): void {
		this._recomputeOptions();
	}

	public observeReferenceElement(dimension?: IDimension): void {
		this._elementSizeObserver.observe(dimension);
	}

	public dispose(): void {
		super.dispose();
	}

	private _getExtraEditorClassName(): string {
		let extra = '';
		if (!browser.isSafari && !browser.isWebkitWebView) {
			// Use user-select: none in all browsers except Safari and native macOS WebView
			extra += 'no-user-select ';
		}
		if (platform.isMacintosh) {
			extra += 'mac ';
		}
		return extra;
	}

	protected _getEnvConfiguration(): IEnvConfiguration {
		return {
			extraEditorClassName: this._getExtraEditorClassName(),
			outerWidth: this._elementSizeObserver.getWidth(),
			outerHeight: this._elementSizeObserver.getHeight(),
			emptySelectionClipboard: browser.isWebKit || browser.isFirefox,
			pixelRatio: browser.getPixelRatio(),
			zoomLevel: browser.getZoomLevel(),
			accessibilitySupport: this.accessibilityService.getAccessibilitySupport()
		};
	}

	protected readConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
	}
}
