/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IAction} from 'vs/base/common/actions';
import Event from 'vs/base/common/event';
import {IEventEmitter, ListenerUnbind} from 'vs/base/common/eventEmitter';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IInstantiationService, IConstructorSignature1, IConstructorSignature2} from 'vs/platform/instantiation/common/instantiation';
import * as TokensBinaryEncoding from 'vs/editor/common/model/tokensBinaryEncoding';
import {ILineContext, IMode, IModeTransition, IToken} from 'vs/editor/common/modes';

export type KeyCode = KeyCode;
export type KeyMod = KeyMod;

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
 * A position in the editor.
 */
export interface IEditorPosition extends IPosition {
	/**
	 * Test if this position equals other position
	 */
	equals(other:IPosition): boolean;
	/**
	 * Test if this position is before other position. If the two positions are equal, the result will be false.
	 */
	isBefore(other:IPosition): boolean;
	/**
	 * Test if this position is before other position. If the two positions are equal, the result will be true.
	 */
	isBeforeOrEqual(other:IPosition): boolean;
	/**
	 * Clone this position.
	 */
	clone(): IEditorPosition;
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
 * A range in the editor.
 */
export interface IEditorRange extends IRange {
	/**
	 * Test if this range is empty.
	 */
	isEmpty(): boolean;
	collapseToStart():IEditorRange;
	/**
	 * Test if position is in this range. If the position is at the edges, will return true.
	 */
	containsPosition(position:IPosition): boolean;
	/**
	 * Test if range is in this range. If the range is equal to this range, will return true.
	 */
	containsRange(range:IRange): boolean;
	/**
	 * A reunion of the two ranges. The smallest position will be used as the start point, and the largest one as the end point.
	 */
	plusRange(range:IRange): IEditorRange;
	/**
	 * A intersection of the two ranges.
	 */
	intersectRanges(range:IRange): IEditorRange;
	/**
	 * Test if this range equals other.
	 */
	equalsRange(other:IRange): boolean;
	/**
	 * Return the end position (which will be after or equal to the start position)
	 */
	getEndPosition(): IEditorPosition;
	/**
	 * Create a new range using this range's start position, and using endLineNumber and endColumn as the end position.
	 */
	setEndPosition(endLineNumber: number, endColumn: number): IEditorRange;
	/**
	 * Return the start position (which will be before or equal to the end position)
	 */
	getStartPosition(): IEditorPosition;
	/**
	 * Create a new range using this range's end position, and using startLineNumber and startColumn as the start position.
	 */
	setStartPosition(startLineNumber: number, startColumn: number): IEditorRange;
	/**
	 * Clone this range.
	 */
	cloneRange(): IEditorRange;
	/**
	 * Transform to a user presentable string representation.
	 */
	toString(): string;
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
 * The direction of a selection.
 */
export enum SelectionDirection {
	/**
	 * The selection starts above where it ends.
	 */
	LTR,
	/**
	 * The selection starts below where it ends.
	 */
	RTL
}

/**
 * A selection in the editor.
 */
export interface IEditorSelection extends ISelection, IEditorRange {
	/**
	 * Test if equals other selection.
	 */
	equalsSelection(other:ISelection): boolean;
	/**
	 * Clone this selection.
	 */
	clone(): IEditorSelection;
	/**
	 * Get directions (LTR or RTL).
	 */
	getDirection(): SelectionDirection;
	/**
	 * Create a new selection with a different `positionLineNumber` and `positionColumn`.
	 */
	setEndPosition(endLineNumber: number, endColumn: number): IEditorSelection;
	/**
	 * Create a new selection with a different `selectionStartLineNumber` and `selectionStartColumn`.
	 */
	setStartPosition(startLineNumber: number, startColumn: number): IEditorSelection;
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
	verticalSliderSize?: number;
	horizontalSliderSize?: number;
}

export enum WrappingIndent {
	None = 0,
	Same = 1,
	Indent = 2
}

export function wrappingIndentFromString(wrappingIndent:string): WrappingIndent {
	if (wrappingIndent === 'indent') {
		return WrappingIndent.Indent;
	} else if (wrappingIndent === 'same') {
		return WrappingIndent.Same;
	} else {
		return WrappingIndent.None;
	}
}

/**
 * Configuration options for the editor.
 */
export interface IEditorOptions {
	experimentalScreenReader?: boolean;
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
	 * Control the cursor blinking animation.
	 * Defaults to 'blink'.
	 */
	cursorBlinking?:string;
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

//	autoSize?:boolean;
	/**
	 * Control what pressing Tab does.
	 * If it is false, pressing Tab or Shift-Tab will be handled by the editor.
	 * If it is true, pressing Tab or Shift-Tab will move the browser focus.
	 * Defaults to false.
	 */
	tabFocusMode?:boolean;

	/**
	 * Performance guard: Stop tokenizing a line after x characters.
	 * Defaults to 10000 if wrappingColumn is -1. Defaults to -1 if wrappingColumn is >= 0.
	 * Use -1 to never stop tokenization.
	 */
	stopLineTokenizationAfter?:number;
	/**
	 * Performance guard: Stop rendering a line after x characters.
	 * Defaults to 10000 if wrappingColumn is -1. Defaults to -1 if wrappingColumn is >= 0.
	 * Use -1 to never stop rendering
	 */
	stopRenderingLineAfter?:number;
	/**
	 * Performance guard: Force viewport width wrapping if more than half of the
	 * characters in a model are on lines of length >= `longLineBoundary`.
	 * Defaults to 300.
	 */
	longLineBoundary?:number;
	/**
	 * Performance guard: Tokenize in the background if the [wrapped] lines count is above
	 * this number. If the [wrapped] lines count is below this number, then the view will
	 * always force tokenization before rendering.
	 * Defaults to 1000.
	 */
	forcedTokenizationBoundary?:number;
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
	 * Enable quick suggestions (shaddow suggestions)
	 * Defaults to true.
	 */
	quickSuggestions?:boolean;
	/**
	 * Quick suggestions show delay (in ms)
	 * Defaults to 500 (ms)
	 */
	quickSuggestionsDelay?:number;
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
	 * Show lines before classes and methods (based on outline info).
	 * Defaults to false.
	 */
	outlineMarkers?: boolean;
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

/**
 * Internal indentation options (computed) for the editor.
 */
export interface IInternalIndentationOptions {
	/**
	 * Tab size in spaces. This is used for rendering and for editing.
	 */
	tabSize:number;
	/**
	 * Insert spaces instead of tabs when indenting or when auto-indenting.
	 */
	insertSpaces:boolean;
}

export interface IInternalEditorScrollbarOptions {
	arrowSize:number;
	vertical:string;
	horizontal:string;
	useShadows:boolean;
	verticalHasArrows:boolean;
	horizontalHasArrows:boolean;
	handleMouseWheel: boolean;
	horizontalScrollbarSize: number;
	horizontalSliderSize: number;
	verticalScrollbarSize: number;
	verticalSliderSize: number;
	mouseWheelScrollSensitivity: number;
}

export interface IEditorWrappingInfo {
	isViewportWrapping: boolean;
	wrappingColumn: number;
}

/**
 * Internal configuration options (transformed or computed) for the editor.
 */
export interface IInternalEditorOptions {
	experimentalScreenReader: boolean;
	rulers: number[];
	wordSeparators: string;
	selectionClipboard: boolean;
	ariaLabel: string;

	// ---- Options that are transparent - get no massaging
	lineNumbers:any;
	selectOnLineNumbers:boolean;
	glyphMargin:boolean;
	revealHorizontalRightPadding:number;
	roundedSelection:boolean;
	theme:string;
	readOnly:boolean;
	scrollbar:IInternalEditorScrollbarOptions;
	overviewRulerLanes:number;
	cursorBlinking:string;
	cursorStyle:TextEditorCursorStyle;
	fontLigatures:boolean;
	hideCursorInOverviewRuler:boolean;
	scrollBeyondLastLine:boolean;
	wrappingIndent: string;
	wordWrapBreakBeforeCharacters: string;
	wordWrapBreakAfterCharacters: string;
	wordWrapBreakObtrusiveCharacters: string;
	tabFocusMode:boolean;
	stopLineTokenizationAfter:number;
	stopRenderingLineAfter: number;
	longLineBoundary:number;
	forcedTokenizationBoundary:number;

	// ---- Options that are transparent - get no massaging
	hover:boolean;
	contextmenu:boolean;
	quickSuggestions:boolean;
	quickSuggestionsDelay:number;
	iconsInSuggestions:boolean;
	autoClosingBrackets:boolean;
	formatOnType:boolean;
	suggestOnTriggerCharacters: boolean;
	acceptSuggestionOnEnter: boolean;
	selectionHighlight:boolean;
	outlineMarkers: boolean;
	referenceInfos: boolean;
	folding: boolean;
	renderWhitespace: boolean;

	// ---- Options that are computed

	layoutInfo: IEditorLayoutInfo;

	stylingInfo: IEditorStyling;

	wrappingInfo: IEditorWrappingInfo;

	/**
	 * Computed width of the container of the editor in px.
	 */
	observedOuterWidth:number;
	/**
	 * Computed height of the container of the editor in px.
	 */
	observedOuterHeight:number;
	/**
	 * Computed line height (deduced from theme and CSS) in px.
	 */
	lineHeight:number;
	/**
	 * Computed page size (deduced from editor size) in lines.
	 */
	pageSize:number;
	/**
	 * Computed width of 'm' (deduced from theme and CSS) in px.
	 */
	typicalHalfwidthCharacterWidth:number;
	/**
	 * Computed width of fullwidth 'm' (U+FF4D)
	 */
	typicalFullwidthCharacterWidth:number;
	/**
	 * Computed font size.
	 */
	fontSize:number;
}

/**
 * An event describing that the configuration of the editor has changed.
 */
export interface IConfigurationChangedEvent {
	experimentalScreenReader: boolean;
	rulers: boolean;
	wordSeparators: boolean;
	selectionClipboard: boolean;
	ariaLabel: boolean;

	// ---- Options that are transparent - get no massaging
	lineNumbers: boolean;
	selectOnLineNumbers: boolean;
	glyphMargin: boolean;
	revealHorizontalRightPadding: boolean;
	roundedSelection: boolean;
	theme: boolean;
	readOnly: boolean;
	scrollbar: boolean;
	overviewRulerLanes: boolean;
	cursorBlinking: boolean;
	cursorStyle: boolean;
	fontLigatures: boolean;
	hideCursorInOverviewRuler: boolean;
	scrollBeyondLastLine: boolean;
	wrappingIndent: boolean;
	wordWrapBreakBeforeCharacters: boolean;
	wordWrapBreakAfterCharacters: boolean;
	wordWrapBreakObtrusiveCharacters: boolean;
	tabFocusMode: boolean;
	stopLineTokenizationAfter: boolean;
	stopRenderingLineAfter: boolean;
	longLineBoundary: boolean;
	forcedTokenizationBoundary: boolean;

	// ---- Options that are transparent - get no massaging
	hover: boolean;
	contextmenu: boolean;
	quickSuggestions: boolean;
	quickSuggestionsDelay: boolean;
	iconsInSuggestions: boolean;
	autoClosingBrackets: boolean;
	formatOnType: boolean;
	suggestOnTriggerCharacters: boolean;
	selectionHighlight: boolean;
	outlineMarkers: boolean;
	referenceInfos: boolean;
	folding: boolean;
	renderWhitespace: boolean;

	// ---- Options that are computed
	layoutInfo: boolean;
	stylingInfo: boolean;
	wrappingInfo: boolean;
	observedOuterWidth: boolean;
	observedOuterHeight: boolean;
	lineHeight: boolean;
	pageSize: boolean;
	typicalHalfwidthCharacterWidth: boolean;
	typicalFullwidthCharacterWidth: boolean;
	fontSize: boolean;
}

/**
 * An event describing that one or more supports of a mode have changed.
 */
export interface IModeSupportChangedEvent {
	tokenizationSupport:boolean;
	occurrencesSupport:boolean;
	declarationSupport:boolean;
	typeDeclarationSupport:boolean;
	navigateTypesSupport:boolean;
	referenceSupport:boolean;
	suggestSupport:boolean;
	parameterHintsSupport:boolean;
	extraInfoSupport:boolean;
	outlineSupport:boolean;
	logicalSelectionSupport:boolean;
	formattingSupport:boolean;
	inplaceReplaceSupport:boolean;
	emitOutputSupport:boolean;
	linkSupport:boolean;
	configSupport:boolean;
	quickFixSupport: boolean;
	codeLensSupport: boolean;
	richEditSupport: boolean;
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
	 * Message to be rendered when hovering over the decoration.
	 */
	hoverMessage?:string;
	/**
	 * Array of IHTMLContentElements to render as the decoration message.
	 */
	htmlMessage?:IHTMLContentElement[];
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
 */
export interface IModelTrackedRange {
	/**
	 * Identifier for a tracked range
	 */
	id: string;
	/**
	 * Range that this tracked range covers
	 */
	range: IRange;
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
	range: IRange;
	/**
	 * Options associated with this decoration.
	 */
	options: IModelDecorationOptions;
}

/**
 * An accessor that can add, change or remove model decorations.
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
 */
export interface IWordRange {
	/**
	 * The column where the word starts.
	 */
	start:number;
	/**
	 * The column where the word ends.
	 */
	end:number;
}

export interface ITokenInfo {
	token: IToken;
	lineNumber: number;
	startColumn: number;
	endColumn: number;
}

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
 * The result of a matchBracket operation.
 */
export interface IMatchBracketResult {
	/**
	 * The two ranges describing matching brackets, or null
	 */
	brackets:IEditorRange[];
	/**
	 * Indicates that the bracket match result is not accurate because the search
	 * hit some untokenized lines.
	 */
	isAccurate:boolean;
}

/**
 * A read-only line marker in the model.
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
	addEditOperation(range:IEditorRange, text:string): void;

	/**
	 * Track `selection` when applying edit operations.
	 * A best effort will be made to not grow/expand the selection.
	 * An empty selection will clamp to a nearby character.
	 * @param selection The selection to track.
	 * @param trackPreviousOnEmpty If set, and the selection is empty, indicates whether the selection
	 *           should clamp to the previous or the next character.
	 * @return A unique identifer.
	 */
	trackSelection(selection:IEditorSelection, trackPreviousOnEmpty?:boolean): string;
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
	getTrackedSelection(id:string): IEditorSelection;
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
	computeCursorState(model:ITokenizedModel, helper:ICursorStateComputerData): IEditorSelection;
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
	range: IEditorRange;
	/**
	 * The text to replace with. This can be null to emulate a simple delete.
	 */
	text: string;
	/**
	 * This indicates that this operation has "insert" semantics.
	 * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
	 */
	forceMoveMarkers: boolean;
}


/**
 * A callback that can compute the cursor state after applying a series of edit operations.
 */
export interface ICursorStateComputer {
	/**
	 * A callback that can compute the resulting cursors state after some edit operations have been executed.
	 */
	(inverseEditOperations:IIdentifiedSingleEditOperation[]): IEditorSelection[];
}

/**
 * A token on a line.
 */
export interface ILineToken {
	startIndex: number;
	type: string;
}

export interface ITokensInflatorMap {
	_inflate:string[];
	_deflate: { [token:string]:number; };
}

export interface ILineTokensBinaryEncoding {
	START_INDEX_MASK: number;
	TYPE_MASK: number;
	START_INDEX_OFFSET: number;
	TYPE_OFFSET: number;

	deflateArr(map:ITokensInflatorMap, tokens:IToken[]): number[];
	inflate(map:ITokensInflatorMap, binaryEncodedToken:number): IToken;
	getStartIndex(binaryEncodedToken:number): number;
	getType(map:ITokensInflatorMap, binaryEncodedToken:number): string;
	inflateArr(map:ITokensInflatorMap, binaryEncodedTokens:number[]): IToken[];
	findIndexOfOffset(binaryEncodedTokens:number[], offset:number): number;
	sliceAndInflate(map:ITokensInflatorMap, binaryEncodedTokens:number[], startOffset:number, endOffset:number, deltaStartIndex:number): IToken[];
}
export var LineTokensBinaryEncoding:ILineTokensBinaryEncoding = TokensBinaryEncoding;

/**
 * A list of tokens on a line.
 */
export interface ILineTokens {
	/**
	 * Get the binary representation of tokens.
	 */
	getBinaryEncodedTokens(): number[];

	/**
	 * A map to help decoding the token type.
	 */
	getBinaryEncodedTokensMap(): ITokensInflatorMap;

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
}

/**
 * Result for a ITextModel.guessIndentation
 */
export interface IGuessedIndentation {
	/**
	 * If indentation is based on spaces (`insertSpaces` = true), then what is the number of spaces that make an indent?
	 */
	tabSize: number;
	/**
	 * Is indentation based on spaces?
	 */
	insertSpaces: boolean;
}

export interface ITextModelResolvedOptions {
	tabSize: number;
	insertSpaces: boolean;
	defaultEOL: DefaultEndOfLine;
}

export interface ITextModelCreationOptions {
	tabSize: number;
	insertSpaces: boolean;
	detectIndentation: boolean;
	defaultEOL: DefaultEndOfLine;
}

export interface ITextModelUpdateOptions {
	tabSize?: number;
	insertSpaces?: boolean;
}

export interface IModelOptionsChangedEvent {
	tabSize: boolean;
	insertSpaces: boolean;
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
	 * Get the text stored in this model.
	 * @param eol The end of line character preference. Defaults to `EndOfLinePreference.TextDefined`.
	 * @param preserverBOM Preserve a BOM character if it was detected when the model was constructed.
	 * @return The text.
	 */
	getValue(eol?:EndOfLinePreference, preserveBOM?:boolean): string;

	getValueLength(eol?:EndOfLinePreference, preserveBOM?:boolean): number;

	toRawText(): IRawText;

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
	 * sit in lines with length < `longLineBoundary`. Second bucket (B) is of
	 * characters that sit in lines with length >= `longLineBoundary`.
	 * If count(B) > count(A) return true. Returns false otherwise.
	 */
	isDominatedByLongLines(longLineBoundary:number): boolean;

	/**
	 * Get the number of lines in the model.
	 */
	getLineCount(): number;

	/**
	 * Get the text for a certain line.
	 */
	getLineContent(lineNumber:number): string;

	/**
	 * Get the text for all lines.
	 */
	getLinesContent(): string[];

	/**
	 * Get the end of line character predominantly used in the text buffer.
	 * @return EOL char sequence (e.g.: '\n' or '\r\n').
	 */
	getEOL(): string;

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
	validatePosition(position:IPosition): IEditorPosition;

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
	modifyPosition(position: IPosition, offset: number): IEditorPosition;

	/**
	 * Create a valid range.
	 */
	validateRange(range:IRange): IEditorRange;

	/**
	 * Get a range covering the entire model
	 */
	getFullModelRange(): IEditorRange;

	/**
	 * Returns iff the model was disposed or not.
	 */
	isDisposed(): boolean;
}

export interface IRichEditBracket {
	modeId: string;
	open: string;
	close: string;
	forwardRegex: RegExp;
	reversedRegex: RegExp;
}

export interface IFoundBracket {
	range: IEditorRange;
	open: string;
	close: string;
	isOpen: boolean;
}

/**
 * A model that is tokenized.
 */
export interface ITokenizedModel extends ITextModel {

	/**
	 * Set the value at which to stop tokenization.
	 * The default is 10000.
	 */
	setStopLineTokenizationAfter(stopLineTokenizationAfter:number): void;

	/**
	 * Tokenize if necessary and get the tokens for the line `lineNumber`.
	 * @param lineNumber The line number
	 * @param inaccurateTokensAcceptable Are inaccurate tokens acceptable? Defaults to false
	 */
	getLineTokens(lineNumber:number, inaccurateTokensAcceptable?:boolean): ILineTokens;

	/**
	 * Tokenize if necessary and get the tokenization result for the line `lineNumber`, as returned by the language mode.
	 */
	getLineContext(lineNumber:number): ILineContext;

	/*package*/_getLineModeTransitions(lineNumber:number): IModeTransition[];

	/**
	 * Replace the entire text buffer value contained in this model.
	 * Optionally, the language mode of the model can be changed.
	 * This call clears all of the undo / redo stack,
	 * removes all decorations or tracked ranges, emits a
	 * ModelContentChanged(ModelContentChangedFlush) event and
	 * unbinds the mirror model from the previous mode to the new
	 * one if the mode has changed.
	 */
	setValue(newValue:string, newMode?:IMode): void;

	/**
	 * Get the current language mode associated with the model.
	 */
	getMode(): IMode;

	/**
	 * Set the current language mode associated with the model.
	 */
	setMode(newMode:IMode): void;
	setMode(newModePromise:TPromise<IMode>): void;
	/**
	 * A mode can be currently pending loading if a promise is used when constructing a model or calling setMode().
	 *
	 * If there is no currently pending loading mode, then the result promise will complete immediately.
	 * Otherwise, the result will complete once the currently pending loading mode is loaded.
	 */
	whenModeIsReady(): TPromise<IMode>;

	/**
	 * Returns the true (inner-most) language mode at a given position.
	 */
	getModeAtPosition(lineNumber:number, column:number): IMode;

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
	 * Get the words on line `lineNumber`.
	 * @param lineNumber The lineNumber
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return All the words on the line.
	 */
	getWords(lineNumber:number): IWordRange[];

	/**
	 * Returns an iterator that can be used to read
	 * next and previous tokens from the provided position.
	 * The iterator is made available through the callback
	 * function and can't be used afterwards.
	 */
	tokenIterator(position: IPosition, callback: (it: ITokenIterator) =>any): any;

	/**
	 * Find the matching bracket of `request` up, counting brackets.
	 * @param request The bracket we're searching for
	 * @param position The position at which to start the search.
	 * @return The range of the matching bracket, or null if the bracket match was not found.
	 */
	findMatchingBracketUp(bracket:string, position:IPosition): IEditorRange;

	/**
	 * Find the first bracket in the model before `position`.
	 * @param position The position at which to start the search.
	 * @return The info for the first bracket before `position`, or null if there are no more brackets before `positions`.
	 */
	findPrevBracket(position:IPosition): IFoundBracket;

	/**
	 * Find the first bracket in the model after `position`.
	 * @param position The position at which to start the search.
	 * @return The info for the first bracket after `position`, or null if there are no more brackets after `positions`.
	 */
	findNextBracket(position:IPosition): IFoundBracket;

	/**
	 * Given a `position`, if the position is on top or near a bracket,
	 * find the matching bracket of that bracket and return the ranges of both brackets.
	 * @param position The position at which to look for a bracket.
	 */
	matchBracket(position:IPosition, inaccurateResultAcceptable?:boolean): IMatchBracketResult;

	/**
	 * No mode supports allowed on this model because it is simply too large.
	 * (even tokenization would cause too much memory pressure)
	 */
	isTooLargeForHavingAMode(): boolean;

	/**
	 * Only basic mode supports allowed on this model because it is simply too large.
	 * (tokenization is allowed and other basic supports)
	 */
	isTooLargeForHavingARichMode(): boolean;
}

/**
 * A model that can track markers.
 */
export interface ITextModelWithMarkers extends ITextModel {
	/*package*/_addMarker(lineNumber:number, column:number, stickToPreviousCharacter:boolean): string;
	/*package*/_changeMarker(id:string, newLineNumber:number, newColumn:number): void;
	/*package*/_changeMarkerStickiness(id:string, newStickToPreviousCharacter:boolean): void;
	/*package*/_getMarker(id:string): IEditorPosition;
	/*package*/_removeMarker(id:string): void;
	/*package*/_getLineMarkers(lineNumber: number): IReadOnlyLineMarker[];
}

/**
 * A map of changed ranges used during the model internal processing
 */
export interface IChangedTrackedRanges {
	[key:string]:IRange;
}

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
	 */
	addTrackedRange(range:IRange, stickiness:TrackedRangeStickiness): string;

	/**
	 * Change the range of a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRange` call.
	 * @param newRange The new range of the tracked range.
	 */
	changeTrackedRange(id:string, newRange:IRange): void;

	/**
	 * Change the stickiness (behaviour when typing at the edges of the range) for a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRange` call.
	 * @param newStickiness The new behaviour when typing at the edges of the range.
	 */
	changeTrackedRangeStickiness(id:string, newStickiness:TrackedRangeStickiness): void;

	/**
	 * Remove a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRaneg` call.
	 */
	removeTrackedRange(id:string): void;

	/**
	 * Get the range of a tracked range.
	 * @param id The id of the tracked range, as returned by a `addTrackedRaneg` call.
	 */
	getTrackedRange(id:string): IEditorRange;

	/**
	 * Gets all the tracked ranges for the lines between `startLineNumber` and `endLineNumber` as an array.
	 * @param startLineNumber The start line number
	 * @param endLineNumber The end line number
	 * @return An array with the tracked ranges
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
	getDecorationRange(id:string): IEditorRange;

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

	normalizeIndentation(str:string): string;

	getOneIndent(): string;

	updateOptions(newOpts:ITextModelUpdateOptions): void;

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
	pushEditOperations(beforeCursorState:IEditorSelection[], editOperations:IIdentifiedSingleEditOperation[], cursorStateComputer:ICursorStateComputer): IEditorSelection[];

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
	 */
	undo(): IEditorSelection[];

	/**
	 * Redo edit operations until the next stop point created by `pushStackElement`.
	 * The inverse edit operations will be pushed on the undo stack.
	 */
	redo(): IEditorSelection[];

	/**
	 * Set an editable range on the model.
	 */
	setEditableRange(range:IRange): void;

	/**
	 * Check if the model has an editable range.
	 */
	hasEditableRange(): boolean;

	/**
	 * Get the editable range on the model.
	 */
	getEditableRange(): IEditorRange;
}

/**
 * A model.
 */
export interface IModel extends IEditableTextModel, ITextModelWithMarkers, ITokenizedModel, ITextModelWithTrackedRanges, ITextModelWithDecorations, IEventEmitter, IEditorModel {
	/**
	 * A unique identifier associated with this model.
	 */
	id: string;

	/**
	 * Destroy this model. This will unbind the model from the mode
	 * and make all necessary clean-up to release this object to the GC.
	 */
	destroy(): void;

	/**
	 * Gets the resource associated with this editor model.
	 */
	getAssociatedResource(): URI;

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
	findMatches(searchString:string, searchOnlyEditableRange:boolean, isRegex:boolean, matchCase:boolean, wholeWord:boolean, limitResultCount?:number): IEditorRange[];
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
	findMatches(searchString:string, searchScope:IRange, isRegex:boolean, matchCase:boolean, wholeWord:boolean, limitResultCount?:number): IEditorRange[];
	/**
	 * Search the model for the next match. Loops to the beginning of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @return The range where the next match is. It is null if no next match has been found.
	 */
	findNextMatch(searchString:string, searchStart:IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): IEditorRange;
	/**
	 * Search the model for the previous match. Loops to the end of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @return The range where the previous match is. It is null if no previous match has been found.
	 */
	findPreviousMatch(searchString:string, searchStart:IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): IEditorRange;

	/**
	 * Replace the entire text buffer value contained in this model.
	 * Optionally, the language mode of the model can be changed.
	 * This call clears all of the undo / redo stack,
	 * removes all decorations or tracked ranges, emits a
	 * ModelContentChanged(ModelContentChangedFlush) event and
	 * unbinds the mirror model from the previous mode to the new
	 * one if the mode has changed.
	 */
	setValue(newValue:string, newMode?:IMode): void;
	setValue(newValue:string, newModePromise:TPromise<IMode>): void;

	setValueFromRawText(newValue:IRawText, newMode?:IMode): void;
	setValueFromRawText(newValue:IRawText, newModePromise:TPromise<IMode>): void;

	onBeforeAttached(): void;

	onBeforeDetached(): void;

	getModeId(): string;

	/**
	 * Returns iff this model is attached to an editor or not.
	 */
	isAttachedToEditor(): boolean;
}

export interface IRangeWithText {
	text:string;
	range:IRange;
}

export interface IMirrorModel extends IEventEmitter, ITokenizedModel {
	getEmbeddedAtPosition(position:IPosition): IMirrorModel;
	getAllEmbedded(): IMirrorModel[];

	getAssociatedResource(): URI;

	getOffsetFromPosition(position:IPosition): number;
	getPositionFromOffset(offset:number): IPosition;
	getOffsetAndLengthFromRange(range:IRange): {offset:number; length:number;};
	getRangeFromOffsetAndLength(offset:number, length:number): IRange;
	getLineStart(lineNumber:number): number;

	getAllWordsWithRange(): IRangeWithText[];
	getAllUniqueWords(skipWordOnce?:string): string[];
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
	 * The end-of-line character.
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
export interface IRawText {
	length: number;
	lines: string[];
	BOM: string;
	EOL: string;
	options: ITextModelResolvedOptions;
}
/**
 * An event describing that a model has been reset to a new value.
 */
export interface IModelContentChangedFlushEvent extends IModelContentChangedEvent {
	/**
	 * The new text content of the model.
	 */
	detail: IRawText;
}
/**
 * An event describing that a line has changed in a model.
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
	id:string;
	ownerId:number;
	range:IRange;
	isForValidation:boolean;
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
	 * Lists of details
	 */
	addedOrChangedDecorations:IModelDecorationsChangedEventDecorationData[];
	removedDecorations:string[];
	oldOptions:{[decorationId:string]:IModelDecorationOptions;};
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
 * An event describing that the cursor position has changed.
 */
export interface ICursorPositionChangedEvent {
	/**
	 * Primary cursor's position.
	 */
	position:IEditorPosition;
	/**
	 * Primary cursor's view position
	 */
	viewPosition:IEditorPosition;
	/**
	 * Secondary cursors' position.
	 */
	secondaryPositions:IEditorPosition[];
	/**
	 * Secondary cursors' view position.
	 */
	secondaryViewPositions:IEditorPosition[];
	/**
	 * Reason.
	 */
	reason:string;
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
	selection:IEditorSelection;
	/**
	 * The primary selection in view coordinates.
	 */
	viewSelection:IEditorSelection;
	/**
	 * The secondary selections.
	 */
	secondarySelections:IEditorSelection[];
	/**
	 * The secondary selections in view coordinates.
	 */
	secondaryViewSelections:IEditorSelection[];
	/**
	 * Source of the call that caused the event.
	 */
	source:string;
	/**
	 * Reason.
	 */
	reason:string;
}
export enum VerticalRevealType {
	Simple = 0,
	Center = 1,
	CenterIfOutsideViewport = 2
}
/**
 * An event describing a request to reveal a specific range in the view of the editor.
 */
export interface ICursorRevealRangeEvent {
	/**
	 * Range to be reavealed.
	 */
	range:IEditorRange;
	/**
	 * View range to be reavealed.
	 */
	viewRange:IEditorRange;

	verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	revealHorizontal:boolean;
}

export interface ICursorScrollRequestEvent {
	deltaLines: number;
}

export interface IModelChangedEvent {
	oldModelUrl: string;
	newModelUrl: string;
}

export interface IEditorWhitespace {
	id:number;
	afterLineNumber:number;
	heightInLines:number;
}

/**
 * A description for the overview ruler position.
 */
export interface IOverviewRulerPosition {
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
}

/**
 * The internal layout details of the editor.
 */
export interface IEditorLayoutInfo {
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
	overviewRuler:IOverviewRulerPosition;
}

/**
 * Options for creating the editor.
 */
export interface ICodeEditorWidgetCreationOptions extends IEditorOptions {
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
 */
export interface IDiffLineInformation {
	equivalentLineNumber: number;
}

export const KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS = 'editorTextFocus';
export const KEYBINDING_CONTEXT_EDITOR_FOCUS = 'editorFocus';
export const KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS = 'editorTabMovesFocus';
export const KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS = 'editorHasMultipleSelections';
export const KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION = 'editorHasSelection';
export const KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID = 'editorLangId';
export const SHOW_ACCESSIBILITY_HELP_ACTION_ID = 'editor.action.showAccessibilityHelp';

export interface IDispatcherEvent {
	getSource(): string;
	getData(): any;
}

export interface IHandler {
	(e:IDispatcherEvent): boolean;
}

export interface IHandlerDispatcher {
	setHandler(handlerId:string, handlerCallback:IHandler): void;
	clearHandlers(): void;
	trigger(source:string, handlerId:string, payload:any): boolean;
}

export interface IEditorStyling {
	editorClassName: string;
	fontFamily: string;
	fontSize: number;
	lineHeight: number;
}

export interface IConfiguration {
	onDidChange: Event<IConfigurationChangedEvent>;

	editor:IInternalEditorOptions;

	setLineCount(lineCount:number): void;

	handlerDispatcher: IHandlerDispatcher;
}

// --- view

export interface IViewLineTokens {
	getTokens(): ILineToken[];
	getFauxIndentLength(): number;
	getTextLength(): number;
	equals(other:IViewLineTokens): boolean;
	findIndexOfOffset(offset:number): number;
}

export interface IViewModelDecorationsResolver {
	getDecorations(): IModelDecoration[];
	getInlineDecorations(lineNumber: number): IModelDecoration[];
}

export interface IViewEventBus {
	emit(eventType:string, data?:any): void;
}

export interface IWhitespaceManager {
	/**
	 * Reserve rendering space.
	 * @param height is specified in pixels.
	 * @return an identifier that can be later used to remove or change the whitespace.
	 */
	addWhitespace(afterLineNumber:number, ordinal:number, height:number): number;

	/**
	 * Change the properties of a whitespace.
	 * @param height is specified in pixels.
	 */
	changeWhitespace(id:number, newAfterLineNumber:number, newHeight:number): boolean;

	/**
	 * Remove rendering space
	 */
	removeWhitespace(id:number): boolean;

	/**
	 * Get the layout information for whitespaces currently in the viewport
	 */
	getWhitespaceViewportData(): IViewWhitespaceViewportData[];

	getWhitespaces(): IEditorWhitespace[];
}

export interface IViewModel extends IEventEmitter, IDisposable {

	getTabSize(): number;

	getLineCount(): number;
	getLineContent(lineNumber:number): string;
	getLineMinColumn(lineNumber:number): number;
	getLineMaxColumn(lineNumber:number): number;
	getLineFirstNonWhitespaceColumn(lineNumber:number): number;
	getLineLastNonWhitespaceColumn(lineNumber:number): number;
	getLineTokens(lineNumber:number): IViewLineTokens;
	getDecorationsResolver(startLineNumber:number, endLineNumber:number): IViewModelDecorationsResolver;
	getLineRenderLineNumber(lineNumber:number): string;
	getAllDecorations(): IModelDecoration[];
	getEOL(): string;
	getValueInRange(range:IRange, eol:EndOfLinePreference): string;
	dispose(): void;

	getSelections(): IEditorSelection[];

	getModelLineContent(modelLineNumber:number): string;
	getModelLineMaxColumn(modelLineNumber:number): number;
	validateModelPosition(position:IPosition): IEditorPosition;
	convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): IEditorPosition;
	convertViewRangeToModelRange(viewRange:IRange): IEditorRange;
	convertModelPositionToViewPosition(modelLineNumber:number, modelColumn:number): IEditorPosition;
	convertModelSelectionToViewSelection(modelSelection:IEditorSelection): IEditorSelection;
	modelPositionIsVisible(position:IPosition): boolean;
}

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
	vertical: boolean;
	horizontal: boolean;
	scrollTop:number;
	scrollLeft:number;
}

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

export interface IViewLineChangedEvent {
	/**
	 * The line that has changed.
	 */
	lineNumber: number;
}

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

export interface IViewDecorationsChangedEvent {
	/**
	 * signals that at least one inline decoration has changed
	 */
	inlineDecorationsChanged: boolean;
}

export interface IViewCursorPositionChangedEvent {
	/**
	 * Primary cursor's position.
	 */
	position: IEditorPosition;
	/**
	 * Secondary cursors' position.
	 */
	secondaryPositions: IEditorPosition[];
	/**
	 * Is the primary cursor in the editable range?
	 */
	isInEditableRange: boolean;
}

export interface IViewCursorSelectionChangedEvent {
	/**
	 * The primary selection.
	 */
	selection: IEditorSelection;
	/**
	 * The secondary selections.
	 */
	secondarySelections: IEditorSelection[];
}

export interface IViewRevealRangeEvent {
	/**
	 * Range to be reavealed.
	 */
	range: IEditorRange;

	verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	revealHorizontal: boolean;
}

export interface IViewScrollRequestEvent {
	deltaLines: number;
}

export interface IViewWhitespaceViewportData {
	id:number;
	afterLineNumber:number;
	verticalOffset:number;
	height:number;
}

export interface IViewLinesViewportData {
	viewportTop: number;
	viewportHeight: number;

	bigNumbersDelta: number;

	visibleRangesDeltaTop:number;
	/**
	 * The line number at which to start rendering (inclusive).
	 */
	startLineNumber:number;
	/**
	 * The line number at which to end rendering (inclusive).
	 */
	endLineNumber:number;
	/**
	 * relativeVerticalOffset[i] is the gap that must be left between line at
	 * i - 1 + `startLineNumber` and i + `startLineNumber`.
	 */
	relativeVerticalOffset:number[];
	/**
	 * The viewport as a range (`startLineNumber`,1) -> (`endLineNumber`,maxColumn(`endLineNumber`)).
	 */
	visibleRange:IEditorRange;

	getInlineDecorationsForLineInViewport(lineNumber:number): IModelDecoration[];
	getDecorationsInViewport(): IModelDecoration[];
}

export interface IViewport {
	top: number;
	left: number;
	width: number;
	height: number;
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
	keybindingContext: string;
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
 */
export interface IEditorActionDescriptorData {
	id:string;
	label:string;
}

export type IEditorActionContributionCtor = IConstructorSignature2<IEditorActionDescriptorData, ICommonCodeEditor, IEditorContribution>;

export type ICommonEditorContributionCtor = IConstructorSignature1<ICommonCodeEditor, IEditorContribution>;

/**
 * An editor contribution descriptor that will be used to construct editor contributions
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
export interface IEditor extends IEventEmitter {

	getId(): string;

	/**
	 * Get the editor type. Current supported types:
	 * 			EditorCommon.EditorType.ICodeEditor => ICodeEditor;
	 * 			EditorCommon.EditorType.IDiffEditor => IDiffEditor;
	 * This is to avoid an instanceof check
	 */
	getEditorType(): string;

	/**
	 * Destroy the editor.
	 */
	destroy(): void;

	/**
	 * Update the editor's options after the editor has been created.
	 */
	updateOptions(newOptions: IEditorOptions): void;

	/**
	 * Indicates that the editor becomes visible.
	 */
	onVisible(): void;

	/**
	 * Indicates that the editor becomes hidden.
	 */
	onHide(): void;

	/**
	 * Instructs the editor to remeasure its container. This method should
	 * be called when the container of the editor gets resized.
	 */
	layout(dimension?:IDimension): void;

	/**
	 * Brings browser focus to the editor
	 */
	focus(): void;

	/**
	 * Returns true if this editor has keyboard focus.
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
	getPosition(): IEditorPosition;

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
	getSelection(): IEditorSelection;

	/**
	 * Returns all the selections of the editor.
	 */
	getSelections(): IEditorSelection[];

	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection:IRange): void;
	setSelection(selection:IEditorRange): void;
	setSelection(selection:ISelection): void;
	setSelection(selection:IEditorSelection): void;

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
	 */
	changeDecorations(callback: (changeAccessor:IModelDecorationsChangeAccessor)=>any): any;
}

export interface ICodeEditorState {
	validate(editor:ICommonCodeEditor): boolean;
}

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

export type MarkedString = string | { language: string; value: string };

export interface IThemeDecorationRenderOptions {
	backgroundColor?: string;

	outlineColor?: string;
	outlineStyle?: string;
	outlineWidth?: string;

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

	overviewRulerColor?: string;
}

export interface IDecorationRenderOptions extends IThemeDecorationRenderOptions {
	isWholeLine?: boolean;
	overviewRulerLane?: OverviewRulerLane;

	light?: IThemeDecorationRenderOptions;
	dark?: IThemeDecorationRenderOptions;
}

export interface IRangeWithMessage {
	range: IRange;
	hoverMessage?: IHTMLContentElement[];
}

export interface ICommonCodeEditor extends IEditor {

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution(id: string): IEditorContribution;

	captureState(...flags:CodeEditorStateFlag[]): ICodeEditorState;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): IModel;

	/**
	 * Returns the current editor's configuration
	 */
	getConfiguration(): IInternalEditorOptions;

	/**
	 * Returns the 'raw' editor's configuration, as it was applied over the defaults, but without any computed members.
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
	 * Change the scrollTop of the editor's viewport.
	 */
	setScrollTop(newScrollTop: number): void;
	/**
	 * Get the scrollTop of the editor's viewport.
	 */
	getScrollTop(): number;

	/**
	 * Change the scrollLeft of the editor's viewport.
	 */
	setScrollLeft(newScrollLeft: number): void;
	/**
	 * Get the scrollLeft of the editor's viewport.
	 */
	getScrollLeft(): number;

	/**
	 * Get the scrollWidth of the editor's viewport.
	 */
	getScrollWidth(): number;

	/**
	 * Get the scrollHeight of the editor's viewport.
	 */
	getScrollHeight(): number;

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
	executeCommand(source: string, command: ICommand): boolean;

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
	executeCommands(source: string, commands: ICommand[]): boolean;

	/**
	 * Get all the decorations on a line (filtering out decorations from other editors).
	 */
	getLineDecorations(lineNumber: number): IModelDecoration[];

	/**
	 * All decorations added through this call wii get the ownerId of this editor.
	 * @see IModel.deltaDecorations
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];

	setDecorations(decorationTypeKey: string, ranges:IRangeWithMessage[]): void;

	removeDecorations(decorationTypeKey:string): void;

	/**
	 * Get the layout info for the editor.
	 */
	getLayoutInfo(): IEditorLayoutInfo;

	/**
	 * Prevent the editor from sending a widgetFocusLost event,
	 * set it in a state where it believes that focus is in one of its widgets.
	 * Use this method with care and always add a matching `endForcedWidgetFocus`
	 */
	beginForcedWidgetFocus(): void;

	/**
	 * End the preventing of sending a widgetFocusLost event.
	 */
	endForcedWidgetFocus(): void;

	/**
	 * This listener is notified when a keypress produces a visible character.
	 * The callback should not do operations on the view, as the view might not be updated to reflect previous typed characters.
	 * @param character Character to listen to.
	 * @param callback Function to call when `character` is typed.
	 */
	addTypingListener(character: string, callback: () => void): ListenerUnbind;

}

export interface ICommonDiffEditor extends IEditor {
	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): IDiffEditorModel;

	getOriginalEditor(): ICommonCodeEditor;
	getModifiedEditor(): ICommonCodeEditor;

	getLineChanges(): ILineChange[];

	/**
	 * Get information based on computed diff about a line number from the original model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForOriginal(lineNumber:number): IDiffLineInformation;
	/**
	 * Get information based on computed diff about a line number from the modified model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForModified(lineNumber:number): IDiffLineInformation;

	/**
	 * @see ICodeEditor.getValue
	 */
	getValue(options?:{ preserveBOM:boolean; lineEnding:string; }): string;

	/**
	 * Returns whether the diff editor is ignoring trim whitespace or not.
	 */
	ignoreTrimWhitespace: boolean;
	/**
	 * Returns whether the diff editor is rendering side by side or not.
	 */
	renderSideBySide: boolean;
}

export var EditorType = {
	ICodeEditor: 'vs.editor.ICodeEditor',
	IDiffEditor: 'vs.editor.IDiffEditor'
};

export var ClassName = {
	EditorWarningDecoration: 'greensquiggly',
	EditorErrorDecoration: 'redsquiggly'
};

export var EventType = {
	Disposed: 'disposed',

	ConfigurationChanged: 'configurationChanged',

	ModelDispose: 'modelDispose',

	ModelChanged: 'modelChanged',

	ModelTokensChanged: 'modelTokensChanged',
	ModelModeChanged: 'modelsModeChanged',
	ModelModeSupportChanged: 'modelsModeSupportChanged',
	ModelOptionsChanged: 'modelOptionsChanged',
	ModelContentChanged: 'contentChanged',
	ModelContentChanged2: 'contentChanged2',
	ModelContentChangedFlush: 'flush',
	ModelContentChangedLinesDeleted: 'linesDeleted',
	ModelContentChangedLinesInserted: 'linesInserted',
	ModelContentChangedLineChanged: 'lineChanged',

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
	ViewScrollWidthChanged: 'scrollWidthChanged',
	ViewScrollHeightChanged: 'scrollHeightChanged',
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

	Enter: 						'enter',
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

export class VisibleRange {

	public top:number;
	public left:number;
	public width:number;

	constructor(top:number, left:number, width:number) {
		this.top = top;
		this.left = left;
		this.width = width;
	}
}

export enum TextEditorCursorStyle {
	Line = 1,
	Block = 2,
	Underline = 3
}

export function cursorStyleFromString(cursorStyle:string): TextEditorCursorStyle {
	if (cursorStyle === 'line') {
		return TextEditorCursorStyle.Line;
	} else if (cursorStyle === 'block') {
		return TextEditorCursorStyle.Block;
	} else if (cursorStyle === 'underline') {
		return TextEditorCursorStyle.Underline;
	}
	return TextEditorCursorStyle.Line;
}

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

export class HorizontalRange {

	public left: number;
	public width: number;

	constructor(left:number, width:number) {
		this.left = left;
		this.width = width;
	}
}

export class LineVisibleRanges {

	public lineNumber: number;
	public ranges: HorizontalRange[];

	constructor(lineNumber:number, ranges:HorizontalRange[]) {
		this.lineNumber = lineNumber;
		this.ranges = ranges;
	}
}
