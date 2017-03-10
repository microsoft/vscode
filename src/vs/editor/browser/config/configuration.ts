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
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { CharWidthRequest, CharWidthRequestType, readCharWidths } from 'vs/editor/browser/config/charWidthReader';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

class CSSBasedConfigurationCache {

	private _keys: { [key: string]: BareFontInfo; };
	private _values: { [key: string]: FontInfo; };

	constructor() {
		this._keys = Object.create(null);
		this._values = Object.create(null);
	}

	public has(item: BareFontInfo): boolean {
		let itemId = item.getId();
		return !!this._values[itemId];
	}

	public get(item: BareFontInfo): FontInfo {
		let itemId = item.getId();
		return this._values[itemId];
	}

	public put(item: BareFontInfo, value: FontInfo): void {
		let itemId = item.getId();
		this._keys[itemId] = item;
		this._values[itemId] = value;
	}

	public remove(item: BareFontInfo): void {
		let itemId = item.getId();
		delete this._keys[itemId];
		delete this._values[itemId];
	}

	public getKeys(): BareFontInfo[] {
		return Object.keys(this._keys).map(id => this._keys[id]);
	}

	public getValues(): FontInfo[] {
		return Object.keys(this._keys).map(id => this._values[id]);
	}
}

export function readFontInfo(bareFontInfo: BareFontInfo): FontInfo {
	return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
}

export function restoreFontInfo(storageService: IStorageService): void {
	let strStoredFontInfo = storageService.get('editorFontInfo', StorageScope.GLOBAL);
	if (typeof strStoredFontInfo !== 'string') {
		return;
	}
	let storedFontInfo: ISerializedFontInfo[] = null;
	try {
		storedFontInfo = JSON.parse(strStoredFontInfo);
	} catch (err) {
		return;
	}
	if (!Array.isArray(storedFontInfo)) {
		return;
	}
	CSSBasedConfiguration.INSTANCE.restoreFontInfo(storedFontInfo);
}

export function saveFontInfo(storageService: IStorageService): void {
	let knownFontInfo = CSSBasedConfiguration.INSTANCE.saveFontInfo();
	storageService.store('editorFontInfo', JSON.stringify(knownFontInfo), StorageScope.GLOBAL);
}

export interface ISerializedFontInfo {
	readonly zoomLevel: number;
	readonly fontFamily: string;
	readonly fontWeight: string;
	readonly fontSize: number;
	readonly lineHeight: number;
	readonly isMonospace: boolean;
	readonly typicalHalfwidthCharacterWidth: number;
	readonly typicalFullwidthCharacterWidth: number;
	readonly spaceWidth: number;
	readonly maxDigitWidth: number;
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

	public saveFontInfo(): ISerializedFontInfo[] {
		// Only save trusted font info (that has been measured in this running instance)
		return this._cache.getValues().filter(item => item.isTrusted);
	}

	public restoreFontInfo(savedFontInfo: ISerializedFontInfo[]): void {
		// Take all the saved font info and insert them in the cache without the trusted flag.
		// The reason for this is that a font might have been installed on the OS in the meantime.
		for (let i = 0, len = savedFontInfo.length; i < len; i++) {
			let fontInfo = new FontInfo(savedFontInfo[i], false);
			this._cache.put(fontInfo, fontInfo);
		}

		// Remove saved font info that does not have the trusted flag.
		// (this forces it to be re-read).
		setTimeout(() => {
			let values = this._cache.getValues();
			let somethingRemoved = false;
			for (let i = 0, len = values.length; i < len; i++) {
				let item = values[i];
				if (!item.isTrusted) {
					somethingRemoved = true;
					this._cache.remove(item);
				}
			}
			if (somethingRemoved) {
				this._onDidChange.fire();
			}
		}, 5000);
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
					isMonospace: readConfig.isMonospace,
					typicalHalfwidthCharacterWidth: Math.max(readConfig.typicalHalfwidthCharacterWidth, 5),
					typicalFullwidthCharacterWidth: Math.max(readConfig.typicalFullwidthCharacterWidth, 5),
					spaceWidth: Math.max(readConfig.spaceWidth, 5),
					maxDigitWidth: Math.max(readConfig.maxDigitWidth, 5),
				}, true);
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
			zoomLevel: browser.getZoomLevel(),
			fontFamily: bareFontInfo.fontFamily,
			fontWeight: bareFontInfo.fontWeight,
			fontSize: bareFontInfo.fontSize,
			lineHeight: bareFontInfo.lineHeight,
			isMonospace: isMonospace,
			typicalHalfwidthCharacterWidth: typicalHalfwidthCharacter.width,
			typicalFullwidthCharacterWidth: typicalFullwidthCharacter.width,
			spaceWidth: space.width,
			maxDigitWidth: maxDigitWidth
		}, true);
	}
}

export class Configuration extends CommonEditorConfiguration {

	public static applyFontInfoSlow(domNode: HTMLElement, fontInfo: BareFontInfo): void {
		domNode.style.fontFamily = fontInfo.fontFamily;
		domNode.style.fontWeight = fontInfo.fontWeight;
		domNode.style.fontSize = fontInfo.fontSize + 'px';
		domNode.style.lineHeight = fontInfo.lineHeight + 'px';
	}

	public static applyFontInfo(domNode: FastDomNode<HTMLElement>, fontInfo: BareFontInfo): void {
		domNode.setFontFamily(fontInfo.fontFamily);
		domNode.setFontWeight(fontInfo.fontWeight);
		domNode.setFontSize(fontInfo.fontSize);
		domNode.setLineHeight(fontInfo.lineHeight);
	}

	constructor(options: any, referenceDomElement: HTMLElement = null) {
		super(options, new ElementSizeObserver(referenceDomElement, () => this._onReferenceDomElementSizeChanged()));

		this._register(CSSBasedConfiguration.INSTANCE.onDidChange(() => this._onCSSBasedConfigurationChanged()));

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

	protected _getEditorClassName(theme: string, fontLigatures: boolean, mouseStyle: 'text' | 'default' | 'copy'): string {
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
		if (mouseStyle === 'default') {
			extra += 'mouse-default ';
		} else if (mouseStyle === 'copy') {
			extra += 'mouse-copy ';
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

	protected _getPixelRatio(): number {
		return browser.getPixelRatio();
	}

	protected readConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
	}

	protected getZoomLevel(): number {
		return browser.getZoomLevel();
	}
}
