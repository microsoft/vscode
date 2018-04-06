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
	/**
	 * @internal
	 * Controls if the Find Widget should read or modify the shared find clipboard on macOS
	 */
	globalFindClipboard: boolean;
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
 * Configuration options for the editor.
 */
export interface IEditorOptions {
	/**
	 * This editor is used inside a diff editor.
	 * @internal
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
	lineNumbers?: 'on' | 'off' | 'relative' | 'interval' | ((lineNumber: number) => string);
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
	acceptSuggestionOnEnter?: boolean | 'on' | 'smart' | 'off';
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
	 * Control the behavior and rendering of the code action lightbulb.
	 */
	lightbulb?: IEditorLightbulbOptions;
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
	/**
	 * The letter spacing
	 */
	letterSpacing?: number;
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
 * @internal
 */
export function blinkingStyleToString(blinkingStyle: TextEditorCursorBlinkingStyle): string {
	if (blinkingStyle === TextEditorCursorBlinkingStyle.Blink) {
		return 'blink';
	} else if (blinkingStyle === TextEditorCursorBlinkingStyle.Expand) {
		return 'expand';
	} else if (blinkingStyle === TextEditorCursorBlinkingStyle.Phase) {
		return 'phase';
	} else if (blinkingStyle === TextEditorCursorBlinkingStyle.Smooth) {
		return 'smooth';
	} else if (blinkingStyle === TextEditorCursorBlinkingStyle.Solid) {
		return 'solid';
	} else {
		throw new Error('blinkingStyleToString: Unknown blinkingStyle');
	}
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
	readonly mouseWheelScrollSensitivity: number;
}

export interface InternalEditorMinimapOptions {
	readonly enabled: boolean;
	readonly side: 'right' | 'left';
	readonly showSlider: 'always' | 'mouseover';
	readonly renderCharacters: boolean;
	readonly maxColumn: number;
}

export interface InternalEditorFindOptions {
	readonly seedSearchStringFromSelection: boolean;
	readonly autoFindInSelection: boolean;
	/**
	 * @internal
	 */
	readonly globalFindClipboard: boolean;
}

export interface EditorWrappingInfo {
	readonly inDiffEditor: boolean;
	readonly isDominatedByLongLines: boolean;
	readonly isWordWrapMinified: boolean;
	readonly isViewportWrapping: boolean;
	readonly wrappingColumn: number;
	readonly wrappingIndent: WrappingIndent;
	readonly wordWrapBreakBeforeCharacters: string;
	readonly wordWrapBreakAfterCharacters: string;
	readonly wordWrapBreakObtrusiveCharacters: string;
}

export const enum RenderLineNumbersType {
	Off = 0,
	On = 1,
	Relative = 2,
	Interval = 3,
	Custom = 4
}

export interface InternalEditorViewOptions {
	readonly extraEditorClassName: string;
	readonly disableMonospaceOptimizations: boolean;
	readonly rulers: number[];
	readonly ariaLabel: string;
	readonly renderLineNumbers: RenderLineNumbersType;
	readonly renderCustomLineNumbers: (lineNumber: number) => string;
	readonly selectOnLineNumbers: boolean;
	readonly glyphMargin: boolean;
	readonly revealHorizontalRightPadding: number;
	readonly roundedSelection: boolean;
	readonly overviewRulerLanes: number;
	readonly overviewRulerBorder: boolean;
	readonly cursorBlinking: TextEditorCursorBlinkingStyle;
	readonly mouseWheelZoom: boolean;
	readonly cursorStyle: TextEditorCursorStyle;
	readonly cursorWidth: number;
	readonly hideCursorInOverviewRuler: boolean;
	readonly scrollBeyondLastLine: boolean;
	readonly smoothScrolling: boolean;
	readonly stopRenderingLineAfter: number;
	readonly renderWhitespace: 'none' | 'boundary' | 'all';
	readonly renderControlCharacters: boolean;
	readonly fontLigatures: boolean;
	readonly renderIndentGuides: boolean;
	readonly renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	readonly scrollbar: InternalEditorScrollbarOptions;
	readonly minimap: InternalEditorMinimapOptions;
	readonly fixedOverflowWidgets: boolean;
}

export interface EditorContribOptions {
	readonly selectionClipboard: boolean;
	readonly hover: boolean;
	readonly links: boolean;
	readonly contextmenu: boolean;
	readonly quickSuggestions: boolean | { other: boolean, comments: boolean, strings: boolean };
	readonly quickSuggestionsDelay: number;
	readonly parameterHints: boolean;
	readonly iconsInSuggestions: boolean;
	readonly formatOnType: boolean;
	readonly formatOnPaste: boolean;
	readonly suggestOnTriggerCharacters: boolean;
	readonly acceptSuggestionOnEnter: 'on' | 'smart' | 'off';
	readonly acceptSuggestionOnCommitCharacter: boolean;
	readonly snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none';
	readonly wordBasedSuggestions: boolean;
	readonly suggestSelection: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix';
	readonly suggestFontSize: number;
	readonly suggestLineHeight: number;
	readonly selectionHighlight: boolean;
	readonly occurrencesHighlight: boolean;
	readonly codeLens: boolean;
	readonly folding: boolean;
	readonly foldingStrategy: 'auto' | 'indentation';
	readonly showFoldingControls: 'always' | 'mouseover';
	readonly matchBrackets: boolean;
	readonly find: InternalEditorFindOptions;
	readonly colorDecorators: boolean;
	readonly lightbulbEnabled: boolean;
}

/**
 * Validated configuration options for the editor.
 * This is a 1 to 1 validated/parsed version of IEditorOptions merged on top of the defaults.
 * @internal
 */
export interface IValidatedEditorOptions {
	readonly inDiffEditor: boolean;
	readonly wordSeparators: string;
	readonly lineNumbersMinChars: number;
	readonly lineDecorationsWidth: number | string;
	readonly readOnly: boolean;
	readonly mouseStyle: 'text' | 'default' | 'copy';
	readonly disableLayerHinting: boolean;
	readonly automaticLayout: boolean;
	readonly wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
	readonly wordWrapColumn: number;
	readonly wordWrapMinified: boolean;
	readonly wrappingIndent: WrappingIndent;
	readonly wordWrapBreakBeforeCharacters: string;
	readonly wordWrapBreakAfterCharacters: string;
	readonly wordWrapBreakObtrusiveCharacters: string;
	readonly autoClosingBrackets: boolean;
	readonly autoIndent: boolean;
	readonly dragAndDrop: boolean;
	readonly emptySelectionClipboard: boolean;
	readonly useTabStops: boolean;
	readonly multiCursorModifier: 'altKey' | 'ctrlKey' | 'metaKey';
	readonly multiCursorMergeOverlapping: boolean;
	readonly accessibilitySupport: 'auto' | 'off' | 'on';

	readonly viewInfo: InternalEditorViewOptions;
	readonly contribInfo: EditorContribOptions;
}

/**
 * Internal configuration options (transformed or computed) for the editor.
 */
export class InternalEditorOptions {
	readonly _internalEditorOptionsBrand: void;

	readonly canUseLayerHinting: boolean;
	readonly pixelRatio: number;
	readonly editorClassName: string;
	readonly lineHeight: number;
	readonly readOnly: boolean;
	/**
	 * @internal
	 */
	readonly accessibilitySupport: platform.AccessibilitySupport;
	readonly multiCursorModifier: 'altKey' | 'ctrlKey' | 'metaKey';
	readonly multiCursorMergeOverlapping: boolean;

	// ---- cursor options
	readonly wordSeparators: string;
	readonly autoClosingBrackets: boolean;
	readonly autoIndent: boolean;
	readonly useTabStops: boolean;
	readonly tabFocusMode: boolean;
	readonly dragAndDrop: boolean;
	readonly emptySelectionClipboard: boolean;

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
		canUseLayerHinting: boolean;
		pixelRatio: number;
		editorClassName: string;
		lineHeight: number;
		readOnly: boolean;
		accessibilitySupport: platform.AccessibilitySupport;
		multiCursorModifier: 'altKey' | 'ctrlKey' | 'metaKey';
		multiCursorMergeOverlapping: boolean;
		wordSeparators: string;
		autoClosingBrackets: boolean;
		autoIndent: boolean;
		useTabStops: boolean;
		tabFocusMode: boolean;
		dragAndDrop: boolean;
		emptySelectionClipboard: boolean;
		layoutInfo: EditorLayoutInfo;
		fontInfo: FontInfo;
		viewInfo: InternalEditorViewOptions;
		wrappingInfo: EditorWrappingInfo;
		contribInfo: EditorContribOptions;
	}) {
		this.canUseLayerHinting = source.canUseLayerHinting;
		this.pixelRatio = source.pixelRatio;
		this.editorClassName = source.editorClassName;
		this.lineHeight = source.lineHeight | 0;
		this.readOnly = source.readOnly;
		this.accessibilitySupport = source.accessibilitySupport;
		this.multiCursorModifier = source.multiCursorModifier;
		this.multiCursorMergeOverlapping = source.multiCursorMergeOverlapping;
		this.wordSeparators = source.wordSeparators;
		this.autoClosingBrackets = source.autoClosingBrackets;
		this.autoIndent = source.autoIndent;
		this.useTabStops = source.useTabStops;
		this.tabFocusMode = source.tabFocusMode;
		this.dragAndDrop = source.dragAndDrop;
		this.emptySelectionClipboard = source.emptySelectionClipboard;
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
			this.canUseLayerHinting === other.canUseLayerHinting
			&& this.pixelRatio === other.pixelRatio
			&& this.editorClassName === other.editorClassName
			&& this.lineHeight === other.lineHeight
			&& this.readOnly === other.readOnly
			&& this.accessibilitySupport === other.accessibilitySupport
			&& this.multiCursorModifier === other.multiCursorModifier
			&& this.multiCursorMergeOverlapping === other.multiCursorMergeOverlapping
			&& this.wordSeparators === other.wordSeparators
			&& this.autoClosingBrackets === other.autoClosingBrackets
			&& this.autoIndent === other.autoIndent
			&& this.useTabStops === other.useTabStops
			&& this.tabFocusMode === other.tabFocusMode
			&& this.dragAndDrop === other.dragAndDrop
			&& this.emptySelectionClipboard === other.emptySelectionClipboard
			&& InternalEditorOptions._equalsLayoutInfo(this.layoutInfo, other.layoutInfo)
			&& this.fontInfo.equals(other.fontInfo)
			&& InternalEditorOptions._equalsViewOptions(this.viewInfo, other.viewInfo)
			&& InternalEditorOptions._equalsWrappingInfo(this.wrappingInfo, other.wrappingInfo)
			&& InternalEditorOptions._equalsContribOptions(this.contribInfo, other.contribInfo)
		);
	}

	/**
	 * @internal
	 */
	public createChangeEvent(newOpts: InternalEditorOptions): IConfigurationChangedEvent {
		return {
			canUseLayerHinting: (this.canUseLayerHinting !== newOpts.canUseLayerHinting),
			pixelRatio: (this.pixelRatio !== newOpts.pixelRatio),
			editorClassName: (this.editorClassName !== newOpts.editorClassName),
			lineHeight: (this.lineHeight !== newOpts.lineHeight),
			readOnly: (this.readOnly !== newOpts.readOnly),
			accessibilitySupport: (this.accessibilitySupport !== newOpts.accessibilitySupport),
			multiCursorModifier: (this.multiCursorModifier !== newOpts.multiCursorModifier),
			multiCursorMergeOverlapping: (this.multiCursorMergeOverlapping !== newOpts.multiCursorMergeOverlapping),
			wordSeparators: (this.wordSeparators !== newOpts.wordSeparators),
			autoClosingBrackets: (this.autoClosingBrackets !== newOpts.autoClosingBrackets),
			autoIndent: (this.autoIndent !== newOpts.autoIndent),
			useTabStops: (this.useTabStops !== newOpts.useTabStops),
			tabFocusMode: (this.tabFocusMode !== newOpts.tabFocusMode),
			dragAndDrop: (this.dragAndDrop !== newOpts.dragAndDrop),
			emptySelectionClipboard: (this.emptySelectionClipboard !== newOpts.emptySelectionClipboard),
			layoutInfo: (!InternalEditorOptions._equalsLayoutInfo(this.layoutInfo, newOpts.layoutInfo)),
			fontInfo: (!this.fontInfo.equals(newOpts.fontInfo)),
			viewInfo: (!InternalEditorOptions._equalsViewOptions(this.viewInfo, newOpts.viewInfo)),
			wrappingInfo: (!InternalEditorOptions._equalsWrappingInfo(this.wrappingInfo, newOpts.wrappingInfo)),
			contribInfo: (!InternalEditorOptions._equalsContribOptions(this.contribInfo, newOpts.contribInfo))
		};
	}

	/**
	 * @internal
	 */
	private static _equalsLayoutInfo(a: EditorLayoutInfo, b: EditorLayoutInfo): boolean {
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
			&& this._equalsOverviewRuler(a.overviewRuler, b.overviewRuler)
		);
	}

	/**
	 * @internal
	 */
	private static _equalsOverviewRuler(a: OverviewRulerPosition, b: OverviewRulerPosition): boolean {
		return (
			a.width === b.width
			&& a.height === b.height
			&& a.top === b.top
			&& a.right === b.right
		);
	}

	/**
	 * @internal
	 */
	private static _equalsViewOptions(a: InternalEditorViewOptions, b: InternalEditorViewOptions): boolean {
		return (
			a.extraEditorClassName === b.extraEditorClassName
			&& a.disableMonospaceOptimizations === b.disableMonospaceOptimizations
			&& this._equalsNumberArrays(a.rulers, b.rulers)
			&& a.ariaLabel === b.ariaLabel
			&& a.renderLineNumbers === b.renderLineNumbers
			&& a.renderCustomLineNumbers === b.renderCustomLineNumbers
			&& a.selectOnLineNumbers === b.selectOnLineNumbers
			&& a.glyphMargin === b.glyphMargin
			&& a.revealHorizontalRightPadding === b.revealHorizontalRightPadding
			&& a.roundedSelection === b.roundedSelection
			&& a.overviewRulerLanes === b.overviewRulerLanes
			&& a.overviewRulerBorder === b.overviewRulerBorder
			&& a.cursorBlinking === b.cursorBlinking
			&& a.mouseWheelZoom === b.mouseWheelZoom
			&& a.cursorStyle === b.cursorStyle
			&& a.cursorWidth === b.cursorWidth
			&& a.hideCursorInOverviewRuler === b.hideCursorInOverviewRuler
			&& a.scrollBeyondLastLine === b.scrollBeyondLastLine
			&& a.smoothScrolling === b.smoothScrolling
			&& a.stopRenderingLineAfter === b.stopRenderingLineAfter
			&& a.renderWhitespace === b.renderWhitespace
			&& a.renderControlCharacters === b.renderControlCharacters
			&& a.fontLigatures === b.fontLigatures
			&& a.renderIndentGuides === b.renderIndentGuides
			&& a.renderLineHighlight === b.renderLineHighlight
			&& this._equalsScrollbarOptions(a.scrollbar, b.scrollbar)
			&& this._equalsMinimapOptions(a.minimap, b.minimap)
			&& a.fixedOverflowWidgets === b.fixedOverflowWidgets
		);
	}

	/**
	 * @internal
	 */
	private static _equalsScrollbarOptions(a: InternalEditorScrollbarOptions, b: InternalEditorScrollbarOptions): boolean {
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

	/**
	 * @internal
	 */
	private static _equalsMinimapOptions(a: InternalEditorMinimapOptions, b: InternalEditorMinimapOptions): boolean {
		return (
			a.enabled === b.enabled
			&& a.side === b.side
			&& a.showSlider === b.showSlider
			&& a.renderCharacters === b.renderCharacters
			&& a.maxColumn === b.maxColumn
		);
	}

	private static _equalsNumberArrays(a: number[], b: number[]): boolean {
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

	private static _equalFindOptions(a: InternalEditorFindOptions, b: InternalEditorFindOptions): boolean {
		return (
			a.seedSearchStringFromSelection === b.seedSearchStringFromSelection
			&& a.autoFindInSelection === b.autoFindInSelection
			&& a.globalFindClipboard === b.globalFindClipboard
		);
	}

	/**
	 * @internal
	 */
	private static _equalsWrappingInfo(a: EditorWrappingInfo, b: EditorWrappingInfo): boolean {
		return (
			a.inDiffEditor === b.inDiffEditor
			&& a.isDominatedByLongLines === b.isDominatedByLongLines
			&& a.isWordWrapMinified === b.isWordWrapMinified
			&& a.isViewportWrapping === b.isViewportWrapping
			&& a.wrappingColumn === b.wrappingColumn
			&& a.wrappingIndent === b.wrappingIndent
			&& a.wordWrapBreakBeforeCharacters === b.wordWrapBreakBeforeCharacters
			&& a.wordWrapBreakAfterCharacters === b.wordWrapBreakAfterCharacters
			&& a.wordWrapBreakObtrusiveCharacters === b.wordWrapBreakObtrusiveCharacters
		);
	}

	/**
	 * @internal
	 */
	private static _equalsContribOptions(a: EditorContribOptions, b: EditorContribOptions): boolean {
		return (
			a.selectionClipboard === b.selectionClipboard
			&& a.hover === b.hover
			&& a.links === b.links
			&& a.contextmenu === b.contextmenu
			&& InternalEditorOptions._equalsQuickSuggestions(a.quickSuggestions, b.quickSuggestions)
			&& a.quickSuggestionsDelay === b.quickSuggestionsDelay
			&& a.parameterHints === b.parameterHints
			&& a.iconsInSuggestions === b.iconsInSuggestions
			&& a.formatOnType === b.formatOnType
			&& a.formatOnPaste === b.formatOnPaste
			&& a.suggestOnTriggerCharacters === b.suggestOnTriggerCharacters
			&& a.acceptSuggestionOnEnter === b.acceptSuggestionOnEnter
			&& a.acceptSuggestionOnCommitCharacter === b.acceptSuggestionOnCommitCharacter
			&& a.snippetSuggestions === b.snippetSuggestions
			&& a.wordBasedSuggestions === b.wordBasedSuggestions
			&& a.suggestSelection === b.suggestSelection
			&& a.suggestFontSize === b.suggestFontSize
			&& a.suggestLineHeight === b.suggestLineHeight
			&& a.selectionHighlight === b.selectionHighlight
			&& a.occurrencesHighlight === b.occurrencesHighlight
			&& a.codeLens === b.codeLens
			&& a.folding === b.folding
			&& a.foldingStrategy === b.foldingStrategy
			&& a.showFoldingControls === b.showFoldingControls
			&& a.matchBrackets === b.matchBrackets
			&& this._equalFindOptions(a.find, b.find)
			&& a.colorDecorators === b.colorDecorators
			&& a.lightbulbEnabled === b.lightbulbEnabled
		);
	}

	private static _equalsQuickSuggestions(a: boolean | { other: boolean, comments: boolean, strings: boolean }, b: boolean | { other: boolean, comments: boolean, strings: boolean }): boolean {
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
 * An event describing that the configuration of the editor has changed.
 */
export interface IConfigurationChangedEvent {
	readonly canUseLayerHinting: boolean;
	readonly pixelRatio: boolean;
	readonly editorClassName: boolean;
	readonly lineHeight: boolean;
	readonly readOnly: boolean;
	readonly accessibilitySupport: boolean;
	readonly multiCursorModifier: boolean;
	readonly multiCursorMergeOverlapping: boolean;
	readonly wordSeparators: boolean;
	readonly autoClosingBrackets: boolean;
	readonly autoIndent: boolean;
	readonly useTabStops: boolean;
	readonly tabFocusMode: boolean;
	readonly dragAndDrop: boolean;
	readonly emptySelectionClipboard: boolean;
	readonly layoutInfo: boolean;
	readonly fontInfo: boolean;
	readonly viewInfo: boolean;
	readonly wrappingInfo: boolean;
	readonly contribInfo: boolean;
}

/**
 * @internal
 */
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
	readonly accessibilitySupport: platform.AccessibilitySupport;
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

function _stringSet<T>(value: T, defaultValue: T, allowedValues: T[]): T {
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

		const viewInfo = this._sanitizeViewInfo(opts, defaults.viewInfo);
		const contribInfo = this._sanitizeContribInfo(opts, defaults.contribInfo);

		let configuredMulticursorModifier: 'altKey' | 'metaKey' | 'ctrlKey';
		if (typeof opts.multiCursorModifier === 'string') {
			if (opts.multiCursorModifier === 'ctrlCmd') {
				configuredMulticursorModifier = platform.isMacintosh ? 'metaKey' : 'ctrlKey';
			} else {
				configuredMulticursorModifier = 'altKey';
			}
		}
		const multiCursorModifier = _stringSet<'altKey' | 'metaKey' | 'ctrlKey'>(configuredMulticursorModifier, defaults.multiCursorModifier, ['altKey', 'metaKey', 'ctrlKey']);

		return {
			inDiffEditor: _boolean(opts.inDiffEditor, defaults.inDiffEditor),
			wordSeparators: _string(opts.wordSeparators, defaults.wordSeparators),
			lineNumbersMinChars: _clampedInt(opts.lineNumbersMinChars, defaults.lineNumbersMinChars, 1, 10),
			lineDecorationsWidth: (typeof opts.lineDecorationsWidth === 'undefined' ? defaults.lineDecorationsWidth : opts.lineDecorationsWidth),
			readOnly: _boolean(opts.readOnly, defaults.readOnly),
			mouseStyle: _stringSet<'text' | 'default' | 'copy'>(opts.mouseStyle, defaults.mouseStyle, ['text', 'default', 'copy']),
			disableLayerHinting: _boolean(opts.disableLayerHinting, defaults.disableLayerHinting),
			automaticLayout: _boolean(opts.automaticLayout, defaults.automaticLayout),
			wordWrap: wordWrap,
			wordWrapColumn: _clampedInt(opts.wordWrapColumn, defaults.wordWrapColumn, 1, Constants.MAX_SAFE_SMALL_INTEGER),
			wordWrapMinified: _boolean(opts.wordWrapMinified, defaults.wordWrapMinified),
			wrappingIndent: _wrappingIndentFromString(opts.wrappingIndent, defaults.wrappingIndent),
			wordWrapBreakBeforeCharacters: _string(opts.wordWrapBreakBeforeCharacters, defaults.wordWrapBreakBeforeCharacters),
			wordWrapBreakAfterCharacters: _string(opts.wordWrapBreakAfterCharacters, defaults.wordWrapBreakAfterCharacters),
			wordWrapBreakObtrusiveCharacters: _string(opts.wordWrapBreakObtrusiveCharacters, defaults.wordWrapBreakObtrusiveCharacters),
			autoClosingBrackets: _boolean(opts.autoClosingBrackets, defaults.autoClosingBrackets),
			autoIndent: _boolean(opts.autoIndent, defaults.autoIndent),
			dragAndDrop: _boolean(opts.dragAndDrop, defaults.dragAndDrop),
			emptySelectionClipboard: _boolean(opts.emptySelectionClipboard, defaults.emptySelectionClipboard),
			useTabStops: _boolean(opts.useTabStops, defaults.useTabStops),
			multiCursorModifier: multiCursorModifier,
			multiCursorMergeOverlapping: _boolean(opts.multiCursorMergeOverlapping, defaults.multiCursorMergeOverlapping),
			accessibilitySupport: _stringSet<'auto' | 'on' | 'off'>(opts.accessibilitySupport, defaults.accessibilitySupport, ['auto', 'on', 'off']),
			viewInfo: viewInfo,
			contribInfo: contribInfo,
		};
	}

	private static _sanitizeScrollbarOpts(opts: IEditorScrollbarOptions, defaults: InternalEditorScrollbarOptions, mouseWheelScrollSensitivity: number): InternalEditorScrollbarOptions {
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

			handleMouseWheel: _boolean(opts.handleMouseWheel, defaults.handleMouseWheel),
			mouseWheelScrollSensitivity: mouseWheelScrollSensitivity
		};
	}

	private static _sanitizeMinimapOpts(opts: IEditorMinimapOptions, defaults: InternalEditorMinimapOptions): InternalEditorMinimapOptions {
		if (typeof opts !== 'object') {
			return defaults;
		}
		return {
			enabled: _boolean(opts.enabled, defaults.enabled),
			side: _stringSet<'right' | 'left'>(opts.side, defaults.side, ['right', 'left']),
			showSlider: _stringSet<'always' | 'mouseover'>(opts.showSlider, defaults.showSlider, ['always', 'mouseover']),
			renderCharacters: _boolean(opts.renderCharacters, defaults.renderCharacters),
			maxColumn: _clampedInt(opts.maxColumn, defaults.maxColumn, 1, 10000),
		};
	}

	private static _santizeFindOpts(opts: IEditorFindOptions, defaults: InternalEditorFindOptions): InternalEditorFindOptions {
		if (typeof opts !== 'object') {
			return defaults;
		}

		return {
			seedSearchStringFromSelection: _boolean(opts.seedSearchStringFromSelection, defaults.seedSearchStringFromSelection),
			autoFindInSelection: _boolean(opts.autoFindInSelection, defaults.autoFindInSelection),
			globalFindClipboard: _boolean(opts.globalFindClipboard, defaults.globalFindClipboard)
		};
	}

	private static _sanitizeViewInfo(opts: IEditorOptions, defaults: InternalEditorViewOptions): InternalEditorViewOptions {

		let rulers: number[] = [];
		if (Array.isArray(opts.rulers)) {
			for (let i = 0, len = opts.rulers.length; i < len; i++) {
				rulers.push(_clampedInt(opts.rulers[i], 0, 0, 10000));
			}
			rulers.sort();
		}

		let renderLineNumbers: RenderLineNumbersType = defaults.renderLineNumbers;
		let renderCustomLineNumbers: (lineNumber: number) => string = defaults.renderCustomLineNumbers;

		if (typeof opts.lineNumbers !== 'undefined') {
			let lineNumbers = opts.lineNumbers;

			// Compatibility with old true or false values
			if (<any>lineNumbers === true) {
				lineNumbers = 'on';
			} else if (<any>lineNumbers === false) {
				lineNumbers = 'off';
			}

			if (typeof lineNumbers === 'function') {
				renderLineNumbers = RenderLineNumbersType.Custom;
				renderCustomLineNumbers = lineNumbers;
			} else if (lineNumbers === 'interval') {
				renderLineNumbers = RenderLineNumbersType.Interval;
			} else if (lineNumbers === 'relative') {
				renderLineNumbers = RenderLineNumbersType.Relative;
			} else if (lineNumbers === 'on') {
				renderLineNumbers = RenderLineNumbersType.On;
			} else {
				renderLineNumbers = RenderLineNumbersType.Off;
			}
		}

		const fontLigatures = _boolean(opts.fontLigatures, defaults.fontLigatures);
		const disableMonospaceOptimizations = _boolean(opts.disableMonospaceOptimizations, defaults.disableMonospaceOptimizations) || fontLigatures;

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

		let mouseWheelScrollSensitivity = _float(opts.mouseWheelScrollSensitivity, defaults.scrollbar.mouseWheelScrollSensitivity);
		if (mouseWheelScrollSensitivity === 0) {
			// Disallow 0, as it would prevent/block scrolling
			mouseWheelScrollSensitivity = 1;
		}
		const scrollbar = this._sanitizeScrollbarOpts(opts.scrollbar, defaults.scrollbar, mouseWheelScrollSensitivity);
		const minimap = this._sanitizeMinimapOpts(opts.minimap, defaults.minimap);

		return {
			extraEditorClassName: _string(opts.extraEditorClassName, defaults.extraEditorClassName),
			disableMonospaceOptimizations: disableMonospaceOptimizations,
			rulers: rulers,
			ariaLabel: _string(opts.ariaLabel, defaults.ariaLabel),
			renderLineNumbers: renderLineNumbers,
			renderCustomLineNumbers: renderCustomLineNumbers,
			selectOnLineNumbers: _boolean(opts.selectOnLineNumbers, defaults.selectOnLineNumbers),
			glyphMargin: _boolean(opts.glyphMargin, defaults.glyphMargin),
			revealHorizontalRightPadding: _clampedInt(opts.revealHorizontalRightPadding, defaults.revealHorizontalRightPadding, 0, 1000),
			roundedSelection: _boolean(opts.roundedSelection, defaults.roundedSelection),
			overviewRulerLanes: _clampedInt(opts.overviewRulerLanes, defaults.overviewRulerLanes, 0, 3),
			overviewRulerBorder: _boolean(opts.overviewRulerBorder, defaults.overviewRulerBorder),
			cursorBlinking: _cursorBlinkingStyleFromString(opts.cursorBlinking, defaults.cursorBlinking),
			mouseWheelZoom: _boolean(opts.mouseWheelZoom, defaults.mouseWheelZoom),
			cursorStyle: _cursorStyleFromString(opts.cursorStyle, defaults.cursorStyle),
			cursorWidth: _clampedInt(opts.cursorWidth, defaults.cursorWidth, 0, Number.MAX_VALUE),
			hideCursorInOverviewRuler: _boolean(opts.hideCursorInOverviewRuler, defaults.hideCursorInOverviewRuler),
			scrollBeyondLastLine: _boolean(opts.scrollBeyondLastLine, defaults.scrollBeyondLastLine),
			smoothScrolling: _boolean(opts.smoothScrolling, defaults.smoothScrolling),
			stopRenderingLineAfter: _clampedInt(opts.stopRenderingLineAfter, defaults.stopRenderingLineAfter, -1, Constants.MAX_SAFE_SMALL_INTEGER),
			renderWhitespace: renderWhitespace,
			renderControlCharacters: _boolean(opts.renderControlCharacters, defaults.renderControlCharacters),
			fontLigatures: fontLigatures,
			renderIndentGuides: _boolean(opts.renderIndentGuides, defaults.renderIndentGuides),
			renderLineHighlight: renderLineHighlight,
			scrollbar: scrollbar,
			minimap: minimap,
			fixedOverflowWidgets: _boolean(opts.fixedOverflowWidgets, defaults.fixedOverflowWidgets),
		};
	}

	private static _sanitizeContribInfo(opts: IEditorOptions, defaults: EditorContribOptions): EditorContribOptions {
		let quickSuggestions: boolean | { other: boolean, comments: boolean, strings: boolean };
		if (typeof opts.quickSuggestions === 'object') {
			quickSuggestions = { other: true, ...opts.quickSuggestions };
		} else {
			quickSuggestions = _boolean(opts.quickSuggestions, defaults.quickSuggestions);
		}
		// Compatibility support for acceptSuggestionOnEnter
		if (typeof opts.acceptSuggestionOnEnter === 'boolean') {
			opts.acceptSuggestionOnEnter = opts.acceptSuggestionOnEnter ? 'on' : 'off';
		}
		const find = this._santizeFindOpts(opts.find, defaults.find);
		return {
			selectionClipboard: _boolean(opts.selectionClipboard, defaults.selectionClipboard),
			hover: _boolean(opts.hover, defaults.hover),
			links: _boolean(opts.links, defaults.links),
			contextmenu: _boolean(opts.contextmenu, defaults.contextmenu),
			quickSuggestions: quickSuggestions,
			quickSuggestionsDelay: _clampedInt(opts.quickSuggestionsDelay, defaults.quickSuggestionsDelay, Constants.MIN_SAFE_SMALL_INTEGER, Constants.MAX_SAFE_SMALL_INTEGER),
			parameterHints: _boolean(opts.parameterHints, defaults.parameterHints),
			iconsInSuggestions: _boolean(opts.iconsInSuggestions, defaults.iconsInSuggestions),
			formatOnType: _boolean(opts.formatOnType, defaults.formatOnType),
			formatOnPaste: _boolean(opts.formatOnPaste, defaults.formatOnPaste),
			suggestOnTriggerCharacters: _boolean(opts.suggestOnTriggerCharacters, defaults.suggestOnTriggerCharacters),
			acceptSuggestionOnEnter: _stringSet<'on' | 'smart' | 'off'>(opts.acceptSuggestionOnEnter, defaults.acceptSuggestionOnEnter, ['on', 'smart', 'off']),
			acceptSuggestionOnCommitCharacter: _boolean(opts.acceptSuggestionOnCommitCharacter, defaults.acceptSuggestionOnCommitCharacter),
			snippetSuggestions: _stringSet<'top' | 'bottom' | 'inline' | 'none'>(opts.snippetSuggestions, defaults.snippetSuggestions, ['top', 'bottom', 'inline', 'none']),
			wordBasedSuggestions: _boolean(opts.wordBasedSuggestions, defaults.wordBasedSuggestions),
			suggestSelection: _stringSet<'first' | 'recentlyUsed' | 'recentlyUsedByPrefix'>(opts.suggestSelection, defaults.suggestSelection, ['first', 'recentlyUsed', 'recentlyUsedByPrefix']),
			suggestFontSize: _clampedInt(opts.suggestFontSize, defaults.suggestFontSize, 0, 1000),
			suggestLineHeight: _clampedInt(opts.suggestLineHeight, defaults.suggestLineHeight, 0, 1000),
			selectionHighlight: _boolean(opts.selectionHighlight, defaults.selectionHighlight),
			occurrencesHighlight: _boolean(opts.occurrencesHighlight, defaults.occurrencesHighlight),
			codeLens: _boolean(opts.codeLens, defaults.codeLens) && _boolean(opts.referenceInfos, true),
			folding: _boolean(opts.folding, defaults.folding),
			foldingStrategy: _stringSet<'auto' | 'indentation'>(opts.foldingStrategy, defaults.foldingStrategy, ['auto', 'indentation']),
			showFoldingControls: _stringSet<'always' | 'mouseover'>(opts.showFoldingControls, defaults.showFoldingControls, ['always', 'mouseover']),
			matchBrackets: _boolean(opts.matchBrackets, defaults.matchBrackets),
			find: find,
			colorDecorators: _boolean(opts.colorDecorators, defaults.colorDecorators),
			lightbulbEnabled: _boolean(opts.lightbulb ? opts.lightbulb.enabled : false, defaults.lightbulbEnabled)
		};
	}
}

/**
 * @internal
 */
export class InternalEditorOptionsFactory {

	private static _tweakValidatedOptions(opts: IValidatedEditorOptions, accessibilitySupport: platform.AccessibilitySupport): IValidatedEditorOptions {
		const accessibilityIsOn = (accessibilitySupport === platform.AccessibilitySupport.Enabled);
		const accessibilityIsOff = (accessibilitySupport === platform.AccessibilitySupport.Disabled);
		return {
			inDiffEditor: opts.inDiffEditor,
			wordSeparators: opts.wordSeparators,
			lineNumbersMinChars: opts.lineNumbersMinChars,
			lineDecorationsWidth: opts.lineDecorationsWidth,
			readOnly: opts.readOnly,
			mouseStyle: opts.mouseStyle,
			disableLayerHinting: opts.disableLayerHinting,
			automaticLayout: opts.automaticLayout,
			wordWrap: opts.wordWrap,
			wordWrapColumn: opts.wordWrapColumn,
			wordWrapMinified: opts.wordWrapMinified,
			wrappingIndent: opts.wrappingIndent,
			wordWrapBreakBeforeCharacters: opts.wordWrapBreakBeforeCharacters,
			wordWrapBreakAfterCharacters: opts.wordWrapBreakAfterCharacters,
			wordWrapBreakObtrusiveCharacters: opts.wordWrapBreakObtrusiveCharacters,
			autoClosingBrackets: opts.autoClosingBrackets,
			autoIndent: opts.autoIndent,
			dragAndDrop: opts.dragAndDrop,
			emptySelectionClipboard: opts.emptySelectionClipboard,
			useTabStops: opts.useTabStops,
			multiCursorModifier: opts.multiCursorModifier,
			multiCursorMergeOverlapping: opts.multiCursorMergeOverlapping,
			accessibilitySupport: opts.accessibilitySupport,

			viewInfo: {
				extraEditorClassName: opts.viewInfo.extraEditorClassName,
				disableMonospaceOptimizations: opts.viewInfo.disableMonospaceOptimizations,
				rulers: opts.viewInfo.rulers,
				ariaLabel: (accessibilityIsOff ? nls.localize('accessibilityOffAriaLabel', "The editor is not accessible at this time. Press Alt+F1 for options.") : opts.viewInfo.ariaLabel),
				renderLineNumbers: opts.viewInfo.renderLineNumbers,
				renderCustomLineNumbers: opts.viewInfo.renderCustomLineNumbers,
				selectOnLineNumbers: opts.viewInfo.selectOnLineNumbers,
				glyphMargin: opts.viewInfo.glyphMargin,
				revealHorizontalRightPadding: opts.viewInfo.revealHorizontalRightPadding,
				roundedSelection: (accessibilityIsOn ? false : opts.viewInfo.roundedSelection), // DISABLED WHEN SCREEN READER IS ATTACHED
				overviewRulerLanes: opts.viewInfo.overviewRulerLanes,
				overviewRulerBorder: opts.viewInfo.overviewRulerBorder,
				cursorBlinking: opts.viewInfo.cursorBlinking,
				mouseWheelZoom: opts.viewInfo.mouseWheelZoom,
				cursorStyle: opts.viewInfo.cursorStyle,
				cursorWidth: opts.viewInfo.cursorWidth,
				hideCursorInOverviewRuler: opts.viewInfo.hideCursorInOverviewRuler,
				scrollBeyondLastLine: opts.viewInfo.scrollBeyondLastLine,
				smoothScrolling: opts.viewInfo.smoothScrolling,
				stopRenderingLineAfter: opts.viewInfo.stopRenderingLineAfter,
				renderWhitespace: (accessibilityIsOn ? 'none' : opts.viewInfo.renderWhitespace), // DISABLED WHEN SCREEN READER IS ATTACHED
				renderControlCharacters: (accessibilityIsOn ? false : opts.viewInfo.renderControlCharacters), // DISABLED WHEN SCREEN READER IS ATTACHED
				fontLigatures: (accessibilityIsOn ? false : opts.viewInfo.fontLigatures), // DISABLED WHEN SCREEN READER IS ATTACHED
				renderIndentGuides: (accessibilityIsOn ? false : opts.viewInfo.renderIndentGuides), // DISABLED WHEN SCREEN READER IS ATTACHED
				renderLineHighlight: opts.viewInfo.renderLineHighlight,
				scrollbar: opts.viewInfo.scrollbar,
				minimap: {
					enabled: (accessibilityIsOn ? false : opts.viewInfo.minimap.enabled), // DISABLED WHEN SCREEN READER IS ATTACHED
					side: opts.viewInfo.minimap.side,
					renderCharacters: opts.viewInfo.minimap.renderCharacters,
					showSlider: opts.viewInfo.minimap.showSlider,
					maxColumn: opts.viewInfo.minimap.maxColumn
				},
				fixedOverflowWidgets: opts.viewInfo.fixedOverflowWidgets
			},

			contribInfo: {
				selectionClipboard: opts.contribInfo.selectionClipboard,
				hover: opts.contribInfo.hover,
				links: (accessibilityIsOn ? false : opts.contribInfo.links), // DISABLED WHEN SCREEN READER IS ATTACHED
				contextmenu: opts.contribInfo.contextmenu,
				quickSuggestions: opts.contribInfo.quickSuggestions,
				quickSuggestionsDelay: opts.contribInfo.quickSuggestionsDelay,
				parameterHints: opts.contribInfo.parameterHints,
				iconsInSuggestions: opts.contribInfo.iconsInSuggestions,
				formatOnType: opts.contribInfo.formatOnType,
				formatOnPaste: opts.contribInfo.formatOnPaste,
				suggestOnTriggerCharacters: opts.contribInfo.suggestOnTriggerCharacters,
				acceptSuggestionOnEnter: opts.contribInfo.acceptSuggestionOnEnter,
				acceptSuggestionOnCommitCharacter: opts.contribInfo.acceptSuggestionOnCommitCharacter,
				snippetSuggestions: opts.contribInfo.snippetSuggestions,
				wordBasedSuggestions: opts.contribInfo.wordBasedSuggestions,
				suggestSelection: opts.contribInfo.suggestSelection,
				suggestFontSize: opts.contribInfo.suggestFontSize,
				suggestLineHeight: opts.contribInfo.suggestLineHeight,
				selectionHighlight: (accessibilityIsOn ? false : opts.contribInfo.selectionHighlight), // DISABLED WHEN SCREEN READER IS ATTACHED
				occurrencesHighlight: (accessibilityIsOn ? false : opts.contribInfo.occurrencesHighlight), // DISABLED WHEN SCREEN READER IS ATTACHED
				codeLens: (accessibilityIsOn ? false : opts.contribInfo.codeLens), // DISABLED WHEN SCREEN READER IS ATTACHED
				folding: (accessibilityIsOn ? false : opts.contribInfo.folding), // DISABLED WHEN SCREEN READER IS ATTACHED
				foldingStrategy: opts.contribInfo.foldingStrategy,
				showFoldingControls: opts.contribInfo.showFoldingControls,
				matchBrackets: (accessibilityIsOn ? false : opts.contribInfo.matchBrackets), // DISABLED WHEN SCREEN READER IS ATTACHED
				find: opts.contribInfo.find,
				colorDecorators: opts.contribInfo.colorDecorators,
				lightbulbEnabled: opts.contribInfo.lightbulbEnabled
			}
		};
	}

	public static createInternalEditorOptions(env: IEnvironmentalOptions, _opts: IValidatedEditorOptions) {

		let accessibilitySupport: platform.AccessibilitySupport;
		if (_opts.accessibilitySupport === 'auto') {
			// The editor reads the `accessibilitySupport` from the environment
			accessibilitySupport = env.accessibilitySupport;
		} else if (_opts.accessibilitySupport === 'on') {
			accessibilitySupport = platform.AccessibilitySupport.Enabled;
		} else {
			accessibilitySupport = platform.AccessibilitySupport.Disabled;
		}

		// Disable some non critical features to get as best performance as possible
		// See https://github.com/Microsoft/vscode/issues/26730
		const opts = this._tweakValidatedOptions(_opts, accessibilitySupport);

		let lineDecorationsWidth: number;
		if (typeof opts.lineDecorationsWidth === 'string' && /^\d+(\.\d+)?ch$/.test(opts.lineDecorationsWidth)) {
			const multiple = parseFloat(opts.lineDecorationsWidth.substr(0, opts.lineDecorationsWidth.length - 2));
			lineDecorationsWidth = multiple * env.fontInfo.typicalHalfwidthCharacterWidth;
		} else {
			lineDecorationsWidth = _clampedInt(opts.lineDecorationsWidth, 0, 0, 1000);
		}
		if (opts.contribInfo.folding) {
			lineDecorationsWidth += 16;
		}

		const layoutInfo = EditorLayoutProvider.compute({
			outerWidth: env.outerWidth,
			outerHeight: env.outerHeight,
			showGlyphMargin: opts.viewInfo.glyphMargin,
			lineHeight: env.fontInfo.lineHeight,
			showLineNumbers: (opts.viewInfo.renderLineNumbers !== RenderLineNumbersType.Off),
			lineNumbersMinChars: opts.lineNumbersMinChars,
			lineNumbersDigitCount: env.lineNumbersDigitCount,
			lineDecorationsWidth: lineDecorationsWidth,
			typicalHalfwidthCharacterWidth: env.fontInfo.typicalHalfwidthCharacterWidth,
			maxDigitWidth: env.fontInfo.maxDigitWidth,
			verticalScrollbarWidth: opts.viewInfo.scrollbar.verticalScrollbarSize,
			horizontalScrollbarHeight: opts.viewInfo.scrollbar.horizontalScrollbarSize,
			scrollbarArrowSize: opts.viewInfo.scrollbar.arrowSize,
			verticalScrollbarHasArrows: opts.viewInfo.scrollbar.verticalHasArrows,
			minimap: opts.viewInfo.minimap.enabled,
			minimapSide: opts.viewInfo.minimap.side,
			minimapRenderCharacters: opts.viewInfo.minimap.renderCharacters,
			minimapMaxColumn: opts.viewInfo.minimap.maxColumn,
			pixelRatio: env.pixelRatio
		});

		let bareWrappingInfo: { isWordWrapMinified: boolean; isViewportWrapping: boolean; wrappingColumn: number; } = null;
		{
			const wordWrap = opts.wordWrap;
			const wordWrapColumn = opts.wordWrapColumn;
			const wordWrapMinified = opts.wordWrapMinified;

			if (accessibilitySupport === platform.AccessibilitySupport.Enabled) {
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

		const wrappingInfo: EditorWrappingInfo = {
			inDiffEditor: opts.inDiffEditor,
			isDominatedByLongLines: env.isDominatedByLongLines,
			isWordWrapMinified: bareWrappingInfo.isWordWrapMinified,
			isViewportWrapping: bareWrappingInfo.isViewportWrapping,
			wrappingColumn: bareWrappingInfo.wrappingColumn,
			wrappingIndent: opts.wrappingIndent,
			wordWrapBreakBeforeCharacters: opts.wordWrapBreakBeforeCharacters,
			wordWrapBreakAfterCharacters: opts.wordWrapBreakAfterCharacters,
			wordWrapBreakObtrusiveCharacters: opts.wordWrapBreakObtrusiveCharacters,
		};

		let className = 'monaco-editor';
		if (opts.viewInfo.extraEditorClassName) {
			className += ' ' + opts.viewInfo.extraEditorClassName;
		}
		if (env.extraEditorClassName) {
			className += ' ' + env.extraEditorClassName;
		}
		if (opts.viewInfo.fontLigatures) {
			className += ' enable-ligatures';
		}
		if (opts.mouseStyle === 'default') {
			className += ' mouse-default';
		} else if (opts.mouseStyle === 'copy') {
			className += ' mouse-copy';
		}

		return new InternalEditorOptions({
			canUseLayerHinting: opts.disableLayerHinting ? false : true,
			pixelRatio: env.pixelRatio,
			editorClassName: className,
			lineHeight: env.fontInfo.lineHeight,
			readOnly: opts.readOnly,
			accessibilitySupport: accessibilitySupport,
			multiCursorModifier: opts.multiCursorModifier,
			multiCursorMergeOverlapping: opts.multiCursorMergeOverlapping,
			wordSeparators: opts.wordSeparators,
			autoClosingBrackets: opts.autoClosingBrackets,
			autoIndent: opts.autoIndent,
			useTabStops: opts.useTabStops,
			tabFocusMode: opts.readOnly ? true : env.tabFocusMode,
			dragAndDrop: opts.dragAndDrop,
			emptySelectionClipboard: opts.emptySelectionClipboard && env.emptySelectionClipboard,
			layoutInfo: layoutInfo,
			fontInfo: env.fontInfo,
			viewInfo: opts.viewInfo,
			wrappingInfo: wrappingInfo,
			contribInfo: opts.contribInfo
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

/**
 * @internal
 */
export class EditorLayoutProvider {
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

		const viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth) / typicalHalfwidthCharacterWidth));

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
	insertSpaces: true,
	detectIndentation: true,
	trimAutoWhitespace: true
};

/**
 * @internal
 */
export const EDITOR_DEFAULTS: IValidatedEditorOptions = {
	inDiffEditor: false,
	wordSeparators: USUAL_WORD_SEPARATORS,
	lineNumbersMinChars: 5,
	lineDecorationsWidth: 10,
	readOnly: false,
	mouseStyle: 'text',
	disableLayerHinting: false,
	automaticLayout: false,
	wordWrap: 'off',
	wordWrapColumn: 80,
	wordWrapMinified: true,
	wrappingIndent: WrappingIndent.Same,
	wordWrapBreakBeforeCharacters: '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋',
	wordWrapBreakAfterCharacters: ' \t})]?|&,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣',
	wordWrapBreakObtrusiveCharacters: '.',
	autoClosingBrackets: true,
	autoIndent: true,
	dragAndDrop: true,
	emptySelectionClipboard: true,
	useTabStops: true,
	multiCursorModifier: 'altKey',
	multiCursorMergeOverlapping: true,
	accessibilitySupport: 'auto',

	viewInfo: {
		extraEditorClassName: '',
		disableMonospaceOptimizations: false,
		rulers: [],
		ariaLabel: nls.localize('editorViewAccessibleLabel', "Editor content"),
		renderLineNumbers: RenderLineNumbersType.On,
		renderCustomLineNumbers: null,
		selectOnLineNumbers: true,
		glyphMargin: true,
		revealHorizontalRightPadding: 30,
		roundedSelection: true,
		overviewRulerLanes: 2,
		overviewRulerBorder: true,
		cursorBlinking: TextEditorCursorBlinkingStyle.Blink,
		mouseWheelZoom: false,
		cursorStyle: TextEditorCursorStyle.Line,
		cursorWidth: 0,
		hideCursorInOverviewRuler: false,
		scrollBeyondLastLine: true,
		smoothScrolling: false,
		stopRenderingLineAfter: 10000,
		renderWhitespace: 'none',
		renderControlCharacters: false,
		fontLigatures: false,
		renderIndentGuides: true,
		renderLineHighlight: 'line',
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
			handleMouseWheel: true,
			mouseWheelScrollSensitivity: 1,
		},
		minimap: {
			enabled: true,
			side: 'right',
			showSlider: 'mouseover',
			renderCharacters: true,
			maxColumn: 120
		},
		fixedOverflowWidgets: false,
	},

	contribInfo: {
		selectionClipboard: true,
		hover: true,
		links: true,
		contextmenu: true,
		quickSuggestions: { other: true, comments: false, strings: false },
		quickSuggestionsDelay: 10,
		parameterHints: true,
		iconsInSuggestions: true,
		formatOnType: false,
		formatOnPaste: false,
		suggestOnTriggerCharacters: true,
		acceptSuggestionOnEnter: 'on',
		acceptSuggestionOnCommitCharacter: true,
		snippetSuggestions: 'inline',
		wordBasedSuggestions: true,
		suggestSelection: 'recentlyUsed',
		suggestFontSize: 0,
		suggestLineHeight: 0,
		selectionHighlight: true,
		occurrencesHighlight: true,
		codeLens: true,
		folding: true,
		foldingStrategy: 'auto',
		showFoldingControls: 'mouseover',
		matchBrackets: true,
		find: {
			seedSearchStringFromSelection: true,
			autoFindInSelection: false,
			globalFindClipboard: false
		},
		colorDecorators: true,
		lightbulbEnabled: true
	},
};
