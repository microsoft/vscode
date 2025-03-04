/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../base/common/arrays.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import * as objects from '../../../base/common/objects.js';
import * as platform from '../../../base/common/platform.js';
import { ScrollbarVisibility } from '../../../base/common/scrollable.js';
import { Constants } from '../../../base/common/uint.js';
import { FontInfo } from './fontInfo.js';
import { EDITOR_MODEL_DEFAULTS } from '../core/textModelDefaults.js';
import { USUAL_WORD_SEPARATORS } from '../core/wordHelper.js';
import * as nls from '../../../nls.js';
import { AccessibilitySupport } from '../../../platform/accessibility/common/accessibility.js';
import { IConfigurationPropertySchema } from '../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../platform/product/common/product.js';

//#region typed options

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
export type EditorAutoClosingEditStrategy = 'always' | 'auto' | 'never';

/**
 * Configuration options for auto indentation in the editor
 */
export const enum EditorAutoIndentStrategy {
	None = 0,
	Keep = 1,
	Brackets = 2,
	Advanced = 3,
	Full = 4
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
	 * Whether the aria-required attribute should be set on the editors textarea.
	 */
	ariaRequired?: boolean;
	/**
	 * Control whether a screen reader announces inline suggestion content immediately.
	 */
	screenReaderAnnounceInlineSuggestion?: boolean;
	/**
	 * The `tabindex` property of the editor's textarea
	 */
	tabIndex?: number;
	/**
	 * Render vertical lines at the specified columns.
	 * Defaults to empty array.
	 */
	rulers?: (number | IRulerOption)[];
	/**
	 * Locales used for segmenting lines into words when doing word related navigations or operations.
	 *
	 * Specify the BCP 47 language tag of the word you wish to recognize (e.g., ja, zh-CN, zh-Hant-TW, etc.).
	 * Defaults to empty array
	 */
	wordSegmenterLocales?: string | string[];
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
	 * Otherwise, if it is a truthy, line numbers will be rendered normally (equivalent of using an identity function).
	 * Otherwise, line numbers will not be rendered.
	 * Defaults to `on`.
	 */
	lineNumbers?: LineNumbersType;
	/**
	 * Controls the minimal number of visible leading and trailing lines surrounding the cursor.
	 * Defaults to 0.
	*/
	cursorSurroundingLines?: number;
	/**
	 * Controls when `cursorSurroundingLines` should be enforced
	 * Defaults to `default`, `cursorSurroundingLines` is not enforced when cursor position is changed
	 * by mouse.
	*/
	cursorSurroundingLinesStyle?: 'default' | 'all';
	/**
	 * Render last line number when the file ends with a newline.
	 * Defaults to 'on' for Windows and macOS and 'dimmed' for Linux.
	*/
	renderFinalNewline?: 'on' | 'off' | 'dimmed';
	/**
	 * Remove unusual line terminators like LINE SEPARATOR (LS), PARAGRAPH SEPARATOR (PS).
	 * Defaults to 'prompt'.
	 */
	unusualLineTerminators?: 'auto' | 'off' | 'prompt';
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
	 * Should the editor be read only. See also `domReadOnly`.
	 * Defaults to false.
	 */
	readOnly?: boolean;
	/**
	 * The message to display when the editor is readonly.
	 */
	readOnlyMessage?: IMarkdownString;
	/**
	 * Should the textarea used for input use the DOM `readonly` attribute.
	 * Defaults to false.
	 */
	domReadOnly?: boolean;
	/**
	 * Enable linked editing.
	 * Defaults to false.
	 */
	linkedEditing?: boolean;
	/**
	 * deprecated, use linkedEditing instead
	 */
	renameOnType?: boolean;
	/**
	 * Should the editor render validation decorations.
	 * Defaults to editable.
	 */
	renderValidationDecorations?: 'editable' | 'on' | 'off';
	/**
	 * Control the behavior and rendering of the scrollbars.
	 */
	scrollbar?: IEditorScrollbarOptions;
	/**
	 * Control the behavior of sticky scroll options
	 */
	stickyScroll?: IEditorStickyScrollOptions;
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
	 * Defaults to 3.
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
	 * Defaults to 'off'.
	 */
	cursorSmoothCaretAnimation?: 'off' | 'explicit' | 'on';
	/**
	 * Control the cursor style in insert mode.
	 * Defaults to 'line'.
	 */
	cursorStyle?: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
	/**
	 * Control the cursor style in overtype mode.
	 * Defaults to 'block'.
	 */
	overtypeCursorStyle?: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
	/**
	 *  Controls whether paste in overtype mode should overwrite or insert.
	 */
	overtypeOnPaste?: boolean;
	/**
	 * Control the width of the cursor when cursorStyle is set to 'line'
	 */
	cursorWidth?: number;
	/**
	 * Enable font ligatures.
	 * Defaults to false.
	 */
	fontLigatures?: boolean | string;
	/**
	 * Enable font variations.
	 * Defaults to false.
	 */
	fontVariations?: boolean | string;
	/**
	 * Controls whether to use default color decorations or not using the default document color provider
	 */
	defaultColorDecorators?: 'auto' | 'always' | 'never';
	/**
	 * Disable the use of `transform: translate3d(0px, 0px, 0px)` for the editor margin and lines layers.
	 * The usage of `transform: translate3d(0px, 0px, 0px)` acts as a hint for browsers to create an extra layer.
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
	 * Enable that the editor will install a ResizeObserver to check if its container dom node size has changed.
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
	 * Override the `wordWrap` setting.
	 */
	wordWrapOverride1?: 'off' | 'on' | 'inherit';
	/**
	 * Override the `wordWrapOverride1` setting.
	 */
	wordWrapOverride2?: 'off' | 'on' | 'inherit';
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
	 * Control indentation of wrapped lines. Can be: 'none', 'same', 'indent' or 'deepIndent'.
	 * Defaults to 'same' in vscode and to 'none' in monaco-editor.
	 */
	wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent';
	/**
	 * Controls the wrapping strategy to use.
	 * Defaults to 'simple'.
	 */
	wrappingStrategy?: 'simple' | 'advanced';
	/**
	 * Configure word wrapping characters. A break will be introduced before these characters.
	 */
	wordWrapBreakBeforeCharacters?: string;
	/**
	 * Configure word wrapping characters. A break will be introduced after these characters.
	 */
	wordWrapBreakAfterCharacters?: string;
	/**
	 * Sets whether line breaks appear wherever the text would otherwise overflow its content box.
	 * When wordBreak = 'normal', Use the default line break rule.
	 * When wordBreak = 'keepAll', Word breaks should not be used for Chinese/Japanese/Korean (CJK) text. Non-CJK text behavior is the same as for normal.
	 */
	wordBreak?: 'normal' | 'keepAll';
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
	 * Controls what is the condition to spawn a color picker from a color dectorator
	 */
	colorDecoratorsActivatedOn?: 'clickAndHover' | 'click' | 'hover';
	/**
	 * Controls the max number of color decorators that can be rendered in an editor at once.
	 */
	colorDecoratorsLimit?: number;
	/**
	 * Control the behaviour of comments in the editor.
	 */
	comments?: IEditorCommentsOptions;
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
	 * Enable that the editor scrolls only the predominant axis. Prevents horizontal drift when scrolling vertically on a trackpad.
	 * Defaults to true.
	 */
	scrollPredominantAxis?: boolean;
	/**
	 * Enable that the selection with the mouse and keys is doing column selection.
	 * Defaults to false.
	 */
	columnSelection?: boolean;
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
	 * Configure the behaviour when pasting a text with the line count equal to the cursor count.
	 * Defaults to 'spread'.
	 */
	multiCursorPaste?: 'spread' | 'full';
	/**
	 * Controls the max number of text cursors that can be in an active editor at once.
	 */
	multiCursorLimit?: number;
	/**
	 * Configure the editor's accessibility support.
	 * Defaults to 'auto'. It is best to leave this to 'auto'.
	 */
	accessibilitySupport?: 'auto' | 'off' | 'on';
	/**
	 * Controls the number of lines in the editor that can be read out by a screen reader
	 */
	accessibilityPageSize?: number;
	/**
	 * Suggest options.
	 */
	suggest?: ISuggestOptions;
	inlineSuggest?: IInlineSuggestOptions;
	/**
	 * Smart select options.
	 */
	smartSelect?: ISmartSelectOptions;
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
	 * Controls the spacing around the editor.
	 */
	padding?: IEditorPaddingOptions;
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
	 * Options for auto closing comments.
	 * Defaults to language defined behavior.
	 */
	autoClosingComments?: EditorAutoClosingStrategy;
	/**
	 * Options for auto closing quotes.
	 * Defaults to language defined behavior.
	 */
	autoClosingQuotes?: EditorAutoClosingStrategy;
	/**
	 * Options for pressing backspace near quotes or bracket pairs.
	 */
	autoClosingDelete?: EditorAutoClosingEditStrategy;
	/**
	 * Options for typing over closing quotes or brackets.
	 */
	autoClosingOvertype?: EditorAutoClosingEditStrategy;
	/**
	 * Options for auto surrounding.
	 * Defaults to always allowing auto surrounding.
	 */
	autoSurround?: EditorAutoSurroundStrategy;
	/**
	 * Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.
	 * Defaults to advanced.
	 */
	autoIndent?: 'none' | 'keep' | 'brackets' | 'advanced' | 'full';
	/**
	 * Emulate selection behaviour of tab characters when using spaces for indentation.
	 * This means selection will stick to tab stops.
	 */
	stickyTabStops?: boolean;
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
	 * Defaults to 'singleFile'.
	 * 'off' disables occurrence highlighting
	 * 'singleFile' triggers occurrence highlighting in the current document
	 * 'multiFile'  triggers occurrence highlighting across valid open documents
	 */
	occurrencesHighlight?: 'off' | 'singleFile' | 'multiFile';
	/**
	 * Controls delay for occurrences highlighting
	 * Defaults to 250.
	 * Minimum value is 0
	 * Maximum value is 2000
	 */
	occurrencesHighlightDelay?: number;
	/**
	 * Show code lens
	 * Defaults to true.
	 */
	codeLens?: boolean;
	/**
	 * Code lens font family. Defaults to editor font family.
	 */
	codeLensFontFamily?: string;
	/**
	 * Code lens font size. Default to 90% of the editor font size
	 */
	codeLensFontSize?: number;
	/**
	 * Control the behavior and rendering of the code action lightbulb.
	 */
	lightbulb?: IEditorLightbulbOptions;
	/**
	 * Timeout for running code actions on save.
	 */
	codeActionsOnSaveTimeout?: number;
	/**
	 * Enable code folding.
	 * Defaults to true.
	 */
	folding?: boolean;
	/**
	 * Selects the folding strategy. 'auto' uses the strategies contributed for the current document, 'indentation' uses the indentation based folding strategy.
	 * Defaults to 'auto'.
	 */
	foldingStrategy?: 'auto' | 'indentation';
	/**
	 * Enable highlight for folded regions.
	 * Defaults to true.
	 */
	foldingHighlight?: boolean;
	/**
	 * Auto fold imports folding regions.
	 * Defaults to true.
	 */
	foldingImportsByDefault?: boolean;
	/**
	 * Maximum number of foldable regions.
	 * Defaults to 5000.
	 */
	foldingMaximumRegions?: number;
	/**
	 * Controls whether the fold actions in the gutter stay always visible or hide unless the mouse is over the gutter.
	 * Defaults to 'mouseover'.
	 */
	showFoldingControls?: 'always' | 'never' | 'mouseover';
	/**
	 * Controls whether clicking on the empty content after a folded line will unfold the line.
	 * Defaults to false.
	 */
	unfoldOnClickAfterEndOfLine?: boolean;
	/**
	 * Enable highlighting of matching brackets.
	 * Defaults to 'always'.
	 */
	matchBrackets?: 'never' | 'near' | 'always';
	/**
	 * Enable experimental rendering using WebGPU.
	 * Defaults to 'off'.
	 */
	experimentalGpuAcceleration?: 'on' | 'off';
	/**
	 * Enable experimental whitespace rendering.
	 * Defaults to 'svg'.
	 */
	experimentalWhitespaceRendering?: 'svg' | 'font' | 'off';
	/**
	 * Enable rendering of whitespace.
	 * Defaults to 'selection'.
	 */
	renderWhitespace?: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	/**
	 * Enable rendering of control characters.
	 * Defaults to true.
	 */
	renderControlCharacters?: boolean;
	/**
	 * Enable rendering of current line highlight.
	 * Defaults to all.
	 */
	renderLineHighlight?: 'none' | 'gutter' | 'line' | 'all';
	/**
	 * Control if the current line highlight should be rendered only the editor is focused.
	 * Defaults to false.
	 */
	renderLineHighlightOnlyWhenFocus?: boolean;
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
	fontWeight?: string;
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
	 * Controls whether to focus the inline editor in the peek widget by default.
	 * Defaults to false.
	 */
	peekWidgetDefaultFocus?: 'tree' | 'editor';

	/**
	 * Sets a placeholder for the editor.
	 * If set, the placeholder is shown if the editor is empty.
	*/
	placeholder?: string | undefined;

	/**
	 * Controls whether the definition link opens element in the peek widget.
	 * Defaults to false.
	 */
	definitionLinkOpensInPeek?: boolean;
	/**
	 * Controls strikethrough deprecated variables.
	 */
	showDeprecated?: boolean;
	/**
	 * Controls whether suggestions allow matches in the middle of the word instead of only at the beginning
	 */
	matchOnWordStartOnly?: boolean;
	/**
	 * Control the behavior and rendering of the inline hints.
	 */
	inlayHints?: IEditorInlayHintsOptions;
	/**
	 * Control if the editor should use shadow DOM.
	 */
	useShadowDOM?: boolean;
	/**
	 * Controls the behavior of editor guides.
	*/
	guides?: IGuidesOptions;

	/**
	 * Controls the behavior of the unicode highlight feature
	 * (by default, ambiguous and invisible characters are highlighted).
	 */
	unicodeHighlight?: IUnicodeHighlightOptions;

	/**
	 * Configures bracket pair colorization (disabled by default).
	*/
	bracketPairColorization?: IBracketPairColorizationOptions;

	/**
	 * Controls dropping into the editor from an external source.
	 *
	 * When enabled, this shows a preview of the drop location and triggers an `onDropIntoEditor` event.
	 */
	dropIntoEditor?: IDropIntoEditorOptions;

	/**
	 * Sets whether the new experimental edit context should be used instead of the text area.
	 */
	experimentalEditContextEnabled?: boolean;

	/**
	 * Controls support for changing how content is pasted into the editor.
	 */
	pasteAs?: IPasteAsOptions;

	/**
	 * Controls whether the editor / terminal receives tabs or defers them to the workbench for navigation.
	 */
	tabFocusMode?: boolean;

	/**
	 * Controls whether the accessibility hint should be provided to screen reader users when an inline completion is shown.
	 */
	inlineCompletionsAccessibilityVerbose?: boolean;
}

/**
 * @internal
 * The width of the minimap gutter, in pixels.
 */
export const MINIMAP_GUTTER_WIDTH = 8;

export interface IDiffEditorBaseOptions {
	/**
	 * Allow the user to resize the diff editor split view.
	 * Defaults to true.
	 */
	enableSplitViewResizing?: boolean;

	/**
	 * The default ratio when rendering side-by-side editors.
	 * Must be a number between 0 and 1, min sizes apply.
	 * Defaults to 0.5
	 */
	splitViewDefaultRatio?: number;

	/**
	 * Render the differences in two side-by-side editors.
	 * Defaults to true.
	 */
	renderSideBySide?: boolean;

	/**
	 * When `renderSideBySide` is enabled, `useInlineViewWhenSpaceIsLimited` is set,
	 * and the diff editor has a width less than `renderSideBySideInlineBreakpoint`, the inline view is used.
	 */
	renderSideBySideInlineBreakpoint?: number | undefined;

	/**
	 * When `renderSideBySide` is enabled, `useInlineViewWhenSpaceIsLimited` is set,
	 * and the diff editor has a width less than `renderSideBySideInlineBreakpoint`, the inline view is used.
	 */
	useInlineViewWhenSpaceIsLimited?: boolean;

	/**
	 * If set, the diff editor is optimized for small views.
	 * Defaults to `false`.
	*/
	compactMode?: boolean;

	/**
	 * Timeout in milliseconds after which diff computation is cancelled.
	 * Defaults to 5000.
	 */
	maxComputationTime?: number;

	/**
	 * Maximum supported file size in MB.
	 * Defaults to 50.
	 */
	maxFileSize?: number;

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
	 * Shows icons in the glyph margin to revert changes.
	 * Default to true.
	 */
	renderMarginRevertIcon?: boolean;

	/**
	 * Indicates if the gutter menu should be rendered.
	*/
	renderGutterMenu?: boolean;

	/**
	 * Original model should be editable?
	 * Defaults to false.
	 */
	originalEditable?: boolean;

	/**
	 * Should the diff editor enable code lens?
	 * Defaults to false.
	 */
	diffCodeLens?: boolean;

	/**
	 * Is the diff editor should render overview ruler
	 * Defaults to true
	 */
	renderOverviewRuler?: boolean;

	/**
	 * Control the wrapping of the diff editor.
	 */
	diffWordWrap?: 'off' | 'on' | 'inherit';

	/**
	 * Diff Algorithm
	*/
	diffAlgorithm?: 'legacy' | 'advanced';

	/**
	 * Whether the diff editor aria label should be verbose.
	 */
	accessibilityVerbose?: boolean;

	experimental?: {
		/**
		 * Defaults to false.
		 */
		showMoves?: boolean;

		showEmptyDecorations?: boolean;

		/**
		 * Only applies when `renderSideBySide` is set to false.
		*/
		useTrueInlineView?: boolean;
	};

	/**
	 * Is the diff editor inside another editor
	 * Defaults to false
	 */
	isInEmbeddedEditor?: boolean;

	/**
	 * If the diff editor should only show the difference review mode.
	 */
	onlyShowAccessibleDiffViewer?: boolean;

	hideUnchangedRegions?: {
		enabled?: boolean;
		revealLineCount?: number;
		minimumLineCount?: number;
		contextLineCount?: number;
	};
}

/**
 * Configuration options for the diff editor.
 */
export interface IDiffEditorOptions extends IEditorOptions, IDiffEditorBaseOptions {
}

/**
 * @internal
 */
export type ValidDiffEditorBaseOptions = Readonly<Required<IDiffEditorBaseOptions>>;

//#endregion

/**
 * An event describing that the configuration of the editor has changed.
 */
export class ConfigurationChangedEvent {
	private readonly _values: boolean[];
	/**
	 * @internal
	 */
	constructor(values: boolean[]) {
		this._values = values;
	}
	public hasChanged(id: EditorOption): boolean {
		return this._values[id];
	}
}

/**
 * All computed editor options.
 */
export interface IComputedEditorOptions {
	get<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T>;
}

//#region IEditorOption

/**
 * @internal
 */
export interface IEnvironmentalOptions {
	readonly memory: ComputeOptionsMemory | null;
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly fontInfo: FontInfo;
	readonly extraEditorClassName: string;
	readonly isDominatedByLongLines: boolean;
	readonly viewLineCount: number;
	readonly lineNumbersDigitCount: number;
	readonly emptySelectionClipboard: boolean;
	readonly pixelRatio: number;
	readonly tabFocusMode: boolean;
	readonly inputMode: 'insert' | 'overtype';
	readonly accessibilitySupport: AccessibilitySupport;
	readonly glyphMarginDecorationLaneCount: number;
}

/**
 * @internal
 */
export class ComputeOptionsMemory {

	public stableMinimapLayoutInput: IMinimapLayoutInput | null;
	public stableFitMaxMinimapScale: number;
	public stableFitRemainingWidth: number;

	constructor() {
		this.stableMinimapLayoutInput = null;
		this.stableFitMaxMinimapScale = 0;
		this.stableFitRemainingWidth = 0;
	}
}

export interface IEditorOption<K extends EditorOption, V> {
	readonly id: K;
	readonly name: string;
	defaultValue: V;
	/**
	 * @internal
	 */
	readonly schema: IConfigurationPropertySchema | { [path: string]: IConfigurationPropertySchema } | undefined;
	/**
	 * @internal
	 */
	validate(input: any): V;
	/**
	 * @internal
	 */
	compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: V): V;

	/**
	 * Might modify `value`.
	*/
	applyUpdate(value: V | undefined, update: V): ApplyUpdateResult<V>;
}

/**
 * @internal
 */
type PossibleKeyName0<V> = { [K in keyof IEditorOptions]: IEditorOptions[K] extends V | undefined ? K : never }[keyof IEditorOptions];
/**
 * @internal
 */
type PossibleKeyName<V> = NonNullable<PossibleKeyName0<V>>;

/**
 * @internal
 */
abstract class BaseEditorOption<K extends EditorOption, T, V> implements IEditorOption<K, V> {

	public readonly id: K;
	public readonly name: string;
	public readonly defaultValue: V;
	public readonly schema: IConfigurationPropertySchema | { [path: string]: IConfigurationPropertySchema } | undefined;

	constructor(id: K, name: PossibleKeyName<T>, defaultValue: V, schema?: IConfigurationPropertySchema | { [path: string]: IConfigurationPropertySchema }) {
		this.id = id;
		this.name = name;
		this.defaultValue = defaultValue;
		this.schema = schema;
	}

	public applyUpdate(value: V | undefined, update: V): ApplyUpdateResult<V> {
		return applyUpdate(value, update);
	}

	public abstract validate(input: any): V;

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: V): V {
		return value;
	}
}

export class ApplyUpdateResult<T> {
	constructor(
		public readonly newValue: T,
		public readonly didChange: boolean
	) { }
}

function applyUpdate<T>(value: T | undefined, update: T): ApplyUpdateResult<T> {
	if (typeof value !== 'object' || typeof update !== 'object' || !value || !update) {
		return new ApplyUpdateResult(update, value !== update);
	}
	if (Array.isArray(value) || Array.isArray(update)) {
		const arrayEquals = Array.isArray(value) && Array.isArray(update) && arrays.equals(value, update);
		return new ApplyUpdateResult(update, !arrayEquals);
	}
	let didChange = false;
	for (const key in update) {
		if ((update as T & object).hasOwnProperty(key)) {
			const result = applyUpdate(value[key], update[key]);
			if (result.didChange) {
				value[key] = result.newValue;
				didChange = true;
			}
		}
	}
	return new ApplyUpdateResult(value, didChange);
}

/**
 * @internal
 */
abstract class ComputedEditorOption<K extends EditorOption, V> implements IEditorOption<K, V> {

	public readonly id: K;
	public readonly name: '_never_';
	public readonly defaultValue: V;
	public readonly schema: IConfigurationPropertySchema | undefined = undefined;

	constructor(id: K) {
		this.id = id;
		this.name = '_never_';
		this.defaultValue = <any>undefined;
	}

	public applyUpdate(value: V | undefined, update: V): ApplyUpdateResult<V> {
		return applyUpdate(value, update);
	}

	public validate(input: any): V {
		return this.defaultValue;
	}

	public abstract compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: V): V;
}

class SimpleEditorOption<K extends EditorOption, V> implements IEditorOption<K, V> {

	public readonly id: K;
	public readonly name: PossibleKeyName<V>;
	public readonly defaultValue: V;
	public readonly schema: IConfigurationPropertySchema | undefined;

	constructor(id: K, name: PossibleKeyName<V>, defaultValue: V, schema?: IConfigurationPropertySchema) {
		this.id = id;
		this.name = name;
		this.defaultValue = defaultValue;
		this.schema = schema;
	}

	public applyUpdate(value: V | undefined, update: V): ApplyUpdateResult<V> {
		return applyUpdate(value, update);
	}

	public validate(input: any): V {
		if (typeof input === 'undefined') {
			return this.defaultValue;
		}
		return input as any;
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: V): V {
		return value;
	}
}

/**
 * @internal
 */
export function boolean(value: any, defaultValue: boolean): boolean {
	if (typeof value === 'undefined') {
		return defaultValue;
	}
	if (value === 'false') {
		// treat the string 'false' as false
		return false;
	}
	return Boolean(value);
}

class EditorBooleanOption<K extends EditorOption> extends SimpleEditorOption<K, boolean> {

	constructor(id: K, name: PossibleKeyName<boolean>, defaultValue: boolean, schema: IConfigurationPropertySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'boolean';
			schema.default = defaultValue;
		}
		super(id, name, defaultValue, schema);
	}

	public override validate(input: any): boolean {
		return boolean(input, this.defaultValue);
	}
}

/**
 * @internal
 */
export function clampedInt<T>(value: any, defaultValue: T, minimum: number, maximum: number): number | T {
	if (typeof value === 'undefined') {
		return defaultValue;
	}
	let r = parseInt(value, 10);
	if (isNaN(r)) {
		return defaultValue;
	}
	r = Math.max(minimum, r);
	r = Math.min(maximum, r);
	return r | 0;
}

class EditorIntOption<K extends EditorOption> extends SimpleEditorOption<K, number> {

	public static clampedInt<T>(value: any, defaultValue: T, minimum: number, maximum: number): number | T {
		return clampedInt(value, defaultValue, minimum, maximum);
	}

	public readonly minimum: number;
	public readonly maximum: number;

	constructor(id: K, name: PossibleKeyName<number>, defaultValue: number, minimum: number, maximum: number, schema: IConfigurationPropertySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'integer';
			schema.default = defaultValue;
			schema.minimum = minimum;
			schema.maximum = maximum;
		}
		super(id, name, defaultValue, schema);
		this.minimum = minimum;
		this.maximum = maximum;
	}

	public override validate(input: any): number {
		return EditorIntOption.clampedInt(input, this.defaultValue, this.minimum, this.maximum);
	}
}
/**
 * @internal
 */
export function clampedFloat<T extends number>(value: any, defaultValue: T, minimum: number, maximum: number): number | T {
	if (typeof value === 'undefined') {
		return defaultValue;
	}
	const r = EditorFloatOption.float(value, defaultValue);
	return EditorFloatOption.clamp(r, minimum, maximum);
}

class EditorFloatOption<K extends EditorOption> extends SimpleEditorOption<K, number> {

	public static clamp(n: number, min: number, max: number): number {
		if (n < min) {
			return min;
		}
		if (n > max) {
			return max;
		}
		return n;
	}

	public static float(value: any, defaultValue: number): number {
		if (typeof value === 'number') {
			return value;
		}
		if (typeof value === 'undefined') {
			return defaultValue;
		}
		const r = parseFloat(value);
		return (isNaN(r) ? defaultValue : r);
	}

	public readonly validationFn: (value: number) => number;

	constructor(id: K, name: PossibleKeyName<number>, defaultValue: number, validationFn: (value: number) => number, schema?: IConfigurationPropertySchema) {
		if (typeof schema !== 'undefined') {
			schema.type = 'number';
			schema.default = defaultValue;
		}
		super(id, name, defaultValue, schema);
		this.validationFn = validationFn;
	}

	public override validate(input: any): number {
		return this.validationFn(EditorFloatOption.float(input, this.defaultValue));
	}
}

class EditorStringOption<K extends EditorOption> extends SimpleEditorOption<K, string> {

	public static string(value: any, defaultValue: string): string {
		if (typeof value !== 'string') {
			return defaultValue;
		}
		return value;
	}

	constructor(id: K, name: PossibleKeyName<string>, defaultValue: string, schema: IConfigurationPropertySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'string';
			schema.default = defaultValue;
		}
		super(id, name, defaultValue, schema);
	}

	public override validate(input: any): string {
		return EditorStringOption.string(input, this.defaultValue);
	}
}

/**
 * @internal
 */
export function stringSet<T>(value: T | undefined, defaultValue: T, allowedValues: ReadonlyArray<T>, renamedValues?: Record<string, T>): T {
	if (typeof value !== 'string') {
		return defaultValue;
	}
	if (renamedValues && value in renamedValues) {
		return renamedValues[value];
	}
	if (allowedValues.indexOf(value) === -1) {
		return defaultValue;
	}
	return value;
}

class EditorStringEnumOption<K extends EditorOption, V extends string> extends SimpleEditorOption<K, V> {

	private readonly _allowedValues: ReadonlyArray<V>;

	constructor(id: K, name: PossibleKeyName<V>, defaultValue: V, allowedValues: ReadonlyArray<V>, schema: IConfigurationPropertySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'string';
			schema.enum = <any>allowedValues;
			schema.default = defaultValue;
		}
		super(id, name, defaultValue, schema);
		this._allowedValues = allowedValues;
	}

	public override validate(input: any): V {
		return stringSet<V>(input, this.defaultValue, this._allowedValues);
	}
}

class EditorEnumOption<K extends EditorOption, T extends string, V> extends BaseEditorOption<K, T, V> {

	private readonly _allowedValues: T[];
	private readonly _convert: (value: T) => V;

	constructor(id: K, name: PossibleKeyName<T>, defaultValue: V, defaultStringValue: string, allowedValues: T[], convert: (value: T) => V, schema: IConfigurationPropertySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'string';
			schema.enum = allowedValues;
			schema.default = defaultStringValue;
		}
		super(id, name, defaultValue, schema);
		this._allowedValues = allowedValues;
		this._convert = convert;
	}

	public validate(input: any): V {
		if (typeof input !== 'string') {
			return this.defaultValue;
		}
		if (this._allowedValues.indexOf(<T>input) === -1) {
			return this.defaultValue;
		}
		return this._convert(<any>input);
	}
}

//#endregion

//#region autoIndent

function _autoIndentFromString(autoIndent: 'none' | 'keep' | 'brackets' | 'advanced' | 'full'): EditorAutoIndentStrategy {
	switch (autoIndent) {
		case 'none': return EditorAutoIndentStrategy.None;
		case 'keep': return EditorAutoIndentStrategy.Keep;
		case 'brackets': return EditorAutoIndentStrategy.Brackets;
		case 'advanced': return EditorAutoIndentStrategy.Advanced;
		case 'full': return EditorAutoIndentStrategy.Full;
	}
}

//#endregion

//#region accessibilitySupport

class EditorAccessibilitySupport extends BaseEditorOption<EditorOption.accessibilitySupport, 'auto' | 'off' | 'on', AccessibilitySupport> {

	constructor() {
		super(
			EditorOption.accessibilitySupport, 'accessibilitySupport', AccessibilitySupport.Unknown,
			{
				type: 'string',
				enum: ['auto', 'on', 'off'],
				enumDescriptions: [
					nls.localize('accessibilitySupport.auto', "Use platform APIs to detect when a Screen Reader is attached."),
					nls.localize('accessibilitySupport.on', "Optimize for usage with a Screen Reader."),
					nls.localize('accessibilitySupport.off', "Assume a screen reader is not attached."),
				],
				default: 'auto',
				tags: ['accessibility'],
				description: nls.localize('accessibilitySupport', "Controls if the UI should run in a mode where it is optimized for screen readers.")
			}
		);
	}

	public validate(input: any): AccessibilitySupport {
		switch (input) {
			case 'auto': return AccessibilitySupport.Unknown;
			case 'off': return AccessibilitySupport.Disabled;
			case 'on': return AccessibilitySupport.Enabled;
		}
		return this.defaultValue;
	}

	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: AccessibilitySupport): AccessibilitySupport {
		if (value === AccessibilitySupport.Unknown) {
			// The editor reads the `accessibilitySupport` from the environment
			return env.accessibilitySupport;
		}
		return value;
	}
}

//#endregion

//#region comments

/**
 * Configuration options for editor comments
 */
export interface IEditorCommentsOptions {
	/**
	 * Insert a space after the line comment token and inside the block comments tokens.
	 * Defaults to true.
	 */
	insertSpace?: boolean;
	/**
	 * Ignore empty lines when inserting line comments.
	 * Defaults to true.
	 */
	ignoreEmptyLines?: boolean;
}

/**
 * @internal
 */
export type EditorCommentsOptions = Readonly<Required<IEditorCommentsOptions>>;

class EditorComments extends BaseEditorOption<EditorOption.comments, IEditorCommentsOptions, EditorCommentsOptions> {

	constructor() {
		const defaults: EditorCommentsOptions = {
			insertSpace: true,
			ignoreEmptyLines: true,
		};
		super(
			EditorOption.comments, 'comments', defaults,
			{
				'editor.comments.insertSpace': {
					type: 'boolean',
					default: defaults.insertSpace,
					description: nls.localize('comments.insertSpace', "Controls whether a space character is inserted when commenting.")
				},
				'editor.comments.ignoreEmptyLines': {
					type: 'boolean',
					default: defaults.ignoreEmptyLines,
					description: nls.localize('comments.ignoreEmptyLines', 'Controls if empty lines should be ignored with toggle, add or remove actions for line comments.')
				},
			}
		);
	}

	public validate(_input: any): EditorCommentsOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorCommentsOptions;
		return {
			insertSpace: boolean(input.insertSpace, this.defaultValue.insertSpace),
			ignoreEmptyLines: boolean(input.ignoreEmptyLines, this.defaultValue.ignoreEmptyLines),
		};
	}
}

//#endregion

//#region cursorBlinking

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
 * @internal
 */
export function cursorBlinkingStyleFromString(cursorBlinkingStyle: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'): TextEditorCursorBlinkingStyle {
	switch (cursorBlinkingStyle) {
		case 'blink': return TextEditorCursorBlinkingStyle.Blink;
		case 'smooth': return TextEditorCursorBlinkingStyle.Smooth;
		case 'phase': return TextEditorCursorBlinkingStyle.Phase;
		case 'expand': return TextEditorCursorBlinkingStyle.Expand;
		case 'solid': return TextEditorCursorBlinkingStyle.Solid;
	}
}

//#endregion

//#region cursorStyle

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
		case TextEditorCursorStyle.Line: return 'line';
		case TextEditorCursorStyle.Block: return 'block';
		case TextEditorCursorStyle.Underline: return 'underline';
		case TextEditorCursorStyle.LineThin: return 'line-thin';
		case TextEditorCursorStyle.BlockOutline: return 'block-outline';
		case TextEditorCursorStyle.UnderlineThin: return 'underline-thin';
	}
}

/**
 * @internal
 */
export function cursorStyleFromString(cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin'): TextEditorCursorStyle {
	switch (cursorStyle) {
		case 'line': return TextEditorCursorStyle.Line;
		case 'block': return TextEditorCursorStyle.Block;
		case 'underline': return TextEditorCursorStyle.Underline;
		case 'line-thin': return TextEditorCursorStyle.LineThin;
		case 'block-outline': return TextEditorCursorStyle.BlockOutline;
		case 'underline-thin': return TextEditorCursorStyle.UnderlineThin;
	}
}

//#endregion

//#region editorClassName

class EditorClassName extends ComputedEditorOption<EditorOption.editorClassName, string> {

	constructor() {
		super(EditorOption.editorClassName);
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, _: string): string {
		const classNames = ['monaco-editor'];
		if (options.get(EditorOption.extraEditorClassName)) {
			classNames.push(options.get(EditorOption.extraEditorClassName));
		}
		if (env.extraEditorClassName) {
			classNames.push(env.extraEditorClassName);
		}
		if (options.get(EditorOption.mouseStyle) === 'default') {
			classNames.push('mouse-default');
		} else if (options.get(EditorOption.mouseStyle) === 'copy') {
			classNames.push('mouse-copy');
		}

		if (options.get(EditorOption.showUnused)) {
			classNames.push('showUnused');
		}

		if (options.get(EditorOption.showDeprecated)) {
			classNames.push('showDeprecated');
		}

		return classNames.join(' ');
	}
}

//#endregion

//#region emptySelectionClipboard

class EditorEmptySelectionClipboard extends EditorBooleanOption<EditorOption.emptySelectionClipboard> {

	constructor() {
		super(
			EditorOption.emptySelectionClipboard, 'emptySelectionClipboard', true,
			{ description: nls.localize('emptySelectionClipboard', "Controls whether copying without a selection copies the current line.") }
		);
	}

	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: boolean): boolean {
		return value && env.emptySelectionClipboard;
	}
}

//#endregion

//#region find

/**
 * Configuration options for editor find widget
 */
export interface IEditorFindOptions {
	/**
	* Controls whether the cursor should move to find matches while typing.
	*/
	cursorMoveOnType?: boolean;
	/**
	 * Controls if we seed search string in the Find Widget with editor selection.
	 */
	seedSearchStringFromSelection?: 'never' | 'always' | 'selection';
	/**
	 * Controls if Find in Selection flag is turned on in the editor.
	 */
	autoFindInSelection?: 'never' | 'always' | 'multiline';
	/*
	 * Controls whether the Find Widget should add extra lines on top of the editor.
	 */
	addExtraSpaceOnTop?: boolean;
	/**
	 * @internal
	 * Controls if the Find Widget should read or modify the shared find clipboard on macOS
	 */
	globalFindClipboard?: boolean;
	/**
	 * Controls whether the search result and diff result automatically restarts from the beginning (or the end) when no further matches can be found
	 */
	loop?: boolean;
	/**
	 * @internal
	 * Controls how the find widget search history should be stored
	 */
	history?: 'never' | 'workspace';
	/**
	 * @internal
	 * Controls how the replace widget search history should be stored
	 */
	replaceHistory?: 'never' | 'workspace';
}

/**
 * @internal
 */
export type EditorFindOptions = Readonly<Required<IEditorFindOptions>>;

class EditorFind extends BaseEditorOption<EditorOption.find, IEditorFindOptions, EditorFindOptions> {

	constructor() {
		const defaults: EditorFindOptions = {
			cursorMoveOnType: true,
			seedSearchStringFromSelection: 'always',
			autoFindInSelection: 'never',
			globalFindClipboard: false,
			addExtraSpaceOnTop: true,
			loop: true,
			history: 'workspace',
			replaceHistory: 'workspace',
		};
		super(
			EditorOption.find, 'find', defaults,
			{
				'editor.find.cursorMoveOnType': {
					type: 'boolean',
					default: defaults.cursorMoveOnType,
					description: nls.localize('find.cursorMoveOnType', "Controls whether the cursor should jump to find matches while typing.")
				},
				'editor.find.seedSearchStringFromSelection': {
					type: 'string',
					enum: ['never', 'always', 'selection'],
					default: defaults.seedSearchStringFromSelection,
					enumDescriptions: [
						nls.localize('editor.find.seedSearchStringFromSelection.never', 'Never seed search string from the editor selection.'),
						nls.localize('editor.find.seedSearchStringFromSelection.always', 'Always seed search string from the editor selection, including word at cursor position.'),
						nls.localize('editor.find.seedSearchStringFromSelection.selection', 'Only seed search string from the editor selection.')
					],
					description: nls.localize('find.seedSearchStringFromSelection', "Controls whether the search string in the Find Widget is seeded from the editor selection.")
				},
				'editor.find.autoFindInSelection': {
					type: 'string',
					enum: ['never', 'always', 'multiline'],
					default: defaults.autoFindInSelection,
					enumDescriptions: [
						nls.localize('editor.find.autoFindInSelection.never', 'Never turn on Find in Selection automatically (default).'),
						nls.localize('editor.find.autoFindInSelection.always', 'Always turn on Find in Selection automatically.'),
						nls.localize('editor.find.autoFindInSelection.multiline', 'Turn on Find in Selection automatically when multiple lines of content are selected.')
					],
					description: nls.localize('find.autoFindInSelection', "Controls the condition for turning on Find in Selection automatically.")
				},
				'editor.find.globalFindClipboard': {
					type: 'boolean',
					default: defaults.globalFindClipboard,
					description: nls.localize('find.globalFindClipboard', "Controls whether the Find Widget should read or modify the shared find clipboard on macOS."),
					included: platform.isMacintosh
				},
				'editor.find.addExtraSpaceOnTop': {
					type: 'boolean',
					default: defaults.addExtraSpaceOnTop,
					description: nls.localize('find.addExtraSpaceOnTop', "Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.")
				},
				'editor.find.loop': {
					type: 'boolean',
					default: defaults.loop,
					description: nls.localize('find.loop', "Controls whether the search automatically restarts from the beginning (or the end) when no further matches can be found.")
				},
				'editor.find.history': {
					type: 'string',
					enum: ['never', 'workspace'],
					default: 'workspace',
					enumDescriptions: [
						nls.localize('editor.find.history.never', 'Do not store search history from the find widget.'),
						nls.localize('editor.find.history.workspace', 'Store search history across the active workspace'),
					],
					description: nls.localize('find.history', "Controls how the find widget history should be stored")
				},
				'editor.find.replaceHistory': {
					type: 'string',
					enum: ['never', 'workspace'],
					default: 'workspace',
					enumDescriptions: [
						nls.localize('editor.find.replaceHistory.never', 'Do not store history from the replace widget.'),
						nls.localize('editor.find.replaceHistory.workspace', 'Store replace history across the active workspace'),
					],
					description: nls.localize('find.replaceHistory', "Controls how the replace widget history should be stored")
				}
			}
		);
	}

	public validate(_input: any): EditorFindOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorFindOptions;
		return {
			cursorMoveOnType: boolean(input.cursorMoveOnType, this.defaultValue.cursorMoveOnType),
			seedSearchStringFromSelection: typeof _input.seedSearchStringFromSelection === 'boolean'
				? (_input.seedSearchStringFromSelection ? 'always' : 'never')
				: stringSet<'never' | 'always' | 'selection'>(input.seedSearchStringFromSelection, this.defaultValue.seedSearchStringFromSelection, ['never', 'always', 'selection']),
			autoFindInSelection: typeof _input.autoFindInSelection === 'boolean'
				? (_input.autoFindInSelection ? 'always' : 'never')
				: stringSet<'never' | 'always' | 'multiline'>(input.autoFindInSelection, this.defaultValue.autoFindInSelection, ['never', 'always', 'multiline']),
			globalFindClipboard: boolean(input.globalFindClipboard, this.defaultValue.globalFindClipboard),
			addExtraSpaceOnTop: boolean(input.addExtraSpaceOnTop, this.defaultValue.addExtraSpaceOnTop),
			loop: boolean(input.loop, this.defaultValue.loop),
			history: stringSet<'never' | 'workspace'>(input.history, this.defaultValue.history, ['never', 'workspace']),
			replaceHistory: stringSet<'never' | 'workspace'>(input.replaceHistory, this.defaultValue.replaceHistory, ['never', 'workspace']),
		};
	}
}

//#endregion

//#region fontLigatures

/**
 * @internal
 */
export class EditorFontLigatures extends BaseEditorOption<EditorOption.fontLigatures, boolean | string, string> {

	public static OFF = '"liga" off, "calt" off';
	public static ON = '"liga" on, "calt" on';

	constructor() {
		super(
			EditorOption.fontLigatures, 'fontLigatures', EditorFontLigatures.OFF,
			{
				anyOf: [
					{
						type: 'boolean',
						description: nls.localize('fontLigatures', "Enables/Disables font ligatures ('calt' and 'liga' font features). Change this to a string for fine-grained control of the 'font-feature-settings' CSS property."),
					},
					{
						type: 'string',
						description: nls.localize('fontFeatureSettings', "Explicit 'font-feature-settings' CSS property. A boolean can be passed instead if one only needs to turn on/off ligatures.")
					}
				],
				description: nls.localize('fontLigaturesGeneral', "Configures font ligatures or font features. Can be either a boolean to enable/disable ligatures or a string for the value of the CSS 'font-feature-settings' property."),
				default: false
			}
		);
	}

	public validate(input: any): string {
		if (typeof input === 'undefined') {
			return this.defaultValue;
		}
		if (typeof input === 'string') {
			if (input === 'false' || input.length === 0) {
				return EditorFontLigatures.OFF;
			}
			if (input === 'true') {
				return EditorFontLigatures.ON;
			}
			return input;
		}
		if (Boolean(input)) {
			return EditorFontLigatures.ON;
		}
		return EditorFontLigatures.OFF;
	}
}

//#endregion

//#region fontVariations

/**
 * @internal
 */
export class EditorFontVariations extends BaseEditorOption<EditorOption.fontVariations, boolean | string, string> {
	// Text is laid out using default settings.
	public static OFF = 'normal';

	// Translate `fontWeight` config to the `font-variation-settings` CSS property.
	public static TRANSLATE = 'translate';

	constructor() {
		super(
			EditorOption.fontVariations, 'fontVariations', EditorFontVariations.OFF,
			{
				anyOf: [
					{
						type: 'boolean',
						description: nls.localize('fontVariations', "Enables/Disables the translation from font-weight to font-variation-settings. Change this to a string for fine-grained control of the 'font-variation-settings' CSS property."),
					},
					{
						type: 'string',
						description: nls.localize('fontVariationSettings', "Explicit 'font-variation-settings' CSS property. A boolean can be passed instead if one only needs to translate font-weight to font-variation-settings.")
					}
				],
				description: nls.localize('fontVariationsGeneral', "Configures font variations. Can be either a boolean to enable/disable the translation from font-weight to font-variation-settings or a string for the value of the CSS 'font-variation-settings' property."),
				default: false
			}
		);
	}

	public validate(input: any): string {
		if (typeof input === 'undefined') {
			return this.defaultValue;
		}
		if (typeof input === 'string') {
			if (input === 'false') {
				return EditorFontVariations.OFF;
			}
			if (input === 'true') {
				return EditorFontVariations.TRANSLATE;
			}
			return input;
		}
		if (Boolean(input)) {
			return EditorFontVariations.TRANSLATE;
		}
		return EditorFontVariations.OFF;
	}

	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: string): string {
		// The value is computed from the fontWeight if it is true.
		// So take the result from env.fontInfo
		return env.fontInfo.fontVariationSettings;
	}
}

//#endregion

//#region fontInfo

class EditorFontInfo extends ComputedEditorOption<EditorOption.fontInfo, FontInfo> {

	constructor() {
		super(EditorOption.fontInfo);
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, _: FontInfo): FontInfo {
		return env.fontInfo;
	}
}

//#endregion

//#region effectiveCursorStyle

class EffectiveCursorStyle extends ComputedEditorOption<EditorOption.effectiveCursorStyle, TextEditorCursorStyle> {

	constructor() {
		super(EditorOption.effectiveCursorStyle);
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, _: TextEditorCursorStyle): TextEditorCursorStyle {
		return env.inputMode === 'overtype' ?
			options.get(EditorOption.overtypeCursorStyle) :
			options.get(EditorOption.cursorStyle);
	}
}

//#endregion

//#region effectiveExperimentalEditContext

class EffectiveExperimentalEditContextEnabled extends ComputedEditorOption<EditorOption.effectiveExperimentalEditContextEnabled, boolean> {

	constructor() {
		super(EditorOption.effectiveExperimentalEditContextEnabled);
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions): boolean {
		const editContextSupported = typeof (globalThis as any).EditContext === 'function';
		return editContextSupported && env.accessibilitySupport !== AccessibilitySupport.Enabled && options.get(EditorOption.experimentalEditContextEnabled);
	}
}

//#endregion

//#region fontSize

class EditorFontSize extends SimpleEditorOption<EditorOption.fontSize, number> {

	constructor() {
		super(
			EditorOption.fontSize, 'fontSize', EDITOR_FONT_DEFAULTS.fontSize,
			{
				type: 'number',
				minimum: 6,
				maximum: 100,
				default: EDITOR_FONT_DEFAULTS.fontSize,
				description: nls.localize('fontSize', "Controls the font size in pixels.")
			}
		);
	}

	public override validate(input: any): number {
		const r = EditorFloatOption.float(input, this.defaultValue);
		if (r === 0) {
			return EDITOR_FONT_DEFAULTS.fontSize;
		}
		return EditorFloatOption.clamp(r, 6, 100);
	}
	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: number): number {
		// The final fontSize respects the editor zoom level.
		// So take the result from env.fontInfo
		return env.fontInfo.fontSize;
	}
}

//#endregion

//#region fontWeight

class EditorFontWeight extends BaseEditorOption<EditorOption.fontWeight, string, string> {
	private static SUGGESTION_VALUES = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
	private static MINIMUM_VALUE = 1;
	private static MAXIMUM_VALUE = 1000;

	constructor() {
		super(
			EditorOption.fontWeight, 'fontWeight', EDITOR_FONT_DEFAULTS.fontWeight,
			{
				anyOf: [
					{
						type: 'number',
						minimum: EditorFontWeight.MINIMUM_VALUE,
						maximum: EditorFontWeight.MAXIMUM_VALUE,
						errorMessage: nls.localize('fontWeightErrorMessage', "Only \"normal\" and \"bold\" keywords or numbers between 1 and 1000 are allowed.")
					},
					{
						type: 'string',
						pattern: '^(normal|bold|1000|[1-9][0-9]{0,2})$'
					},
					{
						enum: EditorFontWeight.SUGGESTION_VALUES
					}
				],
				default: EDITOR_FONT_DEFAULTS.fontWeight,
				description: nls.localize('fontWeight', "Controls the font weight. Accepts \"normal\" and \"bold\" keywords or numbers between 1 and 1000.")
			}
		);
	}

	public validate(input: any): string {
		if (input === 'normal' || input === 'bold') {
			return input;
		}
		return String(EditorIntOption.clampedInt(input, EDITOR_FONT_DEFAULTS.fontWeight, EditorFontWeight.MINIMUM_VALUE, EditorFontWeight.MAXIMUM_VALUE));
	}
}

//#endregion

//#region gotoLocation

export type GoToLocationValues = 'peek' | 'gotoAndPeek' | 'goto';

/**
 * Configuration options for go to location
 */
export interface IGotoLocationOptions {

	multiple?: GoToLocationValues;

	multipleDefinitions?: GoToLocationValues;
	multipleTypeDefinitions?: GoToLocationValues;
	multipleDeclarations?: GoToLocationValues;
	multipleImplementations?: GoToLocationValues;
	multipleReferences?: GoToLocationValues;
	multipleTests?: GoToLocationValues;

	alternativeDefinitionCommand?: string;
	alternativeTypeDefinitionCommand?: string;
	alternativeDeclarationCommand?: string;
	alternativeImplementationCommand?: string;
	alternativeReferenceCommand?: string;
	alternativeTestsCommand?: string;
}

/**
 * @internal
 */
export type GoToLocationOptions = Readonly<Required<IGotoLocationOptions>>;

class EditorGoToLocation extends BaseEditorOption<EditorOption.gotoLocation, IGotoLocationOptions, GoToLocationOptions> {

	constructor() {
		const defaults: GoToLocationOptions = {
			multiple: 'peek',
			multipleDefinitions: 'peek',
			multipleTypeDefinitions: 'peek',
			multipleDeclarations: 'peek',
			multipleImplementations: 'peek',
			multipleReferences: 'peek',
			multipleTests: 'peek',
			alternativeDefinitionCommand: 'editor.action.goToReferences',
			alternativeTypeDefinitionCommand: 'editor.action.goToReferences',
			alternativeDeclarationCommand: 'editor.action.goToReferences',
			alternativeImplementationCommand: '',
			alternativeReferenceCommand: '',
			alternativeTestsCommand: '',
		};
		const jsonSubset: IJSONSchema = {
			type: 'string',
			enum: ['peek', 'gotoAndPeek', 'goto'],
			default: defaults.multiple,
			enumDescriptions: [
				nls.localize('editor.gotoLocation.multiple.peek', 'Show Peek view of the results (default)'),
				nls.localize('editor.gotoLocation.multiple.gotoAndPeek', 'Go to the primary result and show a Peek view'),
				nls.localize('editor.gotoLocation.multiple.goto', 'Go to the primary result and enable Peek-less navigation to others')
			]
		};
		const alternativeCommandOptions = ['', 'editor.action.referenceSearch.trigger', 'editor.action.goToReferences', 'editor.action.peekImplementation', 'editor.action.goToImplementation', 'editor.action.peekTypeDefinition', 'editor.action.goToTypeDefinition', 'editor.action.peekDeclaration', 'editor.action.revealDeclaration', 'editor.action.peekDefinition', 'editor.action.revealDefinitionAside', 'editor.action.revealDefinition'];
		super(
			EditorOption.gotoLocation, 'gotoLocation', defaults,
			{
				'editor.gotoLocation.multiple': {
					deprecationMessage: nls.localize('editor.gotoLocation.multiple.deprecated', "This setting is deprecated, please use separate settings like 'editor.editor.gotoLocation.multipleDefinitions' or 'editor.editor.gotoLocation.multipleImplementations' instead."),
				},
				'editor.gotoLocation.multipleDefinitions': {
					description: nls.localize('editor.editor.gotoLocation.multipleDefinitions', "Controls the behavior the 'Go to Definition'-command when multiple target locations exist."),
					...jsonSubset,
				},
				'editor.gotoLocation.multipleTypeDefinitions': {
					description: nls.localize('editor.editor.gotoLocation.multipleTypeDefinitions', "Controls the behavior the 'Go to Type Definition'-command when multiple target locations exist."),
					...jsonSubset,
				},
				'editor.gotoLocation.multipleDeclarations': {
					description: nls.localize('editor.editor.gotoLocation.multipleDeclarations', "Controls the behavior the 'Go to Declaration'-command when multiple target locations exist."),
					...jsonSubset,
				},
				'editor.gotoLocation.multipleImplementations': {
					description: nls.localize('editor.editor.gotoLocation.multipleImplemenattions', "Controls the behavior the 'Go to Implementations'-command when multiple target locations exist."),
					...jsonSubset,
				},
				'editor.gotoLocation.multipleReferences': {
					description: nls.localize('editor.editor.gotoLocation.multipleReferences', "Controls the behavior the 'Go to References'-command when multiple target locations exist."),
					...jsonSubset,
				},
				'editor.gotoLocation.alternativeDefinitionCommand': {
					type: 'string',
					default: defaults.alternativeDefinitionCommand,
					enum: alternativeCommandOptions,
					description: nls.localize('alternativeDefinitionCommand', "Alternative command id that is being executed when the result of 'Go to Definition' is the current location.")
				},
				'editor.gotoLocation.alternativeTypeDefinitionCommand': {
					type: 'string',
					default: defaults.alternativeTypeDefinitionCommand,
					enum: alternativeCommandOptions,
					description: nls.localize('alternativeTypeDefinitionCommand', "Alternative command id that is being executed when the result of 'Go to Type Definition' is the current location.")
				},
				'editor.gotoLocation.alternativeDeclarationCommand': {
					type: 'string',
					default: defaults.alternativeDeclarationCommand,
					enum: alternativeCommandOptions,
					description: nls.localize('alternativeDeclarationCommand', "Alternative command id that is being executed when the result of 'Go to Declaration' is the current location.")
				},
				'editor.gotoLocation.alternativeImplementationCommand': {
					type: 'string',
					default: defaults.alternativeImplementationCommand,
					enum: alternativeCommandOptions,
					description: nls.localize('alternativeImplementationCommand', "Alternative command id that is being executed when the result of 'Go to Implementation' is the current location.")
				},
				'editor.gotoLocation.alternativeReferenceCommand': {
					type: 'string',
					default: defaults.alternativeReferenceCommand,
					enum: alternativeCommandOptions,
					description: nls.localize('alternativeReferenceCommand', "Alternative command id that is being executed when the result of 'Go to Reference' is the current location.")
				},
			}
		);
	}

	public validate(_input: any): GoToLocationOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IGotoLocationOptions;
		return {
			multiple: stringSet<GoToLocationValues>(input.multiple, this.defaultValue.multiple, ['peek', 'gotoAndPeek', 'goto']),
			multipleDefinitions: input.multipleDefinitions ?? stringSet<GoToLocationValues>(input.multipleDefinitions, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			multipleTypeDefinitions: input.multipleTypeDefinitions ?? stringSet<GoToLocationValues>(input.multipleTypeDefinitions, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			multipleDeclarations: input.multipleDeclarations ?? stringSet<GoToLocationValues>(input.multipleDeclarations, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			multipleImplementations: input.multipleImplementations ?? stringSet<GoToLocationValues>(input.multipleImplementations, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			multipleReferences: input.multipleReferences ?? stringSet<GoToLocationValues>(input.multipleReferences, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			multipleTests: input.multipleTests ?? stringSet<GoToLocationValues>(input.multipleTests, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			alternativeDefinitionCommand: EditorStringOption.string(input.alternativeDefinitionCommand, this.defaultValue.alternativeDefinitionCommand),
			alternativeTypeDefinitionCommand: EditorStringOption.string(input.alternativeTypeDefinitionCommand, this.defaultValue.alternativeTypeDefinitionCommand),
			alternativeDeclarationCommand: EditorStringOption.string(input.alternativeDeclarationCommand, this.defaultValue.alternativeDeclarationCommand),
			alternativeImplementationCommand: EditorStringOption.string(input.alternativeImplementationCommand, this.defaultValue.alternativeImplementationCommand),
			alternativeReferenceCommand: EditorStringOption.string(input.alternativeReferenceCommand, this.defaultValue.alternativeReferenceCommand),
			alternativeTestsCommand: EditorStringOption.string(input.alternativeTestsCommand, this.defaultValue.alternativeTestsCommand),
		};
	}
}

//#endregion

//#region hover

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
	/**
	 * Controls how long the hover is visible after you hovered out of it.
	 * Require sticky setting to be true.
	 */
	hidingDelay?: number;
	/**
	 * Should the hover be shown above the line if possible?
	 * Defaults to false.
	 */
	above?: boolean;
}

/**
 * @internal
 */
export type EditorHoverOptions = Readonly<Required<IEditorHoverOptions>>;

class EditorHover extends BaseEditorOption<EditorOption.hover, IEditorHoverOptions, EditorHoverOptions> {

	constructor() {
		const defaults: EditorHoverOptions = {
			enabled: true,
			delay: 300,
			hidingDelay: 300,
			sticky: true,
			above: true,
		};
		super(
			EditorOption.hover, 'hover', defaults,
			{
				'editor.hover.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					description: nls.localize('hover.enabled', "Controls whether the hover is shown.")
				},
				'editor.hover.delay': {
					type: 'number',
					default: defaults.delay,
					minimum: 0,
					maximum: 10000,
					description: nls.localize('hover.delay', "Controls the delay in milliseconds after which the hover is shown.")
				},
				'editor.hover.sticky': {
					type: 'boolean',
					default: defaults.sticky,
					description: nls.localize('hover.sticky', "Controls whether the hover should remain visible when mouse is moved over it.")
				},
				'editor.hover.hidingDelay': {
					type: 'integer',
					minimum: 0,
					default: defaults.hidingDelay,
					description: nls.localize('hover.hidingDelay', "Controls the delay in milliseconds after which the hover is hidden. Requires `editor.hover.sticky` to be enabled.")
				},
				'editor.hover.above': {
					type: 'boolean',
					default: defaults.above,
					description: nls.localize('hover.above', "Prefer showing hovers above the line, if there's space.")
				},
			}
		);
	}

	public validate(_input: any): EditorHoverOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorHoverOptions;
		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			delay: EditorIntOption.clampedInt(input.delay, this.defaultValue.delay, 0, 10000),
			sticky: boolean(input.sticky, this.defaultValue.sticky),
			hidingDelay: EditorIntOption.clampedInt(input.hidingDelay, this.defaultValue.hidingDelay, 0, 600000),
			above: boolean(input.above, this.defaultValue.above),
		};
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

export const enum RenderMinimap {
	None = 0,
	Text = 1,
	Blocks = 2,
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
	 * The number of decoration lanes to render in the glyph margin.
	 */
	readonly glyphMarginDecorationLaneCount: number;

	/**
	 * Left position for the line numbers.
	 */
	readonly lineNumbersLeft: number;
	/**
	 * The width of the line numbers.
	 */
	readonly lineNumbersWidth: number;

	/**
	 * Left position for the line decorations.
	 */
	readonly decorationsLeft: number;
	/**
	 * The width of the line decorations.
	 */
	readonly decorationsWidth: number;

	/**
	 * Left position for the content (actual text)
	 */
	readonly contentLeft: number;
	/**
	 * The width of the content (actual text)
	 */
	readonly contentWidth: number;

	/**
	 * Layout information for the minimap
	 */
	readonly minimap: EditorMinimapLayoutInfo;

	/**
	 * The number of columns (of typical characters) fitting on a viewport line.
	 */
	readonly viewportColumn: number;

	readonly isWordWrapMinified: boolean;
	readonly isViewportWrapping: boolean;
	readonly wrappingColumn: number;

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
 * The internal layout details of the editor.
 */
export interface EditorMinimapLayoutInfo {
	readonly renderMinimap: RenderMinimap;
	readonly minimapLeft: number;
	readonly minimapWidth: number;
	readonly minimapHeightIsEditorHeight: boolean;
	readonly minimapIsSampling: boolean;
	readonly minimapScale: number;
	readonly minimapLineHeight: number;
	readonly minimapCanvasInnerWidth: number;
	readonly minimapCanvasInnerHeight: number;
	readonly minimapCanvasOuterWidth: number;
	readonly minimapCanvasOuterHeight: number;
}

/**
 * @internal
 */
export interface EditorLayoutInfoComputerEnv {
	readonly memory: ComputeOptionsMemory | null;
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly isDominatedByLongLines: boolean;
	readonly lineHeight: number;
	readonly viewLineCount: number;
	readonly lineNumbersDigitCount: number;
	readonly typicalHalfwidthCharacterWidth: number;
	readonly maxDigitWidth: number;
	readonly pixelRatio: number;
	readonly glyphMarginDecorationLaneCount: number;
}

/**
 * @internal
 */
export interface IEditorLayoutComputerInput {
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly isDominatedByLongLines: boolean;
	readonly lineHeight: number;
	readonly lineNumbersDigitCount: number;
	readonly typicalHalfwidthCharacterWidth: number;
	readonly maxDigitWidth: number;
	readonly pixelRatio: number;
	readonly glyphMargin: boolean;
	readonly lineDecorationsWidth: string | number;
	readonly folding: boolean;
	readonly minimap: Readonly<Required<IEditorMinimapOptions>>;
	readonly scrollbar: InternalEditorScrollbarOptions;
	readonly lineNumbers: InternalEditorRenderLineNumbersOptions;
	readonly lineNumbersMinChars: number;
	readonly scrollBeyondLastLine: boolean;
	readonly wordWrap: 'wordWrapColumn' | 'on' | 'off' | 'bounded';
	readonly wordWrapColumn: number;
	readonly wordWrapMinified: boolean;
	readonly accessibilitySupport: AccessibilitySupport;
}

/**
 * @internal
 */
export interface IMinimapLayoutInput {
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly lineHeight: number;
	readonly typicalHalfwidthCharacterWidth: number;
	readonly pixelRatio: number;
	readonly scrollBeyondLastLine: boolean;
	readonly paddingTop: number;
	readonly paddingBottom: number;
	readonly minimap: Readonly<Required<IEditorMinimapOptions>>;
	readonly verticalScrollbarWidth: number;
	readonly viewLineCount: number;
	readonly remainingWidth: number;
	readonly isViewportWrapping: boolean;
}

/**
 * @internal
 */
export class EditorLayoutInfoComputer extends ComputedEditorOption<EditorOption.layoutInfo, EditorLayoutInfo> {

	constructor() {
		super(EditorOption.layoutInfo);
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, _: EditorLayoutInfo): EditorLayoutInfo {
		return EditorLayoutInfoComputer.computeLayout(options, {
			memory: env.memory,
			outerWidth: env.outerWidth,
			outerHeight: env.outerHeight,
			isDominatedByLongLines: env.isDominatedByLongLines,
			lineHeight: env.fontInfo.lineHeight,
			viewLineCount: env.viewLineCount,
			lineNumbersDigitCount: env.lineNumbersDigitCount,
			typicalHalfwidthCharacterWidth: env.fontInfo.typicalHalfwidthCharacterWidth,
			maxDigitWidth: env.fontInfo.maxDigitWidth,
			pixelRatio: env.pixelRatio,
			glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount
		});
	}

	public static computeContainedMinimapLineCount(input: {
		viewLineCount: number;
		scrollBeyondLastLine: boolean;
		paddingTop: number;
		paddingBottom: number;
		height: number;
		lineHeight: number;
		pixelRatio: number;
	}): { typicalViewportLineCount: number; extraLinesBeforeFirstLine: number; extraLinesBeyondLastLine: number; desiredRatio: number; minimapLineCount: number } {
		const typicalViewportLineCount = input.height / input.lineHeight;
		const extraLinesBeforeFirstLine = Math.floor(input.paddingTop / input.lineHeight);
		let extraLinesBeyondLastLine = Math.floor(input.paddingBottom / input.lineHeight);
		if (input.scrollBeyondLastLine) {
			extraLinesBeyondLastLine = Math.max(extraLinesBeyondLastLine, typicalViewportLineCount - 1);
		}
		const desiredRatio = (extraLinesBeforeFirstLine + input.viewLineCount + extraLinesBeyondLastLine) / (input.pixelRatio * input.height);
		const minimapLineCount = Math.floor(input.viewLineCount / desiredRatio);
		return { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount };
	}

	private static _computeMinimapLayout(input: IMinimapLayoutInput, memory: ComputeOptionsMemory): EditorMinimapLayoutInfo {
		const outerWidth = input.outerWidth;
		const outerHeight = input.outerHeight;
		const pixelRatio = input.pixelRatio;

		if (!input.minimap.enabled) {
			return {
				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditorHeight: false,
				minimapIsSampling: false,
				minimapScale: 1,
				minimapLineHeight: 1,
				minimapCanvasInnerWidth: 0,
				minimapCanvasInnerHeight: Math.floor(pixelRatio * outerHeight),
				minimapCanvasOuterWidth: 0,
				minimapCanvasOuterHeight: outerHeight,
			};
		}

		// Can use memory if only the `viewLineCount` and `remainingWidth` have changed
		const stableMinimapLayoutInput = memory.stableMinimapLayoutInput;
		const couldUseMemory = (
			stableMinimapLayoutInput
			// && input.outerWidth === lastMinimapLayoutInput.outerWidth !!! INTENTIONAL OMITTED
			&& input.outerHeight === stableMinimapLayoutInput.outerHeight
			&& input.lineHeight === stableMinimapLayoutInput.lineHeight
			&& input.typicalHalfwidthCharacterWidth === stableMinimapLayoutInput.typicalHalfwidthCharacterWidth
			&& input.pixelRatio === stableMinimapLayoutInput.pixelRatio
			&& input.scrollBeyondLastLine === stableMinimapLayoutInput.scrollBeyondLastLine
			&& input.paddingTop === stableMinimapLayoutInput.paddingTop
			&& input.paddingBottom === stableMinimapLayoutInput.paddingBottom
			&& input.minimap.enabled === stableMinimapLayoutInput.minimap.enabled
			&& input.minimap.side === stableMinimapLayoutInput.minimap.side
			&& input.minimap.size === stableMinimapLayoutInput.minimap.size
			&& input.minimap.showSlider === stableMinimapLayoutInput.minimap.showSlider
			&& input.minimap.renderCharacters === stableMinimapLayoutInput.minimap.renderCharacters
			&& input.minimap.maxColumn === stableMinimapLayoutInput.minimap.maxColumn
			&& input.minimap.scale === stableMinimapLayoutInput.minimap.scale
			&& input.verticalScrollbarWidth === stableMinimapLayoutInput.verticalScrollbarWidth
			// && input.viewLineCount === lastMinimapLayoutInput.viewLineCount !!! INTENTIONAL OMITTED
			// && input.remainingWidth === lastMinimapLayoutInput.remainingWidth !!! INTENTIONAL OMITTED
			&& input.isViewportWrapping === stableMinimapLayoutInput.isViewportWrapping
		);

		const lineHeight = input.lineHeight;
		const typicalHalfwidthCharacterWidth = input.typicalHalfwidthCharacterWidth;
		const scrollBeyondLastLine = input.scrollBeyondLastLine;
		const minimapRenderCharacters = input.minimap.renderCharacters;
		let minimapScale = (pixelRatio >= 2 ? Math.round(input.minimap.scale * 2) : input.minimap.scale);
		const minimapMaxColumn = input.minimap.maxColumn;
		const minimapSize = input.minimap.size;
		const minimapSide = input.minimap.side;
		const verticalScrollbarWidth = input.verticalScrollbarWidth;
		const viewLineCount = input.viewLineCount;
		const remainingWidth = input.remainingWidth;
		const isViewportWrapping = input.isViewportWrapping;

		const baseCharHeight = minimapRenderCharacters ? 2 : 3;
		let minimapCanvasInnerHeight = Math.floor(pixelRatio * outerHeight);
		const minimapCanvasOuterHeight = minimapCanvasInnerHeight / pixelRatio;
		let minimapHeightIsEditorHeight = false;
		let minimapIsSampling = false;
		let minimapLineHeight = baseCharHeight * minimapScale;
		let minimapCharWidth = minimapScale / pixelRatio;
		let minimapWidthMultiplier: number = 1;

		if (minimapSize === 'fill' || minimapSize === 'fit') {
			const { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount } = EditorLayoutInfoComputer.computeContainedMinimapLineCount({
				viewLineCount: viewLineCount,
				scrollBeyondLastLine: scrollBeyondLastLine,
				paddingTop: input.paddingTop,
				paddingBottom: input.paddingBottom,
				height: outerHeight,
				lineHeight: lineHeight,
				pixelRatio: pixelRatio
			});
			// ratio is intentionally not part of the layout to avoid the layout changing all the time
			// when doing sampling
			const ratio = viewLineCount / minimapLineCount;

			if (ratio > 1) {
				minimapHeightIsEditorHeight = true;
				minimapIsSampling = true;
				minimapScale = 1;
				minimapLineHeight = 1;
				minimapCharWidth = minimapScale / pixelRatio;
			} else {
				let fitBecomesFill = false;
				let maxMinimapScale = minimapScale + 1;

				if (minimapSize === 'fit') {
					const effectiveMinimapHeight = Math.ceil((extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine) * minimapLineHeight);
					if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
						// There is a loop when using `fit` and viewport wrapping:
						// - view line count impacts minimap layout
						// - minimap layout impacts viewport width
						// - viewport width impacts view line count
						// To break the loop, once we go to a smaller minimap scale, we try to stick with it.
						fitBecomesFill = true;
						maxMinimapScale = memory.stableFitMaxMinimapScale;
					} else {
						fitBecomesFill = (effectiveMinimapHeight > minimapCanvasInnerHeight);
					}
				}

				if (minimapSize === 'fill' || fitBecomesFill) {
					minimapHeightIsEditorHeight = true;
					const configuredMinimapScale = minimapScale;
					minimapLineHeight = Math.min(lineHeight * pixelRatio, Math.max(1, Math.floor(1 / desiredRatio)));
					if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
						// There is a loop when using `fill` and viewport wrapping:
						// - view line count impacts minimap layout
						// - minimap layout impacts viewport width
						// - viewport width impacts view line count
						// To break the loop, once we go to a smaller minimap scale, we try to stick with it.
						maxMinimapScale = memory.stableFitMaxMinimapScale;
					}
					minimapScale = Math.min(maxMinimapScale, Math.max(1, Math.floor(minimapLineHeight / baseCharHeight)));
					if (minimapScale > configuredMinimapScale) {
						minimapWidthMultiplier = Math.min(2, minimapScale / configuredMinimapScale);
					}
					minimapCharWidth = minimapScale / pixelRatio / minimapWidthMultiplier;
					minimapCanvasInnerHeight = Math.ceil((Math.max(typicalViewportLineCount, extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine)) * minimapLineHeight);
					if (isViewportWrapping) {
						// remember for next time
						memory.stableMinimapLayoutInput = input;
						memory.stableFitRemainingWidth = remainingWidth;
						memory.stableFitMaxMinimapScale = minimapScale;
					} else {
						memory.stableMinimapLayoutInput = null;
						memory.stableFitRemainingWidth = 0;
					}
				}
			}
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

		const minimapMaxWidth = Math.floor(minimapMaxColumn * minimapCharWidth);
		const minimapWidth = Math.min(minimapMaxWidth, Math.max(0, Math.floor(((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth))) + MINIMAP_GUTTER_WIDTH);

		let minimapCanvasInnerWidth = Math.floor(pixelRatio * minimapWidth);
		const minimapCanvasOuterWidth = minimapCanvasInnerWidth / pixelRatio;
		minimapCanvasInnerWidth = Math.floor(minimapCanvasInnerWidth * minimapWidthMultiplier);

		const renderMinimap = (minimapRenderCharacters ? RenderMinimap.Text : RenderMinimap.Blocks);
		const minimapLeft = (minimapSide === 'left' ? 0 : (outerWidth - minimapWidth - verticalScrollbarWidth));

		return {
			renderMinimap,
			minimapLeft,
			minimapWidth,
			minimapHeightIsEditorHeight,
			minimapIsSampling,
			minimapScale,
			minimapLineHeight,
			minimapCanvasInnerWidth,
			minimapCanvasInnerHeight,
			minimapCanvasOuterWidth,
			minimapCanvasOuterHeight,
		};
	}

	public static computeLayout(options: IComputedEditorOptions, env: EditorLayoutInfoComputerEnv): EditorLayoutInfo {
		const outerWidth = env.outerWidth | 0;
		const outerHeight = env.outerHeight | 0;
		const lineHeight = env.lineHeight | 0;
		const lineNumbersDigitCount = env.lineNumbersDigitCount | 0;
		const typicalHalfwidthCharacterWidth = env.typicalHalfwidthCharacterWidth;
		const maxDigitWidth = env.maxDigitWidth;
		const pixelRatio = env.pixelRatio;
		const viewLineCount = env.viewLineCount;

		const wordWrapOverride2 = options.get(EditorOption.wordWrapOverride2);
		const wordWrapOverride1 = (wordWrapOverride2 === 'inherit' ? options.get(EditorOption.wordWrapOverride1) : wordWrapOverride2);
		const wordWrap = (wordWrapOverride1 === 'inherit' ? options.get(EditorOption.wordWrap) : wordWrapOverride1);

		const wordWrapColumn = options.get(EditorOption.wordWrapColumn);
		const isDominatedByLongLines = env.isDominatedByLongLines;

		const showGlyphMargin = options.get(EditorOption.glyphMargin);
		const showLineNumbers = (options.get(EditorOption.lineNumbers).renderType !== RenderLineNumbersType.Off);
		const lineNumbersMinChars = options.get(EditorOption.lineNumbersMinChars);
		const scrollBeyondLastLine = options.get(EditorOption.scrollBeyondLastLine);
		const padding = options.get(EditorOption.padding);
		const minimap = options.get(EditorOption.minimap);

		const scrollbar = options.get(EditorOption.scrollbar);
		const verticalScrollbarWidth = scrollbar.verticalScrollbarSize;
		const verticalScrollbarHasArrows = scrollbar.verticalHasArrows;
		const scrollbarArrowSize = scrollbar.arrowSize;
		const horizontalScrollbarHeight = scrollbar.horizontalScrollbarSize;

		const folding = options.get(EditorOption.folding);
		const showFoldingDecoration = options.get(EditorOption.showFoldingControls) !== 'never';

		let lineDecorationsWidth = options.get(EditorOption.lineDecorationsWidth);
		if (folding && showFoldingDecoration) {
			lineDecorationsWidth += 16;
		}

		let lineNumbersWidth = 0;
		if (showLineNumbers) {
			const digitCount = Math.max(lineNumbersDigitCount, lineNumbersMinChars);
			lineNumbersWidth = Math.round(digitCount * maxDigitWidth);
		}

		let glyphMarginWidth = 0;
		if (showGlyphMargin) {
			glyphMarginWidth = lineHeight * env.glyphMarginDecorationLaneCount;
		}

		let glyphMarginLeft = 0;
		let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
		let decorationsLeft = lineNumbersLeft + lineNumbersWidth;
		let contentLeft = decorationsLeft + lineDecorationsWidth;

		const remainingWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth;

		let isWordWrapMinified = false;
		let isViewportWrapping = false;
		let wrappingColumn = -1;

		if (wordWrapOverride1 === 'inherit' && isDominatedByLongLines) {
			// Force viewport width wrapping if model is dominated by long lines
			isWordWrapMinified = true;
			isViewportWrapping = true;
		} else if (wordWrap === 'on' || wordWrap === 'bounded') {
			isViewportWrapping = true;
		} else if (wordWrap === 'wordWrapColumn') {
			wrappingColumn = wordWrapColumn;
		}

		const minimapLayout = EditorLayoutInfoComputer._computeMinimapLayout({
			outerWidth: outerWidth,
			outerHeight: outerHeight,
			lineHeight: lineHeight,
			typicalHalfwidthCharacterWidth: typicalHalfwidthCharacterWidth,
			pixelRatio: pixelRatio,
			scrollBeyondLastLine: scrollBeyondLastLine,
			paddingTop: padding.top,
			paddingBottom: padding.bottom,
			minimap: minimap,
			verticalScrollbarWidth: verticalScrollbarWidth,
			viewLineCount: viewLineCount,
			remainingWidth: remainingWidth,
			isViewportWrapping: isViewportWrapping,
		}, env.memory || new ComputeOptionsMemory());

		if (minimapLayout.renderMinimap !== RenderMinimap.None && minimapLayout.minimapLeft === 0) {
			// the minimap is rendered to the left, so move everything to the right
			glyphMarginLeft += minimapLayout.minimapWidth;
			lineNumbersLeft += minimapLayout.minimapWidth;
			decorationsLeft += minimapLayout.minimapWidth;
			contentLeft += minimapLayout.minimapWidth;
		}
		const contentWidth = remainingWidth - minimapLayout.minimapWidth;

		// (leaving 2px for the cursor to have space after the last character)
		const viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth));

		const verticalArrowSize = (verticalScrollbarHasArrows ? scrollbarArrowSize : 0);

		if (isViewportWrapping) {
			// compute the actual wrappingColumn
			wrappingColumn = Math.max(1, viewportColumn);
			if (wordWrap === 'bounded') {
				wrappingColumn = Math.min(wrappingColumn, wordWrapColumn);
			}
		}

		return {
			width: outerWidth,
			height: outerHeight,

			glyphMarginLeft: glyphMarginLeft,
			glyphMarginWidth: glyphMarginWidth,
			glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount,

			lineNumbersLeft: lineNumbersLeft,
			lineNumbersWidth: lineNumbersWidth,

			decorationsLeft: decorationsLeft,
			decorationsWidth: lineDecorationsWidth,

			contentLeft: contentLeft,
			contentWidth: contentWidth,

			minimap: minimapLayout,

			viewportColumn: viewportColumn,

			isWordWrapMinified: isWordWrapMinified,
			isViewportWrapping: isViewportWrapping,
			wrappingColumn: wrappingColumn,

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

//#region WrappingStrategy
class WrappingStrategy extends BaseEditorOption<EditorOption.wrappingStrategy, 'simple' | 'advanced', 'simple' | 'advanced'> {

	constructor() {
		super(EditorOption.wrappingStrategy, 'wrappingStrategy', 'simple',
			{
				'editor.wrappingStrategy': {
					enumDescriptions: [
						nls.localize('wrappingStrategy.simple', "Assumes that all characters are of the same width. This is a fast algorithm that works correctly for monospace fonts and certain scripts (like Latin characters) where glyphs are of equal width."),
						nls.localize('wrappingStrategy.advanced', "Delegates wrapping points computation to the browser. This is a slow algorithm, that might cause freezes for large files, but it works correctly in all cases.")
					],
					type: 'string',
					enum: ['simple', 'advanced'],
					default: 'simple',
					description: nls.localize('wrappingStrategy', "Controls the algorithm that computes wrapping points. Note that when in accessibility mode, advanced will be used for the best experience.")
				}
			}
		);
	}

	public validate(input: any): 'simple' | 'advanced' {
		return stringSet<'simple' | 'advanced'>(input, 'simple', ['simple', 'advanced']);
	}

	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: 'simple' | 'advanced'): 'simple' | 'advanced' {
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		if (accessibilitySupport === AccessibilitySupport.Enabled) {
			// if we know for a fact that a screen reader is attached, we switch our strategy to advanced to
			// help that the editor's wrapping points match the textarea's wrapping points
			return 'advanced';
		}
		return value;
	}
}
//#endregion

//#region lightbulb

export enum ShowLightbulbIconMode {
	Off = 'off',
	OnCode = 'onCode',
	On = 'on'
}

/**
 * Configuration options for editor lightbulb
 */
export interface IEditorLightbulbOptions {
	/**
	 * Enable the lightbulb code action.
	 * The three possible values are `off`, `on` and `onCode` and the default is `onCode`.
	 * `off` disables the code action menu.
	 * `on` shows the code action menu on code and on empty lines.
	 * `onCode` shows the code action menu on code only.
	 */
	enabled?: ShowLightbulbIconMode;
}

/**
 * @internal
 */
export type EditorLightbulbOptions = Readonly<Required<IEditorLightbulbOptions>>;

class EditorLightbulb extends BaseEditorOption<EditorOption.lightbulb, IEditorLightbulbOptions, EditorLightbulbOptions> {

	constructor() {
		const defaults: EditorLightbulbOptions = { enabled: ShowLightbulbIconMode.OnCode };
		super(
			EditorOption.lightbulb, 'lightbulb', defaults,
			{
				'editor.lightbulb.enabled': {
					type: 'string',
					enum: [ShowLightbulbIconMode.Off, ShowLightbulbIconMode.OnCode, ShowLightbulbIconMode.On],
					default: defaults.enabled,
					enumDescriptions: [
						nls.localize('editor.lightbulb.enabled.off', 'Disable the code action menu.'),
						nls.localize('editor.lightbulb.enabled.onCode', 'Show the code action menu when the cursor is on lines with code.'),
						nls.localize('editor.lightbulb.enabled.on', 'Show the code action menu when the cursor is on lines with code or on empty lines.'),
					],
					description: nls.localize('enabled', "Enables the Code Action lightbulb in the editor.")
				}
			}
		);
	}

	public validate(_input: any): EditorLightbulbOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorLightbulbOptions;
		return {
			enabled: stringSet(input.enabled, this.defaultValue.enabled, [ShowLightbulbIconMode.Off, ShowLightbulbIconMode.OnCode, ShowLightbulbIconMode.On])
		};
	}
}

//#endregion

//#region stickyScroll

export interface IEditorStickyScrollOptions {
	/**
	 * Enable the sticky scroll
	 */
	enabled?: boolean;
	/**
	 * Maximum number of sticky lines to show
	 */
	maxLineCount?: number;
	/**
	 * Model to choose for sticky scroll by default
	 */
	defaultModel?: 'outlineModel' | 'foldingProviderModel' | 'indentationModel';
	/**
	 * Define whether to scroll sticky scroll with editor horizontal scrollbae
	 */
	scrollWithEditor?: boolean;
}

/**
 * @internal
 */
export type EditorStickyScrollOptions = Readonly<Required<IEditorStickyScrollOptions>>;

class EditorStickyScroll extends BaseEditorOption<EditorOption.stickyScroll, IEditorStickyScrollOptions, EditorStickyScrollOptions> {

	constructor() {
		const defaults: EditorStickyScrollOptions = { enabled: true, maxLineCount: 5, defaultModel: 'outlineModel', scrollWithEditor: true };
		super(
			EditorOption.stickyScroll, 'stickyScroll', defaults,
			{
				'editor.stickyScroll.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					description: nls.localize('editor.stickyScroll.enabled', "Shows the nested current scopes during the scroll at the top of the editor.")
				},
				'editor.stickyScroll.maxLineCount': {
					type: 'number',
					default: defaults.maxLineCount,
					minimum: 1,
					maximum: 20,
					description: nls.localize('editor.stickyScroll.maxLineCount', "Defines the maximum number of sticky lines to show.")
				},
				'editor.stickyScroll.defaultModel': {
					type: 'string',
					enum: ['outlineModel', 'foldingProviderModel', 'indentationModel'],
					default: defaults.defaultModel,
					description: nls.localize('editor.stickyScroll.defaultModel', "Defines the model to use for determining which lines to stick. If the outline model does not exist, it will fall back on the folding provider model which falls back on the indentation model. This order is respected in all three cases.")
				},
				'editor.stickyScroll.scrollWithEditor': {
					type: 'boolean',
					default: defaults.scrollWithEditor,
					description: nls.localize('editor.stickyScroll.scrollWithEditor', "Enable scrolling of Sticky Scroll with the editor's horizontal scrollbar.")
				},
			}
		);
	}

	public validate(_input: any): EditorStickyScrollOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorStickyScrollOptions;
		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			maxLineCount: EditorIntOption.clampedInt(input.maxLineCount, this.defaultValue.maxLineCount, 1, 20),
			defaultModel: stringSet<'outlineModel' | 'foldingProviderModel' | 'indentationModel'>(input.defaultModel, this.defaultValue.defaultModel, ['outlineModel', 'foldingProviderModel', 'indentationModel']),
			scrollWithEditor: boolean(input.scrollWithEditor, this.defaultValue.scrollWithEditor)
		};
	}
}

//#endregion

//#region inlayHints

/**
 * Configuration options for editor inlayHints
 */
export interface IEditorInlayHintsOptions {
	/**
	 * Enable the inline hints.
	 * Defaults to true.
	 */
	enabled?: 'on' | 'off' | 'offUnlessPressed' | 'onUnlessPressed';

	/**
	 * Font size of inline hints.
	 * Default to 90% of the editor font size.
	 */
	fontSize?: number;

	/**
	 * Font family of inline hints.
	 * Defaults to editor font family.
	 */
	fontFamily?: string;

	/**
	 * Enables the padding around the inlay hint.
	 * Defaults to false.
	 */
	padding?: boolean;

	/**
	 * Maximum length for inlay hints per line
	 * Set to 0 to have an unlimited length.
	 */
	maximumLength?: number;
}

/**
 * @internal
 */
export type EditorInlayHintsOptions = Readonly<Required<IEditorInlayHintsOptions>>;

class EditorInlayHints extends BaseEditorOption<EditorOption.inlayHints, IEditorInlayHintsOptions, EditorInlayHintsOptions> {

	constructor() {
		const defaults: EditorInlayHintsOptions = { enabled: 'on', fontSize: 0, fontFamily: '', padding: false, maximumLength: 43 };
		super(
			EditorOption.inlayHints, 'inlayHints', defaults,
			{
				'editor.inlayHints.enabled': {
					type: 'string',
					default: defaults.enabled,
					description: nls.localize('inlayHints.enable', "Enables the inlay hints in the editor."),
					enum: ['on', 'onUnlessPressed', 'offUnlessPressed', 'off'],
					markdownEnumDescriptions: [
						nls.localize('editor.inlayHints.on', "Inlay hints are enabled"),
						nls.localize('editor.inlayHints.onUnlessPressed', "Inlay hints are showing by default and hide when holding {0}", platform.isMacintosh ? `Ctrl+Option` : `Ctrl+Alt`),
						nls.localize('editor.inlayHints.offUnlessPressed', "Inlay hints are hidden by default and show when holding {0}", platform.isMacintosh ? `Ctrl+Option` : `Ctrl+Alt`),
						nls.localize('editor.inlayHints.off', "Inlay hints are disabled"),
					],
				},
				'editor.inlayHints.fontSize': {
					type: 'number',
					default: defaults.fontSize,
					markdownDescription: nls.localize('inlayHints.fontSize', "Controls font size of inlay hints in the editor. As default the {0} is used when the configured value is less than {1} or greater than the editor font size.", '`#editor.fontSize#`', '`5`')
				},
				'editor.inlayHints.fontFamily': {
					type: 'string',
					default: defaults.fontFamily,
					markdownDescription: nls.localize('inlayHints.fontFamily', "Controls font family of inlay hints in the editor. When set to empty, the {0} is used.", '`#editor.fontFamily#`')
				},
				'editor.inlayHints.padding': {
					type: 'boolean',
					default: defaults.padding,
					description: nls.localize('inlayHints.padding', "Enables the padding around the inlay hints in the editor.")
				},
				'editor.inlayHints.maximumLength': {
					type: 'number',
					default: defaults.maximumLength,
					markdownDescription: nls.localize('inlayHints.maximumLength', "Maximum overall length of inlay hints, for a single line, before they get truncated by the editor. Set to `0` to never truncate")
				}
			}
		);
	}

	public validate(_input: any): EditorInlayHintsOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorInlayHintsOptions;
		if (typeof input.enabled === 'boolean') {
			input.enabled = input.enabled ? 'on' : 'off';
		}
		return {
			enabled: stringSet<'on' | 'off' | 'offUnlessPressed' | 'onUnlessPressed'>(input.enabled, this.defaultValue.enabled, ['on', 'off', 'offUnlessPressed', 'onUnlessPressed']),
			fontSize: EditorIntOption.clampedInt(input.fontSize, this.defaultValue.fontSize, 0, 100),
			fontFamily: EditorStringOption.string(input.fontFamily, this.defaultValue.fontFamily),
			padding: boolean(input.padding, this.defaultValue.padding),
			maximumLength: EditorIntOption.clampedInt(input.maximumLength, this.defaultValue.maximumLength, 0, Number.MAX_SAFE_INTEGER),
		};
	}
}

//#endregion

//#region lineDecorationsWidth

class EditorLineDecorationsWidth extends BaseEditorOption<EditorOption.lineDecorationsWidth, number | string, number> {

	constructor() {
		super(EditorOption.lineDecorationsWidth, 'lineDecorationsWidth', 10);
	}

	public validate(input: any): number {
		if (typeof input === 'string' && /^\d+(\.\d+)?ch$/.test(input)) {
			const multiple = parseFloat(input.substring(0, input.length - 2));
			return -multiple; // negative numbers signal a multiple
		} else {
			return EditorIntOption.clampedInt(input, this.defaultValue, 0, 1000);
		}
	}

	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: number): number {
		if (value < 0) {
			// negative numbers signal a multiple
			return EditorIntOption.clampedInt(-value * env.fontInfo.typicalHalfwidthCharacterWidth, this.defaultValue, 0, 1000);
		} else {
			return value;
		}
	}
}

//#endregion

//#region lineHeight

class EditorLineHeight extends EditorFloatOption<EditorOption.lineHeight> {

	constructor() {
		super(
			EditorOption.lineHeight, 'lineHeight',
			EDITOR_FONT_DEFAULTS.lineHeight,
			x => EditorFloatOption.clamp(x, 0, 150),
			{ markdownDescription: nls.localize('lineHeight', "Controls the line height. \n - Use 0 to automatically compute the line height from the font size.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values.") }
		);
	}

	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: number): number {
		// The lineHeight is computed from the fontSize if it is 0.
		// Moreover, the final lineHeight respects the editor zoom level.
		// So take the result from env.fontInfo
		return env.fontInfo.lineHeight;
	}
}

//#endregion

//#region minimap

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
	 * Control the rendering of minimap.
	 */
	autohide?: boolean;
	/**
	 * Control the side of the minimap in editor.
	 * Defaults to 'right'.
	 */
	side?: 'right' | 'left';
	/**
	 * Control the minimap rendering mode.
	 * Defaults to 'actual'.
	 */
	size?: 'proportional' | 'fill' | 'fit';
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
	/**
	 * Relative size of the font in the minimap. Defaults to 1.
	 */
	scale?: number;
	/**
	 * Whether to show named regions as section headers. Defaults to true.
	 */
	showRegionSectionHeaders?: boolean;
	/**
	 * Whether to show MARK: comments as section headers. Defaults to true.
	 */
	showMarkSectionHeaders?: boolean;
	/**
	 * When specified, is used to create a custom section header parser regexp.
	 * Must contain a match group named 'label' (written as (?<label>.+)) that encapsulates the section header.
	 * Optionally can include another match group named 'separator'.
	 * To match multi-line headers like:
	 *   // ==========
	 *   // My Section
	 *   // ==========
	 * Use a pattern like: ^={3,}\n^\/\/ *(?<label>[^\n]*?)\n^={3,}$
	 */
	markSectionHeaderRegex?: string;
	/**
	 * Font size of section headers. Defaults to 9.
	 */
	sectionHeaderFontSize?: number;
	/**
	 * Spacing between the section header characters (in CSS px). Defaults to 1.
	 */
	sectionHeaderLetterSpacing?: number;
}

/**
 * @internal
 */
export type EditorMinimapOptions = Readonly<Required<IEditorMinimapOptions>>;

class EditorMinimap extends BaseEditorOption<EditorOption.minimap, IEditorMinimapOptions, EditorMinimapOptions> {

	constructor() {
		const defaults: EditorMinimapOptions = {
			enabled: true,
			size: 'proportional',
			side: 'right',
			showSlider: 'mouseover',
			autohide: false,
			renderCharacters: true,
			maxColumn: 120,
			scale: 1,
			showRegionSectionHeaders: true,
			showMarkSectionHeaders: true,
			markSectionHeaderRegex: '\\bMARK:\\s*(?<separator>\-?)\\s*(?<label>.*)$',
			sectionHeaderFontSize: 9,
			sectionHeaderLetterSpacing: 1,
		};
		super(
			EditorOption.minimap, 'minimap', defaults,
			{
				'editor.minimap.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					description: nls.localize('minimap.enabled', "Controls whether the minimap is shown.")
				},
				'editor.minimap.autohide': {
					type: 'boolean',
					default: defaults.autohide,
					description: nls.localize('minimap.autohide', "Controls whether the minimap is hidden automatically.")
				},
				'editor.minimap.size': {
					type: 'string',
					enum: ['proportional', 'fill', 'fit'],
					enumDescriptions: [
						nls.localize('minimap.size.proportional', "The minimap has the same size as the editor contents (and might scroll)."),
						nls.localize('minimap.size.fill', "The minimap will stretch or shrink as necessary to fill the height of the editor (no scrolling)."),
						nls.localize('minimap.size.fit', "The minimap will shrink as necessary to never be larger than the editor (no scrolling)."),
					],
					default: defaults.size,
					description: nls.localize('minimap.size', "Controls the size of the minimap.")
				},
				'editor.minimap.side': {
					type: 'string',
					enum: ['left', 'right'],
					default: defaults.side,
					description: nls.localize('minimap.side', "Controls the side where to render the minimap.")
				},
				'editor.minimap.showSlider': {
					type: 'string',
					enum: ['always', 'mouseover'],
					default: defaults.showSlider,
					description: nls.localize('minimap.showSlider', "Controls when the minimap slider is shown.")
				},
				'editor.minimap.scale': {
					type: 'number',
					default: defaults.scale,
					minimum: 1,
					maximum: 3,
					enum: [1, 2, 3],
					description: nls.localize('minimap.scale', "Scale of content drawn in the minimap: 1, 2 or 3.")
				},
				'editor.minimap.renderCharacters': {
					type: 'boolean',
					default: defaults.renderCharacters,
					description: nls.localize('minimap.renderCharacters', "Render the actual characters on a line as opposed to color blocks.")
				},
				'editor.minimap.maxColumn': {
					type: 'number',
					default: defaults.maxColumn,
					description: nls.localize('minimap.maxColumn', "Limit the width of the minimap to render at most a certain number of columns.")
				},
				'editor.minimap.showRegionSectionHeaders': {
					type: 'boolean',
					default: defaults.showRegionSectionHeaders,
					description: nls.localize('minimap.showRegionSectionHeaders', "Controls whether named regions are shown as section headers in the minimap.")
				},
				'editor.minimap.showMarkSectionHeaders': {
					type: 'boolean',
					default: defaults.showMarkSectionHeaders,
					description: nls.localize('minimap.showMarkSectionHeaders', "Controls whether MARK: comments are shown as section headers in the minimap.")
				},
				'editor.minimap.markSectionHeaderRegex': {
					type: 'string',
					default: defaults.markSectionHeaderRegex,
					description: nls.localize('minimap.markSectionHeaderRegex', "Defines the regular expression used to find section headers in comments. The regex must contain a named match group `label` (written as `(?<label>.+)`) that encapsulates the section header, otherwise it will not work. Optionally you can include another match group named `separator`. Use \\n in the pattern to match multi-line headers."),
				},
				'editor.minimap.sectionHeaderFontSize': {
					type: 'number',
					default: defaults.sectionHeaderFontSize,
					description: nls.localize('minimap.sectionHeaderFontSize', "Controls the font size of section headers in the minimap.")
				},
				'editor.minimap.sectionHeaderLetterSpacing': {
					type: 'number',
					default: defaults.sectionHeaderLetterSpacing,
					description: nls.localize('minimap.sectionHeaderLetterSpacing', "Controls the amount of space (in pixels) between characters of section header. This helps the readability of the header in small font sizes.")
				}
			}
		);
	}

	public validate(_input: any): EditorMinimapOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorMinimapOptions;

		// Validate mark section header regex
		let markSectionHeaderRegex = this.defaultValue.markSectionHeaderRegex;
		const inputRegex = _input.markSectionHeaderRegex;
		if (typeof inputRegex === 'string') {
			try {
				new RegExp(inputRegex, 'd');
				markSectionHeaderRegex = inputRegex;
			} catch { }
		}

		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			autohide: boolean(input.autohide, this.defaultValue.autohide),
			size: stringSet<'proportional' | 'fill' | 'fit'>(input.size, this.defaultValue.size, ['proportional', 'fill', 'fit']),
			side: stringSet<'right' | 'left'>(input.side, this.defaultValue.side, ['right', 'left']),
			showSlider: stringSet<'always' | 'mouseover'>(input.showSlider, this.defaultValue.showSlider, ['always', 'mouseover']),
			renderCharacters: boolean(input.renderCharacters, this.defaultValue.renderCharacters),
			scale: EditorIntOption.clampedInt(input.scale, 1, 1, 3),
			maxColumn: EditorIntOption.clampedInt(input.maxColumn, this.defaultValue.maxColumn, 1, 10000),
			showRegionSectionHeaders: boolean(input.showRegionSectionHeaders, this.defaultValue.showRegionSectionHeaders),
			showMarkSectionHeaders: boolean(input.showMarkSectionHeaders, this.defaultValue.showMarkSectionHeaders),
			markSectionHeaderRegex: markSectionHeaderRegex,
			sectionHeaderFontSize: EditorFloatOption.clamp(input.sectionHeaderFontSize ?? this.defaultValue.sectionHeaderFontSize, 4, 32),
			sectionHeaderLetterSpacing: EditorFloatOption.clamp(input.sectionHeaderLetterSpacing ?? this.defaultValue.sectionHeaderLetterSpacing, 0, 5),
		};
	}
}

//#endregion

//#region multiCursorModifier

function _multiCursorModifierFromString(multiCursorModifier: 'ctrlCmd' | 'alt'): 'altKey' | 'metaKey' | 'ctrlKey' {
	if (multiCursorModifier === 'ctrlCmd') {
		return (platform.isMacintosh ? 'metaKey' : 'ctrlKey');
	}
	return 'altKey';
}

//#endregion

//#region padding

/**
 * Configuration options for editor padding
 */
export interface IEditorPaddingOptions {
	/**
	 * Spacing between top edge of editor and first line.
	 */
	top?: number;
	/**
	 * Spacing between bottom edge of editor and last line.
	 */
	bottom?: number;
}

/**
 * @internal
 */
export type InternalEditorPaddingOptions = Readonly<Required<IEditorPaddingOptions>>;

class EditorPadding extends BaseEditorOption<EditorOption.padding, IEditorPaddingOptions, InternalEditorPaddingOptions> {

	constructor() {
		super(
			EditorOption.padding, 'padding', { top: 0, bottom: 0 },
			{
				'editor.padding.top': {
					type: 'number',
					default: 0,
					minimum: 0,
					maximum: 1000,
					description: nls.localize('padding.top', "Controls the amount of space between the top edge of the editor and the first line.")
				},
				'editor.padding.bottom': {
					type: 'number',
					default: 0,
					minimum: 0,
					maximum: 1000,
					description: nls.localize('padding.bottom', "Controls the amount of space between the bottom edge of the editor and the last line.")
				}
			}
		);
	}

	public validate(_input: any): InternalEditorPaddingOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorPaddingOptions;

		return {
			top: EditorIntOption.clampedInt(input.top, 0, 0, 1000),
			bottom: EditorIntOption.clampedInt(input.bottom, 0, 0, 1000)
		};
	}
}
//#endregion

//#region parameterHints

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

/**
 * @internal
 */
export type InternalParameterHintOptions = Readonly<Required<IEditorParameterHintOptions>>;

class EditorParameterHints extends BaseEditorOption<EditorOption.parameterHints, IEditorParameterHintOptions, InternalParameterHintOptions> {

	constructor() {
		const defaults: InternalParameterHintOptions = {
			enabled: true,
			cycle: true
		};
		super(
			EditorOption.parameterHints, 'parameterHints', defaults,
			{
				'editor.parameterHints.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					description: nls.localize('parameterHints.enabled', "Enables a pop-up that shows parameter documentation and type information as you type.")
				},
				'editor.parameterHints.cycle': {
					type: 'boolean',
					default: defaults.cycle,
					description: nls.localize('parameterHints.cycle', "Controls whether the parameter hints menu cycles or closes when reaching the end of the list.")
				},
			}
		);
	}

	public validate(_input: any): InternalParameterHintOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorParameterHintOptions;
		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			cycle: boolean(input.cycle, this.defaultValue.cycle)
		};
	}
}

//#endregion

//#region pixelRatio

class EditorPixelRatio extends ComputedEditorOption<EditorOption.pixelRatio, number> {

	constructor() {
		super(EditorOption.pixelRatio);
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, _: number): number {
		return env.pixelRatio;
	}
}

//#endregion

//#region

class PlaceholderOption extends BaseEditorOption<EditorOption.placeholder, string | undefined, string | undefined> {
	constructor() {
		super(EditorOption.placeholder, 'placeholder', undefined);
	}

	public validate(input: any): string | undefined {
		if (typeof input === 'undefined') {
			return this.defaultValue;
		}
		if (typeof input === 'string') {
			return input;
		}
		return this.defaultValue;
	}
}
//#endregion

//#region quickSuggestions

export type QuickSuggestionsValue = 'on' | 'inline' | 'off';

/**
 * Configuration options for quick suggestions
 */
export interface IQuickSuggestionsOptions {
	other?: boolean | QuickSuggestionsValue;
	comments?: boolean | QuickSuggestionsValue;
	strings?: boolean | QuickSuggestionsValue;
}

export interface InternalQuickSuggestionsOptions {
	readonly other: QuickSuggestionsValue;
	readonly comments: QuickSuggestionsValue;
	readonly strings: QuickSuggestionsValue;
}

class EditorQuickSuggestions extends BaseEditorOption<EditorOption.quickSuggestions, boolean | IQuickSuggestionsOptions, InternalQuickSuggestionsOptions> {

	public override readonly defaultValue: InternalQuickSuggestionsOptions;

	constructor() {
		const defaults: InternalQuickSuggestionsOptions = {
			other: 'on',
			comments: 'off',
			strings: 'off'
		};
		const types: IJSONSchema[] = [
			{ type: 'boolean' },
			{
				type: 'string',
				enum: ['on', 'inline', 'off'],
				enumDescriptions: [nls.localize('on', "Quick suggestions show inside the suggest widget"), nls.localize('inline', "Quick suggestions show as ghost text"), nls.localize('off', "Quick suggestions are disabled")]
			}
		];
		super(EditorOption.quickSuggestions, 'quickSuggestions', defaults, {
			type: 'object',
			additionalProperties: false,
			properties: {
				strings: {
					anyOf: types,
					default: defaults.strings,
					description: nls.localize('quickSuggestions.strings', "Enable quick suggestions inside strings.")
				},
				comments: {
					anyOf: types,
					default: defaults.comments,
					description: nls.localize('quickSuggestions.comments', "Enable quick suggestions inside comments.")
				},
				other: {
					anyOf: types,
					default: defaults.other,
					description: nls.localize('quickSuggestions.other', "Enable quick suggestions outside of strings and comments.")
				},
			},
			default: defaults,
			markdownDescription: nls.localize('quickSuggestions', "Controls whether suggestions should automatically show up while typing. This can be controlled for typing in comments, strings, and other code. Quick suggestion can be configured to show as ghost text or with the suggest widget. Also be aware of the {0}-setting which controls if suggestions are triggered by special characters.", '`#editor.suggestOnTriggerCharacters#`')
		});
		this.defaultValue = defaults;
	}

	public validate(input: any): InternalQuickSuggestionsOptions {
		if (typeof input === 'boolean') {
			// boolean -> all on/off
			const value = input ? 'on' : 'off';
			return { comments: value, strings: value, other: value };
		}
		if (!input || typeof input !== 'object') {
			// invalid object
			return this.defaultValue;
		}

		const { other, comments, strings } = (<IQuickSuggestionsOptions>input);
		const allowedValues: QuickSuggestionsValue[] = ['on', 'inline', 'off'];
		let validatedOther: QuickSuggestionsValue;
		let validatedComments: QuickSuggestionsValue;
		let validatedStrings: QuickSuggestionsValue;

		if (typeof other === 'boolean') {
			validatedOther = other ? 'on' : 'off';
		} else {
			validatedOther = stringSet(other, this.defaultValue.other, allowedValues);
		}
		if (typeof comments === 'boolean') {
			validatedComments = comments ? 'on' : 'off';
		} else {
			validatedComments = stringSet(comments, this.defaultValue.comments, allowedValues);
		}
		if (typeof strings === 'boolean') {
			validatedStrings = strings ? 'on' : 'off';
		} else {
			validatedStrings = stringSet(strings, this.defaultValue.strings, allowedValues);
		}
		return {
			other: validatedOther,
			comments: validatedComments,
			strings: validatedStrings
		};
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

class EditorRenderLineNumbersOption extends BaseEditorOption<EditorOption.lineNumbers, LineNumbersType, InternalEditorRenderLineNumbersOptions> {

	constructor() {
		super(
			EditorOption.lineNumbers, 'lineNumbers', { renderType: RenderLineNumbersType.On, renderFn: null },
			{
				type: 'string',
				enum: ['off', 'on', 'relative', 'interval'],
				enumDescriptions: [
					nls.localize('lineNumbers.off', "Line numbers are not rendered."),
					nls.localize('lineNumbers.on', "Line numbers are rendered as absolute number."),
					nls.localize('lineNumbers.relative', "Line numbers are rendered as distance in lines to cursor position."),
					nls.localize('lineNumbers.interval', "Line numbers are rendered every 10 lines.")
				],
				default: 'on',
				description: nls.localize('lineNumbers', "Controls the display of line numbers.")
			}
		);
	}

	public validate(lineNumbers: any): InternalEditorRenderLineNumbersOptions {
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
}

//#endregion

//#region renderValidationDecorations

/**
 * @internal
 */
export function filterValidationDecorations(options: IComputedEditorOptions): boolean {
	const renderValidationDecorations = options.get(EditorOption.renderValidationDecorations);
	if (renderValidationDecorations === 'editable') {
		return options.get(EditorOption.readOnly);
	}
	return renderValidationDecorations === 'on' ? false : true;
}

//#endregion

//#region rulers

export interface IRulerOption {
	readonly column: number;
	readonly color: string | null;
}

class EditorRulers extends BaseEditorOption<EditorOption.rulers, (number | IRulerOption)[], IRulerOption[]> {

	constructor() {
		const defaults: IRulerOption[] = [];
		const columnSchema: IJSONSchema = { type: 'number', description: nls.localize('rulers.size', "Number of monospace characters at which this editor ruler will render.") };
		super(
			EditorOption.rulers, 'rulers', defaults,
			{
				type: 'array',
				items: {
					anyOf: [
						columnSchema,
						{
							type: [
								'object'
							],
							properties: {
								column: columnSchema,
								color: {
									type: 'string',
									description: nls.localize('rulers.color', "Color of this editor ruler."),
									format: 'color-hex'
								}
							}
						}
					]
				},
				default: defaults,
				description: nls.localize('rulers', "Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty.")
			}
		);
	}

	public validate(input: any): IRulerOption[] {
		if (Array.isArray(input)) {
			const rulers: IRulerOption[] = [];
			for (const _element of input) {
				if (typeof _element === 'number') {
					rulers.push({
						column: EditorIntOption.clampedInt(_element, 0, 0, 10000),
						color: null
					});
				} else if (_element && typeof _element === 'object') {
					const element = _element as IRulerOption;
					rulers.push({
						column: EditorIntOption.clampedInt(element.column, 0, 0, 10000),
						color: element.color
					});
				}
			}
			rulers.sort((a, b) => a.column - b.column);
			return rulers;
		}
		return this.defaultValue;
	}
}

//#endregion

//#region readonly

/**
 * Configuration options for readonly message
 */
class ReadonlyMessage extends BaseEditorOption<EditorOption.readOnlyMessage, IMarkdownString | undefined, IMarkdownString | undefined> {
	constructor() {
		const defaults = undefined;

		super(
			EditorOption.readOnlyMessage, 'readOnlyMessage', defaults
		);
	}

	public validate(_input: any): IMarkdownString | undefined {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		return _input as IMarkdownString;
	}
}

//#endregion

//#region scrollbar

/**
 * Configuration options for editor scrollbars
 */
export interface IEditorScrollbarOptions {
	/**
	 * The size of arrows (if displayed).
	 * Defaults to 11.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
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
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	useShadows?: boolean;
	/**
	 * Render arrows at the top and bottom of the vertical scrollbar.
	 * Defaults to false.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	verticalHasArrows?: boolean;
	/**
	 * Render arrows at the left and right of the horizontal scrollbar.
	 * Defaults to false.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	horizontalHasArrows?: boolean;
	/**
	 * Listen to mouse wheel events and react to them by scrolling.
	 * Defaults to true.
	 */
	handleMouseWheel?: boolean;
	/**
	 * Always consume mouse wheel events (always call preventDefault() and stopPropagation() on the browser events).
	 * Defaults to true.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	alwaysConsumeMouseWheel?: boolean;
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
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	verticalSliderSize?: number;
	/**
	 * Height in pixels for the horizontal slider.
	 * Defaults to `horizontalScrollbarSize`.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	horizontalSliderSize?: number;
	/**
	 * Scroll gutter clicks move by page vs jump to position.
	 * Defaults to false.
	 */
	scrollByPage?: boolean;

	/**
	 * When set, the horizontal scrollbar will not increase content height.
	 * Defaults to false.
	 */
	ignoreHorizontalScrollbarInContentHeight?: boolean;
}

export interface InternalEditorScrollbarOptions {
	readonly arrowSize: number;
	readonly vertical: ScrollbarVisibility;
	readonly horizontal: ScrollbarVisibility;
	readonly useShadows: boolean;
	readonly verticalHasArrows: boolean;
	readonly horizontalHasArrows: boolean;
	readonly handleMouseWheel: boolean;
	readonly alwaysConsumeMouseWheel: boolean;
	readonly horizontalScrollbarSize: number;
	readonly horizontalSliderSize: number;
	readonly verticalScrollbarSize: number;
	readonly verticalSliderSize: number;
	readonly scrollByPage: boolean;
	readonly ignoreHorizontalScrollbarInContentHeight: boolean;
}

function _scrollbarVisibilityFromString(visibility: string | undefined, defaultValue: ScrollbarVisibility): ScrollbarVisibility {
	if (typeof visibility !== 'string') {
		return defaultValue;
	}
	switch (visibility) {
		case 'hidden': return ScrollbarVisibility.Hidden;
		case 'visible': return ScrollbarVisibility.Visible;
		default: return ScrollbarVisibility.Auto;
	}
}

class EditorScrollbar extends BaseEditorOption<EditorOption.scrollbar, IEditorScrollbarOptions, InternalEditorScrollbarOptions> {

	constructor() {
		const defaults: InternalEditorScrollbarOptions = {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Auto,
			arrowSize: 11,
			useShadows: true,
			verticalHasArrows: false,
			horizontalHasArrows: false,
			horizontalScrollbarSize: 12,
			horizontalSliderSize: 12,
			verticalScrollbarSize: 14,
			verticalSliderSize: 14,
			handleMouseWheel: true,
			alwaysConsumeMouseWheel: true,
			scrollByPage: false,
			ignoreHorizontalScrollbarInContentHeight: false,
		};
		super(
			EditorOption.scrollbar, 'scrollbar', defaults,
			{
				'editor.scrollbar.vertical': {
					type: 'string',
					enum: ['auto', 'visible', 'hidden'],
					enumDescriptions: [
						nls.localize('scrollbar.vertical.auto', "The vertical scrollbar will be visible only when necessary."),
						nls.localize('scrollbar.vertical.visible', "The vertical scrollbar will always be visible."),
						nls.localize('scrollbar.vertical.fit', "The vertical scrollbar will always be hidden."),
					],
					default: 'auto',
					description: nls.localize('scrollbar.vertical', "Controls the visibility of the vertical scrollbar.")
				},
				'editor.scrollbar.horizontal': {
					type: 'string',
					enum: ['auto', 'visible', 'hidden'],
					enumDescriptions: [
						nls.localize('scrollbar.horizontal.auto', "The horizontal scrollbar will be visible only when necessary."),
						nls.localize('scrollbar.horizontal.visible', "The horizontal scrollbar will always be visible."),
						nls.localize('scrollbar.horizontal.fit', "The horizontal scrollbar will always be hidden."),
					],
					default: 'auto',
					description: nls.localize('scrollbar.horizontal', "Controls the visibility of the horizontal scrollbar.")
				},
				'editor.scrollbar.verticalScrollbarSize': {
					type: 'number',
					default: defaults.verticalScrollbarSize,
					description: nls.localize('scrollbar.verticalScrollbarSize', "The width of the vertical scrollbar.")
				},
				'editor.scrollbar.horizontalScrollbarSize': {
					type: 'number',
					default: defaults.horizontalScrollbarSize,
					description: nls.localize('scrollbar.horizontalScrollbarSize', "The height of the horizontal scrollbar.")
				},
				'editor.scrollbar.scrollByPage': {
					type: 'boolean',
					default: defaults.scrollByPage,
					description: nls.localize('scrollbar.scrollByPage', "Controls whether clicks scroll by page or jump to click position.")
				},
				'editor.scrollbar.ignoreHorizontalScrollbarInContentHeight': {
					type: 'boolean',
					default: defaults.ignoreHorizontalScrollbarInContentHeight,
					description: nls.localize('scrollbar.ignoreHorizontalScrollbarInContentHeight', "When set, the horizontal scrollbar will not increase the size of the editor's content.")
				}
			}
		);
	}

	public validate(_input: any): InternalEditorScrollbarOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IEditorScrollbarOptions;
		const horizontalScrollbarSize = EditorIntOption.clampedInt(input.horizontalScrollbarSize, this.defaultValue.horizontalScrollbarSize, 0, 1000);
		const verticalScrollbarSize = EditorIntOption.clampedInt(input.verticalScrollbarSize, this.defaultValue.verticalScrollbarSize, 0, 1000);
		return {
			arrowSize: EditorIntOption.clampedInt(input.arrowSize, this.defaultValue.arrowSize, 0, 1000),
			vertical: _scrollbarVisibilityFromString(input.vertical, this.defaultValue.vertical),
			horizontal: _scrollbarVisibilityFromString(input.horizontal, this.defaultValue.horizontal),
			useShadows: boolean(input.useShadows, this.defaultValue.useShadows),
			verticalHasArrows: boolean(input.verticalHasArrows, this.defaultValue.verticalHasArrows),
			horizontalHasArrows: boolean(input.horizontalHasArrows, this.defaultValue.horizontalHasArrows),
			handleMouseWheel: boolean(input.handleMouseWheel, this.defaultValue.handleMouseWheel),
			alwaysConsumeMouseWheel: boolean(input.alwaysConsumeMouseWheel, this.defaultValue.alwaysConsumeMouseWheel),
			horizontalScrollbarSize: horizontalScrollbarSize,
			horizontalSliderSize: EditorIntOption.clampedInt(input.horizontalSliderSize, horizontalScrollbarSize, 0, 1000),
			verticalScrollbarSize: verticalScrollbarSize,
			verticalSliderSize: EditorIntOption.clampedInt(input.verticalSliderSize, verticalScrollbarSize, 0, 1000),
			scrollByPage: boolean(input.scrollByPage, this.defaultValue.scrollByPage),
			ignoreHorizontalScrollbarInContentHeight: boolean(input.ignoreHorizontalScrollbarInContentHeight, this.defaultValue.ignoreHorizontalScrollbarInContentHeight),
		};
	}
}

//#endregion

//#region UnicodeHighlight

export type InUntrustedWorkspace = 'inUntrustedWorkspace';

/**
 * @internal
*/
export const inUntrustedWorkspace: InUntrustedWorkspace = 'inUntrustedWorkspace';

/**
 * Configuration options for unicode highlighting.
 */
export interface IUnicodeHighlightOptions {

	/**
	 * Controls whether all non-basic ASCII characters are highlighted. Only characters between U+0020 and U+007E, tab, line-feed and carriage-return are considered basic ASCII.
	 */
	nonBasicASCII?: boolean | InUntrustedWorkspace;

	/**
	 * Controls whether characters that just reserve space or have no width at all are highlighted.
	 */
	invisibleCharacters?: boolean;

	/**
	 * Controls whether characters are highlighted that can be confused with basic ASCII characters, except those that are common in the current user locale.
	 */
	ambiguousCharacters?: boolean;

	/**
	 * Controls whether characters in comments should also be subject to unicode highlighting.
	 */
	includeComments?: boolean | InUntrustedWorkspace;

	/**
	 * Controls whether characters in strings should also be subject to unicode highlighting.
	 */
	includeStrings?: boolean | InUntrustedWorkspace;

	/**
	 * Defines allowed characters that are not being highlighted.
	 */
	allowedCharacters?: Record<string, true>;

	/**
	 * Unicode characters that are common in allowed locales are not being highlighted.
	 */
	allowedLocales?: Record<string | '_os' | '_vscode', true>;
}

/**
 * @internal
 */
export type InternalUnicodeHighlightOptions = Required<Readonly<IUnicodeHighlightOptions>>;

/**
 * @internal
 */
export const unicodeHighlightConfigKeys = {
	allowedCharacters: 'editor.unicodeHighlight.allowedCharacters',
	invisibleCharacters: 'editor.unicodeHighlight.invisibleCharacters',
	nonBasicASCII: 'editor.unicodeHighlight.nonBasicASCII',
	ambiguousCharacters: 'editor.unicodeHighlight.ambiguousCharacters',
	includeComments: 'editor.unicodeHighlight.includeComments',
	includeStrings: 'editor.unicodeHighlight.includeStrings',
	allowedLocales: 'editor.unicodeHighlight.allowedLocales',
};

class UnicodeHighlight extends BaseEditorOption<EditorOption.unicodeHighlighting, IUnicodeHighlightOptions, InternalUnicodeHighlightOptions> {
	constructor() {
		const defaults: InternalUnicodeHighlightOptions = {
			nonBasicASCII: inUntrustedWorkspace,
			invisibleCharacters: true,
			ambiguousCharacters: true,
			includeComments: inUntrustedWorkspace,
			includeStrings: true,
			allowedCharacters: {},
			allowedLocales: { _os: true, _vscode: true },
		};

		super(
			EditorOption.unicodeHighlighting, 'unicodeHighlight', defaults,
			{
				[unicodeHighlightConfigKeys.nonBasicASCII]: {
					restricted: true,
					type: ['boolean', 'string'],
					enum: [true, false, inUntrustedWorkspace],
					default: defaults.nonBasicASCII,
					description: nls.localize('unicodeHighlight.nonBasicASCII', "Controls whether all non-basic ASCII characters are highlighted. Only characters between U+0020 and U+007E, tab, line-feed and carriage-return are considered basic ASCII.")
				},
				[unicodeHighlightConfigKeys.invisibleCharacters]: {
					restricted: true,
					type: 'boolean',
					default: defaults.invisibleCharacters,
					description: nls.localize('unicodeHighlight.invisibleCharacters', "Controls whether characters that just reserve space or have no width at all are highlighted.")
				},
				[unicodeHighlightConfigKeys.ambiguousCharacters]: {
					restricted: true,
					type: 'boolean',
					default: defaults.ambiguousCharacters,
					description: nls.localize('unicodeHighlight.ambiguousCharacters', "Controls whether characters are highlighted that can be confused with basic ASCII characters, except those that are common in the current user locale.")
				},
				[unicodeHighlightConfigKeys.includeComments]: {
					restricted: true,
					type: ['boolean', 'string'],
					enum: [true, false, inUntrustedWorkspace],
					default: defaults.includeComments,
					description: nls.localize('unicodeHighlight.includeComments', "Controls whether characters in comments should also be subject to Unicode highlighting.")
				},
				[unicodeHighlightConfigKeys.includeStrings]: {
					restricted: true,
					type: ['boolean', 'string'],
					enum: [true, false, inUntrustedWorkspace],
					default: defaults.includeStrings,
					description: nls.localize('unicodeHighlight.includeStrings', "Controls whether characters in strings should also be subject to Unicode highlighting.")
				},
				[unicodeHighlightConfigKeys.allowedCharacters]: {
					restricted: true,
					type: 'object',
					default: defaults.allowedCharacters,
					description: nls.localize('unicodeHighlight.allowedCharacters', "Defines allowed characters that are not being highlighted."),
					additionalProperties: {
						type: 'boolean'
					}
				},
				[unicodeHighlightConfigKeys.allowedLocales]: {
					restricted: true,
					type: 'object',
					additionalProperties: {
						type: 'boolean'
					},
					default: defaults.allowedLocales,
					description: nls.localize('unicodeHighlight.allowedLocales', "Unicode characters that are common in allowed locales are not being highlighted.")
				},
			}
		);
	}

	public override applyUpdate(value: Required<Readonly<IUnicodeHighlightOptions>> | undefined, update: Required<Readonly<IUnicodeHighlightOptions>>): ApplyUpdateResult<Required<Readonly<IUnicodeHighlightOptions>>> {
		let didChange = false;
		if (update.allowedCharacters && value) {
			// Treat allowedCharacters atomically
			if (!objects.equals(value.allowedCharacters, update.allowedCharacters)) {
				value = { ...value, allowedCharacters: update.allowedCharacters };
				didChange = true;
			}
		}
		if (update.allowedLocales && value) {
			// Treat allowedLocales atomically
			if (!objects.equals(value.allowedLocales, update.allowedLocales)) {
				value = { ...value, allowedLocales: update.allowedLocales };
				didChange = true;
			}
		}

		const result = super.applyUpdate(value, update);
		if (didChange) {
			return new ApplyUpdateResult(result.newValue, true);
		}
		return result;
	}

	public validate(_input: any): InternalUnicodeHighlightOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IUnicodeHighlightOptions;
		return {
			nonBasicASCII: primitiveSet<boolean | InUntrustedWorkspace>(input.nonBasicASCII, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
			invisibleCharacters: boolean(input.invisibleCharacters, this.defaultValue.invisibleCharacters),
			ambiguousCharacters: boolean(input.ambiguousCharacters, this.defaultValue.ambiguousCharacters),
			includeComments: primitiveSet<boolean | InUntrustedWorkspace>(input.includeComments, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
			includeStrings: primitiveSet<boolean | InUntrustedWorkspace>(input.includeStrings, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
			allowedCharacters: this.validateBooleanMap(_input.allowedCharacters, this.defaultValue.allowedCharacters),
			allowedLocales: this.validateBooleanMap(_input.allowedLocales, this.defaultValue.allowedLocales),
		};
	}

	private validateBooleanMap(map: unknown, defaultValue: Record<string, true>): Record<string, true> {
		if ((typeof map !== 'object') || !map) {
			return defaultValue;
		}
		const result: Record<string, true> = {};
		for (const [key, value] of Object.entries(map)) {
			if (value === true) {
				result[key] = true;
			}
		}
		return result;
	}
}

//#endregion

//#region inlineSuggest

export interface IInlineSuggestOptions {
	/**
	 * Enable or disable the rendering of automatic inline completions.
	*/
	enabled?: boolean;

	/**
	 * Configures the mode.
	 * Use `prefix` to only show ghost text if the text to replace is a prefix of the suggestion text.
	 * Use `subword` to only show ghost text if the replace text is a subword of the suggestion text.
	 * Use `subwordSmart` to only show ghost text if the replace text is a subword of the suggestion text, but the subword must start after the cursor position.
	 * Defaults to `prefix`.
	*/
	mode?: 'prefix' | 'subword' | 'subwordSmart';

	showToolbar?: 'always' | 'onHover' | 'never';

	syntaxHighlightingEnabled?: boolean;

	suppressSuggestions?: boolean;

	/**
	 * Does not clear active inline suggestions when the editor loses focus.
	 */
	keepOnBlur?: boolean;

	/**
	 * Font family for inline suggestions.
	 */
	fontFamily?: string | 'default';

	edits?: {
		codeShifting?: boolean;

		renderSideBySide?: 'never' | 'auto';

		showCollapsed?: boolean;

		/**
		* @internal
		*/
		enabled?: boolean;
		/**
		* @internal
		*/
		useMixedLinesDiff?: 'never' | 'whenPossible' | 'forStableInsertions' | 'afterJumpWhenPossible';
		/**
		* @internal
		*/
		useInterleavedLinesDiff?: 'never' | 'always' | 'afterJump';
		/**
		* @internal
		*/
		useMultiLineGhostText?: boolean;
		/**
		* @internal
		*/
		useGutterIndicator?: boolean;
	};
}

type RequiredRecursive<T> = {
	[P in keyof T]-?: T[P] extends object | undefined ? RequiredRecursive<T[P]> : T[P];
};

/**
 * @internal
 */
export type InternalInlineSuggestOptions = Readonly<RequiredRecursive<IInlineSuggestOptions>>;

/**
 * Configuration options for inline suggestions
 */
class InlineEditorSuggest extends BaseEditorOption<EditorOption.inlineSuggest, IInlineSuggestOptions, InternalInlineSuggestOptions> {
	constructor() {
		const defaults: InternalInlineSuggestOptions = {
			enabled: true,
			mode: 'subwordSmart',
			showToolbar: 'onHover',
			suppressSuggestions: false,
			keepOnBlur: false,
			fontFamily: 'default',
			syntaxHighlightingEnabled: false,
			edits: {
				enabled: true,
				showCollapsed: false,
				useMixedLinesDiff: 'forStableInsertions',
				useInterleavedLinesDiff: 'never',
				renderSideBySide: 'auto',
				useGutterIndicator: true,
				codeShifting: true,
				useMultiLineGhostText: true
			},
		};

		super(
			EditorOption.inlineSuggest, 'inlineSuggest', defaults,
			{
				'editor.inlineSuggest.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					description: nls.localize('inlineSuggest.enabled', "Controls whether to automatically show inline suggestions in the editor.")
				},
				'editor.inlineSuggest.showToolbar': {
					type: 'string',
					default: defaults.showToolbar,
					enum: ['always', 'onHover', 'never'],
					enumDescriptions: [
						nls.localize('inlineSuggest.showToolbar.always', "Show the inline suggestion toolbar whenever an inline suggestion is shown."),
						nls.localize('inlineSuggest.showToolbar.onHover', "Show the inline suggestion toolbar when hovering over an inline suggestion."),
						nls.localize('inlineSuggest.showToolbar.never', "Never show the inline suggestion toolbar."),
					],
					description: nls.localize('inlineSuggest.showToolbar', "Controls when to show the inline suggestion toolbar."),
				},
				'editor.inlineSuggest.syntaxHighlightingEnabled': {
					type: 'boolean',
					default: defaults.syntaxHighlightingEnabled,
					description: nls.localize('inlineSuggest.syntaxHighlightingEnabled', "Controls whether to show syntax highlighting for inline suggestions in the editor."),
				},
				'editor.inlineSuggest.suppressSuggestions': {
					type: 'boolean',
					default: defaults.suppressSuggestions,
					description: nls.localize('inlineSuggest.suppressSuggestions', "Controls how inline suggestions interact with the suggest widget. If enabled, the suggest widget is not shown automatically when inline suggestions are available.")
				},
				'editor.inlineSuggest.fontFamily': {
					type: 'string',
					default: defaults.fontFamily,
					description: nls.localize('inlineSuggest.fontFamily', "Controls the font family of the inline suggestions.")
				},
				/* 'editor.inlineSuggest.edits.useMixedLinesDiff': {
					type: 'string',
					default: defaults.edits.useMixedLinesDiff,
					description: nls.localize('inlineSuggest.edits.useMixedLinesDiff', "Controls whether to enable mixed lines diff in inline suggestions."),
					enum: ['never', 'whenPossible', 'forStableInsertions', 'afterJumpWhenPossible'],
				}, */
				'editor.inlineSuggest.edits.codeShifting': {
					type: 'boolean',
					default: defaults.edits.codeShifting,
					description: nls.localize('inlineSuggest.edits.codeShifting', "Controls whether showing a suggestion will shift the code to make space for the suggestion inline."),
					tags: ['nextEditSuggestions']
				},
				'editor.inlineSuggest.edits.renderSideBySide': {
					type: 'string',
					default: defaults.edits.renderSideBySide,
					description: nls.localize('inlineSuggest.edits.renderSideBySide', "Controls whether larger suggestions can be shown side by side."),
					enum: ['auto', 'never'],
					enumDescriptions: [
						nls.localize('editor.inlineSuggest.edits.renderSideBySide.auto', "Larger suggestions will show side by side if there is enough space, otherwise they will be shown below."),
						nls.localize('editor.inlineSuggest.edits.renderSideBySide.never', "Larger suggestions are never shown side by side and will always be shown below."),
					],
					tags: ['nextEditSuggestions']
				},
				'editor.inlineSuggest.edits.showCollapsed': {
					type: 'boolean',
					default: defaults.edits.showCollapsed,
					description: nls.localize('inlineSuggest.edits.showCollapsed', "Controls whether the suggestion will show as collapsed until jumping to it."),
					tags: ['nextEditSuggestions']
				},
				/* 'editor.inlineSuggest.edits.useMultiLineGhostText': {
					type: 'boolean',
					default: defaults.edits.useMultiLineGhostText,
					description: nls.localize('inlineSuggest.edits.useMultiLineGhostText', "Controls whether multi line insertions can be shown with Ghost text."),
				}, */
				/* 'editor.inlineSuggest.edits.useInterleavedLinesDiff': {
					type: 'string',
					default: defaults.edits.useInterleavedLinesDiff,
					description: nls.localize('inlineSuggest.edits.useInterleavedLinesDiff', "Controls whether to enable interleaved lines diff in inline suggestions."),
					enum: ['never', 'always', 'afterJump'],
				}, */
				/* 'editor.inlineSuggest.edits.useGutterIndicator': {
					type: 'boolean',
					default: defaults.edits.useGutterIndicator,
					description: nls.localize('inlineSuggest.edits.useGutterIndicator', "Controls whether to show a gutter indicator for inline suggestions.")
				}, */
			}
		);
	}

	public validate(_input: any): InternalInlineSuggestOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IInlineSuggestOptions;
		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			mode: stringSet(input.mode, this.defaultValue.mode, ['prefix', 'subword', 'subwordSmart']),
			showToolbar: stringSet(input.showToolbar, this.defaultValue.showToolbar, ['always', 'onHover', 'never']),
			suppressSuggestions: boolean(input.suppressSuggestions, this.defaultValue.suppressSuggestions),
			keepOnBlur: boolean(input.keepOnBlur, this.defaultValue.keepOnBlur),
			fontFamily: EditorStringOption.string(input.fontFamily, this.defaultValue.fontFamily),
			syntaxHighlightingEnabled: boolean(input.syntaxHighlightingEnabled, this.defaultValue.syntaxHighlightingEnabled),
			edits: {
				enabled: boolean(input.edits?.enabled, this.defaultValue.edits.enabled),
				showCollapsed: boolean(input.edits?.showCollapsed, this.defaultValue.edits.showCollapsed),
				useMixedLinesDiff: stringSet(input.edits?.useMixedLinesDiff, this.defaultValue.edits.useMixedLinesDiff, ['never', 'whenPossible', 'forStableInsertions', 'afterJumpWhenPossible']),
				codeShifting: boolean(input.edits?.codeShifting, this.defaultValue.edits.codeShifting),
				renderSideBySide: stringSet(input.edits?.renderSideBySide, this.defaultValue.edits.renderSideBySide, ['never', 'auto']),
				useInterleavedLinesDiff: stringSet(input.edits?.useInterleavedLinesDiff, this.defaultValue.edits.useInterleavedLinesDiff, ['never', 'always', 'afterJump']),
				useGutterIndicator: boolean(input.edits?.useGutterIndicator, this.defaultValue.edits.useGutterIndicator),
				useMultiLineGhostText: boolean(input.edits?.useMultiLineGhostText, this.defaultValue.edits.useMultiLineGhostText),
			},
		};
	}
}

//#endregion

//#region bracketPairColorization

export interface IBracketPairColorizationOptions {
	/**
	 * Enable or disable bracket pair colorization.
	*/
	enabled?: boolean;

	/**
	 * Use independent color pool per bracket type.
	*/
	independentColorPoolPerBracketType?: boolean;
}

/**
 * @internal
 */
export type InternalBracketPairColorizationOptions = Readonly<Required<IBracketPairColorizationOptions>>;

/**
 * Configuration options for inline suggestions
 */
class BracketPairColorization extends BaseEditorOption<EditorOption.bracketPairColorization, IBracketPairColorizationOptions, InternalBracketPairColorizationOptions> {
	constructor() {
		const defaults: InternalBracketPairColorizationOptions = {
			enabled: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions.enabled,
			independentColorPoolPerBracketType: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions.independentColorPoolPerBracketType,
		};

		super(
			EditorOption.bracketPairColorization, 'bracketPairColorization', defaults,
			{
				'editor.bracketPairColorization.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					markdownDescription: nls.localize('bracketPairColorization.enabled', "Controls whether bracket pair colorization is enabled or not. Use {0} to override the bracket highlight colors.", '`#workbench.colorCustomizations#`')
				},
				'editor.bracketPairColorization.independentColorPoolPerBracketType': {
					type: 'boolean',
					default: defaults.independentColorPoolPerBracketType,
					description: nls.localize('bracketPairColorization.independentColorPoolPerBracketType', "Controls whether each bracket type has its own independent color pool.")
				},
			}
		);
	}

	public validate(_input: any): InternalBracketPairColorizationOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IBracketPairColorizationOptions;
		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			independentColorPoolPerBracketType: boolean(input.independentColorPoolPerBracketType, this.defaultValue.independentColorPoolPerBracketType),
		};
	}
}

//#endregion

//#region guides

export interface IGuidesOptions {
	/**
	 * Enable rendering of bracket pair guides.
	 * Defaults to false.
	*/
	bracketPairs?: boolean | 'active';

	/**
	 * Enable rendering of vertical bracket pair guides.
	 * Defaults to 'active'.
	 */
	bracketPairsHorizontal?: boolean | 'active';

	/**
	 * Enable highlighting of the active bracket pair.
	 * Defaults to true.
	*/
	highlightActiveBracketPair?: boolean;

	/**
	 * Enable rendering of indent guides.
	 * Defaults to true.
	 */
	indentation?: boolean;

	/**
	 * Enable highlighting of the active indent guide.
	 * Defaults to true.
	 */
	highlightActiveIndentation?: boolean | 'always';
}

/**
 * @internal
 */
export type InternalGuidesOptions = Readonly<Required<IGuidesOptions>>;

/**
 * Configuration options for inline suggestions
 */
class GuideOptions extends BaseEditorOption<EditorOption.guides, IGuidesOptions, InternalGuidesOptions> {
	constructor() {
		const defaults: InternalGuidesOptions = {
			bracketPairs: false,
			bracketPairsHorizontal: 'active',
			highlightActiveBracketPair: true,

			indentation: true,
			highlightActiveIndentation: true
		};

		super(
			EditorOption.guides, 'guides', defaults,
			{
				'editor.guides.bracketPairs': {
					type: ['boolean', 'string'],
					enum: [true, 'active', false],
					enumDescriptions: [
						nls.localize('editor.guides.bracketPairs.true', "Enables bracket pair guides."),
						nls.localize('editor.guides.bracketPairs.active', "Enables bracket pair guides only for the active bracket pair."),
						nls.localize('editor.guides.bracketPairs.false', "Disables bracket pair guides."),
					],
					default: defaults.bracketPairs,
					description: nls.localize('editor.guides.bracketPairs', "Controls whether bracket pair guides are enabled or not.")
				},
				'editor.guides.bracketPairsHorizontal': {
					type: ['boolean', 'string'],
					enum: [true, 'active', false],
					enumDescriptions: [
						nls.localize('editor.guides.bracketPairsHorizontal.true', "Enables horizontal guides as addition to vertical bracket pair guides."),
						nls.localize('editor.guides.bracketPairsHorizontal.active', "Enables horizontal guides only for the active bracket pair."),
						nls.localize('editor.guides.bracketPairsHorizontal.false', "Disables horizontal bracket pair guides."),
					],
					default: defaults.bracketPairsHorizontal,
					description: nls.localize('editor.guides.bracketPairsHorizontal', "Controls whether horizontal bracket pair guides are enabled or not.")
				},
				'editor.guides.highlightActiveBracketPair': {
					type: 'boolean',
					default: defaults.highlightActiveBracketPair,
					description: nls.localize('editor.guides.highlightActiveBracketPair', "Controls whether the editor should highlight the active bracket pair.")
				},
				'editor.guides.indentation': {
					type: 'boolean',
					default: defaults.indentation,
					description: nls.localize('editor.guides.indentation', "Controls whether the editor should render indent guides.")
				},
				'editor.guides.highlightActiveIndentation': {
					type: ['boolean', 'string'],
					enum: [true, 'always', false],
					enumDescriptions: [
						nls.localize('editor.guides.highlightActiveIndentation.true', "Highlights the active indent guide."),
						nls.localize('editor.guides.highlightActiveIndentation.always', "Highlights the active indent guide even if bracket guides are highlighted."),
						nls.localize('editor.guides.highlightActiveIndentation.false', "Do not highlight the active indent guide."),
					],
					default: defaults.highlightActiveIndentation,

					description: nls.localize('editor.guides.highlightActiveIndentation', "Controls whether the editor should highlight the active indent guide.")
				}
			}
		);
	}

	public validate(_input: any): InternalGuidesOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IGuidesOptions;
		return {
			bracketPairs: primitiveSet(input.bracketPairs, this.defaultValue.bracketPairs, [true, false, 'active']),
			bracketPairsHorizontal: primitiveSet(input.bracketPairsHorizontal, this.defaultValue.bracketPairsHorizontal, [true, false, 'active']),
			highlightActiveBracketPair: boolean(input.highlightActiveBracketPair, this.defaultValue.highlightActiveBracketPair),

			indentation: boolean(input.indentation, this.defaultValue.indentation),
			highlightActiveIndentation: primitiveSet(input.highlightActiveIndentation, this.defaultValue.highlightActiveIndentation, [true, false, 'always']),
		};
	}
}

function primitiveSet<T extends string | boolean>(value: unknown, defaultValue: T, allowedValues: T[]): T {
	const idx = allowedValues.indexOf(value as any);
	if (idx === -1) {
		return defaultValue;
	}
	return allowedValues[idx];
}

//#endregion

//#region suggest

/**
 * Configuration options for editor suggest widget
 */
export interface ISuggestOptions {
	/**
	 * Overwrite word ends on accept. Default to false.
	 */
	insertMode?: 'insert' | 'replace';
	/**
	 * Enable graceful matching. Defaults to true.
	 */
	filterGraceful?: boolean;
	/**
	 * Prevent quick suggestions when a snippet is active. Defaults to true.
	 */
	snippetsPreventQuickSuggestions?: boolean;
	/**
	 * Favors words that appear close to the cursor.
	 */
	localityBonus?: boolean;
	/**
	 * Enable using global storage for remembering suggestions.
	 */
	shareSuggestSelections?: boolean;
	/**
	 * Select suggestions when triggered via quick suggest or trigger characters
	 */
	selectionMode?: 'always' | 'never' | 'whenTriggerCharacter' | 'whenQuickSuggestion';
	/**
	 * Enable or disable icons in suggestions. Defaults to true.
	 */
	showIcons?: boolean;
	/**
	 * Enable or disable the suggest status bar.
	 */
	showStatusBar?: boolean;
	/**
	 * Enable or disable the rendering of the suggestion preview.
	 */
	preview?: boolean;
	/**
	 * Configures the mode of the preview.
	*/
	previewMode?: 'prefix' | 'subword' | 'subwordSmart';
	/**
	 * Show details inline with the label. Defaults to true.
	 */
	showInlineDetails?: boolean;
	/**
	 * Show method-suggestions.
	 */
	showMethods?: boolean;
	/**
	 * Show function-suggestions.
	 */
	showFunctions?: boolean;
	/**
	 * Show constructor-suggestions.
	 */
	showConstructors?: boolean;
	/**
	 * Show deprecated-suggestions.
	 */
	showDeprecated?: boolean;
	/**
	 * Controls whether suggestions allow matches in the middle of the word instead of only at the beginning
	 */
	matchOnWordStartOnly?: boolean;
	/**
	 * Show field-suggestions.
	 */
	showFields?: boolean;
	/**
	 * Show variable-suggestions.
	 */
	showVariables?: boolean;
	/**
	 * Show class-suggestions.
	 */
	showClasses?: boolean;
	/**
	 * Show struct-suggestions.
	 */
	showStructs?: boolean;
	/**
	 * Show interface-suggestions.
	 */
	showInterfaces?: boolean;
	/**
	 * Show module-suggestions.
	 */
	showModules?: boolean;
	/**
	 * Show property-suggestions.
	 */
	showProperties?: boolean;
	/**
	 * Show event-suggestions.
	 */
	showEvents?: boolean;
	/**
	 * Show operator-suggestions.
	 */
	showOperators?: boolean;
	/**
	 * Show unit-suggestions.
	 */
	showUnits?: boolean;
	/**
	 * Show value-suggestions.
	 */
	showValues?: boolean;
	/**
	 * Show constant-suggestions.
	 */
	showConstants?: boolean;
	/**
	 * Show enum-suggestions.
	 */
	showEnums?: boolean;
	/**
	 * Show enumMember-suggestions.
	 */
	showEnumMembers?: boolean;
	/**
	 * Show keyword-suggestions.
	 */
	showKeywords?: boolean;
	/**
	 * Show text-suggestions.
	 */
	showWords?: boolean;
	/**
	 * Show color-suggestions.
	 */
	showColors?: boolean;
	/**
	 * Show file-suggestions.
	 */
	showFiles?: boolean;
	/**
	 * Show reference-suggestions.
	 */
	showReferences?: boolean;
	/**
	 * Show folder-suggestions.
	 */
	showFolders?: boolean;
	/**
	 * Show typeParameter-suggestions.
	 */
	showTypeParameters?: boolean;
	/**
	 * Show issue-suggestions.
	 */
	showIssues?: boolean;
	/**
	 * Show user-suggestions.
	 */
	showUsers?: boolean;
	/**
	 * Show snippet-suggestions.
	 */
	showSnippets?: boolean;
}

/**
 * @internal
 */
export type InternalSuggestOptions = Readonly<Required<ISuggestOptions>>;

class EditorSuggest extends BaseEditorOption<EditorOption.suggest, ISuggestOptions, InternalSuggestOptions> {

	constructor() {
		const defaults: InternalSuggestOptions = {
			insertMode: 'insert',
			filterGraceful: true,
			snippetsPreventQuickSuggestions: false,
			localityBonus: false,
			shareSuggestSelections: false,
			selectionMode: 'always',
			showIcons: true,
			showStatusBar: false,
			preview: false,
			previewMode: 'subwordSmart',
			showInlineDetails: true,
			showMethods: true,
			showFunctions: true,
			showConstructors: true,
			showDeprecated: true,
			matchOnWordStartOnly: true,
			showFields: true,
			showVariables: true,
			showClasses: true,
			showStructs: true,
			showInterfaces: true,
			showModules: true,
			showProperties: true,
			showEvents: true,
			showOperators: true,
			showUnits: true,
			showValues: true,
			showConstants: true,
			showEnums: true,
			showEnumMembers: true,
			showKeywords: true,
			showWords: true,
			showColors: true,
			showFiles: true,
			showReferences: true,
			showFolders: true,
			showTypeParameters: true,
			showSnippets: true,
			showUsers: true,
			showIssues: true,
		};
		super(
			EditorOption.suggest, 'suggest', defaults,
			{
				'editor.suggest.insertMode': {
					type: 'string',
					enum: ['insert', 'replace'],
					enumDescriptions: [
						nls.localize('suggest.insertMode.insert', "Insert suggestion without overwriting text right of the cursor."),
						nls.localize('suggest.insertMode.replace', "Insert suggestion and overwrite text right of the cursor."),
					],
					default: defaults.insertMode,
					description: nls.localize('suggest.insertMode', "Controls whether words are overwritten when accepting completions. Note that this depends on extensions opting into this feature.")
				},
				'editor.suggest.filterGraceful': {
					type: 'boolean',
					default: defaults.filterGraceful,
					description: nls.localize('suggest.filterGraceful', "Controls whether filtering and sorting suggestions accounts for small typos.")
				},
				'editor.suggest.localityBonus': {
					type: 'boolean',
					default: defaults.localityBonus,
					description: nls.localize('suggest.localityBonus', "Controls whether sorting favors words that appear close to the cursor.")
				},
				'editor.suggest.shareSuggestSelections': {
					type: 'boolean',
					default: defaults.shareSuggestSelections,
					markdownDescription: nls.localize('suggest.shareSuggestSelections', "Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`).")
				},
				'editor.suggest.selectionMode': {
					type: 'string',
					enum: ['always', 'never', 'whenTriggerCharacter', 'whenQuickSuggestion'],
					enumDescriptions: [
						nls.localize('suggest.insertMode.always', "Always select a suggestion when automatically triggering IntelliSense."),
						nls.localize('suggest.insertMode.never', "Never select a suggestion when automatically triggering IntelliSense."),
						nls.localize('suggest.insertMode.whenTriggerCharacter', "Select a suggestion only when triggering IntelliSense from a trigger character."),
						nls.localize('suggest.insertMode.whenQuickSuggestion', "Select a suggestion only when triggering IntelliSense as you type."),
					],
					default: defaults.selectionMode,
					markdownDescription: nls.localize('suggest.selectionMode', "Controls whether a suggestion is selected when the widget shows. Note that this only applies to automatically triggered suggestions ({0} and {1}) and that a suggestion is always selected when explicitly invoked, e.g via `Ctrl+Space`.", '`#editor.quickSuggestions#`', '`#editor.suggestOnTriggerCharacters#`')
				},
				'editor.suggest.snippetsPreventQuickSuggestions': {
					type: 'boolean',
					default: defaults.snippetsPreventQuickSuggestions,
					description: nls.localize('suggest.snippetsPreventQuickSuggestions', "Controls whether an active snippet prevents quick suggestions.")
				},
				'editor.suggest.showIcons': {
					type: 'boolean',
					default: defaults.showIcons,
					description: nls.localize('suggest.showIcons', "Controls whether to show or hide icons in suggestions.")
				},
				'editor.suggest.showStatusBar': {
					type: 'boolean',
					default: defaults.showStatusBar,
					description: nls.localize('suggest.showStatusBar', "Controls the visibility of the status bar at the bottom of the suggest widget.")
				},
				'editor.suggest.preview': {
					type: 'boolean',
					default: defaults.preview,
					description: nls.localize('suggest.preview', "Controls whether to preview the suggestion outcome in the editor.")
				},
				'editor.suggest.showInlineDetails': {
					type: 'boolean',
					default: defaults.showInlineDetails,
					description: nls.localize('suggest.showInlineDetails', "Controls whether suggest details show inline with the label or only in the details widget.")
				},
				'editor.suggest.maxVisibleSuggestions': {
					type: 'number',
					deprecationMessage: nls.localize('suggest.maxVisibleSuggestions.dep', "This setting is deprecated. The suggest widget can now be resized."),
				},
				'editor.suggest.filteredTypes': {
					type: 'object',
					deprecationMessage: nls.localize('deprecated', "This setting is deprecated, please use separate settings like 'editor.suggest.showKeywords' or 'editor.suggest.showSnippets' instead.")
				},
				'editor.suggest.showMethods': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showMethods', "When enabled IntelliSense shows `method`-suggestions.")
				},
				'editor.suggest.showFunctions': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showFunctions', "When enabled IntelliSense shows `function`-suggestions.")
				},
				'editor.suggest.showConstructors': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showConstructors', "When enabled IntelliSense shows `constructor`-suggestions.")
				},
				'editor.suggest.showDeprecated': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showDeprecated', "When enabled IntelliSense shows `deprecated`-suggestions.")
				},
				'editor.suggest.matchOnWordStartOnly': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.matchOnWordStartOnly', "When enabled IntelliSense filtering requires that the first character matches on a word start. For example, `c` on `Console` or `WebContext` but _not_ on `description`. When disabled IntelliSense will show more results but still sorts them by match quality.")
				},
				'editor.suggest.showFields': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showFields', "When enabled IntelliSense shows `field`-suggestions.")
				},
				'editor.suggest.showVariables': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showVariables', "When enabled IntelliSense shows `variable`-suggestions.")
				},
				'editor.suggest.showClasses': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showClasss', "When enabled IntelliSense shows `class`-suggestions.")
				},
				'editor.suggest.showStructs': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showStructs', "When enabled IntelliSense shows `struct`-suggestions.")
				},
				'editor.suggest.showInterfaces': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showInterfaces', "When enabled IntelliSense shows `interface`-suggestions.")
				},
				'editor.suggest.showModules': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showModules', "When enabled IntelliSense shows `module`-suggestions.")
				},
				'editor.suggest.showProperties': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showPropertys', "When enabled IntelliSense shows `property`-suggestions.")
				},
				'editor.suggest.showEvents': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showEvents', "When enabled IntelliSense shows `event`-suggestions.")
				},
				'editor.suggest.showOperators': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showOperators', "When enabled IntelliSense shows `operator`-suggestions.")
				},
				'editor.suggest.showUnits': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showUnits', "When enabled IntelliSense shows `unit`-suggestions.")
				},
				'editor.suggest.showValues': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showValues', "When enabled IntelliSense shows `value`-suggestions.")
				},
				'editor.suggest.showConstants': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showConstants', "When enabled IntelliSense shows `constant`-suggestions.")
				},
				'editor.suggest.showEnums': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showEnums', "When enabled IntelliSense shows `enum`-suggestions.")
				},
				'editor.suggest.showEnumMembers': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showEnumMembers', "When enabled IntelliSense shows `enumMember`-suggestions.")
				},
				'editor.suggest.showKeywords': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showKeywords', "When enabled IntelliSense shows `keyword`-suggestions.")
				},
				'editor.suggest.showWords': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showTexts', "When enabled IntelliSense shows `text`-suggestions.")
				},
				'editor.suggest.showColors': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showColors', "When enabled IntelliSense shows `color`-suggestions.")
				},
				'editor.suggest.showFiles': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showFiles', "When enabled IntelliSense shows `file`-suggestions.")
				},
				'editor.suggest.showReferences': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showReferences', "When enabled IntelliSense shows `reference`-suggestions.")
				},
				'editor.suggest.showCustomcolors': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showCustomcolors', "When enabled IntelliSense shows `customcolor`-suggestions.")
				},
				'editor.suggest.showFolders': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showFolders', "When enabled IntelliSense shows `folder`-suggestions.")
				},
				'editor.suggest.showTypeParameters': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showTypeParameters', "When enabled IntelliSense shows `typeParameter`-suggestions.")
				},
				'editor.suggest.showSnippets': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showSnippets', "When enabled IntelliSense shows `snippet`-suggestions.")
				},
				'editor.suggest.showUsers': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showUsers', "When enabled IntelliSense shows `user`-suggestions.")
				},
				'editor.suggest.showIssues': {
					type: 'boolean',
					default: true,
					markdownDescription: nls.localize('editor.suggest.showIssues', "When enabled IntelliSense shows `issues`-suggestions.")
				}
			}
		);
	}

	public validate(_input: any): InternalSuggestOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as ISuggestOptions;
		return {
			insertMode: stringSet(input.insertMode, this.defaultValue.insertMode, ['insert', 'replace']),
			filterGraceful: boolean(input.filterGraceful, this.defaultValue.filterGraceful),
			snippetsPreventQuickSuggestions: boolean(input.snippetsPreventQuickSuggestions, this.defaultValue.filterGraceful),
			localityBonus: boolean(input.localityBonus, this.defaultValue.localityBonus),
			shareSuggestSelections: boolean(input.shareSuggestSelections, this.defaultValue.shareSuggestSelections),
			selectionMode: stringSet(input.selectionMode, this.defaultValue.selectionMode, ['always', 'never', 'whenQuickSuggestion', 'whenTriggerCharacter']),
			showIcons: boolean(input.showIcons, this.defaultValue.showIcons),
			showStatusBar: boolean(input.showStatusBar, this.defaultValue.showStatusBar),
			preview: boolean(input.preview, this.defaultValue.preview),
			previewMode: stringSet(input.previewMode, this.defaultValue.previewMode, ['prefix', 'subword', 'subwordSmart']),
			showInlineDetails: boolean(input.showInlineDetails, this.defaultValue.showInlineDetails),
			showMethods: boolean(input.showMethods, this.defaultValue.showMethods),
			showFunctions: boolean(input.showFunctions, this.defaultValue.showFunctions),
			showConstructors: boolean(input.showConstructors, this.defaultValue.showConstructors),
			showDeprecated: boolean(input.showDeprecated, this.defaultValue.showDeprecated),
			matchOnWordStartOnly: boolean(input.matchOnWordStartOnly, this.defaultValue.matchOnWordStartOnly),
			showFields: boolean(input.showFields, this.defaultValue.showFields),
			showVariables: boolean(input.showVariables, this.defaultValue.showVariables),
			showClasses: boolean(input.showClasses, this.defaultValue.showClasses),
			showStructs: boolean(input.showStructs, this.defaultValue.showStructs),
			showInterfaces: boolean(input.showInterfaces, this.defaultValue.showInterfaces),
			showModules: boolean(input.showModules, this.defaultValue.showModules),
			showProperties: boolean(input.showProperties, this.defaultValue.showProperties),
			showEvents: boolean(input.showEvents, this.defaultValue.showEvents),
			showOperators: boolean(input.showOperators, this.defaultValue.showOperators),
			showUnits: boolean(input.showUnits, this.defaultValue.showUnits),
			showValues: boolean(input.showValues, this.defaultValue.showValues),
			showConstants: boolean(input.showConstants, this.defaultValue.showConstants),
			showEnums: boolean(input.showEnums, this.defaultValue.showEnums),
			showEnumMembers: boolean(input.showEnumMembers, this.defaultValue.showEnumMembers),
			showKeywords: boolean(input.showKeywords, this.defaultValue.showKeywords),
			showWords: boolean(input.showWords, this.defaultValue.showWords),
			showColors: boolean(input.showColors, this.defaultValue.showColors),
			showFiles: boolean(input.showFiles, this.defaultValue.showFiles),
			showReferences: boolean(input.showReferences, this.defaultValue.showReferences),
			showFolders: boolean(input.showFolders, this.defaultValue.showFolders),
			showTypeParameters: boolean(input.showTypeParameters, this.defaultValue.showTypeParameters),
			showSnippets: boolean(input.showSnippets, this.defaultValue.showSnippets),
			showUsers: boolean(input.showUsers, this.defaultValue.showUsers),
			showIssues: boolean(input.showIssues, this.defaultValue.showIssues),
		};
	}
}

//#endregion

//#region smart select

export interface ISmartSelectOptions {
	selectLeadingAndTrailingWhitespace?: boolean;
	selectSubwords?: boolean;
}

/**
 * @internal
 */
export type SmartSelectOptions = Readonly<Required<ISmartSelectOptions>>;

class SmartSelect extends BaseEditorOption<EditorOption.smartSelect, ISmartSelectOptions, SmartSelectOptions> {

	constructor() {
		super(
			EditorOption.smartSelect, 'smartSelect',
			{
				selectLeadingAndTrailingWhitespace: true,
				selectSubwords: true,
			},
			{
				'editor.smartSelect.selectLeadingAndTrailingWhitespace': {
					description: nls.localize('selectLeadingAndTrailingWhitespace', "Whether leading and trailing whitespace should always be selected."),
					default: true,
					type: 'boolean'
				},
				'editor.smartSelect.selectSubwords': {
					description: nls.localize('selectSubwords', "Whether subwords (like 'foo' in 'fooBar' or 'foo_bar') should be selected."),
					default: true,
					type: 'boolean'
				}
			}
		);
	}

	public validate(input: any): Readonly<Required<ISmartSelectOptions>> {
		if (!input || typeof input !== 'object') {
			return this.defaultValue;
		}
		return {
			selectLeadingAndTrailingWhitespace: boolean((input as ISmartSelectOptions).selectLeadingAndTrailingWhitespace, this.defaultValue.selectLeadingAndTrailingWhitespace),
			selectSubwords: boolean((input as ISmartSelectOptions).selectSubwords, this.defaultValue.selectSubwords),
		};
	}
}

//#endregion

//#region wordSegmenterLocales

/**
 * Locales used for segmenting lines into words when doing word related navigations or operations.
 *
 * Specify the BCP 47 language tag of the word you wish to recognize (e.g., ja, zh-CN, zh-Hant-TW, etc.).
 */
class WordSegmenterLocales extends BaseEditorOption<EditorOption.wordSegmenterLocales, string | string[], string[]> {
	constructor() {
		const defaults: string[] = [];

		super(
			EditorOption.wordSegmenterLocales, 'wordSegmenterLocales', defaults,
			{
				anyOf: [
					{
						description: nls.localize('wordSegmenterLocales', "Locales to be used for word segmentation when doing word related navigations or operations. Specify the BCP 47 language tag of the word you wish to recognize (e.g., ja, zh-CN, zh-Hant-TW, etc.)."),
						type: 'string',
					}, {
						description: nls.localize('wordSegmenterLocales', "Locales to be used for word segmentation when doing word related navigations or operations. Specify the BCP 47 language tag of the word you wish to recognize (e.g., ja, zh-CN, zh-Hant-TW, etc.)."),
						type: 'array',
						items: {
							type: 'string'
						}
					}
				]
			}
		);
	}

	public validate(input: any): string[] {
		if (typeof input === 'string') {
			input = [input];
		}
		if (Array.isArray(input)) {
			const validLocales: string[] = [];
			for (const locale of input) {
				if (typeof locale === 'string') {
					try {
						if (Intl.Segmenter.supportedLocalesOf(locale).length > 0) {
							validLocales.push(locale);
						}
					} catch {
						// ignore invalid locales
					}
				}
			}
			return validLocales;
		}

		return this.defaultValue;
	}
}


//#endregion

//#region wrappingIndent

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

class WrappingIndentOption extends BaseEditorOption<EditorOption.wrappingIndent, 'none' | 'same' | 'indent' | 'deepIndent', WrappingIndent> {

	constructor() {
		super(EditorOption.wrappingIndent, 'wrappingIndent', WrappingIndent.Same,
			{
				'editor.wrappingIndent': {
					type: 'string',
					enum: ['none', 'same', 'indent', 'deepIndent'],
					enumDescriptions: [
						nls.localize('wrappingIndent.none', "No indentation. Wrapped lines begin at column 1."),
						nls.localize('wrappingIndent.same', "Wrapped lines get the same indentation as the parent."),
						nls.localize('wrappingIndent.indent', "Wrapped lines get +1 indentation toward the parent."),
						nls.localize('wrappingIndent.deepIndent', "Wrapped lines get +2 indentation toward the parent."),
					],
					description: nls.localize('wrappingIndent', "Controls the indentation of wrapped lines."),
					default: 'same'
				}
			}
		);
	}

	public validate(input: any): WrappingIndent {
		switch (input) {
			case 'none': return WrappingIndent.None;
			case 'same': return WrappingIndent.Same;
			case 'indent': return WrappingIndent.Indent;
			case 'deepIndent': return WrappingIndent.DeepIndent;
		}
		return WrappingIndent.Same;
	}

	public override compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, value: WrappingIndent): WrappingIndent {
		const accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		if (accessibilitySupport === AccessibilitySupport.Enabled) {
			// if we know for a fact that a screen reader is attached, we use no indent wrapping to
			// help that the editor's wrapping points match the textarea's wrapping points
			return WrappingIndent.None;
		}
		return value;
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

class EditorWrappingInfoComputer extends ComputedEditorOption<EditorOption.wrappingInfo, EditorWrappingInfo> {

	constructor() {
		super(EditorOption.wrappingInfo);
	}

	public compute(env: IEnvironmentalOptions, options: IComputedEditorOptions, _: EditorWrappingInfo): EditorWrappingInfo {
		const layoutInfo = options.get(EditorOption.layoutInfo);

		return {
			isDominatedByLongLines: env.isDominatedByLongLines,
			isWordWrapMinified: layoutInfo.isWordWrapMinified,
			isViewportWrapping: layoutInfo.isViewportWrapping,
			wrappingColumn: layoutInfo.wrappingColumn,
		};
	}
}

//#endregion

//#region dropIntoEditor

/**
 * Configuration options for editor drop into behavior
 */
export interface IDropIntoEditorOptions {
	/**
	 * Enable dropping into editor.
	 * Defaults to true.
	 */
	enabled?: boolean;

	/**
	 * Controls if a widget is shown after a drop.
	 * Defaults to 'afterDrop'.
	 */
	showDropSelector?: 'afterDrop' | 'never';
}

/**
 * @internal
 */
export type EditorDropIntoEditorOptions = Readonly<Required<IDropIntoEditorOptions>>;

class EditorDropIntoEditor extends BaseEditorOption<EditorOption.dropIntoEditor, IDropIntoEditorOptions, EditorDropIntoEditorOptions> {

	constructor() {
		const defaults: EditorDropIntoEditorOptions = { enabled: true, showDropSelector: 'afterDrop' };
		super(
			EditorOption.dropIntoEditor, 'dropIntoEditor', defaults,
			{
				'editor.dropIntoEditor.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					markdownDescription: nls.localize('dropIntoEditor.enabled', "Controls whether you can drag and drop a file into a text editor by holding down the `Shift` key (instead of opening the file in an editor)."),
				},
				'editor.dropIntoEditor.showDropSelector': {
					type: 'string',
					markdownDescription: nls.localize('dropIntoEditor.showDropSelector', "Controls if a widget is shown when dropping files into the editor. This widget lets you control how the file is dropped."),
					enum: [
						'afterDrop',
						'never'
					],
					enumDescriptions: [
						nls.localize('dropIntoEditor.showDropSelector.afterDrop', "Show the drop selector widget after a file is dropped into the editor."),
						nls.localize('dropIntoEditor.showDropSelector.never', "Never show the drop selector widget. Instead the default drop provider is always used."),
					],
					default: 'afterDrop',
				},
			}
		);
	}

	public validate(_input: any): EditorDropIntoEditorOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IDropIntoEditorOptions;
		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			showDropSelector: stringSet(input.showDropSelector, this.defaultValue.showDropSelector, ['afterDrop', 'never']),
		};
	}
}

//#endregion

//#region pasteAs

/**
 * Configuration options for editor pasting as into behavior
 */
export interface IPasteAsOptions {
	/**
	 * Enable paste as functionality in editors.
	 * Defaults to true.
	 */
	enabled?: boolean;

	/**
	 * Controls if a widget is shown after a drop.
	 * Defaults to 'afterPaste'.
	 */
	showPasteSelector?: 'afterPaste' | 'never';
}

/**
 * @internal
 */
export type EditorPasteAsOptions = Readonly<Required<IPasteAsOptions>>;

class EditorPasteAs extends BaseEditorOption<EditorOption.pasteAs, IPasteAsOptions, EditorPasteAsOptions> {

	constructor() {
		const defaults: EditorPasteAsOptions = { enabled: true, showPasteSelector: 'afterPaste' };
		super(
			EditorOption.pasteAs, 'pasteAs', defaults,
			{
				'editor.pasteAs.enabled': {
					type: 'boolean',
					default: defaults.enabled,
					markdownDescription: nls.localize('pasteAs.enabled', "Controls whether you can paste content in different ways."),
				},
				'editor.pasteAs.showPasteSelector': {
					type: 'string',
					markdownDescription: nls.localize('pasteAs.showPasteSelector', "Controls if a widget is shown when pasting content in to the editor. This widget lets you control how the file is pasted."),
					enum: [
						'afterPaste',
						'never'
					],
					enumDescriptions: [
						nls.localize('pasteAs.showPasteSelector.afterPaste', "Show the paste selector widget after content is pasted into the editor."),
						nls.localize('pasteAs.showPasteSelector.never', "Never show the paste selector widget. Instead the default pasting behavior is always used."),
					],
					default: 'afterPaste',
				},
			}
		);
	}

	public validate(_input: any): EditorPasteAsOptions {
		if (!_input || typeof _input !== 'object') {
			return this.defaultValue;
		}
		const input = _input as IPasteAsOptions;
		return {
			enabled: boolean(input.enabled, this.defaultValue.enabled),
			showPasteSelector: stringSet(input.showPasteSelector, this.defaultValue.showPasteSelector, ['afterPaste', 'never']),
		};
	}
}

//#endregion

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'monospace\', monospace';

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
export const editorOptionsRegistry: IEditorOption<EditorOption, any>[] = [];

function register<K extends EditorOption, V>(option: IEditorOption<K, V>): IEditorOption<K, V> {
	editorOptionsRegistry[option.id] = option;
	return option;
}

export const enum EditorOption {
	acceptSuggestionOnCommitCharacter,
	acceptSuggestionOnEnter,
	accessibilitySupport,
	accessibilityPageSize,
	ariaLabel,
	ariaRequired,
	autoClosingBrackets,
	autoClosingComments,
	screenReaderAnnounceInlineSuggestion,
	autoClosingDelete,
	autoClosingOvertype,
	autoClosingQuotes,
	autoIndent,
	automaticLayout,
	autoSurround,
	bracketPairColorization,
	guides,
	codeLens,
	codeLensFontFamily,
	codeLensFontSize,
	colorDecorators,
	colorDecoratorsLimit,
	columnSelection,
	comments,
	contextmenu,
	copyWithSyntaxHighlighting,
	cursorBlinking,
	cursorSmoothCaretAnimation,
	cursorStyle,
	cursorSurroundingLines,
	cursorSurroundingLinesStyle,
	cursorWidth,
	disableLayerHinting,
	disableMonospaceOptimizations,
	domReadOnly,
	dragAndDrop,
	dropIntoEditor,
	experimentalEditContextEnabled,
	emptySelectionClipboard,
	experimentalGpuAcceleration,
	experimentalWhitespaceRendering,
	extraEditorClassName,
	fastScrollSensitivity,
	find,
	fixedOverflowWidgets,
	folding,
	foldingStrategy,
	foldingHighlight,
	foldingImportsByDefault,
	foldingMaximumRegions,
	unfoldOnClickAfterEndOfLine,
	fontFamily,
	fontInfo,
	fontLigatures,
	fontSize,
	fontWeight,
	fontVariations,
	formatOnPaste,
	formatOnType,
	glyphMargin,
	gotoLocation,
	hideCursorInOverviewRuler,
	hover,
	inDiffEditor,
	inlineSuggest,
	letterSpacing,
	lightbulb,
	lineDecorationsWidth,
	lineHeight,
	lineNumbers,
	lineNumbersMinChars,
	linkedEditing,
	links,
	matchBrackets,
	minimap,
	mouseStyle,
	mouseWheelScrollSensitivity,
	mouseWheelZoom,
	multiCursorMergeOverlapping,
	multiCursorModifier,
	multiCursorPaste,
	multiCursorLimit,
	occurrencesHighlight,
	occurrencesHighlightDelay,
	overtypeCursorStyle,
	overtypeOnPaste,
	overviewRulerBorder,
	overviewRulerLanes,
	padding,
	pasteAs,
	parameterHints,
	peekWidgetDefaultFocus,
	placeholder,
	definitionLinkOpensInPeek,
	quickSuggestions,
	quickSuggestionsDelay,
	readOnly,
	readOnlyMessage,
	renameOnType,
	renderControlCharacters,
	renderFinalNewline,
	renderLineHighlight,
	renderLineHighlightOnlyWhenFocus,
	renderValidationDecorations,
	renderWhitespace,
	revealHorizontalRightPadding,
	roundedSelection,
	rulers,
	scrollbar,
	scrollBeyondLastColumn,
	scrollBeyondLastLine,
	scrollPredominantAxis,
	selectionClipboard,
	selectionHighlight,
	selectOnLineNumbers,
	showFoldingControls,
	showUnused,
	snippetSuggestions,
	smartSelect,
	smoothScrolling,
	stickyScroll,
	stickyTabStops,
	stopRenderingLineAfter,
	suggest,
	suggestFontSize,
	suggestLineHeight,
	suggestOnTriggerCharacters,
	suggestSelection,
	tabCompletion,
	tabIndex,
	unicodeHighlighting,
	unusualLineTerminators,
	useShadowDOM,
	useTabStops,
	wordBreak,
	wordSegmenterLocales,
	wordSeparators,
	wordWrap,
	wordWrapBreakAfterCharacters,
	wordWrapBreakBeforeCharacters,
	wordWrapColumn,
	wordWrapOverride1,
	wordWrapOverride2,
	wrappingIndent,
	wrappingStrategy,
	showDeprecated,
	inlayHints,
	// Leave these at the end (because they have dependencies!)
	effectiveCursorStyle,
	editorClassName,
	pixelRatio,
	tabFocusMode,
	layoutInfo,
	wrappingInfo,
	defaultColorDecorators,
	colorDecoratorsActivatedOn,
	inlineCompletionsAccessibilityVerbose,
	effectiveExperimentalEditContextEnabled
}

export const EditorOptions = {
	acceptSuggestionOnCommitCharacter: register(new EditorBooleanOption(
		EditorOption.acceptSuggestionOnCommitCharacter, 'acceptSuggestionOnCommitCharacter', true,
		{ markdownDescription: nls.localize('acceptSuggestionOnCommitCharacter', "Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.") }
	)),
	acceptSuggestionOnEnter: register(new EditorStringEnumOption(
		EditorOption.acceptSuggestionOnEnter, 'acceptSuggestionOnEnter',
		'on' as 'on' | 'smart' | 'off',
		['on', 'smart', 'off'] as const,
		{
			markdownEnumDescriptions: [
				'',
				nls.localize('acceptSuggestionOnEnterSmart', "Only accept a suggestion with `Enter` when it makes a textual change."),
				''
			],
			markdownDescription: nls.localize('acceptSuggestionOnEnter', "Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions.")
		}
	)),
	accessibilitySupport: register(new EditorAccessibilitySupport()),
	accessibilityPageSize: register(new EditorIntOption(EditorOption.accessibilityPageSize, 'accessibilityPageSize', 500, 1, Constants.MAX_SAFE_SMALL_INTEGER,
		{
			description: nls.localize('accessibilityPageSize', "Controls the number of lines in the editor that can be read out by a screen reader at once. When we detect a screen reader we automatically set the default to be 500. Warning: this has a performance implication for numbers larger than the default."),
			tags: ['accessibility']
		})),
	ariaLabel: register(new EditorStringOption(
		EditorOption.ariaLabel, 'ariaLabel', nls.localize('editorViewAccessibleLabel', "Editor content")
	)),
	ariaRequired: register(new EditorBooleanOption(
		EditorOption.ariaRequired, 'ariaRequired', false, undefined
	)),
	screenReaderAnnounceInlineSuggestion: register(new EditorBooleanOption(
		EditorOption.screenReaderAnnounceInlineSuggestion, 'screenReaderAnnounceInlineSuggestion', true,
		{
			description: nls.localize('screenReaderAnnounceInlineSuggestion', "Control whether inline suggestions are announced by a screen reader."),
			tags: ['accessibility']
		}
	)),
	autoClosingBrackets: register(new EditorStringEnumOption(
		EditorOption.autoClosingBrackets, 'autoClosingBrackets',
		'languageDefined' as 'always' | 'languageDefined' | 'beforeWhitespace' | 'never',
		['always', 'languageDefined', 'beforeWhitespace', 'never'] as const,
		{
			enumDescriptions: [
				'',
				nls.localize('editor.autoClosingBrackets.languageDefined', "Use language configurations to determine when to autoclose brackets."),
				nls.localize('editor.autoClosingBrackets.beforeWhitespace', "Autoclose brackets only when the cursor is to the left of whitespace."),
				'',
			],
			description: nls.localize('autoClosingBrackets', "Controls whether the editor should automatically close brackets after the user adds an opening bracket.")
		}
	)),
	autoClosingComments: register(new EditorStringEnumOption(
		EditorOption.autoClosingComments, 'autoClosingComments',
		'languageDefined' as 'always' | 'languageDefined' | 'beforeWhitespace' | 'never',
		['always', 'languageDefined', 'beforeWhitespace', 'never'] as const,
		{
			enumDescriptions: [
				'',
				nls.localize('editor.autoClosingComments.languageDefined', "Use language configurations to determine when to autoclose comments."),
				nls.localize('editor.autoClosingComments.beforeWhitespace', "Autoclose comments only when the cursor is to the left of whitespace."),
				'',
			],
			description: nls.localize('autoClosingComments', "Controls whether the editor should automatically close comments after the user adds an opening comment.")
		}
	)),
	autoClosingDelete: register(new EditorStringEnumOption(
		EditorOption.autoClosingDelete, 'autoClosingDelete',
		'auto' as 'always' | 'auto' | 'never',
		['always', 'auto', 'never'] as const,
		{
			enumDescriptions: [
				'',
				nls.localize('editor.autoClosingDelete.auto', "Remove adjacent closing quotes or brackets only if they were automatically inserted."),
				'',
			],
			description: nls.localize('autoClosingDelete', "Controls whether the editor should remove adjacent closing quotes or brackets when deleting.")
		}
	)),
	autoClosingOvertype: register(new EditorStringEnumOption(
		EditorOption.autoClosingOvertype, 'autoClosingOvertype',
		'auto' as 'always' | 'auto' | 'never',
		['always', 'auto', 'never'] as const,
		{
			enumDescriptions: [
				'',
				nls.localize('editor.autoClosingOvertype.auto', "Type over closing quotes or brackets only if they were automatically inserted."),
				'',
			],
			description: nls.localize('autoClosingOvertype', "Controls whether the editor should type over closing quotes or brackets.")
		}
	)),
	autoClosingQuotes: register(new EditorStringEnumOption(
		EditorOption.autoClosingQuotes, 'autoClosingQuotes',
		'languageDefined' as 'always' | 'languageDefined' | 'beforeWhitespace' | 'never',
		['always', 'languageDefined', 'beforeWhitespace', 'never'] as const,
		{
			enumDescriptions: [
				'',
				nls.localize('editor.autoClosingQuotes.languageDefined', "Use language configurations to determine when to autoclose quotes."),
				nls.localize('editor.autoClosingQuotes.beforeWhitespace', "Autoclose quotes only when the cursor is to the left of whitespace."),
				'',
			],
			description: nls.localize('autoClosingQuotes', "Controls whether the editor should automatically close quotes after the user adds an opening quote.")
		}
	)),
	autoIndent: register(new EditorEnumOption(
		EditorOption.autoIndent, 'autoIndent',
		EditorAutoIndentStrategy.Full, 'full',
		['none', 'keep', 'brackets', 'advanced', 'full'],
		_autoIndentFromString,
		{
			enumDescriptions: [
				nls.localize('editor.autoIndent.none', "The editor will not insert indentation automatically."),
				nls.localize('editor.autoIndent.keep', "The editor will keep the current line's indentation."),
				nls.localize('editor.autoIndent.brackets', "The editor will keep the current line's indentation and honor language defined brackets."),
				nls.localize('editor.autoIndent.advanced', "The editor will keep the current line's indentation, honor language defined brackets and invoke special onEnterRules defined by languages."),
				nls.localize('editor.autoIndent.full', "The editor will keep the current line's indentation, honor language defined brackets, invoke special onEnterRules defined by languages, and honor indentationRules defined by languages."),
			],
			description: nls.localize('autoIndent', "Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.")
		}
	)),
	automaticLayout: register(new EditorBooleanOption(
		EditorOption.automaticLayout, 'automaticLayout', false,
	)),
	autoSurround: register(new EditorStringEnumOption(
		EditorOption.autoSurround, 'autoSurround',
		'languageDefined' as 'languageDefined' | 'quotes' | 'brackets' | 'never',
		['languageDefined', 'quotes', 'brackets', 'never'] as const,
		{
			enumDescriptions: [
				nls.localize('editor.autoSurround.languageDefined', "Use language configurations to determine when to automatically surround selections."),
				nls.localize('editor.autoSurround.quotes', "Surround with quotes but not brackets."),
				nls.localize('editor.autoSurround.brackets', "Surround with brackets but not quotes."),
				''
			],
			description: nls.localize('autoSurround', "Controls whether the editor should automatically surround selections when typing quotes or brackets.")
		}
	)),
	bracketPairColorization: register(new BracketPairColorization()),
	bracketPairGuides: register(new GuideOptions()),
	stickyTabStops: register(new EditorBooleanOption(
		EditorOption.stickyTabStops, 'stickyTabStops', false,
		{ description: nls.localize('stickyTabStops', "Emulate selection behavior of tab characters when using spaces for indentation. Selection will stick to tab stops.") }
	)),
	codeLens: register(new EditorBooleanOption(
		EditorOption.codeLens, 'codeLens', true,
		{ description: nls.localize('codeLens', "Controls whether the editor shows CodeLens.") }
	)),
	codeLensFontFamily: register(new EditorStringOption(
		EditorOption.codeLensFontFamily, 'codeLensFontFamily', '',
		{ description: nls.localize('codeLensFontFamily', "Controls the font family for CodeLens.") }
	)),
	codeLensFontSize: register(new EditorIntOption(EditorOption.codeLensFontSize, 'codeLensFontSize', 0, 0, 100, {
		type: 'number',
		default: 0,
		minimum: 0,
		maximum: 100,
		markdownDescription: nls.localize('codeLensFontSize', "Controls the font size in pixels for CodeLens. When set to 0, 90% of `#editor.fontSize#` is used.")
	})),
	colorDecorators: register(new EditorBooleanOption(
		EditorOption.colorDecorators, 'colorDecorators', true,
		{ description: nls.localize('colorDecorators', "Controls whether the editor should render the inline color decorators and color picker.") }
	)),
	colorDecoratorActivatedOn: register(new EditorStringEnumOption(EditorOption.colorDecoratorsActivatedOn, 'colorDecoratorsActivatedOn', 'clickAndHover' as 'clickAndHover' | 'hover' | 'click', ['clickAndHover', 'hover', 'click'] as const, {
		enumDescriptions: [
			nls.localize('editor.colorDecoratorActivatedOn.clickAndHover', "Make the color picker appear both on click and hover of the color decorator"),
			nls.localize('editor.colorDecoratorActivatedOn.hover', "Make the color picker appear on hover of the color decorator"),
			nls.localize('editor.colorDecoratorActivatedOn.click', "Make the color picker appear on click of the color decorator")
		],
		description: nls.localize('colorDecoratorActivatedOn', "Controls the condition to make a color picker appear from a color decorator.")
	})),
	colorDecoratorsLimit: register(new EditorIntOption(
		EditorOption.colorDecoratorsLimit, 'colorDecoratorsLimit', 500, 1, 1000000,
		{
			markdownDescription: nls.localize('colorDecoratorsLimit', "Controls the max number of color decorators that can be rendered in an editor at once.")
		}
	)),
	columnSelection: register(new EditorBooleanOption(
		EditorOption.columnSelection, 'columnSelection', false,
		{ description: nls.localize('columnSelection', "Enable that the selection with the mouse and keys is doing column selection.") }
	)),
	comments: register(new EditorComments()),
	contextmenu: register(new EditorBooleanOption(
		EditorOption.contextmenu, 'contextmenu', true,
	)),
	copyWithSyntaxHighlighting: register(new EditorBooleanOption(
		EditorOption.copyWithSyntaxHighlighting, 'copyWithSyntaxHighlighting', true,
		{ description: nls.localize('copyWithSyntaxHighlighting', "Controls whether syntax highlighting should be copied into the clipboard.") }
	)),
	cursorBlinking: register(new EditorEnumOption(
		EditorOption.cursorBlinking, 'cursorBlinking',
		TextEditorCursorBlinkingStyle.Blink, 'blink',
		['blink', 'smooth', 'phase', 'expand', 'solid'],
		cursorBlinkingStyleFromString,
		{ description: nls.localize('cursorBlinking', "Control the cursor animation style.") }
	)),
	cursorSmoothCaretAnimation: register(new EditorStringEnumOption(
		EditorOption.cursorSmoothCaretAnimation, 'cursorSmoothCaretAnimation',
		'off' as 'off' | 'explicit' | 'on',
		['off', 'explicit', 'on'] as const,
		{
			enumDescriptions: [
				nls.localize('cursorSmoothCaretAnimation.off', "Smooth caret animation is disabled."),
				nls.localize('cursorSmoothCaretAnimation.explicit', "Smooth caret animation is enabled only when the user moves the cursor with an explicit gesture."),
				nls.localize('cursorSmoothCaretAnimation.on', "Smooth caret animation is always enabled.")
			],
			description: nls.localize('cursorSmoothCaretAnimation', "Controls whether the smooth caret animation should be enabled.")
		}
	)),
	cursorStyle: register(new EditorEnumOption(
		EditorOption.cursorStyle, 'cursorStyle',
		TextEditorCursorStyle.Line, 'line',
		['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'],
		cursorStyleFromString,
		{ description: nls.localize('cursorStyle', "Controls the cursor style in insert input mode.") }
	)),
	overtypeCursorStyle: register(new EditorEnumOption(
		EditorOption.overtypeCursorStyle, 'overtypeCursorStyle',
		TextEditorCursorStyle.Block, 'block',
		['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'],
		cursorStyleFromString,
		{ description: nls.localize('overtypeCursorStyle', "Controls the cursor style in overtype input mode.") }
	)),
	cursorSurroundingLines: register(new EditorIntOption(
		EditorOption.cursorSurroundingLines, 'cursorSurroundingLines',
		0, 0, Constants.MAX_SAFE_SMALL_INTEGER,
		{ description: nls.localize('cursorSurroundingLines', "Controls the minimal number of visible leading lines (minimum 0) and trailing lines (minimum 1) surrounding the cursor. Known as 'scrollOff' or 'scrollOffset' in some other editors.") }
	)),
	cursorSurroundingLinesStyle: register(new EditorStringEnumOption(
		EditorOption.cursorSurroundingLinesStyle, 'cursorSurroundingLinesStyle',
		'default' as 'default' | 'all',
		['default', 'all'] as const,
		{
			enumDescriptions: [
				nls.localize('cursorSurroundingLinesStyle.default', "`cursorSurroundingLines` is enforced only when triggered via the keyboard or API."),
				nls.localize('cursorSurroundingLinesStyle.all', "`cursorSurroundingLines` is enforced always.")
			],
			markdownDescription: nls.localize('cursorSurroundingLinesStyle', "Controls when `#editor.cursorSurroundingLines#` should be enforced.")
		}
	)),
	cursorWidth: register(new EditorIntOption(
		EditorOption.cursorWidth, 'cursorWidth',
		0, 0, Constants.MAX_SAFE_SMALL_INTEGER,
		{ markdownDescription: nls.localize('cursorWidth', "Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`.") }
	)),
	disableLayerHinting: register(new EditorBooleanOption(
		EditorOption.disableLayerHinting, 'disableLayerHinting', false,
	)),
	disableMonospaceOptimizations: register(new EditorBooleanOption(
		EditorOption.disableMonospaceOptimizations, 'disableMonospaceOptimizations', false
	)),
	domReadOnly: register(new EditorBooleanOption(
		EditorOption.domReadOnly, 'domReadOnly', false,
	)),
	dragAndDrop: register(new EditorBooleanOption(
		EditorOption.dragAndDrop, 'dragAndDrop', true,
		{ description: nls.localize('dragAndDrop', "Controls whether the editor should allow moving selections via drag and drop.") }
	)),
	emptySelectionClipboard: register(new EditorEmptySelectionClipboard()),
	dropIntoEditor: register(new EditorDropIntoEditor()),
	experimentalEditContextEnabled: register(new EditorBooleanOption(
		EditorOption.experimentalEditContextEnabled, 'experimentalEditContextEnabled', product.quality !== 'stable',
		{
			description: nls.localize('experimentalEditContextEnabled', "Sets whether the new experimental edit context should be used instead of the text area."),
			included: platform.isChrome || platform.isEdge || platform.isNative
		}
	)),
	stickyScroll: register(new EditorStickyScroll()),
	experimentalGpuAcceleration: register(new EditorStringEnumOption(
		EditorOption.experimentalGpuAcceleration, 'experimentalGpuAcceleration',
		'off' as 'off' | 'on',
		['off', 'on'] as const,
		{
			tags: ['experimental'],
			enumDescriptions: [
				nls.localize('experimentalGpuAcceleration.off', "Use regular DOM-based rendering."),
				nls.localize('experimentalGpuAcceleration.on', "Use GPU acceleration."),
			],
			description: nls.localize('experimentalGpuAcceleration', "Controls whether to use the experimental GPU acceleration to render the editor.")
		}
	)),
	experimentalWhitespaceRendering: register(new EditorStringEnumOption(
		EditorOption.experimentalWhitespaceRendering, 'experimentalWhitespaceRendering',
		'svg' as 'svg' | 'font' | 'off',
		['svg', 'font', 'off'] as const,
		{
			enumDescriptions: [
				nls.localize('experimentalWhitespaceRendering.svg', "Use a new rendering method with svgs."),
				nls.localize('experimentalWhitespaceRendering.font', "Use a new rendering method with font characters."),
				nls.localize('experimentalWhitespaceRendering.off', "Use the stable rendering method."),
			],
			description: nls.localize('experimentalWhitespaceRendering', "Controls whether whitespace is rendered with a new, experimental method.")
		}
	)),
	extraEditorClassName: register(new EditorStringOption(
		EditorOption.extraEditorClassName, 'extraEditorClassName', '',
	)),
	fastScrollSensitivity: register(new EditorFloatOption(
		EditorOption.fastScrollSensitivity, 'fastScrollSensitivity',
		5, x => (x <= 0 ? 5 : x),
		{ markdownDescription: nls.localize('fastScrollSensitivity', "Scrolling speed multiplier when pressing `Alt`.") }
	)),
	find: register(new EditorFind()),
	fixedOverflowWidgets: register(new EditorBooleanOption(
		EditorOption.fixedOverflowWidgets, 'fixedOverflowWidgets', false,
	)),
	folding: register(new EditorBooleanOption(
		EditorOption.folding, 'folding', true,
		{ description: nls.localize('folding', "Controls whether the editor has code folding enabled.") }
	)),
	foldingStrategy: register(new EditorStringEnumOption(
		EditorOption.foldingStrategy, 'foldingStrategy',
		'auto' as 'auto' | 'indentation',
		['auto', 'indentation'] as const,
		{
			enumDescriptions: [
				nls.localize('foldingStrategy.auto', "Use a language-specific folding strategy if available, else the indentation-based one."),
				nls.localize('foldingStrategy.indentation', "Use the indentation-based folding strategy."),
			],
			description: nls.localize('foldingStrategy', "Controls the strategy for computing folding ranges.")
		}
	)),
	foldingHighlight: register(new EditorBooleanOption(
		EditorOption.foldingHighlight, 'foldingHighlight', true,
		{ description: nls.localize('foldingHighlight', "Controls whether the editor should highlight folded ranges.") }
	)),
	foldingImportsByDefault: register(new EditorBooleanOption(
		EditorOption.foldingImportsByDefault, 'foldingImportsByDefault', false,
		{ description: nls.localize('foldingImportsByDefault', "Controls whether the editor automatically collapses import ranges.") }
	)),
	foldingMaximumRegions: register(new EditorIntOption(
		EditorOption.foldingMaximumRegions, 'foldingMaximumRegions',
		5000, 10, 65000, // limit must be less than foldingRanges MAX_FOLDING_REGIONS
		{ description: nls.localize('foldingMaximumRegions', "The maximum number of foldable regions. Increasing this value may result in the editor becoming less responsive when the current source has a large number of foldable regions.") }
	)),
	unfoldOnClickAfterEndOfLine: register(new EditorBooleanOption(
		EditorOption.unfoldOnClickAfterEndOfLine, 'unfoldOnClickAfterEndOfLine', false,
		{ description: nls.localize('unfoldOnClickAfterEndOfLine', "Controls whether clicking on the empty content after a folded line will unfold the line.") }
	)),
	fontFamily: register(new EditorStringOption(
		EditorOption.fontFamily, 'fontFamily', EDITOR_FONT_DEFAULTS.fontFamily,
		{ description: nls.localize('fontFamily', "Controls the font family.") }
	)),
	fontInfo: register(new EditorFontInfo()),
	fontLigatures2: register(new EditorFontLigatures()),
	fontSize: register(new EditorFontSize()),
	fontWeight: register(new EditorFontWeight()),
	fontVariations: register(new EditorFontVariations()),
	formatOnPaste: register(new EditorBooleanOption(
		EditorOption.formatOnPaste, 'formatOnPaste', false,
		{ description: nls.localize('formatOnPaste', "Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.") }
	)),
	formatOnType: register(new EditorBooleanOption(
		EditorOption.formatOnType, 'formatOnType', false,
		{ description: nls.localize('formatOnType', "Controls whether the editor should automatically format the line after typing.") }
	)),
	glyphMargin: register(new EditorBooleanOption(
		EditorOption.glyphMargin, 'glyphMargin', true,
		{ description: nls.localize('glyphMargin', "Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.") }
	)),
	gotoLocation: register(new EditorGoToLocation()),
	hideCursorInOverviewRuler: register(new EditorBooleanOption(
		EditorOption.hideCursorInOverviewRuler, 'hideCursorInOverviewRuler', false,
		{ description: nls.localize('hideCursorInOverviewRuler', "Controls whether the cursor should be hidden in the overview ruler.") }
	)),
	hover: register(new EditorHover()),
	inDiffEditor: register(new EditorBooleanOption(
		EditorOption.inDiffEditor, 'inDiffEditor', false
	)),
	letterSpacing: register(new EditorFloatOption(
		EditorOption.letterSpacing, 'letterSpacing',
		EDITOR_FONT_DEFAULTS.letterSpacing, x => EditorFloatOption.clamp(x, -5, 20),
		{ description: nls.localize('letterSpacing', "Controls the letter spacing in pixels.") }
	)),
	lightbulb: register(new EditorLightbulb()),
	lineDecorationsWidth: register(new EditorLineDecorationsWidth()),
	lineHeight: register(new EditorLineHeight()),
	lineNumbers: register(new EditorRenderLineNumbersOption()),
	lineNumbersMinChars: register(new EditorIntOption(
		EditorOption.lineNumbersMinChars, 'lineNumbersMinChars',
		5, 1, 300
	)),
	linkedEditing: register(new EditorBooleanOption(
		EditorOption.linkedEditing, 'linkedEditing', false,
		{ description: nls.localize('linkedEditing', "Controls whether the editor has linked editing enabled. Depending on the language, related symbols such as HTML tags, are updated while editing.") }
	)),
	links: register(new EditorBooleanOption(
		EditorOption.links, 'links', true,
		{ description: nls.localize('links', "Controls whether the editor should detect links and make them clickable.") }
	)),
	matchBrackets: register(new EditorStringEnumOption(
		EditorOption.matchBrackets, 'matchBrackets',
		'always' as 'never' | 'near' | 'always',
		['always', 'near', 'never'] as const,
		{ description: nls.localize('matchBrackets', "Highlight matching brackets.") }
	)),
	minimap: register(new EditorMinimap()),
	mouseStyle: register(new EditorStringEnumOption(
		EditorOption.mouseStyle, 'mouseStyle',
		'text' as 'text' | 'default' | 'copy',
		['text', 'default', 'copy'] as const,
	)),
	mouseWheelScrollSensitivity: register(new EditorFloatOption(
		EditorOption.mouseWheelScrollSensitivity, 'mouseWheelScrollSensitivity',
		1, x => (x === 0 ? 1 : x),
		{ markdownDescription: nls.localize('mouseWheelScrollSensitivity', "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.") }
	)),
	mouseWheelZoom: register(new EditorBooleanOption(
		EditorOption.mouseWheelZoom, 'mouseWheelZoom', false,
		{
			markdownDescription: platform.isMacintosh
				? nls.localize('mouseWheelZoom.mac', "Zoom the font of the editor when using mouse wheel and holding `Cmd`.")
				: nls.localize('mouseWheelZoom', "Zoom the font of the editor when using mouse wheel and holding `Ctrl`.")
		}
	)),
	multiCursorMergeOverlapping: register(new EditorBooleanOption(
		EditorOption.multiCursorMergeOverlapping, 'multiCursorMergeOverlapping', true,
		{ description: nls.localize('multiCursorMergeOverlapping', "Merge multiple cursors when they are overlapping.") }
	)),
	multiCursorModifier: register(new EditorEnumOption(
		EditorOption.multiCursorModifier, 'multiCursorModifier',
		'altKey', 'alt',
		['ctrlCmd', 'alt'],
		_multiCursorModifierFromString,
		{
			markdownEnumDescriptions: [
				nls.localize('multiCursorModifier.ctrlCmd', "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
				nls.localize('multiCursorModifier.alt', "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
			],
			markdownDescription: nls.localize({
				key: 'multiCursorModifier',
				comment: [
					'- `ctrlCmd` refers to a value the setting can take and should not be localized.',
					'- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized.'
				]
			}, "The modifier to be used to add multiple cursors with the mouse. The Go to Definition and Open Link mouse gestures will adapt such that they do not conflict with the [multicursor modifier](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier).")
		}
	)),
	multiCursorPaste: register(new EditorStringEnumOption(
		EditorOption.multiCursorPaste, 'multiCursorPaste',
		'spread' as 'spread' | 'full',
		['spread', 'full'] as const,
		{
			markdownEnumDescriptions: [
				nls.localize('multiCursorPaste.spread', "Each cursor pastes a single line of the text."),
				nls.localize('multiCursorPaste.full', "Each cursor pastes the full text.")
			],
			markdownDescription: nls.localize('multiCursorPaste', "Controls pasting when the line count of the pasted text matches the cursor count.")
		}
	)),
	multiCursorLimit: register(new EditorIntOption(
		EditorOption.multiCursorLimit, 'multiCursorLimit', 10000, 1, 100000,
		{
			markdownDescription: nls.localize('multiCursorLimit', "Controls the max number of cursors that can be in an active editor at once.")
		}
	)),
	occurrencesHighlight: register(new EditorStringEnumOption(
		EditorOption.occurrencesHighlight, 'occurrencesHighlight',
		'singleFile' as 'off' | 'singleFile' | 'multiFile',
		['off', 'singleFile', 'multiFile'] as const,
		{
			markdownEnumDescriptions: [
				nls.localize('occurrencesHighlight.off', "Does not highlight occurrences."),
				nls.localize('occurrencesHighlight.singleFile', "Highlights occurrences only in the current file."),
				nls.localize('occurrencesHighlight.multiFile', "Experimental: Highlights occurrences across all valid open files.")
			],
			markdownDescription: nls.localize('occurrencesHighlight', "Controls whether occurrences should be highlighted across open files.")
		}
	)),
	occurrencesHighlightDelay: register(new EditorIntOption(
		EditorOption.occurrencesHighlightDelay, 'occurrencesHighlightDelay',
		0, 0, 2000,
		{
			description: nls.localize('occurrencesHighlightDelay', "Controls the delay in milliseconds after which occurrences are highlighted."),
			tags: ['preview']
		}
	)),
	overtypeOnPaste: register(new EditorBooleanOption(
		EditorOption.overtypeOnPaste, 'overtypeOnPaste', true,
		{ description: nls.localize('overtypeOnPaste', "Controls whether pasting should overtype.") }
	)),
	overviewRulerBorder: register(new EditorBooleanOption(
		EditorOption.overviewRulerBorder, 'overviewRulerBorder', true,
		{ description: nls.localize('overviewRulerBorder', "Controls whether a border should be drawn around the overview ruler.") }
	)),
	overviewRulerLanes: register(new EditorIntOption(
		EditorOption.overviewRulerLanes, 'overviewRulerLanes',
		3, 0, 3
	)),
	padding: register(new EditorPadding()),
	pasteAs: register(new EditorPasteAs()),
	parameterHints: register(new EditorParameterHints()),
	peekWidgetDefaultFocus: register(new EditorStringEnumOption(
		EditorOption.peekWidgetDefaultFocus, 'peekWidgetDefaultFocus',
		'tree' as 'tree' | 'editor',
		['tree', 'editor'] as const,
		{
			enumDescriptions: [
				nls.localize('peekWidgetDefaultFocus.tree', "Focus the tree when opening peek"),
				nls.localize('peekWidgetDefaultFocus.editor', "Focus the editor when opening peek")
			],
			description: nls.localize('peekWidgetDefaultFocus', "Controls whether to focus the inline editor or the tree in the peek widget.")
		}
	)),
	placeholder: register(new PlaceholderOption()),
	definitionLinkOpensInPeek: register(new EditorBooleanOption(
		EditorOption.definitionLinkOpensInPeek, 'definitionLinkOpensInPeek', false,
		{ description: nls.localize('definitionLinkOpensInPeek', "Controls whether the Go to Definition mouse gesture always opens the peek widget.") }
	)),
	quickSuggestions: register(new EditorQuickSuggestions()),
	quickSuggestionsDelay: register(new EditorIntOption(
		EditorOption.quickSuggestionsDelay, 'quickSuggestionsDelay',
		10, 0, Constants.MAX_SAFE_SMALL_INTEGER,
		{ description: nls.localize('quickSuggestionsDelay', "Controls the delay in milliseconds after which quick suggestions will show up.") }
	)),
	readOnly: register(new EditorBooleanOption(
		EditorOption.readOnly, 'readOnly', false,
	)),
	readOnlyMessage: register(new ReadonlyMessage()),
	renameOnType: register(new EditorBooleanOption(
		EditorOption.renameOnType, 'renameOnType', false,
		{ description: nls.localize('renameOnType', "Controls whether the editor auto renames on type."), markdownDeprecationMessage: nls.localize('renameOnTypeDeprecate', "Deprecated, use `editor.linkedEditing` instead.") }
	)),
	renderControlCharacters: register(new EditorBooleanOption(
		EditorOption.renderControlCharacters, 'renderControlCharacters', true,
		{ description: nls.localize('renderControlCharacters', "Controls whether the editor should render control characters."), restricted: true }
	)),
	renderFinalNewline: register(new EditorStringEnumOption(
		EditorOption.renderFinalNewline, 'renderFinalNewline',
		(platform.isLinux ? 'dimmed' : 'on') as 'off' | 'on' | 'dimmed',
		['off', 'on', 'dimmed'] as const,
		{ description: nls.localize('renderFinalNewline', "Render last line number when the file ends with a newline.") }
	)),
	renderLineHighlight: register(new EditorStringEnumOption(
		EditorOption.renderLineHighlight, 'renderLineHighlight',
		'line' as 'none' | 'gutter' | 'line' | 'all',
		['none', 'gutter', 'line', 'all'] as const,
		{
			enumDescriptions: [
				'',
				'',
				'',
				nls.localize('renderLineHighlight.all', "Highlights both the gutter and the current line."),
			],
			description: nls.localize('renderLineHighlight', "Controls how the editor should render the current line highlight.")
		}
	)),
	renderLineHighlightOnlyWhenFocus: register(new EditorBooleanOption(
		EditorOption.renderLineHighlightOnlyWhenFocus, 'renderLineHighlightOnlyWhenFocus', false,
		{ description: nls.localize('renderLineHighlightOnlyWhenFocus', "Controls if the editor should render the current line highlight only when the editor is focused.") }
	)),
	renderValidationDecorations: register(new EditorStringEnumOption(
		EditorOption.renderValidationDecorations, 'renderValidationDecorations',
		'editable' as 'editable' | 'on' | 'off',
		['editable', 'on', 'off'] as const
	)),
	renderWhitespace: register(new EditorStringEnumOption(
		EditorOption.renderWhitespace, 'renderWhitespace',
		'selection' as 'selection' | 'none' | 'boundary' | 'trailing' | 'all',
		['none', 'boundary', 'selection', 'trailing', 'all'] as const,
		{
			enumDescriptions: [
				'',
				nls.localize('renderWhitespace.boundary', "Render whitespace characters except for single spaces between words."),
				nls.localize('renderWhitespace.selection', "Render whitespace characters only on selected text."),
				nls.localize('renderWhitespace.trailing', "Render only trailing whitespace characters."),
				''
			],
			description: nls.localize('renderWhitespace', "Controls how the editor should render whitespace characters.")
		}
	)),
	revealHorizontalRightPadding: register(new EditorIntOption(
		EditorOption.revealHorizontalRightPadding, 'revealHorizontalRightPadding',
		15, 0, 1000,
	)),
	roundedSelection: register(new EditorBooleanOption(
		EditorOption.roundedSelection, 'roundedSelection', true,
		{ description: nls.localize('roundedSelection', "Controls whether selections should have rounded corners.") }
	)),
	rulers: register(new EditorRulers()),
	scrollbar: register(new EditorScrollbar()),
	scrollBeyondLastColumn: register(new EditorIntOption(
		EditorOption.scrollBeyondLastColumn, 'scrollBeyondLastColumn',
		4, 0, Constants.MAX_SAFE_SMALL_INTEGER,
		{ description: nls.localize('scrollBeyondLastColumn', "Controls the number of extra characters beyond which the editor will scroll horizontally.") }
	)),
	scrollBeyondLastLine: register(new EditorBooleanOption(
		EditorOption.scrollBeyondLastLine, 'scrollBeyondLastLine', true,
		{ description: nls.localize('scrollBeyondLastLine', "Controls whether the editor will scroll beyond the last line.") }
	)),
	scrollPredominantAxis: register(new EditorBooleanOption(
		EditorOption.scrollPredominantAxis, 'scrollPredominantAxis', true,
		{ description: nls.localize('scrollPredominantAxis', "Scroll only along the predominant axis when scrolling both vertically and horizontally at the same time. Prevents horizontal drift when scrolling vertically on a trackpad.") }
	)),
	selectionClipboard: register(new EditorBooleanOption(
		EditorOption.selectionClipboard, 'selectionClipboard', true,
		{
			description: nls.localize('selectionClipboard', "Controls whether the Linux primary clipboard should be supported."),
			included: platform.isLinux
		}
	)),
	selectionHighlight: register(new EditorBooleanOption(
		EditorOption.selectionHighlight, 'selectionHighlight', true,
		{ description: nls.localize('selectionHighlight', "Controls whether the editor should highlight matches similar to the selection.") }
	)),
	selectOnLineNumbers: register(new EditorBooleanOption(
		EditorOption.selectOnLineNumbers, 'selectOnLineNumbers', true,
	)),
	showFoldingControls: register(new EditorStringEnumOption(
		EditorOption.showFoldingControls, 'showFoldingControls',
		'mouseover' as 'always' | 'never' | 'mouseover',
		['always', 'never', 'mouseover'] as const,
		{
			enumDescriptions: [
				nls.localize('showFoldingControls.always', "Always show the folding controls."),
				nls.localize('showFoldingControls.never', "Never show the folding controls and reduce the gutter size."),
				nls.localize('showFoldingControls.mouseover', "Only show the folding controls when the mouse is over the gutter."),
			],
			description: nls.localize('showFoldingControls', "Controls when the folding controls on the gutter are shown.")
		}
	)),
	showUnused: register(new EditorBooleanOption(
		EditorOption.showUnused, 'showUnused', true,
		{ description: nls.localize('showUnused', "Controls fading out of unused code.") }
	)),
	showDeprecated: register(new EditorBooleanOption(
		EditorOption.showDeprecated, 'showDeprecated', true,
		{ description: nls.localize('showDeprecated', "Controls strikethrough deprecated variables.") }
	)),
	inlayHints: register(new EditorInlayHints()),
	snippetSuggestions: register(new EditorStringEnumOption(
		EditorOption.snippetSuggestions, 'snippetSuggestions',
		'inline' as 'top' | 'bottom' | 'inline' | 'none',
		['top', 'bottom', 'inline', 'none'] as const,
		{
			enumDescriptions: [
				nls.localize('snippetSuggestions.top', "Show snippet suggestions on top of other suggestions."),
				nls.localize('snippetSuggestions.bottom', "Show snippet suggestions below other suggestions."),
				nls.localize('snippetSuggestions.inline', "Show snippets suggestions with other suggestions."),
				nls.localize('snippetSuggestions.none', "Do not show snippet suggestions."),
			],
			description: nls.localize('snippetSuggestions', "Controls whether snippets are shown with other suggestions and how they are sorted.")
		}
	)),
	smartSelect: register(new SmartSelect()),
	smoothScrolling: register(new EditorBooleanOption(
		EditorOption.smoothScrolling, 'smoothScrolling', false,
		{ description: nls.localize('smoothScrolling', "Controls whether the editor will scroll using an animation.") }
	)),
	stopRenderingLineAfter: register(new EditorIntOption(
		EditorOption.stopRenderingLineAfter, 'stopRenderingLineAfter',
		10000, -1, Constants.MAX_SAFE_SMALL_INTEGER,
	)),
	suggest: register(new EditorSuggest()),
	inlineSuggest: register(new InlineEditorSuggest()),
	inlineCompletionsAccessibilityVerbose: register(new EditorBooleanOption(EditorOption.inlineCompletionsAccessibilityVerbose, 'inlineCompletionsAccessibilityVerbose', false,
		{ description: nls.localize('inlineCompletionsAccessibilityVerbose', "Controls whether the accessibility hint should be provided to screen reader users when an inline completion is shown.") })),
	suggestFontSize: register(new EditorIntOption(
		EditorOption.suggestFontSize, 'suggestFontSize',
		0, 0, 1000,
		{ markdownDescription: nls.localize('suggestFontSize', "Font size for the suggest widget. When set to {0}, the value of {1} is used.", '`0`', '`#editor.fontSize#`') }
	)),
	suggestLineHeight: register(new EditorIntOption(
		EditorOption.suggestLineHeight, 'suggestLineHeight',
		0, 0, 1000,
		{ markdownDescription: nls.localize('suggestLineHeight', "Line height for the suggest widget. When set to {0}, the value of {1} is used. The minimum value is 8.", '`0`', '`#editor.lineHeight#`') }
	)),
	suggestOnTriggerCharacters: register(new EditorBooleanOption(
		EditorOption.suggestOnTriggerCharacters, 'suggestOnTriggerCharacters', true,
		{ description: nls.localize('suggestOnTriggerCharacters', "Controls whether suggestions should automatically show up when typing trigger characters.") }
	)),
	suggestSelection: register(new EditorStringEnumOption(
		EditorOption.suggestSelection, 'suggestSelection',
		'first' as 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix',
		['first', 'recentlyUsed', 'recentlyUsedByPrefix'] as const,
		{
			markdownEnumDescriptions: [
				nls.localize('suggestSelection.first', "Always select the first suggestion."),
				nls.localize('suggestSelection.recentlyUsed', "Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently."),
				nls.localize('suggestSelection.recentlyUsedByPrefix', "Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`."),
			],
			description: nls.localize('suggestSelection', "Controls how suggestions are pre-selected when showing the suggest list.")
		}
	)),
	tabCompletion: register(new EditorStringEnumOption(
		EditorOption.tabCompletion, 'tabCompletion',
		'off' as 'on' | 'off' | 'onlySnippets',
		['on', 'off', 'onlySnippets'] as const,
		{
			enumDescriptions: [
				nls.localize('tabCompletion.on', "Tab complete will insert the best matching suggestion when pressing tab."),
				nls.localize('tabCompletion.off', "Disable tab completions."),
				nls.localize('tabCompletion.onlySnippets', "Tab complete snippets when their prefix match. Works best when 'quickSuggestions' aren't enabled."),
			],
			description: nls.localize('tabCompletion', "Enables tab completions.")
		}
	)),
	tabIndex: register(new EditorIntOption(
		EditorOption.tabIndex, 'tabIndex',
		0, -1, Constants.MAX_SAFE_SMALL_INTEGER
	)),
	unicodeHighlight: register(new UnicodeHighlight()),
	unusualLineTerminators: register(new EditorStringEnumOption(
		EditorOption.unusualLineTerminators, 'unusualLineTerminators',
		'prompt' as 'auto' | 'off' | 'prompt',
		['auto', 'off', 'prompt'] as const,
		{
			enumDescriptions: [
				nls.localize('unusualLineTerminators.auto', "Unusual line terminators are automatically removed."),
				nls.localize('unusualLineTerminators.off', "Unusual line terminators are ignored."),
				nls.localize('unusualLineTerminators.prompt', "Unusual line terminators prompt to be removed."),
			],
			description: nls.localize('unusualLineTerminators', "Remove unusual line terminators that might cause problems.")
		}
	)),
	useShadowDOM: register(new EditorBooleanOption(
		EditorOption.useShadowDOM, 'useShadowDOM', true
	)),
	useTabStops: register(new EditorBooleanOption(
		EditorOption.useTabStops, 'useTabStops', true,
		{ description: nls.localize('useTabStops', "Spaces and tabs are inserted and deleted in alignment with tab stops.") }
	)),
	wordBreak: register(new EditorStringEnumOption(
		EditorOption.wordBreak, 'wordBreak',
		'normal' as 'normal' | 'keepAll',
		['normal', 'keepAll'] as const,
		{
			markdownEnumDescriptions: [
				nls.localize('wordBreak.normal', "Use the default line break rule."),
				nls.localize('wordBreak.keepAll', "Word breaks should not be used for Chinese/Japanese/Korean (CJK) text. Non-CJK text behavior is the same as for normal."),
			],
			description: nls.localize('wordBreak', "Controls the word break rules used for Chinese/Japanese/Korean (CJK) text.")
		}
	)),
	wordSegmenterLocales: register(new WordSegmenterLocales()),
	wordSeparators: register(new EditorStringOption(
		EditorOption.wordSeparators, 'wordSeparators', USUAL_WORD_SEPARATORS,
		{ description: nls.localize('wordSeparators', "Characters that will be used as word separators when doing word related navigations or operations.") }
	)),
	wordWrap: register(new EditorStringEnumOption(
		EditorOption.wordWrap, 'wordWrap',
		'off' as 'off' | 'on' | 'wordWrapColumn' | 'bounded',
		['off', 'on', 'wordWrapColumn', 'bounded'] as const,
		{
			markdownEnumDescriptions: [
				nls.localize('wordWrap.off', "Lines will never wrap."),
				nls.localize('wordWrap.on', "Lines will wrap at the viewport width."),
				nls.localize({
					key: 'wordWrap.wordWrapColumn',
					comment: [
						'- `editor.wordWrapColumn` refers to a different setting and should not be localized.'
					]
				}, "Lines will wrap at `#editor.wordWrapColumn#`."),
				nls.localize({
					key: 'wordWrap.bounded',
					comment: [
						'- viewport means the edge of the visible window size.',
						'- `editor.wordWrapColumn` refers to a different setting and should not be localized.'
					]
				}, "Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`."),
			],
			description: nls.localize({
				key: 'wordWrap',
				comment: [
					'- \'off\', \'on\', \'wordWrapColumn\' and \'bounded\' refer to values the setting can take and should not be localized.',
					'- `editor.wordWrapColumn` refers to a different setting and should not be localized.'
				]
			}, "Controls how lines should wrap.")
		}
	)),
	wordWrapBreakAfterCharacters: register(new EditorStringOption(
		EditorOption.wordWrapBreakAfterCharacters, 'wordWrapBreakAfterCharacters',
		// allow-any-unicode-next-line
		' \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣',
	)),
	wordWrapBreakBeforeCharacters: register(new EditorStringOption(
		EditorOption.wordWrapBreakBeforeCharacters, 'wordWrapBreakBeforeCharacters',
		// allow-any-unicode-next-line
		'([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋'
	)),
	wordWrapColumn: register(new EditorIntOption(
		EditorOption.wordWrapColumn, 'wordWrapColumn',
		80, 1, Constants.MAX_SAFE_SMALL_INTEGER,
		{
			markdownDescription: nls.localize({
				key: 'wordWrapColumn',
				comment: [
					'- `editor.wordWrap` refers to a different setting and should not be localized.',
					'- \'wordWrapColumn\' and \'bounded\' refer to values the different setting can take and should not be localized.'
				]
			}, "Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.")
		}
	)),
	wordWrapOverride1: register(new EditorStringEnumOption(
		EditorOption.wordWrapOverride1, 'wordWrapOverride1',
		'inherit' as 'off' | 'on' | 'inherit',
		['off', 'on', 'inherit'] as const
	)),
	wordWrapOverride2: register(new EditorStringEnumOption(
		EditorOption.wordWrapOverride2, 'wordWrapOverride2',
		'inherit' as 'off' | 'on' | 'inherit',
		['off', 'on', 'inherit'] as const
	)),

	// Leave these at the end (because they have dependencies!)
	effectiveCursorStyle: register(new EffectiveCursorStyle()),
	editorClassName: register(new EditorClassName()),
	defaultColorDecorators: register(new EditorStringEnumOption(
		EditorOption.defaultColorDecorators, 'defaultColorDecorators', 'auto' as 'auto' | 'always' | 'never',
		['auto', 'always', 'never'] as const,
		{
			enumDescriptions: [
				nls.localize('editor.defaultColorDecorators.auto', "Show default color decorators only when no extension provides colors decorators."),
				nls.localize('editor.defaultColorDecorators.always', "Always show default color decorators."),
				nls.localize('editor.defaultColorDecorators.never', "Never show default color decorators."),
			],
			description: nls.localize('defaultColorDecorators', "Controls whether inline color decorations should be shown using the default document color provider.")
		}
	)),
	pixelRatio: register(new EditorPixelRatio()),
	tabFocusMode: register(new EditorBooleanOption(EditorOption.tabFocusMode, 'tabFocusMode', false,
		{ markdownDescription: nls.localize('tabFocusMode', "Controls whether the editor receives tabs or defers them to the workbench for navigation.") }
	)),
	layoutInfo: register(new EditorLayoutInfoComputer()),
	wrappingInfo: register(new EditorWrappingInfoComputer()),
	wrappingIndent: register(new WrappingIndentOption()),
	wrappingStrategy: register(new WrappingStrategy()),
	effectiveExperimentalEditContextEnabled: register(new EffectiveExperimentalEditContextEnabled())
};

type EditorOptionsType = typeof EditorOptions;
type FindEditorOptionsKeyById<T extends EditorOption> = { [K in keyof EditorOptionsType]: EditorOptionsType[K]['id'] extends T ? K : never }[keyof EditorOptionsType];
type ComputedEditorOptionValue<T extends IEditorOption<any, any>> = T extends IEditorOption<any, infer R> ? R : never;
export type FindComputedEditorOptionValueById<T extends EditorOption> = NonNullable<ComputedEditorOptionValue<EditorOptionsType[FindEditorOptionsKeyById<T>]>>;
