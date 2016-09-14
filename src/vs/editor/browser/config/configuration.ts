/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {Disposable} from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import {CommonEditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {IDimension, FontInfo, BareFontInfo} from 'vs/editor/common/editorCommon';
import {ElementSizeObserver} from 'vs/editor/browser/config/elementSizeObserver';
import {FastDomNode} from 'vs/base/browser/styleMutator';

class CSSBasedConfigurationCache {

	private _keys: { [key: string]: BareFontInfo; };
	private _values: { [key: string]: FontInfo; };

	constructor() {
		this._keys = Object.create(null);
		this._values = Object.create(null);
	}

	public has(item: BareFontInfo): boolean {
		return !!this._values[item.getId()];
	}

	public get(item: BareFontInfo): FontInfo {
		return this._values[item.getId()];
	}

	public put(item: BareFontInfo, value: FontInfo): void {
		this._keys[item.getId()] = item;
		this._values[item.getId()] = value;
	}

	public getKeys(): BareFontInfo[] {
		return Object.keys(this._keys).map(id => this._keys[id]);
	}
}

class CharWidthReader {

	private _chr: string;
	private _width: number;

	public get width(): number { return this._width; }

	constructor(chr:string) {
		this._chr = chr;
		this._width = 0;
	}

	public render(out:HTMLSpanElement): void {
		if (this._chr === ' ') {
			let htmlString = '&nbsp;';
			// Repeat character 256 (2^8) times
			for (let i = 0; i < 8; i++) {
				htmlString += htmlString;
			}
			out.innerHTML = htmlString;
		} else {
			let testString = this._chr;
			// Repeat character 256 (2^8) times
			for (let i = 0; i < 8; i++) {
				testString += testString;
			}
			out.textContent = testString;
		}
	}

	public read(out:HTMLSpanElement): void {
		this._width = out.offsetWidth / 256;
	}
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
				readConfig.typicalHalfwidthCharacterWidth = Math.max(readConfig.typicalHalfwidthCharacterWidth, 5);
				readConfig.typicalFullwidthCharacterWidth = Math.max(readConfig.typicalFullwidthCharacterWidth, 5);
				readConfig.spaceWidth = Math.max(readConfig.spaceWidth, 5);
				readConfig.maxDigitWidth = Math.max(readConfig.maxDigitWidth, 5);
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

	private static _testElementId(index:number): string {
		return 'editorSizeProvider' + index;
	}

	private static _createTestElements(bareFontInfo: BareFontInfo, readers:CharWidthReader[]): HTMLElement {
		let container = document.createElement('div');
		Configuration.applyFontInfoSlow(container, bareFontInfo);
		container.style.position = 'absolute';
		container.style.top = '-50000px';
		container.style.width = '50000px';

		for (let i = 0, len = readers.length; i < len; i++) {
			container.appendChild(document.createElement('br'));

			let testElement = document.createElement('span');
			testElement.id = this._testElementId(i);
			readers[i].render(testElement);

			container.appendChild(testElement);
		}

		container.appendChild(document.createElement('br'));

		return container;
	}

	private static _readFromTestElements(readers:CharWidthReader[]): void {
		for (let i = 0, len = readers.length; i < len; i++) {
			readers[i].read(document.getElementById(this._testElementId(i)));
		}
	}

	private static _runReaders(bareFontInfo: BareFontInfo, readers:CharWidthReader[]): void {
		// Create a test container with all these test elements
		let testContainer = this._createTestElements(bareFontInfo, readers);

		// Add the container to the DOM
		document.body.appendChild(testContainer);

		// Read various properties
		this._readFromTestElements(readers);

		// Remove the container from the DOM
		document.body.removeChild(testContainer);
	}

	private static _actualReadConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		let typicalHalfwidthCharacter = new CharWidthReader('n');
		let typicalFullwidthCharacter = new CharWidthReader('\uff4d');
		let space = new CharWidthReader(' ');
		let digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(chr => new CharWidthReader(chr));

		this._runReaders(bareFontInfo, digits.concat([typicalHalfwidthCharacter, typicalFullwidthCharacter, space]));

		let maxDigitWidth = 0;
		for (let i = 0, len = digits.length; i < len; i++) {
			maxDigitWidth = Math.max(maxDigitWidth, digits[i].width);
		}

		return new FontInfo({
			fontFamily: bareFontInfo.fontFamily,
			fontWeight: bareFontInfo.fontWeight,
			fontSize: bareFontInfo.fontSize,
			lineHeight: bareFontInfo.lineHeight,
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

	constructor(options:any, referenceDomElement:HTMLElement = null) {
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

	public observeReferenceElement(dimension?:IDimension): void {
		this._elementSizeObserver.observe(dimension);
	}

	public dispose(): void {
		this._elementSizeObserver.dispose();
		super.dispose();
	}

	protected _getEditorClassName(theme:string, fontLigatures:boolean): string {
		let extra = '';
		if (browser.isIE11orEarlier) {
			extra += 'ie ';
		} else if (browser.isFirefox) {
			extra += 'ff ';
		} else if (browser.isEdge) {
			extra += 'edge ';
		}
		if (browser.isIE9) {
			extra += 'ie9 ';
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

	protected readConfiguration(bareFontInfo:BareFontInfo): FontInfo {
		return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
	}
}
