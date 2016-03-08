/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {Disposable} from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import {CommonEditorConfiguration, ICSSConfig} from 'vs/editor/common/config/commonEditorConfig';
import {IDimension, IEditorStyling} from 'vs/editor/common/editorCommon';
import {ElementSizeObserver} from 'vs/editor/browser/config/elementSizeObserver';

class CSSBasedConfigurationCache {

	private _keys: { [key: string]: IEditorStyling; };
	private _values: { [key: string]: ICSSConfig; };

	constructor() {
		this._keys = {};
		this._values = {};
	}

	public has(item: IEditorStyling): boolean {
		return this._values.hasOwnProperty(CSSBasedConfigurationCache._key(item));
	}

	public get(item: IEditorStyling): ICSSConfig {
		return this._values[CSSBasedConfigurationCache._key(item)];
	}

	public put(item: IEditorStyling, value: ICSSConfig): void {
		this._values[CSSBasedConfigurationCache._key(item)] = value;
	}

	public getKeys(): IEditorStyling[] {
		let r: IEditorStyling[] = [];
		for (let key in this._keys) {
			r.push(this._keys[key]);
		}
		return r;
	}

	private static _key(item: IEditorStyling): string {
		return item.editorClassName + '-' + item.fontFamily + '-' + item.fontSize + '-' + item.lineHeight;
	}
}

class CSSBasedConfiguration extends Disposable {

	public static INSTANCE = new CSSBasedConfiguration();

	private static _HALF_WIDTH_TYPICAL = 'n';
	private static _FULL_WIDTH_TYPICAL = '\uff4d';
	private static _USUAL_CHARS = '0123456789' + CSSBasedConfiguration._HALF_WIDTH_TYPICAL + CSSBasedConfiguration._FULL_WIDTH_TYPICAL;

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

	public readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig {
		let styling: IEditorStyling = {
			editorClassName: editorClassName,
			fontFamily: fontFamily,
			fontSize: fontSize,
			lineHeight: lineHeight
		};
		if (!this._cache.has(styling)) {
			let readConfig = CSSBasedConfiguration._actualReadConfiguration(styling);

			if (readConfig.lineHeight <= 2 || readConfig.typicalHalfwidthCharacterWidth <= 2 || readConfig.typicalFullwidthCharacterWidth <= 2 || readConfig.maxDigitWidth <= 2) {
				// Hey, it's Bug 14341 ... we couldn't read
				readConfig.lineHeight = Math.max(readConfig.lineHeight, readConfig.fontSize, 5);
				readConfig.typicalHalfwidthCharacterWidth = Math.max(readConfig.typicalHalfwidthCharacterWidth, readConfig.fontSize, 5);
				readConfig.typicalFullwidthCharacterWidth = Math.max(readConfig.typicalFullwidthCharacterWidth, readConfig.fontSize, 5);
				readConfig.maxDigitWidth = Math.max(readConfig.maxDigitWidth, readConfig.fontSize, 5);
				this._installChangeMonitor();
			}

			this._cache.put(styling, readConfig);
		}
		return this._cache.get(styling);
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

			if (newValue.lineHeight <= 2 || newValue.typicalHalfwidthCharacterWidth <= 2 || newValue.typicalFullwidthCharacterWidth <= 2 || newValue.maxDigitWidth <= 2) {
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

	private static _createTestElement(index:number, character:string): HTMLSpanElement {
		let r = document.createElement('span');
		r.id = this._testElementId(index);

		let testString = (character === ' ' ? '&nbsp;' : character);

		// Repeat character 256 (2^8) times
		for (let i = 0; i < 8; i++) {
			testString += testString;
		}

		r.textContent = testString;
		return r;
	}

	private static _createTestElements(styling: IEditorStyling): HTMLElement {
		let container = document.createElement('div');
		Configuration.applyEditorStyling(container, styling);
		container.style.position = 'absolute';
		container.style.top = '-50000px';
		container.style.width = '50000px';

		for (let i = 0, len = CSSBasedConfiguration._USUAL_CHARS.length; i < len; i++) {
			container.appendChild(document.createElement('br'));
			container.appendChild(this._createTestElement(i, CSSBasedConfiguration._USUAL_CHARS[i]));
		}

		let heightTestElementId = this._testElementId(CSSBasedConfiguration._USUAL_CHARS.length);
		let heightTestElement = document.createElement('div');
		heightTestElement.id = heightTestElementId;
		heightTestElement.appendChild(document.createTextNode('heightTestContent'));

		container.appendChild(document.createElement('br'));
		container.appendChild(heightTestElement);

		return container;
	}

	private static _readFromTestElements(): number[] {
		let r:number[] = [];

		for (let i = 0, len = CSSBasedConfiguration._USUAL_CHARS.length; i < len; i++) {
			r.push(document.getElementById(this._testElementId(i)).offsetWidth / 256);
		}

		return r;
	}

	private static _actualReadConfiguration(styling: IEditorStyling): ICSSConfig {
		// Create a test container with all these test elements
		let testContainer = this._createTestElements(styling);

		// Add the container to the DOM
		document.body.appendChild(testContainer);

		// Read various properties
		let usualCharsWidths = this._readFromTestElements();
		let firstTestElement = document.getElementById(this._testElementId(0));
		let computedStyle = dom.getComputedStyle(firstTestElement);
		let result_font = this._getFontFromComputedStyle(computedStyle);
		let result_fontSize = computedStyle ? parseInt(computedStyle.fontSize, 10) : 0;

		let heightTestElement = document.getElementById(this._testElementId(CSSBasedConfiguration._USUAL_CHARS.length));
		let result_lineHeight = heightTestElement.clientHeight;


		// Remove the container from the DOM
		document.body.removeChild(testContainer);

		// Find maximum digit width and thinnest character width
		let maxDigitWidth = 0,
			typicalHalfwidthCharacterWidth = 0,
			typicalFullwidthCharacterWidth = 0;

		for (let i = 0, len = CSSBasedConfiguration._USUAL_CHARS.length; i < len; i++) {
			let character = CSSBasedConfiguration._USUAL_CHARS.charAt(i);

			if (character >= '0' && character <= '9') {
				maxDigitWidth = Math.max(maxDigitWidth, usualCharsWidths[i]);
				// this is a digit
			} else if (character === CSSBasedConfiguration._HALF_WIDTH_TYPICAL) {
				typicalHalfwidthCharacterWidth = usualCharsWidths[i];
			} else if (character === CSSBasedConfiguration._FULL_WIDTH_TYPICAL) {
				typicalFullwidthCharacterWidth = usualCharsWidths[i];
			}
		}

		return {
			typicalHalfwidthCharacterWidth: typicalHalfwidthCharacterWidth,
			typicalFullwidthCharacterWidth: typicalFullwidthCharacterWidth,
			maxDigitWidth: maxDigitWidth,
			lineHeight: result_lineHeight,
			font: result_font,
			fontSize: result_fontSize
		};
	}

	private static _getFontFromComputedStyle(computedStyle:CSSStyleDeclaration): string {
		if (!computedStyle) {
			return 'unknown';
		}
		if (computedStyle.font) {
			return computedStyle.font;
		}
		return (computedStyle.fontFamily + ' ' +
			computedStyle.fontSize + ' ' +
			computedStyle.fontSizeAdjust + ' ' +
			computedStyle.fontStretch + ' ' +
			computedStyle.fontStyle + ' ' +
			computedStyle.fontVariant + ' ' +
			computedStyle.fontWeight + ' ');
	}
}

export class Configuration extends CommonEditorConfiguration {

	public static applyEditorStyling(domNode: HTMLElement, styling: IEditorStyling): void {
		domNode.className = styling.editorClassName;
		if (styling.fontFamily && styling.fontFamily.length > 0) {
			domNode.style.fontFamily = styling.fontFamily;
		} else {
			domNode.style.fontFamily = '';
		}
		if (styling.fontSize > 0) {
			domNode.style.fontSize = styling.fontSize + 'px';
		} else {
			domNode.style.fontSize = '';
		}
		if (styling.lineHeight > 0) {
			domNode.style.lineHeight = styling.lineHeight + 'px';
		} else {
			domNode.style.lineHeight = '';
		}
	}

	constructor(options:any, referenceDomElement:HTMLElement = null) {
		super(options, new ElementSizeObserver(referenceDomElement, () => this._onReferenceDomElementSizeChanged()));

		this._register(CSSBasedConfiguration.INSTANCE.onDidChange(() => () => this._onCSSBasedConfigurationChanged()));

		if (this._configWithDefaults.getEditorOptions().automaticLayout) {
			this._elementSizeObserver.startObserving();
		}
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

	protected readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig {
		return CSSBasedConfiguration.INSTANCE.readConfiguration(editorClassName, fontFamily, fontSize, lineHeight);
	}
}
