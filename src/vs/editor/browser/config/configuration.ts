/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import * as arrays from 'vs/base/common/arrays';
import { forEach } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { CharWidthRequest, CharWidthRequestType, readCharWidths } from 'vs/editor/browser/config/charWidthReader';
import { ElementSizeObserver } from 'vs/editor/browser/config/elementSizeObserver';
import { IEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { ComputeOptionsMemory, ConfigurationChangedEvent, EditorFontLigatures, EditorOption, editorOptionsRegistry, EDITOR_FONT_DEFAULTS, FindComputedEditorOptionValueById, IComputedEditorOptions, IEditorOptions, IEnvironmentalOptions, ValidatedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import { BareFontInfo, FontInfo, SERIALIZED_FONT_INFO_VERSION } from 'vs/editor/common/config/fontInfo';
import { IConfiguration, IDimension } from 'vs/editor/common/editorCommon';
import { AccessibilitySupport, IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

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
	readonly version: number;
	readonly zoomLevel: number;
	readonly pixelRatio: number;
	readonly fontFamily: string;
	readonly fontWeight: string;
	readonly fontSize: number;
	readonly fontFeatureSettings: string;
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

	public override dispose(): void {
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
		for (const item of values) {
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

	public restoreFontInfo(savedFontInfos: ISerializedFontInfo[]): void {
		// Take all the saved font info and insert them in the cache without the trusted flag.
		// The reason for this is that a font might have been installed on the OS in the meantime.
		for (const savedFontInfo of savedFontInfos) {
			if (savedFontInfo.version !== SERIALIZED_FONT_INFO_VERSION) {
				// cannot use older version
				continue;
			}
			const fontInfo = new FontInfo(savedFontInfo, false);
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
					pixelRatio: browser.getPixelRatio(),
					fontFamily: readConfig.fontFamily,
					fontWeight: readConfig.fontWeight,
					fontSize: readConfig.fontSize,
					fontFeatureSettings: readConfig.fontFeatureSettings,
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

		// U+00B7 - MIDDLE DOT
		const middot = this.createRequest('·', CharWidthRequestType.Regular, all, monospace);

		// U+2E31 - WORD SEPARATOR MIDDLE DOT
		const wsmiddotWidth = this.createRequest(String.fromCharCode(0x2E31), CharWidthRequestType.Regular, all, null);

		// monospace test: some characters
		const monospaceTestChars = '|/-_ilm%';
		for (let i = 0, len = monospaceTestChars.length; i < len; i++) {
			this.createRequest(monospaceTestChars.charAt(i), CharWidthRequestType.Regular, all, monospace);
			this.createRequest(monospaceTestChars.charAt(i), CharWidthRequestType.Italic, all, monospace);
			this.createRequest(monospaceTestChars.charAt(i), CharWidthRequestType.Bold, all, monospace);

		}

		readCharWidths(bareFontInfo, all);

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

		// let's trust the zoom level only 2s after it was changed.
		const canTrustBrowserZoomLevel = (browser.getTimeSinceLastZoomLevelChanged() > 2000);
		return new FontInfo({
			zoomLevel: browser.getZoomLevel(),
			pixelRatio: browser.getPixelRatio(),
			fontFamily: bareFontInfo.fontFamily,
			fontWeight: bareFontInfo.fontWeight,
			fontSize: bareFontInfo.fontSize,
			fontFeatureSettings: bareFontInfo.fontFeatureSettings,
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
		}, canTrustBrowserZoomLevel);
	}
}

export abstract class CommonEditorConfiguration extends Disposable implements IConfiguration {

	private _onDidChange = this._register(new Emitter<ConfigurationChangedEvent>());
	public readonly onDidChange: Event<ConfigurationChangedEvent> = this._onDidChange.event;

	private _onDidChangeFast = this._register(new Emitter<ConfigurationChangedEvent>());
	public readonly onDidChangeFast: Event<ConfigurationChangedEvent> = this._onDidChangeFast.event;

	public readonly isSimpleWidget: boolean;
	private _computeOptionsMemory: ComputeOptionsMemory;
	public options!: ComputedEditorOptions;

	private _isDominatedByLongLines: boolean;
	private _viewLineCount: number;
	private _lineNumbersDigitCount: number;

	private _rawOptions: IEditorOptions;
	private _readOptions: RawEditorOptions;
	protected _validatedOptions: ValidatedEditorOptions;
	private _reservedHeight: number = 0;

	constructor(isSimpleWidget: boolean, _options: Readonly<IEditorOptions>) {
		super();
		this.isSimpleWidget = isSimpleWidget;

		this._isDominatedByLongLines = false;
		this._computeOptionsMemory = new ComputeOptionsMemory();
		this._viewLineCount = 1;
		this._lineNumbersDigitCount = 1;

		this._rawOptions = deepCloneAndMigrateOptions(_options);
		this._readOptions = EditorConfiguration2.readOptions(this._rawOptions);
		this._validatedOptions = EditorConfiguration2.validateOptions(this._readOptions);

		this._register(EditorZoom.onDidChangeZoomLevel(_ => this._recomputeOptions()));
		this._register(TabFocus.onDidChangeTabFocus(_ => this._recomputeOptions()));
	}

	public observeReferenceElement(dimension?: IDimension): void {
	}

	public updatePixelRatio(): void {
	}

	protected _recomputeOptions(): void {
		const oldOptions = this.options;
		const newOptions = this._computeInternalOptions();

		if (!oldOptions) {
			this.options = newOptions;
		} else {
			const changeEvent = EditorConfiguration2.checkEquals(oldOptions, newOptions);

			if (changeEvent === null) {
				// nothing changed!
				return;
			}

			this.options = newOptions;
			this._onDidChangeFast.fire(changeEvent);
			this._onDidChange.fire(changeEvent);
		}
	}

	public getRawOptions(): IEditorOptions {
		return this._rawOptions;
	}

	private _computeInternalOptions(): ComputedEditorOptions {
		const partialEnv = this._getEnvConfiguration();
		const bareFontInfo = BareFontInfo.createFromValidatedSettings(this._validatedOptions, partialEnv.zoomLevel, partialEnv.pixelRatio, this.isSimpleWidget);
		const env: IEnvironmentalOptions = {
			memory: this._computeOptionsMemory,
			outerWidth: partialEnv.outerWidth,
			outerHeight: partialEnv.outerHeight - this._reservedHeight,
			fontInfo: this.readConfiguration(bareFontInfo),
			extraEditorClassName: partialEnv.extraEditorClassName,
			isDominatedByLongLines: this._isDominatedByLongLines,
			viewLineCount: this._viewLineCount,
			lineNumbersDigitCount: this._lineNumbersDigitCount,
			emptySelectionClipboard: partialEnv.emptySelectionClipboard,
			pixelRatio: partialEnv.pixelRatio,
			tabFocusMode: TabFocus.getTabFocusMode(),
			accessibilitySupport: partialEnv.accessibilitySupport
		};
		return EditorConfiguration2.computeOptions(this._validatedOptions, env);
	}

	public updateOptions(_newOptions: Readonly<IEditorOptions>): void {
		if (typeof _newOptions === 'undefined') {
			return;
		}
		const newOptions = deepCloneAndMigrateOptions(_newOptions);

		const didChange = EditorConfiguration2.applyUpdate(this._rawOptions, newOptions);
		if (!didChange) {
			return;
		}

		this._readOptions = EditorConfiguration2.readOptions(this._rawOptions);
		this._validatedOptions = EditorConfiguration2.validateOptions(this._readOptions);

		this._recomputeOptions();
	}

	public setIsDominatedByLongLines(isDominatedByLongLines: boolean): void {
		this._isDominatedByLongLines = isDominatedByLongLines;
		this._recomputeOptions();
	}

	public setMaxLineNumber(maxLineNumber: number): void {
		const lineNumbersDigitCount = CommonEditorConfiguration._digitCount(maxLineNumber);
		if (this._lineNumbersDigitCount === lineNumbersDigitCount) {
			return;
		}
		this._lineNumbersDigitCount = lineNumbersDigitCount;
		this._recomputeOptions();
	}

	public setViewLineCount(viewLineCount: number): void {
		if (this._viewLineCount === viewLineCount) {
			return;
		}
		this._viewLineCount = viewLineCount;
		this._recomputeOptions();
	}

	private static _digitCount(n: number): number {
		let r = 0;
		while (n) {
			n = Math.floor(n / 10);
			r++;
		}
		return r ? r : 1;
	}
	protected abstract _getEnvConfiguration(): IEnvConfiguration;

	protected abstract readConfiguration(styling: BareFontInfo): FontInfo;

	public reserveHeight(height: number) {
		this._reservedHeight = height;
		this._recomputeOptions();
	}
}

export class Configuration extends CommonEditorConfiguration {

	public static applyFontInfoSlow(domNode: HTMLElement, fontInfo: BareFontInfo): void {
		domNode.style.fontFamily = fontInfo.getMassagedFontFamily(browser.isSafari ? EDITOR_FONT_DEFAULTS.fontFamily : null);
		domNode.style.fontWeight = fontInfo.fontWeight;
		domNode.style.fontSize = fontInfo.fontSize + 'px';
		domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		domNode.style.lineHeight = fontInfo.lineHeight + 'px';
		domNode.style.letterSpacing = fontInfo.letterSpacing + 'px';
	}

	public static applyFontInfo(domNode: FastDomNode<HTMLElement>, fontInfo: BareFontInfo): void {
		domNode.setFontFamily(fontInfo.getMassagedFontFamily(browser.isSafari ? EDITOR_FONT_DEFAULTS.fontFamily : null));
		domNode.setFontWeight(fontInfo.fontWeight);
		domNode.setFontSize(fontInfo.fontSize);
		domNode.setFontFeatureSettings(fontInfo.fontFeatureSettings);
		domNode.setLineHeight(fontInfo.lineHeight);
		domNode.setLetterSpacing(fontInfo.letterSpacing);
	}

	private readonly _elementSizeObserver: ElementSizeObserver;

	constructor(
		isSimpleWidget: boolean,
		options: Readonly<IEditorConstructionOptions>,
		referenceDomElement: HTMLElement | null = null,
		private readonly accessibilityService: IAccessibilityService
	) {
		super(isSimpleWidget, options);

		this._elementSizeObserver = this._register(new ElementSizeObserver(referenceDomElement, options.dimension, () => this._recomputeOptions()));

		this._register(CSSBasedConfiguration.INSTANCE.onDidChange(() => this._recomputeOptions()));

		if (this._validatedOptions.get(EditorOption.automaticLayout)) {
			this._elementSizeObserver.startObserving();
		}

		this._register(browser.onDidChangeZoomLevel(_ => this._recomputeOptions()));
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._recomputeOptions()));

		this._recomputeOptions();
	}

	public override observeReferenceElement(dimension?: IDimension): void {
		this._elementSizeObserver.observe(dimension);
	}

	public override updatePixelRatio(): void {
		this._recomputeOptions();
	}

	private static _getExtraEditorClassName(): string {
		let extra = '';
		if (!browser.isSafari && !browser.isWebkitWebView) {
			// Use user-select: none in all browsers except Safari and native macOS WebView
			extra += 'no-user-select ';
		}
		if (browser.isSafari) {
			// See https://github.com/microsoft/vscode/issues/108822
			extra += 'no-minimap-shadow ';
		}
		if (platform.isMacintosh) {
			extra += 'mac ';
		}
		return extra;
	}

	protected _getEnvConfiguration(): IEnvConfiguration {
		return {
			extraEditorClassName: Configuration._getExtraEditorClassName(),
			outerWidth: this._elementSizeObserver.getWidth(),
			outerHeight: this._elementSizeObserver.getHeight(),
			emptySelectionClipboard: browser.isWebKit || browser.isFirefox,
			pixelRatio: browser.getPixelRatio(),
			zoomLevel: browser.getZoomLevel(),
			accessibilitySupport: (
				this.accessibilityService.isScreenReaderOptimized()
					? AccessibilitySupport.Enabled
					: this.accessibilityService.getAccessibilitySupport()
			)
		};
	}

	protected readConfiguration(bareFontInfo: BareFontInfo): FontInfo {
		return CSSBasedConfiguration.INSTANCE.readConfiguration(bareFontInfo);
	}
}

/**
 * Control what pressing Tab does.
 * If it is false, pressing Tab or Shift-Tab will be handled by the editor.
 * If it is true, pressing Tab or Shift-Tab will move the browser focus.
 * Defaults to false.
 */
export interface ITabFocus {
	onDidChangeTabFocus: Event<boolean>;
	getTabFocusMode(): boolean;
	setTabFocusMode(tabFocusMode: boolean): void;
}

export const TabFocus: ITabFocus = new class implements ITabFocus {
	private _tabFocus: boolean = false;

	private readonly _onDidChangeTabFocus = new Emitter<boolean>();
	public readonly onDidChangeTabFocus: Event<boolean> = this._onDidChangeTabFocus.event;

	public getTabFocusMode(): boolean {
		return this._tabFocus;
	}

	public setTabFocusMode(tabFocusMode: boolean): void {
		if (this._tabFocus === tabFocusMode) {
			return;
		}

		this._tabFocus = tabFocusMode;
		this._onDidChangeTabFocus.fire(this._tabFocus);
	}
};

export interface IEnvConfiguration {
	extraEditorClassName: string;
	outerWidth: number;
	outerHeight: number;
	emptySelectionClipboard: boolean;
	pixelRatio: number;
	zoomLevel: number;
	accessibilitySupport: AccessibilitySupport;
}


export class ComputedEditorOptions implements IComputedEditorOptions {
	private readonly _values: any[] = [];
	public _read<T>(id: EditorOption): T {
		if (id >= this._values.length) {
			throw new Error('Cannot read uninitialized value');
		}
		return this._values[id];
	}
	public get<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T> {
		return this._read(id);
	}
	public _write<T>(id: EditorOption, value: T): void {
		this._values[id] = value;
	}
}

class RawEditorOptions {
	private readonly _values: any[] = [];
	public _read<T>(id: EditorOption): T | undefined {
		return this._values[id];
	}
	public _write<T>(id: EditorOption, value: T | undefined): void {
		this._values[id] = value;
	}
}

class EditorConfiguration2 {
	public static readOptions(_options: IEditorOptions): RawEditorOptions {
		const options: { [key: string]: any; } = _options;
		const result = new RawEditorOptions();
		for (const editorOption of editorOptionsRegistry) {
			const value = (editorOption.name === '_never_' ? undefined : options[editorOption.name]);
			result._write(editorOption.id, value);
		}
		return result;
	}

	public static validateOptions(options: RawEditorOptions): ValidatedEditorOptions {
		const result = new ValidatedEditorOptions();
		for (const editorOption of editorOptionsRegistry) {
			result._write(editorOption.id, editorOption.validate(options._read(editorOption.id)));
		}
		return result;
	}

	public static computeOptions(options: ValidatedEditorOptions, env: IEnvironmentalOptions): ComputedEditorOptions {
		const result = new ComputedEditorOptions();
		for (const editorOption of editorOptionsRegistry) {
			result._write(editorOption.id, editorOption.compute(env, result, options._read(editorOption.id)));
		}
		return result;
	}

	private static _deepEquals<T>(a: T, b: T): boolean {
		if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) {
			return a === b;
		}
		if (Array.isArray(a) || Array.isArray(b)) {
			return (Array.isArray(a) && Array.isArray(b) ? arrays.equals(a, b) : false);
		}
		if (Object.keys(a).length !== Object.keys(b).length) {
			return false;
		}
		for (let key in a) {
			if (!EditorConfiguration2._deepEquals(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}

	public static checkEquals(a: ComputedEditorOptions, b: ComputedEditorOptions): ConfigurationChangedEvent | null {
		const result: boolean[] = [];
		let somethingChanged = false;
		for (const editorOption of editorOptionsRegistry) {
			const changed = !EditorConfiguration2._deepEquals(a._read(editorOption.id), b._read(editorOption.id));
			result[editorOption.id] = changed;
			if (changed) {
				somethingChanged = true;
			}
		}
		return (somethingChanged ? new ConfigurationChangedEvent(result) : null);
	}

	/**
	 * Returns true if something changed.
	 * Modifies `options`.
	*/
	public static applyUpdate(options: IEditorOptions, update: Readonly<IEditorOptions>): boolean {
		let changed = false;
		for (const editorOption of editorOptionsRegistry) {
			if (update.hasOwnProperty(editorOption.name)) {
				const result = editorOption.applyUpdate((options as any)[editorOption.name], (update as any)[editorOption.name]);
				(options as any)[editorOption.name] = result.newValue;
				changed = changed || result.didChange;
			}
		}
		return changed;
	}
}

/**
 * Compatibility with old options
 */
function migrateOptions(options: IEditorOptions): void {
	const wordWrap = options.wordWrap;
	if (<any>wordWrap === true) {
		options.wordWrap = 'on';
	} else if (<any>wordWrap === false) {
		options.wordWrap = 'off';
	}

	const lineNumbers = options.lineNumbers;
	if (<any>lineNumbers === true) {
		options.lineNumbers = 'on';
	} else if (<any>lineNumbers === false) {
		options.lineNumbers = 'off';
	}

	const autoClosingBrackets = options.autoClosingBrackets;
	if (<any>autoClosingBrackets === false) {
		options.autoClosingBrackets = 'never';
		options.autoClosingQuotes = 'never';
		options.autoSurround = 'never';
	}

	const cursorBlinking = options.cursorBlinking;
	if (<any>cursorBlinking === 'visible') {
		options.cursorBlinking = 'solid';
	}

	const renderWhitespace = options.renderWhitespace;
	if (<any>renderWhitespace === true) {
		options.renderWhitespace = 'boundary';
	} else if (<any>renderWhitespace === false) {
		options.renderWhitespace = 'none';
	}

	const renderLineHighlight = options.renderLineHighlight;
	if (<any>renderLineHighlight === true) {
		options.renderLineHighlight = 'line';
	} else if (<any>renderLineHighlight === false) {
		options.renderLineHighlight = 'none';
	}

	const acceptSuggestionOnEnter = options.acceptSuggestionOnEnter;
	if (<any>acceptSuggestionOnEnter === true) {
		options.acceptSuggestionOnEnter = 'on';
	} else if (<any>acceptSuggestionOnEnter === false) {
		options.acceptSuggestionOnEnter = 'off';
	}

	const tabCompletion = options.tabCompletion;
	if (<any>tabCompletion === false) {
		options.tabCompletion = 'off';
	} else if (<any>tabCompletion === true) {
		options.tabCompletion = 'onlySnippets';
	}

	const suggest = options.suggest;
	if (suggest && typeof (<any>suggest).filteredTypes === 'object' && (<any>suggest).filteredTypes) {
		const mapping: Record<string, string> = {};
		mapping['method'] = 'showMethods';
		mapping['function'] = 'showFunctions';
		mapping['constructor'] = 'showConstructors';
		mapping['deprecated'] = 'showDeprecated';
		mapping['field'] = 'showFields';
		mapping['variable'] = 'showVariables';
		mapping['class'] = 'showClasses';
		mapping['struct'] = 'showStructs';
		mapping['interface'] = 'showInterfaces';
		mapping['module'] = 'showModules';
		mapping['property'] = 'showProperties';
		mapping['event'] = 'showEvents';
		mapping['operator'] = 'showOperators';
		mapping['unit'] = 'showUnits';
		mapping['value'] = 'showValues';
		mapping['constant'] = 'showConstants';
		mapping['enum'] = 'showEnums';
		mapping['enumMember'] = 'showEnumMembers';
		mapping['keyword'] = 'showKeywords';
		mapping['text'] = 'showWords';
		mapping['color'] = 'showColors';
		mapping['file'] = 'showFiles';
		mapping['reference'] = 'showReferences';
		mapping['folder'] = 'showFolders';
		mapping['typeParameter'] = 'showTypeParameters';
		mapping['snippet'] = 'showSnippets';
		forEach(mapping, entry => {
			const value = (<any>suggest).filteredTypes[entry.key];
			if (value === false) {
				(<any>suggest)[entry.value] = value;
			}
		});
		// delete (<any>suggest).filteredTypes;
	}

	const hover = options.hover;
	if (<any>hover === true) {
		options.hover = {
			enabled: true
		};
	} else if (<any>hover === false) {
		options.hover = {
			enabled: false
		};
	}

	const parameterHints = options.parameterHints;
	if (<any>parameterHints === true) {
		options.parameterHints = {
			enabled: true
		};
	} else if (<any>parameterHints === false) {
		options.parameterHints = {
			enabled: false
		};
	}

	const autoIndent = options.autoIndent;
	if (<any>autoIndent === true) {
		options.autoIndent = 'full';
	} else if (<any>autoIndent === false) {
		options.autoIndent = 'advanced';
	}

	const matchBrackets = options.matchBrackets;
	if (<any>matchBrackets === true) {
		options.matchBrackets = 'always';
	} else if (<any>matchBrackets === false) {
		options.matchBrackets = 'never';
	}

	const { renderIndentGuides, highlightActiveIndentGuide } = options as any as {
		renderIndentGuides: boolean;
		highlightActiveIndentGuide: boolean;
	};
	if (!options.guides) {
		options.guides = {};
	}

	if (renderIndentGuides !== undefined) {
		options.guides.indentation = !!renderIndentGuides;
	}
	if (highlightActiveIndentGuide !== undefined) {
		options.guides.highlightActiveIndentation = !!highlightActiveIndentGuide;
	}
}

function deepCloneAndMigrateOptions(_options: Readonly<IEditorOptions>): IEditorOptions {
	const options = objects.deepClone(_options);
	migrateOptions(options);
	return options;
}
