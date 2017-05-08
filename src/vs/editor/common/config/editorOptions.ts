/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Constants } from 'vs/editor/common/core/uint';
import { DefaultConfig } from "vs/editor/common/config/defaultConfig";

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
 * @internal
 */
export class InternalEditorOptionsFactory {

	public static createInternalEditorOptions(env: EnvironmentalOptions, opts: IEditorOptions) {

		let stopRenderingLineAfter: number;
		if (typeof opts.stopRenderingLineAfter !== 'undefined') {
			stopRenderingLineAfter = this._toInteger(opts.stopRenderingLineAfter, -1);
		} else {
			stopRenderingLineAfter = 10000;
		}

		const scrollbar = this._sanitizeScrollbarOpts(opts.scrollbar, this._toFloat(opts.mouseWheelScrollSensitivity, 1));
		const minimap = this._sanitizeMinimapOpts(opts.minimap);

		const glyphMargin = this._toBoolean(opts.glyphMargin);
		const lineNumbersMinChars = this._toInteger(opts.lineNumbersMinChars, 1);

		let lineDecorationsWidth: number;
		if (typeof opts.lineDecorationsWidth === 'string' && /^\d+(\.\d+)?ch$/.test(opts.lineDecorationsWidth)) {
			const multiple = parseFloat(opts.lineDecorationsWidth.substr(0, opts.lineDecorationsWidth.length - 2));
			lineDecorationsWidth = multiple * env.fontInfo.typicalHalfwidthCharacterWidth;
		} else {
			lineDecorationsWidth = this._toInteger(opts.lineDecorationsWidth, 0);
		}
		if (opts.folding) {
			lineDecorationsWidth += 16;
		}

		let renderLineNumbers: boolean;
		let renderCustomLineNumbers: (lineNumber: number) => string;
		let renderRelativeLineNumbers: boolean;
		{
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

		const layoutInfo = EditorLayoutProvider.compute({
			outerWidth: env.outerWidth,
			outerHeight: env.outerHeight,
			showGlyphMargin: glyphMargin,
			lineHeight: env.fontInfo.lineHeight,
			showLineNumbers: renderLineNumbers,
			lineNumbersMinChars: lineNumbersMinChars,
			lineNumbersDigitCount: env.lineNumbersDigitCount,
			lineDecorationsWidth: lineDecorationsWidth,
			typicalHalfwidthCharacterWidth: env.fontInfo.typicalHalfwidthCharacterWidth,
			maxDigitWidth: env.fontInfo.maxDigitWidth,
			verticalScrollbarWidth: scrollbar.verticalScrollbarSize,
			horizontalScrollbarHeight: scrollbar.horizontalScrollbarSize,
			scrollbarArrowSize: scrollbar.arrowSize,
			verticalScrollbarHasArrows: scrollbar.verticalHasArrows,
			minimap: minimap.enabled,
			minimapRenderCharacters: minimap.renderCharacters,
			minimapMaxColumn: minimap.maxColumn,
			pixelRatio: env.pixelRatio
		});

		let bareWrappingInfo: { isWordWrapMinified: boolean; isViewportWrapping: boolean; wrappingColumn: number; } = null;
		{
			let wordWrap = opts.wordWrap;
			const wordWrapColumn = this._toInteger(opts.wordWrapColumn, 1);
			const wordWrapMinified = this._toBoolean(opts.wordWrapMinified);

			// Compatibility with old true or false values
			if (<any>wordWrap === true) {
				wordWrap = 'on';
			} else if (<any>wordWrap === false) {
				wordWrap = 'off';
			}

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
			inDiffEditor: Boolean(opts.inDiffEditor),
			isDominatedByLongLines: env.isDominatedByLongLines,
			isWordWrapMinified: bareWrappingInfo.isWordWrapMinified,
			isViewportWrapping: bareWrappingInfo.isViewportWrapping,
			wrappingColumn: bareWrappingInfo.wrappingColumn,
			wrappingIndent: this._wrappingIndentFromString(opts.wrappingIndent),
			wordWrapBreakBeforeCharacters: String(opts.wordWrapBreakBeforeCharacters),
			wordWrapBreakAfterCharacters: String(opts.wordWrapBreakAfterCharacters),
			wordWrapBreakObtrusiveCharacters: String(opts.wordWrapBreakObtrusiveCharacters),
		});

		const readOnly = this._toBoolean(opts.readOnly);

		let renderWhitespace = opts.renderWhitespace;
		// Compatibility with old true or false values
		if (<any>renderWhitespace === true) {
			renderWhitespace = 'boundary';
		} else if (<any>renderWhitespace === false) {
			renderWhitespace = 'none';
		}

		let renderLineHighlight = opts.renderLineHighlight;
		// Compatibility with old true or false values
		if (<any>renderLineHighlight === true) {
			renderLineHighlight = 'line';
		} else if (<any>renderLineHighlight === false) {
			renderLineHighlight = 'none';
		}

		const viewInfo = new InternalEditorViewOptions({
			theme: opts.theme,
			canUseTranslate3d: this._toBoolean(opts.disableTranslate3d) ? false : env.canUseTranslate3d,
			disableMonospaceOptimizations: (this._toBoolean(opts.disableMonospaceOptimizations) || this._toBoolean(opts.fontLigatures)),
			experimentalScreenReader: this._toBoolean(opts.experimentalScreenReader),
			rulers: this._toSortedIntegerArray(opts.rulers),
			ariaLabel: String(opts.ariaLabel),
			renderLineNumbers: renderLineNumbers,
			renderCustomLineNumbers: renderCustomLineNumbers,
			renderRelativeLineNumbers: renderRelativeLineNumbers,
			selectOnLineNumbers: this._toBoolean(opts.selectOnLineNumbers),
			glyphMargin: glyphMargin,
			revealHorizontalRightPadding: this._toInteger(opts.revealHorizontalRightPadding, 0),
			roundedSelection: this._toBoolean(opts.roundedSelection),
			overviewRulerLanes: this._toInteger(opts.overviewRulerLanes, 0, 3),
			overviewRulerBorder: this._toBoolean(opts.overviewRulerBorder),
			cursorBlinking: this._cursorBlinkingStyleFromString(opts.cursorBlinking),
			mouseWheelZoom: this._toBoolean(opts.mouseWheelZoom),
			cursorStyle: this._cursorStyleFromString(opts.cursorStyle),
			hideCursorInOverviewRuler: this._toBoolean(opts.hideCursorInOverviewRuler),
			scrollBeyondLastLine: this._toBoolean(opts.scrollBeyondLastLine),
			editorClassName: env.editorClassName,
			stopRenderingLineAfter: stopRenderingLineAfter,
			renderWhitespace: renderWhitespace,
			renderControlCharacters: this._toBoolean(opts.renderControlCharacters),
			fontLigatures: this._toBoolean(opts.fontLigatures),
			renderIndentGuides: this._toBoolean(opts.renderIndentGuides),
			renderLineHighlight: renderLineHighlight,
			scrollbar: scrollbar,
			minimap: minimap,
			fixedOverflowWidgets: this._toBoolean(opts.fixedOverflowWidgets)
		});

		const contribInfo = new EditorContribOptions({
			selectionClipboard: this._toBoolean(opts.selectionClipboard),
			hover: this._toBoolean(opts.hover),
			contextmenu: this._toBoolean(opts.contextmenu),
			quickSuggestions: typeof opts.quickSuggestions === 'object' ? { other: true, ...opts.quickSuggestions } : this._toBoolean(opts.quickSuggestions),
			quickSuggestionsDelay: this._toInteger(opts.quickSuggestionsDelay),
			parameterHints: this._toBoolean(opts.parameterHints),
			iconsInSuggestions: this._toBoolean(opts.iconsInSuggestions),
			formatOnType: this._toBoolean(opts.formatOnType),
			formatOnPaste: this._toBoolean(opts.formatOnPaste),
			suggestOnTriggerCharacters: this._toBoolean(opts.suggestOnTriggerCharacters),
			acceptSuggestionOnEnter: this._toBoolean(opts.acceptSuggestionOnEnter),
			acceptSuggestionOnCommitCharacter: this._toBoolean(opts.acceptSuggestionOnCommitCharacter),
			snippetSuggestions: opts.snippetSuggestions,
			emptySelectionClipboard: opts.emptySelectionClipboard,
			wordBasedSuggestions: opts.wordBasedSuggestions,
			suggestFontSize: opts.suggestFontSize,
			suggestLineHeight: opts.suggestLineHeight,
			selectionHighlight: this._toBoolean(opts.selectionHighlight),
			occurrencesHighlight: this._toBoolean(opts.occurrencesHighlight),
			codeLens: opts.referenceInfos && opts.codeLens,
			folding: this._toBoolean(opts.folding),
			hideFoldIcons: this._toBoolean(opts.hideFoldIcons),
			matchBrackets: this._toBoolean(opts.matchBrackets),
		});

		return new InternalEditorOptions({
			lineHeight: env.fontInfo.lineHeight, // todo -> duplicated in styling
			readOnly: readOnly,
			wordSeparators: String(opts.wordSeparators),
			autoClosingBrackets: this._toBoolean(opts.autoClosingBrackets),
			useTabStops: this._toBoolean(opts.useTabStops),
			tabFocusMode: readOnly ? true : env.tabFocusMode,
			dragAndDrop: this._toBoolean(opts.dragAndDrop),
			layoutInfo: layoutInfo,
			fontInfo: env.fontInfo,
			viewInfo: viewInfo,
			wrappingInfo: wrappingInfo,
			contribInfo: contribInfo,
		});
	}

	private static _scrollbarVisibilityFromString(visibility: string): ScrollbarVisibility {
		switch (visibility) {
			case 'hidden':
				return ScrollbarVisibility.Hidden;
			case 'visible':
				return ScrollbarVisibility.Visible;
			default:
				return ScrollbarVisibility.Auto;
		}
	}

	private static _sanitizeScrollbarOpts(raw: IEditorScrollbarOptions, mouseWheelScrollSensitivity: number): InternalEditorScrollbarOptions {
		const horizontalScrollbarSize = this._toIntegerWithDefault(raw.horizontalScrollbarSize, 10);
		const verticalScrollbarSize = this._toIntegerWithDefault(raw.verticalScrollbarSize, 14);
		return new InternalEditorScrollbarOptions({
			vertical: this._scrollbarVisibilityFromString(raw.vertical),
			horizontal: this._scrollbarVisibilityFromString(raw.horizontal),

			arrowSize: this._toIntegerWithDefault(raw.arrowSize, 11),
			useShadows: this._toBooleanWithDefault(raw.useShadows, true),

			verticalHasArrows: this._toBooleanWithDefault(raw.verticalHasArrows, false),
			horizontalHasArrows: this._toBooleanWithDefault(raw.horizontalHasArrows, false),

			horizontalScrollbarSize: horizontalScrollbarSize,
			horizontalSliderSize: this._toIntegerWithDefault(raw.horizontalSliderSize, horizontalScrollbarSize),

			verticalScrollbarSize: verticalScrollbarSize,
			verticalSliderSize: this._toIntegerWithDefault(raw.verticalSliderSize, verticalScrollbarSize),

			handleMouseWheel: this._toBooleanWithDefault(raw.handleMouseWheel, true),
			mouseWheelScrollSensitivity: mouseWheelScrollSensitivity
		});
	}

	private static _sanitizeMinimapOpts(raw: IEditorMinimapOptions): InternalEditorMinimapOptions {
		let maxColumn = this._toIntegerWithDefault(raw.maxColumn, DefaultConfig.editor.minimap.maxColumn);
		if (maxColumn < 1) {
			maxColumn = 1;
		}
		return new InternalEditorMinimapOptions({
			enabled: this._toBooleanWithDefault(raw.enabled, DefaultConfig.editor.minimap.enabled),
			renderCharacters: this._toBooleanWithDefault(raw.renderCharacters, DefaultConfig.editor.minimap.renderCharacters),
			maxColumn: maxColumn,
		});
	}

	private static _wrappingIndentFromString(wrappingIndent: string): WrappingIndent {
		if (wrappingIndent === 'indent') {
			return WrappingIndent.Indent;
		} else if (wrappingIndent === 'same') {
			return WrappingIndent.Same;
		} else {
			return WrappingIndent.None;
		}
	}

	private static _cursorStyleFromString(cursorStyle: string): TextEditorCursorStyle {
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

	private static _cursorBlinkingStyleFromString(cursorBlinkingStyle: string): TextEditorCursorBlinkingStyle {
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

	private static _toBoolean(value: any): boolean {
		return value === 'false' ? false : Boolean(value);
	}

	private static _toBooleanWithDefault(value: any, defaultValue: boolean): boolean {
		if (typeof value === 'undefined') {
			return defaultValue;
		}
		return this._toBoolean(value);
	}

	private static _toInteger(source: any, minimum: number = Constants.MIN_SAFE_SMALL_INTEGER, maximum: number = Constants.MAX_SAFE_SMALL_INTEGER): number {
		let r = parseInt(source, 10);
		if (isNaN(r)) {
			r = 0;
		}
		r = Math.max(minimum, r);
		r = Math.min(maximum, r);
		return r | 0;
	}

	private static _toIntegerWithDefault(source: any, defaultValue: number): number {
		if (typeof source === 'undefined') {
			return defaultValue;
		}
		return this._toInteger(source);
	}

	private static _toSortedIntegerArray(source: any): number[] {
		if (!Array.isArray(source)) {
			return [];
		}
		const arrSource = <any[]>source;
		const r = arrSource.map(el => this._toInteger(el));
		r.sort();
		return r;
	}

	private static _toFloat(source: any, defaultValue: number): number {
		let r = parseFloat(source);
		if (isNaN(r)) {
			r = defaultValue;
		}
		return r;
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
