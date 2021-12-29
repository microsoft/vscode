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
import { ElementSizeObserver } from 'vs/editor/browser/config/elementSizeObserver';
import { FontMeasurements } from 'vs/editor/browser/config/fontMeasurements';
import { TabFocus } from 'vs/editor/browser/config/tabFocus';
import { IEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { ComputeOptionsMemory, ConfigurationChangedEvent, EditorOption, editorOptionsRegistry, EDITOR_FONT_DEFAULTS, FindComputedEditorOptionValueById, IComputedEditorOptions, IEditorOptions, IEnvironmentalOptions, ValidatedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import { BareFontInfo, FontInfo } from 'vs/editor/common/config/fontInfo';
import { IConfiguration, IDimension } from 'vs/editor/common/editorCommon';
import { AccessibilitySupport, IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

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

		this._register(FontMeasurements.onDidChange(() => this._recomputeOptions()));

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
		return FontMeasurements.readFontInfo(bareFontInfo);
	}
}

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
