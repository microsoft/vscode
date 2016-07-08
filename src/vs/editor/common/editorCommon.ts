/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IAction} from 'vs/base/common/actions';
import {IEventEmitter, BulkListenerCallback} from 'vs/base/common/eventEmitter';
import {MarkedString} from 'vs/base/common/htmlContent';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IInstantiationService, IConstructorSignature1, IConstructorSignature2} from 'vs/platform/instantiation/common/instantiation';
import {ILineContext, IMode, IToken} from 'vs/editor/common/modes';
import {ViewLineToken} from 'vs/editor/common/core/viewLineToken';
import {ScrollbarVisibility} from 'vs/base/common/scrollable';
import {IDisposable} from 'vs/base/common/lifecycle';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {IndentRange} from 'vs/editor/common/model/indentRanges';

/**
 * @internal
 */
export interface Event<T> {
	(listener: (e: T) => any, thisArg?: any): IDisposable;
}

// --- position & range

/**
 * A position in the editor. This interface is suitable for serialization.
 */
export interface IPosition {
	/**
	 * line number (starts at 1)
	 */
	lineNumber:number;
	/**
	 * column (the first character in a line is between column 1 and column 2)
	 */
	column:number;
}

/**
 * A range in the editor. This interface is suitable for serialization.
 */
export interface IRange {
	/**
	 * Line number on which the range starts (starts at 1).
	 */
	startLineNumber:number;
	/**
	 * Column on which the range starts in line `startLineNumber` (starts at 1).
	 */
	startColumn:number;
	/**
	 * Line number on which the range ends.
	 */
	endLineNumber:number;
	/**
	 * Column on which the range ends in line `endLineNumber`.
	 */
	endColumn:number;
}

/**
 * A selection in the editor.
 * The selection is a range that has an orientation.
 */
export interface ISelection {
	/**
	 * The line number on which the selection has started.
	 */
	selectionStartLineNumber: number;
	/**
	 * The column on `selectionStartLineNumber` where the selection has started.
	 */
	selectionStartColumn: number;
	/**
	 * The line number on which the selection has ended.
	 */
	positionLineNumber: number;
	/**
	 * The column on `positionLineNumber` where the selection has ended.
	 */
	positionColumn: number;
}

/**
 * Configuration options for editor scrollbars
 */
export interface IEditorScrollbarOptions {
	/**
	 * The size of arrows (if displayed).
	 * Defaults to 11.
	 */
	arrowSize?:number;
	/**
	 * Render vertical scrollbar.
	 * Accepted values: 'auto', 'visible', 'hidden'.
	 * Defaults to 'auto'.
	 */
	vertical?:string;
	/**
	 * Render horizontal scrollbar.
	 * Accepted values: 'auto', 'visible', 'hidden'.
	 * Defaults to 'auto'.
	 */
	horizontal?:string;
	/**
	 * Cast horizontal and vertical shadows when the content is scrolled.
	 * Defaults to false.
	 */
	useShadows?:boolean;
	/**
	 * Render arrows at the top and bottom of the vertical scrollbar.
	 * Defaults to false.
	 */
	verticalHasArrows?:boolean;
	/**
	 * Render arrows at the left and right of the horizontal scrollbar.
	 * Defaults to false.
	 */
	horizontalHasArrows?:boolean;
	/**
	 * Listen to mouse wheel events and react to them by scrolling.
	 * Defaults to true.
	 */
	handleMouseWheel?: boolean;
	/**
	 * Height in pixels for the horizontal scrollbar.
	 * Defaults to 10 (px).
	 */
	horizontalScrollbarSize?: number;
	/**
	 * Width in pixels for the vertical scrollbar.
	 * Defaults to 10 (px).
	 */
	verticalScrollbarSize?: number;
	/**
	 * Width in pixels for the vertical slider.
	 * Defaults to `verticalScrollbarSize`.
	 */
	verticalSliderSize?: number;
	/**
	 * Height in pixels for the horizontal slider.
	 * Defaults to `horizontalScrollbarSize`.
	 */
	horizontalSliderSize?: number;
}

/**
 * Describes how to indent wrapped lines.
 */
export enum WrappingIndent {
	/**
	 * No indentation => wrapped lines begin at column 1.
	 */
	None = 0,
	/**
	 * Same => wrapped lines get the same indentation as the parent.
	 */
	Same = 1,
	/**
	 * Indent => wrapped lines get +1 indentation as the parent.
	 */
	Indent = 2
}

/**
 * Configuration options for the editor.
 */
export interface IEditorOptions {
	/**
	 * Enable experimental screen reader support.
	 * Defaults to `true`.
	 */
	experimentalScreenReader?: boolean;
	/**
	 * The aria label for the editor's textarea (when it is focused).
	 */
	ariaLabel?: string;
	/**
	 * Render vertical lines at the specified columns.
	 * Defaults to empty array.
	 */
	rulers?: number[];
	/**
	 * A string containing the word separators used when doing word navigation.
	 * Defaults to `~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?
	 */
	wordSeparators?: string;
	/**
	 * Enable Linux primary clipboard.
	 * Defaults to true.
	 */
	selectionClipboard?: boolean;
	/**
	 * Control the rendering of line numbers.
	 * If it is a function, it will be invoked when rendering a line number and the return value will be rendered.
	 * Otherwise, if it is a truey, line numbers will be rendered normally (equivalent of using an identity function).
	 * Otherwise, line numbers will not be rendered.
	 * Defaults to true.
	 */
	lineNumbers?:any;
	/**
	 * Should the corresponding line be selected when clicking on the line number?
	 * Defaults to true.
	 */
	selectOnLineNumbers?:boolean;
	/**
	 * Control the width of line numbers, by reserving horizontal space for rendering at least an amount of digits.
	 * Defaults to 5.
	 */
	lineNumbersMinChars?:number;
	/**
	 * Enable the rendering of the glyph margin.
	 * Defaults to false.
	 */
	glyphMargin?:boolean;
	/**
	 * The width reserved for line decorations (in px).
	 * Line decorations are placed between line numbers and the editor content.
	 * Defaults to 10.
	 */
	lineDecorationsWidth?:number;
	/**
	 * When revealing the cursor, a virtual padding (px) is added to the cursor, turning it into a rectangle.
	 * This virtual padding ensures that the cursor gets revealed before hitting the edge of the viewport.
	 * Defaults to 30 (px).
	 */
	revealHorizontalRightPadding?:number;
	/**
	 * Render the editor selection with rounded borders.
	 * Defaults to true.
	 */
	roundedSelection?:boolean;
	/**
	 * Theme to be used for rendering. Consists of two parts, the UI theme and the syntax theme,
	 * separated by a space.
	 * The current available UI themes are: 'vs' (default), 'vs-dark', 'hc-black'
	 * The syntax themes are contributed. The default is 'default-theme'
	 */
	theme?:string;
	/**
	 * Should the editor be read only.
	 * Defaults to false.
	 */
	readOnly?:boolean;
	/**
	 * Control the behavior and rendering of the scrollbars.
	 */
	scrollbar?:IEditorScrollbarOptions;
	/**
	 * The number of vertical lanes the overview ruler should render.
	 * Defaults to 2.
	 */
	overviewRulerLanes?:number;
	/**
	 * Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'.
	 * Defaults to 'blink'.
	 */
	cursorBlinking?:string;
	/**
	 * Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.
	 * Defaults to false.
	 */
	mouseWheelZoom?: boolean;
	/**
	 * Control the cursor style, either 'block' or 'line'.
	 * Defaults to 'line'.
	 */
	cursorStyle?:string;
	/**
	 * Enable font ligatures.
	 * Defaults to false.
	 */
	fontLigatures?:boolean;
	/**
	 * Disable the use of `translate3d`.
	 * Defaults to false.
	 */
	disableTranslate3d?:boolean;
	/**
	 * Should the cursor be hidden in the overview ruler.
	 * Defaults to false.
	 */
	hideCursorInOverviewRuler?:boolean;
	/**
	 * Enable that scrolling can go one screen size after the last line.
	 * Defaults to true.
	 */
	scrollBeyondLastLine?:boolean;
	/**
	 * Enable that the editor will install an interval to check if its container dom node size has changed.
	 * Enabling this might have a severe performance impact.
	 * Defaults to false.
	 */
	automaticLayout?:boolean;
	/**
	 * Control the wrapping strategy of the editor.
	 * Using -1 means no wrapping whatsoever.
	 * Using 0 means viewport width wrapping (ajusts with the resizing of the editor).
	 * Using a positive number means wrapping after a fixed number of characters.
	 * Defaults to 300.
	 */
	wrappingColumn?:number;
	/**
	 * Control indentation of wrapped lines. Can be: 'none', 'same' or 'indent'.
	 * Defaults to 'none'.
	 */
	wrappingIndent?: string;
	/**
	 * Configure word wrapping characters. A break will be introduced before these characters.
	 * Defaults to '{([+'.
	 */
	wordWrapBreakBeforeCharacters?: string;
	/**
	 * Configure word wrapping characters. A break will be introduced after these characters.
	 * Defaults to ' \t})]?|&,;'.
	 */
	wordWrapBreakAfterCharacters?: string;
	/**
	 * Configure word wrapping characters. A break will be introduced after these characters only if no `wordWrapBreakBeforeCharacters` or `wordWrapBreakAfterCharacters` were found.
	 * Defaults to '.'.
	 */
	wordWrapBreakObtrusiveCharacters?: string;

	/**
	 * Performance guard: Stop rendering a line after x characters.
	 * Defaults to 10000 if wrappingColumn is -1. Defaults to -1 if wrappingColumn is >= 0.
	 * Use -1 to never stop rendering
	 */
	stopRenderingLineAfter?:number;
	/**
	 * Enable hover.
	 * Defaults to true.
	 */
	hover?:boolean;
	/**
	 * Enable custom contextmenu.
	 * Defaults to true.
	 */
	contextmenu?:boolean;
	/**
	 * A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.
	 * Defaults to 1.
	 */
	mouseWheelScrollSensitivity?: number;
	/**
	 * Enable quick suggestions (shadow suggestions)
	 * Defaults to true.
	 */
	quickSuggestions?:boolean;
	/**
	 * Quick suggestions show delay (in ms)
	 * Defaults to 500 (ms)
	 */
	quickSuggestionsDelay?:number;
	/**
	 * Enables parameter hints
	 */
	parameterHints?:boolean;
	/**
	 * Render icons in suggestions box.
	 * Defaults to true.
	 */
	iconsInSuggestions?:boolean;
	/**
	 * Enable auto closing brackets.
	 * Defaults to true.
	 */
	autoClosingBrackets?:boolean;
	/**
	 * Enable format on type.
	 * Defaults to false.
	 */
	formatOnType?:boolean;
	/**
	 * Enable the suggestion box to pop-up on trigger characters.
	 * Defaults to true.
	 */
	suggestOnTriggerCharacters?: boolean;
	/**
	 * Accept suggestions on ENTER.
	 * Defaults to true.
	 */
	acceptSuggestionOnEnter?: boolean;
	/**
	 * Enable selection highlight.
	 * Defaults to true.
	 */
	selectionHighlight?:boolean;
	/**
	 * Show reference infos (a.k.a. code lenses) for modes that support it
	 * Defaults to true.
	 */
	referenceInfos?: boolean;
	/**
	 * Enable code folding
	 * Defaults to true.
	 */
	folding?: boolean;
	/**
	 * Enable rendering of leading whitespace.
	 * Defaults to false.
	 */
	renderWhitespace?: boolean;
	/**
	 * Enable rendering of control characters.
	 * Defaults to false.
	 */
	renderControlCharacters?: boolean;
	/**
	 * Enable rendering of indent guides.
	 * Defaults to true.
	 */
	renderIndentGuides?: boolean;
	/**
	 * Inserting and deleting whitespace follows tab stops.
	 */
	useTabStops?: boolean;
	/**
	 * The font family
	 */
	fontFamily?: string;
	/**
	 * The font size
	 */
	fontSize?: number;
	/**
	 * The line height
	 */
	lineHeight?: number;
}

/**
 * Configuration options for the diff editor.
 */
export interface IDiffEditorOptions extends IEditorOptions {
	/**
	 * Allow the user to resize the diff editor split view.
	 * Defaults to true.
	 */
	enableSplitViewResizing?: boolean;
	/**
	 * Render the differences in two side-by-side editors.
	 * Defaults to true.
	 */
	renderSideBySide?: boolean;
	/**
	 * Compute the diff by ignoring leading/trailing whitespace
	 * Defaults to true.
	 */
	ignoreTrimWhitespace?: boolean;
	/**
	 * Original model should be editable?
	 * Defaults to false.
	 */
	originalEditable?: boolean;
}

export class InternalEditorScrollbarOptions {
	_internalEditorScrollbarOptionsBrand: void;

	arrowSize:number;
	vertical:ScrollbarVisibility;
	horizontal:ScrollbarVisibility;
	useShadows:boolean;
	verticalHasArrows:boolean;
	horizontalHasArrows:boolean;
	handleMouseWheel: boolean;
	horizontalScrollbarSize: number;
	horizontalSliderSize: number;
	verticalScrollbarSize: number;
	verticalSliderSize: number;
	mouseWheelScrollSensitivity: number;

	/**
	 * @internal
	 */
	constructor(source:{
		arrowSize:number;
		vertical:ScrollbarVisibility;
		horizontal:ScrollbarVisibility;
		useShadows:boolean;
		verticalHasArrows:boolean;
		horizontalHasArrows:boolean;
		handleMouseWheel: boolean;
		horizontalScrollbarSize: number;
		horizontalSliderSize: number;
		verticalScrollbarSize: number;
		verticalSliderSize: number;
		mouseWheelScrollSensitivity: number;
	}) {
		this.arrowSize = source.arrowSize|0;
		this.vertical = source.vertical|0;
		this.horizontal = source.horizontal|0;
		this.useShadows = Boolean(source.useShadows);
		this.verticalHasArrows = Boolean(source.verticalHasArrows);
		this.horizontalHasArrows = Boolean(source.horizontalHasArrows);
		this.handleMouseWheel = Boolean(source.handleMouseWheel);
		this.horizontalScrollbarSize = source.horizontalScrollbarSize|0;
		this.horizontalSliderSize = source.horizontalSliderSize|0;
		this.verticalScrollbarSize = source.verticalScrollbarSize|0;
		this.verticalSliderSize = source.verticalSliderSize|0;
		this.mouseWheelScrollSensitivity = Number(source.mouseWheelScrollSensitivity);
	}

	/**
	 * @internal
	 */
	public equals(other:InternalEditorScrollbarOptions): boolean {
		return (
			this.arrowSize === other.arrowSize
			&& this.vertical === other.vertical
			&& this.horizontal === other.horizontal
			&& this.useShadows === other.useShadows
			&& this.verticalHasArrows === other.verticalHasArrows
			&& this.horizontalHasArrows === other.horizontalHasArrows
			&& this.handleMouseWheel === other.handleMouseWheel
			&& this.horizontalScrollbarSize === other.horizontalScrollbarSize
			&& this.horizontalSliderSize === other.horizontalSliderSize
			&& this.verticalScrollbarSize === other.verticalScrollbarSize
			&& this.verticalSliderSize === other.verticalSliderSize
			&& this.mouseWheelScrollSensitivity === other.mouseWheelScrollSensitivity
		);
	}

	/**
	 * @internal
	 */
	public clone(): InternalEditorScrollbarOptions {
		return new InternalEditorScrollbarOptions(this);
	}
}

export class EditorWrappingInfo {
	_editorWrappingInfoBrand: void;

	isViewportWrapping: boolean;
	wrappingColumn: number;
	wrappingIndent: WrappingIndent;
	wordWrapBreakBeforeCharacters: string;
	wordWrapBreakAfterCharacters: string;
	wordWrapBreakObtrusiveCharacters: string;

	/**
	 * @internal
	 */
	constructor(source:{
		isViewportWrapping: boolean;
		wrappingColumn: number;
		wrappingIndent: WrappingIndent;
		wordWrapBreakBeforeCharacters: string;
		wordWrapBreakAfterCharacters: string;
		wordWrapBreakObtrusiveCharacters: string;
	}) {
		this.isViewportWrapping = Boolean(source.isViewportWrapping);
		this.wrappingColumn = source.wrappingColumn|0;
		this.wrappingIndent = source.wrappingIndent|0;
		this.wordWrapBreakBeforeCharacters = String(source.wordWrapBreakBeforeCharacters);
		this.wordWrapBreakAfterCharacters = String(source.wordWrapBreakAfterCharacters);
		this.wordWrapBreakObtrusiveCharacters = String(source.wordWrapBreakObtrusiveCharacters);
	}

	/**
	 * @internal
	 */
	public equals(other:EditorWrappingInfo): boolean {
		return (
			this.isViewportWrapping === other.isViewportWrapping
			&& this.wrappingColumn === other.wrappingColumn
			&& this.wrappingIndent === other.wrappingIndent
			&& this.wordWrapBreakBeforeCharacters === other.wordWrapBreakBeforeCharacters
			&& this.wordWrapBreakAfterCharacters === other.wordWrapBreakAfterCharacters
			&& this.wordWrapBreakObtrusiveCharacters === other.wordWrapBreakObtrusiveCharacters
		);
	}

	/**
	 * @internal
	 */
	public clone(): EditorWrappingInfo {
		return new EditorWrappingInfo(this);
	}
}

export class InternalEditorViewOptions {
	_internalEditorViewOptionsBrand: void;

	theme:string;
	canUseTranslate3d:boolean;
	experimentalScreenReader: boolean;
	rulers: number[];
	ariaLabel: string;
	lineNumbers:any;
	selectOnLineNumbers:boolean;
	glyphMargin:boolean;
	revealHorizontalRightPadding:number;
	roundedSelection:boolean;
	overviewRulerLanes:number;
	cursorBlinking:TextEditorCursorBlinkingStyle;
	mouseWheelZoom:boolean;
	cursorStyle:TextEditorCursorStyle;
	hideCursorInOverviewRuler:boolean;
	scrollBeyondLastLine:boolean;
	editorClassName: string;
	stopRenderingLineAfter: number;
	renderWhitespace: boolean;
	renderControlCharacters: boolean;
	renderIndentGuides: boolean;
	scrollbar:InternalEditorScrollbarOptions;

	/**
	 * @internal
	 */
	constructor(source:{
		theme:string;
		canUseTranslate3d:boolean;
		experimentalScreenReader: boolean;
		rulers: number[];
		ariaLabel: string;
		lineNumbers:any;
		selectOnLineNumbers:boolean;
		glyphMargin:boolean;
		revealHorizontalRightPadding:number;
		roundedSelection:boolean;
		overviewRulerLanes:number;
		cursorBlinking:TextEditorCursorBlinkingStyle;
		mouseWheelZoom:boolean;
		cursorStyle:TextEditorCursorStyle;
		hideCursorInOverviewRuler:boolean;
		scrollBeyondLastLine:boolean;
		editorClassName: string;
		stopRenderingLineAfter: number;
		renderWhitespace: boolean;
		renderControlCharacters: boolean;
		renderIndentGuides: boolean;
		scrollbar:InternalEditorScrollbarOptions;
	}) {
		this.theme = String(source.theme);
		this.canUseTranslate3d = Boolean(source.canUseTranslate3d);
		this.experimentalScreenReader = Boolean(source.experimentalScreenReader);
		this.rulers = InternalEditorViewOptions._toSortedIntegerArray(source.rulers);
		this.ariaLabel = String(source.ariaLabel);
		this.lineNumbers = source.lineNumbers;
		this.selectOnLineNumbers = Boolean(source.selectOnLineNumbers);
		this.glyphMargin = Boolean(source.glyphMargin);
		this.revealHorizontalRightPadding = source.revealHorizontalRightPadding|0;
		this.roundedSelection = Boolean(source.roundedSelection);
		this.overviewRulerLanes = source.overviewRulerLanes|0;
		this.cursorBlinking = source.cursorBlinking|0;
		this.mouseWheelZoom = Boolean(source.mouseWheelZoom);
		this.cursorStyle = source.cursorStyle|0;
		this.hideCursorInOverviewRuler = Boolean(source.hideCursorInOverviewRuler);
		this.scrollBeyondLastLine = Boolean(source.scrollBeyondLastLine);
		this.editorClassName = String(source.editorClassName);
		this.stopRenderingLineAfter = source.stopRenderingLineAfter|0;
		this.renderWhitespace = Boolean(source.renderWhitespace);
		this.renderControlCharacters = Boolean(source.renderControlCharacters);
		this.renderIndentGuides = Boolean(source.renderIndentGuides);
		this.scrollbar = source.scrollbar.clone();
	}

	private static _toSortedIntegerArray(source:any): number[] {
		if (!Array.isArray(source)) {
			return [];
		}
		let arrSource = <any[]>source;
		let result = arrSource.map(el => {
			let r = parseInt(el, 10);
			if (isNaN(r)) {
				return 0;
			}
			return r;
		});
		result.sort();
		return result;
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

	/**
	 * @internal
	 */
	public equals(other:InternalEditorViewOptions): boolean {
		return (
			this.theme === other.theme
			&& this.canUseTranslate3d === other.canUseTranslate3d
			&& this.experimentalScreenReader === other.experimentalScreenReader
			&& InternalEditorViewOptions._numberArraysEqual(this.rulers, other.rulers)
			&& this.ariaLabel === other.ariaLabel
			&& this.lineNumbers === other.lineNumbers
			&& this.selectOnLineNumbers === other.selectOnLineNumbers
			&& this.glyphMargin === other.glyphMargin
			&& this.revealHorizontalRightPadding === other.revealHorizontalRightPadding
			&& this.roundedSelection === other.roundedSelection
			&& this.overviewRulerLanes === other.overviewRulerLanes
			&& this.cursorBlinking === other.cursorBlinking
			&& this.mouseWheelZoom === other.mouseWheelZoom
			&& this.cursorStyle === other.cursorStyle
			&& this.hideCursorInOverviewRuler === other.hideCursorInOverviewRuler
			&& this.scrollBeyondLastLine === other.scrollBeyondLastLine
			&& this.editorClassName === other.editorClassName
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.renderWhitespace === other.renderWhitespace
			&& this.renderControlCharacters === other.renderControlCharacters
			&& this.renderIndentGuides === other.renderIndentGuides
			&& this.scrollbar.equals(other.scrollbar)
		);
	}

	/**
	 * @internal
	 */
	public createChangeEvent(newOpts:InternalEditorViewOptions): IViewConfigurationChangedEvent {
		return {
			theme: this.theme !== newOpts.theme,
			canUseTranslate3d: this.canUseTranslate3d !== newOpts.canUseTranslate3d,
			experimentalScreenReader: this.experimentalScreenReader !== newOpts.experimentalScreenReader,
			rulers: (!InternalEditorViewOptions._numberArraysEqual(this.rulers, newOpts.rulers)),
			ariaLabel: this.ariaLabel !== newOpts.ariaLabel,
			lineNumbers: this.lineNumbers !== newOpts.lineNumbers,
			selectOnLineNumbers: this.selectOnLineNumbers !== newOpts.selectOnLineNumbers,
			glyphMargin: this.glyphMargin !== newOpts.glyphMargin,
			revealHorizontalRightPadding: this.revealHorizontalRightPadding !== newOpts.revealHorizontalRightPadding,
			roundedSelection: this.roundedSelection !== newOpts.roundedSelection,
			overviewRulerLanes: this.overviewRulerLanes !== newOpts.overviewRulerLanes,
			cursorBlinking: this.cursorBlinking !== newOpts.cursorBlinking,
			mouseWheelZoom: this.mouseWheelZoom !== newOpts.mouseWheelZoom,
			cursorStyle: this.cursorStyle !== newOpts.cursorStyle,
			hideCursorInOverviewRuler: this.hideCursorInOverviewRuler !== newOpts.hideCursorInOverviewRuler,
			scrollBeyondLastLine: this.scrollBeyondLastLine !== newOpts.scrollBeyondLastLine,
			editorClassName: this.editorClassName !== newOpts.editorClassName,
			stopRenderingLineAfter: this.stopRenderingLineAfter !== newOpts.stopRenderingLineAfter,
			renderWhitespace: this.renderWhitespace !== newOpts.renderWhitespace,
			renderControlCharacters: this.renderControlCharacters !== newOpts.renderControlCharacters,
			renderIndentGuides: this.renderIndentGuides !== newOpts.renderIndentGuides,
			scrollbar: (!this.scrollbar.equals(newOpts.scrollbar)),
		};
	}

	/**
	 * @internal
	 */
	public clone(): InternalEditorViewOptions {
		return new InternalEditorViewOptions(this);
	}
}

export interface IViewConfigurationChangedEvent {
	theme: boolean;
	canUseTranslate3d: boolean;
	experimentalScreenReader: boolean;
	rulers: boolean;
	ariaLabel:  boolean;
	lineNumbers: boolean;
	selectOnLineNumbers: boolean;
	glyphMargin: boolean;
	revealHorizontalRightPadding: boolean;
	roundedSelection: boolean;
	overviewRulerLanes: boolean;
	cursorBlinking: boolean;
	mouseWheelZoom: boolean;
	cursorStyle: boolean;
	hideCursorInOverviewRuler: boolean;
	scrollBeyondLastLine: boolean;
	editorClassName:  boolean;
	stopRenderingLineAfter:  boolean;
	renderWhitespace:  boolean;
	renderControlCharacters: boolean;
	renderIndentGuides:  boolean;
	scrollbar: boolean;
}

export class EditorContribOptions {
	selectionClipboard: boolean;
	hover:boolean;
	contextmenu:boolean;
	quickSuggestions:boolean;
	quickSuggestionsDelay:number;
	parameterHints: boolean;
	iconsInSuggestions:boolean;
	formatOnType:boolean;
	suggestOnTriggerCharacters: boolean;
	acceptSuggestionOnEnter: boolean;
	selectionHighlight:boolean;
	referenceInfos: boolean;
	folding: boolean;

	/**
	 * @internal
	 */
	constructor(source:{
		selectionClipboard: boolean;
		hover:boolean;
		contextmenu:boolean;
		quickSuggestions:boolean;
		quickSuggestionsDelay:number;
		parameterHints:boolean;
		iconsInSuggestions:boolean;
		formatOnType:boolean;
		suggestOnTriggerCharacters: boolean;
		acceptSuggestionOnEnter: boolean;
		selectionHighlight:boolean;
		referenceInfos: boolean;
		folding: boolean;
	}) {
		this.selectionClipboard = Boolean(source.selectionClipboard);
		this.hover = Boolean(source.hover);
		this.contextmenu = Boolean(source.contextmenu);
		this.quickSuggestions = Boolean(source.quickSuggestions);
		this.quickSuggestionsDelay = source.quickSuggestionsDelay||0;
		this.parameterHints = Boolean(source.parameterHints);
		this.iconsInSuggestions = Boolean(source.iconsInSuggestions);
		this.formatOnType = Boolean(source.formatOnType);
		this.suggestOnTriggerCharacters = Boolean(source.suggestOnTriggerCharacters);
		this.acceptSuggestionOnEnter = Boolean(source.acceptSuggestionOnEnter);
		this.selectionHighlight = Boolean(source.selectionHighlight);
		this.referenceInfos = Boolean(source.referenceInfos);
		this.folding = Boolean(source.folding);
	}

	/**
	 * @internal
	 */
	public equals(other: EditorContribOptions): boolean {
		return (
			this.selectionClipboard === other.selectionClipboard
			&& this.hover === other.hover
			&& this.contextmenu === other.contextmenu
			&& this.quickSuggestions === other.quickSuggestions
			&& this.quickSuggestionsDelay === other.quickSuggestionsDelay
			&& this.parameterHints === other.parameterHints
			&& this.iconsInSuggestions === other.iconsInSuggestions
			&& this.formatOnType === other.formatOnType
			&& this.suggestOnTriggerCharacters === other.suggestOnTriggerCharacters
			&& this.acceptSuggestionOnEnter === other.acceptSuggestionOnEnter
			&& this.selectionHighlight === other.selectionHighlight
			&& this.referenceInfos === other.referenceInfos
			&& this.folding === other.folding
		);
	}

	/**
	 * @internal
	 */
	public clone(): EditorContribOptions {
		return new EditorContribOptions(this);
	}
}

/**
 * Internal configuration options (transformed or computed) for the editor.
 */
export class InternalEditorOptions {
	_internalEditorOptionsBrand: void;

	lineHeight:number; // todo: move to fontInfo

	readOnly:boolean;
	// ---- cursor options
	wordSeparators: string;
	autoClosingBrackets:boolean;
	useTabStops: boolean;
	tabFocusMode:boolean;
	// ---- grouped options
	layoutInfo: EditorLayoutInfo;
	fontInfo: FontInfo;
	viewInfo: InternalEditorViewOptions;
	wrappingInfo: EditorWrappingInfo;
	contribInfo: EditorContribOptions;

	/**
	 * @internal
	 */
	constructor(source: {
		lineHeight:number;
		readOnly:boolean;
		wordSeparators: string;
		autoClosingBrackets:boolean;
		useTabStops: boolean;
		tabFocusMode:boolean;
		layoutInfo: EditorLayoutInfo;
		fontInfo: FontInfo;
		viewInfo: InternalEditorViewOptions;
		wrappingInfo: EditorWrappingInfo;
		contribInfo: EditorContribOptions;
	}) {
		this.lineHeight = source.lineHeight|0;
		this.readOnly = Boolean(source.readOnly);
		this.wordSeparators = String(source.wordSeparators);
		this.autoClosingBrackets = Boolean(source.autoClosingBrackets);
		this.useTabStops = Boolean(source.useTabStops);
		this.tabFocusMode = Boolean(source.tabFocusMode);
		this.layoutInfo = source.layoutInfo.clone();
		this.fontInfo = source.fontInfo.clone();
		this.viewInfo = source.viewInfo.clone();
		this.wrappingInfo = source.wrappingInfo.clone();
		this.contribInfo = source.contribInfo.clone();
	}

	/**
	 * @internal
	 */
	public equals(other:InternalEditorOptions): boolean {
		return (
			this.lineHeight === other.lineHeight
			&& this.readOnly === other.readOnly
			&& this.wordSeparators === other.wordSeparators
			&& this.autoClosingBrackets === other.autoClosingBrackets
			&& this.useTabStops === other.useTabStops
			&& this.tabFocusMode === other.tabFocusMode
			&& this.layoutInfo.equals(other.layoutInfo)
			&& this.fontInfo.equals(other.fontInfo)
			&& this.viewInfo.equals(other.viewInfo)
			&& this.wrappingInfo.equals(other.wrappingInfo)
			&& this.contribInfo.equals(other.contribInfo)
		);
	}

	/**
	 * @internal
	 */
	public createChangeEvent(newOpts:InternalEditorOptions): IConfigurationChangedEvent {
		return {
			lineHeight: (this.lineHeight !== newOpts.lineHeight),
			readOnly: (this.readOnly !== newOpts.readOnly),
			wordSeparators: (this.wordSeparators !== newOpts.wordSeparators),
			autoClosingBrackets: (this.autoClosingBrackets !== newOpts.autoClosingBrackets),
			useTabStops: (this.useTabStops !== newOpts.useTabStops),
			tabFocusMode: (this.tabFocusMode !== newOpts.tabFocusMode),
			layoutInfo: (!this.layoutInfo.equals(newOpts.layoutInfo)),
			fontInfo: (!this.fontInfo.equals(newOpts.fontInfo)),
			viewInfo: this.viewInfo.createChangeEvent(newOpts.viewInfo),
			wrappingInfo: (!this.wrappingInfo.equals(newOpts.wrappingInfo)),
			contribInfo: (!this.contribInfo.equals(newOpts.contribInfo)),
		};
	}

	/**
	 * @internal
	 */
	public clone(): InternalEditorOptions {
		return new InternalEditorOptions(this);
	}
}

/**
 * An event describing that the configuration of the editor has changed.
 */
export interface IConfigurationChangedEvent {
	lineHeight: boolean;
	readOnly: boolean;
	wordSeparators: boolean;
	autoClosingBrackets: boolean;
	useTabStops: boolean;
	tabFocusMode: boolean;
	layoutInfo: boolean;
	fontInfo: boolean;
	viewInfo: IViewConfigurationChangedEvent;
	wrappingInfo: boolean;
	contribInfo: boolean;
}

/**
 * An event describing that one or more supports of a mode have changed.
 * @internal
 */
export interface IModeSupportChangedEvent {
	tokenizationSupport:boolean;
}

/**
 * Vertical Lane in the overview ruler of the editor.
 */
export enum OverviewRulerLane {
	Left = 1,
	Center = 2,
	Right = 4,
	Full = 7
}

/**
 * Options for rendering a model decoration in the overview ruler.
 */
export interface IModelDecorationOverviewRulerOptions {
	/**
	 * CSS color to render in the overview ruler.
	 * e.g.: rgba(100, 100, 100, 0.5)
	 */
	color: string;
	/**
	 * CSS color to render in the overview ruler.
	 * e.g.: rgba(100, 100, 100, 0.5)
	 */
	darkColor: string;
	/**
	 * The position in the overview ruler.
	 */
	position: OverviewRulerLane;
}

/**
 * Options for a model decoration.
 */
export interface IModelDecorationOptions {
	/**
	 * Customize the growing behaviour of the decoration when typing at the edges of the decoration.
	 * Defaults to TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
	 */
	stickiness?:TrackedRangeStickiness;
	/**
	 * CSS class name describing the decoration.
	 */
	className?:string;
	/**
	 * Message to be rendered when hovering over the glyph margin decoration.
	 * @internal
	 */
	glyphMarginHoverMessage?:string;
	/**
	 * Array of MarkedString to render as the decoration message.
	 */
	hoverMessage?:MarkedString | MarkedString[];
	/**
	 * Should the decoration expand to encompass a whole line.
	 */
	isWholeLine?:boolean;
	/**
	 * @deprecated : Use `overviewRuler` instead
	 */
	showInOverviewRuler?:string;
	/**
	 * If set, render this decoration in the overview ruler.
	 */
	overviewRuler?:IModelDecorationOverviewRulerOptions;
	/**
	 * If set, the decoration will be rendered in the glyph margin with this CSS class name.
	 */
	glyphMarginClassName?:string;
	/**
	 * If set, the decoration will be rendered in the lines decorations with this CSS class name.
	 */
	linesDecorationsClassName?:string;
	/**
	 * If set, the decoration will be rendered inline with the text with this CSS class name.
	 * Please use this only for CSS rules that must impact the text. For example, use `className`
	 * to have a background color decoration.
	 */
	inlineClassName?:string;
	/**
	 * If set, the decoration will be rendered before the text with this CSS class name.
	 */
	beforeContentClassName?:string;
	/**
	 * If set, the decoration will be rendered after the text with this CSS class name.
	 */
	afterContentClassName?:string;
}

/**
 * New model decorations.
 */
export interface IModelDeltaDecoration {
	/**
	 * Range that this decoration covers.
	 */
	range: IRange;
	/**
	 * Options associated with this decoration.
	 */
	options: IModelDecorationOptions;
}

/**
 * A tracked range in the model.
 * @internal
 */
export interface IModelTrackedRange {
	/**
	 * Identifier for a tracked range
	 */
	id: string;
	/**
	 * Range that this tracked range covers
	 */
	range: Range;
}

/**
 * A decoration in the model.
 */
export interface IModelDecoration {
	/**
	 * Identifier for a decoration.
	 */
	id: string;
	/**
	 * Identifier for a decoration's owener.
	 */
	ownerId: number;
	/**
	 * Range that this decoration covers.
	 */
	range: Range;
	/**
	 * Options associated with this decoration.
	 */
	options: IModelDecorationOptions;
}

/**
 * An accessor that can add, change or remove model decorations.
 * @internal
 */
export interface IModelDecorationsChangeAccessor {
	/**
	 * Add a new decoration.
	 * @param range Range that this decoration covers.
	 * @param options Options associated with this decoration.
	 * @return An unique identifier associated with this decoration.
	 */
	addDecoration(range:IRange, options:IModelDecorationOptions): string;
	/**
	 * Change the range that an existing decoration covers.
	 * @param id The unique identifier associated with the decoration.
	 * @param newRange The new range that this decoration covers.
	 */
	changeDecoration(id:string, newRange:IRange): void;
	/**
	 * Change the options associated with an existing decoration.
	 * @param id The unique identifier associated with the decoration.
	 * @param newOptions The new options associated with this decoration.
	 */
	changeDecorationOptions(id: string, newOptions:IModelDecorationOptions): void;
	/**
	 * Remove an existing decoration.
	 * @param id The unique identifier associated with the decoration.
	 */
	removeDecoration(id:string): void;
	/**
	 * Perform a minimum ammount of operations, in order to transform the decorations
	 * identified by `oldDecorations` to the decorations described by `newDecorations`
	 * and returns the new identifiers associated with the resulting decorations.
	 *
	 * @param oldDecorations Array containing previous decorations identifiers.
	 * @param newDecorations Array describing what decorations should result after the call.
	 * @return An array containing the new decorations identifiers.
	 */
	deltaDecorations(oldDecorations:string[], newDecorations:IModelDeltaDecoration[]): string[];
}

/**
 * Word inside a model.
 */
export interface IWordAtPosition {
	/**
	 * The word.
	 */
	word: string;
	/**
	 * The column where the word starts.
	 */
	startColumn: number;
	/**
	 * The column where the word ends.
	 */
	endColumn: number;
}

/**
 * Range of a word inside a model.
 * @internal
 */
export interface IWordRange {
	/**
	 * The index where the word starts.
	 */
	start:number;
	/**
	 * The index where the word ends.
	 */
	end:number;
}

/**
 * @internal
 */
export interface ITokenInfo {
	token: IToken;
	lineNumber: number;
	startColumn: number;
	endColumn: number;
}

/**
 * @internal
 */
export interface ITokenIterator {
	hasNext(): boolean;
	next(): ITokenInfo;
	hasPrev(): boolean;
	prev(): ITokenInfo;
}

/**
 * End of line character preference.
 */
export enum EndOfLinePreference {
	/**
	 * Use the end of line character identified in the text buffer.
	 */
	TextDefined = 0,
	/**
	 * Use line feed (\n) as the end of line character.
	 */
	LF = 1,
	/**
	 * Use carriage return and line feed (\r\n) as the end of line character.
	 */
	CRLF = 2
}

/**
 * The default end of line to use when instantiating models.
 */
export enum DefaultEndOfLine {
	/**
	 * Use line feed (\n) as the end of line character.
	 */
	LF = 1,
	/**
	 * Use carriage return and line feed (\r\n) as the end of line character.
	 */
	CRLF = 2
}

/**
 * End of line character preference.
 */
export enum EndOfLineSequence {
	/**
	 * Use line feed (\n) as the end of line character.
	 */
	LF = 0,
	/**
	 * Use carriage return and line feed (\r\n) as the end of line character.
	 */
	CRLF = 1
}

/**
 * A read-only line marker in the model.
 * @internal
 */
export interface IReadOnlyLineMarker {
	id: string;
	column: number;
}

/**
 * And identifier for a single edit operation.
 */
export interface ISingleEditOperationIdentifier {
	/**
	 * Identifier major
	 */
	major:number;
	/**
	 * Identifier minor
	 */
	minor:number;
}

/**
 * A builder and helper for edit operations for a command.
 */
export interface IEditOperationBuilder {
	/**
	 * Add a new edit operation (a replace operation).
	 * @param range The range to replace (delete). May be empty to represent a simple insert.
	 * @param text The text to replace with. May be null to represent a simple delete.
	 */
	addEditOperation(range:Range, text:string): void;

	/**
	 * Track `selection` when applying edit operations.
	 * A best effort will be made to not grow/expand the selection.
	 * An empty selection will clamp to a nearby character.
	 * @param selection The selection to track.
	 * @param trackPreviousOnEmpty If set, and the selection is empty, indicates whether the selection
	 *           should clamp to the previous or the next character.
	 * @return A unique identifer.
	 */
	trackSelection(selection:Selection, trackPreviousOnEmpty?:boolean): string;
}

/**
 * A helper for computing cursor state after a command.
 */
export interface ICursorStateComputerData {
	/**
	 * Get the inverse edit operations of the added edit operations.
	 */
	getInverseEditOperations(): IIdentifiedSingleEditOperation[];
	/**
	 * Get a previously tracked selection.
	 * @param id The unique identifier returned by `trackSelection`.
	 * @return The selection.
	 */
	getTrackedSelection(id:string): Selection;
}

/**
 * A command that modifies text / cursor state on a model.
 */
export interface ICommand {
	/**
	 * Get the edit operations needed to execute this command.
	 * @param model The model the command will execute on.
	 * @param builder A helper to collect the needed edit operations and to track selections.
	 */
	getEditOperations(model:ITokenizedModel, builder:IEditOperationBuilder): void;
	/**
	 * Compute the cursor state after the edit operations were applied.
	 * @param model The model the commad has executed on.
	 * @param helper A helper to get inverse edit operations and to get previously tracked selections.
	 * @return The cursor state after the command executed.
	 */
	computeCursorState(model:ITokenizedModel, helper:ICursorStateComputerData): Selection;
}

/**
 * A single edit operation, that acts as a simple replace.
 * i.e. Replace text at `range` with `text` in model.
 */
export interface ISingleEditOperation {
	/**
	 * The range to replace. This can be empty to emulate a simple insert.
	 */
	range: IRange;
	/**
	 * The text to replace with. This can be null to emulate a simple delete.
	 */
	text: string;
	/**
	 * This indicates that this operation has "insert" semantics.
	 * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
	 */
	forceMoveMarkers?: boolean;
}

/**
 * A single edit operation, that has an identifier.
 */
export interface IIdentifiedSingleEditOperation {
	/**
	 * An identifier associated with this single edit operation.
	 */
	identifier: ISingleEditOperationIdentifier;
	/**
	 * The range to replace. This can be empty to emulate a simple insert.
	 */
	range: Range;
	/**
	 * The text to replace with. This can be null to emulate a simple delete.
	 */
	text: string;
	/**
	 * This indicates that this operation has "insert" semantics.
	 * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
	 */
	forceMoveMarkers: boolean;
	/**
	 * This indicates that this operation is inserting automatic whitespace
	 * that can be removed on next model edit operation if `config.trimAutoWhitespace` is true.
	 */
	isAutoWhitespaceEdit?: boolean;
}

/**
 * A callback that can compute the cursor state after applying a series of edit operations.
 */
export interface ICursorStateComputer {
	/**
	 * A callback that can compute the resulting cursors state after some edit operations have been executed.
	 */
	(inverseEditOperations:IIdentifiedSingleEditOperation[]): Selection[];
}

/**
 * A list of tokens on a line.
 * @internal
 */
export interface ILineTokens {
	getTokenCount(): number;
	getTokenStartIndex(tokenIndex:number): number;
	getTokenType(tokenIndex:number): string;
	getTokenEndIndex(tokenIndex:number, textLength:number): number;

	/**
	 * Check if tokens have changed. This is called by the view to validate rendered lines
	 * and decide which lines need re-rendering.
	 */
	equals(other:ILineTokens): boolean;

	/**
	 * Find the token containing offset `offset`.
	 *    For example, with the following tokens [0, 5), [5, 9), [9, infinity)
	 *    Searching for 0, 1, 2, 3 or 4 will return 0.
	 *    Searching for 5, 6, 7 or 8 will return 1.
	 *    Searching for 9, 10, 11, ... will return 2.
	 * @param offset The search offset
	 * @return The index of the token containing the offset.
	 */
	findIndexOfOffset(offset:number): number;

	/**
	 * @internal
	 */
	sliceAndInflate(startOffset:number, endOffset:number, deltaStartIndex:number): ViewLineToken[];

	/**
	 * @internal
	 */
	inflate(): ViewLineToken[];
}

export interface ITextModelResolvedOptions {
	tabSize: number;
	insertSpaces: boolean;
	defaultEOL: DefaultEndOfLine;
	trimAutoWhitespace: boolean;
}

/**
 * @internal
 */
export interface ITextModelCreationOptions {
	tabSize: number;
	insertSpaces: boolean;
	detectIndentation: boolean;
	trimAutoWhitespace: boolean;
	defaultEOL: DefaultEndOfLine;
}

export interface ITextModelUpdateOptions {
	tabSize?: number;
	insertSpaces?: boolean;
	trimAutoWhitespace?: boolean;
}

export interface IModelOptionsChangedEvent {
	tabSize: boolean;
	insertSpaces: boolean;
	trimAutoWhitespace: boolean;
}

/**
 * A textual read-only model.
 */
export interface ITextModel {

	getOptions(): ITextModelResolvedOptions;

	/**
	 * Get the current version id of the model.
	 * Anytime a change happens to the model (even undo/redo),
	 * the version id is incremented.
	 */
	getVersionId(): number;

	/**
	 * Get the alternative version id of the model.
	 * This alternative version id is not always incremented,
	 * it will return the same values in the case of undo-redo.
	 */
	getAlternativeVersionId(): number;

	/**
	 * Replace the entire text buffer value contained in this model.
	 */
	setValue(newValue:string): void;

	/**
	 * Replace the entire text buffer value contained in this model.
	 */
	setValueFromRawText(newValue:IRawText): void;

	/**
	 * Get the text stored in this model.
	 * @param eol The end of line character preference. Defaults to `EndOfLinePreference.TextDefined`.
	 * @param preserverBOM Preserve a BOM character if it was detected when the model was constructed.
	 * @return The text.
	 */
	getValue(eol?:EndOfLinePreference, preserveBOM?:boolean): string;

	/**
	 * Get the length of the text stored in this model.
	 */
	getValueLength(eol?:EndOfLinePreference, preserveBOM?:boolean): number;

	/**
	 * Get the raw text stored in this model.
	 */
	toRawText(): IRawText;

	/**
	 * Check if the raw text stored in this model equals another raw text.
	 */
	equals(other:IRawText): boolean;

	/**
	 * Get the text in a certain range.
	 * @param range The range describing what text to get.
	 * @param eol The end of line character preference. This will only be used for multiline ranges. Defaults to `EndOfLinePreference.TextDefined`.
	 * @return The text.
	 */
	getValueInRange(range:IRange, eol?:EndOfLinePreference): string;

	/**
	 * Get the length of text in a certain range.
	 * @param range The range describing what text length to get.
	 * @return The text length.
	 */
	getValueLengthInRange(range:IRange): number;

	/**
	 * Splits characters in two buckets. First bucket (A) is of characters that
	 * sit in lines with length < `LONG_LINE_BOUNDARY`. Second bucket (B) is of
	 * characters that sit in lines with length >= `LONG_LINE_BOUNDARY`.
	 * If count(B) > count(A) return true. Returns false otherwise.
	 * @internal
	 */
	isDominatedByLongLines(): boolean;

	/**
	 * Get the number of lines in the model.
	 */
	getLineCount(): number;

	/**
	 * Get the text for a certain line.
	 */
	getLineContent(lineNumber:number): string;

	/**
	 * @internal
	 */
	getIndentLevel(lineNumber:number): number;

	/**
	 * @internal
	 */
	getIndentRanges(): IndentRange[];

	/**
	 * @internal
	 */
	getLineIndentGuide(lineNumber:number): number;

	/**
	 * Get the text for all lines.
	 */
	getLinesContent(): string[];

	/**
	 * Get the end of line sequence predominantly used in the text buffer.
	 * @return EOL char sequence (e.g.: '\n' or '\r\n').
	 */
	getEOL(): string;

	/**
	 * Change the end of line sequence used in the text buffer.
	 */
	setEOL(eol: EndOfLineSequence): void;

	/**
	 * Get the minimum legal column for line at `lineNumber`
	 */
	getLineMinColumn(lineNumber:number): number;

	/**
	 * Get the maximum legal column for line at `lineNumber`
	 */
	getLineMaxColumn(lineNumber:number): number;

	/**
	 * Returns the column before the first non whitespace character for line at `lineNumber`.
	 * Returns 0 if line is empty or contains only whitespace.
	 */
	getLineFirstNonWhitespaceColumn(lineNumber:number): number;

	/**
	 * Returns the column after the last non whitespace character for line at `lineNumber`.
	 * Returns 0 if line is empty or contains only whitespace.
	 */
	getLineLastNonWhitespaceColumn(lineNumber:number): number;

	/**
	 * Create a valid position,
	 */
	validatePosition(position:IPosition): Position;

	/**
	 * Advances the given position by the given offest (negative offsets are also accepted)
	 * and returns it as a new valid position.
	 *
	 * If the offset and position are such that their combination goes beyond the beginning or
	 * end of the model, throws an exception.
	 *
	 * If the ofsset is such that the new position would be in the middle of a multi-byte
	 * line terminator, throws an exception.
	 */
	modifyPosition(position: IPosition, offset: number): Position;

	/**
	 * Create a valid range.
	 */
	validateRange(range:IRange): Range;

	/**
	 * Converts the position to a zero-based offset.
	 *
	 * The position will be [adjusted](#TextDocument.validatePosition).
	 *
	 * @param position A position.
	 * @return A valid zero-based offset.
	 */
	getOffsetAt(position: IPosition): number;

	/**
	 * Converts a zero-based offset to a position.
	 *
	 * @param offset A zero-based offset.
	 * @return A valid [position](#Position).
	 */
	getPositionAt(offset: number): Position;

	/**
	 * Get a range covering the entire model
	 */
	getFullModelRange(): Range;

	/**
	 * Returns iff the model was disposed or not.
	 */
	isDisposed(): boolean;

	/**
	 * No mode supports allowed on this model because it is simply too large.
	 * (even tokenization would cause too much memory pressure)
	 * @internal
	 */
	isTooLargeForHavingAMode(): boolean;

	/**
	 * Only basic mode supports allowed on this model because it is simply too large.
	 * (tokenization is allowed and other basic supports)
	 * @internal
	 */
	isTooLargeForHavingARichMode(): boolean;
}

export interface IReadOnlyModel extends ITextModel {
	/**
	 * Gets the resource associated with this editor model.
	 */
	uri: URI;

	/**
	 * Get the language associated with this model.
	 */
	getModeId(): string;

	/**
	 * Get the word under or besides `position`.
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Might be null.
	 */
	getWordAtPosition(position:IPosition): IWordAtPosition;

	/**
	 * Get the word under or besides `position` trimmed to `position`.column
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Will never be null.
	 */
	getWordUntilPosition(position:IPosition): IWordAtPosition;
}

/**
 * @internal
 */
export interface IRichEditBracket {
	modeId: string;
	open: string;
	close: string;
	forwardRegex: RegExp;
	reversedRegex: RegExp;
}

/**
 * @internal
 */
export interface IFoundBracket {
	range: Range;
	open: string;
	close: string;
	isOpen: boolean;
}

/**
 * A model that is tokenized.
 */
export interface ITokenizedModel extends ITextModel {

	/**
	 * Tokenize if necessary and get the tokens for the line `lineNumber`.
	 * @param lineNumber The line number
	 * @param inaccurateTokensAcceptable Are inaccurate tokens acceptable? Defaults to false
	 * @internal
	 */
	getLineTokens(lineNumber:number, inaccurateTokensAcceptable?:boolean): ILineTokens;

	/**
	 * Tokenize if necessary and get the tokenization result for the line `lineNumber`, as returned by the language mode.
	 * @internal
	 */
	getLineContext(lineNumber:number): ILineContext;

	/**
	 * @internal
	 */
	_getLineModeTransitions(lineNumber:number): ModeTransition[];

	/**
	 * Get the current language mode associated with the model.
	 */
	getMode(): IMode;

	/**
	 * Set the current language mode associated with the model.
	 */
	setMode(newMode:IMode|TPromise<IMode>): void;

	/**
	 * A mode can be currently pending loading if a promise is used when constructing a model or calling setMode().
	 *
	 * If there is no currently pending loading mode, then the result promise will complete immediately.
	 * Otherwise, the result will complete once the currently pending loading mode is loaded.
	 * @internal
	 */
	whenModeIsReady(): TPromise<IMode>;

	/**
	 * Returns the true (inner-most) language mode at a given position.
	 * @internal
	 */
	getModeIdAtPosition(lineNumber:number, column:number): string;

	/**
	 * Get the word under or besides `position`.
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Might be null.
	 */
	getWordAtPosition(position:IPosition): IWordAtPosition;

	/**
	 * Get the word under or besides `position` trimmed to `position`.column
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Will never be null.
	 */
	getWordUntilPosition(position:IPosition): IWordAtPosition;

	/**
	 * Returns an iterator that can be used to read
	 * next and previous tokens from the provided position.
	 * The iterator is made available through the callback
	 * function and can't be used afterwards.
	 * @internal
	 */
	tokenIterator(position: IPosition, callback: (it: ITokenIterator) =>any): any;

	/**
	 * Find the matching bracket of `request` up, counting brackets.
	 * @param request The bracket we're searching for
	 * @param position The position at which to start the search.
	 * @return The range of the matching bracket, or null if the bracket match was not found.
	 * @internal
	 */
	findMatchingBracketUp(bracket:string, position:IPosition): Range;

	// /**
	//  * Find the first bracket in the model before `position`.
	//  * @param position The position at which to start the search.
	//  * @return The info for the first bracket before `position`, or null if there are no more brackets before `positions`.
	//  */
	// findPrevBracket(position:IPosition): IFoundBracket;

	// /**
	//  * Find the first bracket in the model after `position`.
	//  * @param position The position at which to start the search.
	//  * @return The info for the first bracket after `position`, or null if there are no more brackets after `positions`.
	//  */
	// findNextBracket(position:IPosition): IFoundBracket;

	/**
	 * Given a `position`, if the position is on top or near a bracket,
	 * find the matching bracket of that bracket and return the ranges of both brackets.
	 * @param position The position at which to look for a bracket.
	 * @internal
	 */
	matchBracket(position:IPosition): [Range,Range];
}

/**
 * A model that can track markers.
 */
export interface ITextModelWithMarkers extends ITextModel {
	/**
	 * @internal
	 */
	_addMarker(lineNumber:number, column:number, stickToPreviousCharacter:boolean): string;
	/**
	 * @internal
	 */
	_changeMarker(id:string, newLineNumber:number, newColumn:number): void;
	/**
	 * @internal
	 */
	_changeMarkerStickiness(id:string, newStickToPreviousCharacter:boolean): void;
	/**
	 * @internal
	 */
	_getMarker(id:string): Position;
	/**
	 * @internal
	 */
	_removeMarker(id:string): void;
	/**
	 * @internal
	 */
	_getLineMarkers(lineNumber: number): IReadOnlyLineMarker[];
}

/**
 * A map of changed ranges used during the model internal processing
 * @internal
 */
export interface IChangedTrackedRanges {
	[key:string]:IRange;
}

/**
 * Describes the behaviour of decorations when typing/editing near their edges.
 */
export enum TrackedRangeStickiness {
	AlwaysGrowsWhenTypingAtEdges = 0,
	NeverGrowsWhenTypingAtEdges = 1,
	GrowsOnlyWhenTypingBefore = 2,
	GrowsOnlyWhenTypingAfter = 3,
}

/**
 * A model that can track ranges.
 */
export interface ITextModelWithTrackedRanges extends ITextModel {
	/**
	 * Start tracking a range (across edit operations).
	 * @param range The range to start tracking.
	 * @param stickiness The behaviour when typing at the edges of the range.
	 * @return A unique identifier for the tracked range.
	 * @internal
	 */
	addTrackedRange(range:IRange, stickiness:TrackedRangeStickiness): string;

	/**
	 * Change the range of a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRange` call.
	 * @param newRange The new range of the tracked range.
	 * @internal
	 */
	changeTrackedRange(id:string, newRange:IRange): void;

	/**
	 * Change the stickiness (behaviour when typing at the edges of the range) for a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRange` call.
	 * @param newStickiness The new behaviour when typing at the edges of the range.
	 * @internal
	 */
	changeTrackedRangeStickiness(id:string, newStickiness:TrackedRangeStickiness): void;

	/**
	 * Remove a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRaneg` call.
	 * @internal
	 */
	removeTrackedRange(id:string): void;

	/**
	 * Get the range of a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRaneg` call.
	 * @internal
	 */
	getTrackedRange(id:string): Range;

	/**
	 * Gets all the tracked ranges for the lines between `startLineNumber` and `endLineNumber` as an array.
	 * @param startLineNumber The start line number
	 * @param endLineNumber The end line number
	 * @return An array with the tracked ranges
	 * @internal
	 */
	getLinesTrackedRanges(startLineNumber:number, endLineNumber:number): IModelTrackedRange[];
}

/**
 * A model that can have decorations.
 */
export interface ITextModelWithDecorations {
	/**
	 * Change the decorations. The callback will be called with a change accessor
	 * that becomes invalid as soon as the callback finishes executing.
	 * This allows for all events to be queued up until the change
	 * is completed. Returns whatever the callback returns.
	 * @param ownerId Identifies the editor id in which these decorations should appear. If no `ownerId` is provided, the decorations will appear in all editors that attach this model.
	 * @internal
	 */
	changeDecorations(callback: (changeAccessor:IModelDecorationsChangeAccessor)=>any, ownerId?:number): any;

	/**
	 * Perform a minimum ammount of operations, in order to transform the decorations
	 * identified by `oldDecorations` to the decorations described by `newDecorations`
	 * and returns the new identifiers associated with the resulting decorations.
	 *
	 * @param oldDecorations Array containing previous decorations identifiers.
	 * @param newDecorations Array describing what decorations should result after the call.
	 * @param ownerId Identifies the editor id in which these decorations should appear. If no `ownerId` is provided, the decorations will appear in all editors that attach this model.
	 * @return An array containing the new decorations identifiers.
	 */
	deltaDecorations(oldDecorations:string[], newDecorations:IModelDeltaDecoration[], ownerId?:number): string[];

	/**
	 * Remove all decorations that have been added with this specific ownerId.
	 * @param ownerId The owner id to search for.
	 * @internal
	 */
	removeAllDecorationsWithOwnerId(ownerId:number): void;

	/**
	 * Get the options associated with a decoration.
	 * @param id The decoration id.
	 * @return The decoration options or null if the decoration was not found.
	 */
	getDecorationOptions(id:string): IModelDecorationOptions;

	/**
	 * Get the range associated with a decoration.
	 * @param id The decoration id.
	 * @return The decoration range or null if the decoration was not found.
	 */
	getDecorationRange(id:string): Range;

	/**
	 * Gets all the decorations for the line `lineNumber` as an array.
	 * @param lineNumber The line number
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getLineDecorations(lineNumber:number, ownerId?:number, filterOutValidation?:boolean): IModelDecoration[];

	/**
	 * Gets all the decorations for the lines between `startLineNumber` and `endLineNumber` as an array.
	 * @param startLineNumber The start line number
	 * @param endLineNumber The end line number
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getLinesDecorations(startLineNumber:number, endLineNumber:number, ownerId?:number, filterOutValidation?:boolean): IModelDecoration[];

	/**
	 * Gets all the deocorations in a range as an array. Only `startLineNumber` and `endLineNumber` from `range` are used for filtering.
	 * So for now it returns all the decorations on the same line as `range`.
	 * @param range The range to search in
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getDecorationsInRange(range:IRange, ownerId?:number, filterOutValidation?:boolean): IModelDecoration[];

	/**
	 * Gets all the decorations as an array.
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 */
	getAllDecorations(ownerId?:number, filterOutValidation?:boolean): IModelDecoration[];
}

/**
 * An editable text model.
 */
export interface IEditableTextModel extends ITextModelWithMarkers {

	/**
	 * Normalize a string containing whitespace according to indentation rules (converts to spaces or to tabs).
	 */
	normalizeIndentation(str:string): string;

	/**
	 * Get what is considered to be one indent (e.g. a tab character or 4 spaces, etc.).
	 */
	getOneIndent(): string;

	/**
	 * Change the options of this model.
	 */
	updateOptions(newOpts:ITextModelUpdateOptions): void;

	/**
	 * Detect the indentation options for this model from its content.
	 */
	detectIndentation(defaultInsertSpaces:boolean, defaultTabSize:number): void;

	/**
	 * Push a stack element onto the undo stack. This acts as an undo/redo point.
	 * The idea is to use `pushEditOperations` to edit the model and then to
	 * `pushStackElement` to create an undo/redo stop point.
	 */
	pushStackElement(): void;

	/**
	 * Push edit operations, basically editing the model. This is the preferred way
	 * of editing the model. The edit operations will land on the undo stack.
	 * @param beforeCursorState The cursor state before the edit operaions. This cursor state will be returned when `undo` or `redo` are invoked.
	 * @param editOperations The edit operations.
	 * @param cursorStateComputer A callback that can compute the resulting cursors state after the edit operations have been executed.
	 * @return The cursor state returned by the `cursorStateComputer`.
	 */
	pushEditOperations(beforeCursorState:Selection[], editOperations:IIdentifiedSingleEditOperation[], cursorStateComputer:ICursorStateComputer): Selection[];

	/**
	 * Edit the model without adding the edits to the undo stack.
	 * This can have dire consequences on the undo stack! See @pushEditOperations for the preferred way.
	 * @param operations The edit operations.
	 * @return The inverse edit operations, that, when applied, will bring the model back to the previous state.
	 */
	applyEdits(operations:IIdentifiedSingleEditOperation[]): IIdentifiedSingleEditOperation[];

	/**
	 * Undo edit operations until the first previous stop point created by `pushStackElement`.
	 * The inverse edit operations will be pushed on the redo stack.
	 * @internal
	 */
	undo(): Selection[];

	/**
	 * Redo edit operations until the next stop point created by `pushStackElement`.
	 * The inverse edit operations will be pushed on the undo stack.
	 * @internal
	 */
	redo(): Selection[];

	/**
	 * Set an editable range on the model.
	 * @internal
	 */
	setEditableRange(range:IRange): void;

	/**
	 * Check if the model has an editable range.
	 * @internal
	 */
	hasEditableRange(): boolean;

	/**
	 * Get the editable range on the model.
	 * @internal
	 */
	getEditableRange(): Range;
}

/**
 * A model.
 */
export interface IModel extends IReadOnlyModel, IEditableTextModel, ITextModelWithMarkers, ITokenizedModel, ITextModelWithTrackedRanges, ITextModelWithDecorations, IEditorModel {
	/**
	 * @deprecated Please use `onDidChangeContent` instead.
	 * An event emitted when the contents of the model have changed.
	 * @internal
	 */
	onDidChangeRawContent(listener: (e:IModelContentChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the contents of the model have changed.
	 */
	onDidChangeContent(listener: (e:IModelContentChangedEvent2)=>void): IDisposable;
	/**
	 * @internal
	 */
	onDidChangeModeSupport(listener: (e:IModeSupportChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when decorations of the model have changed.
	 */
	onDidChangeDecorations(listener: (e:IModelDecorationsChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the model options have changed.
	 */
	onDidChangeOptions(listener: (e:IModelOptionsChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the language associated with the model has changed.
	 */
	onDidChangeMode(listener: (e:IModelModeChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted right before disposing the model.
	 */
	onWillDispose(listener: ()=>void): IDisposable;

	/**
	 * @internal
	 */
	addBulkListener(listener:BulkListenerCallback):IDisposable;

	/**
	 * A unique identifier associated with this model.
	 */
	id: string;

	/**
	 * Destroy this model. This will unbind the model from the mode
	 * and make all necessary clean-up to release this object to the GC.
	 * @internal
	 */
	destroy(): void;

	/**
	 * Destroy this model. This will unbind the model from the mode
	 * and make all necessary clean-up to release this object to the GC.
	 */
	dispose(): void;

	/**
	 * Search the model.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchOnlyEditableRange Limit the searching to only search inside the editable range of the model.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @param limitResultCount Limit the number of results
	 * @return The ranges where the matches are. It is empty if not matches have been found.
	 */
	findMatches(searchString:string, searchOnlyEditableRange:boolean, isRegex:boolean, matchCase:boolean, wholeWord:boolean, limitResultCount?:number): Range[];
	/**
	 * Search the model.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchScope Limit the searching to only search inside this range.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @param limitResultCount Limit the number of results
	 * @return The ranges where the matches are. It is empty if no matches have been found.
	 */
	findMatches(searchString:string, searchScope:IRange, isRegex:boolean, matchCase:boolean, wholeWord:boolean, limitResultCount?:number): Range[];
	/**
	 * Search the model for the next match. Loops to the beginning of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @return The range where the next match is. It is null if no next match has been found.
	 */
	findNextMatch(searchString:string, searchStart:IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): Range;
	/**
	 * Search the model for the previous match. Loops to the end of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @return The range where the previous match is. It is null if no previous match has been found.
	 */
	findPreviousMatch(searchString:string, searchStart:IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): Range;

	/**
	 * @internal
	 */
	onBeforeAttached(): void;

	/**
	 * @internal
	 */
	onBeforeDetached(): void;

	/**
	 * Returns iff this model is attached to an editor or not.
	 * @internal
	 */
	isAttachedToEditor(): boolean;
}

/**
 * @internal
 */
export interface IRangeWithText {
	text:string;
	range:IRange;
}

/**
 * @internal
 */
export interface IMirrorModel extends IEventEmitter, ITokenizedModel {
	uri: URI;

	getOffsetFromPosition(position:IPosition): number;
	getPositionFromOffset(offset:number): Position;
	getOffsetAndLengthFromRange(range:IRange): {offset:number; length:number;};
	getRangeFromOffsetAndLength(offset:number, length:number): Range;
	getLineStart(lineNumber:number): number;

	getAllWordsWithRange(): IRangeWithText[];
	getAllUniqueWords(skipWordOnce?:string): string[];

	getModeId(): string;
}

/**
 * An event describing that the current mode associated with a model has changed.
 */
export interface IModelModeChangedEvent {
	/**
	 * Previous mode
	 */
	oldMode:IMode;
	/**
	 * New mode
	 */
	newMode:IMode;
}

/**
 * An event describing a change in the text of a model.
 */
export interface IModelContentChangedEvent2 {
	/**
	 * The range that got replaced.
	 */
	range: IRange;
	/**
	 * The length of the range that got replaced.
	 */
	rangeLength: number;
	/**
	 * The new text for the range.
	 */
	text: string;
	/**
	 * The (new) end-of-line character.
	 */
	eol: string;
	/**
	 * The new version id the model has transitioned to.
	 */
	versionId: number;
	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	isUndoing: boolean;
	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	isRedoing: boolean;
}
/**
 * An event describing a change in the text of a model.
 * @internal
 */
export interface IModelContentChangedEvent {
	/**
	 * The event type. It can be used to detect the actual event type:
	 * 		EditorCommon.EventType.ModelContentChangedFlush => IModelContentChangedFlushEvent
	 * 		EditorCommon.EventType.ModelContentChangedLinesDeleted => IModelContentChangedLineChangedEvent
	 * 		EditorCommon.EventType.ModelContentChangedLinesInserted => IModelContentChangedLinesDeletedEvent
	 * 		EditorCommon.EventType.ModelContentChangedLineChanged => IModelContentChangedLinesInsertedEvent
	 */
	changeType: string;
	/**
	 * The new version id the model has transitioned to.
	 */
	versionId: number;
	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	isUndoing: boolean;
	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	isRedoing: boolean;
}

/**
 * The raw text backing a model.
 */
export interface IRawText {
	/**
	 * The entire text length.
	 */
	length: number;
	/**
	 * The text split into lines.
	 */
	lines: string[];
	/**
	 * The BOM (leading character sequence of the file).
	 */
	BOM: string;
	/**
	 * The end of line sequence.
	 */
	EOL: string;
	/**
	 * The options associated with this text.
	 */
	options: ITextModelResolvedOptions;
}

/**
 * An event describing that a model has been reset to a new value.
 * @internal
 */
export interface IModelContentChangedFlushEvent extends IModelContentChangedEvent {
	/**
	 * The new text content of the model.
	 */
	detail: IRawText;
}
/**
 * An event describing that a line has changed in a model.
 * @internal
 */
export interface IModelContentChangedLineChangedEvent extends IModelContentChangedEvent {
	/**
	 * The line that has changed.
	 */
	lineNumber: number;
	/**
	 * The new value of the line.
	 */
	detail: string;
}
/**
 * An event describing that line(s) have been deleted in a model.
 * @internal
 */
export interface IModelContentChangedLinesDeletedEvent extends IModelContentChangedEvent {
	/**
	 * At what line the deletion began (inclusive).
	 */
	fromLineNumber: number;
	/**
	 * At what line the deletion stopped (inclusive).
	 */
	toLineNumber: number;
}
/**
 * An event describing that line(s) have been inserted in a model.
 * @internal
 */
export interface IModelContentChangedLinesInsertedEvent extends IModelContentChangedEvent {
	/**
	 * Before what line did the insertion begin
	 */
	fromLineNumber: number;
	/**
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	toLineNumber: number;
	/**
	 * The text that was inserted
	 */
	detail: string;
}
/**
 * Decoration data associated with a model decorations changed event.
 */
export interface IModelDecorationsChangedEventDecorationData {
	/**
	 * The id of the decoration.
	 */
	id:string;
	/**
	 * The owner id of the decoration.
	 */
	ownerId:number;
	/**
	 * The range of the decoration.
	 */
	range:IRange;
	/**
	 * A flag describing if this is a problem decoration (e.g. warning/error).
	 */
	isForValidation:boolean;
	/**
	 * The options for this decoration.
	 */
	options:IModelDecorationOptions;
}
/**
 * An event describing that model decorations have changed.
 */
export interface IModelDecorationsChangedEvent {
	/**
	 * A summary with ids of decorations that have changed.
	 */
	ids:string[];
	/**
	 * Lists of details for added or changed decorations.
	 */
	addedOrChangedDecorations:IModelDecorationsChangedEventDecorationData[];
	/**
	 * List of ids for removed decorations.
	 */
	removedDecorations:string[];
	/**
	 * Details regarding old options.
	 */
	oldOptions:{[decorationId:string]:IModelDecorationOptions;};
	/**
	 * Details regarding old ranges.
	 */
	oldRanges:{[decorationId:string]:IRange;};
}
/**
 * An event describing that a range of lines has been tokenized
 */
export interface IModelTokensChangedEvent {
	/**
	 * The start of the range (inclusive)
	 */
	fromLineNumber:number;
	/**
	 * The end of the range (inclusive)
	 */
	toLineNumber:number;
}

/**
 * Describes the reason the cursor has changed its position.
 */
export enum CursorChangeReason {
	/**
	 * Unknown or not set.
	 */
	NotSet = 0,
	/**
	 * A `model.setValue()` was called.
	 */
	ContentFlush = 1,
	/**
	 * The `model` has been changed outside of this cursor and the cursor recovers its position from associated markers.
	 */
	RecoverFromMarkers = 2,
	/**
	 * There was an explicit user gesture.
	 */
	Explicit = 3,
	/**
	 * There was a Paste.
	 */
	Paste = 4,
	/**
	 * There was an Undo.
	 */
	Undo = 5,
	/**
	 * There was a Redo.
	 */
	Redo = 6,
}
/**
 * An event describing that the cursor position has changed.
 */
export interface ICursorPositionChangedEvent {
	/**
	 * Primary cursor's position.
	 */
	position:Position;
	/**
	 * Primary cursor's view position
	 */
	viewPosition:Position;
	/**
	 * Secondary cursors' position.
	 */
	secondaryPositions:Position[];
	/**
	 * Secondary cursors' view position.
	 */
	secondaryViewPositions:Position[];
	/**
	 * Reason.
	 */
	reason:CursorChangeReason;
	/**
	 * Source of the call that caused the event.
	 */
	source:string;
	/**
	 * Is the primary cursor in the editable range?
	 */
	isInEditableRange:boolean;
}
/**
 * An event describing that the cursor selection has changed.
 */
export interface ICursorSelectionChangedEvent {
	/**
	 * The primary selection.
	 */
	selection:Selection;
	/**
	 * The primary selection in view coordinates.
	 */
	viewSelection:Selection;
	/**
	 * The secondary selections.
	 */
	secondarySelections:Selection[];
	/**
	 * The secondary selections in view coordinates.
	 */
	secondaryViewSelections:Selection[];
	/**
	 * Source of the call that caused the event.
	 */
	source:string;
	/**
	 * Reason.
	 */
	reason:CursorChangeReason;
}
/**
 * @internal
 */
export enum VerticalRevealType {
	Simple = 0,
	Center = 1,
	CenterIfOutsideViewport = 2
}
/**
 * An event describing a request to reveal a specific range in the view of the editor.
 * @internal
 */
export interface ICursorRevealRangeEvent {
	/**
	 * Range to be reavealed.
	 */
	range:Range;
	/**
	 * View range to be reavealed.
	 */
	viewRange:Range;

	verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	revealHorizontal:boolean;
}

/**
 * @internal
 */
export interface ICursorScrollRequestEvent {
	deltaLines: number;
}

/**
 * An event describing that an editor has had its model reset (i.e. `editor.setModel()`).
 */
export interface IModelChangedEvent {
	/**
	 * The `uri` of the previous model or null.
	 */
	oldModelUrl: URI;
	/**
	 * The `uri` of the new model or null.
	 */
	newModelUrl: URI;
}

/**
 * @internal
 */
export interface IEditorWhitespace {
	id:number;
	afterLineNumber:number;
	heightInLines:number;
}

/**
 * A description for the overview ruler position.
 */
export class OverviewRulerPosition {
	_overviewRulerPositionBrand: void;

	/**
	 * Width of the overview ruler
	 */
	width:number;
	/**
	 * Height of the overview ruler
	 */
	height:number;
	/**
	 * Top position for the overview ruler
	 */
	top:number;
	/**
	 * Right position for the overview ruler
	 */
	right:number;

	/**
	 * @internal
	 */
	constructor(source:{
		width:number;
		height:number;
		top:number;
		right:number;
	}) {
		this.width = source.width|0;
		this.height = source.height|0;
		this.top = source.top|0;
		this.right = source.right|0;
	}

	/**
	 * @internal
	 */
	public equals(other:OverviewRulerPosition): boolean {
		return (
			this.width === other.width
			&& this.height === other.height
			&& this.top === other.top
			&& this.right === other.right
		);
	}

	/**
	 * @internal
	 */
	public clone(): OverviewRulerPosition {
		return new OverviewRulerPosition(this);
	}
}

/**
 * The internal layout details of the editor.
 */
export class EditorLayoutInfo {
	_editorLayoutInfoBrand: void;

	/**
	 * Full editor width.
	 */
	width:number;
	/**
	 * Full editor height.
	 */
	height:number;

	/**
	 * Left position for the glyph margin.
	 */
	glyphMarginLeft:number;
	/**
	 * The width of the glyph margin.
	 */
	glyphMarginWidth:number;
	/**
	 * The height of the glyph margin.
	 */
	glyphMarginHeight:number;

	/**
	 * Left position for the line numbers.
	 */
	lineNumbersLeft:number;
	/**
	 * The width of the line numbers.
	 */
	lineNumbersWidth:number;
	/**
	 * The height of the line numbers.
	 */
	lineNumbersHeight:number;

	/**
	 * Left position for the line decorations.
	 */
	decorationsLeft:number;
	/**
	 * The width of the line decorations.
	 */
	decorationsWidth:number;
	/**
	 * The height of the line decorations.
	 */
	decorationsHeight:number;

	/**
	 * Left position for the content (actual text)
	 */
	contentLeft:number;
	/**
	 * The width of the content (actual text)
	 */
	contentWidth:number;
	/**
	 * The height of the content (actual height)
	 */
	contentHeight:number;

	/**
	 * The width of the vertical scrollbar.
	 */
	verticalScrollbarWidth:number;
	/**
	 * The height of the horizontal scrollbar.
	 */
	horizontalScrollbarHeight:number;

	/**
	 * The position of the overview ruler.
	 */
	overviewRuler:OverviewRulerPosition;

	/**
	 * @internal
	 */
	constructor(source:{
		width:number;
		height:number;
		glyphMarginLeft:number;
		glyphMarginWidth:number;
		glyphMarginHeight:number;
		lineNumbersLeft:number;
		lineNumbersWidth:number;
		lineNumbersHeight:number;
		decorationsLeft:number;
		decorationsWidth:number;
		decorationsHeight:number;
		contentLeft:number;
		contentWidth:number;
		contentHeight:number;
		verticalScrollbarWidth:number;
		horizontalScrollbarHeight:number;
		overviewRuler:OverviewRulerPosition;
	}) {
		this.width = source.width|0;
		this.height = source.height|0;
		this.glyphMarginLeft = source.glyphMarginLeft|0;
		this.glyphMarginWidth = source.glyphMarginWidth|0;
		this.glyphMarginHeight = source.glyphMarginHeight|0;
		this.lineNumbersLeft = source.lineNumbersLeft|0;
		this.lineNumbersWidth = source.lineNumbersWidth|0;
		this.lineNumbersHeight = source.lineNumbersHeight|0;
		this.decorationsLeft = source.decorationsLeft|0;
		this.decorationsWidth = source.decorationsWidth|0;
		this.decorationsHeight = source.decorationsHeight|0;
		this.contentLeft = source.contentLeft|0;
		this.contentWidth = source.contentWidth|0;
		this.contentHeight = source.contentHeight|0;
		this.verticalScrollbarWidth = source.verticalScrollbarWidth|0;
		this.horizontalScrollbarHeight = source.horizontalScrollbarHeight|0;
		this.overviewRuler = source.overviewRuler.clone();
	}

	/**
	 * @internal
	 */
	public equals(other:EditorLayoutInfo): boolean {
		return (
			this.width === other.width
			&& this.height === other.height
			&& this.glyphMarginLeft === other.glyphMarginLeft
			&& this.glyphMarginWidth === other.glyphMarginWidth
			&& this.glyphMarginHeight === other.glyphMarginHeight
			&& this.lineNumbersLeft === other.lineNumbersLeft
			&& this.lineNumbersWidth === other.lineNumbersWidth
			&& this.lineNumbersHeight === other.lineNumbersHeight
			&& this.decorationsLeft === other.decorationsLeft
			&& this.decorationsWidth === other.decorationsWidth
			&& this.decorationsHeight === other.decorationsHeight
			&& this.contentLeft === other.contentLeft
			&& this.contentWidth === other.contentWidth
			&& this.contentHeight === other.contentHeight
			&& this.verticalScrollbarWidth === other.verticalScrollbarWidth
			&& this.horizontalScrollbarHeight === other.horizontalScrollbarHeight
			&& this.overviewRuler.equals(other.overviewRuler)
		);
	}

	/**
	 * @internal
	 */
	public clone(): EditorLayoutInfo {
		return new EditorLayoutInfo(this);
	}
}

/**
 * Options for creating the editor.
 */
export interface ICodeEditorWidgetCreationOptions extends IEditorOptions {
	/**
	 * The initial model associated with this code editor.
	 */
	model?:IModel;
}

/**
 * An editor model.
 */
export interface IEditorModel {
}
/**
 * An editor view state.
 */
export interface IEditorViewState {
}
export interface IDimension {
	width:number;
	height:number;
}
/**
 * Conditions describing action enablement
 */
export interface IActionEnablement {
	/**
	 * The action is enabled only if text in the editor is focused (e.g. blinking cursor).
	 * Warning: This condition will be disabled if the action is marked to be displayed in the context menu
	 * Defaults to false.
	 */
	textFocus?: boolean;
	/**
	 * The action is enabled only if the editor or its widgets have focus (e.g. focus is in find widget).
	 * Defaults to false.
	 */
	widgetFocus?: boolean;
	/**
	 * The action is enabled only if the editor is not in read only mode.
	 * Defaults to false.
	 */
	writeableEditor?: boolean;
	/**
	 * The action is enabled only if the cursor position is over tokens of a certain kind.
	 * Defaults to no tokens required.
	 */
	tokensAtPosition?: string[];
	/**
	 * The action is enabled only if the cursor position is over a word (i.e. not whitespace).
	 * Defaults to false.
	 */
	wordAtPosition?: boolean;
}

/**
 * A (serializable) state of the cursors.
 */
export interface ICursorState {
	inSelectionMode:boolean;
	selectionStart:IPosition;
	position:IPosition;
}
/**
 * A (serializable) state of the view.
 */
export interface IViewState {
	scrollTop: number;
	scrollTopWithoutViewZones: number;
	scrollLeft: number;
}
/**
 * A (serializable) state of the code editor.
 */
export interface ICodeEditorViewState extends IEditorViewState {
	cursorState:ICursorState[];
	viewState:IViewState;
	contributionsState: {[id:string]:any};
}

/**
 * Type of hit element with the mouse in the editor.
 */
export enum MouseTargetType {
	/**
	 * Mouse is on top of an unknown element.
	 */
	UNKNOWN,
	/**
	 * Mouse is on top of the textarea used for input.
	 */
	TEXTAREA,
	/**
	 * Mouse is on top of the glyph margin
	 */
	GUTTER_GLYPH_MARGIN,
	/**
	 * Mouse is on top of the line numbers
	 */
	GUTTER_LINE_NUMBERS,
	/**
	 * Mouse is on top of the line decorations
	 */
	GUTTER_LINE_DECORATIONS,
	/**
	 * Mouse is on top of the whitespace left in the gutter by a view zone.
	 */
	GUTTER_VIEW_ZONE,
	/**
	 * Mouse is on top of text in the content.
	 */
	CONTENT_TEXT,
	/**
	 * Mouse is on top of empty space in the content (e.g. after line text or below last line)
	 */
	CONTENT_EMPTY,
	/**
	 * Mouse is on top of a view zone in the content.
	 */
	CONTENT_VIEW_ZONE,
	/**
	 * Mouse is on top of a content widget.
	 */
	CONTENT_WIDGET,
	/**
	 * Mouse is on top of the decorations overview ruler.
	 */
	OVERVIEW_RULER,
	/**
	 * Mouse is on top of a scrollbar.
	 */
	SCROLLBAR,
	/**
	 * Mouse is on top of an overlay widget.
	 */
	OVERLAY_WIDGET
}

/**
 * A model for the diff editor.
 */
export interface IDiffEditorModel extends IEditorModel {
	/**
	 * Original model.
	 */
	original: IModel;
	/**
	 * Modified model.
	 */
	modified: IModel;
}
/**
 * (Serializable) View state for the diff editor.
 */
export interface IDiffEditorViewState extends IEditorViewState {
	original: ICodeEditorViewState;
	modified: ICodeEditorViewState;
}
/**
 * A change
 */
export interface IChange {
	originalStartLineNumber:number;
	originalEndLineNumber:number;
	modifiedStartLineNumber:number;
	modifiedEndLineNumber:number;
}
/**
 * A character level change.
 */
export interface ICharChange extends IChange {
	originalStartColumn:number;
	originalEndColumn:number;
	modifiedStartColumn:number;
	modifiedEndColumn:number;
}
/**
 * A line change
 */
export interface ILineChange extends IChange {
	charChanges:ICharChange[];
}
/**
 * Information about a line in the diff editor
 * @internal
 */
export interface IDiffLineInformation {
	equivalentLineNumber: number;
}

/**
 * A context key that is set when the editor's text has focus (cursor is blinking).
 */
export const KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS = 'editorTextFocus';

/**
 * A context key that is set when the editor's text or an editor's widget has focus.
 */
export const KEYBINDING_CONTEXT_EDITOR_FOCUS = 'editorFocus';
/**
 * @internal
 */
export const KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS = 'editorTabMovesFocus';
/**
 * A context key that is set when the editor's text is readonly.
 */
export const KEYBINDING_CONTEXT_EDITOR_READONLY = 'editorReadonly';
/**
 * A context key that is set when the editor has multiple selections (multiple cursors).
 */
export const KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS = 'editorHasMultipleSelections';
/**
 * A context key that is set when the editor has a non-collapsed selection.
 */
export const KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION = 'editorHasSelection';
/**
 * A context key that is set to the language associated with the model associated with the editor.
 */
export const KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID = 'editorLangId';
/**
 * @internal
 */
export const SHOW_ACCESSIBILITY_HELP_ACTION_ID = 'editor.action.showAccessibilityHelp';

export class BareFontInfo {
	_bareFontInfoBrand: void;

	fontFamily: string;
	fontSize: number;
	lineHeight: number;

	/**
	 * @internal
	 */
	constructor(opts: {
		fontFamily: string;
		fontSize: number;
		lineHeight: number;
	}) {
		this.fontFamily = String(opts.fontFamily);
		this.fontSize = opts.fontSize|0;
		this.lineHeight = opts.lineHeight|0;
	}

	/**
	 * @internal
	 */
	public getId(): string {
		return this.fontFamily + '-' + this.fontSize + '-' + this.lineHeight;
	}
}

export class FontInfo extends BareFontInfo {
	_editorStylingBrand: void;

	typicalHalfwidthCharacterWidth:number;
	typicalFullwidthCharacterWidth:number;
	spaceWidth:number;
	maxDigitWidth: number;

	/**
	 * @internal
	 */
	constructor(opts:{
		fontFamily: string;
		fontSize: number;
		lineHeight: number;
		typicalHalfwidthCharacterWidth:number;
		typicalFullwidthCharacterWidth:number;
		spaceWidth:number;
		maxDigitWidth: number;
	}) {
		super(opts);
		this.typicalHalfwidthCharacterWidth = opts.typicalHalfwidthCharacterWidth;
		this.typicalFullwidthCharacterWidth = opts.typicalFullwidthCharacterWidth;
		this.spaceWidth = opts.spaceWidth;
		this.maxDigitWidth = opts.maxDigitWidth;
	}

	/**
	 * @internal
	 */
	public equals(other:FontInfo): boolean {
		return (
			this.fontFamily === other.fontFamily
			&& this.fontSize === other.fontSize
			&& this.lineHeight === other.lineHeight
			&& this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth
			&& this.typicalFullwidthCharacterWidth === other.typicalFullwidthCharacterWidth
			&& this.spaceWidth === other.spaceWidth
			&& this.maxDigitWidth === other.maxDigitWidth
		);
	}

	/**
	 * @internal
	 */
	public clone(): FontInfo {
		return new FontInfo(this);
	}
}

/**
 * @internal
 */
export interface IConfiguration {
	onDidChange: Event<IConfigurationChangedEvent>;

	editor:InternalEditorOptions;

	setLineCount(lineCount:number): void;
}

// --- view

/**
 * @internal
 */
export interface IViewEventNames {
	ModelFlushedEvent: string;
	LinesDeletedEvent: string;
	LinesInsertedEvent: string;
	LineChangedEvent: string;
	TokensChangedEvent: string;
	DecorationsChangedEvent: string;
	CursorPositionChangedEvent: string;
	CursorSelectionChangedEvent: string;
	RevealRangeEvent: string;
	LineMappingChangedEvent: string;
}

/**
 * @internal
 */
export var ViewEventNames = {
	ModelFlushedEvent: 'modelFlushedEvent',
	LinesDeletedEvent: 'linesDeletedEvent',
	LinesInsertedEvent: 'linesInsertedEvent',
	LineChangedEvent: 'lineChangedEvent',
	TokensChangedEvent: 'tokensChangedEvent',
	DecorationsChangedEvent: 'decorationsChangedEvent',
	CursorPositionChangedEvent: 'cursorPositionChangedEvent',
	CursorSelectionChangedEvent: 'cursorSelectionChangedEvent',
	RevealRangeEvent: 'revealRangeEvent',
	LineMappingChangedEvent: 'lineMappingChangedEvent',
	ScrollRequestEvent: 'scrollRequestEvent'
};

export interface IScrollEvent {
	scrollTop: number;
	scrollLeft: number;
	scrollWidth: number;
	scrollHeight: number;

	scrollTopChanged: boolean;
	scrollLeftChanged: boolean;
	scrollWidthChanged: boolean;
	scrollHeightChanged: boolean;
}

export interface INewScrollPosition {
	scrollLeft?: number;
	scrollTop?: number;
}

/**
 * @internal
 */
export interface IViewLinesDeletedEvent {
	/**
	 * At what line the deletion began (inclusive).
	 */
	fromLineNumber: number;
	/**
	 * At what line the deletion stopped (inclusive).
	 */
	toLineNumber: number;
}

/**
 * @internal
 */
export interface IViewLinesInsertedEvent {
	/**
	 * Before what line did the insertion begin
	 */
	fromLineNumber: number;
	/**
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	toLineNumber: number;
}

/**
 * @internal
 */
export interface IViewLineChangedEvent {
	/**
	 * The line that has changed.
	 */
	lineNumber: number;
}

/**
 * @internal
 */
export interface IViewTokensChangedEvent {
	/**
	 * Start line number of range
	 */
	fromLineNumber: number;
	/**
	 * End line number of range
	 */
	toLineNumber: number;
}

/**
 * @internal
 */
export interface IViewDecorationsChangedEvent {
	/**
	 * signals that at least one inline decoration has changed
	 */
	inlineDecorationsChanged: boolean;
}

/**
 * @internal
 */
export interface IViewCursorPositionChangedEvent {
	/**
	 * Primary cursor's position.
	 */
	position: Position;
	/**
	 * Secondary cursors' position.
	 */
	secondaryPositions: Position[];
	/**
	 * Is the primary cursor in the editable range?
	 */
	isInEditableRange: boolean;
}

/**
 * @internal
 */
export interface IViewCursorSelectionChangedEvent {
	/**
	 * The primary selection.
	 */
	selection: Selection;
	/**
	 * The secondary selections.
	 */
	secondarySelections: Selection[];
}

/**
 * @internal
 */
export interface IViewRevealRangeEvent {
	/**
	 * Range to be reavealed.
	 */
	range: Range;

	verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	revealHorizontal: boolean;
}

/**
 * @internal
 */
export interface IViewScrollRequestEvent {
	deltaLines: number;
}

/**
 * @internal
 */
export interface IViewWhitespaceViewportData {
	id:number;
	afterLineNumber:number;
	verticalOffset:number;
	height:number;
}

/**
 * @internal
 */
export class Viewport {
	_viewportBrand: void;

	top: number;
	left: number;
	width: number;
	height: number;

	constructor(top:number, left:number, width:number, height:number) {
		this.top = top|0;
		this.left = left|0;
		this.width = width|0;
		this.height = height|0;
	}
}

/**
 * Description of an action contribution
 */
export interface IActionDescriptor {
	/**
	 * An unique identifier of the contributed action.
	 */
	id: string;
	/**
	 * A label of the action that will be presented to the user.
	 */
	label: string;
	/**
	 * An array of keybindings for the action.
	 */
	keybindings?: number[];
	/**
	 * The keybinding rule.
	 */
	keybindingContext?: string;
	/**
	 * A set of enablement conditions.
	 */
	enablement?: IActionEnablement;
	/**
	 * Control if the action should show up in the context menu and where.
	 * Built-in groups:
	 *   1_goto/* => e.g. 1_goto/1_peekDefinition
	 *   2_change/* => e.g. 2_change/2_format
	 *   3_edit/* => e.g. 3_edit/1_copy
	 *   4_tools/* => e.g. 4_tools/1_commands
	 * You can also create your own group.
	 * Defaults to null (don't show in context menu).
	 */
	contextMenuGroupId?: string;
	/**
	 * Method that will be executed when the action is triggered.
	 * @param editor The editor instance is passed in as a convinience
	 */
	run:(editor:ICommonCodeEditor)=>TPromise<void>;
}

/**
 * Data associated with an editor action contribution
 * @internal
 */
export interface IEditorActionDescriptorData {
	id:string;
	label:string;
	alias?:string;
}

/**
 * @internal
 */
export type IEditorActionContributionCtor = IConstructorSignature2<IEditorActionDescriptorData, ICommonCodeEditor, IEditorContribution>;

/**
 * @internal
 */
export type ICommonEditorContributionCtor = IConstructorSignature1<ICommonCodeEditor, IEditorContribution>;

/**
 * An editor contribution descriptor that will be used to construct editor contributions
 * @internal
 */
export interface ICommonEditorContributionDescriptor {
	/**
	 * Create an instance of the contribution
	 */
	createInstance(instantiationService:IInstantiationService, editor:ICommonCodeEditor): IEditorContribution;
}

/**
 * An editor.
 */
export interface IEditor {
	/**
	 * @deprecated. Please use `onDidChangeModelContent` instead.
	 * An event emitted when the content of the current model has changed.
	 * @internal
	 */
	onDidChangeModelRawContent(listener: (e:IModelContentChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the content of the current model has changed.
	 */
	onDidChangeModelContent(listener: (e:IModelContentChangedEvent2)=>void): IDisposable;
	/**
	 * An event emitted when the language of the current model has changed.
	 */
	onDidChangeModelMode(listener: (e:IModelModeChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the options of the current model has changed.
	 */
	onDidChangeModelOptions(listener: (e:IModelOptionsChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the configuration of the editor has changed. (e.g. `editor.updateOptions()`)
	 */
	onDidChangeConfiguration(listener: (e:IConfigurationChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the cursor position has changed.
	 */
	onDidChangeCursorPosition(listener: (e:ICursorPositionChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the cursor selection has changed.
	 */
	onDidChangeCursorSelection(listener: (e:ICursorSelectionChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the editor has been disposed.
	 */
	onDidDispose(listener: ()=>void): IDisposable;

	/**
	 * Dispose the editor.
	 */
	dispose(): void;

	/**
	 * Get a unique id for this editor instance.
	 */
	getId(): string;

	/**
	 * Get the editor type. Please see `EditorType`.
	 * This is to avoid an instanceof check
	 */
	getEditorType(): string;

	/**
	 * Destroy the editor.
	 * @internal
	 */
	destroy(): void;

	/**
	 * Update the editor's options after the editor has been created.
	 */
	updateOptions(newOptions: IEditorOptions): void;

	/**
	 * Indicates that the editor becomes visible.
	 * @internal
	 */
	onVisible(): void;

	/**
	 * Indicates that the editor becomes hidden.
	 * @internal
	 */
	onHide(): void;

	/**
	 * Instructs the editor to remeasure its container. This method should
	 * be called when the container of the editor gets resized.
	 */
	layout(dimension?:IDimension): void;

	/**
	 * Brings browser focus to the editor text
	 */
	focus(): void;

	/**
	 * Returns true if this editor has keyboard focus (e.g. cursor is blinking).
	 */
	isFocused(): boolean;

	/**
	 * Add a new action to this editor.
	 */
	addAction(descriptor:IActionDescriptor): void;

	/**
	 * Returns all actions associated with this editor.
	 */
	getActions(): IAction[];

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): IEditorViewState;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: IEditorViewState): void;

	/**
	 * Given a position, returns a column number that takes tab-widths into account.
	 */
	getVisibleColumnFromPosition(position:IPosition): number;

	/**
	 * Returns the primary position of the cursor.
	 */
	getPosition(): Position;

	/**
	 * Set the primary position of the cursor. This will remove any secondary cursors.
	 * @param position New primary cursor's position
	 */
	setPosition(position:IPosition): void;

	/**
	 * Scroll vertically as necessary and reveal a line.
	 */
	revealLine(lineNumber: number): void;

	/**
	 * Scroll vertically as necessary and reveal a line centered vertically.
	 */
	revealLineInCenter(lineNumber: number): void;

	/**
	 * Scroll vertically as necessary and reveal a line centered vertically only if it lies outside the viewport.
	 */
	revealLineInCenterIfOutsideViewport(lineNumber: number): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a position.
	 */
	revealPosition(position: IPosition): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a position centered vertically.
	 */
	revealPositionInCenter(position: IPosition): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a position centered vertically only if it lies outside the viewport.
	 */
	revealPositionInCenterIfOutsideViewport(position: IPosition): void;

	/**
	 * Returns the primary selection of the editor.
	 */
	getSelection(): Selection;

	/**
	 * Returns all the selections of the editor.
	 */
	getSelections(): Selection[];

	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection:IRange): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection:Range): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection:ISelection): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection:Selection): void;

	/**
	 * Set the selections for all the cursors of the editor.
	 * Cursors will be removed or added, as necessary.
	 */
	setSelections(selections:ISelection[]): void;

	/**
	 * Scroll vertically as necessary and reveal lines.
	 */
	revealLines(startLineNumber: number, endLineNumber: number): void;

	/**
	 * Scroll vertically as necessary and reveal lines centered vertically.
	 */
	revealLinesInCenter(lineNumber: number, endLineNumber: number): void;

	/**
	 * Scroll vertically as necessary and reveal lines centered vertically only if it lies outside the viewport.
	 */
	revealLinesInCenterIfOutsideViewport(lineNumber: number, endLineNumber: number): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a range.
	 */
	revealRange(range: IRange): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a range centered vertically.
	 */
	revealRangeInCenter(range: IRange): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
	 */
	revealRangeInCenterIfOutsideViewport(range: IRange): void;


	/**
	 * Directly trigger a handler or an editor action.
	 * @param source The source of the call.
	 * @param handlerId The id of the handler or the id of a contribution.
	 * @param payload Extra data to be sent to the handler.
	 */
	trigger(source:string, handlerId:string, payload:any): void;

	/**
	 * Gets the current model attached to this editor.
	 */
	getModel(): IEditorModel;

	/**
	 * Sets the current model attached to this editor.
	 * If the previous model was created by the editor via the value key in the options
	 * literal object, it will be destroyed. Otherwise, if the previous model was set
	 * via setModel, or the model key in the options literal object, the previous model
	 * will not be destroyed.
	 * It is safe to call setModel(null) to simply detach the current model from the editor.
	 */
	setModel(model:IEditorModel): void;

	/**
	 * Change the decorations. All decorations added through this changeAccessor
	 * will get the ownerId of the editor (meaning they will not show up in other
	 * editors).
	 * @see IModel.changeDecorations
	 * @internal
	 */
	changeDecorations(callback: (changeAccessor:IModelDecorationsChangeAccessor)=>any): any;
}

/**
 * @internal
 */
export interface ICodeEditorState {
	validate(editor:ICommonCodeEditor): boolean;
}

/**
 * @internal
 */
export enum CodeEditorStateFlag {
	Value,
	Selection,
	Position,
	Scroll
}

/**
 * An editor contribution that gets created every time a new editor gets created and gets disposed when the editor gets disposed.
 */
export interface IEditorContribution {
	/**
	 * Get a unique identifier for this contribution.
	 */
	getId(): string;
	/**
	 * Dispose this contribution.
	 */
	dispose(): void;
	/**
	 * Store view state.
	 */
	saveViewState?(): any;
	/**
	 * Restore view state.
	 */
	restoreViewState?(state: any): void;
}

/**
 * @internal
 */
export interface IThemeDecorationRenderOptions {
	backgroundColor?: string;

	outline?: string;
	outlineColor?: string;
	outlineStyle?: string;
	outlineWidth?: string;

	border?:string;
	borderColor?: string;
	borderRadius?: string;
	borderSpacing?: string;
	borderStyle?: string;
	borderWidth?: string;

	textDecoration?: string;
	cursor?: string;
	color?: string;
	letterSpacing?: string;

	gutterIconPath?: string;
	gutterIconSize?: string;

	overviewRulerColor?: string;

	before?: IContentDecorationRenderOptions;
	after?: IContentDecorationRenderOptions;
}

/**
 * @internal
 */
export interface IContentDecorationRenderOptions {
	contentText?: string;
	contentIconPath?: string;

	border?: string;
	textDecoration?: string;
	color?: string;
	backgroundColor?: string;

	margin?: string;
	width?: string;
	height?: string;
}

/**
 * @internal
 */
export interface IDecorationRenderOptions extends IThemeDecorationRenderOptions {
	isWholeLine?: boolean;
	overviewRulerLane?: OverviewRulerLane;

	light?: IThemeDecorationRenderOptions;
	dark?: IThemeDecorationRenderOptions;
}

/**
 * @internal
 */
export interface IThemeDecorationInstanceRenderOptions {
	before?: IContentDecorationRenderOptions;
	after?: IContentDecorationRenderOptions;
}

/**
 * @internal
 */
export interface IDecorationInstanceRenderOptions extends IThemeDecorationInstanceRenderOptions {
	light?: IThemeDecorationInstanceRenderOptions;
	dark?: IThemeDecorationInstanceRenderOptions;
}

/**
 * @internal
 */
export interface IDecorationOptions {
	range: IRange;
	hoverMessage?: MarkedString | MarkedString[];
	renderOptions? : IDecorationInstanceRenderOptions;
}


export interface ICommonCodeEditor extends IEditor {
	/**
	 * An event emitted when the model of this editor has changed (e.g. `editor.setModel()`).
	 */
	onDidChangeModel(listener: (e:IModelChangedEvent)=>void): IDisposable;
	/**
	 * @internal
	 */
	onDidChangeModelModeSupport(listener: (e:IModeSupportChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the decorations of the current model have changed.
	 */
	onDidChangeModelDecorations(listener: (e:IModelDecorationsChangedEvent)=>void): IDisposable;
	/**
	 * An event emitted when the text inside this editor gained focus (i.e. cursor blinking).
	 */
	onDidFocusEditorText(listener: ()=>void): IDisposable;
	/**
	 * An event emitted when the text inside this editor lost focus.
	 */
	onDidBlurEditorText(listener: ()=>void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget gained focus.
	 */
	onDidFocusEditor(listener: ()=>void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget lost focus.
	 */
	onDidBlurEditor(listener: ()=>void): IDisposable;

	/**
	 * Returns true if this editor or one of its widgets has keyboard focus.
	 */
	hasWidgetFocus(): boolean;

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution(id: string): IEditorContribution;

	/**
	 * @internal
	 */
	captureState(...flags:CodeEditorStateFlag[]): ICodeEditorState;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): IModel;

	/**
	 * Returns the current editor's configuration
	 */
	getConfiguration(): InternalEditorOptions;

	/**
	 * Returns the 'raw' editor's configuration, as it was applied over the defaults, but without any computed members.
	 * @internal
	 */
	getRawConfiguration(): IEditorOptions;

	/**
	 * Get value of the current model attached to this editor.
	 * @see IModel.getValue
	 */
	getValue(options?: { preserveBOM: boolean; lineEnding: string; }): string;

	/**
	 * Set the value of the current model attached to this editor.
	 * @see IModel.setValue
	 */
	setValue(newValue: string): void;

	/**
	 * Get the scrollWidth of the editor's viewport.
	 */
	getScrollWidth(): number;
	/**
	 * Get the scrollLeft of the editor's viewport.
	 */
	getScrollLeft(): number;

	/**
	 * Get the scrollHeight of the editor's viewport.
	 */
	getScrollHeight(): number;
	/**
	 * Get the scrollTop of the editor's viewport.
	 */
	getScrollTop(): number;

	/**
	 * Change the scrollLeft of the editor's viewport.
	 */
	setScrollLeft(newScrollLeft: number): void;
	/**
	 * Change the scrollTop of the editor's viewport.
	 */
	setScrollTop(newScrollTop: number): void;
	/**
	 * Change the scroll position of the editor's viewport.
	 */
	setScrollPosition(position: INewScrollPosition): void;

	/**
	 * Get an action that is a contribution to this editor.
	 * @id Unique identifier of the contribution.
	 * @return The action or null if action not found.
	 */
	getAction(id: string): IAction;

	/**
	 * Execute a command on the editor.
	 * @param source The source of the call.
	 * @param command The command to execute
	 */
	executeCommand(source: string, command: ICommand): void;

	/**
	 * Push an "undo stop" in the undo-redo stack.
	 */
	pushUndoStop(): boolean;

	/**
	 * Execute a command on the editor.
	 * @param source The source of the call.
	 * @param command The command to execute
	 */
	executeEdits(source: string, edits: IIdentifiedSingleEditOperation[]): boolean;

	/**
	 * Execute multiple (concommitent) commands on the editor.
	 * @param source The source of the call.
	 * @param command The commands to execute
	 */
	executeCommands(source: string, commands: ICommand[]): void;

	/**
	 * Get all the decorations on a line (filtering out decorations from other editors).
	 */
	getLineDecorations(lineNumber: number): IModelDecoration[];

	/**
	 * All decorations added through this call will get the ownerId of this editor.
	 * @see IModel.deltaDecorations
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];

	/**
	 * @internal
	 */
	setDecorations(decorationTypeKey: string, ranges: IDecorationOptions[]): void;

	/**
	 * @internal
	 */
	removeDecorations(decorationTypeKey:string): void;

	/**
	 * Get the layout info for the editor.
	 */
	getLayoutInfo(): EditorLayoutInfo;

	/**
	 * Prevent the editor from sending a widgetFocusLost event,
	 * set it in a state where it believes that focus is in one of its widgets.
	 * Use this method with care and always add a matching `endForcedWidgetFocus`
	 * @internal
	 */
	beginForcedWidgetFocus(): void;

	/**
	 * End the preventing of sending a widgetFocusLost event.
	 * @internal
	 */
	endForcedWidgetFocus(): void;

	/**
	 * This listener is notified when a keypress produces a visible character.
	 * The callback should not do operations on the view, as the view might not be updated to reflect previous typed characters.
	 * @param character Character to listen to.
	 * @param callback Function to call when `character` is typed.
	 * @internal
	 */
	addTypingListener(character: string, callback: () => void): IDisposable;

}

export interface ICommonDiffEditor extends IEditor {
	/**
	 * An event emitted when the diff information computed by this diff editor has been updated.
	 */
	onDidUpdateDiff(listener: ()=>void): IDisposable;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): IDiffEditorModel;

	/**
	 * Get the `original` editor.
	 */
	getOriginalEditor(): ICommonCodeEditor;

	/**
	 * Get the `modified` editor.
	 */
	getModifiedEditor(): ICommonCodeEditor;

	/**
	 * Get the computed diff information.
	 */
	getLineChanges(): ILineChange[];

	/**
	 * Get information based on computed diff about a line number from the original model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 * @internal
	 */
	getDiffLineInformationForOriginal(lineNumber:number): IDiffLineInformation;

	/**
	 * Get information based on computed diff about a line number from the modified model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 * @internal
	 */
	getDiffLineInformationForModified(lineNumber:number): IDiffLineInformation;

	/**
	 * @see ICodeEditor.getValue
	 */
	getValue(options?:{ preserveBOM:boolean; lineEnding:string; }): string;

	/**
	 * Returns whether the diff editor is ignoring trim whitespace or not.
	 * @internal
	 */
	ignoreTrimWhitespace: boolean;

	/**
	 * Returns whether the diff editor is rendering side by side or not.
	 * @internal
	 */
	renderSideBySide: boolean;
}

/**
 * The type of the `IEditor`.
 */
export var EditorType = {
	ICodeEditor: 'vs.editor.ICodeEditor',
	IDiffEditor: 'vs.editor.IDiffEditor'
};

/**
 * @internal
 */
export var ClassName = {
	EditorWarningDecoration: 'greensquiggly',
	EditorErrorDecoration: 'redsquiggly'
};

/**
 * @internal
 */
export var EventType = {
	Disposed: 'disposed',

	ConfigurationChanged: 'configurationChanged',

	ModelDispose: 'modelDispose',

	ModelChanged: 'modelChanged',

	ModelTokensChanged: 'modelTokensChanged',
	ModelModeChanged: 'modelsModeChanged',
	ModelModeSupportChanged: 'modelsModeSupportChanged',
	ModelOptionsChanged: 'modelOptionsChanged',
	ModelRawContentChanged: 'contentChanged',
	ModelContentChanged2: 'contentChanged2',
	ModelRawContentChangedFlush: 'flush',
	ModelRawContentChangedLinesDeleted: 'linesDeleted',
	ModelRawContentChangedLinesInserted: 'linesInserted',
	ModelRawContentChangedLineChanged: 'lineChanged',

	EditorTextBlur: 'blur',
	EditorTextFocus: 'focus',
	EditorFocus: 'widgetFocus',
	EditorBlur: 'widgetBlur',

	ModelDecorationsChanged: 'decorationsChanged',

	CursorPositionChanged: 'positionChanged',
	CursorSelectionChanged: 'selectionChanged',
	CursorRevealRange: 'revealRange',
	CursorScrollRequest: 'scrollRequest',

	ViewFocusGained: 'focusGained',
	ViewFocusLost: 'focusLost',
	ViewFocusChanged: 'focusChanged',
	ViewScrollChanged: 'scrollChanged',
	ViewZonesChanged: 'zonesChanged',

	ViewLayoutChanged: 'viewLayoutChanged',

	ContextMenu: 'contextMenu',
	MouseDown: 'mousedown',
	MouseUp: 'mouseup',
	MouseMove: 'mousemove',
	MouseLeave: 'mouseleave',
	KeyDown: 'keydown',
	KeyUp: 'keyup',

	EditorLayout: 'editorLayout',

	DiffUpdated: 'diffUpdated'
};

/**
 * Built-in commands.
 */
export var Handler = {
	ExecuteCommand:				'executeCommand',
	ExecuteCommands:			'executeCommands',

	CursorLeft:					'cursorLeft',
	CursorLeftSelect:			'cursorLeftSelect',

	CursorWordLeft:				'cursorWordLeft',
	CursorWordStartLeft:		'cursorWordStartLeft',
	CursorWordEndLeft:			'cursorWordEndLeft',

	CursorWordLeftSelect:		'cursorWordLeftSelect',
	CursorWordStartLeftSelect:	'cursorWordStartLeftSelect',
	CursorWordEndLeftSelect:	'cursorWordEndLeftSelect',

	CursorRight:				'cursorRight',
	CursorRightSelect:			'cursorRightSelect',

	CursorWordRight:			'cursorWordRight',
	CursorWordStartRight:		'cursorWordStartRight',
	CursorWordEndRight:			'cursorWordEndRight',

	CursorWordRightSelect:		'cursorWordRightSelect',
	CursorWordStartRightSelect:	'cursorWordStartRightSelect',
	CursorWordEndRightSelect:	'cursorWordEndRightSelect',

	CursorUp:					'cursorUp',
	CursorUpSelect:				'cursorUpSelect',
	CursorDown:					'cursorDown',
	CursorDownSelect:			'cursorDownSelect',

	CursorPageUp:				'cursorPageUp',
	CursorPageUpSelect:			'cursorPageUpSelect',
	CursorPageDown:				'cursorPageDown',
	CursorPageDownSelect:		'cursorPageDownSelect',

	CursorHome:					'cursorHome',
	CursorHomeSelect:			'cursorHomeSelect',

	CursorEnd:					'cursorEnd',
	CursorEndSelect:			'cursorEndSelect',

	ExpandLineSelection:		'expandLineSelection',

	CursorTop:					'cursorTop',
	CursorTopSelect:			'cursorTopSelect',
	CursorBottom:				'cursorBottom',
	CursorBottomSelect:			'cursorBottomSelect',

	CursorColumnSelectLeft:		'cursorColumnSelectLeft',
	CursorColumnSelectRight:	'cursorColumnSelectRight',
	CursorColumnSelectUp:		'cursorColumnSelectUp',
	CursorColumnSelectPageUp:	'cursorColumnSelectPageUp',
	CursorColumnSelectDown:		'cursorColumnSelectDown',
	CursorColumnSelectPageDown:	'cursorColumnSelectPageDown',

	AddCursorDown:				'addCursorDown',
	AddCursorUp:				'addCursorUp',
	CursorUndo:					'cursorUndo',
	MoveTo:						'moveTo',
	MoveToSelect:				'moveToSelect',
	ColumnSelect:				'columnSelect',
	CreateCursor:				'createCursor',
	LastCursorMoveToSelect:		'lastCursorMoveToSelect',

	JumpToBracket:				'jumpToBracket',

	Type:						'type',
	ReplacePreviousChar:		'replacePreviousChar',
	Paste:						'paste',

	Tab:						'tab',
	Indent:						'indent',
	Outdent:					'outdent',

	DeleteLeft:					'deleteLeft',
	DeleteRight:				'deleteRight',

	DeleteWordLeft:				'deleteWordLeft',
	DeleteWordStartLeft:		'deleteWordStartLeft',
	DeleteWordEndLeft:			'deleteWordEndLeft',

	DeleteWordRight:			'deleteWordRight',
	DeleteWordStartRight:		'deleteWordStartRight',
	DeleteWordEndRight:			'deleteWordEndRight',

	DeleteAllLeft:				'deleteAllLeft',
	DeleteAllRight:				'deleteAllRight',

	RemoveSecondaryCursors: 	'removeSecondaryCursors',
	CancelSelection:			'cancelSelection',

	Cut:						'cut',

	Undo:						'undo',
	Redo:						'redo',

	WordSelect:					'wordSelect',
	WordSelectDrag:				'wordSelectDrag',
	LastCursorWordSelect: 		'lastCursorWordSelect',

	LineSelect:					'lineSelect',
	LineSelectDrag:				'lineSelectDrag',
	LastCursorLineSelect:		'lastCursorLineSelect',
	LastCursorLineSelectDrag:	'lastCursorLineSelectDrag',
	LineInsertBefore:			'lineInsertBefore',
	LineInsertAfter:			'lineInsertAfter',
	LineBreakInsert:			'lineBreakInsert',

	SelectAll:					'selectAll',

	ScrollLineUp:				'scrollLineUp',
	ScrollLineDown:				'scrollLineDown',

	ScrollPageUp:				'scrollPageUp',
	ScrollPageDown:				'scrollPageDown'
};

/**
 * The style in which the editor's cursor should be rendered.
 */
export enum TextEditorCursorStyle {
	/**
	 * As a vertical line (sitting between two characters).
	 */
	Line = 1,
	/**
	 * As a block (sitting on top of a character).
	 */
	Block = 2,
	/**
	 * As a horizontal line (sitting under a character).
	 */
	Underline = 3
}

/**
 * The kind of animation in which the editor's cursor should be rendered.
 */
export enum TextEditorCursorBlinkingStyle {
	/**
	 * Hidden
	 */
	Hidden = 0,
	/**
	 * Blinking
	 */
	Blink = 1,
	/**
	 * Blinking with smooth fading
	 */
	Smooth = 2,
	/**
	 * Blinking with prolonged filled state and smooth fading
	 */
	Phase = 3,
	/**
	 * Expand collapse animation on the y axis
	 */
	Expand = 4,
	/**
	 * No-Blinking
	 */
	Solid = 5
}

/**
 * @internal
 */
export function cursorStyleToString(cursorStyle:TextEditorCursorStyle): string {
	if (cursorStyle === TextEditorCursorStyle.Line) {
		return 'line';
	} else if (cursorStyle === TextEditorCursorStyle.Block) {
		return 'block';
	} else if (cursorStyle === TextEditorCursorStyle.Underline) {
		return 'underline';
	} else {
		throw new Error('cursorStyleToString: Unknown cursorStyle');
	}
}

/**
 * @internal
 */
export class ColorZone {
	_colorZoneBrand: void;

	from: number;
	to: number;
	colorId: number;
	position: OverviewRulerLane;

	constructor(from:number, to:number, colorId:number, position: OverviewRulerLane) {
		this.from = from|0;
		this.to = to|0;
		this.colorId = colorId|0;
		this.position = position|0;
	}
}

/**
 * A zone in the overview ruler
 * @internal
 */
export class OverviewRulerZone {
	_overviewRulerZoneBrand: void;

	startLineNumber: number;
	endLineNumber: number;
	position: OverviewRulerLane;
	forceHeight: number;

	private _color: string;
	private _darkColor: string;

	private _colorZones: ColorZone[];

	constructor(
		startLineNumber: number, endLineNumber: number,
		position: OverviewRulerLane,
		forceHeight: number,
		color: string, darkColor: string
	) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.position = position;
		this.forceHeight = forceHeight;
		this._color = color;
		this._darkColor = darkColor;
		this._colorZones = null;
	}

	public getColor(useDarkColor:boolean): string {
		if (useDarkColor) {
			return this._darkColor;
		}
		return this._color;
	}

	public equals(other:OverviewRulerZone): boolean {
		return (
			this.startLineNumber === other.startLineNumber
			&& this.endLineNumber === other.endLineNumber
			&& this.position === other.position
			&& this.forceHeight === other.forceHeight
			&& this._color === other._color
			&& this._darkColor === other._darkColor
		);
	}

	public compareTo(other:OverviewRulerZone): number {
		if (this.startLineNumber === other.startLineNumber) {
			if (this.endLineNumber === other.endLineNumber) {
				if (this.forceHeight === other.forceHeight) {
					if (this.position === other.position) {
						if (this._darkColor === other._darkColor) {
							if (this._color === other._color) {
								return 0;
							}
							return this._color < other._color ? -1 : 1;
						}
						return this._darkColor < other._darkColor ? -1 : 1;
					}
					return this.position - other.position;
				}
				return this.forceHeight - other.forceHeight;
			}
			return this.endLineNumber - other.endLineNumber;
		}
		return this.startLineNumber - other.startLineNumber;
	}

	public setColorZones(colorZones:ColorZone[]): void {
		this._colorZones = colorZones;
	}

	public getColorZones(): ColorZone[] {
		return this._colorZones;
	}
}

