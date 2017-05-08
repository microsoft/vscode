/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Constants } from 'vs/editor/common/core/uint';
import { USUAL_WORD_SEPARATORS } from 'vs/editor/common/model/wordHelper';

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
 * Configuration options for editor minimap
 */
export interface IEditorMinimapOptions {
	/**
	 * Enable the rendering of the minimap.
	 * Defaults to false.
	 */
	enabled?: boolean;
	/**
	 * Render the actual text on a line (as opposed to color blocks).
	 * Defaults to true.
	 */
	renderCharacters?: boolean;
	/**
	 * Limit the width of the minimap to render at most a certain number of columns.
	 * Defaults to 120.
	 */
	maxColumn?: number;
}

export type LineNumbersOption = 'on' | 'off' | 'relative' | ((lineNumber: number) => string);

/**
 * Configuration options for the editor.
 */
export interface IEditorOptions {
	/**
	 * This editor is used inside a diff editor.
	 * @internal
	 */
	inDiffEditor?: boolean;
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
	 * Control the behavior and rendering of the minimap.
	 */
	minimap?: IEditorMinimapOptions;
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
	 * Controls if a border should be drawn around the overview ruler.
	 * Defaults to `true`.
	 */
	overviewRulerBorder?: boolean;
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
	 * Control the mouse pointer style, either 'text' or 'default' or 'copy'
	 * Defaults to 'text'
	 * @internal
	 */
	mouseStyle?: 'text' | 'default' | 'copy';
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
	 * Control the wrapping of the editor.
	 * When `wordWrap` = "off", the lines will never wrap.
	 * When `wordWrap` = "on", the lines will wrap at the viewport width.
	 * When `wordWrap` = "wordWrapColumn", the lines will wrap at `wordWrapColumn`.
	 * When `wordWrap` = "bounded", the lines will wrap at min(viewport width, wordWrapColumn).
	 * Defaults to "off".
	 */
	wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
	/**
	 * Control the wrapping of the editor.
	 * When `wordWrap` = "off", the lines will never wrap.
	 * When `wordWrap` = "on", the lines will wrap at the viewport width.
	 * When `wordWrap` = "wordWrapColumn", the lines will wrap at `wordWrapColumn`.
	 * When `wordWrap` = "bounded", the lines will wrap at min(viewport width, wordWrapColumn).
	 * Defaults to 80.
	 */
	wordWrapColumn?: number;
	/**
	 * Force word wrapping when the text appears to be of a minified/generated file.
	 * Defaults to true.
	 */
	wordWrapMinified?: boolean;
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
	 * Defaults to 10000.
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
	quickSuggestions?: boolean | { other: boolean, comments: boolean, strings: boolean };
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
	 * Controls if the editor should allow to move selections via drag and drop.
	 * Defaults to false.
	 */
	dragAndDrop?: boolean;
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
	 * Enable semantic occurrences highlight.
	 * Defaults to true.
	 */
	occurrencesHighlight?: boolean;
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
	 * Enable automatic hiding of non-collapsed fold icons in the gutter.
	 * Defaults to true.
	 */
	hideFoldIcons?: boolean;
	/**
	 * Enable highlighting of matching brackets.
	 * Defaults to true.
	 */
	matchBrackets?: boolean;
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

export enum RenderMinimap {
	None = 0,
	Small = 1,
	Large = 2,
	SmallBlocks = 3,
	LargeBlocks = 4,
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
	Underline = 3,
	/**
	 * As a thin vertical line (sitting between two characters).
	 */
	LineThin = 4,
	/**
	 * As an outlined block (sitting on top of a character).
	 */
	BlockOutline = 5,
	/**
	 * As a thin horizontal line (sitting under a character).
	 */
	UnderlineThin = 6
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
	} else if (cursorStyle === TextEditorCursorStyle.LineThin) {
		return 'line-thin';
	} else if (cursorStyle === TextEditorCursorStyle.BlockOutline) {
		return 'block-outline';
	} else if (cursorStyle === TextEditorCursorStyle.UnderlineThin) {
		return 'underline-thin';
	} else {
		throw new Error('cursorStyleToString: Unknown cursorStyle');
	}
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
}

export class InternalEditorMinimapOptions {
	readonly _internalEditorMinimapOptionsBrand: void;

	readonly enabled: boolean;
	readonly renderCharacters: boolean;
	readonly maxColumn: number;

	/**
	 * @internal
	 */
	constructor(source: {
		enabled: boolean;
		renderCharacters: boolean;
		maxColumn: number;
	}) {
		this.enabled = Boolean(source.enabled);
		this.renderCharacters = Boolean(source.renderCharacters);
		this.maxColumn = source.maxColumn | 0;
	}

	/**
	 * @internal
	 */
	public equals(other: InternalEditorMinimapOptions): boolean {
		return (
			this.enabled === other.enabled
			&& this.renderCharacters === other.renderCharacters
			&& this.maxColumn === other.maxColumn
		);
	}
}

export class EditorWrappingInfo {
	readonly _editorWrappingInfoBrand: void;

	readonly inDiffEditor: boolean;
	readonly isDominatedByLongLines: boolean;
	readonly isWordWrapMinified: boolean;
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
		inDiffEditor: boolean;
		isDominatedByLongLines: boolean;
		isWordWrapMinified: boolean;
		isViewportWrapping: boolean;
		wrappingColumn: number;
		wrappingIndent: WrappingIndent;
		wordWrapBreakBeforeCharacters: string;
		wordWrapBreakAfterCharacters: string;
		wordWrapBreakObtrusiveCharacters: string;
	}) {
		this.inDiffEditor = Boolean(source.inDiffEditor);
		this.isDominatedByLongLines = Boolean(source.isDominatedByLongLines);
		this.isWordWrapMinified = Boolean(source.isWordWrapMinified);
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
			this.inDiffEditor === other.inDiffEditor
			&& this.isDominatedByLongLines === other.isDominatedByLongLines
			&& this.isWordWrapMinified === other.isWordWrapMinified
			&& this.isViewportWrapping === other.isViewportWrapping
			&& this.wrappingColumn === other.wrappingColumn
			&& this.wrappingIndent === other.wrappingIndent
			&& this.wordWrapBreakBeforeCharacters === other.wordWrapBreakBeforeCharacters
			&& this.wordWrapBreakAfterCharacters === other.wordWrapBreakAfterCharacters
			&& this.wordWrapBreakObtrusiveCharacters === other.wordWrapBreakObtrusiveCharacters
		);
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
	readonly overviewRulerBorder: boolean;
	readonly cursorBlinking: TextEditorCursorBlinkingStyle;
	readonly mouseWheelZoom: boolean;
	readonly cursorStyle: TextEditorCursorStyle;
	readonly hideCursorInOverviewRuler: boolean;
	readonly scrollBeyondLastLine: boolean;
	readonly editorClassName: string;
	readonly stopRenderingLineAfter: number;
	readonly renderWhitespace: 'none' | 'boundary' | 'all';
	readonly renderControlCharacters: boolean;
	readonly fontLigatures: boolean;
	readonly renderIndentGuides: boolean;
	readonly renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	readonly scrollbar: InternalEditorScrollbarOptions;
	readonly minimap: InternalEditorMinimapOptions;
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
		overviewRulerBorder: boolean;
		cursorBlinking: TextEditorCursorBlinkingStyle;
		mouseWheelZoom: boolean;
		cursorStyle: TextEditorCursorStyle;
		hideCursorInOverviewRuler: boolean;
		scrollBeyondLastLine: boolean;
		editorClassName: string;
		stopRenderingLineAfter: number;
		renderWhitespace: 'none' | 'boundary' | 'all';
		renderControlCharacters: boolean;
		fontLigatures: boolean;
		renderIndentGuides: boolean;
		renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
		scrollbar: InternalEditorScrollbarOptions;
		minimap: InternalEditorMinimapOptions;
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
		this.overviewRulerBorder = Boolean(source.overviewRulerBorder);
		this.cursorBlinking = source.cursorBlinking | 0;
		this.mouseWheelZoom = Boolean(source.mouseWheelZoom);
		this.cursorStyle = source.cursorStyle | 0;
		this.hideCursorInOverviewRuler = Boolean(source.hideCursorInOverviewRuler);
		this.scrollBeyondLastLine = Boolean(source.scrollBeyondLastLine);
		this.editorClassName = String(source.editorClassName);
		this.stopRenderingLineAfter = source.stopRenderingLineAfter | 0;
		this.renderWhitespace = source.renderWhitespace;
		this.renderControlCharacters = Boolean(source.renderControlCharacters);
		this.fontLigatures = Boolean(source.fontLigatures);
		this.renderIndentGuides = Boolean(source.renderIndentGuides);
		this.renderLineHighlight = source.renderLineHighlight;
		this.scrollbar = source.scrollbar;
		this.minimap = source.minimap;
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
			&& this.overviewRulerBorder === other.overviewRulerBorder
			&& this.cursorBlinking === other.cursorBlinking
			&& this.mouseWheelZoom === other.mouseWheelZoom
			&& this.cursorStyle === other.cursorStyle
			&& this.hideCursorInOverviewRuler === other.hideCursorInOverviewRuler
			&& this.scrollBeyondLastLine === other.scrollBeyondLastLine
			&& this.editorClassName === other.editorClassName
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.renderWhitespace === other.renderWhitespace
			&& this.renderControlCharacters === other.renderControlCharacters
			&& this.fontLigatures === other.fontLigatures
			&& this.renderIndentGuides === other.renderIndentGuides
			&& this.renderLineHighlight === other.renderLineHighlight
			&& this.scrollbar.equals(other.scrollbar)
			&& this.minimap.equals(other.minimap)
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
			overviewRulerBorder: this.overviewRulerBorder !== newOpts.overviewRulerBorder,
			cursorBlinking: this.cursorBlinking !== newOpts.cursorBlinking,
			mouseWheelZoom: this.mouseWheelZoom !== newOpts.mouseWheelZoom,
			cursorStyle: this.cursorStyle !== newOpts.cursorStyle,
			hideCursorInOverviewRuler: this.hideCursorInOverviewRuler !== newOpts.hideCursorInOverviewRuler,
			scrollBeyondLastLine: this.scrollBeyondLastLine !== newOpts.scrollBeyondLastLine,
			editorClassName: this.editorClassName !== newOpts.editorClassName,
			stopRenderingLineAfter: this.stopRenderingLineAfter !== newOpts.stopRenderingLineAfter,
			renderWhitespace: this.renderWhitespace !== newOpts.renderWhitespace,
			renderControlCharacters: this.renderControlCharacters !== newOpts.renderControlCharacters,
			fontLigatures: this.fontLigatures !== newOpts.fontLigatures,
			renderIndentGuides: this.renderIndentGuides !== newOpts.renderIndentGuides,
			renderLineHighlight: this.renderLineHighlight !== newOpts.renderLineHighlight,
			scrollbar: (!this.scrollbar.equals(newOpts.scrollbar)),
			minimap: (!this.minimap.equals(newOpts.minimap)),
			fixedOverflowWidgets: this.fixedOverflowWidgets !== newOpts.fixedOverflowWidgets
		};
	}
}

export class EditorContribOptions {
	readonly selectionClipboard: boolean;
	readonly hover: boolean;
	readonly contextmenu: boolean;
	readonly quickSuggestions: boolean | { other: boolean, comments: boolean, strings: boolean };
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
	readonly wordBasedSuggestions: boolean;
	readonly suggestFontSize: number;
	readonly suggestLineHeight: number;
	readonly selectionHighlight: boolean;
	readonly occurrencesHighlight: boolean;
	readonly codeLens: boolean;
	readonly folding: boolean;
	readonly hideFoldIcons: boolean;
	readonly matchBrackets: boolean;

	/**
	 * @internal
	 */
	constructor(source: {
		selectionClipboard: boolean;
		hover: boolean;
		contextmenu: boolean;
		quickSuggestions: boolean | { other: boolean, comments: boolean, strings: boolean };
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
		wordBasedSuggestions: boolean;
		suggestFontSize: number;
		suggestLineHeight: number;
		selectionHighlight: boolean;
		occurrencesHighlight: boolean;
		codeLens: boolean;
		folding: boolean;
		hideFoldIcons: boolean;
		matchBrackets: boolean;
	}) {
		this.selectionClipboard = Boolean(source.selectionClipboard);
		this.hover = Boolean(source.hover);
		this.contextmenu = Boolean(source.contextmenu);
		this.quickSuggestions = source.quickSuggestions;
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
		this.wordBasedSuggestions = source.wordBasedSuggestions;
		this.suggestFontSize = source.suggestFontSize;
		this.suggestLineHeight = source.suggestLineHeight;
		this.selectionHighlight = Boolean(source.selectionHighlight);
		this.occurrencesHighlight = Boolean(source.occurrencesHighlight);
		this.codeLens = Boolean(source.codeLens);
		this.folding = Boolean(source.folding);
		this.hideFoldIcons = Boolean(source.hideFoldIcons);
		this.matchBrackets = Boolean(source.matchBrackets);
	}

	/**
	 * @internal
	 */
	public equals(other: EditorContribOptions): boolean {
		return (
			this.selectionClipboard === other.selectionClipboard
			&& this.hover === other.hover
			&& this.contextmenu === other.contextmenu
			&& EditorContribOptions._quickSuggestionsEquals(this.quickSuggestions, other.quickSuggestions)
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
			&& this.wordBasedSuggestions === other.wordBasedSuggestions
			&& this.suggestFontSize === other.suggestFontSize
			&& this.suggestLineHeight === other.suggestLineHeight
			&& this.selectionHighlight === other.selectionHighlight
			&& this.occurrencesHighlight === other.occurrencesHighlight
			&& this.codeLens === other.codeLens
			&& this.folding === other.folding
			&& this.hideFoldIcons === other.hideFoldIcons
			&& this.matchBrackets === other.matchBrackets
		);
	}

	private static _quickSuggestionsEquals(a: boolean | { other: boolean, comments: boolean, strings: boolean }, b: boolean | { other: boolean, comments: boolean, strings: boolean }): boolean {
		if (typeof a === 'boolean') {
			if (typeof b !== 'boolean') {
				return false;
			}
			return a === b;
		}
		if (typeof b === 'boolean') {
			return false;
		}
		return (
			a.comments === b.comments
			&& a.other === b.other
			&& a.strings === b.strings
		);
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
	readonly dragAndDrop: boolean;
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
		dragAndDrop: boolean;
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
		this.dragAndDrop = Boolean(source.dragAndDrop);
		this.layoutInfo = source.layoutInfo;
		this.fontInfo = source.fontInfo;
		this.viewInfo = source.viewInfo;
		this.wrappingInfo = source.wrappingInfo;
		this.contribInfo = source.contribInfo;
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
			&& this.dragAndDrop === other.dragAndDrop
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
			dragAndDrop: (this.dragAndDrop !== newOpts.dragAndDrop),
			layoutInfo: (!this.layoutInfo.equals(newOpts.layoutInfo)),
			fontInfo: (!this.fontInfo.equals(newOpts.fontInfo)),
			viewInfo: this.viewInfo.createChangeEvent(newOpts.viewInfo),
			wrappingInfo: (!this.wrappingInfo.equals(newOpts.wrappingInfo)),
			contribInfo: (!this.contribInfo.equals(newOpts.contribInfo)),
		};
	}
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
	 * The width of the minimap
	 */
	readonly minimapWidth: number;

	/**
	 * Minimap render type
	 */
	readonly renderMinimap: RenderMinimap;

	/**
	 * The number of columns (of typical characters) fitting on a viewport line.
	 */
	readonly viewportColumn: number;

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
		renderMinimap: RenderMinimap;
		minimapWidth: number;
		viewportColumn: number;
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
		this.renderMinimap = source.renderMinimap | 0;
		this.minimapWidth = source.minimapWidth | 0;
		this.viewportColumn = source.viewportColumn | 0;
		this.verticalScrollbarWidth = source.verticalScrollbarWidth | 0;
		this.horizontalScrollbarHeight = source.horizontalScrollbarHeight | 0;
		this.overviewRuler = source.overviewRuler;
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
			&& this.renderMinimap === other.renderMinimap
			&& this.minimapWidth === other.minimapWidth
			&& this.viewportColumn === other.viewportColumn
			&& this.verticalScrollbarWidth === other.verticalScrollbarWidth
			&& this.horizontalScrollbarHeight === other.horizontalScrollbarHeight
			&& this.overviewRuler.equals(other.overviewRuler)
		);
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
	readonly overviewRulerBorder: boolean;
	readonly cursorBlinking: boolean;
	readonly mouseWheelZoom: boolean;
	readonly cursorStyle: boolean;
	readonly hideCursorInOverviewRuler: boolean;
	readonly scrollBeyondLastLine: boolean;
	readonly editorClassName: boolean;
	readonly stopRenderingLineAfter: boolean;
	readonly renderWhitespace: boolean;
	readonly renderControlCharacters: boolean;
	readonly fontLigatures: boolean;
	readonly renderIndentGuides: boolean;
	readonly renderLineHighlight: boolean;
	readonly scrollbar: boolean;
	readonly minimap: boolean;
	readonly fixedOverflowWidgets: boolean;
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
	readonly dragAndDrop: boolean;
	readonly layoutInfo: boolean;
	readonly fontInfo: boolean;
	readonly viewInfo: IViewConfigurationChangedEvent;
	readonly wrappingInfo: boolean;
	readonly contribInfo: boolean;
}

/**
 * @internal
 */
export class EnvironmentalOptions {

	public readonly outerWidth: number;
	public readonly outerHeight: number;
	public readonly fontInfo: FontInfo;
	public readonly editorClassName: string;
	public readonly isDominatedByLongLines: boolean;
	public readonly lineNumbersDigitCount: number;
	public readonly canUseTranslate3d: boolean;
	public readonly pixelRatio: number;
	public readonly tabFocusMode: boolean;

	constructor(opts: {
		outerWidth: number;
		outerHeight: number;
		fontInfo: FontInfo;
		editorClassName: string;
		isDominatedByLongLines: boolean;
		lineNumbersDigitCount: number;
		canUseTranslate3d: boolean;
		pixelRatio: number;
		tabFocusMode: boolean;
	}) {
		this.outerWidth = opts.outerWidth;
		this.outerHeight = opts.outerHeight;
		this.fontInfo = opts.fontInfo;
		this.editorClassName = opts.editorClassName;
		this.isDominatedByLongLines = opts.isDominatedByLongLines;
		this.lineNumbersDigitCount = opts.lineNumbersDigitCount;
		this.canUseTranslate3d = opts.canUseTranslate3d;
		this.pixelRatio = opts.pixelRatio;
		this.tabFocusMode = opts.tabFocusMode;
	}
}

/**
 * Validated scrollbar options for the editor.
 * @internal
 */
export interface IValidatedEditorScrollbarOptions {
	vertical: ScrollbarVisibility;
	horizontal: ScrollbarVisibility;
	arrowSize: number;
	useShadows: boolean;
	verticalHasArrows: boolean;
	horizontalHasArrows: boolean;
	horizontalScrollbarSize: number;
	horizontalSliderSize: number;
	verticalScrollbarSize: number;
	verticalSliderSize: number;
	handleMouseWheel: boolean;
}

/**
 * Validated minimap options for the editor.
 * @internal
 */
export interface IValidatedEditorMinimapOptions {
	enabled: boolean;
	renderCharacters: boolean;
	maxColumn: number;
}

/**
 * Validated configuration options for the editor.
 * @internal
 */
export interface IValidatedEditorOptions {
	inDiffEditor: boolean;
	experimentalScreenReader: boolean;
	ariaLabel: string;
	rulers: number[];
	wordSeparators: string;
	selectionClipboard: boolean;
	renderLineNumbers: boolean;
	renderCustomLineNumbers: (lineNumber: number) => string;
	renderRelativeLineNumbers: boolean;
	selectOnLineNumbers: boolean;
	lineNumbersMinChars: number;
	glyphMargin: boolean;
	lineDecorationsWidth: number | string;
	revealHorizontalRightPadding: number;
	roundedSelection: boolean;
	theme: string;
	readOnly: boolean;
	scrollbar: IValidatedEditorScrollbarOptions;
	minimap: IValidatedEditorMinimapOptions;
	fixedOverflowWidgets: boolean;
	overviewRulerLanes: number;
	overviewRulerBorder: boolean;
	cursorBlinking: TextEditorCursorBlinkingStyle;
	mouseWheelZoom: boolean;
	mouseStyle: 'text' | 'default' | 'copy';
	cursorStyle: TextEditorCursorStyle;
	fontLigatures: boolean;
	disableTranslate3d: boolean;
	disableMonospaceOptimizations: boolean;
	hideCursorInOverviewRuler: boolean;
	scrollBeyondLastLine: boolean;
	automaticLayout: boolean;
	wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
	wordWrapColumn: number;
	wordWrapMinified: boolean;
	wrappingIndent: WrappingIndent;
	wordWrapBreakBeforeCharacters: string;
	wordWrapBreakAfterCharacters: string;
	wordWrapBreakObtrusiveCharacters: string;
	stopRenderingLineAfter: number;
	hover: boolean;
	contextmenu: boolean;
	mouseWheelScrollSensitivity: number;
	quickSuggestions: boolean | { other: boolean, comments: boolean, strings: boolean };
	quickSuggestionsDelay: number;
	parameterHints: boolean;
	iconsInSuggestions: boolean;
	autoClosingBrackets: boolean;
	formatOnType: boolean;
	formatOnPaste: boolean;
	dragAndDrop: boolean;
	suggestOnTriggerCharacters: boolean;
	acceptSuggestionOnEnter: boolean;
	acceptSuggestionOnCommitCharacter: boolean;
	snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none';
	emptySelectionClipboard: boolean;
	wordBasedSuggestions: boolean;
	suggestFontSize: number;
	suggestLineHeight: number;
	selectionHighlight: boolean;
	occurrencesHighlight: boolean;
	codeLens: boolean;
	referenceInfos: boolean;
	folding: boolean;
	hideFoldIcons: boolean;
	matchBrackets: boolean;
	renderWhitespace: 'none' | 'boundary' | 'all';
	renderControlCharacters: boolean;
	renderIndentGuides: boolean;
	renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	useTabStops: boolean;
}

function _boolean<T>(value: any, defaultValue: T): boolean | T {
	if (typeof value === 'undefined') {
		return defaultValue;
	}
	if (value === 'false') {
		// treat the string 'false' as false
		return false;
	}
	return Boolean(value);
}

function _string(value: any, defaultValue: string): string {
	if (typeof value !== 'string') {
		return defaultValue;
	}
	return value;
}

function _stringSet<T>(value: any, defaultValue: T, allowedValues: string[]): T {
	if (typeof value !== 'string') {
		return defaultValue;
	}
	if (allowedValues.indexOf(value) === -1) {
		return defaultValue;
	}
	return <T><any>value;
}

function _clampedInt(value: any, defaultValue: number, minimum: number, maximum: number): number {
	let r: number;
	if (typeof value === 'undefined') {
		r = defaultValue;
	} else {
		r = parseInt(value, 10);
		if (isNaN(r)) {
			r = defaultValue;
		}
	}
	r = Math.max(minimum, r);
	r = Math.min(maximum, r);
	return r | 0;
}

function _float(value: any, defaultValue: number): number {
	let r = parseFloat(value);
	if (isNaN(r)) {
		r = defaultValue;
	}
	return r;
}

function _wrappingIndentFromString(wrappingIndent: string, defaultValue: WrappingIndent): WrappingIndent {
	if (typeof wrappingIndent !== 'string') {
		return defaultValue;
	}
	if (wrappingIndent === 'indent') {
		return WrappingIndent.Indent;
	} else if (wrappingIndent === 'same') {
		return WrappingIndent.Same;
	} else {
		return WrappingIndent.None;
	}
}

function _cursorStyleFromString(cursorStyle: string, defaultValue: TextEditorCursorStyle): TextEditorCursorStyle {
	if (typeof cursorStyle !== 'string') {
		return defaultValue;
	}
	if (cursorStyle === 'line') {
		return TextEditorCursorStyle.Line;
	} else if (cursorStyle === 'block') {
		return TextEditorCursorStyle.Block;
	} else if (cursorStyle === 'underline') {
		return TextEditorCursorStyle.Underline;
	} else if (cursorStyle === 'line-thin') {
		return TextEditorCursorStyle.LineThin;
	} else if (cursorStyle === 'block-outline') {
		return TextEditorCursorStyle.BlockOutline;
	} else if (cursorStyle === 'underline-thin') {
		return TextEditorCursorStyle.UnderlineThin;
	}
	return TextEditorCursorStyle.Line;
}

function _cursorBlinkingStyleFromString(cursorBlinkingStyle: string, defaultValue: TextEditorCursorBlinkingStyle): TextEditorCursorBlinkingStyle {
	if (typeof cursorBlinkingStyle !== 'string') {
		return defaultValue;
	}
	switch (cursorBlinkingStyle) {
		case 'blink':
			return TextEditorCursorBlinkingStyle.Blink;
		case 'smooth':
			return TextEditorCursorBlinkingStyle.Smooth;
		case 'phase':
			return TextEditorCursorBlinkingStyle.Phase;
		case 'expand':
			return TextEditorCursorBlinkingStyle.Expand;
		case 'visible': // maintain compatibility
		case 'solid':
			return TextEditorCursorBlinkingStyle.Solid;
	}
	return TextEditorCursorBlinkingStyle.Blink;
}

function _scrollbarVisibilityFromString(visibility: string, defaultValue: ScrollbarVisibility): ScrollbarVisibility {
	if (typeof visibility !== 'string') {
		return defaultValue;
	}
	switch (visibility) {
		case 'hidden':
			return ScrollbarVisibility.Hidden;
		case 'visible':
			return ScrollbarVisibility.Visible;
		default:
			return ScrollbarVisibility.Auto;
	}
}

/**
 * @internal
 */
export class EditorOptionsValidator {

	/**
	 * Validate raw editor options.
	 * i.e. since they can be defined by the user, they might be invalid.
	 */
	public static validate(opts: IEditorOptions, defaults: IValidatedEditorOptions): IValidatedEditorOptions {

		let rulers: number[] = [];
		if (Array.isArray(opts.rulers)) {
			for (let i = 0, len = opts.rulers.length; i < len; i++) {
				rulers.push(_clampedInt(opts.rulers[i], 0, 0, 10000));
			}
			rulers.sort();
		}

		let renderLineNumbers: boolean = defaults.renderLineNumbers;
		let renderCustomLineNumbers: (lineNumber: number) => string = defaults.renderCustomLineNumbers;
		let renderRelativeLineNumbers: boolean = defaults.renderRelativeLineNumbers;

		if (typeof opts.lineNumbers !== 'undefined') {
			let lineNumbers = opts.lineNumbers;

			// Compatibility with old true or false values
			if (<any>lineNumbers === true) {
				lineNumbers = 'on';
			} else if (<any>lineNumbers === false) {
				lineNumbers = 'off';
			}

			if (typeof lineNumbers === 'function') {
				renderLineNumbers = true;
				renderCustomLineNumbers = lineNumbers;
				renderRelativeLineNumbers = false;
			} else if (lineNumbers === 'relative') {
				renderLineNumbers = true;
				renderCustomLineNumbers = null;
				renderRelativeLineNumbers = true;
			} else if (lineNumbers === 'on') {
				renderLineNumbers = true;
				renderCustomLineNumbers = null;
				renderRelativeLineNumbers = false;
			} else {
				renderLineNumbers = false;
				renderCustomLineNumbers = null;
				renderRelativeLineNumbers = false;
			}
		}

		let wordWrap = opts.wordWrap;
		{
			// Compatibility with old true or false values
			if (<any>wordWrap === true) {
				wordWrap = 'on';
			} else if (<any>wordWrap === false) {
				wordWrap = 'off';
			}

			wordWrap = _stringSet<'off' | 'on' | 'wordWrapColumn' | 'bounded'>(wordWrap, defaults.wordWrap, ['off', 'on', 'wordWrapColumn', 'bounded']);
		}

		let renderWhitespace = opts.renderWhitespace;
		{
			// Compatibility with old true or false values
			if (<any>renderWhitespace === true) {
				renderWhitespace = 'boundary';
			} else if (<any>renderWhitespace === false) {
				renderWhitespace = 'none';
			}
			renderWhitespace = _stringSet<'none' | 'boundary' | 'all'>(opts.renderWhitespace, defaults.renderWhitespace, ['none', 'boundary', 'all']);
		}

		let renderLineHighlight = opts.renderLineHighlight;
		{
			// Compatibility with old true or false values
			if (<any>renderLineHighlight === true) {
				renderLineHighlight = 'line';
			} else if (<any>renderLineHighlight === false) {
				renderLineHighlight = 'none';
			}
			renderLineHighlight = _stringSet<'none' | 'gutter' | 'line' | 'all'>(opts.renderLineHighlight, defaults.renderLineHighlight, ['none', 'gutter', 'line', 'all']);
		}

		const scrollbar = this._sanitizeScrollbarOpts(opts.scrollbar, defaults.scrollbar);
		const minimap = this._sanitizeMinimapOpts(opts.minimap, defaults.minimap);

		let quickSuggestions: boolean | { other: boolean, comments: boolean, strings: boolean };
		if (typeof opts.quickSuggestions === 'object') {
			quickSuggestions = { other: true, ...opts.quickSuggestions };
		} else {
			quickSuggestions = _boolean(opts.quickSuggestions, defaults.quickSuggestions);
		}

		return {
			inDiffEditor: _boolean(opts.inDiffEditor, defaults.inDiffEditor),
			experimentalScreenReader: _boolean(opts.experimentalScreenReader, defaults.experimentalScreenReader),
			ariaLabel: _string(opts.ariaLabel, defaults.ariaLabel),
			rulers: rulers,
			wordSeparators: _string(opts.wordSeparators, defaults.wordSeparators),
			selectionClipboard: _boolean(opts.selectionClipboard, defaults.selectionClipboard),
			renderLineNumbers: renderLineNumbers,
			renderCustomLineNumbers: renderCustomLineNumbers,
			renderRelativeLineNumbers: renderRelativeLineNumbers,
			selectOnLineNumbers: _boolean(opts.selectOnLineNumbers, defaults.selectOnLineNumbers),
			lineNumbersMinChars: _clampedInt(opts.lineNumbersMinChars, defaults.lineNumbersMinChars, 1, 10),
			glyphMargin: _boolean(opts.glyphMargin, defaults.glyphMargin),
			lineDecorationsWidth: (typeof opts.lineDecorationsWidth === 'undefined' ? defaults.lineDecorationsWidth : opts.lineDecorationsWidth),
			revealHorizontalRightPadding: _clampedInt(opts.revealHorizontalRightPadding, defaults.revealHorizontalRightPadding, 0, 1000),
			roundedSelection: _boolean(opts.roundedSelection, defaults.roundedSelection),
			theme: _string(opts.theme, defaults.theme),
			readOnly: _boolean(opts.readOnly, defaults.readOnly),
			scrollbar: scrollbar,
			minimap: minimap,
			fixedOverflowWidgets: _boolean(opts.fixedOverflowWidgets, defaults.fixedOverflowWidgets),
			overviewRulerLanes: _clampedInt(opts.overviewRulerLanes, defaults.overviewRulerLanes, 0, 3),
			overviewRulerBorder: _boolean(opts.overviewRulerBorder, defaults.overviewRulerBorder),
			cursorBlinking: _cursorBlinkingStyleFromString(opts.cursorBlinking, defaults.cursorBlinking),
			mouseWheelZoom: _boolean(opts.mouseWheelZoom, defaults.mouseWheelZoom),
			mouseStyle: _stringSet<'text' | 'default' | 'copy'>(opts.mouseStyle, defaults.mouseStyle, ['text', 'default', 'copy']),
			cursorStyle: _cursorStyleFromString(opts.cursorStyle, defaults.cursorStyle),
			fontLigatures: _boolean(opts.fontLigatures, defaults.fontLigatures),
			disableTranslate3d: _boolean(opts.disableTranslate3d, defaults.disableTranslate3d),
			disableMonospaceOptimizations: _boolean(opts.disableMonospaceOptimizations, defaults.disableMonospaceOptimizations),
			hideCursorInOverviewRuler: _boolean(opts.hideCursorInOverviewRuler, defaults.hideCursorInOverviewRuler),
			scrollBeyondLastLine: _boolean(opts.scrollBeyondLastLine, defaults.scrollBeyondLastLine),
			automaticLayout: _boolean(opts.automaticLayout, defaults.automaticLayout),
			wordWrap: wordWrap,
			wordWrapColumn: _clampedInt(opts.wordWrapColumn, defaults.wordWrapColumn, 1, Constants.MAX_SAFE_SMALL_INTEGER),
			wordWrapMinified: _boolean(opts.wordWrapMinified, defaults.wordWrapMinified),
			wrappingIndent: _wrappingIndentFromString(opts.wrappingIndent, defaults.wrappingIndent),
			wordWrapBreakBeforeCharacters: _string(opts.wordWrapBreakBeforeCharacters, defaults.wordWrapBreakBeforeCharacters),
			wordWrapBreakAfterCharacters: _string(opts.wordWrapBreakAfterCharacters, defaults.wordWrapBreakAfterCharacters),
			wordWrapBreakObtrusiveCharacters: _string(opts.wordWrapBreakObtrusiveCharacters, defaults.wordWrapBreakObtrusiveCharacters),
			stopRenderingLineAfter: _clampedInt(opts.stopRenderingLineAfter, defaults.stopRenderingLineAfter, -1, Constants.MAX_SAFE_SMALL_INTEGER),
			hover: _boolean(opts.hover, defaults.hover),
			contextmenu: _boolean(opts.contextmenu, defaults.contextmenu),
			mouseWheelScrollSensitivity: _float(opts.mouseWheelScrollSensitivity, defaults.mouseWheelScrollSensitivity),
			quickSuggestions: quickSuggestions,
			quickSuggestionsDelay: _clampedInt(opts.quickSuggestionsDelay, defaults.quickSuggestionsDelay, Constants.MIN_SAFE_SMALL_INTEGER, Constants.MAX_SAFE_SMALL_INTEGER),
			parameterHints: _boolean(opts.parameterHints, defaults.parameterHints),
			iconsInSuggestions: _boolean(opts.iconsInSuggestions, defaults.iconsInSuggestions),
			autoClosingBrackets: _boolean(opts.autoClosingBrackets, defaults.autoClosingBrackets),
			formatOnType: _boolean(opts.formatOnType, defaults.formatOnType),
			formatOnPaste: _boolean(opts.formatOnPaste, defaults.formatOnPaste),
			dragAndDrop: _boolean(opts.dragAndDrop, defaults.dragAndDrop),
			suggestOnTriggerCharacters: _boolean(opts.suggestOnTriggerCharacters, defaults.suggestOnTriggerCharacters),
			acceptSuggestionOnEnter: _boolean(opts.acceptSuggestionOnEnter, defaults.acceptSuggestionOnEnter),
			acceptSuggestionOnCommitCharacter: _boolean(opts.acceptSuggestionOnCommitCharacter, defaults.acceptSuggestionOnCommitCharacter),
			snippetSuggestions: _stringSet<'top' | 'bottom' | 'inline' | 'none'>(opts.snippetSuggestions, defaults.snippetSuggestions, ['top', 'bottom', 'inline', 'none']),
			emptySelectionClipboard: _boolean(opts.emptySelectionClipboard, defaults.emptySelectionClipboard),
			wordBasedSuggestions: _boolean(opts.wordBasedSuggestions, defaults.wordBasedSuggestions),
			suggestFontSize: _clampedInt(opts.suggestFontSize, defaults.suggestFontSize, 0, 1000),
			suggestLineHeight: _clampedInt(opts.suggestLineHeight, defaults.suggestLineHeight, 0, 1000),
			selectionHighlight: _boolean(opts.selectionHighlight, defaults.selectionHighlight),
			occurrencesHighlight: _boolean(opts.occurrencesHighlight, defaults.occurrencesHighlight),
			codeLens: _boolean(opts.codeLens, defaults.codeLens),
			referenceInfos: _boolean(opts.referenceInfos, defaults.referenceInfos),
			folding: _boolean(opts.folding, defaults.folding),
			hideFoldIcons: _boolean(opts.hideFoldIcons, defaults.hideFoldIcons),
			matchBrackets: _boolean(opts.matchBrackets, defaults.matchBrackets),
			renderWhitespace: renderWhitespace,
			renderControlCharacters: _boolean(opts.renderControlCharacters, defaults.renderControlCharacters),
			renderIndentGuides: _boolean(opts.renderIndentGuides, defaults.renderIndentGuides),
			renderLineHighlight: renderLineHighlight,
			useTabStops: _boolean(opts.useTabStops, defaults.useTabStops),
		};
	}

	private static _sanitizeScrollbarOpts(opts: IEditorScrollbarOptions, defaults: IValidatedEditorScrollbarOptions): IValidatedEditorScrollbarOptions {
		if (typeof opts !== 'object') {
			return defaults;
		}
		const horizontalScrollbarSize = _clampedInt(opts.horizontalScrollbarSize, defaults.horizontalScrollbarSize, 0, 1000);
		const verticalScrollbarSize = _clampedInt(opts.verticalScrollbarSize, defaults.verticalScrollbarSize, 0, 1000);
		return {
			vertical: _scrollbarVisibilityFromString(opts.vertical, defaults.vertical),
			horizontal: _scrollbarVisibilityFromString(opts.horizontal, defaults.horizontal),

			arrowSize: _clampedInt(opts.arrowSize, defaults.arrowSize, 0, 1000),
			useShadows: _boolean(opts.useShadows, defaults.useShadows),

			verticalHasArrows: _boolean(opts.verticalHasArrows, defaults.verticalHasArrows),
			horizontalHasArrows: _boolean(opts.horizontalHasArrows, defaults.horizontalHasArrows),

			horizontalScrollbarSize: horizontalScrollbarSize,
			horizontalSliderSize: _clampedInt(opts.horizontalSliderSize, horizontalScrollbarSize, 0, 1000),

			verticalScrollbarSize: verticalScrollbarSize,
			verticalSliderSize: _clampedInt(opts.verticalSliderSize, verticalScrollbarSize, 0, 1000),

			handleMouseWheel: _boolean(opts.handleMouseWheel, defaults.handleMouseWheel)
		};
	}

	private static _sanitizeMinimapOpts(opts: IEditorMinimapOptions, defaults: IValidatedEditorMinimapOptions): IValidatedEditorMinimapOptions {
		if (typeof opts !== 'object') {
			return defaults;
		}
		return {
			enabled: _boolean(opts.enabled, defaults.enabled),
			renderCharacters: _boolean(opts.renderCharacters, defaults.renderCharacters),
			maxColumn: _clampedInt(opts.maxColumn, defaults.maxColumn, 1, 10000),
		};
	}
}

/**
 * @internal
 */
export class InternalEditorOptionsFactory {

	public static createInternalEditorOptions(env: EnvironmentalOptions, opts: IValidatedEditorOptions) {

		let lineDecorationsWidth: number;
		if (typeof opts.lineDecorationsWidth === 'string' && /^\d+(\.\d+)?ch$/.test(opts.lineDecorationsWidth)) {
			const multiple = parseFloat(opts.lineDecorationsWidth.substr(0, opts.lineDecorationsWidth.length - 2));
			lineDecorationsWidth = multiple * env.fontInfo.typicalHalfwidthCharacterWidth;
		} else {
			lineDecorationsWidth = _clampedInt(opts.lineDecorationsWidth, 0, 0, 1000);
		}
		if (opts.folding) {
			lineDecorationsWidth += 16;
		}

		const layoutInfo = EditorLayoutProvider.compute({
			outerWidth: env.outerWidth,
			outerHeight: env.outerHeight,
			showGlyphMargin: opts.glyphMargin,
			lineHeight: env.fontInfo.lineHeight,
			showLineNumbers: opts.renderLineNumbers,
			lineNumbersMinChars: opts.lineNumbersMinChars,
			lineNumbersDigitCount: env.lineNumbersDigitCount,
			lineDecorationsWidth: lineDecorationsWidth,
			typicalHalfwidthCharacterWidth: env.fontInfo.typicalHalfwidthCharacterWidth,
			maxDigitWidth: env.fontInfo.maxDigitWidth,
			verticalScrollbarWidth: opts.scrollbar.verticalScrollbarSize,
			horizontalScrollbarHeight: opts.scrollbar.horizontalScrollbarSize,
			scrollbarArrowSize: opts.scrollbar.arrowSize,
			verticalScrollbarHasArrows: opts.scrollbar.verticalHasArrows,
			minimap: opts.minimap.enabled,
			minimapRenderCharacters: opts.minimap.renderCharacters,
			minimapMaxColumn: opts.minimap.maxColumn,
			pixelRatio: env.pixelRatio
		});

		let bareWrappingInfo: { isWordWrapMinified: boolean; isViewportWrapping: boolean; wrappingColumn: number; } = null;
		{
			let wordWrap = opts.wordWrap;
			const wordWrapColumn = opts.wordWrapColumn;
			const wordWrapMinified = opts.wordWrapMinified;

			if (wordWrapMinified && env.isDominatedByLongLines) {
				// Force viewport width wrapping if model is dominated by long lines
				bareWrappingInfo = {
					isWordWrapMinified: true,
					isViewportWrapping: true,
					wrappingColumn: Math.max(1, layoutInfo.viewportColumn)
				};
			} else if (wordWrap === 'on') {
				bareWrappingInfo = {
					isWordWrapMinified: false,
					isViewportWrapping: true,
					wrappingColumn: Math.max(1, layoutInfo.viewportColumn)
				};
			} else if (wordWrap === 'bounded') {
				bareWrappingInfo = {
					isWordWrapMinified: false,
					isViewportWrapping: true,
					wrappingColumn: Math.min(Math.max(1, layoutInfo.viewportColumn), wordWrapColumn)
				};
			} else if (wordWrap === 'wordWrapColumn') {
				bareWrappingInfo = {
					isWordWrapMinified: false,
					isViewportWrapping: false,
					wrappingColumn: wordWrapColumn
				};
			} else {
				bareWrappingInfo = {
					isWordWrapMinified: false,
					isViewportWrapping: false,
					wrappingColumn: -1
				};
			}
		}

		const wrappingInfo = new EditorWrappingInfo({
			inDiffEditor: opts.inDiffEditor,
			isDominatedByLongLines: env.isDominatedByLongLines,
			isWordWrapMinified: bareWrappingInfo.isWordWrapMinified,
			isViewportWrapping: bareWrappingInfo.isViewportWrapping,
			wrappingColumn: bareWrappingInfo.wrappingColumn,
			wrappingIndent: opts.wrappingIndent,
			wordWrapBreakBeforeCharacters: opts.wordWrapBreakBeforeCharacters,
			wordWrapBreakAfterCharacters: opts.wordWrapBreakAfterCharacters,
			wordWrapBreakObtrusiveCharacters: opts.wordWrapBreakObtrusiveCharacters,
		});

		const viewInfo = new InternalEditorViewOptions({
			theme: opts.theme,
			canUseTranslate3d: opts.disableTranslate3d ? false : env.canUseTranslate3d,
			disableMonospaceOptimizations: (opts.disableMonospaceOptimizations || opts.fontLigatures),
			experimentalScreenReader: opts.experimentalScreenReader,
			rulers: opts.rulers,
			ariaLabel: opts.ariaLabel,
			renderLineNumbers: opts.renderLineNumbers,
			renderCustomLineNumbers: opts.renderCustomLineNumbers,
			renderRelativeLineNumbers: opts.renderRelativeLineNumbers,
			selectOnLineNumbers: opts.selectOnLineNumbers,
			glyphMargin: opts.glyphMargin,
			revealHorizontalRightPadding: opts.revealHorizontalRightPadding,
			roundedSelection: opts.roundedSelection,
			overviewRulerLanes: opts.overviewRulerLanes,
			overviewRulerBorder: opts.overviewRulerBorder,
			cursorBlinking: opts.cursorBlinking,
			mouseWheelZoom: opts.mouseWheelZoom,
			cursorStyle: opts.cursorStyle,
			hideCursorInOverviewRuler: opts.hideCursorInOverviewRuler,
			scrollBeyondLastLine: opts.scrollBeyondLastLine,
			editorClassName: env.editorClassName,
			stopRenderingLineAfter: opts.stopRenderingLineAfter,
			renderWhitespace: opts.renderWhitespace,
			renderControlCharacters: opts.renderControlCharacters,
			fontLigatures: opts.fontLigatures,
			renderIndentGuides: opts.renderIndentGuides,
			renderLineHighlight: opts.renderLineHighlight,
			scrollbar: new InternalEditorScrollbarOptions({
				vertical: opts.scrollbar.vertical,
				horizontal: opts.scrollbar.horizontal,

				arrowSize: opts.scrollbar.arrowSize,
				useShadows: opts.scrollbar.useShadows,

				verticalHasArrows: opts.scrollbar.verticalHasArrows,
				horizontalHasArrows: opts.scrollbar.horizontalHasArrows,

				horizontalScrollbarSize: opts.scrollbar.horizontalScrollbarSize,
				horizontalSliderSize: opts.scrollbar.horizontalSliderSize,

				verticalScrollbarSize: opts.scrollbar.verticalScrollbarSize,
				verticalSliderSize: opts.scrollbar.verticalSliderSize,

				handleMouseWheel: opts.scrollbar.handleMouseWheel,
				mouseWheelScrollSensitivity: opts.mouseWheelScrollSensitivity
			}),
			minimap: new InternalEditorMinimapOptions({
				enabled: opts.minimap.enabled,
				renderCharacters: opts.minimap.renderCharacters,
				maxColumn: opts.minimap.maxColumn,
			}),
			fixedOverflowWidgets: opts.fixedOverflowWidgets
		});

		const contribInfo = new EditorContribOptions({
			selectionClipboard: opts.selectionClipboard,
			hover: opts.hover,
			contextmenu: opts.contextmenu,
			quickSuggestions: opts.quickSuggestions,
			quickSuggestionsDelay: opts.quickSuggestionsDelay,
			parameterHints: opts.parameterHints,
			iconsInSuggestions: opts.iconsInSuggestions,
			formatOnType: opts.formatOnType,
			formatOnPaste: opts.formatOnPaste,
			suggestOnTriggerCharacters: opts.suggestOnTriggerCharacters,
			acceptSuggestionOnEnter: opts.acceptSuggestionOnEnter,
			acceptSuggestionOnCommitCharacter: opts.acceptSuggestionOnCommitCharacter,
			snippetSuggestions: opts.snippetSuggestions,
			emptySelectionClipboard: opts.emptySelectionClipboard,
			wordBasedSuggestions: opts.wordBasedSuggestions,
			suggestFontSize: opts.suggestFontSize,
			suggestLineHeight: opts.suggestLineHeight,
			selectionHighlight: opts.selectionHighlight,
			occurrencesHighlight: opts.occurrencesHighlight,
			codeLens: opts.referenceInfos && opts.codeLens,
			folding: opts.folding,
			hideFoldIcons: opts.hideFoldIcons,
			matchBrackets: opts.matchBrackets,
		});

		return new InternalEditorOptions({
			lineHeight: env.fontInfo.lineHeight, // todo -> duplicated in styling
			readOnly: opts.readOnly,
			wordSeparators: opts.wordSeparators,
			autoClosingBrackets: opts.autoClosingBrackets,
			useTabStops: opts.useTabStops,
			tabFocusMode: opts.readOnly ? true : env.tabFocusMode,
			dragAndDrop: opts.dragAndDrop,
			layoutInfo: layoutInfo,
			fontInfo: env.fontInfo,
			viewInfo: viewInfo,
			wrappingInfo: wrappingInfo,
			contribInfo: contribInfo,
		});
	}
}

/**
 * @internal
 */
export interface IEditorLayoutProviderOpts {
	outerWidth: number;
	outerHeight: number;

	showGlyphMargin: boolean;
	lineHeight: number;

	showLineNumbers: boolean;
	lineNumbersMinChars: number;
	lineNumbersDigitCount: number;

	lineDecorationsWidth: number;

	typicalHalfwidthCharacterWidth: number;
	maxDigitWidth: number;

	verticalScrollbarWidth: number;
	verticalScrollbarHasArrows: boolean;
	scrollbarArrowSize: number;
	horizontalScrollbarHeight: number;

	minimap: boolean;
	minimapRenderCharacters: boolean;
	minimapMaxColumn: number;
	pixelRatio: number;
}

/**
 * @internal
 */
export class EditorLayoutProvider {
	public static compute(_opts: IEditorLayoutProviderOpts): EditorLayoutInfo {
		const outerWidth = _opts.outerWidth | 0;
		const outerHeight = _opts.outerHeight | 0;
		const showGlyphMargin = Boolean(_opts.showGlyphMargin);
		const lineHeight = _opts.lineHeight | 0;
		const showLineNumbers = Boolean(_opts.showLineNumbers);
		const lineNumbersMinChars = _opts.lineNumbersMinChars | 0;
		const lineNumbersDigitCount = _opts.lineNumbersDigitCount | 0;
		const lineDecorationsWidth = _opts.lineDecorationsWidth | 0;
		const typicalHalfwidthCharacterWidth = Number(_opts.typicalHalfwidthCharacterWidth);
		const maxDigitWidth = Number(_opts.maxDigitWidth);
		const verticalScrollbarWidth = _opts.verticalScrollbarWidth | 0;
		const verticalScrollbarHasArrows = Boolean(_opts.verticalScrollbarHasArrows);
		const scrollbarArrowSize = _opts.scrollbarArrowSize | 0;
		const horizontalScrollbarHeight = _opts.horizontalScrollbarHeight | 0;
		const minimap = Boolean(_opts.minimap);
		const minimapRenderCharacters = Boolean(_opts.minimapRenderCharacters);
		const minimapMaxColumn = _opts.minimapMaxColumn | 0;
		const pixelRatio = Number(_opts.pixelRatio);

		let lineNumbersWidth = 0;
		if (showLineNumbers) {
			const digitCount = Math.max(lineNumbersDigitCount, lineNumbersMinChars);
			lineNumbersWidth = Math.round(digitCount * maxDigitWidth);
		}

		let glyphMarginWidth = 0;
		if (showGlyphMargin) {
			glyphMarginWidth = lineHeight;
		}

		const glyphMarginLeft = 0;
		const lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
		const decorationsLeft = lineNumbersLeft + lineNumbersWidth;
		const contentLeft = decorationsLeft + lineDecorationsWidth;

		const remainingWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth;

		let renderMinimap: RenderMinimap;
		let minimapWidth: number;
		let contentWidth: number;
		if (!minimap) {
			minimapWidth = 0;
			renderMinimap = RenderMinimap.None;
			contentWidth = remainingWidth;
		} else {
			let minimapCharWidth: number;
			if (pixelRatio >= 2) {
				renderMinimap = minimapRenderCharacters ? RenderMinimap.Large : RenderMinimap.LargeBlocks;
				minimapCharWidth = 2 / pixelRatio;
			} else {
				renderMinimap = minimapRenderCharacters ? RenderMinimap.Small : RenderMinimap.SmallBlocks;
				minimapCharWidth = 1 / pixelRatio;
			}

			// Given:
			// viewportColumn = (contentWidth - verticalScrollbarWidth) / typicalHalfwidthCharacterWidth
			// minimapWidth = viewportColumn * minimapCharWidth
			// contentWidth = remainingWidth - minimapWidth
			// What are good values for contentWidth and minimapWidth ?

			// minimapWidth = ((contentWidth - verticalScrollbarWidth) / typicalHalfwidthCharacterWidth) * minimapCharWidth
			// typicalHalfwidthCharacterWidth * minimapWidth = (contentWidth - verticalScrollbarWidth) * minimapCharWidth
			// typicalHalfwidthCharacterWidth * minimapWidth = (remainingWidth - minimapWidth - verticalScrollbarWidth) * minimapCharWidth
			// (typicalHalfwidthCharacterWidth + minimapCharWidth) * minimapWidth = (remainingWidth - verticalScrollbarWidth) * minimapCharWidth
			// minimapWidth = ((remainingWidth - verticalScrollbarWidth) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)

			minimapWidth = Math.max(0, Math.floor(((remainingWidth - verticalScrollbarWidth) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)));
			let minimapColumns = minimapWidth / minimapCharWidth;
			if (minimapColumns > minimapMaxColumn) {
				minimapWidth = Math.floor(minimapMaxColumn * minimapCharWidth);
			}
			contentWidth = remainingWidth - minimapWidth;
		}

		const viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth) / typicalHalfwidthCharacterWidth));

		const verticalArrowSize = (verticalScrollbarHasArrows ? scrollbarArrowSize : 0);

		return new EditorLayoutInfo({
			width: outerWidth,
			height: outerHeight,

			glyphMarginLeft: glyphMarginLeft,
			glyphMarginWidth: glyphMarginWidth,
			glyphMarginHeight: outerHeight,

			lineNumbersLeft: lineNumbersLeft,
			lineNumbersWidth: lineNumbersWidth,
			lineNumbersHeight: outerHeight,

			decorationsLeft: decorationsLeft,
			decorationsWidth: lineDecorationsWidth,
			decorationsHeight: outerHeight,

			contentLeft: contentLeft,
			contentWidth: contentWidth,
			contentHeight: outerHeight,

			renderMinimap: renderMinimap,
			minimapWidth: minimapWidth,

			viewportColumn: viewportColumn,

			verticalScrollbarWidth: verticalScrollbarWidth,
			horizontalScrollbarHeight: horizontalScrollbarHeight,

			overviewRuler: new OverviewRulerPosition({
				top: verticalArrowSize,
				width: verticalScrollbarWidth,
				height: (outerHeight - 2 * verticalArrowSize),
				right: 0
			})
		});
	}
}

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'Courier New\', monospace, \'Droid Sans Fallback\'';

/**
 * @internal
 */
export const EDITOR_FONT_DEFAULTS = {
	fontFamily: (
		platform.isMacintosh ? DEFAULT_MAC_FONT_FAMILY : (platform.isLinux ? DEFAULT_LINUX_FONT_FAMILY : DEFAULT_WINDOWS_FONT_FAMILY)
	),
	fontWeight: 'normal',
	fontSize: (
		platform.isMacintosh ? 12 : 14
	),
	lineHeight: 0,
};

/**
 * @internal
 */
export const EDITOR_MODEL_DEFAULTS = {
	tabSize: 4,
	insertSpaces: true,
	detectIndentation: true,
	trimAutoWhitespace: true
};

/**
 * @internal
 */
export const EDITOR_DEFAULTS: IValidatedEditorOptions = {
	inDiffEditor: false,
	experimentalScreenReader: true,
	ariaLabel: nls.localize('editorViewAccessibleLabel', "Editor content"),
	rulers: [],
	wordSeparators: USUAL_WORD_SEPARATORS,
	selectionClipboard: true,
	renderLineNumbers: true,
	renderCustomLineNumbers: null,
	renderRelativeLineNumbers: false,
	selectOnLineNumbers: true,
	lineNumbersMinChars: 5,
	glyphMargin: true,
	lineDecorationsWidth: 10,
	revealHorizontalRightPadding: 30,
	roundedSelection: true,
	theme: 'vs',
	readOnly: false,
	scrollbar: {
		vertical: ScrollbarVisibility.Auto,
		horizontal: ScrollbarVisibility.Auto,
		arrowSize: 11,
		useShadows: true,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		horizontalScrollbarSize: 10,
		horizontalSliderSize: 10,
		verticalScrollbarSize: 14,
		verticalSliderSize: 14,
		handleMouseWheel: true
	},
	minimap: {
		enabled: false,
		renderCharacters: true,
		maxColumn: 120
	},
	fixedOverflowWidgets: false,
	overviewRulerLanes: 2,
	overviewRulerBorder: true,
	cursorBlinking: TextEditorCursorBlinkingStyle.Blink,
	mouseWheelZoom: false,
	mouseStyle: 'text',
	cursorStyle: TextEditorCursorStyle.Line,
	fontLigatures: false,
	disableTranslate3d: false,
	disableMonospaceOptimizations: false,
	hideCursorInOverviewRuler: false,
	scrollBeyondLastLine: true,
	automaticLayout: false,
	wordWrap: 'off',
	wordWrapColumn: 80,
	wordWrapMinified: true,
	wrappingIndent: WrappingIndent.Same,
	wordWrapBreakBeforeCharacters: '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋',
	wordWrapBreakAfterCharacters: ' \t})]?|&,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ’”〉》」』】〕）］｝｣',
	wordWrapBreakObtrusiveCharacters: '.',
	stopRenderingLineAfter: 10000,
	hover: true,
	contextmenu: true,
	mouseWheelScrollSensitivity: 1,
	quickSuggestions: { other: true, comments: false, strings: false },
	quickSuggestionsDelay: 10,
	parameterHints: true,
	iconsInSuggestions: true,
	autoClosingBrackets: true,
	formatOnType: false,
	formatOnPaste: false,
	dragAndDrop: false,
	suggestOnTriggerCharacters: true,
	acceptSuggestionOnEnter: true,
	acceptSuggestionOnCommitCharacter: true,
	snippetSuggestions: 'inline',
	emptySelectionClipboard: true,
	wordBasedSuggestions: true,
	suggestFontSize: 0,
	suggestLineHeight: 0,
	selectionHighlight: true,
	occurrencesHighlight: true,
	codeLens: true,
	referenceInfos: true,
	folding: true,
	hideFoldIcons: true,
	matchBrackets: true,
	renderWhitespace: 'none',
	renderControlCharacters: false,
	renderIndentGuides: false,
	renderLineHighlight: 'line',
	useTabStops: true,
};
