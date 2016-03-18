/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import Event, {Emitter} from 'vs/base/common/event';
import {Disposable} from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import {Extensions, IConfigurationRegistry, IConfigurationNode} from 'vs/platform/configuration/common/configurationRegistry';
import {Registry} from 'vs/platform/platform';
import {DefaultConfig, DEFAULT_INDENTATION} from 'vs/editor/common/config/defaultConfig';
import {HandlerDispatcher} from 'vs/editor/common/controller/handlerDispatcher';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {EditorLayoutProvider} from 'vs/editor/common/viewLayout/editorLayoutProvider';

/**
 * Experimental screen reader support toggle
 */
export class GlobalScreenReaderNVDA {

	private static _value = false;
	private static _onChange = new Emitter<boolean>();
	public static onChange: Event<boolean> = GlobalScreenReaderNVDA._onChange.event;

	public static getValue(): boolean {
		return this._value;
	}

	public static setValue(value:boolean): void {
		if (this._value === value) {
			return;
		}
		this._value = value;
		this._onChange.fire(this._value);
	}
}

export class ConfigurationWithDefaults {

	private _editor:editorCommon.IEditorOptions;

	constructor(options:editorCommon.IEditorOptions) {
		this._editor = <editorCommon.IEditorOptions>objects.clone(DefaultConfig.editor);

		this._mergeOptionsIn(options);
	}

	public getEditorOptions(): editorCommon.IEditorOptions {
		return this._editor;
	}

	private _mergeOptionsIn(newOptions:editorCommon.IEditorOptions): void {
		this._editor = objects.mixin(this._editor, newOptions || {});
	}

	public updateOptions(newOptions:editorCommon.IEditorOptions): void {
		// Apply new options
		this._mergeOptionsIn(newOptions);
	}
}

function cloneInternalEditorOptions(opts: editorCommon.IInternalEditorOptions): editorCommon.IInternalEditorOptions {
	return {
		experimentalScreenReader: opts.experimentalScreenReader,
		rulers: opts.rulers.slice(0),
		wordSeparators: opts.wordSeparators,
		selectionClipboard: opts.selectionClipboard,
		ariaLabel: opts.ariaLabel,
		lineNumbers: opts.lineNumbers,
		selectOnLineNumbers: opts.selectOnLineNumbers,
		glyphMargin: opts.glyphMargin,
		revealHorizontalRightPadding: opts.revealHorizontalRightPadding,
		roundedSelection: opts.roundedSelection,
		theme: opts.theme,
		readOnly: opts.readOnly,
		scrollbar: {
			arrowSize: opts.scrollbar.arrowSize,
			vertical: opts.scrollbar.vertical,
			horizontal: opts.scrollbar.horizontal,
			useShadows: opts.scrollbar.useShadows,
			verticalHasArrows: opts.scrollbar.verticalHasArrows,
			horizontalHasArrows: opts.scrollbar.horizontalHasArrows,
			handleMouseWheel: opts.scrollbar.handleMouseWheel,
			horizontalScrollbarSize: opts.scrollbar.horizontalScrollbarSize,
			horizontalSliderSize: opts.scrollbar.horizontalSliderSize,
			verticalScrollbarSize: opts.scrollbar.verticalScrollbarSize,
			verticalSliderSize: opts.scrollbar.verticalSliderSize,
			mouseWheelScrollSensitivity: opts.scrollbar.mouseWheelScrollSensitivity,
		},
		overviewRulerLanes: opts.overviewRulerLanes,
		cursorBlinking: opts.cursorBlinking,
		cursorStyle: opts.cursorStyle,
		fontLigatures: opts.fontLigatures,
		hideCursorInOverviewRuler: opts.hideCursorInOverviewRuler,
		scrollBeyondLastLine: opts.scrollBeyondLastLine,
		wrappingIndent: opts.wrappingIndent,
		wordWrapBreakBeforeCharacters: opts.wordWrapBreakBeforeCharacters,
		wordWrapBreakAfterCharacters: opts.wordWrapBreakAfterCharacters,
		wordWrapBreakObtrusiveCharacters: opts.wordWrapBreakObtrusiveCharacters,
		tabFocusMode: opts.tabFocusMode,
		stopLineTokenizationAfter: opts.stopLineTokenizationAfter,
		stopRenderingLineAfter: opts.stopRenderingLineAfter,
		longLineBoundary: opts.longLineBoundary,
		forcedTokenizationBoundary: opts.forcedTokenizationBoundary,
		hover: opts.hover,
		contextmenu: opts.contextmenu,
		quickSuggestions: opts.quickSuggestions,
		quickSuggestionsDelay: opts.quickSuggestionsDelay,
		iconsInSuggestions: opts.iconsInSuggestions,
		autoClosingBrackets: opts.autoClosingBrackets,
		formatOnType: opts.formatOnType,
		suggestOnTriggerCharacters: opts.suggestOnTriggerCharacters,
		acceptSuggestionOnEnter: opts.acceptSuggestionOnEnter,
		selectionHighlight: opts.selectionHighlight,
		outlineMarkers: opts.outlineMarkers,
		referenceInfos: opts.referenceInfos,
		folding: opts.folding,
		renderWhitespace: opts.renderWhitespace,
		layoutInfo: {
			width: opts.layoutInfo.width,
			height: opts.layoutInfo.height,
			glyphMarginLeft: opts.layoutInfo.glyphMarginLeft,
			glyphMarginWidth: opts.layoutInfo.glyphMarginWidth,
			glyphMarginHeight: opts.layoutInfo.glyphMarginHeight,
			lineNumbersLeft: opts.layoutInfo.lineNumbersLeft,
			lineNumbersWidth: opts.layoutInfo.lineNumbersWidth,
			lineNumbersHeight: opts.layoutInfo.lineNumbersHeight,
			decorationsLeft: opts.layoutInfo.decorationsLeft,
			decorationsWidth: opts.layoutInfo.decorationsWidth,
			decorationsHeight: opts.layoutInfo.decorationsHeight,
			contentLeft: opts.layoutInfo.contentLeft,
			contentWidth: opts.layoutInfo.contentWidth,
			contentHeight: opts.layoutInfo.contentHeight,
			verticalScrollbarWidth: opts.layoutInfo.verticalScrollbarWidth,
			horizontalScrollbarHeight: opts.layoutInfo.horizontalScrollbarHeight,
			overviewRuler:{
				width: opts.layoutInfo.overviewRuler.width,
				height: opts.layoutInfo.overviewRuler.height,
				top: opts.layoutInfo.overviewRuler.top,
				right: opts.layoutInfo.overviewRuler.right,
			}
		},
		stylingInfo: {
			editorClassName: opts.stylingInfo.editorClassName,
			fontFamily: opts.stylingInfo.fontFamily,
			fontSize: opts.stylingInfo.fontSize,
			lineHeight: opts.stylingInfo.lineHeight,
		},
		wrappingInfo: {
			isViewportWrapping: opts.wrappingInfo.isViewportWrapping,
			wrappingColumn: opts.wrappingInfo.wrappingColumn,
		},
		observedOuterWidth: opts.observedOuterWidth,
		observedOuterHeight: opts.observedOuterHeight,
		lineHeight: opts.lineHeight,
		pageSize: opts.pageSize,
		typicalHalfwidthCharacterWidth: opts.typicalHalfwidthCharacterWidth,
		typicalFullwidthCharacterWidth: opts.typicalFullwidthCharacterWidth,
		fontSize: opts.fontSize,
	};
}

class InternalEditorOptionsHelper {

	constructor() {
	}

	public static createInternalEditorOptions(
		outerWidth:number,
		outerHeight:number,
		opts:editorCommon.IEditorOptions,
		editorClassName:string,
		requestedFontFamily:string,
		requestedFontSize:number,
		requestedLineHeight:number,
		adjustedLineHeight:number,
		themeOpts: ICSSConfig,
		isDominatedByLongLines:boolean,
		lineCount: number
	): editorCommon.IInternalEditorOptions {

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
		if (opts.folding) {
			lineDecorationsWidth += 16;
		}
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

		let wrappingInfo: editorCommon.IEditorWrappingInfo;

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

		let readOnly = toBoolean(opts.readOnly);

		let tabFocusMode = toBoolean(opts.tabFocusMode);
		if (readOnly) {
			tabFocusMode = true;
		}

		return {
			// ---- Options that are transparent - get no massaging
			lineNumbers: lineNumbers,
			selectOnLineNumbers: toBoolean(opts.selectOnLineNumbers),
			glyphMargin: glyphMargin,
			revealHorizontalRightPadding: toInteger(opts.revealHorizontalRightPadding, 0),
			roundedSelection: toBoolean(opts.roundedSelection),
			theme: opts.theme,
			readOnly: readOnly,
			scrollbar: scrollbar,
			overviewRulerLanes: toInteger(opts.overviewRulerLanes, 0, 3),
			cursorBlinking: opts.cursorBlinking,
			experimentalScreenReader: toBoolean(opts.experimentalScreenReader),
			rulers: toSortedIntegerArray(opts.rulers),
			wordSeparators: String(opts.wordSeparators),
			selectionClipboard: toBoolean(opts.selectionClipboard),
			ariaLabel: String(opts.ariaLabel),
			cursorStyle: editorCommon.cursorStyleFromString(opts.cursorStyle),
			fontLigatures: toBoolean(opts.fontLigatures),
			hideCursorInOverviewRuler: toBoolean(opts.hideCursorInOverviewRuler),
			scrollBeyondLastLine: toBoolean(opts.scrollBeyondLastLine),
			wrappingIndent: opts.wrappingIndent,
			wordWrapBreakBeforeCharacters: opts.wordWrapBreakBeforeCharacters,
			wordWrapBreakAfterCharacters: opts.wordWrapBreakAfterCharacters,
			wordWrapBreakObtrusiveCharacters: opts.wordWrapBreakObtrusiveCharacters,
			tabFocusMode: tabFocusMode,
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
			acceptSuggestionOnEnter: toBoolean(opts.acceptSuggestionOnEnter),
			selectionHighlight: toBoolean(opts.selectionHighlight),
			outlineMarkers: toBoolean(opts.outlineMarkers),
			referenceInfos: toBoolean(opts.referenceInfos),
			folding: toBoolean(opts.folding),
			renderWhitespace: toBoolean(opts.renderWhitespace),

			layoutInfo: layoutInfo,
			stylingInfo: {
				editorClassName: editorClassName,
				fontFamily: requestedFontFamily,
				fontSize: requestedFontSize,
				lineHeight: adjustedLineHeight
			},
			wrappingInfo: wrappingInfo,

			observedOuterWidth: outerWidth,
			observedOuterHeight: outerHeight,

			lineHeight: themeOpts.lineHeight,

			pageSize: pageSize,

			typicalHalfwidthCharacterWidth: themeOpts.typicalHalfwidthCharacterWidth,
			typicalFullwidthCharacterWidth: themeOpts.typicalFullwidthCharacterWidth,

			fontSize: themeOpts.fontSize,
		};
	}

	private static _sanitizeScrollbarOpts(raw:editorCommon.IEditorScrollbarOptions, mouseWheelScrollSensitivity:number): editorCommon.IInternalEditorScrollbarOptions {
		let horizontalScrollbarSize = toIntegerWithDefault(raw.horizontalScrollbarSize, 10);
		let verticalScrollbarSize = toIntegerWithDefault(raw.verticalScrollbarSize, 14);
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

	public static createConfigurationChangedEvent(prevOpts:editorCommon.IInternalEditorOptions, newOpts:editorCommon.IInternalEditorOptions): editorCommon.IConfigurationChangedEvent {
		return {
			experimentalScreenReader:		(prevOpts.experimentalScreenReader !== newOpts.experimentalScreenReader),
			rulers:							(!this._numberArraysEqual(prevOpts.rulers, newOpts.rulers)),
			wordSeparators:					(prevOpts.wordSeparators !== newOpts.wordSeparators),
			selectionClipboard:				(prevOpts.selectionClipboard !== newOpts.selectionClipboard),
			ariaLabel:						(prevOpts.ariaLabel !== newOpts.ariaLabel),

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
			fontLigatures:					(prevOpts.fontLigatures !== newOpts.fontLigatures),
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
			referenceInfos:					(prevOpts.referenceInfos !== newOpts.referenceInfos),
			folding:						(prevOpts.folding !== newOpts.folding),
			renderWhitespace:				(prevOpts.renderWhitespace !== newOpts.renderWhitespace),

			layoutInfo: 					(!EditorLayoutProvider.layoutEqual(prevOpts.layoutInfo, newOpts.layoutInfo)),
			stylingInfo: 					(!this._stylingInfoEqual(prevOpts.stylingInfo, newOpts.stylingInfo)),
			wrappingInfo:					(!this._wrappingInfoEqual(prevOpts.wrappingInfo, newOpts.wrappingInfo)),
			observedOuterWidth:				(prevOpts.observedOuterWidth !== newOpts.observedOuterWidth),
			observedOuterHeight:			(prevOpts.observedOuterHeight !== newOpts.observedOuterHeight),
			lineHeight:						(prevOpts.lineHeight !== newOpts.lineHeight),
			pageSize:						(prevOpts.pageSize !== newOpts.pageSize),
			typicalHalfwidthCharacterWidth:	(prevOpts.typicalHalfwidthCharacterWidth !== newOpts.typicalHalfwidthCharacterWidth),
			typicalFullwidthCharacterWidth:	(prevOpts.typicalFullwidthCharacterWidth !== newOpts.typicalFullwidthCharacterWidth),
			fontSize:						(prevOpts.fontSize !== newOpts.fontSize)
		};
	}

	private static _scrollbarOptsEqual(a:editorCommon.IInternalEditorScrollbarOptions, b:editorCommon.IInternalEditorScrollbarOptions): boolean {
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

	private static _stylingInfoEqual(a:editorCommon.IEditorStyling, b:editorCommon.IEditorStyling): boolean {
		return (
			a.editorClassName === b.editorClassName
			&& a.fontFamily === b.fontFamily
			&& a.fontSize === b.fontSize
			&& a.lineHeight === b.lineHeight
		);
	}

	private static _wrappingInfoEqual(a:editorCommon.IEditorWrappingInfo, b:editorCommon.IEditorWrappingInfo): boolean {
		return (
			a.isViewportWrapping === b.isViewportWrapping
			&& a.wrappingColumn === b.wrappingColumn
		);
	}

	private static _numberArraysEqual(a:number[], b:number[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
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
	let r = parseFloat(source);
	if (isNaN(r)) {
		r = defaultValue;
	}
	return r;
}

function toInteger(source:any, minimum?:number, maximum?:number): number {
	let r = parseInt(source, 10);
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

function toSortedIntegerArray(source:any): number[] {
	if (!Array.isArray(source)) {
		return [];
	}
	let arrSource = <any[]>source;
	let r = arrSource.map(el => toInteger(el));
	r.sort();
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

export interface IElementSizeObserver {
	startObserving(): void;
	observe(dimension?:editorCommon.IDimension): void;
	dispose(): void;
	getWidth(): number;
	getHeight(): number;
}

export abstract class CommonEditorConfiguration extends Disposable implements editorCommon.IConfiguration {

	public handlerDispatcher:editorCommon.IHandlerDispatcher;
	public editor:editorCommon.IInternalEditorOptions;
	public editorClone:editorCommon.IInternalEditorOptions;

	protected _configWithDefaults:ConfigurationWithDefaults;
	protected _elementSizeObserver: IElementSizeObserver;
	private _isDominatedByLongLines:boolean;
	private _lineCount:number;

	private _onDidChange = this._register(new Emitter<editorCommon.IConfigurationChangedEvent>());
	public onDidChange: Event<editorCommon.IConfigurationChangedEvent> = this._onDidChange.event;

	constructor(options:editorCommon.IEditorOptions, elementSizeObserver: IElementSizeObserver = null) {
		super();
		this._configWithDefaults = new ConfigurationWithDefaults(options);
		this._elementSizeObserver = elementSizeObserver;
		this._isDominatedByLongLines = false;
		this._lineCount = 1;

		this.handlerDispatcher = new HandlerDispatcher();

		this.editor = this._computeInternalOptions();
		this.editorClone = cloneInternalEditorOptions(this.editor);
	}

	public dispose(): void {
		super.dispose();
	}

	protected _recomputeOptions(): void {
		let oldOpts = this.editor;
		this.editor = this._computeInternalOptions();
		this.editorClone = cloneInternalEditorOptions(this.editor);

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
			this._onDidChange.fire(changeEvent);
		}
	}

	public getRawOptions(): editorCommon.IEditorOptions {
		return this._configWithDefaults.getEditorOptions();
	}

	private _computeInternalOptions(): editorCommon.IInternalEditorOptions {
		let opts = this._configWithDefaults.getEditorOptions();

		let editorClassName = this._getEditorClassName(opts.theme, toBoolean(opts.fontLigatures));
		let requestedFontFamily = opts.fontFamily || '';
		let requestedFontSize = toInteger(opts.fontSize, 0, 100);
		let requestedLineHeight = toInteger(opts.lineHeight, 0, 150);

		let adjustedLineHeight = requestedLineHeight;
		if (requestedFontSize > 0 && requestedLineHeight === 0) {
			adjustedLineHeight = Math.round(1.3 * requestedFontSize);
		}

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
			this._lineCount
		);
	}

	public updateOptions(newOptions:editorCommon.IEditorOptions): void {
		this._configWithDefaults.updateOptions(newOptions);
		this._recomputeOptions();
	}

	public setIsDominatedByLongLines(isDominatedByLongLines:boolean): void {
		this._isDominatedByLongLines = isDominatedByLongLines;
		this._recomputeOptions();
	}

	public setLineCount(lineCount:number): void {
		this._lineCount = lineCount;
		this._recomputeOptions();
	}

	protected abstract _getEditorClassName(theme:string, fontLigatures:boolean): string;

	protected abstract getOuterWidth(): number;

	protected abstract getOuterHeight(): number;

	protected abstract readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig;
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
	public static apply(config:any, editor?:editorCommon.IEditor): void;
	public static apply(config:any, editor?:editorCommon.IEditor[]): void;
	public static apply(config:any, editorOrArray?:any): void {
		if (!config) {
			return;
		}

		let editors:editorCommon.IEditor[] = editorOrArray;
		if (!Array.isArray(editorOrArray)) {
			editors = [editorOrArray];
		}

		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];

			// Editor Settings (Code Editor, Diff, Terminal)
			if (editor && typeof editor.updateOptions === 'function') {
				let type = editor.getEditorType();
				if (type !== editorCommon.EditorType.ICodeEditor && type !== editorCommon.EditorType.IDiffEditor) {
					continue;
				}

				let editorConfig = config[EditorConfiguration.EDITOR_SECTION];
				if (type === editorCommon.EditorType.IDiffEditor) {
					let diffEditorConfig = config[EditorConfiguration.DIFF_EDITOR_SECTION];
					if (diffEditorConfig) {
						if (!editorConfig) {
							editorConfig = diffEditorConfig;
						} else {
							editorConfig = objects.mixin(editorConfig, diffEditorConfig);
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

let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
let editorConfiguration:IConfigurationNode = {
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
		'editor.rulers' : {
			'type': 'array',
			'items': {
				'type': 'number'
			},
			'default': DefaultConfig.editor.rulers,
			'description': nls.localize('rulers', "Columns at which to show vertical rulers")
		},
		'editor.wordSeparators' : {
			'type': 'string',
			'default': DefaultConfig.editor.wordSeparators,
			'description': nls.localize('wordSeparators', "Characters that will be used as word separators when doing word related navigations or operations")
		},
		'editor.tabSize' : {
			'type': 'number',
			'default': DEFAULT_INDENTATION.tabSize,
			'minimum': 1,
			'description': nls.localize('tabSize', "The number of spaces a tab is equal to."),
			'errorMessage': nls.localize('tabSize.errorMessage', "Expected 'number'. Note that the value \"auto\" has been replaced by the `editor.detectIndentation` setting.")
		},
		'editor.insertSpaces' : {
			'type': 'boolean',
			'default': DEFAULT_INDENTATION.insertSpaces,
			'description': nls.localize('insertSpaces', "Insert spaces when pressing Tab."),
			'errorMessage': nls.localize('insertSpaces.errorMessage', "Expected 'boolean'. Note that the value \"auto\" has been replaced by the `editor.detectIndentation` setting.")
		},
		'editor.detectIndentation' : {
			'type': 'boolean',
			'default': DEFAULT_INDENTATION.detectIndentation,
			'description': nls.localize('detectIndentation', "When opening a file, `editor.tabSize` and `editor.insertSpaces` will be detected based on the file contents.")
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
		'editor.acceptSuggestionOnEnter' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.acceptSuggestionOnEnter,
			'description': nls.localize('acceptSuggestionOnEnter', "Controls if suggestions should be accepted 'Enter' - in addition to 'Tab'. Helps to avoid ambiguity between inserting new lines or accepting suggestions.")
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
		'editor.fontLigatures' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.fontLigatures,
			'description': nls.localize('fontLigatures', "Enables font ligatures")
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
		'editor.folding' : {
			'type': 'boolean',
			'default': DefaultConfig.editor.folding,
			'description': nls.localize('folding', "Controls whether the editor has code folding enabled")
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
};

if (platform.isLinux) {
	editorConfiguration['properties']['editor.selectionClipboard'] = {
		'type': 'boolean',
		'default': DefaultConfig.editor.selectionClipboard,
		'description': nls.localize('selectionClipboard', "Controls if the Linux primary clipboard should be supported.")
	};
}

configurationRegistry.registerConfiguration(editorConfiguration);