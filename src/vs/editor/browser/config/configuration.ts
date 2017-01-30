/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { CommonEditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { IDimension } from 'vs/editor/common/editorCommon';
import { FontInfo, BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { ElementSizeObserver } from 'vs/editor/browser/config/elementSizeObserver';
import { FastDomNode } from 'vs/base/browser/styleMutator';
import { CharWidthRequest, CharWidthRequestType, readCharWidths } from 'vs/editor/browser/config/charWidthReader';

class CSSBasedConfigurationCache {

	private _keys: { [key: string]: BareFontInfo; };
	private _values: { [key: string]: FontInfo; };

	constructor() {
		this._keys = Object.create(null);
		this._values = Object.create(null);
	}

	private _itemId(item: BareFontInfo): string {
		return `${browser.getZoomLevel()}-${item.getId()}`;
	}

	public has(item: BareFontInfo): boolean {
		let itemId = this._itemId(item);
		return !!this._values[itemId];
	}

	public get(item: BareFontInfo): FontInfo {
		let itemId = this._itemId(item);
		return this._values[itemId];
	}

	public put(item: BareFontInfo, value: FontInfo): void {
		let itemId = this._itemId(item);
		this._keys[itemId] = item;
		this._values[itemId] = value;
	}

	public getKeys(): BareFontInfo[] {
		return Object.keys(this._keys).map(id => this._keys[id]);
	}
}

export function readFontInfo(bareFontInfo: BareFontInfo): FontInfo {
	return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
}

class CSSBasedConfiguration extends Disposable {

	public static INSTANCE = new CSSBasedConfiguration();

	private _cache: CSSBasedConfigurationCache;
	private _changeMonitorTimeout: number = -1;

	private _onDidChange = this._register(new Emitter<void>());
	public onDidChange: Event<void> = this._onDidChange.event;

	constructor() {
		super();

		this._cache = new CSSBasedConfigurationCache();
	}

	public dispose(): void {
		if (this._changeMonitorTimeout !== -1) {
			clearTimeout(this._changeMonitorTimeout);
			this._changeMonitorTimeout = -1;
		}
		super.dispose();
	}

	public readConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		if (!this._cache.has(bareFontInfo)) {
			let readConfig = CSSBasedConfiguration._actualReadConfiguration(bareFontInfo);

			if (readConfig.typicalHalfwidthCharacterWidth <= 2 || readConfig.typicalFullwidthCharacterWidth <= 2 || readConfig.spaceWidth <= 2 || readConfig.maxDigitWidth <= 2) {
				// Hey, it's Bug 14341 ... we couldn't read
				readConfig = new FontInfo({
					fontFamily: readConfig.fontFamily,
					fontWeight: readConfig.fontWeight,
					fontSize: readConfig.fontSize,
					lineHeight: readConfig.lineHeight,
					isMonospace: readConfig.isMonospace,
					typicalHalfwidthCharacterWidth: Math.max(readConfig.typicalHalfwidthCharacterWidth, 5),
					typicalFullwidthCharacterWidth: Math.max(readConfig.typicalFullwidthCharacterWidth, 5),
					spaceWidth: Math.max(readConfig.spaceWidth, 5),
					maxDigitWidth: Math.max(readConfig.maxDigitWidth, 5),
				});
				this._installChangeMonitor();
			}

			this._cache.put(bareFontInfo, readConfig);
		}
		return this._cache.get(bareFontInfo);
	}

	private _installChangeMonitor(): void {
		if (this._changeMonitorTimeout === -1) {
			this._changeMonitorTimeout = setTimeout(() => {
				this._changeMonitorTimeout = -1;
				this._monitorForChanges();
			}, 500);
		}
	}

	private _monitorForChanges(): void {
		let shouldInstallChangeMonitor = false;
		let keys = this._cache.getKeys();
		for (let i = 0; i < keys.length; i++) {
			let styling = keys[i];

			let newValue = CSSBasedConfiguration._actualReadConfiguration(styling);

			if (newValue.typicalHalfwidthCharacterWidth <= 2 || newValue.typicalFullwidthCharacterWidth <= 2 || newValue.maxDigitWidth <= 2) {
				// We still couldn't read the CSS config
				shouldInstallChangeMonitor = true;
			} else {
				this._cache.put(styling, newValue);
				this._onDidChange.fire();
			}
		}
		if (shouldInstallChangeMonitor) {
			this._installChangeMonitor();
		}
	}

	private static createRequest(chr: string, type: CharWidthRequestType, all: CharWidthRequest[], monospace: CharWidthRequest[]): CharWidthRequest {
		let result = new CharWidthRequest(chr, type);
		all.push(result);
		if (monospace) {
			monospace.push(result);
		}
		return result;
	}

	private static _actualReadConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		let all: CharWidthRequest[] = [];
		let monospace: CharWidthRequest[] = [];

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
		this.createRequest('→', CharWidthRequestType.Regular, all, monospace);
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
		let referenceWidth = monospace[0].width;
		for (let i = 1, len = monospace.length; i < len; i++) {
			const diff = referenceWidth - monospace[i].width;
			if (diff < -0.001 || diff > 0.001) {
				isMonospace = false;
				break;
			}
		}

		return new FontInfo({
			fontFamily: bareFontInfo.fontFamily,
			fontWeight: bareFontInfo.fontWeight,
			fontSize: bareFontInfo.fontSize,
			lineHeight: bareFontInfo.lineHeight,
			isMonospace: isMonospace,
			typicalHalfwidthCharacterWidth: typicalHalfwidthCharacter.width,
			typicalFullwidthCharacterWidth: typicalFullwidthCharacter.width,
			spaceWidth: space.width,
			maxDigitWidth: maxDigitWidth
		});
	}
}

export class Configuration extends CommonEditorConfiguration {

	public static applyFontInfoSlow(domNode: HTMLElement, fontInfo: BareFontInfo): void {
		domNode.style.fontFamily = fontInfo.fontFamily;
		domNode.style.fontWeight = fontInfo.fontWeight;
		domNode.style.fontSize = fontInfo.fontSize + 'px';
		domNode.style.lineHeight = fontInfo.lineHeight + 'px';
	}

	public static applyFontInfo(domNode: FastDomNode, fontInfo: BareFontInfo): void {
		domNode.setFontFamily(fontInfo.fontFamily);
		domNode.setFontWeight(fontInfo.fontWeight);
		domNode.setFontSize(fontInfo.fontSize);
		domNode.setLineHeight(fontInfo.lineHeight);
	}

	constructor(options: any, referenceDomElement: HTMLElement = null) {
		super(options, new ElementSizeObserver(referenceDomElement, () => this._onReferenceDomElementSizeChanged()));

		this._register(CSSBasedConfiguration.INSTANCE.onDidChange(() => () => this._onCSSBasedConfigurationChanged()));

		if (this._configWithDefaults.getEditorOptions().automaticLayout) {
			this._elementSizeObserver.startObserving();
		}

		this._register(browser.onDidChangeZoomLevel(_ => this._recomputeOptions()));
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
		this._elementSizeObserver.dispose();
		super.dispose();
	}

	protected _getEditorClassName(theme: string, fontLigatures: boolean): string {
		let extra = '';
		if (browser.isIE) {
			extra += 'ie ';
		} else if (browser.isFirefox) {
			extra += 'ff ';
		} else if (browser.isEdge) {
			extra += 'edge ';
		}
		if (platform.isMacintosh) {
			extra += 'mac ';
		}
		if (fontLigatures) {
			extra += 'enable-ligatures ';
		}
		return 'monaco-editor ' + extra + theme;
	}

	protected getOuterWidth(): number {
		return this._elementSizeObserver.getWidth();
	}

	protected getOuterHeight(): number {
		return this._elementSizeObserver.getHeight();
	}

	protected _getCanUseTranslate3d(): boolean {
		return browser.canUseTranslate3d && browser.getZoomLevel() === 0;
	}

	protected readConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
	}
}
