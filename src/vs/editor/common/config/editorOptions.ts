/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import * as objects from 'vs/base/common/objects';

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

	/**
	 * @internal
	 */
	public clone(): InternalEditorScrollbarOptions {
		return new InternalEditorScrollbarOptions(this);
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

	/**
	 * @internal
	 */
	public clone(): InternalEditorMinimapOptions {
		return new InternalEditorMinimapOptions(this);
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
		this.scrollbar = source.scrollbar.clone();
		this.minimap = source.minimap.clone();
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

	/**
	 * @internal
	 */
	public clone(): InternalEditorViewOptions {
		return new InternalEditorViewOptions(this);
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
			&& objects.equals(this.quickSuggestions, other.quickSuggestions)
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
			&& objects.equals(this.wordBasedSuggestions, other.wordBasedSuggestions)
			&& this.suggestFontSize === other.suggestFontSize
			&& this.suggestLineHeight === other.suggestLineHeight
			&& this.selectionHighlight === other.selectionHighlight
			&& this.occurrencesHighlight === other.occurrencesHighlight
			&& this.codeLens === other.codeLens
			&& this.folding === other.folding
			&& this.matchBrackets === other.matchBrackets
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

	/**
	 * @internal
	 */
	public clone(): InternalEditorOptions {
		return new InternalEditorOptions(this);
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
			&& this.renderMinimap === other.renderMinimap
			&& this.minimapWidth === other.minimapWidth
			&& this.viewportColumn === other.viewportColumn
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
