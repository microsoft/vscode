/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Objects = require('vs/base/common/objects');
import {EventEmitter} from 'vs/base/common/eventEmitter';
import Strings = require('vs/base/common/strings');
import {Registry} from 'vs/platform/platform';
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');
import EditorCommon = require('vs/editor/common/editorCommon');
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {HandlerDispatcher} from 'vs/editor/common/controller/handlerDispatcher';
import {EditorLayoutProvider} from 'vs/editor/common/viewLayout/editorLayoutProvider';

export class ConfigurationWithDefaults {

	private _editor:EditorCommon.IEditorOptions;

	constructor(options:EditorCommon.IEditorOptions) {
		this._editor = <EditorCommon.IEditorOptions>Objects.clone(DefaultConfig.editor);

		this._mergeOptionsIn(options);
	}

	public getEditorOptions(): EditorCommon.IEditorOptions {
		return this._editor;
	}

	private _mergeOptionsIn(newOptions:EditorCommon.IEditorOptions): void {
		this._editor = Objects.mixin(this._editor, newOptions || {});
	}

	public updateOptions(newOptions:EditorCommon.IEditorOptions): void {
		// Apply new options
		this._mergeOptionsIn(newOptions);
	}
}

class InternalEditorOptionsHelper {

	constructor() {
	}

	public static createInternalEditorOptions(
		outerWidth:number,
		outerHeight:number,
		opts:EditorCommon.IEditorOptions,
		editorClassName:string,
		requestedFontFamily:string,
		requestedFontSize:number,
		requestedLineHeight:number,
		adjustedLineHeight:number,
		themeOpts: ICSSConfig,
		isDominatedByLongLines:boolean,
		lineCount: number,
		indentationOptions: EditorCommon.IInternalIndentationOptions
	): EditorCommon.IInternalEditorOptions {

		let wrappingColumn = toInteger(opts.wrappingColumn, -1);

		let stopLineTokenizationAfter:number;
		if (typeof opts.stopLineTokenizationAfter !== 'undefined') {
			stopLineTokenizationAfter = toInteger(opts.stopLineTokenizationAfter, -1);
		} else if (wrappingColumn >= 0) {
			stopLineTokenizationAfter = -1;
		} else {
			stopLineTokenizationAfter = 10000;
		}

		let stopRenderingLineAfter:number;
		if (typeof opts.stopRenderingLineAfter !== 'undefined') {
			stopRenderingLineAfter = toInteger(opts.stopRenderingLineAfter, -1);
		} else if (wrappingColumn >= 0) {
			stopRenderingLineAfter = -1;
		} else {
			stopRenderingLineAfter = 10000;
		}

		let mouseWheelScrollSensitivity = toFloat(opts.mouseWheelScrollSensitivity, 1);
		let scrollbar = this._sanitizeScrollbarOpts(opts.scrollbar, mouseWheelScrollSensitivity);

		let glyphMargin = toBoolean(opts.glyphMargin);
		let lineNumbers = opts.lineNumbers;
		let lineNumbersMinChars = toInteger(opts.lineNumbersMinChars, 1);
		let lineDecorationsWidth = toInteger(opts.lineDecorationsWidth, 0);
		let layoutInfo = EditorLayoutProvider.compute({
			outerWidth: outerWidth,
			outerHeight: outerHeight,
			showGlyphMargin: glyphMargin,
			lineHeight: themeOpts.lineHeight,
			showLineNumbers: !!lineNumbers,
			lineNumbersMinChars: lineNumbersMinChars,
			lineDecorationsWidth: lineDecorationsWidth,
			maxDigitWidth: themeOpts.maxDigitWidth,
			lineCount: lineCount,
			verticalScrollbarWidth: scrollbar.verticalScrollbarSize,
			horizontalScrollbarHeight: scrollbar.horizontalScrollbarSize,
			scrollbarArrowSize: scrollbar.arrowSize,
			verticalScrollbarHasArrows: scrollbar.verticalHasArrows
		});

		let pageSize = Math.floor(layoutInfo.height / themeOpts.lineHeight) - 2;

		if (isDominatedByLongLines && wrappingColumn > 0) {
			// Force viewport width wrapping if model is dominated by long lines
			wrappingColumn = 0;
		}

		let wrappingInfo: EditorCommon.IEditorWrappingInfo;

		if (wrappingColumn === 0) {
			// If viewport width wrapping is enabled
			wrappingInfo = {
				isViewportWrapping: true,
				wrappingColumn: Math.max(1, Math.floor((layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth) / themeOpts.typicalHalfwidthCharacterWidth))
			};
		} else if (wrappingColumn > 0) {
			// Wrapping is enabled
			wrappingInfo = {
				isViewportWrapping: false,
				wrappingColumn: wrappingColumn
			};
		} else {
			wrappingInfo = {
				isViewportWrapping: false,
				wrappingColumn: -1
			};
		}

		return {
			// ---- Options that are transparent - get no massaging
			lineNumbers: lineNumbers,
			selectOnLineNumbers: toBoolean(opts.selectOnLineNumbers),
			glyphMargin: glyphMargin,
			revealHorizontalRightPadding: toInteger(opts.revealHorizontalRightPadding, 0),
			roundedSelection: toBoolean(opts.roundedSelection),
			theme: opts.theme,
			readOnly: toBoolean(opts.readOnly),
			scrollbar: scrollbar,
			overviewRulerLanes: toInteger(opts.overviewRulerLanes, 0, 3),
			cursorBlinking: opts.cursorBlinking,
			cursorStyle: opts.cursorStyle,
			hideCursorInOverviewRuler: toBoolean(opts.hideCursorInOverviewRuler),
			scrollBeyondLastLine: toBoolean(opts.scrollBeyondLastLine),
			wrappingIndent: opts.wrappingIndent,
			wordWrapBreakBeforeCharacters: opts.wordWrapBreakBeforeCharacters,
			wordWrapBreakAfterCharacters: opts.wordWrapBreakAfterCharacters,
			wordWrapBreakObtrusiveCharacters: opts.wordWrapBreakObtrusiveCharacters,
			tabFocusMode: toBoolean(opts.tabFocusMode),
			stopLineTokenizationAfter: stopLineTokenizationAfter,
			stopRenderingLineAfter: stopRenderingLineAfter,
			longLineBoundary: toInteger(opts.longLineBoundary),
			forcedTokenizationBoundary: toInteger(opts.forcedTokenizationBoundary),

			hover: toBoolean(opts.hover),
			contextmenu: toBoolean(opts.contextmenu),
			quickSuggestions: toBoolean(opts.quickSuggestions),
			quickSuggestionsDelay: toInteger(opts.quickSuggestionsDelay),
			iconsInSuggestions: toBoolean(opts.iconsInSuggestions),
			autoClosingBrackets: toBoolean(opts.autoClosingBrackets),
			formatOnType: toBoolean(opts.formatOnType),
			suggestOnTriggerCharacters: toBoolean(opts.suggestOnTriggerCharacters),
			selectionHighlight: toBoolean(opts.selectionHighlight),
			outlineMarkers: toBoolean(opts.outlineMarkers),
			referenceInfos: toBoolean(opts.referenceInfos),
			renderWhitespace: toBoolean(opts.renderWhitespace),

			layoutInfo: layoutInfo,
			stylingInfo: {
				editorClassName: editorClassName,
				fontFamily: requestedFontFamily,
				fontSize: requestedFontSize,
				lineHeight: adjustedLineHeight
			},
			wrappingInfo: wrappingInfo,
			indentInfo: indentationOptions,

			observedOuterWidth: outerWidth,
			observedOuterHeight: outerHeight,

			lineHeight: themeOpts.lineHeight,

			pageSize: pageSize,

			typicalHalfwidthCharacterWidth: themeOpts.typicalHalfwidthCharacterWidth,
			typicalFullwidthCharacterWidth: themeOpts.typicalFullwidthCharacterWidth,

			fontSize: themeOpts.fontSize,
		};
	}

	private static _sanitizeScrollbarOpts(raw:EditorCommon.IEditorScrollbarOptions, mouseWheelScrollSensitivity:number): EditorCommon.IInternalEditorScrollbarOptions {
		var horizontalScrollbarSize = toIntegerWithDefault(raw.horizontalScrollbarSize, 10);
		var verticalScrollbarSize = toIntegerWithDefault(raw.verticalScrollbarSize, 14);
		return {
			vertical: toStringSet(raw.vertical, ['auto', 'visible', 'hidden'], 'auto'),
			horizontal: toStringSet(raw.horizontal, ['auto', 'visible', 'hidden'], 'auto'),

			arrowSize: toIntegerWithDefault(raw.arrowSize, 11),
			useShadows: toBooleanWithDefault(raw.useShadows, true),

			verticalHasArrows: toBooleanWithDefault(raw.verticalHasArrows, false),
			horizontalHasArrows: toBooleanWithDefault(raw.horizontalHasArrows, false),

			horizontalScrollbarSize: horizontalScrollbarSize,
			horizontalSliderSize: toIntegerWithDefault(raw.horizontalSliderSize, horizontalScrollbarSize),

			verticalScrollbarSize: verticalScrollbarSize,
			verticalSliderSize: toIntegerWithDefault(raw.verticalSliderSize, verticalScrollbarSize),

			handleMouseWheel: toBooleanWithDefault(raw.handleMouseWheel, true),
			mouseWheelScrollSensitivity: mouseWheelScrollSensitivity
		};
	}

	public static createConfigurationChangedEvent(prevOpts:EditorCommon.IInternalEditorOptions, newOpts:EditorCommon.IInternalEditorOptions): EditorCommon.IConfigurationChangedEvent {
		return {
			layoutInfo: 					(!EditorLayoutProvider.layoutEqual(prevOpts.layoutInfo, newOpts.layoutInfo)),
			stylingInfo: 					(!this._stylingInfoEqual(prevOpts.stylingInfo, newOpts.stylingInfo)),
			wrappingInfo:					(!this._wrappingInfoEqual(prevOpts.wrappingInfo, newOpts.wrappingInfo)),
			indentInfo:						(!this._indentInfoEqual(prevOpts.indentInfo, newOpts.indentInfo)),
			observedOuterWidth:				(prevOpts.observedOuterWidth !== newOpts.observedOuterWidth),
			observedOuterHeight:			(prevOpts.observedOuterHeight !== newOpts.observedOuterHeight),
			lineHeight:						(prevOpts.lineHeight !== newOpts.lineHeight),
			pageSize:						(prevOpts.pageSize !== newOpts.pageSize),
			typicalHalfwidthCharacterWidth:	(prevOpts.typicalHalfwidthCharacterWidth !== newOpts.typicalHalfwidthCharacterWidth),
			typicalFullwidthCharacterWidth:	(prevOpts.typicalFullwidthCharacterWidth !== newOpts.typicalFullwidthCharacterWidth),
			fontSize:						(prevOpts.fontSize !== newOpts.fontSize),
			lineNumbers:					(prevOpts.lineNumbers !== newOpts.lineNumbers),
			selectOnLineNumbers:			(prevOpts.selectOnLineNumbers !== newOpts.selectOnLineNumbers),
			glyphMargin:					(prevOpts.glyphMargin !== newOpts.glyphMargin),
			revealHorizontalRightPadding:	(prevOpts.revealHorizontalRightPadding !== newOpts.revealHorizontalRightPadding),
			roundedSelection:				(prevOpts.roundedSelection !== newOpts.roundedSelection),
			theme:							(prevOpts.theme !== newOpts.theme),
			readOnly:						(prevOpts.readOnly !== newOpts.readOnly),
			scrollbar:						(!this._scrollbarOptsEqual(prevOpts.scrollbar, newOpts.scrollbar)),
			overviewRulerLanes:				(prevOpts.overviewRulerLanes !== newOpts.overviewRulerLanes),
			cursorBlinking:					(prevOpts.cursorBlinking !== newOpts.cursorBlinking),
			cursorStyle:					(prevOpts.cursorStyle !== newOpts.cursorStyle),
			hideCursorInOverviewRuler:		(prevOpts.hideCursorInOverviewRuler !== newOpts.hideCursorInOverviewRuler),
			scrollBeyondLastLine:			(prevOpts.scrollBeyondLastLine !== newOpts.scrollBeyondLastLine),
			wrappingIndent:					(prevOpts.wrappingIndent !== newOpts.wrappingIndent),
			wordWrapBreakBeforeCharacters:	(prevOpts.wordWrapBreakBeforeCharacters !== newOpts.wordWrapBreakBeforeCharacters),
			wordWrapBreakAfterCharacters:	(prevOpts.wordWrapBreakAfterCharacters !== newOpts.wordWrapBreakAfterCharacters),
			wordWrapBreakObtrusiveCharacters:(prevOpts.wordWrapBreakObtrusiveCharacters !== newOpts.wordWrapBreakObtrusiveCharacters),
			tabFocusMode:					(prevOpts.tabFocusMode !== newOpts.tabFocusMode),
			stopLineTokenizationAfter:		(prevOpts.stopLineTokenizationAfter !== newOpts.stopLineTokenizationAfter),
			stopRenderingLineAfter:			(prevOpts.stopRenderingLineAfter !== newOpts.stopRenderingLineAfter),
			longLineBoundary:				(prevOpts.longLineBoundary !== newOpts.longLineBoundary),
			forcedTokenizationBoundary:		(prevOpts.forcedTokenizationBoundary !== newOpts.forcedTokenizationBoundary),
			hover:							(prevOpts.hover !== newOpts.hover),
			contextmenu:					(prevOpts.contextmenu !== newOpts.contextmenu),
			quickSuggestions:				(prevOpts.quickSuggestions !== newOpts.quickSuggestions),
			quickSuggestionsDelay:			(prevOpts.quickSuggestionsDelay !== newOpts.quickSuggestionsDelay),
			iconsInSuggestions:				(prevOpts.iconsInSuggestions !== newOpts.iconsInSuggestions),
			autoClosingBrackets:			(prevOpts.autoClosingBrackets !== newOpts.autoClosingBrackets),
			formatOnType:					(prevOpts.formatOnType !== newOpts.formatOnType),
			suggestOnTriggerCharacters:		(prevOpts.suggestOnTriggerCharacters !== newOpts.suggestOnTriggerCharacters),
			selectionHighlight:				(prevOpts.selectionHighlight !== newOpts.selectionHighlight),
			outlineMarkers:					(prevOpts.outlineMarkers !== newOpts.outlineMarkers),
			referenceInfos:					(prevOpts.referenceInfos !== newOpts.referenceInfos)
		};
	}

	private static _scrollbarOptsEqual(a:EditorCommon.IInternalEditorScrollbarOptions, b:EditorCommon.IInternalEditorScrollbarOptions): boolean {
		return (
			a.arrowSize === b.arrowSize
			&& a.vertical === b.vertical
			&& a.horizontal === b.horizontal
			&& a.useShadows === b.useShadows
			&& a.verticalHasArrows === b.verticalHasArrows
			&& a.horizontalHasArrows === b.horizontalHasArrows
			&& a.handleMouseWheel === b.handleMouseWheel
			&& a.horizontalScrollbarSize === b.horizontalScrollbarSize
			&& a.horizontalSliderSize === b.horizontalSliderSize
			&& a.verticalScrollbarSize === b.verticalScrollbarSize
			&& a.verticalSliderSize === b.verticalSliderSize
			&& a.mouseWheelScrollSensitivity === b.mouseWheelScrollSensitivity
		);
	}

	private static _stylingInfoEqual(a:EditorCommon.IEditorStyling, b:EditorCommon.IEditorStyling): boolean {
		return (
			a.editorClassName === b.editorClassName
			&& a.fontFamily === b.fontFamily
			&& a.fontSize === b.fontSize
			&& a.lineHeight === b.lineHeight
		);
	}

	private static _wrappingInfoEqual(a:EditorCommon.IEditorWrappingInfo, b:EditorCommon.IEditorWrappingInfo): boolean {
		return (
			a.isViewportWrapping === b.isViewportWrapping
			&& a.wrappingColumn === b.wrappingColumn
		);
	}

	private static _indentInfoEqual(a:EditorCommon.IInternalIndentationOptions, b:EditorCommon.IInternalIndentationOptions): boolean {
		return (
			a.insertSpaces === b.insertSpaces
			&& a.tabSize === b.tabSize
		);
	}
}

export interface ICSSConfig {
	typicalHalfwidthCharacterWidth:number;
	typicalFullwidthCharacterWidth:number;
	maxDigitWidth: number;
	lineHeight:number;
	font:string;
	fontSize:number;
}

function toBoolean(value:any): boolean {
	return value === 'false' ? false : Boolean(value);
}

function toBooleanWithDefault(value:any, defaultValue:boolean): boolean {
	if (typeof value === 'undefined') {
		return defaultValue;
	}
	return toBoolean(value);
}

function toFloat(source: any, defaultValue: number): number {
	var r = parseFloat(source);
	if (isNaN(r)) {
		r = defaultValue;
	}
	return r;
}

function toInteger(source:any, minimum?:number, maximum?:number): number {
	var r = parseInt(source, 10);
	if (isNaN(r)) {
		r = 0;
	}
	if (typeof minimum === 'number') {
		r = Math.max(minimum, r);
	}
	if (typeof maximum === 'number') {
		r = Math.min(maximum, r);
	}
	return r;
}

function toIntegerWithDefault(source:any, defaultValue:number): number {
	if (typeof source === 'undefined') {
		return defaultValue;
	}
	return toInteger(source);
}

function toStringSet(source:any, allowedValues:string[], defaultValue:string): string {
	if (typeof source !== 'string') {
		return defaultValue;
	}
	if (allowedValues.indexOf(source) === -1) {
		return defaultValue;
	}
	return source;
}

interface IValidatedIndentationOptions {
	tabSizeIsAuto: boolean;
	tabSize: number;
	insertSpacesIsAuto: boolean;
	insertSpaces: boolean;
}

export interface IIndentationGuesser {
	(tabSize:number): EditorCommon.IGuessedIndentation;
}

export class CommonEditorConfiguration extends EventEmitter implements EditorCommon.IConfiguration {

	public handlerDispatcher:EditorCommon.IHandlerDispatcher;
	public editor:EditorCommon.IInternalEditorOptions;

	protected _configWithDefaults:ConfigurationWithDefaults;
	private _indentationGuesser:IIndentationGuesser;
	private _cachedGuessedIndentationTabSize: number;
	private _cachedGuessedIndentation:EditorCommon.IGuessedIndentation;
	private _isDominatedByLongLines:boolean;
	private _lineCount:number;

	constructor(options:any, indentationGuesser:IIndentationGuesser = null) {
		super([
			EditorCommon.EventType.ConfigurationChanged
		]);
		this._configWithDefaults = new ConfigurationWithDefaults(options);
		this._indentationGuesser = indentationGuesser;
		this._cachedGuessedIndentationTabSize = -1;
		this._cachedGuessedIndentation = null;
		this._isDominatedByLongLines = false;
		this._lineCount = 1;

		this.handlerDispatcher = new HandlerDispatcher();

		this.editor = this._computeInternalOptions();
	}

	public dispose(): void {
		super.dispose();
	}

	protected _recomputeOptions(): void {
		let oldOpts = this.editor;
		this.editor = this._computeInternalOptions();

		let changeEvent = InternalEditorOptionsHelper.createConfigurationChangedEvent(oldOpts, this.editor);

		let hasChanged = false;
		for (let key in changeEvent) {
			if (changeEvent.hasOwnProperty(key)) {
				if (changeEvent[key]) {
					hasChanged = true;
					break;
				}
			}
		}

		if (hasChanged) {
			this.emit(EditorCommon.EventType.ConfigurationChanged, changeEvent);
		}
	}

	public getRawOptions(): EditorCommon.IEditorOptions {
		return this._configWithDefaults.getEditorOptions();
	}

	private _computeInternalOptions(): EditorCommon.IInternalEditorOptions {
		let opts = this._configWithDefaults.getEditorOptions();

		let editorClassName = this._getEditorClassName(opts.theme);
		let requestedFontFamily = opts.fontFamily || '';
		let requestedFontSize = toInteger(opts.fontSize, 0, 100);
		let requestedLineHeight = toInteger(opts.lineHeight, 0, 150);

		let adjustedLineHeight = requestedLineHeight;
		if (requestedFontSize > 0 && requestedLineHeight === 0) {
			adjustedLineHeight = Math.round(1.3 * requestedFontSize);
		}

		let indentationOptions = CommonEditorConfiguration._computeIndentationOptions(opts, (tabSize) => this._guessIndentationOptionsCached(tabSize));

		return InternalEditorOptionsHelper.createInternalEditorOptions(
			this.getOuterWidth(),
			this.getOuterHeight(),
			opts,
			editorClassName,
			requestedFontFamily,
			requestedFontSize,
			requestedLineHeight,
			adjustedLineHeight,
			this.readConfiguration(editorClassName, requestedFontFamily, requestedFontSize, adjustedLineHeight),
			this._isDominatedByLongLines,
			this._lineCount,
			indentationOptions
		);
	}

	public updateOptions(newOptions:EditorCommon.IEditorOptions): void {
		this._configWithDefaults.updateOptions(newOptions);
		this._recomputeOptions();
	}

	protected _getEditorClassName(theme:string): string {
		return 'monaco-editor';
	}

	public setIsDominatedByLongLines(isDominatedByLongLines:boolean): void {
		this._isDominatedByLongLines = isDominatedByLongLines;
		this._recomputeOptions();
	}

	public setLineCount(lineCount:number): void {
		this._lineCount = lineCount;
		this._recomputeOptions();
	}

	public resetIndentationOptions(): void {
		this._cachedGuessedIndentationTabSize = -1;
		this._cachedGuessedIndentation = null;
		this._recomputeOptions();
	}

	private _guessIndentationOptionsCached(tabSize:number): EditorCommon.IGuessedIndentation {
		if (!this._cachedGuessedIndentation || this._cachedGuessedIndentationTabSize !== tabSize) {
			this._cachedGuessedIndentationTabSize = tabSize;

			if (this._indentationGuesser) {
				this._cachedGuessedIndentation = this._indentationGuesser(tabSize);
			} else {
				this._cachedGuessedIndentation = null;
			}
		}
		return this._cachedGuessedIndentation;
	}

	private static _getValidatedIndentationOptions(opts: EditorCommon.IEditorOptions): IValidatedIndentationOptions {
		let r: IValidatedIndentationOptions = {
			tabSizeIsAuto: false,
			tabSize: 4,
			insertSpacesIsAuto: false,
			insertSpaces: true
		};

		if (opts.tabSize === 'auto') {
			r.tabSizeIsAuto = true;
		} else {
			r.tabSize = toInteger(opts.tabSize, 1, 20);
		}

		if (opts.insertSpaces === 'auto') {
			r.insertSpacesIsAuto = true;
		} else {
			r.insertSpaces = toBoolean(opts.insertSpaces);
		}

		return r;
	}

	private static _computeIndentationOptions(allOpts: EditorCommon.IEditorOptions, indentationGuesser:IIndentationGuesser): EditorCommon.IInternalIndentationOptions {
		let opts = this._getValidatedIndentationOptions(allOpts);

		let guessedIndentation:EditorCommon.IGuessedIndentation = null;
		if (opts.tabSizeIsAuto || opts.insertSpacesIsAuto) {
			// We must use the indentation guesser to come up with the indentation options
			guessedIndentation = indentationGuesser(opts.tabSize);
		}

		let r: EditorCommon.IInternalIndentationOptions = {
			insertSpaces: opts.insertSpaces,
			tabSize: opts.tabSize
		};

		if (guessedIndentation && opts.tabSizeIsAuto) {
			r.tabSize = guessedIndentation.tabSize;
		}
		if (guessedIndentation && opts.insertSpacesIsAuto) {
			r.insertSpaces = guessedIndentation.insertSpaces;
		}

		return r;
	}

	public getIndentationOptions(): EditorCommon.IInternalIndentationOptions {
		return this.editor.indentInfo;
	}

	private _normalizeIndentationFromWhitespace(str:string): string {
		var indentation = this.getIndentationOptions(),
			spacesCnt = 0,
			i:number;

		for (i = 0; i < str.length; i++) {
			if (str.charAt(i) === '\t') {
				spacesCnt += indentation.tabSize;
			} else {
				spacesCnt++;
			}
		}

		var result = '';
		if (!indentation.insertSpaces) {
			var tabsCnt = Math.floor(spacesCnt / indentation.tabSize);
			spacesCnt = spacesCnt % indentation.tabSize;
			for (i = 0; i < tabsCnt; i++) {
				result += '\t';
			}
		}

		for (i = 0; i < spacesCnt; i++) {
			result += ' ';
		}

		return result;
	}

	public normalizeIndentation(str:string): string {
		var firstNonWhitespaceIndex = Strings.firstNonWhitespaceIndex(str);
		if (firstNonWhitespaceIndex === -1) {
			firstNonWhitespaceIndex = str.length;
		}
		return this._normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex)) + str.substring(firstNonWhitespaceIndex);
	}

	public getOneIndent(): string {
		var indentation = this.getIndentationOptions();
		if (indentation.insertSpaces) {
			var result = '';
			for (var i = 0; i < indentation.tabSize; i++) {
				result += ' ';
			}
			return result;
		} else {
			return '\t';
		}
	}

	protected getOuterWidth(): number {
		throw new Error('Not implemented');
	}

	protected getOuterHeight(): number {
		throw new Error('Not implemented');
	}

	protected readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig {
		throw new Error('Not implemented');
	}


}

/**
 * Helper to update Monaco Editor Settings from configurations service.
 */
export class EditorConfiguration {
	public static EDITOR_SECTION = 'editor';
	public static DIFF_EDITOR_SECTION = 'diffEditor';

	/**
	 * Ask the provided configuration service to apply its configuration to the provided editor.
	 */
	public static apply(config:any, editor?:EditorCommon.IEditor): void;
	public static apply(config:any, editor?:EditorCommon.IEditor[]): void;
	public static apply(config:any, editorOrArray?:any): void {
		if (!config) {
			return;
		}

		var editors:EditorCommon.IEditor[] = editorOrArray;
		if (!Array.isArray(editorOrArray)) {
			editors = [editorOrArray];
		}

		for (var i = 0; i < editors.length; i++) {
			var editor = editors[i];

			// Editor Settings (Code Editor, Diff, Terminal)
			if (editor && typeof editor.updateOptions === 'function') {
				var type = editor.getEditorType();
				if (type !== EditorCommon.EditorType.ICodeEditor && type !== EditorCommon.EditorType.IDiffEditor) {
					continue;
				}

				var editorConfig = config[EditorConfiguration.EDITOR_SECTION];
				if (type === EditorCommon.EditorType.IDiffEditor) {
					var diffEditorConfig = config[EditorConfiguration.DIFF_EDITOR_SECTION];
					if (diffEditorConfig) {
						if (!editorConfig) {
							editorConfig = diffEditorConfig;
						} else {
							editorConfig = Objects.mixin(editorConfig, diffEditorConfig);
						}
					}
				}

				if (editorConfig) {
					delete editorConfig.readOnly; // Prevent someone from making editor readonly
					editor.updateOptions(editorConfig);
				}
			}
		}
	}
}

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>Registry.as(ConfigurationRegistry.Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'editor',
	'order': 5,
	'type': 'object',
	'title': nls.localize('editorConfigurationTitle', "Editor configuration"),
	'properties' : {
		'editor.fontFamily' : {
			'type': 'string',
			'default': DefaultConfig.editor.fontFamily,
			'description': nls.localize('fontFamily', "Controls the font family.")
		},
		'editor.fontSize' : {
			'type': 'number',
			'default': DefaultConfig.editor.fontSize,
			'description': nls.localize('fontSize', "Controls the font size.")
		},
		'editor.lineHeight' : {
			'type': 'number',
			'default': DefaultConfig.editor.lineHeight,
			'description': nls.localize('lineHeight', "Controls the line height.")
		},
		'editor.lineNumbers' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.lineNumbers,
			'description': nls.localize('lineNumbers', "Controls visibility of line numbers")
		},
		'editor.glyphMargin' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.glyphMargin,
			'description': nls.localize('glyphMargin', "Controls visibility of the glyph margin")
		},
		'editor.tabSize' : {
			'oneOf': [
				{
					'type': 'number'
				},
				{
					'type': 'string',
					'enum': ['auto']
				}
			],
			'default': DefaultConfig.editor.tabSize,
			'minimum': 1,
			'description': nls.localize('tabSize', "Controls the rendering size of tabs in characters. Accepted values: \"auto\", 2, 4, 6, etc. If set to \"auto\", the value will be guessed when a file is opened.")
		},
		'editor.insertSpaces' : {
			'oneOf': [
				{
					'type': 'boolean'
				},
				{
					'type': 'string',
					'enum': ['auto']
				}
			],
			'default': DefaultConfig.editor.insertSpaces,
			'description': nls.localize('insertSpaces', "Controls if the editor will insert spaces for tabs. Accepted values:  \"auto\", true, false. If set to \"auto\", the value will be guessed when a file is opened.")
		},
		'editor.roundedSelection' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.roundedSelection,
			'description': nls.localize('roundedSelection', "Controls if selections have rounded corners")
		},
		'editor.scrollBeyondLastLine' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.scrollBeyondLastLine,
			'description': nls.localize('scrollBeyondLastLine', "Controls if the editor will scroll beyond the last line")
		},
		'editor.wrappingColumn' : {
			'type': 'integer',
			'default': DefaultConfig.editor.wrappingColumn,
			'minimum': -1,
			'description': nls.localize('wrappingColumn', "Controls after how many characters the editor will wrap to the next line. Setting this to 0 turns on viewport width wrapping")
		},
		'editor.wrappingIndent' : {
			'type': 'string',
			'enum': ['none', 'same', 'indent'],
			'default': DefaultConfig.editor.wrappingIndent,
			'description': nls.localize('wrappingIndent', "Controls the indentation of wrapped lines. Can be one of 'none', 'same' or 'indent'.")
		},
		'editor.mouseWheelScrollSensitivity' : {
			'type': 'number',
			'default': DefaultConfig.editor.mouseWheelScrollSensitivity,
			'description': nls.localize('mouseWheelScrollSensitivity', "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events")
		},
		'editor.quickSuggestions' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.quickSuggestions,
			'description': nls.localize('quickSuggestions', "Controls if quick suggestions should show up or not while typing")
		},
		'editor.quickSuggestionsDelay' : {
			'type': 'integer',
			'default': DefaultConfig.editor.quickSuggestionsDelay,
			'minimum': 0,
			'description': nls.localize('quickSuggestionsDelay', "Controls the delay in ms after which quick suggestions will show up")
		},
		'editor.autoClosingBrackets' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.autoClosingBrackets,
			'description': nls.localize('autoClosingBrackets', "Controls if the editor should automatically close brackets after opening them")
		},
		'editor.formatOnType' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.formatOnType,
			'description': nls.localize('formatOnType', "Controls if the editor should automatically format the line after typing")
		},
		'editor.suggestOnTriggerCharacters' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.suggestOnTriggerCharacters,
			'description': nls.localize('suggestOnTriggerCharacters', "Controls if suggestions should automatically show up when typing trigger characters")
		},
		'editor.selectionHighlight' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.selectionHighlight,
			'description': nls.localize('selectionHighlight', "Controls whether the editor should highlight similar matches to the selection")
		},
//		'editor.outlineMarkers' : {
//			'type': 'boolean',
//			'default': DefaultConfig.editor.outlineMarkers,
//			'description': nls.localize('outlineMarkers', "Controls whether the editor should draw horizontal lines before classes and methods")
//		},
		'editor.overviewRulerLanes' : {
			'type': 'integer',
			'default': 3,
			'description': nls.localize('overviewRulerLanes', "Controls the number of decorations that can show up at the same position in the overview ruler")
		},
		'editor.cursorBlinking' : {
			'type': 'string',
			'enum': ['blink', 'visible', 'hidden'],
			'default': DefaultConfig.editor.cursorBlinking,
			'description': nls.localize('cursorBlinking', "Controls the cursor blinking animation, accepted values are 'blink', 'visible', and 'hidden'")
		},
		'editor.cursorStyle' : {
			'type': 'string',
			'enum': ['block', 'line'],
			'default': DefaultConfig.editor.cursorStyle,
			'description': nls.localize('cursorStyle', "Controls the cursor style, accepted values are 'block' and 'line'")
		},
		'editor.hideCursorInOverviewRuler' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.hideCursorInOverviewRuler,
			'description': nls.localize('hideCursorInOverviewRuler', "Controls if the cursor should be hidden in the overview ruler.")
		},
		'editor.renderWhitespace': {
			'type': 'boolean',
			default: DefaultConfig.editor.renderWhitespace,
			description: nls.localize('renderWhitespace', "Controls whether the editor should render whitespace characters")
		},
		'editor.referenceInfos' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.referenceInfos,
			'description': nls.localize('referenceInfos', "Controls if the editor shows reference information for the modes that support it")
		},
		'diffEditor.renderSideBySide' : {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('sideBySide', "Controls if the diff editor shows the diff side by side or inline")
		},
		'diffEditor.ignoreTrimWhitespace' : {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('ignoreTrimWhitespace', "Controls if the diff editor shows changes in leading or trailing whitespace as diffs")
		}
	}
});