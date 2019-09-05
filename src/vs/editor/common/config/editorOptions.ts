/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as assert from 'vs/base/common/assert';
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Constants } from 'vs/editor/common/core/uint';
import { USUAL_WORD_SEPARATORS } from 'vs/editor/common/model/wordHelper';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { isObject } from 'vs/base/common/types';

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
	 * Defaults to 'auto'.
	 */
	vertical?: 'auto' | 'visible' | 'hidden';
	/**
	 * Render horizontal scrollbar.
	 * Defaults to 'auto'.
	 */
	horizontal?: 'auto' | 'visible' | 'hidden';
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
 * Configuration options for editor find widget
 */
export interface IEditorFindOptions {
	/**
	 * Controls if we seed search string in the Find Widget with editor selection.
	 */
	seedSearchStringFromSelection?: boolean;
	/**
	 * Controls if Find in Selection flag is turned on when multiple lines of text are selected in the editor.
	 */
	autoFindInSelection: boolean;
	/*
	 * Controls whether the Find Widget should add extra lines on top of the editor.
	 */
	addExtraSpaceOnTop?: boolean;
	/**
	 * @internal
	 * Controls if the Find Widget should read or modify the shared find clipboard on macOS
	 */
	globalFindClipboard: boolean;
}

/**
 * Configuration options for auto closing quotes and brackets
 */
export type EditorAutoClosingStrategy = 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';

/**
 * Configuration options for auto wrapping quotes and brackets
 */
export type EditorAutoSurroundStrategy = 'languageDefined' | 'quotes' | 'brackets' | 'never';

/**
 * Configuration options for typing over closing quotes or brackets
 */
export type EditorAutoClosingOvertypeStrategy = 'always' | 'auto' | 'never';

/**
 * Configuration options for editor minimap
 */
export interface IEditorMinimapOptions {
	/**
	 * Enable the rendering of the minimap.
	 * Defaults to true.
	 */
	enabled?: boolean;
	/**
	 * Control the side of the minimap in editor.
	 * Defaults to 'right'.
	 */
	side?: 'right' | 'left';
	/**
	 * Control the rendering of the minimap slider.
	 * Defaults to 'mouseover'.
	 */
	showSlider?: 'always' | 'mouseover';
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

/**
 * Configuration options for editor minimap
 */
export interface IEditorLightbulbOptions {
	/**
	 * Enable the lightbulb code action.
	 * Defaults to true.
	 */
	enabled?: boolean;
}

/**
 * Configuration options for editor hover
 */
export interface IEditorHoverOptions {
	/**
	 * Enable the hover.
	 * Defaults to true.
	 */
	enabled?: boolean;
	/**
	 * Delay for showing the hover.
	 * Defaults to 300.
	 */
	delay?: number;
	/**
	 * Is the hover sticky such that it can be clicked and its contents selected?
	 * Defaults to true.
	 */
	sticky?: boolean;
}

/**
 * Configuration options for parameter hints
 */
export interface IEditorParameterHintOptions {
	/**
	 * Enable parameter hints.
	 * Defaults to true.
	 */
	enabled?: boolean;
	/**
	 * Enable cycling of parameter hints.
	 * Defaults to false.
	 */
	cycle?: boolean;
}

export interface ISuggestOptions {
	/**
	 * Enable graceful matching. Defaults to true.
	 */
	filterGraceful?: boolean;
	/**
	 * Prevent quick suggestions when a snippet is active. Defaults to true.
	 */
	snippetsPreventQuickSuggestions?: boolean;
	/**
	 * Favours words that appear close to the cursor.
	 */
	localityBonus?: boolean;
	/**
	 * Enable using global storage for remembering suggestions.
	 */
	shareSuggestSelections?: boolean;
	/**
	 * Enable or disable icons in suggestions. Defaults to true.
	 */
	showIcons?: boolean;
	/**
	 * Max suggestions to show in suggestions. Defaults to 12.
	 */
	maxVisibleSuggestions?: number;
	/**
	 * Names of suggestion types to filter.
	 */
	filteredTypes?: Record<string, boolean>;
}

export interface IGotoLocationOptions {
	/**
	 * Control how goto-command work when having multiple results.
	 */
	multiple?: 'peek' | 'gotoAndPeek' | 'goto';
}

export interface IQuickSuggestionsOptions {
	other: boolean;
	comments: boolean;
	strings: boolean;
}

/**
 * Configuration options for the editor.
 */
export interface IEditorOptions {
	/**
	 * This editor is used inside a diff editor.
	 */
	inDiffEditor?: boolean;
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
	lineNumbers?: LineNumbersType;
	/**
	 * Controls the minimal number of visible leading and trailing lines surrounding the cursor.
	 * Defaults to 0.
	*/
	cursorSurroundingLines?: number;
	/**
	 * Render last line number when the file ends with a newline.
	 * Defaults to true.
	*/
	renderFinalNewline?: boolean;
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
	 * Class name to be added to the editor.
	 */
	extraEditorClassName?: string;
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
	 * Control the behavior of the find widget.
	 */
	find?: IEditorFindOptions;
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
	cursorBlinking?: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
	/**
	 * Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.
	 * Defaults to false.
	 */
	mouseWheelZoom?: boolean;
	/**
	 * Control the mouse pointer style, either 'text' or 'default' or 'copy'
	 * Defaults to 'text'
	 */
	mouseStyle?: 'text' | 'default' | 'copy';
	/**
	 * Enable smooth caret animation.
	 * Defaults to false.
	 */
	cursorSmoothCaretAnimation?: boolean;
	/**
	 * Control the cursor style, either 'block' or 'line'.
	 * Defaults to 'line'.
	 */
	cursorStyle?: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
	/**
	 * Control the width of the cursor when cursorStyle is set to 'line'
	 */
	cursorWidth?: number;
	/**
	 * Enable font ligatures.
	 * Defaults to false.
	 */
	fontLigatures?: boolean;
	/**
	 * Disable the use of `will-change` for the editor margin and lines layers.
	 * The usage of `will-change` acts as a hint for browsers to create an extra layer.
	 * Defaults to false.
	 */
	disableLayerHinting?: boolean;
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
	 * Enable that scrolling can go beyond the last column by a number of columns.
	 * Defaults to 5.
	 */
	scrollBeyondLastColumn?: number;
	/**
	 * Enable that the editor animates scrolling to a position.
	 * Defaults to false.
	 */
	smoothScrolling?: boolean;
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
	 * Control indentation of wrapped lines. Can be: 'none', 'same', 'indent' or 'deepIndent'.
	 * Defaults to 'same' in vscode and to 'none' in monaco-editor.
	 */
	wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent';
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
	 * Configure the editor's hover.
	 */
	hover?: IEditorHoverOptions;
	/**
	 * Enable detecting links and making them clickable.
	 * Defaults to true.
	 */
	links?: boolean;
	/**
	 * Enable inline color decorators and color picker rendering.
	 */
	colorDecorators?: boolean;
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
	 * FastScrolling mulitplier speed when pressing `Alt`
	 * Defaults to 5.
	 */
	fastScrollSensitivity?: number;
	/**
	 * The modifier to be used to add multiple cursors with the mouse.
	 * Defaults to 'alt'
	 */
	multiCursorModifier?: 'ctrlCmd' | 'alt';
	/**
	 * Merge overlapping selections.
	 * Defaults to true
	 */
	multiCursorMergeOverlapping?: boolean;
	/**
	 * Configure the editor's accessibility support.
	 * Defaults to 'auto'. It is best to leave this to 'auto'.
	 */
	accessibilitySupport?: 'auto' | 'off' | 'on';
	/**
	 * Suggest options.
	 */
	suggest?: ISuggestOptions;
	/**
	 *
	 */
	gotoLocation?: IGotoLocationOptions;
	/**
	 * Enable quick suggestions (shadow suggestions)
	 * Defaults to true.
	 */
	quickSuggestions?: boolean | IQuickSuggestionsOptions;
	/**
	 * Quick suggestions show delay (in ms)
	 * Defaults to 10 (ms)
	 */
	quickSuggestionsDelay?: number;
	/**
	 * Parameter hint options.
	 */
	parameterHints?: IEditorParameterHintOptions;
	/**
	 * Options for auto closing brackets.
	 * Defaults to language defined behavior.
	 */
	autoClosingBrackets?: EditorAutoClosingStrategy;
	/**
	 * Options for auto closing quotes.
	 * Defaults to language defined behavior.
	 */
	autoClosingQuotes?: EditorAutoClosingStrategy;
	/**
	 * Options for typing over closing quotes or brackets.
	 */
	autoClosingOvertype?: EditorAutoClosingOvertypeStrategy;
	/**
	 * Options for auto surrounding.
	 * Defaults to always allowing auto surrounding.
	 */
	autoSurround?: EditorAutoSurroundStrategy;
	/**
	 * Enable auto indentation adjustment.
	 * Defaults to false.
	 */
	autoIndent?: boolean;
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
	 * Defaults to 'on'.
	 */
	acceptSuggestionOnEnter?: 'on' | 'smart' | 'off';
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
	 * Syntax highlighting is copied.
	 */
	copyWithSyntaxHighlighting?: boolean;
	/**
	 * The history mode for suggestions.
	 */
	suggestSelection?: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix';
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
	 * Enable tab completion.
	 */
	tabCompletion?: 'on' | 'off' | 'onlySnippets';
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
	 * Control the behavior and rendering of the code action lightbulb.
	 */
	lightbulb?: IEditorLightbulbOptions;
	/**
	 * Timeout for running code actions on save.
	 */
	codeActionsOnSaveTimeout?: number;
	/**
	 * Enable code folding
	 * Defaults to true.
	 */
	folding?: boolean;
	/**
	 * Selects the folding strategy. 'auto' uses the strategies contributed for the current document, 'indentation' uses the indentation based folding strategy.
	 * Defaults to 'auto'.
	 */
	foldingStrategy?: 'auto' | 'indentation';
	/**
	 * Controls whether the fold actions in the gutter stay always visible or hide unless the mouse is over the gutter.
	 * Defaults to 'mouseover'.
	 */
	showFoldingControls?: 'always' | 'mouseover';
	/**
	 * Enable highlighting of matching brackets.
	 * Defaults to true.
	 */
	matchBrackets?: boolean;
	/**
	 * Enable rendering of whitespace.
	 * Defaults to none.
	 */
	renderWhitespace?: 'none' | 'boundary' | 'selection' | 'all';
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
	 * Enable highlighting of the active indent guide.
	 * Defaults to true.
	 */
	highlightActiveIndentGuide?: boolean;
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
	/**
	 * The letter spacing
	 */
	letterSpacing?: number;
	/**
	 * Controls fading out of unused variables.
	 */
	showUnused?: boolean;

	/**
	 * Do not use, this is a computed option.
	 */
	editorClassName?: undefined;
	/**
	 * Do not use, this is a computed option.
	 */
	tabFocusMode?: undefined;
	/**
	 * Do not use, this is a computed option.
	 */
	layoutInfo?: undefined;
	/**
	 * Do not use, this is a computed option.
	 */
	wrappingInfo?: undefined;
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

export const enum RenderMinimap {
	None = 0,
	Small = 1,
	Large = 2,
	SmallBlocks = 3,
	LargeBlocks = 4,
}

/**
 * Describes how to indent wrapped lines.
 */
export const enum WrappingIndent {
	/**
	 * No indentation => wrapped lines begin at column 1.
	 */
	None = 0,
	/**
	 * Same => wrapped lines get the same indentation as the parent.
	 */
	Same = 1,
	/**
	 * Indent => wrapped lines get +1 indentation toward the parent.
	 */
	Indent = 2,
	/**
	 * DeepIndent => wrapped lines get +2 indentation toward the parent.
	 */
	DeepIndent = 3
}

/**
 * The kind of animation in which the editor's cursor should be rendered.
 */
export const enum TextEditorCursorBlinkingStyle {
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
export function cursorStyleToString(cursorStyle: TextEditorCursorStyle): 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin' {
	switch (cursorStyle) {
		case TextEditorCursorStyle.Line:
			return 'line';
		case TextEditorCursorStyle.Block:
			return 'block';
		case TextEditorCursorStyle.Underline:
			return 'underline';
		case TextEditorCursorStyle.LineThin:
			return 'line-thin';
		case TextEditorCursorStyle.BlockOutline:
			return 'block-outline';
		case TextEditorCursorStyle.UnderlineThin:
			return 'underline-thin';
	}
}

function _cursorStyleFromString(cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin'): TextEditorCursorStyle {
	switch (cursorStyle) {
		case 'line':
			return TextEditorCursorStyle.Line;
		case 'block':
			return TextEditorCursorStyle.Block;
		case 'underline':
			return TextEditorCursorStyle.Underline;
		case 'line-thin':
			return TextEditorCursorStyle.LineThin;
		case 'block-outline':
			return TextEditorCursorStyle.BlockOutline;
		case 'underline-thin':
			return TextEditorCursorStyle.UnderlineThin;
	}
}

/**
 * Internal configuration options (transformed or computed) for the editor.
 */
export class InternalEditorOptions {
	readonly _internalEditorOptionsBrand: void;

	readonly pixelRatio: number;
	readonly lineHeight: number;

	// ---- grouped options
	readonly fontInfo: FontInfo;

	/**
	 * @internal
	 */
	constructor(source: {
		pixelRatio: number;
		lineHeight: number;
		fontInfo: FontInfo;
	}) {
		this.pixelRatio = source.pixelRatio;
		this.lineHeight = source.lineHeight | 0;
		this.fontInfo = source.fontInfo;
	}

	/**
	 * @internal
	 */
	public equals(other: InternalEditorOptions): boolean {
		return (
			this.pixelRatio === other.pixelRatio
			&& this.lineHeight === other.lineHeight
			&& this.fontInfo.equals(other.fontInfo)
		);
	}

	/**
	 * @internal
	 */
	public createChangeEvent(newOpts: InternalEditorOptions, changeEvent: ChangedEditorOptions | null): IConfigurationChangedEvent {
		return {
			hasChanged: (id: EditorOption) => {
				if (!changeEvent) {
					return false;
				}
				return changeEvent.get(id);
			},
			pixelRatio: (this.pixelRatio !== newOpts.pixelRatio),
			lineHeight: (this.lineHeight !== newOpts.lineHeight),
			fontInfo: (!this.fontInfo.equals(newOpts.fontInfo)),
		};
	}
}

/**
 * An event describing that the configuration of the editor has changed.
 */
export interface IConfigurationChangedEvent {
	hasChanged(id: EditorOption): boolean;
	readonly pixelRatio: boolean;
	readonly lineHeight: boolean;
	readonly fontInfo: boolean;
}

export interface IEnvironmentalOptions {
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly fontInfo: FontInfo;
	readonly extraEditorClassName: string;
	readonly isDominatedByLongLines: boolean;
	readonly lineNumbersDigitCount: number;
	readonly emptySelectionClipboard: boolean;
	readonly pixelRatio: number;
	readonly tabFocusMode: boolean;
	readonly accessibilitySupport: AccessibilitySupport;
}

function _boolean(value: any, defaultValue: boolean): boolean {
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

function _stringSet<T>(value: T | undefined, defaultValue: T, allowedValues: T[]): T {
	if (typeof value !== 'string') {
		return defaultValue;
	}
	if (allowedValues.indexOf(value) === -1) {
		return defaultValue;
	}
	return value;
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

function _wrappingIndentFromString(wrappingIndent: 'none' | 'same' | 'indent' | 'deepIndent'): WrappingIndent {
	switch (wrappingIndent) {
		case 'none': return WrappingIndent.None;
		case 'same': return WrappingIndent.Same;
		case 'indent': return WrappingIndent.Indent;
		case 'deepIndent': return WrappingIndent.DeepIndent;
	}
}

function _cursorBlinkingStyleFromString(cursorBlinkingStyle: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'): TextEditorCursorBlinkingStyle {
	switch (cursorBlinkingStyle) {
		case 'blink':
			return TextEditorCursorBlinkingStyle.Blink;
		case 'smooth':
			return TextEditorCursorBlinkingStyle.Smooth;
		case 'phase':
			return TextEditorCursorBlinkingStyle.Phase;
		case 'expand':
			return TextEditorCursorBlinkingStyle.Expand;
		case 'solid':
			return TextEditorCursorBlinkingStyle.Solid;
	}
}

function _scrollbarVisibilityFromString(visibility: string | undefined, defaultValue: ScrollbarVisibility): ScrollbarVisibility {
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
export class InternalEditorOptionsFactory {

	public static createInternalEditorOptions(env: IEnvironmentalOptions) {
		return new InternalEditorOptions({
			pixelRatio: env.pixelRatio,
			lineHeight: env.fontInfo.lineHeight,
			fontInfo: env.fontInfo,
		});
	}
}

/**
 * @internal
 */
export interface IEditorLayoutProviderOpts {
	readonly outerWidth: number;
	readonly outerHeight: number;

	readonly showGlyphMargin: boolean;
	readonly lineHeight: number;

	readonly showLineNumbers: boolean;
	readonly lineNumbersMinChars: number;
	readonly lineNumbersDigitCount: number;

	readonly lineDecorationsWidth: number;

	readonly typicalHalfwidthCharacterWidth: number;
	readonly maxDigitWidth: number;

	readonly verticalScrollbarWidth: number;
	readonly verticalScrollbarHasArrows: boolean;
	readonly scrollbarArrowSize: number;
	readonly horizontalScrollbarHeight: number;

	readonly minimap: boolean;
	readonly minimapSide: string;
	readonly minimapRenderCharacters: boolean;
	readonly minimapMaxColumn: number;
	readonly pixelRatio: number;
}

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'monospace\', monospace, \'Droid Sans Fallback\'';

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
	letterSpacing: 0,
};

/**
 * @internal
 */
export const EDITOR_MODEL_DEFAULTS = {
	tabSize: 4,
	indentSize: 4,
	insertSpaces: true,
	detectIndentation: true,
	trimAutoWhitespace: true,
	largeFileOptimizations: true
};

/**
 * @internal
 */
export interface IRawEditorOptionsBag extends IEditorOptions {
	[key: string]: any;
}

/**
 * @internal
 */
export class RawEditorOptions {
	private readonly _values: any[] = [];
	public _read<T>(id: EditorOption): T | undefined {
		return this._values[id];
	}
	public _write<T>(id: EditorOption, value: T | undefined): void {
		this._values[id] = value;
	}
}

/**
 * @internal
 */
export class ValidatedEditorOptions {
	private readonly _values: any[] = [];
	public _read<T>(option: EditorOption): T {
		return this._values[option];
	}
	public get<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T> {
		return this._values[id];
	}
	public _write<T>(option: EditorOption, value: T): void {
		this._values[option] = value;
	}
}

export interface IComputedEditorOptions {
	get<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T>;
}

/**
 * @internal
 */
export class ComputedEditorOptions implements IComputedEditorOptions {
	private readonly _values: any[] = [];
	public _read<T>(id: EditorOption): T {
		return this._values[id];
	}
	public get<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T> {
		return this._values[id];
	}
	public _write<T>(id: EditorOption, value: T): void {
		this._values[id] = value;
	}
}

/**
 * @internal
 */
export class ChangedEditorOptions {
	private readonly _values: boolean[] = [];
	public get(id: EditorOption): boolean {
		return this._values[id];
	}
	public _write(id: EditorOption, value: boolean): void {
		this._values[id] = value;
	}
}

//#region IEditorOption

/**
 * @internal
 */
type PossibleKeyName0<V> = { [K in keyof IEditorOptions]: IEditorOptions[K] extends V | undefined ? K : never }[keyof IEditorOptions];
/**
 * @internal
 */
type PossibleKeyName<V> = NonNullable<PossibleKeyName0<V>>;

export interface IEditorOption<K1 extends EditorOption, K2 extends keyof IEditorOptions, T2 = NonNullable<IEditorOptions[K2]>, T3 = T2> {
	readonly id: K1;
	readonly name: K2;
	readonly defaultValue: T2;
	/**
	 * @internal
	 */
	read(options: IRawEditorOptionsBag): IEditorOptions[K2] | undefined;
	/**
	 * @internal
	 */
	mix(a: IEditorOptions[K2] | undefined, b: IEditorOptions[K2] | undefined): IEditorOptions[K2] | undefined;
	/**
	 * @internal
	 */
	validate(input: IEditorOptions[K2] | undefined): T2;
	/**
	 * @internal
	 */
	compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: T2): T3;
	/**
	 * @internal
	 */
	equals(a: T3, b: T3): boolean;
}

/**
 * @internal
 */
abstract class BaseEditorOption<K1 extends EditorOption, K2 extends keyof IEditorOptions, T2 = IEditorOptions[K2], T3 = T2> implements IEditorOption<K1, K2, T2, T3> {

	public readonly id: K1;
	public readonly name: K2;
	public readonly defaultValue: T2;

	constructor(id: K1, name: K2, defaultValue: T2, deps: EditorOption[] = []) {
		this.id = id;
		this.name = name;
		this.defaultValue = defaultValue;
		for (const dep of deps) {
			assert.ok(dep < id);
		}
	}
	public read(options: IRawEditorOptionsBag): IEditorOptions[K2] | undefined {
		return options[<any>this.name];
	}
	public mix(a: IEditorOptions[K2] | undefined, b: IEditorOptions[K2] | undefined): IEditorOptions[K2] | undefined {
		switch (typeof b) {
			case 'bigint': return b;
			case 'boolean': return b;
			case 'function': return b;
			case 'number': return b;
			case 'object': return (Array.isArray(b) || typeof a !== 'object' ? b : objects.mixin(objects.mixin({}, a), b));
			case 'string': return b;
			default:
				return a;
		}
	}
	public abstract validate(input: IEditorOptions[K2] | undefined): T2;
	public abstract compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: T2): T3;
	public equals(a: T3, b: T3): boolean {
		return (a === b);
	}
}

class EditorBooleanOption<K1 extends EditorOption, K2 extends PossibleKeyName<boolean>> extends BaseEditorOption<K1, K2, boolean> {
	public validate(input: boolean | undefined): boolean {
		return _boolean(input, this.defaultValue);
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: boolean): boolean {
		return value;
	}
}

class EditorIntOption<K1 extends EditorOption, K2 extends PossibleKeyName<number>> extends BaseEditorOption<K1, K2, number> {
	public readonly minimum: number;
	public readonly maximum: number;
	constructor(id: K1, name: K2, defaultValue: number, minimum: number, maximum: number, deps: EditorOption[] = []) {
		super(id, name, defaultValue, deps);
		this.minimum = minimum;
		this.maximum = maximum;
	}
	public validate(input: number | undefined): number {
		return _clampedInt(input, this.defaultValue, this.minimum, this.maximum);
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: number): number {
		return value;
	}
}

class EditorFloatOption<K1 extends EditorOption, K2 extends PossibleKeyName<number>> extends BaseEditorOption<K1, K2, number> {
	public readonly validationFn: (value: number) => number;
	constructor(id: K1, name: K2, defaultValue: number, validationFn: (value: number) => number, deps: EditorOption[] = []) {
		super(id, name, defaultValue, deps);
		this.validationFn = validationFn;
	}
	public validate(input: number | undefined): number {
		return this.validationFn(_float(input, this.defaultValue));
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: number): number {
		return value;
	}
}

class EditorStringOption<K1 extends EditorOption, K2 extends PossibleKeyName<string>> extends BaseEditorOption<K1, K2, string> {
	public validate(input: string | undefined): string {
		return _string(input, this.defaultValue);
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: string): string {
		return value;
	}
}

class EditorEnumOption<K1 extends EditorOption, K2 extends PossibleKeyName<T1>, T1 extends string, T2 = T1> extends BaseEditorOption<K1, K2, T1, T2> {
	public readonly allowedValues: T1[];
	public readonly convert: (value: T1) => T2;
	constructor(id: K1, name: K2, defaultValue: T1, allowedValues: T1[], convert: (value: T1) => T2, deps: EditorOption[] = []) {
		super(id, name, defaultValue, deps);
		this.allowedValues = allowedValues;
		this.convert = convert;
	}
	public validate(input: IEditorOptions[K2] | undefined): T1 {
		return _stringSet<T1>(<any>input, this.defaultValue, this.allowedValues);
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: T1): T2 {
		return this.convert(value);
	}
}

class EditorPassthroughOption<K1 extends EditorOption, K2 extends keyof IEditorOptions> extends BaseEditorOption<K1, K2> {
	public validate(input: IEditorOptions[K2] | undefined): IEditorOptions[K2] {
		if (typeof input === 'undefined') {
			return this.defaultValue;
		}
		return input;
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: IEditorOptions[K2]): IEditorOptions[K2] {
		return value;
	}
}
//#endregion

//#region renderLineNumbers

export type LineNumbersType = 'on' | 'off' | 'relative' | 'interval' | ((lineNumber: number) => string);

export const enum RenderLineNumbersType {
	Off = 0,
	On = 1,
	Relative = 2,
	Interval = 3,
	Custom = 4
}

export interface InternalEditorRenderLineNumbersOptions {
	readonly renderType: RenderLineNumbersType;
	readonly renderFn: ((lineNumber: number) => string) | null;
}

class EditorRenderLineNumbersOption<K1 extends EditorOption, K2 extends PossibleKeyName<LineNumbersType>> extends BaseEditorOption<K1, K2, InternalEditorRenderLineNumbersOptions, InternalEditorRenderLineNumbersOptions> {
	public validate(lineNumbers: LineNumbersType | undefined): InternalEditorRenderLineNumbersOptions {
		let renderType: RenderLineNumbersType = this.defaultValue.renderType;
		let renderFn: ((lineNumber: number) => string) | null = this.defaultValue.renderFn;

		if (typeof lineNumbers !== 'undefined') {
			if (typeof lineNumbers === 'function') {
				renderType = RenderLineNumbersType.Custom;
				renderFn = lineNumbers;
			} else if (lineNumbers === 'interval') {
				renderType = RenderLineNumbersType.Interval;
			} else if (lineNumbers === 'relative') {
				renderType = RenderLineNumbersType.Relative;
			} else if (lineNumbers === 'on') {
				renderType = RenderLineNumbersType.On;
			} else {
				renderType = RenderLineNumbersType.Off;
			}
		}

		return {
			renderType,
			renderFn
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: InternalEditorRenderLineNumbersOptions): InternalEditorRenderLineNumbersOptions {
		return value;
	}
	public equals(a: InternalEditorRenderLineNumbersOptions, b: InternalEditorRenderLineNumbersOptions): boolean {
		return (
			a.renderType === b.renderType
			&& a.renderFn === b.renderFn
		);
	}
}

//#endregion

//#region minimap

export interface InternalEditorMinimapOptions {
	readonly enabled: boolean;
	readonly side: 'right' | 'left';
	readonly showSlider: 'always' | 'mouseover';
	readonly renderCharacters: boolean;
	readonly maxColumn: number;
}

class EditorMinimap<K1 extends EditorOption, K2 extends PossibleKeyName<IEditorMinimapOptions>> extends BaseEditorOption<K1, K2, InternalEditorMinimapOptions, InternalEditorMinimapOptions> {
	public validate(input: IEditorMinimapOptions | undefined): InternalEditorMinimapOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			enabled: _boolean(input.enabled, this.defaultValue.enabled),
			side: _stringSet<'right' | 'left'>(input.side, this.defaultValue.side, ['right', 'left']),
			showSlider: _stringSet<'always' | 'mouseover'>(input.showSlider, this.defaultValue.showSlider, ['always', 'mouseover']),
			renderCharacters: _boolean(input.renderCharacters, this.defaultValue.renderCharacters),
			maxColumn: _clampedInt(input.maxColumn, this.defaultValue.maxColumn, 1, 10000),
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: InternalEditorMinimapOptions): InternalEditorMinimapOptions {
		return value;
	}
	public equals(a: InternalEditorMinimapOptions, b: InternalEditorMinimapOptions): boolean {
		return (
			a.enabled === b.enabled
			&& a.side === b.side
			&& a.showSlider === b.showSlider
			&& a.renderCharacters === b.renderCharacters
			&& a.maxColumn === b.maxColumn
		);
	}
}

//#endregion

//#region hover

export interface InternalEditorHoverOptions {
	readonly enabled: boolean;
	readonly delay: number;
	readonly sticky: boolean;
}

class EditorHover<K1 extends EditorOption, K2 extends PossibleKeyName<IEditorHoverOptions>> extends BaseEditorOption<K1, K2, InternalEditorHoverOptions> {
	public validate(input: IEditorHoverOptions | undefined): InternalEditorHoverOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			enabled: _boolean(input.enabled, this.defaultValue.enabled),
			delay: _clampedInt(input.delay, this.defaultValue.delay, 0, 10000),
			sticky: _boolean(input.sticky, this.defaultValue.sticky)
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: InternalEditorHoverOptions): InternalEditorHoverOptions {
		return value;
	}
	public equals(a: InternalEditorHoverOptions, b: InternalEditorHoverOptions): boolean {
		return (
			a.enabled === b.enabled
			&& a.delay === b.delay
			&& a.sticky === b.sticky
		);
	}
}

//#endregion

//#region quickSuggestions

export type ValidQuickSuggestionsOptions = boolean | Readonly<Required<IQuickSuggestionsOptions>>;

class EditorQuickSuggestions<K1 extends EditorOption, K2 extends PossibleKeyName<boolean | IQuickSuggestionsOptions>> extends BaseEditorOption<K1, K2, ValidQuickSuggestionsOptions> {
	public readonly defaultValue: Readonly<Required<IQuickSuggestionsOptions>>;
	constructor(id: K1, name: K2, defaultValue: Readonly<Required<IQuickSuggestionsOptions>>) {
		super(id, name, defaultValue);
	}
	public validate(input: boolean | IQuickSuggestionsOptions | undefined): ValidQuickSuggestionsOptions {
		if (typeof input === 'boolean') {
			return input;
		}
		if (typeof input === 'object') {
			return {
				other: _boolean(input.other, this.defaultValue.other),
				comments: _boolean(input.comments, this.defaultValue.comments),
				strings: _boolean(input.strings, this.defaultValue.strings),
			};
		}
		return this.defaultValue;
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: ValidQuickSuggestionsOptions): ValidQuickSuggestionsOptions {
		return value;
	}
	public equals(a: ValidQuickSuggestionsOptions, b: ValidQuickSuggestionsOptions): boolean {
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

//#endregion

//#region accessibilitySupport

class EditorAccessibilitySupportOption<K1 extends EditorOption, K2 extends PossibleKeyName<'auto' | 'off' | 'on'>> extends BaseEditorOption<K1, K2, 'auto' | 'off' | 'on', AccessibilitySupport> {
	public validate(input: 'auto' | 'off' | 'on' | undefined): 'auto' | 'off' | 'on' {
		return _stringSet<'auto' | 'off' | 'on'>(input, this.defaultValue, ['auto', 'off', 'on']);
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: 'auto' | 'off' | 'on'): AccessibilitySupport {
		if (value === 'auto') {
			// The editor reads the `accessibilitySupport` from the environment
			return env.accessibilitySupport;
		} else if (value === 'on') {
			return AccessibilitySupport.Enabled;
		} else {
			return AccessibilitySupport.Disabled;
		}
	}
}

//#endregion

//#region rulers

class EditorRulers<K1 extends EditorOption, K2 extends PossibleKeyName<number[]>> extends BaseEditorOption<K1, K2, number[]> {
	public validate(input: number[] | undefined): number[] {
		if (Array.isArray(input)) {
			let rulers: number[] = [];
			for (let value of input) {
				rulers.push(_clampedInt(value, 0, 0, 10000));
			}
			rulers.sort();
			return rulers;
		}
		return this.defaultValue;
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: number[]): number[] {
		return value;
	}
	public equals(a: number[], b: number[]): boolean {
		return arrays.equals(a, b);
	}
}

//#endregion

//#region ariaLabel

class EditorAriaLabel<K1 extends EditorOption, K2 extends PossibleKeyName<string>> extends BaseEditorOption<K1, K2, string> {
	public validate(input: string | undefined): string {
		return _string(input, this.defaultValue);
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: string): string {
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		if (accessibilitySupport === AccessibilitySupport.Disabled) {
			return nls.localize('accessibilityOffAriaLabel', "The editor is not accessible at this time. Press Alt+F1 for options.");
		}
		return value;
	}
}

//#endregion

//#region disableMonospaceOptimizations

class EditorDisableMonospaceOptimizations<K1 extends EditorOption, K2 extends PossibleKeyName<boolean>> extends BaseEditorOption<K1, K2, boolean> {
	public validate(input: boolean | undefined): boolean {
		return _boolean(input, this.defaultValue);
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: boolean): boolean {
		return (value || options.get(EditorOption.folding));
	}
}

//#endregion

//#region editorClassName

class EditorClassName<K1 extends EditorOption, K2 extends PossibleKeyName<undefined>> extends BaseEditorOption<K1, K2, undefined, string> {
	public validate(input: undefined): undefined {
		return undefined;
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: undefined): string {
		let className = 'monaco-editor';
		if (options.get(EditorOption.extraEditorClassName)) {
			className += ' ' + options.get(EditorOption.extraEditorClassName);
		}
		if (env.extraEditorClassName) {
			className += ' ' + env.extraEditorClassName;
		}
		if (options.get(EditorOption.fontLigatures)) {
			className += ' enable-ligatures';
		}
		if (options.get(EditorOption.mouseStyle) === 'default') {
			className += ' mouse-default';
		} else if (options.get(EditorOption.mouseStyle) === 'copy') {
			className += ' mouse-copy';
		}
		return className;
	}
}

//#endregion

//#region tabFocusMode

class EditorTabFocusMode<K1 extends EditorOption, K2 extends PossibleKeyName<undefined>> extends BaseEditorOption<K1, K2, undefined, boolean> {
	public validate(input: undefined): undefined {
		return undefined;
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: undefined): boolean {
		const readOnly = options.get(EditorOption.readOnly);
		return (readOnly ? true : env.tabFocusMode);
	}
}

//#endregion

//#region emptySelectionClipboard

class EditorEmptySelectionClipboard<K1 extends EditorOption, K2 extends PossibleKeyName<boolean>> extends EditorBooleanOption<K1, K2> {
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: boolean): boolean {
		return value && env.emptySelectionClipboard;
	}
}

//#endregion

//#region lightbulb

export type ValidEditorLightbulbOptions = Required<IEditorLightbulbOptions>;

class EditorLightbulb<K1 extends EditorOption, K2 extends PossibleKeyName<IEditorLightbulbOptions>> extends BaseEditorOption<K1, K2, ValidEditorLightbulbOptions> {
	public validate(input: IEditorLightbulbOptions | undefined): ValidEditorLightbulbOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			enabled: _boolean(input.enabled, this.defaultValue.enabled)
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: ValidEditorLightbulbOptions): ValidEditorLightbulbOptions {
		return value;
	}
	public equals(a: ValidEditorLightbulbOptions, b: ValidEditorLightbulbOptions): boolean {
		return (
			a.enabled === b.enabled
		);
	}
}

//#endregion

//#region scrollbar

export interface InternalEditorScrollbarOptions {
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
}

class EditorScrollbar<K1 extends EditorOption, K2 extends PossibleKeyName<IEditorScrollbarOptions>> extends BaseEditorOption<K1, K2, InternalEditorScrollbarOptions, InternalEditorScrollbarOptions> {
	public validate(input: IEditorScrollbarOptions | undefined): InternalEditorScrollbarOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		const horizontalScrollbarSize = _clampedInt(input.horizontalScrollbarSize, this.defaultValue.horizontalScrollbarSize, 0, 1000);
		const verticalScrollbarSize = _clampedInt(input.verticalScrollbarSize, this.defaultValue.verticalScrollbarSize, 0, 1000);
		return {
			arrowSize: _clampedInt(input.arrowSize, this.defaultValue.arrowSize, 0, 1000),
			vertical: _scrollbarVisibilityFromString(input.vertical, this.defaultValue.vertical),
			horizontal: _scrollbarVisibilityFromString(input.horizontal, this.defaultValue.horizontal),
			useShadows: _boolean(input.useShadows, this.defaultValue.useShadows),
			verticalHasArrows: _boolean(input.verticalHasArrows, this.defaultValue.verticalHasArrows),
			horizontalHasArrows: _boolean(input.horizontalHasArrows, this.defaultValue.horizontalHasArrows),
			handleMouseWheel: _boolean(input.handleMouseWheel, this.defaultValue.handleMouseWheel),
			horizontalScrollbarSize: horizontalScrollbarSize,
			horizontalSliderSize: _clampedInt(input.horizontalSliderSize, horizontalScrollbarSize, 0, 1000),
			verticalScrollbarSize: verticalScrollbarSize,
			verticalSliderSize: _clampedInt(input.verticalSliderSize, verticalScrollbarSize, 0, 1000),
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: InternalEditorScrollbarOptions): InternalEditorScrollbarOptions {
		return value;
	}
	public equals(a: InternalEditorScrollbarOptions, b: InternalEditorScrollbarOptions): boolean {
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
		);
	}
}

//#endregion

//#region suggest

export type ValidSuggestOptions = Readonly<Required<ISuggestOptions>>;

export interface InternalSuggestOptions {
	readonly filterGraceful: boolean;
	readonly snippets: 'top' | 'bottom' | 'inline' | 'none';
	readonly snippetsPreventQuickSuggestions: boolean;
	readonly localityBonus: boolean;
	readonly shareSuggestSelections: boolean;
	readonly showIcons: boolean;
	readonly maxVisibleSuggestions: number;
	readonly filteredTypes: Record<string, boolean>;
}

class EditorSuggest<K1 extends EditorOption, K2 extends PossibleKeyName<ISuggestOptions>> extends BaseEditorOption<K1, K2, ValidSuggestOptions, InternalSuggestOptions> {
	public validate(input: ISuggestOptions | undefined): ValidSuggestOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			filterGraceful: _boolean(input.filterGraceful, this.defaultValue.filterGraceful),
			snippetsPreventQuickSuggestions: _boolean(input.snippetsPreventQuickSuggestions, this.defaultValue.filterGraceful),
			localityBonus: _boolean(input.localityBonus, this.defaultValue.localityBonus),
			shareSuggestSelections: _boolean(input.shareSuggestSelections, this.defaultValue.shareSuggestSelections),
			showIcons: _boolean(input.showIcons, this.defaultValue.showIcons),
			maxVisibleSuggestions: _clampedInt(input.maxVisibleSuggestions, this.defaultValue.maxVisibleSuggestions, 1, 15),
			filteredTypes: isObject(input.filteredTypes) ? input.filteredTypes : Object.create(null)
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: ValidSuggestOptions): InternalSuggestOptions {
		const snippetSuggestions = options.get(EditorOption.snippetSuggestions);
		return {
			filterGraceful: value.filterGraceful,
			snippets: snippetSuggestions,
			snippetsPreventQuickSuggestions: value.snippetsPreventQuickSuggestions,
			localityBonus: value.localityBonus,
			shareSuggestSelections: value.shareSuggestSelections,
			showIcons: value.showIcons,
			maxVisibleSuggestions: value.maxVisibleSuggestions,
			filteredTypes: value.filteredTypes,
		};
	}
	public equals(a: InternalSuggestOptions, b: InternalSuggestOptions): boolean {
		return (
			a.filterGraceful === b.filterGraceful
			&& a.snippets === b.snippets
			&& a.snippetsPreventQuickSuggestions === b.snippetsPreventQuickSuggestions
			&& a.localityBonus === b.localityBonus
			&& a.shareSuggestSelections === b.shareSuggestSelections
			&& a.showIcons === b.showIcons
			&& a.maxVisibleSuggestions === b.maxVisibleSuggestions
			&& objects.equals(a.filteredTypes, b.filteredTypes)
		);
	}
}

//#endregion

//#region parameterHints

export interface InternalParameterHintOptions {
	readonly enabled: boolean;
	readonly cycle: boolean;
}

class EditorParameterHints<K1 extends EditorOption, K2 extends PossibleKeyName<IEditorParameterHintOptions>> extends BaseEditorOption<K1, K2, InternalParameterHintOptions> {
	public validate(input: IEditorParameterHintOptions | undefined): InternalParameterHintOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			enabled: _boolean(input.enabled, this.defaultValue.enabled),
			cycle: _boolean(input.cycle, this.defaultValue.cycle)
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: InternalParameterHintOptions): InternalParameterHintOptions {
		return value;
	}
	public equals(a: InternalParameterHintOptions, b: InternalParameterHintOptions): boolean {
		return (
			a.enabled === b.enabled
			&& a.cycle === b.cycle
		);
	}
}

//#endregion

//#region find

export interface InternalEditorFindOptions {
	readonly seedSearchStringFromSelection: boolean;
	readonly autoFindInSelection: boolean;
	readonly addExtraSpaceOnTop: boolean;
	/**
	 * @internal
	 */
	readonly globalFindClipboard: boolean;
}

class EditorFind<K1 extends EditorOption, K2 extends PossibleKeyName<IEditorFindOptions>> extends BaseEditorOption<K1, K2, InternalEditorFindOptions> {
	public validate(input: IEditorFindOptions | undefined): InternalEditorFindOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			seedSearchStringFromSelection: _boolean(input.seedSearchStringFromSelection, this.defaultValue.seedSearchStringFromSelection),
			autoFindInSelection: _boolean(input.autoFindInSelection, this.defaultValue.autoFindInSelection),
			globalFindClipboard: _boolean(input.globalFindClipboard, this.defaultValue.globalFindClipboard),
			addExtraSpaceOnTop: _boolean(input.addExtraSpaceOnTop, this.defaultValue.addExtraSpaceOnTop)
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: InternalEditorFindOptions): InternalEditorFindOptions {
		return value;
	}
	public equals(a: InternalEditorFindOptions, b: InternalEditorFindOptions): boolean {
		return (
			a.seedSearchStringFromSelection === b.seedSearchStringFromSelection
			&& a.autoFindInSelection === b.autoFindInSelection
			&& a.globalFindClipboard === b.globalFindClipboard
			&& a.addExtraSpaceOnTop === b.addExtraSpaceOnTop
		);
	}
}

//#endregion

//#region gotoLocation

export interface InternalGoToLocationOptions {
	readonly multiple: 'peek' | 'gotoAndPeek' | 'goto';
}

class EditorGoToLocation<K1 extends EditorOption, K2 extends PossibleKeyName<IGotoLocationOptions>> extends BaseEditorOption<K1, K2, InternalGoToLocationOptions> {
	public validate(input: IGotoLocationOptions | undefined): InternalGoToLocationOptions {
		if (typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			multiple: _stringSet<'peek' | 'gotoAndPeek' | 'goto'>(input.multiple, this.defaultValue.multiple, ['peek', 'gotoAndPeek', 'goto'])
		};
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: InternalGoToLocationOptions): InternalGoToLocationOptions {
		return value;
	}
	public equals(a: InternalGoToLocationOptions, b: InternalGoToLocationOptions): boolean {
		return (
			a.multiple === b.multiple
		);
	}
}

//#endregion

//#region layoutInfo

/**
 * A description for the overview ruler position.
 */
export interface OverviewRulerPosition {
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
}

/**
 * The internal layout details of the editor.
 */
export interface EditorLayoutInfo {

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
	 * The position for the minimap
	 */
	readonly minimapLeft: number;
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
}

/**
 * @internal
 */
export class EditorLayoutInfoComputer<K1 extends EditorOption, K2 extends PossibleKeyName<undefined>> extends BaseEditorOption<K1, K2, undefined, EditorLayoutInfo> {
	public validate(input: undefined): undefined {
		return undefined;
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: undefined): EditorLayoutInfo {
		const glyphMargin = options.get(EditorOption.glyphMargin);
		const lineNumbersMinChars = options.get(EditorOption.lineNumbersMinChars);
		const rawLineDecorationsWidth = options.get(EditorOption.lineDecorationsWidth);
		const folding = options.get(EditorOption.folding);
		const minimap = options.get(EditorOption.minimap);
		const scrollbar = options.get(EditorOption.scrollbar);
		const lineNumbers = options.get(EditorOption.lineNumbers);

		let lineDecorationsWidth: number;
		if (typeof rawLineDecorationsWidth === 'string' && /^\d+(\.\d+)?ch$/.test(rawLineDecorationsWidth)) {
			const multiple = parseFloat(rawLineDecorationsWidth.substr(0, rawLineDecorationsWidth.length - 2));
			lineDecorationsWidth = multiple * env.fontInfo.typicalHalfwidthCharacterWidth;
		} else {
			lineDecorationsWidth = _clampedInt(rawLineDecorationsWidth, 0, 0, 1000);
		}
		if (folding) {
			lineDecorationsWidth += 16;
		}

		return EditorLayoutInfoComputer.compute({
			outerWidth: env.outerWidth,
			outerHeight: env.outerHeight,
			showGlyphMargin: glyphMargin,
			lineHeight: env.fontInfo.lineHeight,
			showLineNumbers: (lineNumbers.renderType !== RenderLineNumbersType.Off),
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
			minimapSide: minimap.side,
			minimapRenderCharacters: minimap.renderCharacters,
			minimapMaxColumn: minimap.maxColumn,
			pixelRatio: env.pixelRatio
		});
	}
	public equals(a: EditorLayoutInfo, b: EditorLayoutInfo): boolean {
		return (
			a.width === b.width
			&& a.height === b.height
			&& a.glyphMarginLeft === b.glyphMarginLeft
			&& a.glyphMarginWidth === b.glyphMarginWidth
			&& a.glyphMarginHeight === b.glyphMarginHeight
			&& a.lineNumbersLeft === b.lineNumbersLeft
			&& a.lineNumbersWidth === b.lineNumbersWidth
			&& a.lineNumbersHeight === b.lineNumbersHeight
			&& a.decorationsLeft === b.decorationsLeft
			&& a.decorationsWidth === b.decorationsWidth
			&& a.decorationsHeight === b.decorationsHeight
			&& a.contentLeft === b.contentLeft
			&& a.contentWidth === b.contentWidth
			&& a.contentHeight === b.contentHeight
			&& a.renderMinimap === b.renderMinimap
			&& a.minimapLeft === b.minimapLeft
			&& a.minimapWidth === b.minimapWidth
			&& a.viewportColumn === b.viewportColumn
			&& a.verticalScrollbarWidth === b.verticalScrollbarWidth
			&& a.horizontalScrollbarHeight === b.horizontalScrollbarHeight
			&& EditorLayoutInfoComputer._equalsOverviewRuler(a.overviewRuler, b.overviewRuler)
		);
	}

	private static _equalsOverviewRuler(a: OverviewRulerPosition, b: OverviewRulerPosition): boolean {
		return (
			a.width === b.width
			&& a.height === b.height
			&& a.top === b.top
			&& a.right === b.right
		);
	}

	public static compute(_opts: IEditorLayoutProviderOpts): EditorLayoutInfo {
		const outerWidth = _opts.outerWidth | 0;
		const outerHeight = _opts.outerHeight | 0;
		const showGlyphMargin = _opts.showGlyphMargin;
		const lineHeight = _opts.lineHeight | 0;
		const showLineNumbers = _opts.showLineNumbers;
		const lineNumbersMinChars = _opts.lineNumbersMinChars | 0;
		const lineNumbersDigitCount = _opts.lineNumbersDigitCount | 0;
		const lineDecorationsWidth = _opts.lineDecorationsWidth | 0;
		const typicalHalfwidthCharacterWidth = _opts.typicalHalfwidthCharacterWidth;
		const maxDigitWidth = _opts.maxDigitWidth;
		const verticalScrollbarWidth = _opts.verticalScrollbarWidth | 0;
		const verticalScrollbarHasArrows = _opts.verticalScrollbarHasArrows;
		const scrollbarArrowSize = _opts.scrollbarArrowSize | 0;
		const horizontalScrollbarHeight = _opts.horizontalScrollbarHeight | 0;
		const minimap = _opts.minimap;
		const minimapSide = _opts.minimapSide;
		const minimapRenderCharacters = _opts.minimapRenderCharacters;
		const minimapMaxColumn = _opts.minimapMaxColumn | 0;
		const pixelRatio = _opts.pixelRatio;

		let lineNumbersWidth = 0;
		if (showLineNumbers) {
			const digitCount = Math.max(lineNumbersDigitCount, lineNumbersMinChars);
			lineNumbersWidth = Math.round(digitCount * maxDigitWidth);
		}

		let glyphMarginWidth = 0;
		if (showGlyphMargin) {
			glyphMarginWidth = lineHeight;
		}

		let glyphMarginLeft = 0;
		let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
		let decorationsLeft = lineNumbersLeft + lineNumbersWidth;
		let contentLeft = decorationsLeft + lineDecorationsWidth;

		const remainingWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth;

		let renderMinimap: RenderMinimap;
		let minimapLeft: number;
		let minimapWidth: number;
		let contentWidth: number;
		if (!minimap) {
			minimapLeft = 0;
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
			// (leaving 2px for the cursor to have space after the last character)
			// viewportColumn = (contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth
			// minimapWidth = viewportColumn * minimapCharWidth
			// contentWidth = remainingWidth - minimapWidth
			// What are good values for contentWidth and minimapWidth ?

			// minimapWidth = ((contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth) * minimapCharWidth
			// typicalHalfwidthCharacterWidth * minimapWidth = (contentWidth - verticalScrollbarWidth - 2) * minimapCharWidth
			// typicalHalfwidthCharacterWidth * minimapWidth = (remainingWidth - minimapWidth - verticalScrollbarWidth - 2) * minimapCharWidth
			// (typicalHalfwidthCharacterWidth + minimapCharWidth) * minimapWidth = (remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth
			// minimapWidth = ((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)

			minimapWidth = Math.max(0, Math.floor(((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)));
			let minimapColumns = minimapWidth / minimapCharWidth;
			if (minimapColumns > minimapMaxColumn) {
				minimapWidth = Math.floor(minimapMaxColumn * minimapCharWidth);
			}
			contentWidth = remainingWidth - minimapWidth;

			if (minimapSide === 'left') {
				minimapLeft = 0;
				glyphMarginLeft += minimapWidth;
				lineNumbersLeft += minimapWidth;
				decorationsLeft += minimapWidth;
				contentLeft += minimapWidth;
			} else {
				minimapLeft = outerWidth - minimapWidth - verticalScrollbarWidth;
			}
		}

		// (leaving 2px for the cursor to have space after the last character)
		const viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth));

		const verticalArrowSize = (verticalScrollbarHasArrows ? scrollbarArrowSize : 0);

		return {
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
			minimapLeft: minimapLeft,
			minimapWidth: minimapWidth,

			viewportColumn: viewportColumn,

			verticalScrollbarWidth: verticalScrollbarWidth,
			horizontalScrollbarHeight: horizontalScrollbarHeight,

			overviewRuler: {
				top: verticalArrowSize,
				width: verticalScrollbarWidth,
				height: (outerHeight - 2 * verticalArrowSize),
				right: 0
			}
		};
	}
}

//#endregion

//#region wrappingInfo

export interface EditorWrappingInfo {
	readonly isDominatedByLongLines: boolean;
	readonly isWordWrapMinified: boolean;
	readonly isViewportWrapping: boolean;
	readonly wrappingColumn: number;
}

class EditorWrappingInfoComputer<K1 extends EditorOption, K2 extends PossibleKeyName<undefined>> extends BaseEditorOption<K1, K2, undefined, EditorWrappingInfo> {
	public mix(a: undefined, b: undefined): undefined {
		return undefined;
	}
	public validate(input: undefined): undefined {
		return undefined;
	}
	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: undefined): EditorWrappingInfo {
		const wordWrap = options.get(EditorOption.wordWrap);
		const wordWrapColumn = options.get(EditorOption.wordWrapColumn);
		const wordWrapMinified = options.get(EditorOption.wordWrapMinified);
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);

		let bareWrappingInfo: { isWordWrapMinified: boolean; isViewportWrapping: boolean; wrappingColumn: number; } | null = null;
		{
			if (accessibilitySupport === AccessibilitySupport.Enabled) {
				// See https://github.com/Microsoft/vscode/issues/27766
				// Never enable wrapping when a screen reader is attached
				// because arrow down etc. will not move the cursor in the way
				// a screen reader expects.
				bareWrappingInfo = {
					isWordWrapMinified: false,
					isViewportWrapping: false,
					wrappingColumn: -1
				};
			} else if (wordWrapMinified && env.isDominatedByLongLines) {
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

		return {
			isDominatedByLongLines: env.isDominatedByLongLines,
			isWordWrapMinified: bareWrappingInfo.isWordWrapMinified,
			isViewportWrapping: bareWrappingInfo.isViewportWrapping,
			wrappingColumn: bareWrappingInfo.wrappingColumn,
		};
	}
	public equals(a: EditorWrappingInfo, b: EditorWrappingInfo): boolean {
		return (
			a.isDominatedByLongLines === b.isDominatedByLongLines
			&& a.isWordWrapMinified === b.isWordWrapMinified
			&& a.isViewportWrapping === b.isViewportWrapping
			&& a.wrappingColumn === b.wrappingColumn
		);
	}
}

//#endregion

function _multiCursorModifierFromString(multiCursorModifier: 'ctrlCmd' | 'alt'): 'altKey' | 'metaKey' | 'ctrlKey' {
	if (multiCursorModifier === 'ctrlCmd') {
		return (platform.isMacintosh ? 'metaKey' : 'ctrlKey');
	}
	return 'altKey';
}

/**
 * @internal
 */
export const editorOptionsRegistry: IEditorOption<EditorOption, any>[] = [];

function registerEditorOption<K1 extends EditorOption, K2 extends keyof IEditorOptions, T2, T3>(option: IEditorOption<K1, K2, T2, T3>): IEditorOption<K1, K2, T2, T3> {
	editorOptionsRegistry[option.id] = option;
	return option;
}

export const enum EditorOption {
	acceptSuggestionOnCommitCharacter,
	acceptSuggestionOnEnter,
	accessibilitySupport,
	autoClosingBrackets,
	autoClosingOvertype,
	autoClosingQuotes,
	autoIndent,
	automaticLayout,
	autoSurround,
	codeLens,
	colorDecorators,
	contextmenu,
	copyWithSyntaxHighlighting,
	cursorBlinking,
	cursorSmoothCaretAnimation,
	cursorStyle,
	cursorSurroundingLines,
	cursorWidth,
	disableLayerHinting,
	dragAndDrop,
	emptySelectionClipboard,
	extraEditorClassName,
	fastScrollSensitivity,
	find,
	fixedOverflowWidgets,
	folding,
	foldingStrategy,
	fontLigatures,
	formatOnPaste,
	formatOnType,
	glyphMargin,
	gotoLocation,
	hideCursorInOverviewRuler,
	highlightActiveIndentGuide,
	hover,
	inDiffEditor,
	lightbulb,
	lineDecorationsWidth,
	lineNumbers,
	lineNumbersMinChars,
	links,
	matchBrackets,
	minimap,
	mouseStyle,
	mouseWheelScrollSensitivity,
	mouseWheelZoom,
	multiCursorMergeOverlapping,
	multiCursorModifier,
	occurrencesHighlight,
	overviewRulerBorder,
	overviewRulerLanes,
	parameterHints,
	quickSuggestions,
	quickSuggestionsDelay,
	readOnly,
	renderControlCharacters,
	renderIndentGuides,
	renderFinalNewline,
	renderLineHighlight,
	renderWhitespace,
	revealHorizontalRightPadding,
	roundedSelection,
	rulers,
	scrollbar,
	scrollBeyondLastColumn,
	scrollBeyondLastLine,
	selectionClipboard,
	selectionHighlight,
	selectOnLineNumbers,
	showFoldingControls,
	showUnused,
	snippetSuggestions,
	smoothScrolling,
	stopRenderingLineAfter,
	suggestFontSize,
	suggestLineHeight,
	suggestOnTriggerCharacters,
	suggestSelection,
	tabCompletion,
	useTabStops,
	wordSeparators,
	wordWrap,
	wordWrapBreakAfterCharacters,
	wordWrapBreakBeforeCharacters,
	wordWrapBreakObtrusiveCharacters,
	wordWrapColumn,
	wordWrapMinified,
	wrappingIndent,

	ariaLabel,
	disableMonospaceOptimizations,
	editorClassName,
	tabFocusMode,
	suggest,
	layoutInfo,
	wrappingInfo,
}

export const EditorOptions = {
	acceptSuggestionOnCommitCharacter: registerEditorOption(new EditorBooleanOption(EditorOption.acceptSuggestionOnCommitCharacter, 'acceptSuggestionOnCommitCharacter', true)),
	acceptSuggestionOnEnter: registerEditorOption(new EditorEnumOption(EditorOption.acceptSuggestionOnEnter, 'acceptSuggestionOnEnter', 'on', ['on', 'smart', 'off'], (x: 'on' | 'smart' | 'off') => x)),
	accessibilitySupport: registerEditorOption(new EditorAccessibilitySupportOption(EditorOption.accessibilitySupport, 'accessibilitySupport', 'auto')),
	autoClosingBrackets: registerEditorOption(new EditorEnumOption(EditorOption.autoClosingBrackets, 'autoClosingBrackets', 'languageDefined', ['always', 'languageDefined', 'beforeWhitespace', 'never'], (x: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never') => x)),
	autoClosingOvertype: registerEditorOption(new EditorEnumOption(EditorOption.autoClosingOvertype, 'autoClosingOvertype', 'auto', ['always', 'auto', 'never'], (x: 'always' | 'auto' | 'never') => x)),
	autoClosingQuotes: registerEditorOption(new EditorEnumOption(EditorOption.autoClosingQuotes, 'autoClosingQuotes', 'languageDefined', ['always', 'languageDefined', 'beforeWhitespace', 'never'], (x: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never') => x)),
	autoIndent: registerEditorOption(new EditorBooleanOption(EditorOption.autoIndent, 'autoIndent', true)),
	automaticLayout: registerEditorOption(new EditorBooleanOption(EditorOption.automaticLayout, 'automaticLayout', false)),
	autoSurround: registerEditorOption(new EditorEnumOption(EditorOption.autoSurround, 'autoSurround', 'languageDefined', ['languageDefined', 'quotes', 'brackets', 'never'], (x: 'languageDefined' | 'quotes' | 'brackets' | 'never') => x)),
	codeLens: registerEditorOption(new EditorBooleanOption(EditorOption.codeLens, 'codeLens', true)),
	colorDecorators: registerEditorOption(new EditorBooleanOption(EditorOption.colorDecorators, 'colorDecorators', true)),
	contextmenu: registerEditorOption(new EditorBooleanOption(EditorOption.contextmenu, 'contextmenu', true)),
	copyWithSyntaxHighlighting: registerEditorOption(new EditorBooleanOption(EditorOption.copyWithSyntaxHighlighting, 'copyWithSyntaxHighlighting', true)),
	cursorBlinking: registerEditorOption(new EditorEnumOption(EditorOption.cursorBlinking, 'cursorBlinking', 'blink', ['blink', 'smooth', 'phase', 'expand', 'solid'], _cursorBlinkingStyleFromString)),
	cursorSmoothCaretAnimation: registerEditorOption(new EditorBooleanOption(EditorOption.cursorSmoothCaretAnimation, 'cursorSmoothCaretAnimation', false)),
	cursorStyle: registerEditorOption(new EditorEnumOption(EditorOption.cursorStyle, 'cursorStyle', 'line', ['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'], _cursorStyleFromString)),
	cursorSurroundingLines: registerEditorOption(new EditorIntOption(EditorOption.cursorSurroundingLines, 'cursorSurroundingLines', 0, 0, Constants.MAX_SAFE_SMALL_INTEGER)),
	cursorWidth: registerEditorOption(new EditorIntOption(EditorOption.cursorWidth, 'cursorWidth', 0, 0, Constants.MAX_SAFE_SMALL_INTEGER)),
	disableLayerHinting: registerEditorOption(new EditorBooleanOption(EditorOption.disableLayerHinting, 'disableLayerHinting', false)),
	dragAndDrop: registerEditorOption(new EditorBooleanOption(EditorOption.dragAndDrop, 'dragAndDrop', true)),
	emptySelectionClipboard: registerEditorOption(new EditorEmptySelectionClipboard(EditorOption.emptySelectionClipboard, 'emptySelectionClipboard', true)),
	extraEditorClassName: registerEditorOption(new EditorStringOption(EditorOption.extraEditorClassName, 'extraEditorClassName', '')),
	fastScrollSensitivity: registerEditorOption(new EditorFloatOption(EditorOption.fastScrollSensitivity, 'fastScrollSensitivity', 5, x => (x <= 0 ? 5 : x))),
	find: registerEditorOption(new EditorFind(EditorOption.find, 'find', {
		seedSearchStringFromSelection: true,
		autoFindInSelection: false,
		globalFindClipboard: false,
		addExtraSpaceOnTop: true
	})),
	fixedOverflowWidgets: registerEditorOption(new EditorBooleanOption(EditorOption.fixedOverflowWidgets, 'fixedOverflowWidgets', false)),
	folding: registerEditorOption(new EditorBooleanOption(EditorOption.folding, 'folding', true)),
	foldingStrategy: registerEditorOption(new EditorEnumOption(EditorOption.foldingStrategy, 'foldingStrategy', 'auto', ['auto', 'indentation'], (x: 'auto' | 'indentation') => x)),
	fontLigatures: registerEditorOption(new EditorBooleanOption(EditorOption.fontLigatures, 'fontLigatures', true)),
	formatOnPaste: registerEditorOption(new EditorBooleanOption(EditorOption.formatOnPaste, 'formatOnPaste', false)),
	formatOnType: registerEditorOption(new EditorBooleanOption(EditorOption.formatOnType, 'formatOnType', false)),
	glyphMargin: registerEditorOption(new EditorBooleanOption(EditorOption.glyphMargin, 'glyphMargin', true)),
	gotoLocation: registerEditorOption(new EditorGoToLocation(EditorOption.gotoLocation, 'gotoLocation', {
		multiple: 'peek'
	})),
	hideCursorInOverviewRuler: registerEditorOption(new EditorBooleanOption(EditorOption.hideCursorInOverviewRuler, 'hideCursorInOverviewRuler', false)),
	highlightActiveIndentGuide: registerEditorOption(new EditorBooleanOption(EditorOption.highlightActiveIndentGuide, 'highlightActiveIndentGuide', true)),
	hover: registerEditorOption(new EditorHover(EditorOption.hover, 'hover', {
		enabled: true,
		delay: 300,
		sticky: true
	})),
	inDiffEditor: registerEditorOption(new EditorBooleanOption(EditorOption.inDiffEditor, 'inDiffEditor', false)),
	lightbulb: registerEditorOption(new EditorLightbulb(EditorOption.lightbulb, 'lightbulb', {
		enabled: true
	})),
	lineDecorationsWidth: registerEditorOption(new EditorPassthroughOption(EditorOption.lineDecorationsWidth, 'lineDecorationsWidth', 10)),
	lineNumbers: registerEditorOption(new EditorRenderLineNumbersOption(EditorOption.lineNumbers, 'lineNumbers', { renderType: RenderLineNumbersType.On, renderFn: null })),
	lineNumbersMinChars: registerEditorOption(new EditorIntOption(EditorOption.lineNumbersMinChars, 'lineNumbersMinChars', 5, 1, 10)),
	links: registerEditorOption(new EditorBooleanOption(EditorOption.links, 'links', true)),
	matchBrackets: registerEditorOption(new EditorBooleanOption(EditorOption.matchBrackets, 'matchBrackets', true)),
	minimap: registerEditorOption(new EditorMinimap(EditorOption.minimap, 'minimap', {
		enabled: true,
		side: 'right',
		showSlider: 'mouseover',
		renderCharacters: true,
		maxColumn: 120,
	})),
	mouseStyle: registerEditorOption(new EditorEnumOption(EditorOption.mouseStyle, 'mouseStyle', 'text', ['text', 'default', 'copy'], (x: 'text' | 'default' | 'copy') => x)),
	mouseWheelScrollSensitivity: registerEditorOption(new EditorFloatOption(EditorOption.mouseWheelScrollSensitivity, 'mouseWheelScrollSensitivity', 1, x => (x === 0 ? 1 : x))),
	mouseWheelZoom: registerEditorOption(new EditorBooleanOption(EditorOption.mouseWheelZoom, 'mouseWheelZoom', false)),
	multiCursorMergeOverlapping: registerEditorOption(new EditorBooleanOption(EditorOption.multiCursorMergeOverlapping, 'multiCursorMergeOverlapping', true)),
	multiCursorModifier: registerEditorOption(new EditorEnumOption(EditorOption.multiCursorModifier, 'multiCursorModifier', 'alt', ['ctrlCmd', 'alt'], _multiCursorModifierFromString)),
	occurrencesHighlight: registerEditorOption(new EditorBooleanOption(EditorOption.occurrencesHighlight, 'occurrencesHighlight', true)),
	overviewRulerBorder: registerEditorOption(new EditorBooleanOption(EditorOption.overviewRulerBorder, 'overviewRulerBorder', true)),
	overviewRulerLanes: registerEditorOption(new EditorIntOption(EditorOption.overviewRulerLanes, 'overviewRulerLanes', 2, 0, 3)),
	parameterHints: registerEditorOption(new EditorParameterHints(EditorOption.parameterHints, 'parameterHints', {
		enabled: true,
		cycle: false
	})),
	quickSuggestions: registerEditorOption(new EditorQuickSuggestions(EditorOption.quickSuggestions, 'quickSuggestions', {
		other: true,
		comments: false,
		strings: false
	})),
	quickSuggestionsDelay: registerEditorOption(new EditorIntOption(EditorOption.quickSuggestionsDelay, 'quickSuggestionsDelay', 10, 0, Constants.MAX_SAFE_SMALL_INTEGER)),
	readOnly: registerEditorOption(new EditorBooleanOption(EditorOption.readOnly, 'readOnly', false)),
	renderControlCharacters: registerEditorOption(new EditorBooleanOption(EditorOption.renderControlCharacters, 'renderControlCharacters', false)),
	renderIndentGuides: registerEditorOption(new EditorBooleanOption(EditorOption.renderIndentGuides, 'renderIndentGuides', true)),
	renderFinalNewline: registerEditorOption(new EditorBooleanOption(EditorOption.renderFinalNewline, 'renderFinalNewline', true)),
	renderLineHighlight: registerEditorOption(new EditorEnumOption(EditorOption.renderLineHighlight, 'renderLineHighlight', 'line', ['none', 'gutter', 'line', 'all'], (x: 'none' | 'gutter' | 'line' | 'all') => x)),
	renderWhitespace: registerEditorOption(new EditorEnumOption(EditorOption.renderWhitespace, 'renderWhitespace', 'none', ['none', 'boundary', 'selection', 'all'], (x: 'none' | 'boundary' | 'selection' | 'all') => x)),
	revealHorizontalRightPadding: registerEditorOption(new EditorIntOption(EditorOption.revealHorizontalRightPadding, 'revealHorizontalRightPadding', 30, 0, 1000)),
	roundedSelection: registerEditorOption(new EditorBooleanOption(EditorOption.roundedSelection, 'roundedSelection', true)),
	rulers: registerEditorOption(new EditorRulers(EditorOption.rulers, 'rulers', [])),
	scrollbar: registerEditorOption(new EditorScrollbar(EditorOption.scrollbar, 'scrollbar', {
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
		handleMouseWheel: true,
	})),
	scrollBeyondLastColumn: registerEditorOption(new EditorIntOption(EditorOption.scrollBeyondLastColumn, 'scrollBeyondLastColumn', 5, 0, Constants.MAX_SAFE_SMALL_INTEGER)),
	scrollBeyondLastLine: registerEditorOption(new EditorBooleanOption(EditorOption.scrollBeyondLastLine, 'scrollBeyondLastLine', true)),
	selectionClipboard: registerEditorOption(new EditorBooleanOption(EditorOption.selectionClipboard, 'selectionClipboard', true)),
	selectionHighlight: registerEditorOption(new EditorBooleanOption(EditorOption.selectionHighlight, 'selectionHighlight', true)),
	selectOnLineNumbers: registerEditorOption(new EditorBooleanOption(EditorOption.selectOnLineNumbers, 'selectOnLineNumbers', true)),
	showFoldingControls: registerEditorOption(new EditorEnumOption(EditorOption.showFoldingControls, 'showFoldingControls', 'mouseover', ['always', 'mouseover'], (x: 'always' | 'mouseover') => x)),
	showUnused: registerEditorOption(new EditorBooleanOption(EditorOption.showUnused, 'showUnused', true)),
	snippetSuggestions: registerEditorOption(new EditorEnumOption<EditorOption.snippetSuggestions, 'snippetSuggestions', 'top' | 'bottom' | 'inline' | 'none'>(EditorOption.snippetSuggestions, 'snippetSuggestions', 'inline', ['top', 'bottom', 'inline', 'none'], x => x)),
	smoothScrolling: registerEditorOption(new EditorBooleanOption(EditorOption.smoothScrolling, 'smoothScrolling', false)),
	stopRenderingLineAfter: registerEditorOption(new EditorIntOption(EditorOption.stopRenderingLineAfter, 'stopRenderingLineAfter', 10000, -1, Constants.MAX_SAFE_SMALL_INTEGER)),
	suggestFontSize: registerEditorOption(new EditorIntOption(EditorOption.suggestFontSize, 'suggestFontSize', 0, 0, 1000)),
	suggestLineHeight: registerEditorOption(new EditorIntOption(EditorOption.suggestLineHeight, 'suggestLineHeight', 0, 0, 1000)),
	suggestOnTriggerCharacters: registerEditorOption(new EditorBooleanOption(EditorOption.suggestOnTriggerCharacters, 'suggestOnTriggerCharacters', true)),
	suggestSelection: registerEditorOption(new EditorEnumOption(EditorOption.suggestSelection, 'suggestSelection', 'recentlyUsed', ['first', 'recentlyUsed', 'recentlyUsedByPrefix'], (x: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix') => x)),
	tabCompletion: registerEditorOption(new EditorEnumOption(EditorOption.tabCompletion, 'tabCompletion', 'off', ['on', 'off', 'onlySnippets'], (x: 'on' | 'off' | 'onlySnippets') => x)),
	useTabStops: registerEditorOption(new EditorBooleanOption(EditorOption.useTabStops, 'useTabStops', true)),
	wordSeparators: registerEditorOption(new EditorStringOption(EditorOption.wordSeparators, 'wordSeparators', USUAL_WORD_SEPARATORS)),
	wordWrap: registerEditorOption(new EditorEnumOption(EditorOption.wordWrap, 'wordWrap', 'off', ['off', 'on', 'wordWrapColumn', 'bounded'], (x: 'off' | 'on' | 'wordWrapColumn' | 'bounded') => x)),
	wordWrapBreakAfterCharacters: registerEditorOption(new EditorStringOption(EditorOption.wordWrapBreakAfterCharacters, 'wordWrapBreakAfterCharacters', ' \t})]?|/&,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣')),
	wordWrapBreakBeforeCharacters: registerEditorOption(new EditorStringOption(EditorOption.wordWrapBreakBeforeCharacters, 'wordWrapBreakBeforeCharacters', '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋')),
	wordWrapBreakObtrusiveCharacters: registerEditorOption(new EditorStringOption(EditorOption.wordWrapBreakObtrusiveCharacters, 'wordWrapBreakObtrusiveCharacters', '.')),
	wordWrapColumn: registerEditorOption(new EditorIntOption(EditorOption.wordWrapColumn, 'wordWrapColumn', 80, 1, Constants.MAX_SAFE_SMALL_INTEGER)),
	wordWrapMinified: registerEditorOption(new EditorBooleanOption(EditorOption.wordWrapMinified, 'wordWrapMinified', true)),
	wrappingIndent: registerEditorOption(new EditorEnumOption(EditorOption.wrappingIndent, 'wrappingIndent', 'same', ['none', 'same', 'indent', 'deepIndent'], _wrappingIndentFromString)),

	// Leave these at the end (because they have dependencies!)
	ariaLabel: registerEditorOption(new EditorAriaLabel(EditorOption.ariaLabel, 'ariaLabel', nls.localize('editorViewAccessibleLabel', "Editor content"), [EditorOption.accessibilitySupport])),
	disableMonospaceOptimizations: registerEditorOption(new EditorDisableMonospaceOptimizations(EditorOption.disableMonospaceOptimizations, 'disableMonospaceOptimizations', false, [EditorOption.fontLigatures])),
	editorClassName: registerEditorOption(new EditorClassName(EditorOption.editorClassName, 'editorClassName', undefined, [EditorOption.mouseStyle, EditorOption.fontLigatures, EditorOption.extraEditorClassName])),
	tabFocusMode: registerEditorOption(new EditorTabFocusMode(EditorOption.tabFocusMode, 'tabFocusMode', undefined, [EditorOption.readOnly])),
	suggest: registerEditorOption(new EditorSuggest(EditorOption.suggest, 'suggest', {
		filterGraceful: true,
		snippetsPreventQuickSuggestions: true,
		localityBonus: false,
		shareSuggestSelections: false,
		showIcons: true,
		maxVisibleSuggestions: 12,
		filteredTypes: Object.create(null)
	}, [EditorOption.snippetSuggestions])),
	layoutInfo: registerEditorOption(new EditorLayoutInfoComputer(EditorOption.layoutInfo, 'layoutInfo', undefined, [EditorOption.glyphMargin, EditorOption.lineDecorationsWidth, EditorOption.folding, EditorOption.minimap, EditorOption.scrollbar, EditorOption.lineNumbers])),
	wrappingInfo: registerEditorOption(new EditorWrappingInfoComputer(EditorOption.wrappingInfo, 'wrappingInfo', undefined, [EditorOption.wordWrap, EditorOption.wordWrapColumn, EditorOption.wordWrapMinified, EditorOption.layoutInfo, EditorOption.accessibilitySupport])),
};

// const tmp: { [key: string]: IEditorOption<any, any>; } = EditorOptions;
// for (const key of Object.keys(tmp)) {
// 	const option = tmp[key];
// 	if (key !== option.name) {
// 		throw new Error(`mismatch - ${key} - ${option.name}`);
// 	}
// }

export type EditorOptionsType = typeof EditorOptions;
export type FindEditorOptionsKeyById<T extends EditorOption> = { [K in keyof EditorOptionsType]: EditorOptionsType[K]['id'] extends T ? K : never }[keyof EditorOptionsType];
export type ComputedEditorOptionValue<T extends IEditorOption<any, any, any, any>> = T extends IEditorOption<any, any, any, infer R> ? R : never;
export type FindComputedEditorOptionValueById<T extends EditorOption> = NonNullable<ComputedEditorOptionValue<EditorOptionsType[FindEditorOptionsKeyById<T>]>>;
