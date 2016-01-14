/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Env = require('vs/base/common/platform');
import Browser = require('vs/base/browser/browser');
import Objects = require('vs/base/common/objects');
import EventEmitter = require('vs/base/common/eventEmitter');
import Strings = require('vs/base/common/strings');
import DomUtils = require('vs/base/browser/dom');

import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');

import EditorCommon = require('vs/editor/common/editorCommon');
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {HandlerDispatcher} from 'vs/editor/common/controller/handlerDispatcher';

import Config = require('vs/editor/common/config/config');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import ElementSizeObserver = require('vs/editor/browser/config/elementSizeObserver');

import {CommonEditorConfiguration, ICSSConfig} from 'vs/editor/common/config/commonEditorConfig';

interface ICSSBasedConfigurationChangeListener {
	(): void;
}

class CSSBasedConfigurationCache {

	private _keys: { [key: string]: EditorCommon.IEditorStyling; };
	private _values: { [key: string]: ICSSConfig; };

	constructor() {
		this._keys = {};
		this._values = {};
	}

	public has(item: EditorCommon.IEditorStyling): boolean {
		return this._values.hasOwnProperty(CSSBasedConfigurationCache.key(item));
	}

	public get(item: EditorCommon.IEditorStyling): ICSSConfig {
		return this._values[CSSBasedConfigurationCache.key(item)];
	}

	public put(item: EditorCommon.IEditorStyling, value: ICSSConfig): void {
		this._values[CSSBasedConfigurationCache.key(item)] = value;
	}

	public getKeys(): EditorCommon.IEditorStyling[]{
		var r: EditorCommon.IEditorStyling[] = [];
		for (var key in this._keys) {
			r.push(this._keys[key]);
		}
		return r;
	}

	private static key(item: EditorCommon.IEditorStyling): string {
		return item.editorClassName + '-' + item.fontFamily + '-' + item.fontSize + '-' + item.lineHeight;
	}

}

class CSSBasedConfiguration {

	private static _HALF_WIDTH_TYPICAL = 'n';
	private static _FULL_WIDTH_TYPICAL = '\uff4d';
	private static _USUAL_CHARS = '0123456789' + CSSBasedConfiguration._HALF_WIDTH_TYPICAL + CSSBasedConfiguration._FULL_WIDTH_TYPICAL;
	private static _CACHE = new CSSBasedConfigurationCache();

	private static _CHANGE_LISTENERS: ICSSBasedConfigurationChangeListener[] = [];

	public static readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig {
		var styling: EditorCommon.IEditorStyling = {
			editorClassName: editorClassName,
			fontFamily: fontFamily,
			fontSize: fontSize,
			lineHeight: lineHeight
		};
		if (!CSSBasedConfiguration._CACHE.has(styling)) {
			var readConfig = CSSBasedConfiguration._actualReadConfiguration(styling);

			if (readConfig.lineHeight <= 2 || readConfig.typicalHalfwidthCharacterWidth <= 2 || readConfig.typicalFullwidthCharacterWidth <= 2 || readConfig.maxDigitWidth <= 2) {
				// Hey, it's Bug 14341 ... we couldn't read
				readConfig.lineHeight = Math.max(readConfig.lineHeight, readConfig.fontSize, 5);
				readConfig.typicalHalfwidthCharacterWidth = Math.max(readConfig.typicalHalfwidthCharacterWidth, readConfig.fontSize, 5);
				readConfig.typicalFullwidthCharacterWidth = Math.max(readConfig.typicalFullwidthCharacterWidth, readConfig.fontSize, 5);
				readConfig.maxDigitWidth = Math.max(readConfig.maxDigitWidth, readConfig.fontSize, 5);
				CSSBasedConfiguration._installChangeMonitor();
			}

			CSSBasedConfiguration._CACHE.put(styling, readConfig);
		}
		return CSSBasedConfiguration._CACHE.get(styling);
	}

	private static _CHANGE_MONITOR_TIMEOUT: number = -1;
	private static _installChangeMonitor(): void {
		if (CSSBasedConfiguration._CHANGE_MONITOR_TIMEOUT === -1) {
			CSSBasedConfiguration._CHANGE_MONITOR_TIMEOUT = setTimeout(() => {
				CSSBasedConfiguration._CHANGE_MONITOR_TIMEOUT = -1;
				CSSBasedConfiguration._monitorForChanges();
			}, 500);
		}
	}

	private static _monitorForChanges(): void {
		var shouldInstallChangeMonitor = false;
		var keys = CSSBasedConfiguration._CACHE.getKeys();
		for (var i = 0; i < keys.length; i++) {
			var styling = keys[i];

			var newValue = CSSBasedConfiguration._actualReadConfiguration(styling);

			if (newValue.lineHeight <= 2 || newValue.typicalHalfwidthCharacterWidth <= 2 || newValue.typicalFullwidthCharacterWidth <= 2 || newValue.maxDigitWidth <= 2) {
				// We still couldn't read the CSS config
				shouldInstallChangeMonitor = true;
			} else {
				CSSBasedConfiguration._CACHE.put(styling, newValue);
				CSSBasedConfiguration._invokeChangeListeners();
			}
		}
		if (shouldInstallChangeMonitor) {
			CSSBasedConfiguration._installChangeMonitor();
		}
	}

	private static _invokeChangeListeners(): void {
		var listeners = CSSBasedConfiguration._CHANGE_LISTENERS.slice(0);
		for (var i = 0; i < listeners.length; i++) {
			listeners[i]();
		}
	}

	public static addChangeListener(listener: ICSSBasedConfigurationChangeListener): void {
		CSSBasedConfiguration._CHANGE_LISTENERS.push(listener);
	}

	public static removeChangeListener(listener: ICSSBasedConfigurationChangeListener): void {
		for (var i = 0; i < CSSBasedConfiguration._CHANGE_LISTENERS.length; i++) {
			if (CSSBasedConfiguration._CHANGE_LISTENERS[i] === listener) {
				CSSBasedConfiguration._CHANGE_LISTENERS.splice(i, 1);
				break;
			}
		}
	}

	private static _testElementId(index:number): string {
		return 'editorSizeProvider' + index;
	}

	private static _createTestElement(index:number, character:string): HTMLSpanElement {
		var r = document.createElement('span');
		r.id = CSSBasedConfiguration._testElementId(index);

		var testString = (character === ' ' ? '&nbsp;' : character);

		// Repeat character 256 (2^8) times
		for (var i = 0; i < 8; i++) {
			testString += testString;
		}

		r.textContent = testString;
		return r;
	}

	private static _createTestElements(styling: EditorCommon.IEditorStyling): HTMLElement {
		var container = document.createElement('div');
		Configuration.applyEditorStyling(container, styling);
		container.style.position = 'absolute';
		container.style.top = '-50000px';
		container.style.width = '50000px';

		for (var i = 0, len = CSSBasedConfiguration._USUAL_CHARS.length; i < len; i++) {
			container.appendChild(document.createElement('br'));
			container.appendChild(CSSBasedConfiguration._createTestElement(i, CSSBasedConfiguration._USUAL_CHARS[i]));
		}

		var heightTestElementId = CSSBasedConfiguration._testElementId(CSSBasedConfiguration._USUAL_CHARS.length);
		var heightTestElement = document.createElement('div');
		heightTestElement.id = heightTestElementId;
		heightTestElement.appendChild(document.createTextNode('heightTestContent'));

		container.appendChild(document.createElement('br'));
		container.appendChild(heightTestElement);

		return container;
	}

	private static _readTestElementWidth(index:number): number {
		return document.getElementById(CSSBasedConfiguration._testElementId(index)).offsetWidth / 256;
	}

	private static _readFromTestElements(): number[] {
		var r:number[] = [];

		for (var i = 0, len = CSSBasedConfiguration._USUAL_CHARS.length; i < len; i++) {
			r.push(CSSBasedConfiguration._readTestElementWidth(i));
		}

		return r;
	}

	private static _actualReadConfiguration(styling: EditorCommon.IEditorStyling): ICSSConfig {
		// Create a test container with all these test elements
		var testContainer = CSSBasedConfiguration._createTestElements(styling);

		// Add the container to the DOM
		document.body.appendChild(testContainer);

		// Read various properties
		var usualCharsWidths = CSSBasedConfiguration._readFromTestElements();
		var firstTestElement = document.getElementById(CSSBasedConfiguration._testElementId(0));
		var computedStyle = DomUtils.getComputedStyle(firstTestElement);
		var result_font = CSSBasedConfiguration._getFontFromComputedStyle(computedStyle);
		var result_fontSize = computedStyle ? parseInt(computedStyle.fontSize, 10) : 0;

		var heightTestElement = document.getElementById(CSSBasedConfiguration._testElementId(CSSBasedConfiguration._USUAL_CHARS.length));
		var result_lineHeight = heightTestElement.clientHeight;


		// Remove the container from the DOM
		document.body.removeChild(testContainer);

		// Find maximum digit width and thinnest character width
		var maxDigitWidth = 0,
			typicalHalfwidthCharacterWidth = 0,
			typicalFullwidthCharacterWidth = 0;

		for (var i = 0, len = CSSBasedConfiguration._USUAL_CHARS.length; i < len; i++) {
			var character = CSSBasedConfiguration._USUAL_CHARS.charAt(i);

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

interface ICSSConfigMap {
	[key:string]:ICSSConfig;
}


export class Configuration extends CommonEditorConfiguration {

	public static applyEditorStyling(domNode: HTMLElement, styling: EditorCommon.IEditorStyling): void {
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

	private _cssBasedConfigurationChangeListener: () => void;
	private _elementSizeObserver: ElementSizeObserver.ElementSizeObserver;

	constructor(options:any, referenceDomElement:HTMLElement = null, indentationGuesser:(tabSize:number)=>EditorCommon.IGuessedIndentation = null) {
		this._elementSizeObserver = new ElementSizeObserver.ElementSizeObserver(referenceDomElement, () => this._onReferenceDomElementSizeChanged());

		super(options, indentationGuesser);

		this._cssBasedConfigurationChangeListener = () => this._onCSSBasedConfigurationChanged();
		CSSBasedConfiguration.addChangeListener(this._cssBasedConfigurationChangeListener);

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

	public observeReferenceElement(dimension?:EditorCommon.IDimension): void {
		this._elementSizeObserver.observe(dimension);
	}

	public dispose(): void {
		CSSBasedConfiguration.removeChangeListener(this._cssBasedConfigurationChangeListener);
		this._elementSizeObserver.dispose();
		super.dispose();
	}

	protected _getEditorClassName(theme:string, fontLigatures:boolean): string {
		var extra = '';
		if (Browser.isIE11orEarlier) {
			extra += 'ie ';
		} else if (Browser.isFirefox) {
			extra += 'ff ';
		}
		if (Browser.isIE9) {
			extra += 'ie9 ';
		}
		if (Env.isMacintosh) {
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
		return CSSBasedConfiguration.readConfiguration(editorClassName, fontFamily, fontSize, lineHeight);
	}
}
