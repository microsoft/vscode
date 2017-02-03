/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { BulkListenerCallback } from 'vs/base/common/eventEmitter';
import { MarkedString } from 'vs/base/common/htmlContent';
import * as types from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ServicesAccessor, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { LanguageId, LanguageIdentifier, StandardTokenType } from 'vs/editor/common/modes';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IndentRange } from 'vs/editor/common/model/indentRanges';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { FontInfo } from 'vs/editor/common/config/fontInfo';

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
	readonly lineNumber: number;
	/**
	 * column (the first character in a line is between column 1 and column 2)
	 */
	readonly column: number;
}

/**
 * A range in the editor. This interface is suitable for serialization.
 */
export interface IRange {
	/**
	 * Line number on which the range starts (starts at 1).
	 */
	readonly startLineNumber: number;
	/**
	 * Column on which the range starts in line `startLineNumber` (starts at 1).
	 */
	readonly startColumn: number;
	/**
	 * Line number on which the range ends.
	 */
	readonly endLineNumber: number;
	/**
	 * Column on which the range ends in line `endLineNumber`.
	 */
	readonly endColumn: number;
}

/**
 * A selection in the editor.
 * The selection is a range that has an orientation.
 */
export interface ISelection {
	/**
	 * The line number on which the selection has started.
	 */
	readonly selectionStartLineNumber: number;
	/**
	 * The column on `selectionStartLineNumber` where the selection has started.
	 */
	readonly selectionStartColumn: number;
	/**
	 * The line number on which the selection has ended.
	 */
	readonly positionLineNumber: number;
	/**
	 * The column on `positionLineNumber` where the selection has ended.
	 */
	readonly positionColumn: number;
}

/**
 * Configuration options for editor scrollbars
 */
export interface IEditorScrollbarOptions {
	/**
	 * The size of arrows (if displayed).
	 * Defaults to 11.
	 */
	arrowSize?: number;
	/**
	 * Render vertical scrollbar.
	 * Accepted values: 'auto', 'visible', 'hidden'.
	 * Defaults to 'auto'.
	 */
	vertical?: string;
	/**
	 * Render horizontal scrollbar.
	 * Accepted values: 'auto', 'visible', 'hidden'.
	 * Defaults to 'auto'.
	 */
	horizontal?: string;
	/**
	 * Cast horizontal and vertical shadows when the content is scrolled.
	 * Defaults to true.
	 */
	useShadows?: boolean;
	/**
	 * Render arrows at the top and bottom of the vertical scrollbar.
	 * Defaults to false.
	 */
	verticalHasArrows?: boolean;
	/**
	 * Render arrows at the left and right of the horizontal scrollbar.
	 * Defaults to false.
	 */
	horizontalHasArrows?: boolean;
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

export type LineNumbersOption = 'on' | 'off' | 'relative' | ((lineNumber: number) => string);

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
	lineNumbers?: LineNumbersOption;
	/**
	 * Should the corresponding line be selected when clicking on the line number?
	 * Defaults to true.
	 */
	selectOnLineNumbers?: boolean;
	/**
	 * Control the width of line numbers, by reserving horizontal space for rendering at least an amount of digits.
	 * Defaults to 5.
	 */
	lineNumbersMinChars?: number;
	/**
	 * Enable the rendering of the glyph margin.
	 * Defaults to true in vscode and to false in monaco-editor.
	 */
	glyphMargin?: boolean;
	/**
	 * The width reserved for line decorations (in px).
	 * Line decorations are placed between line numbers and the editor content.
	 * You can pass in a string in the format floating point followed by "ch". e.g. 1.3ch.
	 * Defaults to 10.
	 */
	lineDecorationsWidth?: number | string;
	/**
	 * When revealing the cursor, a virtual padding (px) is added to the cursor, turning it into a rectangle.
	 * This virtual padding ensures that the cursor gets revealed before hitting the edge of the viewport.
	 * Defaults to 30 (px).
	 */
	revealHorizontalRightPadding?: number;
	/**
	 * Render the editor selection with rounded borders.
	 * Defaults to true.
	 */
	roundedSelection?: boolean;
	/**
	 * Theme to be used for rendering.
	 * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black'.
	 * You can create custom themes via `monaco.editor.defineTheme`.
	 */
	theme?: string;
	/**
	 * Should the editor be read only.
	 * Defaults to false.
	 */
	readOnly?: boolean;
	/**
	 * Control the behavior and rendering of the scrollbars.
	 */
	scrollbar?: IEditorScrollbarOptions;
	/**
	 * Display overflow widgets as `fixed`.
	 * Defaults to `false`.
	 */
	fixedOverflowWidgets?: boolean;
	/**
	 * The number of vertical lanes the overview ruler should render.
	 * Defaults to 2.
	 */
	overviewRulerLanes?: number;
	/**
	 * Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'.
	 * Defaults to 'blink'.
	 */
	cursorBlinking?: string;
	/**
	 * Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.
	 * Defaults to false.
	 */
	mouseWheelZoom?: boolean;
	/**
	 * Control the cursor style, either 'block' or 'line'.
	 * Defaults to 'line'.
	 */
	cursorStyle?: string;
	/**
	 * Enable font ligatures.
	 * Defaults to false.
	 */
	fontLigatures?: boolean;
	/**
	 * Disable the use of `translate3d`.
	 * Defaults to false.
	 */
	disableTranslate3d?: boolean;
	/**
	 * Disable the optimizations for monospace fonts.
	 * Defaults to false.
	 */
	disableMonospaceOptimizations?: boolean;
	/**
	 * Should the cursor be hidden in the overview ruler.
	 * Defaults to false.
	 */
	hideCursorInOverviewRuler?: boolean;
	/**
	 * Enable that scrolling can go one screen size after the last line.
	 * Defaults to true.
	 */
	scrollBeyondLastLine?: boolean;
	/**
	 * Enable that the editor will install an interval to check if its container dom node size has changed.
	 * Enabling this might have a severe performance impact.
	 * Defaults to false.
	 */
	automaticLayout?: boolean;
	/**
	 * Control the wrapping strategy of the editor.
	 * Using -1 means no wrapping whatsoever.
	 * Using 0 means viewport width wrapping (ajusts with the resizing of the editor).
	 * Using a positive number means wrapping after a fixed number of characters.
	 * Defaults to 300.
	 */
	wrappingColumn?: number;
	/**
	 * Control the alternate style of viewport wrapping.
	 * When set to true viewport wrapping is used only when the window width is less than the number of columns specified in the wrappingColumn property. Has no effect if wrappingColumn is not a positive number.
	 * Defaults to false.
	 */
	wordWrap?: boolean;
	/**
	 * Control indentation of wrapped lines. Can be: 'none', 'same' or 'indent'.
	 * Defaults to 'same' in vscode and to 'none' in monaco-editor.
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
	stopRenderingLineAfter?: number;
	/**
	 * Enable hover.
	 * Defaults to true.
	 */
	hover?: boolean;
	/**
	 * Enable custom contextmenu.
	 * Defaults to true.
	 */
	contextmenu?: boolean;
	/**
	 * A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.
	 * Defaults to 1.
	 */
	mouseWheelScrollSensitivity?: number;
	/**
	 * Enable quick suggestions (shadow suggestions)
	 * Defaults to true.
	 */
	quickSuggestions?: boolean;
	/**
	 * Quick suggestions show delay (in ms)
	 * Defaults to 500 (ms)
	 */
	quickSuggestionsDelay?: number;
	/**
	 * Enables parameter hints
	 */
	parameterHints?: boolean;
	/**
	 * Render icons in suggestions box.
	 * Defaults to true.
	 */
	iconsInSuggestions?: boolean;
	/**
	 * Enable auto closing brackets.
	 * Defaults to true.
	 */
	autoClosingBrackets?: boolean;
	/**
	 * Enable format on type.
	 * Defaults to false.
	 */
	formatOnType?: boolean;
	/**
	 * Enable format on paste.
	 * Defaults to false.
	 */
	formatOnPaste?: boolean;
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
	 * Accept suggestions on provider defined characters.
	 * Defaults to true.
	 */
	acceptSuggestionOnCommitCharacter?: boolean;
	/**
	 * Enable snippet suggestions. Default to 'true'.
	 */
	snippetSuggestions?: 'top' | 'bottom' | 'inline' | 'none';
	/**
	 * Copying without a selection copies the current line.
	 */
	emptySelectionClipboard?: boolean;
	/**
	 * Enable tab completion. Defaults to 'false'
	 */
	tabCompletion?: boolean;
	/**
	 * Enable word based suggestions. Defaults to 'true'
	 */
	wordBasedSuggestions?: boolean;
	/**
	 * The font size for the suggest widget.
	 * Defaults to the editor font size.
	 */
	suggestFontSize?: number;
	/**
	 * The line height for the suggest widget.
	 * Defaults to the editor line height.
	 */
	suggestLineHeight?: number;
	/**
	 * Enable selection highlight.
	 * Defaults to true.
	 */
	selectionHighlight?: boolean;
	/**
	 * Show code lens
	 * Defaults to true.
	 */
	codeLens?: boolean;
	/**
	 * @deprecated - use codeLens instead
	 * @internal
	 */
	referenceInfos?: boolean;
	/**
	 * Enable code folding
	 * Defaults to true in vscode and to false in monaco-editor.
	 */
	folding?: boolean;
	/**
	 * Enable rendering of whitespace.
	 * Defaults to none.
	 */
	renderWhitespace?: 'none' | 'boundary' | 'all';
	/**
	 * Enable rendering of control characters.
	 * Defaults to false.
	 */
	renderControlCharacters?: boolean;
	/**
	 * Enable rendering of indent guides.
	 * Defaults to false.
	 */
	renderIndentGuides?: boolean;
	/**
	 * Enable rendering of current line highlight.
	 * Defaults to all.
	 */
	renderLineHighlight?: 'none' | 'gutter' | 'line' | 'all';
	/**
	 * Inserting and deleting whitespace follows tab stops.
	 */
	useTabStops?: boolean;
	/**
	 * The font family
	 */
	fontFamily?: string;
	/**
	 * The font weight
	 */
	fontWeight?: 'normal' | 'bold' | 'bolder' | 'lighter' | 'initial' | 'inherit' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
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
	 * Render +/- indicators for added/deleted changes.
	 * Defaults to true.
	 */
	renderIndicators?: boolean;
	/**
	 * Original model should be editable?
	 * Defaults to false.
	 */
	originalEditable?: boolean;
}

export class InternalEditorScrollbarOptions {
	readonly _internalEditorScrollbarOptionsBrand: void;

	readonly arrowSize: number;
	readonly vertical: ScrollbarVisibility;
	readonly horizontal: ScrollbarVisibility;
	readonly useShadows: boolean;
	readonly verticalHasArrows: boolean;
	readonly horizontalHasArrows: boolean;
	readonly handleMouseWheel: boolean;
	readonly horizontalScrollbarSize: number;
	readonly horizontalSliderSize: number;
	readonly verticalScrollbarSize: number;
	readonly verticalSliderSize: number;
	readonly mouseWheelScrollSensitivity: number;

	/**
	 * @internal
	 */
	constructor(source: {
		arrowSize: number;
		vertical: ScrollbarVisibility;
		horizontal: ScrollbarVisibility;
		useShadows: boolean;
		verticalHasArrows: boolean;
		horizontalHasArrows: boolean;
		handleMouseWheel: boolean;
		horizontalScrollbarSize: number;
		horizontalSliderSize: number;
		verticalScrollbarSize: number;
		verticalSliderSize: number;
		mouseWheelScrollSensitivity: number;
	}) {
		this.arrowSize = source.arrowSize | 0;
		this.vertical = source.vertical | 0;
		this.horizontal = source.horizontal | 0;
		this.useShadows = Boolean(source.useShadows);
		this.verticalHasArrows = Boolean(source.verticalHasArrows);
		this.horizontalHasArrows = Boolean(source.horizontalHasArrows);
		this.handleMouseWheel = Boolean(source.handleMouseWheel);
		this.horizontalScrollbarSize = source.horizontalScrollbarSize | 0;
		this.horizontalSliderSize = source.horizontalSliderSize | 0;
		this.verticalScrollbarSize = source.verticalScrollbarSize | 0;
		this.verticalSliderSize = source.verticalSliderSize | 0;
		this.mouseWheelScrollSensitivity = Number(source.mouseWheelScrollSensitivity);
	}

	/**
	 * @internal
	 */
	public equals(other: InternalEditorScrollbarOptions): boolean {
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
	readonly _editorWrappingInfoBrand: void;

	readonly isViewportWrapping: boolean;
	readonly wrappingColumn: number;
	readonly wrappingIndent: WrappingIndent;
	readonly wordWrapBreakBeforeCharacters: string;
	readonly wordWrapBreakAfterCharacters: string;
	readonly wordWrapBreakObtrusiveCharacters: string;

	/**
	 * @internal
	 */
	constructor(source: {
		isViewportWrapping: boolean;
		wrappingColumn: number;
		wrappingIndent: WrappingIndent;
		wordWrapBreakBeforeCharacters: string;
		wordWrapBreakAfterCharacters: string;
		wordWrapBreakObtrusiveCharacters: string;
	}) {
		this.isViewportWrapping = Boolean(source.isViewportWrapping);
		this.wrappingColumn = source.wrappingColumn | 0;
		this.wrappingIndent = source.wrappingIndent | 0;
		this.wordWrapBreakBeforeCharacters = String(source.wordWrapBreakBeforeCharacters);
		this.wordWrapBreakAfterCharacters = String(source.wordWrapBreakAfterCharacters);
		this.wordWrapBreakObtrusiveCharacters = String(source.wordWrapBreakObtrusiveCharacters);
	}

	/**
	 * @internal
	 */
	public equals(other: EditorWrappingInfo): boolean {
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
	readonly _internalEditorViewOptionsBrand: void;

	readonly theme: string;
	readonly canUseTranslate3d: boolean;
	readonly disableMonospaceOptimizations: boolean;
	readonly experimentalScreenReader: boolean;
	readonly rulers: number[];
	readonly ariaLabel: string;
	readonly renderLineNumbers: boolean;
	readonly renderCustomLineNumbers: (lineNumber: number) => string;
	readonly renderRelativeLineNumbers: boolean;
	readonly selectOnLineNumbers: boolean;
	readonly glyphMargin: boolean;
	readonly revealHorizontalRightPadding: number;
	readonly roundedSelection: boolean;
	readonly overviewRulerLanes: number;
	readonly cursorBlinking: TextEditorCursorBlinkingStyle;
	readonly mouseWheelZoom: boolean;
	readonly cursorStyle: TextEditorCursorStyle;
	readonly hideCursorInOverviewRuler: boolean;
	readonly scrollBeyondLastLine: boolean;
	readonly editorClassName: string;
	readonly stopRenderingLineAfter: number;
	readonly renderWhitespace: 'none' | 'boundary' | 'all';
	readonly renderControlCharacters: boolean;
	readonly renderIndentGuides: boolean;
	readonly renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	readonly scrollbar: InternalEditorScrollbarOptions;
	readonly fixedOverflowWidgets: boolean;

	/**
	 * @internal
	 */
	constructor(source: {
		theme: string;
		canUseTranslate3d: boolean;
		disableMonospaceOptimizations: boolean;
		experimentalScreenReader: boolean;
		rulers: number[];
		ariaLabel: string;
		renderLineNumbers: boolean;
		renderCustomLineNumbers: (lineNumber: number) => string;
		renderRelativeLineNumbers: boolean;
		selectOnLineNumbers: boolean;
		glyphMargin: boolean;
		revealHorizontalRightPadding: number;
		roundedSelection: boolean;
		overviewRulerLanes: number;
		cursorBlinking: TextEditorCursorBlinkingStyle;
		mouseWheelZoom: boolean;
		cursorStyle: TextEditorCursorStyle;
		hideCursorInOverviewRuler: boolean;
		scrollBeyondLastLine: boolean;
		editorClassName: string;
		stopRenderingLineAfter: number;
		renderWhitespace: 'none' | 'boundary' | 'all';
		renderControlCharacters: boolean;
		renderIndentGuides: boolean;
		renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
		scrollbar: InternalEditorScrollbarOptions;
		fixedOverflowWidgets: boolean;
	}) {
		this.theme = String(source.theme);
		this.canUseTranslate3d = Boolean(source.canUseTranslate3d);
		this.disableMonospaceOptimizations = Boolean(source.disableMonospaceOptimizations);
		this.experimentalScreenReader = Boolean(source.experimentalScreenReader);
		this.rulers = InternalEditorViewOptions._toSortedIntegerArray(source.rulers);
		this.ariaLabel = String(source.ariaLabel);
		this.renderLineNumbers = Boolean(source.renderLineNumbers);
		this.renderCustomLineNumbers = source.renderCustomLineNumbers;
		this.renderRelativeLineNumbers = Boolean(source.renderRelativeLineNumbers);
		this.selectOnLineNumbers = Boolean(source.selectOnLineNumbers);
		this.glyphMargin = Boolean(source.glyphMargin);
		this.revealHorizontalRightPadding = source.revealHorizontalRightPadding | 0;
		this.roundedSelection = Boolean(source.roundedSelection);
		this.overviewRulerLanes = source.overviewRulerLanes | 0;
		this.cursorBlinking = source.cursorBlinking | 0;
		this.mouseWheelZoom = Boolean(source.mouseWheelZoom);
		this.cursorStyle = source.cursorStyle | 0;
		this.hideCursorInOverviewRuler = Boolean(source.hideCursorInOverviewRuler);
		this.scrollBeyondLastLine = Boolean(source.scrollBeyondLastLine);
		this.editorClassName = String(source.editorClassName);
		this.stopRenderingLineAfter = source.stopRenderingLineAfter | 0;
		this.renderWhitespace = source.renderWhitespace;
		this.renderControlCharacters = Boolean(source.renderControlCharacters);
		this.renderIndentGuides = Boolean(source.renderIndentGuides);
		this.renderLineHighlight = source.renderLineHighlight;
		this.scrollbar = source.scrollbar.clone();
		this.fixedOverflowWidgets = Boolean(source.fixedOverflowWidgets);
	}

	private static _toSortedIntegerArray(source: any): number[] {
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

	private static _numberArraysEqual(a: number[], b: number[]): boolean {
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
	public equals(other: InternalEditorViewOptions): boolean {
		return (
			this.theme === other.theme
			&& this.canUseTranslate3d === other.canUseTranslate3d
			&& this.disableMonospaceOptimizations === other.disableMonospaceOptimizations
			&& this.experimentalScreenReader === other.experimentalScreenReader
			&& InternalEditorViewOptions._numberArraysEqual(this.rulers, other.rulers)
			&& this.ariaLabel === other.ariaLabel
			&& this.renderLineNumbers === other.renderLineNumbers
			&& this.renderCustomLineNumbers === other.renderCustomLineNumbers
			&& this.renderRelativeLineNumbers === other.renderRelativeLineNumbers
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
			&& this.renderLineHighlight === other.renderLineHighlight
			&& this.scrollbar.equals(other.scrollbar)
			&& this.fixedOverflowWidgets === other.fixedOverflowWidgets
		);
	}

	/**
	 * @internal
	 */
	public createChangeEvent(newOpts: InternalEditorViewOptions): IViewConfigurationChangedEvent {
		return {
			theme: this.theme !== newOpts.theme,
			canUseTranslate3d: this.canUseTranslate3d !== newOpts.canUseTranslate3d,
			disableMonospaceOptimizations: this.disableMonospaceOptimizations !== newOpts.disableMonospaceOptimizations,
			experimentalScreenReader: this.experimentalScreenReader !== newOpts.experimentalScreenReader,
			rulers: (!InternalEditorViewOptions._numberArraysEqual(this.rulers, newOpts.rulers)),
			ariaLabel: this.ariaLabel !== newOpts.ariaLabel,
			renderLineNumbers: this.renderLineNumbers !== newOpts.renderLineNumbers,
			renderCustomLineNumbers: this.renderCustomLineNumbers !== newOpts.renderCustomLineNumbers,
			renderRelativeLineNumbers: this.renderRelativeLineNumbers !== newOpts.renderRelativeLineNumbers,
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
			renderLineHighlight: this.renderLineHighlight !== newOpts.renderLineHighlight,
			scrollbar: (!this.scrollbar.equals(newOpts.scrollbar)),
			fixedOverflowWidgets: this.fixedOverflowWidgets !== newOpts.fixedOverflowWidgets
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
	readonly theme: boolean;
	readonly canUseTranslate3d: boolean;
	readonly disableMonospaceOptimizations: boolean;
	readonly experimentalScreenReader: boolean;
	readonly rulers: boolean;
	readonly ariaLabel: boolean;
	readonly renderLineNumbers: boolean;
	readonly renderCustomLineNumbers: boolean;
	readonly renderRelativeLineNumbers: boolean;
	readonly selectOnLineNumbers: boolean;
	readonly glyphMargin: boolean;
	readonly revealHorizontalRightPadding: boolean;
	readonly roundedSelection: boolean;
	readonly overviewRulerLanes: boolean;
	readonly cursorBlinking: boolean;
	readonly mouseWheelZoom: boolean;
	readonly cursorStyle: boolean;
	readonly hideCursorInOverviewRuler: boolean;
	readonly scrollBeyondLastLine: boolean;
	readonly editorClassName: boolean;
	readonly stopRenderingLineAfter: boolean;
	readonly renderWhitespace: boolean;
	readonly renderControlCharacters: boolean;
	readonly renderIndentGuides: boolean;
	readonly renderLineHighlight: boolean;
	readonly scrollbar: boolean;
	readonly fixedOverflowWidgets: boolean;
}

export class EditorContribOptions {
	readonly selectionClipboard: boolean;
	readonly hover: boolean;
	readonly contextmenu: boolean;
	readonly quickSuggestions: boolean;
	readonly quickSuggestionsDelay: number;
	readonly parameterHints: boolean;
	readonly iconsInSuggestions: boolean;
	readonly formatOnType: boolean;
	readonly formatOnPaste: boolean;
	readonly suggestOnTriggerCharacters: boolean;
	readonly acceptSuggestionOnEnter: boolean;
	readonly acceptSuggestionOnCommitCharacter: boolean;
	readonly snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none';
	readonly emptySelectionClipboard: boolean;
	readonly tabCompletion: boolean;
	readonly wordBasedSuggestions: boolean;
	readonly suggestFontSize: number;
	readonly suggestLineHeight: number;
	readonly selectionHighlight: boolean;
	readonly codeLens: boolean;
	readonly folding: boolean;

	/**
	 * @internal
	 */
	constructor(source: {
		selectionClipboard: boolean;
		hover: boolean;
		contextmenu: boolean;
		quickSuggestions: boolean;
		quickSuggestionsDelay: number;
		parameterHints: boolean;
		iconsInSuggestions: boolean;
		formatOnType: boolean;
		formatOnPaste: boolean;
		suggestOnTriggerCharacters: boolean;
		acceptSuggestionOnEnter: boolean;
		acceptSuggestionOnCommitCharacter: boolean;
		snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none';
		emptySelectionClipboard: boolean;
		tabCompletion: boolean;
		wordBasedSuggestions: boolean;
		suggestFontSize: number;
		suggestLineHeight: number;
		selectionHighlight: boolean;
		codeLens: boolean;
		folding: boolean;
	}) {
		this.selectionClipboard = Boolean(source.selectionClipboard);
		this.hover = Boolean(source.hover);
		this.contextmenu = Boolean(source.contextmenu);
		this.quickSuggestions = Boolean(source.quickSuggestions);
		this.quickSuggestionsDelay = source.quickSuggestionsDelay || 0;
		this.parameterHints = Boolean(source.parameterHints);
		this.iconsInSuggestions = Boolean(source.iconsInSuggestions);
		this.formatOnType = Boolean(source.formatOnType);
		this.formatOnPaste = Boolean(source.formatOnPaste);
		this.suggestOnTriggerCharacters = Boolean(source.suggestOnTriggerCharacters);
		this.acceptSuggestionOnEnter = Boolean(source.acceptSuggestionOnEnter);
		this.acceptSuggestionOnCommitCharacter = Boolean(source.acceptSuggestionOnCommitCharacter);
		this.snippetSuggestions = source.snippetSuggestions;
		this.emptySelectionClipboard = source.emptySelectionClipboard;
		this.tabCompletion = source.tabCompletion;
		this.wordBasedSuggestions = source.wordBasedSuggestions;
		this.suggestFontSize = source.suggestFontSize;
		this.suggestLineHeight = source.suggestLineHeight;
		this.selectionHighlight = Boolean(source.selectionHighlight);
		this.codeLens = Boolean(source.codeLens);
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
			&& this.formatOnPaste === other.formatOnPaste
			&& this.suggestOnTriggerCharacters === other.suggestOnTriggerCharacters
			&& this.acceptSuggestionOnEnter === other.acceptSuggestionOnEnter
			&& this.acceptSuggestionOnCommitCharacter === other.acceptSuggestionOnCommitCharacter
			&& this.snippetSuggestions === other.snippetSuggestions
			&& this.emptySelectionClipboard === other.emptySelectionClipboard
			&& this.tabCompletion === other.tabCompletion
			&& this.wordBasedSuggestions === other.wordBasedSuggestions
			&& this.suggestFontSize === other.suggestFontSize
			&& this.suggestLineHeight === other.suggestLineHeight
			&& this.selectionHighlight === other.selectionHighlight
			&& this.codeLens === other.codeLens
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
	readonly _internalEditorOptionsBrand: void;

	readonly lineHeight: number; // todo: move to fontInfo

	readonly readOnly: boolean;
	// ---- cursor options
	readonly wordSeparators: string;
	readonly autoClosingBrackets: boolean;
	readonly useTabStops: boolean;
	readonly tabFocusMode: boolean;
	// ---- grouped options
	readonly layoutInfo: EditorLayoutInfo;
	readonly fontInfo: FontInfo;
	readonly viewInfo: InternalEditorViewOptions;
	readonly wrappingInfo: EditorWrappingInfo;
	readonly contribInfo: EditorContribOptions;

	/**
	 * @internal
	 */
	constructor(source: {
		lineHeight: number;
		readOnly: boolean;
		wordSeparators: string;
		autoClosingBrackets: boolean;
		useTabStops: boolean;
		tabFocusMode: boolean;
		layoutInfo: EditorLayoutInfo;
		fontInfo: FontInfo;
		viewInfo: InternalEditorViewOptions;
		wrappingInfo: EditorWrappingInfo;
		contribInfo: EditorContribOptions;
	}) {
		this.lineHeight = source.lineHeight | 0;
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
	public equals(other: InternalEditorOptions): boolean {
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
	public createChangeEvent(newOpts: InternalEditorOptions): IConfigurationChangedEvent {
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
	readonly lineHeight: boolean;
	readonly readOnly: boolean;
	readonly wordSeparators: boolean;
	readonly autoClosingBrackets: boolean;
	readonly useTabStops: boolean;
	readonly tabFocusMode: boolean;
	readonly layoutInfo: boolean;
	readonly fontInfo: boolean;
	readonly viewInfo: IViewConfigurationChangedEvent;
	readonly wrappingInfo: boolean;
	readonly contribInfo: boolean;
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
	stickiness?: TrackedRangeStickiness;
	/**
	 * CSS class name describing the decoration.
	 */
	className?: string;
	/**
	 * Message to be rendered when hovering over the glyph margin decoration.
	 */
	glyphMarginHoverMessage?: MarkedString | MarkedString[];
	/**
	 * Array of MarkedString to render as the decoration message.
	 */
	hoverMessage?: MarkedString | MarkedString[];
	/**
	 * Should the decoration expand to encompass a whole line.
	 */
	isWholeLine?: boolean;
	/**
	 * @deprecated : Use `overviewRuler` instead
	 */
	showInOverviewRuler?: string;
	/**
	 * If set, render this decoration in the overview ruler.
	 */
	overviewRuler?: IModelDecorationOverviewRulerOptions;
	/**
	 * If set, the decoration will be rendered in the glyph margin with this CSS class name.
	 */
	glyphMarginClassName?: string;
	/**
	 * If set, the decoration will be rendered in the lines decorations with this CSS class name.
	 */
	linesDecorationsClassName?: string;
	/**
	 * If set, the decoration will be rendered in the margin (covering its full width) with this CSS class name.
	 */
	marginClassName?: string;
	/**
	 * If set, the decoration will be rendered inline with the text with this CSS class name.
	 * Please use this only for CSS rules that must impact the text. For example, use `className`
	 * to have a background color decoration.
	 */
	inlineClassName?: string;
	/**
	 * If set, the decoration will be rendered before the text with this CSS class name.
	 */
	beforeContentClassName?: string;
	/**
	 * If set, the decoration will be rendered after the text with this CSS class name.
	 */
	afterContentClassName?: string;
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
 * A decoration in the model.
 */
export interface IModelDecoration {
	/**
	 * Identifier for a decoration.
	 */
	readonly id: string;
	/**
	 * Identifier for a decoration's owener.
	 */
	readonly ownerId: number;
	/**
	 * Range that this decoration covers.
	 */
	readonly range: Range;
	/**
	 * Options associated with this decoration.
	 */
	readonly options: IModelDecorationOptions;
	/**
	 * A flag describing if this is a problem decoration (e.g. warning/error).
	 */
	readonly isForValidation: boolean;
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
	addDecoration(range: IRange, options: IModelDecorationOptions): string;
	/**
	 * Change the range that an existing decoration covers.
	 * @param id The unique identifier associated with the decoration.
	 * @param newRange The new range that this decoration covers.
	 */
	changeDecoration(id: string, newRange: IRange): void;
	/**
	 * Change the options associated with an existing decoration.
	 * @param id The unique identifier associated with the decoration.
	 * @param newOptions The new options associated with this decoration.
	 */
	changeDecorationOptions(id: string, newOptions: IModelDecorationOptions): void;
	/**
	 * Remove an existing decoration.
	 * @param id The unique identifier associated with the decoration.
	 */
	removeDecoration(id: string): void;
	/**
	 * Perform a minimum ammount of operations, in order to transform the decorations
	 * identified by `oldDecorations` to the decorations described by `newDecorations`
	 * and returns the new identifiers associated with the resulting decorations.
	 *
	 * @param oldDecorations Array containing previous decorations identifiers.
	 * @param newDecorations Array describing what decorations should result after the call.
	 * @return An array containing the new decorations identifiers.
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];
}

/**
 * Word inside a model.
 */
export interface IWordAtPosition {
	/**
	 * The word.
	 */
	readonly word: string;
	/**
	 * The column where the word starts.
	 */
	readonly startColumn: number;
	/**
	 * The column where the word ends.
	 */
	readonly endColumn: number;
}

/**
 * Range of a word inside a model.
 * @internal
 */
export interface IWordRange {
	/**
	 * The index where the word starts.
	 */
	readonly start: number;
	/**
	 * The index where the word ends.
	 */
	readonly end: number;
}

/**
 * @internal
 */
export interface ITokenInfo {
	readonly type: StandardTokenType;
	readonly lineNumber: number;
	readonly startColumn: number;
	readonly endColumn: number;
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
 * An identifier for a single edit operation.
 */
export interface ISingleEditOperationIdentifier {
	/**
	 * Identifier major
	 */
	major: number;
	/**
	 * Identifier minor
	 */
	minor: number;
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
	addEditOperation(range: Range, text: string): void;

	/**
	 * Track `selection` when applying edit operations.
	 * A best effort will be made to not grow/expand the selection.
	 * An empty selection will clamp to a nearby character.
	 * @param selection The selection to track.
	 * @param trackPreviousOnEmpty If set, and the selection is empty, indicates whether the selection
	 *           should clamp to the previous or the next character.
	 * @return A unique identifer.
	 */
	trackSelection(selection: Selection, trackPreviousOnEmpty?: boolean): string;
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
	getTrackedSelection(id: string): Selection;
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
	getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void;
	/**
	 * Compute the cursor state after the edit operations were applied.
	 * @param model The model the commad has executed on.
	 * @param helper A helper to get inverse edit operations and to get previously tracked selections.
	 * @return The cursor state after the command executed.
	 */
	computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection;
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
	(inverseEditOperations: IIdentifiedSingleEditOperation[]): Selection[];
}

export class TextModelResolvedOptions {
	_textModelResolvedOptionsBrand: void;

	readonly tabSize: number;
	readonly insertSpaces: boolean;
	readonly defaultEOL: DefaultEndOfLine;
	readonly trimAutoWhitespace: boolean;

	/**
	 * @internal
	 */
	constructor(src: {
		tabSize: number;
		insertSpaces: boolean;
		defaultEOL: DefaultEndOfLine;
		trimAutoWhitespace: boolean;
	}) {
		this.tabSize = src.tabSize | 0;
		this.insertSpaces = Boolean(src.insertSpaces);
		this.defaultEOL = src.defaultEOL | 0;
		this.trimAutoWhitespace = Boolean(src.trimAutoWhitespace);
	}

	/**
	 * @internal
	 */
	public equals(other: TextModelResolvedOptions): boolean {
		return (
			this.tabSize === other.tabSize
			&& this.insertSpaces === other.insertSpaces
			&& this.defaultEOL === other.defaultEOL
			&& this.trimAutoWhitespace === other.trimAutoWhitespace
		);
	}

	/**
	 * @internal
	 */
	public createChangeEvent(newOpts: TextModelResolvedOptions): IModelOptionsChangedEvent {
		return {
			tabSize: this.tabSize !== newOpts.tabSize,
			insertSpaces: this.insertSpaces !== newOpts.insertSpaces,
			trimAutoWhitespace: this.trimAutoWhitespace !== newOpts.trimAutoWhitespace,
		};
	}
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
	readonly tabSize: boolean;
	readonly insertSpaces: boolean;
	readonly trimAutoWhitespace: boolean;
}

/**
 * A textual read-only model.
 */
export interface ITextModel {

	/**
	 * @internal
	 */
	mightContainRTL(): boolean;

	/**
	 * @internal
	 */
	mightContainNonBasicASCII(): boolean;

	getOptions(): TextModelResolvedOptions;

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
	setValue(newValue: string): void;

	/**
	 * Replace the entire text buffer value contained in this model.
	 * @internal
	 */
	setValueFromRawText(newValue: ITextSource): void;

	/**
	 * Get the text stored in this model.
	 * @param eol The end of line character preference. Defaults to `EndOfLinePreference.TextDefined`.
	 * @param preserverBOM Preserve a BOM character if it was detected when the model was constructed.
	 * @return The text.
	 */
	getValue(eol?: EndOfLinePreference, preserveBOM?: boolean): string;

	/**
	 * Get the length of the text stored in this model.
	 */
	getValueLength(eol?: EndOfLinePreference, preserveBOM?: boolean): number;

	/**
	 * Get the raw text stored in this model.
	 * @internal
	 */
	toRawText(): IRawText;

	/**
	 * Check if the raw text stored in this model equals another raw text.
	 * @internal
	 */
	equals(other: ITextSource): boolean;

	/**
	 * Get the text in a certain range.
	 * @param range The range describing what text to get.
	 * @param eol The end of line character preference. This will only be used for multiline ranges. Defaults to `EndOfLinePreference.TextDefined`.
	 * @return The text.
	 */
	getValueInRange(range: IRange, eol?: EndOfLinePreference): string;

	/**
	 * Get the length of text in a certain range.
	 * @param range The range describing what text length to get.
	 * @return The text length.
	 */
	getValueLengthInRange(range: IRange): number;

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
	getLineContent(lineNumber: number): string;

	/**
	 * @internal
	 */
	getIndentLevel(lineNumber: number): number;

	/**
	 * @internal
	 */
	getIndentRanges(): IndentRange[];

	/**
	 * @internal
	 */
	getLineIndentGuide(lineNumber: number): number;

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
	getLineMinColumn(lineNumber: number): number;

	/**
	 * Get the maximum legal column for line at `lineNumber`
	 */
	getLineMaxColumn(lineNumber: number): number;

	/**
	 * Returns the column before the first non whitespace character for line at `lineNumber`.
	 * Returns 0 if line is empty or contains only whitespace.
	 */
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;

	/**
	 * Returns the column after the last non whitespace character for line at `lineNumber`.
	 * Returns 0 if line is empty or contains only whitespace.
	 */
	getLineLastNonWhitespaceColumn(lineNumber: number): number;

	/**
	 * Create a valid position,
	 */
	validatePosition(position: IPosition): Position;

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
	validateRange(range: IRange): Range;

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

	/**
	 * Search the model.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchOnlyEditableRange Limit the searching to only search inside the editable range of the model.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @param captureMatches The result will contain the captured groups.
	 * @param limitResultCount Limit the number of results
	 * @return The ranges where the matches are. It is empty if not matches have been found.
	 */
	findMatches(searchString: string, searchOnlyEditableRange: boolean, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean, limitResultCount?: number): FindMatch[];
	/**
	 * Search the model.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchScope Limit the searching to only search inside this range.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @param captureMatches The result will contain the captured groups.
	 * @param limitResultCount Limit the number of results
	 * @return The ranges where the matches are. It is empty if no matches have been found.
	 */
	findMatches(searchString: string, searchScope: IRange, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean, limitResultCount?: number): FindMatch[];
	/**
	 * Search the model for the next match. Loops to the beginning of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @param captureMatches The result will contain the captured groups.
	 * @return The range where the next match is. It is null if no next match has been found.
	 */
	findNextMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean): FindMatch;
	/**
	 * Search the model for the previous match. Loops to the end of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wholeWord Force the matching to match entire words only.
	 * @param captureMatches The result will contain the captured groups.
	 * @return The range where the previous match is. It is null if no previous match has been found.
	 */
	findPreviousMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean): FindMatch;
}

export class FindMatch {
	_findMatchBrand: void;

	public readonly range: Range;
	public readonly matches: string[];

	/**
	 * @internal
	 */
	constructor(range: Range, matches: string[]) {
		this.range = range;
		this.matches = matches;
	}
}

export interface IReadOnlyModel extends ITextModel {
	/**
	 * Gets the resource associated with this editor model.
	 */
	readonly uri: URI;

	/**
	 * Get the language associated with this model.
	 * @internal
	 */
	getLanguageIdentifier(): LanguageIdentifier;

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
	getWordAtPosition(position: IPosition): IWordAtPosition;

	/**
	 * Get the word under or besides `position` trimmed to `position`.column
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Will never be null.
	 */
	getWordUntilPosition(position: IPosition): IWordAtPosition;
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
	getLineTokens(lineNumber: number, inaccurateTokensAcceptable?: boolean): LineTokens;

	/**
	 * Get the language associated with this model.
	 * @internal
	 */
	getLanguageIdentifier(): LanguageIdentifier;

	/**
	 * Get the language associated with this model.
	 */
	getModeId(): string;

	/**
	 * Set the current language mode associated with the model.
	 * @internal
	 */
	setMode(languageIdentifier: LanguageIdentifier): void;

	/**
	 * Returns the true (inner-most) language mode at a given position.
	 * @internal
	 */
	getLanguageIdAtPosition(lineNumber: number, column: number): LanguageId;

	/**
	 * Get the word under or besides `position`.
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Might be null.
	 */
	getWordAtPosition(position: IPosition): IWordAtPosition;

	/**
	 * Get the word under or besides `position` trimmed to `position`.column
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Will never be null.
	 */
	getWordUntilPosition(position: IPosition): IWordAtPosition;

	/**
	 * Returns an iterator that can be used to read
	 * next and previous tokens from the provided position.
	 * The iterator is made available through the callback
	 * function and can't be used afterwards.
	 * @internal
	 */
	tokenIterator(position: IPosition, callback: (it: ITokenIterator) => any): any;

	/**
	 * Find the matching bracket of `request` up, counting brackets.
	 * @param request The bracket we're searching for
	 * @param position The position at which to start the search.
	 * @return The range of the matching bracket, or null if the bracket match was not found.
	 * @internal
	 */
	findMatchingBracketUp(bracket: string, position: IPosition): Range;

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
	matchBracket(position: IPosition): [Range, Range];
}

/**
 * A model that can track markers.
 */
export interface ITextModelWithMarkers extends ITextModel {
	/**
	 * @internal
	 */
	_addMarker(internalDecorationId: number, lineNumber: number, column: number, stickToPreviousCharacter: boolean): string;
	/**
	 * @internal
	 */
	_changeMarker(id: string, newLineNumber: number, newColumn: number): void;
	/**
	 * @internal
	 */
	_changeMarkerStickiness(id: string, newStickToPreviousCharacter: boolean): void;
	/**
	 * @internal
	 */
	_getMarker(id: string): Position;
	/**
	 * @internal
	 */
	_removeMarker(id: string): void;
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
	changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T, ownerId?: number): T;

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
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[], ownerId?: number): string[];

	/**
	 * Remove all decorations that have been added with this specific ownerId.
	 * @param ownerId The owner id to search for.
	 * @internal
	 */
	removeAllDecorationsWithOwnerId(ownerId: number): void;

	/**
	 * Get the options associated with a decoration.
	 * @param id The decoration id.
	 * @return The decoration options or null if the decoration was not found.
	 */
	getDecorationOptions(id: string): IModelDecorationOptions;

	/**
	 * Get the range associated with a decoration.
	 * @param id The decoration id.
	 * @return The decoration range or null if the decoration was not found.
	 */
	getDecorationRange(id: string): Range;

	/**
	 * Gets all the decorations for the line `lineNumber` as an array.
	 * @param lineNumber The line number
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getLineDecorations(lineNumber: number, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];

	/**
	 * Gets all the decorations for the lines between `startLineNumber` and `endLineNumber` as an array.
	 * @param startLineNumber The start line number
	 * @param endLineNumber The end line number
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];

	/**
	 * Gets all the deocorations in a range as an array. Only `startLineNumber` and `endLineNumber` from `range` are used for filtering.
	 * So for now it returns all the decorations on the same line as `range`.
	 * @param range The range to search in
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getDecorationsInRange(range: IRange, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];

	/**
	 * Gets all the decorations as an array.
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 */
	getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];
}

/**
 * An editable text model.
 */
export interface IEditableTextModel extends ITextModelWithMarkers {

	/**
	 * Normalize a string containing whitespace according to indentation rules (converts to spaces or to tabs).
	 */
	normalizeIndentation(str: string): string;

	/**
	 * Get what is considered to be one indent (e.g. a tab character or 4 spaces, etc.).
	 */
	getOneIndent(): string;

	/**
	 * Change the options of this model.
	 */
	updateOptions(newOpts: ITextModelUpdateOptions): void;

	/**
	 * Detect the indentation options for this model from its content.
	 */
	detectIndentation(defaultInsertSpaces: boolean, defaultTabSize: number): void;

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
	pushEditOperations(beforeCursorState: Selection[], editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer): Selection[];

	/**
	 * Edit the model without adding the edits to the undo stack.
	 * This can have dire consequences on the undo stack! See @pushEditOperations for the preferred way.
	 * @param operations The edit operations.
	 * @return The inverse edit operations, that, when applied, will bring the model back to the previous state.
	 */
	applyEdits(operations: IIdentifiedSingleEditOperation[]): IIdentifiedSingleEditOperation[];

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
	setEditableRange(range: IRange): void;

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
export interface IModel extends IReadOnlyModel, IEditableTextModel, ITextModelWithMarkers, ITokenizedModel, ITextModelWithDecorations, IEditorModel {
	/**
	 * @deprecated Please use `onDidChangeContent` instead.
	 * An event emitted when the contents of the model have changed.
	 * @internal
	 * @event
	 */
	onDidChangeRawContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the contents of the model have changed.
	 * @event
	 */
	onDidChangeContent(listener: (e: IModelContentChangedEvent2) => void): IDisposable;
	/**
	 * An event emitted when decorations of the model have changed.
	 * @event
	 */
	onDidChangeDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the model options have changed.
	 * @event
	 */
	onDidChangeOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the language associated with the model has changed.
	 * @event
	 */
	onDidChangeLanguage(listener: (e: IModelLanguageChangedEvent) => void): IDisposable;
	/**
	 * An event emitted right before disposing the model.
	 * @event
	 */
	onWillDispose(listener: () => void): IDisposable;

	/**
	 * @internal
	 */
	addBulkListener(listener: BulkListenerCallback): IDisposable;

	/**
	 * A unique identifier associated with this model.
	 */
	readonly id: string;

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
 * An event describing that the current mode associated with a model has changed.
 */
export interface IModelLanguageChangedEvent {
	/**
	 * Previous language
	 */
	readonly oldLanguage: string;
	/**
	 * New language
	 */
	readonly newLanguage: string;
}

/**
 * An event describing a change in the text of a model.
 */
export interface IModelContentChangedEvent2 {
	/**
	 * The range that got replaced.
	 */
	readonly range: IRange;
	/**
	 * The length of the range that got replaced.
	 */
	readonly rangeLength: number;
	/**
	 * The new text for the range.
	 */
	readonly text: string;
	/**
	 * The (new) end-of-line character.
	 */
	readonly eol: string;
	/**
	 * The new version id the model has transitioned to.
	 */
	versionId: number;
	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	readonly isUndoing: boolean;
	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	readonly isRedoing: boolean;
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
	readonly changeType: string;
	/**
	 * The new version id the model has transitioned to.
	 */
	versionId: number;
	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	readonly isUndoing: boolean;
	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	readonly isRedoing: boolean;
}

/**
 * The raw text backing a model.
 * @internal
 */
export interface ITextSource {
	/**
	 * The entire text length.
	 */
	readonly length: number;
	/**
	 * The text split into lines.
	 */
	readonly lines: string[];
	/**
	 * The BOM (leading character sequence of the file).
	 */
	readonly BOM: string;
	/**
	 * The end of line sequence.
	 */
	readonly EOL: string;
	/**
	 * The text contains Unicode characters classified as "R" or "AL".
	 */
	readonly containsRTL: boolean;
	/**
	 * The text contains only characters inside the ASCII range 32-126 or \t \r \n
	 */
	readonly isBasicASCII: boolean;
}

/**
 * The text source
 * @internal
 */
export interface ITextSource2 {
	/**
	 * The entire text length.
	 */
	readonly length: number;
	/**
	 * The text split into lines.
	 */
	readonly lines: string[];
	/**
	 * The BOM (leading character sequence of the file).
	 */
	readonly BOM: string;
	/**
	 * The number of lines ending with '\r\n'
	 */
	readonly totalCRCount: number;
	/**
	 * The text contains Unicode characters classified as "R" or "AL".
	 */
	readonly containsRTL: boolean;
	/**
	 * The text contains only characters inside the ASCII range 32-126 or \t \r \n
	 */
	readonly isBasicASCII: boolean;
}

/**
 * The raw text backing a model.
 * @internal
 */
export interface IRawText extends ITextSource {
	/**
	 * The options associated with this text.
	 */
	readonly options: {
		readonly tabSize: number;
		readonly insertSpaces: boolean;
		readonly defaultEOL: DefaultEndOfLine;
		readonly trimAutoWhitespace: boolean;
	};
}

/**
 * An event describing that a model has been reset to a new value.
 * @internal
 */
export interface IModelContentChangedFlushEvent extends IModelContentChangedEvent {
	/**
	 * The new text content of the model.
	 */
	readonly detail: IRawText;
}
/**
 * An event describing that a line has changed in a model.
 * @internal
 */
export interface IModelContentChangedLineChangedEvent extends IModelContentChangedEvent {
	/**
	 * The line that has changed.
	 */
	readonly lineNumber: number;
	/**
	 * The new value of the line.
	 */
	readonly detail: string;
}
/**
 * An event describing that line(s) have been deleted in a model.
 * @internal
 */
export interface IModelContentChangedLinesDeletedEvent extends IModelContentChangedEvent {
	/**
	 * At what line the deletion began (inclusive).
	 */
	readonly fromLineNumber: number;
	/**
	 * At what line the deletion stopped (inclusive).
	 */
	readonly toLineNumber: number;
}
/**
 * An event describing that line(s) have been inserted in a model.
 * @internal
 */
export interface IModelContentChangedLinesInsertedEvent extends IModelContentChangedEvent {
	/**
	 * Before what line did the insertion begin
	 */
	readonly fromLineNumber: number;
	/**
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	readonly toLineNumber: number;
	/**
	 * The text that was inserted
	 */
	readonly detail: string;
}
/**
 * An event describing that model decorations have changed.
 */
export interface IModelDecorationsChangedEvent {
	/**
	 * Lists of ids for added decorations.
	 */
	readonly addedDecorations: string[];
	/**
	 * Lists of ids for changed decorations.
	 */
	readonly changedDecorations: string[];
	/**
	 * List of ids for removed decorations.
	 */
	readonly removedDecorations: string[];
}
/**
 * An event describing that some ranges of lines have been tokenized (their tokens have changed).
 */
export interface IModelTokensChangedEvent {
	readonly ranges: {
		/**
		 * The start of the range (inclusive)
		 */
		readonly fromLineNumber: number;
		/**
		 * The end of the range (inclusive)
		 */
		readonly toLineNumber: number;
	}[];
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
	readonly position: Position;
	/**
	 * Primary cursor's view position
	 */
	readonly viewPosition: Position;
	/**
	 * Secondary cursors' position.
	 */
	readonly secondaryPositions: Position[];
	/**
	 * Secondary cursors' view position.
	 */
	readonly secondaryViewPositions: Position[];
	/**
	 * Reason.
	 */
	readonly reason: CursorChangeReason;
	/**
	 * Source of the call that caused the event.
	 */
	readonly source: string;
	/**
	 * Is the primary cursor in the editable range?
	 */
	readonly isInEditableRange: boolean;
}
/**
 * An event describing that the cursor selection has changed.
 */
export interface ICursorSelectionChangedEvent {
	/**
	 * The primary selection.
	 */
	readonly selection: Selection;
	/**
	 * The primary selection in view coordinates.
	 */
	readonly viewSelection: Selection;
	/**
	 * The secondary selections.
	 */
	readonly secondarySelections: Selection[];
	/**
	 * The secondary selections in view coordinates.
	 */
	readonly secondaryViewSelections: Selection[];
	/**
	 * Source of the call that caused the event.
	 */
	readonly source: string;
	/**
	 * Reason.
	 */
	readonly reason: CursorChangeReason;
}
/**
 * @internal
 */
export const enum VerticalRevealType {
	Simple = 0,
	Center = 1,
	CenterIfOutsideViewport = 2,
	Top = 3,
	Bottom = 4
}
/**
 * An event describing a request to reveal a specific range in the view of the editor.
 * @internal
 */
export interface ICursorRevealRangeEvent {
	/**
	 * Range to be reavealed.
	 */
	readonly range: Range;
	/**
	 * View range to be reavealed.
	 */
	readonly viewRange: Range;

	readonly verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	readonly revealHorizontal: boolean;
	/**
	 * If true: cursor is revealed if outside viewport
	 */
	readonly revealCursor: boolean;
}

/**
 * @internal
 */
export interface ICursorScrollRequestEvent {
	readonly deltaLines: number;
	readonly revealCursor: boolean;
}

/**
 * An event describing that an editor has had its model reset (i.e. `editor.setModel()`).
 */
export interface IModelChangedEvent {
	/**
	 * The `uri` of the previous model or null.
	 */
	readonly oldModelUrl: URI;
	/**
	 * The `uri` of the new model or null.
	 */
	readonly newModelUrl: URI;
}

/**
 * @internal
 */
export interface IEditorWhitespace {
	readonly id: number;
	readonly afterLineNumber: number;
	readonly heightInLines: number;
}

/**
 * A description for the overview ruler position.
 */
export class OverviewRulerPosition {
	readonly _overviewRulerPositionBrand: void;

	/**
	 * Width of the overview ruler
	 */
	readonly width: number;
	/**
	 * Height of the overview ruler
	 */
	readonly height: number;
	/**
	 * Top position for the overview ruler
	 */
	readonly top: number;
	/**
	 * Right position for the overview ruler
	 */
	readonly right: number;

	/**
	 * @internal
	 */
	constructor(source: {
		width: number;
		height: number;
		top: number;
		right: number;
	}) {
		this.width = source.width | 0;
		this.height = source.height | 0;
		this.top = source.top | 0;
		this.right = source.right | 0;
	}

	/**
	 * @internal
	 */
	public equals(other: OverviewRulerPosition): boolean {
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
	readonly _editorLayoutInfoBrand: void;

	/**
	 * Full editor width.
	 */
	readonly width: number;
	/**
	 * Full editor height.
	 */
	readonly height: number;

	/**
	 * Left position for the glyph margin.
	 */
	readonly glyphMarginLeft: number;
	/**
	 * The width of the glyph margin.
	 */
	readonly glyphMarginWidth: number;
	/**
	 * The height of the glyph margin.
	 */
	readonly glyphMarginHeight: number;

	/**
	 * Left position for the line numbers.
	 */
	readonly lineNumbersLeft: number;
	/**
	 * The width of the line numbers.
	 */
	readonly lineNumbersWidth: number;
	/**
	 * The height of the line numbers.
	 */
	readonly lineNumbersHeight: number;

	/**
	 * Left position for the line decorations.
	 */
	readonly decorationsLeft: number;
	/**
	 * The width of the line decorations.
	 */
	readonly decorationsWidth: number;
	/**
	 * The height of the line decorations.
	 */
	readonly decorationsHeight: number;

	/**
	 * Left position for the content (actual text)
	 */
	readonly contentLeft: number;
	/**
	 * The width of the content (actual text)
	 */
	readonly contentWidth: number;
	/**
	 * The height of the content (actual height)
	 */
	readonly contentHeight: number;

	/**
	 * The width of the vertical scrollbar.
	 */
	readonly verticalScrollbarWidth: number;
	/**
	 * The height of the horizontal scrollbar.
	 */
	readonly horizontalScrollbarHeight: number;

	/**
	 * The position of the overview ruler.
	 */
	readonly overviewRuler: OverviewRulerPosition;

	/**
	 * @internal
	 */
	constructor(source: {
		width: number;
		height: number;
		glyphMarginLeft: number;
		glyphMarginWidth: number;
		glyphMarginHeight: number;
		lineNumbersLeft: number;
		lineNumbersWidth: number;
		lineNumbersHeight: number;
		decorationsLeft: number;
		decorationsWidth: number;
		decorationsHeight: number;
		contentLeft: number;
		contentWidth: number;
		contentHeight: number;
		verticalScrollbarWidth: number;
		horizontalScrollbarHeight: number;
		overviewRuler: OverviewRulerPosition;
	}) {
		this.width = source.width | 0;
		this.height = source.height | 0;
		this.glyphMarginLeft = source.glyphMarginLeft | 0;
		this.glyphMarginWidth = source.glyphMarginWidth | 0;
		this.glyphMarginHeight = source.glyphMarginHeight | 0;
		this.lineNumbersLeft = source.lineNumbersLeft | 0;
		this.lineNumbersWidth = source.lineNumbersWidth | 0;
		this.lineNumbersHeight = source.lineNumbersHeight | 0;
		this.decorationsLeft = source.decorationsLeft | 0;
		this.decorationsWidth = source.decorationsWidth | 0;
		this.decorationsHeight = source.decorationsHeight | 0;
		this.contentLeft = source.contentLeft | 0;
		this.contentWidth = source.contentWidth | 0;
		this.contentHeight = source.contentHeight | 0;
		this.verticalScrollbarWidth = source.verticalScrollbarWidth | 0;
		this.horizontalScrollbarHeight = source.horizontalScrollbarHeight | 0;
		this.overviewRuler = source.overviewRuler.clone();
	}

	/**
	 * @internal
	 */
	public equals(other: EditorLayoutInfo): boolean {
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
	model?: IModel;
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
	width: number;
	height: number;
}

/**
 * A (serializable) state of the cursors.
 */
export interface ICursorState {
	inSelectionMode: boolean;
	selectionStart: IPosition;
	position: IPosition;
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
	cursorState: ICursorState[];
	viewState: IViewState;
	contributionsState: { [id: string]: any };
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
	readonly originalStartLineNumber: number;
	readonly originalEndLineNumber: number;
	readonly modifiedStartLineNumber: number;
	readonly modifiedEndLineNumber: number;
}
/**
 * A character level change.
 */
export interface ICharChange extends IChange {
	readonly originalStartColumn: number;
	readonly originalEndColumn: number;
	readonly modifiedStartColumn: number;
	readonly modifiedEndColumn: number;
}
/**
 * A line change
 */
export interface ILineChange extends IChange {
	readonly charChanges: ICharChange[];
}
/**
 * Information about a line in the diff editor
 * @internal
 */
export interface IDiffLineInformation {
	readonly equivalentLineNumber: number;
}

/**
 * @internal
 */
export namespace EditorContextKeys {
	/**
	 * A context key that is set when the editor's text has focus (cursor is blinking).
	 * @internal
	 */
	export const TextFocus = new RawContextKey<boolean>('editorTextFocus', false);
	/**
	 * A context key that is set when the editor's text or an editor's widget has focus.
	 * @internal
	 */
	export const Focus = new RawContextKey<boolean>('editorFocus', false);

	/**
	 * A context key that is set when the editor's text is readonly.
	 * @internal
	 */
	export const ReadOnly = new RawContextKey<boolean>('editorReadonly', false);

	/**
	 * @internal
	 */
	export const Writable: ContextKeyExpr = ReadOnly.toNegated();

	/**
	 * A context key that is set when the editor has a non-collapsed selection.
	 * @internal
	 */
	export const HasNonEmptySelection = new RawContextKey<boolean>('editorHasSelection', false);
	/**
	 * @internal
	 */
	export const HasOnlyEmptySelection: ContextKeyExpr = HasNonEmptySelection.toNegated();

	/**
	 * A context key that is set when the editor has multiple selections (multiple cursors).
	 * @internal
	 */
	export const HasMultipleSelections = new RawContextKey<boolean>('editorHasMultipleSelections', false);
	/**
	 * @internal
	 */
	export const HasSingleSelection: ContextKeyExpr = HasMultipleSelections.toNegated();

	/**
	 * @internal
	 */
	export const TabMovesFocus = new RawContextKey<boolean>('editorTabMovesFocus', false);
	/**
	 * @internal
	 */
	export const TabDoesNotMoveFocus: ContextKeyExpr = TabMovesFocus.toNegated();

	/**
	 * A context key that is set to the language associated with the model associated with the editor.
	 * @internal
	 */
	export const LanguageId = new RawContextKey<string>('editorLangId', undefined);

};


/**
 * @internal
 */
export namespace ModeContextKeys {
	/**
	 * @internal
	 */
	export const hasCompletionItemProvider = new RawContextKey<boolean>('editorHasCompletionItemProvider', undefined);
	/**
	 * @internal
	 */
	export const hasCodeActionsProvider = new RawContextKey<boolean>('editorHasCodeActionsProvider', undefined);
	/**
	 * @internal
	 */
	export const hasCodeLensProvider = new RawContextKey<boolean>('editorHasCodeLensProvider', undefined);
	/**
	 * @internal
	 */
	export const hasDefinitionProvider = new RawContextKey<boolean>('editorHasDefinitionProvider', undefined);
	/**
	 * @internal
	 */
	export const hasImplementationProvider = new RawContextKey<boolean>('editorHasImplementationProvider', undefined);
	/**
	 * @internal
	 */
	export const hasTypeDefinitionProvider = new RawContextKey<boolean>('editorHasTypeDefinitionProvider', undefined);
	/**
	 * @internal
	 */
	export const hasHoverProvider = new RawContextKey<boolean>('editorHasHoverProvider', undefined);
	/**
	 * @internal
	 */
	export const hasDocumentHighlightProvider = new RawContextKey<boolean>('editorHasDocumentHighlightProvider', undefined);
	/**
	 * @internal
	 */
	export const hasDocumentSymbolProvider = new RawContextKey<boolean>('editorHasDocumentSymbolProvider', undefined);
	/**
	 * @internal
	 */
	export const hasReferenceProvider = new RawContextKey<boolean>('editorHasReferenceProvider', undefined);
	/**
	 * @internal
	 */
	export const hasRenameProvider = new RawContextKey<boolean>('editorHasRenameProvider', undefined);
	/**
	 * @internal
	 */
	export const hasDocumentFormattingProvider = new RawContextKey<boolean>('editorHasDocumentFormattingProvider', undefined);
	/**
	 * @internal
	 */
	export const hasDocumentSelectionFormattingProvider = new RawContextKey<boolean>('editorHasDocumentSelectionFormattingProvider', undefined);
	/**
	 * @internal
	 */
	export const hasSignatureHelpProvider = new RawContextKey<boolean>('editorHasSignatureHelpProvider', undefined);
	/**
	 * @internal
	 */
	export const isInEmbeddedEditor = new RawContextKey<boolean>('isInEmbeddedEditor', undefined);
}



/**
 * @internal
 */
export interface IConfiguration {
	readonly onDidChange: Event<IConfigurationChangedEvent>;

	readonly editor: InternalEditorOptions;

	setMaxLineNumber(maxLineNumber: number): void;
}

// --- view

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
	readonly scrollTop: number;
	readonly scrollLeft: number;
	readonly scrollWidth: number;
	readonly scrollHeight: number;

	readonly scrollTopChanged: boolean;
	readonly scrollLeftChanged: boolean;
	readonly scrollWidthChanged: boolean;
	readonly scrollHeightChanged: boolean;
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
	readonly fromLineNumber: number;
	/**
	 * At what line the deletion stopped (inclusive).
	 */
	readonly toLineNumber: number;
}

/**
 * @internal
 */
export interface IViewLinesInsertedEvent {
	/**
	 * Before what line did the insertion begin
	 */
	readonly fromLineNumber: number;
	/**
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	readonly toLineNumber: number;
}

/**
 * @internal
 */
export interface IViewLineChangedEvent {
	/**
	 * The line that has changed.
	 */
	readonly lineNumber: number;
}

/**
 * @internal
 */
export interface IViewTokensChangedEvent {
	readonly ranges: {
		/**
		 * Start line number of range
		 */
		readonly fromLineNumber: number;
		/**
		 * End line number of range
		 */
		readonly toLineNumber: number;
	}[];
}

/**
 * @internal
 */
export interface IViewDecorationsChangedEvent {
	_videDecorationsChangedEventBrand: void;
}

/**
 * @internal
 */
export interface IViewCursorPositionChangedEvent {
	/**
	 * Primary cursor's position.
	 */
	readonly position: Position;
	/**
	 * Secondary cursors' position.
	 */
	readonly secondaryPositions: Position[];
	/**
	 * Is the primary cursor in the editable range?
	 */
	readonly isInEditableRange: boolean;
}

/**
 * @internal
 */
export interface IViewCursorSelectionChangedEvent {
	/**
	 * The primary selection.
	 */
	readonly selection: Selection;
	/**
	 * The secondary selections.
	 */
	readonly secondarySelections: Selection[];
}

/**
 * @internal
 */
export interface IViewRevealRangeEvent {
	/**
	 * Range to be reavealed.
	 */
	readonly range: Range;

	readonly verticalType: VerticalRevealType;
	/**
	 * If true: there should be a horizontal & vertical revealing
	 * If false: there should be just a vertical revealing
	 */
	readonly revealHorizontal: boolean;
	/**
	 * If true: cursor is revealed if outside viewport
	 */
	readonly revealCursor: boolean;
}

/**
 * @internal
 */
export interface IViewScrollRequestEvent {
	readonly deltaLines: number;
	readonly revealCursor: boolean;
}

/**
 * @internal
 */
export interface IViewWhitespaceViewportData {
	readonly id: number;
	readonly afterLineNumber: number;
	readonly verticalOffset: number;
	readonly height: number;
}

/**
 * @internal
 */
export class Viewport {
	readonly _viewportBrand: void;

	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;

	constructor(top: number, left: number, width: number, height: number) {
		this.top = top | 0;
		this.left = left | 0;
		this.width = width | 0;
		this.height = height | 0;
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
	 * Precondition rule.
	 */
	precondition?: string;
	/**
	 * An array of keybindings for the action.
	 */
	keybindings?: number[];
	/**
	 * The keybinding rule (condition on top of precondition).
	 */
	keybindingContext?: string;
	/**
	 * Control if the action should show up in the context menu and where.
	 * The context menu of the editor has these default:
	 *   navigation - The navigation group comes first in all cases.
	 *   1_modification - This group comes next and contains commands that modify your code.
	 *   9_cutcopypaste - The last default group with the basic editing commands.
	 * You can also create your own group.
	 * Defaults to null (don't show in context menu).
	 */
	contextMenuGroupId?: string;
	/**
	 * Control the order in the context menu group.
	 */
	contextMenuOrder?: number;
	/**
	 * Method that will be executed when the action is triggered.
	 * @param editor The editor instance is passed in as a convinience
	 */
	run(editor: ICommonCodeEditor): void | TPromise<void>;
}

/**
 * @internal
 */
export type ICommonEditorContributionCtor = IConstructorSignature1<ICommonCodeEditor, IEditorContribution>;

export interface IEditorAction {
	readonly id: string;
	readonly label: string;
	readonly alias: string;
	isSupported(): boolean;
	run(): TPromise<void>;
}

/**
 * An editor.
 */
export interface IEditor {
	/**
	 * @deprecated. Please use `onDidChangeModelContent` instead.
	 * An event emitted when the content of the current model has changed.
	 * @internal
	 * @event
	 */
	onDidChangeModelRawContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the content of the current model has changed.
	 * @event
	 */
	onDidChangeModelContent(listener: (e: IModelContentChangedEvent2) => void): IDisposable;
	/**
	 * An event emitted when the language of the current model has changed.
	 * @event
	 */
	onDidChangeModelLanguage(listener: (e: IModelLanguageChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the options of the current model has changed.
	 * @event
	 */
	onDidChangeModelOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the configuration of the editor has changed. (e.g. `editor.updateOptions()`)
	 * @event
	 */
	onDidChangeConfiguration(listener: (e: IConfigurationChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the cursor position has changed.
	 * @event
	 */
	onDidChangeCursorPosition(listener: (e: ICursorPositionChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the cursor selection has changed.
	 * @event
	 */
	onDidChangeCursorSelection(listener: (e: ICursorSelectionChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the editor has been disposed.
	 * @event
	 */
	onDidDispose(listener: () => void): IDisposable;

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
	layout(dimension?: IDimension): void;

	/**
	 * Brings browser focus to the editor text
	 */
	focus(): void;

	/**
	 * Returns true if this editor has keyboard focus (e.g. cursor is blinking).
	 */
	isFocused(): boolean;

	/**
	 * Returns all actions associated with this editor.
	 */
	getActions(): IEditorAction[];

	/**
	 * Returns all actions associated with this editor.
	 */
	getSupportedActions(): IEditorAction[];

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
	getVisibleColumnFromPosition(position: IPosition): number;

	/**
	 * Returns the primary position of the cursor.
	 */
	getPosition(): Position;

	/**
	 * Set the primary position of the cursor. This will remove any secondary cursors.
	 * @param position New primary cursor's position
	 */
	setPosition(position: IPosition): void;

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
	setSelection(selection: IRange): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection: Range): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection: ISelection): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection: Selection): void;

	/**
	 * Set the selections for all the cursors of the editor.
	 * Cursors will be removed or added, as necessary.
	 */
	setSelections(selections: ISelection[]): void;

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
	 * Scroll vertically or horizontally as necessary and reveal a range at the top of the viewport.
	 */
	revealRangeAtTop(range: IRange): void;

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
	trigger(source: string, handlerId: string, payload: any): void;

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
	setModel(model: IEditorModel): void;

	/**
	 * Change the decorations. All decorations added through this changeAccessor
	 * will get the ownerId of the editor (meaning they will not show up in other
	 * editors).
	 * @see IModel.changeDecorations
	 * @internal
	 */
	changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any;
}

/**
 * @internal
 */
export interface ICodeEditorState {
	validate(editor: ICommonCodeEditor): boolean;
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

	border?: string;
	borderColor?: string;
	borderRadius?: string;
	borderSpacing?: string;
	borderStyle?: string;
	borderWidth?: string;

	textDecoration?: string;
	cursor?: string;
	color?: string;
	letterSpacing?: string;

	gutterIconPath?: string | URI;
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
	contentIconPath?: string | URI;

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
	renderOptions?: IDecorationInstanceRenderOptions;
}


export interface ICommonCodeEditor extends IEditor {
	/**
	 * An event emitted when the model of this editor has changed (e.g. `editor.setModel()`).
	 * @event
	 */
	onDidChangeModel(listener: (e: IModelChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the decorations of the current model have changed.
	 * @event
	 */
	onDidChangeModelDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor gained focus (i.e. cursor blinking).
	 * @event
	 */
	onDidFocusEditorText(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor lost focus.
	 * @event
	 */
	onDidBlurEditorText(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget gained focus.
	 * @event
	 */
	onDidFocusEditor(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget lost focus.
	 * @event
	 */
	onDidBlurEditor(listener: () => void): IDisposable;

	/**
	 * An event emitted before interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	onWillType(listener: (text: string) => void): IDisposable;

	/**
	 * An event emitted before interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	onDidType(listener: (text: string) => void): IDisposable;

	/**
	 * An event emitted when users paste text in the editor.
	 * @event
	 * @internal
	 */
	onDidPaste(listener: (range: Range) => void): IDisposable;

	/**
	 * Returns true if this editor or one of its widgets has keyboard focus.
	 */
	hasWidgetFocus(): boolean;

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution<T extends IEditorContribution>(id: string): T;

	/**
	 * @internal
	 */
	captureState(...flags: CodeEditorStateFlag[]): ICodeEditorState;

	/**
	 * Execute `fn` with the editor's services.
	 * @internal
	 */
	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T;

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
	getAction(id: string): IEditorAction;

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
	 * Execute edits on the editor.
	 * @param source The source of the call.
	 * @param edits The edits to execute.
	 * @param endCursoState Cursor state after the edits were applied.
	 */
	executeEdits(source: string, edits: IIdentifiedSingleEditOperation[], endCursoState?: Selection[]): boolean;

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
	removeDecorations(decorationTypeKey: string): void;

	/**
	 * Get the layout info for the editor.
	 */
	getLayoutInfo(): EditorLayoutInfo;
}

export interface ICommonDiffEditor extends IEditor {
	/**
	 * An event emitted when the diff information computed by this diff editor has been updated.
	 * @event
	 */
	onDidUpdateDiff(listener: () => void): IDisposable;

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
	getDiffLineInformationForOriginal(lineNumber: number): IDiffLineInformation;

	/**
	 * Get information based on computed diff about a line number from the modified model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 * @internal
	 */
	getDiffLineInformationForModified(lineNumber: number): IDiffLineInformation;

	/**
	 * @see ICodeEditor.getValue
	 */
	getValue(options?: { preserveBOM: boolean; lineEnding: string; }): string;

	/**
	 * Returns whether the diff editor is ignoring trim whitespace or not.
	 * @internal
	 */
	readonly ignoreTrimWhitespace: boolean;

	/**
	 * Returns whether the diff editor is rendering side by side or not.
	 * @internal
	 */
	readonly renderSideBySide: boolean;
	/**
	 * Returns whether the diff editor is rendering +/- indicators or not.
	 * @internal
	 */
	readonly renderIndicators: boolean;
}

/**
 * The type of the `IEditor`.
 */
export var EditorType = {
	ICodeEditor: 'vs.editor.ICodeEditor',
	IDiffEditor: 'vs.editor.IDiffEditor'
};

/**
 *@internal
 */
export function isCommonCodeEditor(thing: any): thing is ICommonCodeEditor {
	if (thing && typeof (<ICommonCodeEditor>thing).getEditorType === 'function') {
		return (<ICommonCodeEditor>thing).getEditorType() === EditorType.ICodeEditor;
	} else {
		return false;
	}
}

/**
 *@internal
 */
export function isCommonDiffEditor(thing: any): thing is ICommonDiffEditor {
	if (thing && typeof (<ICommonDiffEditor>thing).getEditorType === 'function') {
		return (<ICommonDiffEditor>thing).getEditorType() === EditorType.IDiffEditor;
	} else {
		return false;
	}
}

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
	ModelLanguageChanged: 'modelLanguageChanged',
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

	WillType: 'willType',
	DidType: 'didType',

	DidPaste: 'didPaste',

	EditorLayout: 'editorLayout',

	DiffUpdated: 'diffUpdated'
};

/**
 * Positions in the view for cursor move command.
 */
export const CursorMovePosition = {
	Left: 'left',
	Right: 'right',
	Up: 'up',
	Down: 'down',

	WrappedLineStart: 'wrappedLineStart',
	WrappedLineFirstNonWhitespaceCharacter: 'wrappedLineFirstNonWhitespaceCharacter',
	WrappedLineColumnCenter: 'wrappedLineColumnCenter',
	WrappedLineEnd: 'wrappedLineEnd',
	WrappedLineLastNonWhitespaceCharacter: 'wrappedLineLastNonWhitespaceCharacter',

	ViewPortTop: 'viewPortTop',
	ViewPortCenter: 'viewPortCenter',
	ViewPortBottom: 'viewPortBottom',

	ViewPortIfOutside: 'viewPortIfOutside'
};

/**
 * Units for Cursor move 'by' argument
 */
export const CursorMoveByUnit = {
	Line: 'line',
	WrappedLine: 'wrappedLine',
	Character: 'character',
	HalfLine: 'halfLine'
};

/**
 * Arguments for Cursor move command
 */
export interface CursorMoveArguments {
	to: string;
	select?: boolean;
	by?: string;
	value?: number;
};

/**
 * @internal
 */
const isCursorMoveArgs = function (arg): boolean {
	if (!types.isObject(arg)) {
		return false;
	}

	let cursorMoveArg: CursorMoveArguments = arg;

	if (!types.isString(cursorMoveArg.to)) {
		return false;
	}

	if (!types.isUndefined(cursorMoveArg.select) && !types.isBoolean(cursorMoveArg.select)) {
		return false;
	}

	if (!types.isUndefined(cursorMoveArg.by) && !types.isString(cursorMoveArg.by)) {
		return false;
	}

	if (!types.isUndefined(cursorMoveArg.value) && !types.isNumber(cursorMoveArg.value)) {
		return false;
	}

	return true;
};

/**
 * Directions in the view for editor scroll command.
 */
export const EditorScrollDirection = {
	Up: 'up',
	Down: 'down',
};

/**
 * Units for editor scroll 'by' argument
 */
export const EditorScrollByUnit = {
	Line: 'line',
	WrappedLine: 'wrappedLine',
	Page: 'page',
	HalfPage: 'halfPage'
};

/**
 * Arguments for editor scroll command
 */
export interface EditorScrollArguments {
	to: string;
	by?: string;
	value?: number;
	revealCursor?: boolean;
};

/**
 * @internal
 */
const isEditorScrollArgs = function (arg): boolean {
	if (!types.isObject(arg)) {
		return false;
	}

	let scrollArg: EditorScrollArguments = arg;

	if (!types.isString(scrollArg.to)) {
		return false;
	}

	if (!types.isUndefined(scrollArg.by) && !types.isString(scrollArg.by)) {
		return false;
	}

	if (!types.isUndefined(scrollArg.value) && !types.isNumber(scrollArg.value)) {
		return false;
	}

	if (!types.isUndefined(scrollArg.revealCursor) && !types.isBoolean(scrollArg.revealCursor)) {
		return false;
	}

	return true;
};

/**
 * Arguments for reveal line command
 */
export interface RevealLineArguments {
	lineNumber?: number;
	at?: string;
};

/**
 * Values for reveal line 'at' argument
 */
export const RevealLineAtArgument = {
	Top: 'top',
	Center: 'center',
	Bottom: 'bottom'
};

/**
 * @internal
 */
const isRevealLineArgs = function (arg): boolean {
	if (!types.isObject(arg)) {
		return false;
	}

	let reveaLineArg: RevealLineArguments = arg;

	if (!types.isNumber(reveaLineArg.lineNumber)) {
		return false;
	}

	if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
		return false;
	}

	return true;
};

/**
 * @internal
 */
export var CommandDescription = {
	CursorMove: <ICommandHandlerDescription>{
		description: 'Move cursor to a logical position in the view',
		args: [
			{
				name: 'Cursor move argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory logical position value providing where to move the cursor.
						\`\`\`
						'left', 'right', 'up', 'down'
						'wrappedLineStart', 'wrappedLineEnd', 'wrappedLineColumnCenter'
						'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter',
						'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'character', 'halfLine'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'select': If 'true' makes the selection. Default is 'false'.
				`,
				constraint: isCursorMoveArgs
			}
		]
	},
	EditorScroll: <ICommandHandlerDescription>{
		description: 'Scroll editor in the given direction',
		args: [
			{
				name: 'Editor scroll argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory direction value.
						\`\`\`
						'up', 'down'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'page', 'halfPage'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'revealCursor': If 'true' reveals the cursor if it is outside view port.
				`,
				constraint: isEditorScrollArgs
			}
		]
	},
	RevealLine: <ICommandHandlerDescription>{
		description: 'Reveal the given line at the given logical position',
		args: [
			{
				name: 'Reveal line argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'lineNumber': A mandatory line number value.
					* 'at': Logical position at which line has to be revealed .
						\`\`\`
						'top', 'center', 'bottom'
						\`\`\`
				`,
				constraint: isRevealLineArgs
			}
		]
	}
};

/**
 * Built-in commands.
 */
export var Handler = {
	ExecuteCommand: 'executeCommand',
	ExecuteCommands: 'executeCommands',

	CursorLeft: 'cursorLeft',
	CursorLeftSelect: 'cursorLeftSelect',

	CursorWordLeft: 'cursorWordLeft',
	CursorWordStartLeft: 'cursorWordStartLeft',
	CursorWordEndLeft: 'cursorWordEndLeft',

	CursorWordLeftSelect: 'cursorWordLeftSelect',
	CursorWordStartLeftSelect: 'cursorWordStartLeftSelect',
	CursorWordEndLeftSelect: 'cursorWordEndLeftSelect',

	CursorRight: 'cursorRight',
	CursorRightSelect: 'cursorRightSelect',

	CursorWordRight: 'cursorWordRight',
	CursorWordStartRight: 'cursorWordStartRight',
	CursorWordEndRight: 'cursorWordEndRight',

	CursorWordRightSelect: 'cursorWordRightSelect',
	CursorWordStartRightSelect: 'cursorWordStartRightSelect',
	CursorWordEndRightSelect: 'cursorWordEndRightSelect',

	CursorUp: 'cursorUp',
	CursorUpSelect: 'cursorUpSelect',
	CursorDown: 'cursorDown',
	CursorDownSelect: 'cursorDownSelect',

	CursorPageUp: 'cursorPageUp',
	CursorPageUpSelect: 'cursorPageUpSelect',
	CursorPageDown: 'cursorPageDown',
	CursorPageDownSelect: 'cursorPageDownSelect',

	CursorHome: 'cursorHome',
	CursorHomeSelect: 'cursorHomeSelect',

	CursorEnd: 'cursorEnd',
	CursorEndSelect: 'cursorEndSelect',

	ExpandLineSelection: 'expandLineSelection',

	CursorTop: 'cursorTop',
	CursorTopSelect: 'cursorTopSelect',
	CursorBottom: 'cursorBottom',
	CursorBottomSelect: 'cursorBottomSelect',

	CursorColumnSelectLeft: 'cursorColumnSelectLeft',
	CursorColumnSelectRight: 'cursorColumnSelectRight',
	CursorColumnSelectUp: 'cursorColumnSelectUp',
	CursorColumnSelectPageUp: 'cursorColumnSelectPageUp',
	CursorColumnSelectDown: 'cursorColumnSelectDown',
	CursorColumnSelectPageDown: 'cursorColumnSelectPageDown',

	CursorMove: 'cursorMove',

	AddCursorDown: 'addCursorDown',
	AddCursorUp: 'addCursorUp',
	CursorUndo: 'cursorUndo',
	MoveTo: 'moveTo',
	MoveToSelect: 'moveToSelect',
	ColumnSelect: 'columnSelect',
	CreateCursor: 'createCursor',
	LastCursorMoveToSelect: 'lastCursorMoveToSelect',

	Type: 'type',
	ReplacePreviousChar: 'replacePreviousChar',
	CompositionStart: 'compositionStart',
	CompositionEnd: 'compositionEnd',
	Paste: 'paste',

	Tab: 'tab',
	Indent: 'indent',
	Outdent: 'outdent',

	DeleteLeft: 'deleteLeft',
	DeleteRight: 'deleteRight',

	DeleteWordLeft: 'deleteWordLeft',
	DeleteWordStartLeft: 'deleteWordStartLeft',
	DeleteWordEndLeft: 'deleteWordEndLeft',

	DeleteWordRight: 'deleteWordRight',
	DeleteWordStartRight: 'deleteWordStartRight',
	DeleteWordEndRight: 'deleteWordEndRight',

	RemoveSecondaryCursors: 'removeSecondaryCursors',
	CancelSelection: 'cancelSelection',

	Cut: 'cut',

	Undo: 'undo',
	Redo: 'redo',

	WordSelect: 'wordSelect',
	WordSelectDrag: 'wordSelectDrag',
	LastCursorWordSelect: 'lastCursorWordSelect',

	LineSelect: 'lineSelect',
	LineSelectDrag: 'lineSelectDrag',
	LastCursorLineSelect: 'lastCursorLineSelect',
	LastCursorLineSelectDrag: 'lastCursorLineSelectDrag',
	LineInsertBefore: 'lineInsertBefore',
	LineInsertAfter: 'lineInsertAfter',
	LineBreakInsert: 'lineBreakInsert',

	SelectAll: 'selectAll',

	EditorScroll: 'editorScroll',

	ScrollLineUp: 'scrollLineUp',
	ScrollLineDown: 'scrollLineDown',

	ScrollPageUp: 'scrollPageUp',
	ScrollPageDown: 'scrollPageDown',

	RevealLine: 'revealLine'
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
export function cursorStyleToString(cursorStyle: TextEditorCursorStyle): string {
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

	constructor(from: number, to: number, colorId: number, position: OverviewRulerLane) {
		this.from = from | 0;
		this.to = to | 0;
		this.colorId = colorId | 0;
		this.position = position | 0;
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

	public getColor(useDarkColor: boolean): string {
		if (useDarkColor) {
			return this._darkColor;
		}
		return this._color;
	}

	public equals(other: OverviewRulerZone): boolean {
		return (
			this.startLineNumber === other.startLineNumber
			&& this.endLineNumber === other.endLineNumber
			&& this.position === other.position
			&& this.forceHeight === other.forceHeight
			&& this._color === other._color
			&& this._darkColor === other._darkColor
		);
	}

	public compareTo(other: OverviewRulerZone): number {
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

	public setColorZones(colorZones: ColorZone[]): void {
		this._colorZones = colorZones;
	}

	public getColorZones(): ColorZone[] {
		return this._colorZones;
	}
}

