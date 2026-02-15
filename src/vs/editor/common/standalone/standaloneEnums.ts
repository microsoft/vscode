/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.


export enum AccessibilitySupport {
	/**
	 * This should be the browser case where it is not known if a screen reader is attached or no.
	 */
	Unknown = 0,
	Disabled = 1,
	Enabled = 2
}

export enum CodeActionTriggerType {
	Invoke = 1,
	Auto = 2
}

export enum CompletionItemInsertTextRule {
	None = 0,
	/**
	 * Adjust whitespace/indentation of multiline insert texts to
	 * match the current line indentation.
	 */
	KeepWhitespace = 1,
	/**
	 * `insertText` is a snippet.
	 */
	InsertAsSnippet = 4
}

export enum CompletionItemKind {
	Method = 0,
	Function = 1,
	Constructor = 2,
	Field = 3,
	Variable = 4,
	Class = 5,
	Struct = 6,
	Interface = 7,
	Module = 8,
	Property = 9,
	Event = 10,
	Operator = 11,
	Unit = 12,
	Value = 13,
	Constant = 14,
	Enum = 15,
	EnumMember = 16,
	Keyword = 17,
	Text = 18,
	Color = 19,
	File = 20,
	Reference = 21,
	Customcolor = 22,
	Folder = 23,
	TypeParameter = 24,
	User = 25,
	Issue = 26,
	Tool = 27,
	Snippet = 28
}

export enum CompletionItemTag {
	Deprecated = 1
}

/**
 * How a suggest provider was triggered.
 */
export enum CompletionTriggerKind {
	Invoke = 0,
	TriggerCharacter = 1,
	TriggerForIncompleteCompletions = 2
}

/**
 * A positioning preference for rendering content widgets.
 */
export enum ContentWidgetPositionPreference {
	/**
	 * Place the content widget exactly at a position
	 */
	EXACT = 0,
	/**
	 * Place the content widget above a position
	 */
	ABOVE = 1,
	/**
	 * Place the content widget below a position
	 */
	BELOW = 2
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
	Redo = 6
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
 * A document highlight kind.
 */
export enum DocumentHighlightKind {
	/**
	 * A textual occurrence.
	 */
	Text = 0,
	/**
	 * Read-access of a symbol, like reading a variable.
	 */
	Read = 1,
	/**
	 * Write-access of a symbol, like writing to a variable.
	 */
	Write = 2
}

/**
 * Configuration options for auto indentation in the editor
 */
export enum EditorAutoIndentStrategy {
	None = 0,
	Keep = 1,
	Brackets = 2,
	Advanced = 3,
	Full = 4
}

export enum EditorOption {
	acceptSuggestionOnCommitCharacter = 0,
	acceptSuggestionOnEnter = 1,
	accessibilitySupport = 2,
	accessibilityPageSize = 3,
	allowOverflow = 4,
	allowVariableLineHeights = 5,
	allowVariableFonts = 6,
	allowVariableFontsInAccessibilityMode = 7,
	ariaLabel = 8,
	ariaRequired = 9,
	autoClosingBrackets = 10,
	autoClosingComments = 11,
	screenReaderAnnounceInlineSuggestion = 12,
	autoClosingDelete = 13,
	autoClosingOvertype = 14,
	autoClosingQuotes = 15,
	autoIndent = 16,
	autoIndentOnPaste = 17,
	autoIndentOnPasteWithinString = 18,
	automaticLayout = 19,
	autoSurround = 20,
	bracketPairColorization = 21,
	guides = 22,
	codeLens = 23,
	codeLensFontFamily = 24,
	codeLensFontSize = 25,
	colorDecorators = 26,
	colorDecoratorsLimit = 27,
	columnSelection = 28,
	comments = 29,
	contextmenu = 30,
	copyWithSyntaxHighlighting = 31,
	cursorBlinking = 32,
	cursorSmoothCaretAnimation = 33,
	cursorStyle = 34,
	cursorSurroundingLines = 35,
	cursorSurroundingLinesStyle = 36,
	cursorWidth = 37,
	cursorHeight = 38,
	disableLayerHinting = 39,
	disableMonospaceOptimizations = 40,
	domReadOnly = 41,
	dragAndDrop = 42,
	dropIntoEditor = 43,
	editContext = 44,
	emptySelectionClipboard = 45,
	experimentalGpuAcceleration = 46,
	experimentalWhitespaceRendering = 47,
	extraEditorClassName = 48,
	fastScrollSensitivity = 49,
	find = 50,
	fixedOverflowWidgets = 51,
	folding = 52,
	foldingStrategy = 53,
	foldingHighlight = 54,
	foldingImportsByDefault = 55,
	foldingMaximumRegions = 56,
	unfoldOnClickAfterEndOfLine = 57,
	fontFamily = 58,
	fontInfo = 59,
	fontLigatures = 60,
	fontSize = 61,
	fontWeight = 62,
	fontVariations = 63,
	formatOnPaste = 64,
	formatOnType = 65,
	glyphMargin = 66,
	gotoLocation = 67,
	hideCursorInOverviewRuler = 68,
	hover = 69,
	inDiffEditor = 70,
	inlineSuggest = 71,
	letterSpacing = 72,
	lightbulb = 73,
	lineDecorationsWidth = 74,
	lineHeight = 75,
	lineNumbers = 76,
	lineNumbersMinChars = 77,
	linkedEditing = 78,
	links = 79,
	matchBrackets = 80,
	minimap = 81,
	mouseStyle = 82,
	mouseWheelScrollSensitivity = 83,
	mouseWheelZoom = 84,
	multiCursorMergeOverlapping = 85,
	multiCursorModifier = 86,
	mouseMiddleClickAction = 87,
	multiCursorPaste = 88,
	multiCursorLimit = 89,
	occurrencesHighlight = 90,
	occurrencesHighlightDelay = 91,
	overtypeCursorStyle = 92,
	overtypeOnPaste = 93,
	overviewRulerBorder = 94,
	overviewRulerLanes = 95,
	padding = 96,
	pasteAs = 97,
	parameterHints = 98,
	peekWidgetDefaultFocus = 99,
	placeholder = 100,
	definitionLinkOpensInPeek = 101,
	quickSuggestions = 102,
	quickSuggestionsDelay = 103,
	readOnly = 104,
	readOnlyMessage = 105,
	renameOnType = 106,
	renderRichScreenReaderContent = 107,
	renderControlCharacters = 108,
	renderFinalNewline = 109,
	renderLineHighlight = 110,
	renderLineHighlightOnlyWhenFocus = 111,
	renderValidationDecorations = 112,
	renderWhitespace = 113,
	revealHorizontalRightPadding = 114,
	roundedSelection = 115,
	rulers = 116,
	scrollbar = 117,
	scrollBeyondLastColumn = 118,
	scrollBeyondLastLine = 119,
	scrollPredominantAxis = 120,
	selectionClipboard = 121,
	selectionHighlight = 122,
	selectionHighlightMaxLength = 123,
	selectionHighlightMultiline = 124,
	selectOnLineNumbers = 125,
	showFoldingControls = 126,
	showUnused = 127,
	snippetSuggestions = 128,
	smartSelect = 129,
	smoothScrolling = 130,
	stickyScroll = 131,
	stickyTabStops = 132,
	stopRenderingLineAfter = 133,
	suggest = 134,
	suggestFontSize = 135,
	suggestLineHeight = 136,
	suggestOnTriggerCharacters = 137,
	suggestSelection = 138,
	tabCompletion = 139,
	tabIndex = 140,
	trimWhitespaceOnDelete = 141,
	unicodeHighlighting = 142,
	unusualLineTerminators = 143,
	useShadowDOM = 144,
	useTabStops = 145,
	wordBreak = 146,
	wordSegmenterLocales = 147,
	wordSeparators = 148,
	wordWrap = 149,
	wordWrapBreakAfterCharacters = 150,
	wordWrapBreakBeforeCharacters = 151,
	wordWrapColumn = 152,
	wordWrapOverride1 = 153,
	wordWrapOverride2 = 154,
	wrappingIndent = 155,
	wrappingStrategy = 156,
	showDeprecated = 157,
	inertialScroll = 158,
	inlayHints = 159,
	wrapOnEscapedLineFeeds = 160,
	effectiveCursorStyle = 161,
	editorClassName = 162,
	pixelRatio = 163,
	tabFocusMode = 164,
	layoutInfo = 165,
	wrappingInfo = 166,
	defaultColorDecorators = 167,
	colorDecoratorsActivatedOn = 168,
	inlineCompletionsAccessibilityVerbose = 169,
	effectiveEditContext = 170,
	scrollOnMiddleClick = 171,
	effectiveAllowVariableFonts = 172
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
 * Vertical Lane in the glyph margin of the editor.
 */
export enum GlyphMarginLane {
	Left = 1,
	Center = 2,
	Right = 3
}

export enum HoverVerbosityAction {
	/**
	 * Increase the verbosity of the hover
	 */
	Increase = 0,
	/**
	 * Decrease the verbosity of the hover
	 */
	Decrease = 1
}

/**
 * Describes what to do with the indentation when pressing Enter.
 */
export enum IndentAction {
	/**
	 * Insert new line and copy the previous line's indentation.
	 */
	None = 0,
	/**
	 * Insert new line and indent once (relative to the previous line's indentation).
	 */
	Indent = 1,
	/**
	 * Insert two new lines:
	 *  - the first one indented which will hold the cursor
	 *  - the second one at the same indentation level
	 */
	IndentOutdent = 2,
	/**
	 * Insert new line and outdent once (relative to the previous line's indentation).
	 */
	Outdent = 3
}

export enum InjectedTextCursorStops {
	Both = 0,
	Right = 1,
	Left = 2,
	None = 3
}

export enum InlayHintKind {
	Type = 1,
	Parameter = 2
}

export enum InlineCompletionEndOfLifeReasonKind {
	Accepted = 0,
	Rejected = 1,
	Ignored = 2
}

export enum InlineCompletionHintStyle {
	Code = 1,
	Label = 2
}

/**
 * How an {@link InlineCompletionsProvider inline completion provider} was triggered.
 */
export enum InlineCompletionTriggerKind {
	/**
	 * Completion was triggered automatically while editing.
	 * It is sufficient to return a single completion item in this case.
	 */
	Automatic = 0,
	/**
	 * Completion was triggered explicitly by a user gesture.
	 * Return multiple completion items to enable cycling through them.
	 */
	Explicit = 1
}
/**
 * Virtual Key Codes, the value does not hold any inherent meaning.
 * Inspired somewhat from https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
 * But these are "more general", as they should work across browsers & OS`s.
 */
export enum KeyCode {
	DependsOnKbLayout = -1,
	/**
	 * Placed first to cover the 0 value of the enum.
	 */
	Unknown = 0,
	Backspace = 1,
	Tab = 2,
	Enter = 3,
	Shift = 4,
	Ctrl = 5,
	Alt = 6,
	PauseBreak = 7,
	CapsLock = 8,
	Escape = 9,
	Space = 10,
	PageUp = 11,
	PageDown = 12,
	End = 13,
	Home = 14,
	LeftArrow = 15,
	UpArrow = 16,
	RightArrow = 17,
	DownArrow = 18,
	Insert = 19,
	Delete = 20,
	Digit0 = 21,
	Digit1 = 22,
	Digit2 = 23,
	Digit3 = 24,
	Digit4 = 25,
	Digit5 = 26,
	Digit6 = 27,
	Digit7 = 28,
	Digit8 = 29,
	Digit9 = 30,
	KeyA = 31,
	KeyB = 32,
	KeyC = 33,
	KeyD = 34,
	KeyE = 35,
	KeyF = 36,
	KeyG = 37,
	KeyH = 38,
	KeyI = 39,
	KeyJ = 40,
	KeyK = 41,
	KeyL = 42,
	KeyM = 43,
	KeyN = 44,
	KeyO = 45,
	KeyP = 46,
	KeyQ = 47,
	KeyR = 48,
	KeyS = 49,
	KeyT = 50,
	KeyU = 51,
	KeyV = 52,
	KeyW = 53,
	KeyX = 54,
	KeyY = 55,
	KeyZ = 56,
	Meta = 57,
	ContextMenu = 58,
	F1 = 59,
	F2 = 60,
	F3 = 61,
	F4 = 62,
	F5 = 63,
	F6 = 64,
	F7 = 65,
	F8 = 66,
	F9 = 67,
	F10 = 68,
	F11 = 69,
	F12 = 70,
	F13 = 71,
	F14 = 72,
	F15 = 73,
	F16 = 74,
	F17 = 75,
	F18 = 76,
	F19 = 77,
	F20 = 78,
	F21 = 79,
	F22 = 80,
	F23 = 81,
	F24 = 82,
	NumLock = 83,
	ScrollLock = 84,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ';:' key
	 */
	Semicolon = 85,
	/**
	 * For any country/region, the '+' key
	 * For the US standard keyboard, the '=+' key
	 */
	Equal = 86,
	/**
	 * For any country/region, the ',' key
	 * For the US standard keyboard, the ',<' key
	 */
	Comma = 87,
	/**
	 * For any country/region, the '-' key
	 * For the US standard keyboard, the '-_' key
	 */
	Minus = 88,
	/**
	 * For any country/region, the '.' key
	 * For the US standard keyboard, the '.>' key
	 */
	Period = 89,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '/?' key
	 */
	Slash = 90,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '`~' key
	 */
	Backquote = 91,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '[{' key
	 */
	BracketLeft = 92,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '\|' key
	 */
	Backslash = 93,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ']}' key
	 */
	BracketRight = 94,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ''"' key
	 */
	Quote = 95,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 */
	OEM_8 = 96,
	/**
	 * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
	 */
	IntlBackslash = 97,
	Numpad0 = 98,// VK_NUMPAD0, 0x60, Numeric keypad 0 key
	Numpad1 = 99,// VK_NUMPAD1, 0x61, Numeric keypad 1 key
	Numpad2 = 100,// VK_NUMPAD2, 0x62, Numeric keypad 2 key
	Numpad3 = 101,// VK_NUMPAD3, 0x63, Numeric keypad 3 key
	Numpad4 = 102,// VK_NUMPAD4, 0x64, Numeric keypad 4 key
	Numpad5 = 103,// VK_NUMPAD5, 0x65, Numeric keypad 5 key
	Numpad6 = 104,// VK_NUMPAD6, 0x66, Numeric keypad 6 key
	Numpad7 = 105,// VK_NUMPAD7, 0x67, Numeric keypad 7 key
	Numpad8 = 106,// VK_NUMPAD8, 0x68, Numeric keypad 8 key
	Numpad9 = 107,// VK_NUMPAD9, 0x69, Numeric keypad 9 key
	NumpadMultiply = 108,// VK_MULTIPLY, 0x6A, Multiply key
	NumpadAdd = 109,// VK_ADD, 0x6B, Add key
	NUMPAD_SEPARATOR = 110,// VK_SEPARATOR, 0x6C, Separator key
	NumpadSubtract = 111,// VK_SUBTRACT, 0x6D, Subtract key
	NumpadDecimal = 112,// VK_DECIMAL, 0x6E, Decimal key
	NumpadDivide = 113,// VK_DIVIDE, 0x6F,
	/**
	 * Cover all key codes when IME is processing input.
	 */
	KEY_IN_COMPOSITION = 114,
	ABNT_C1 = 115,// Brazilian (ABNT) Keyboard
	ABNT_C2 = 116,// Brazilian (ABNT) Keyboard
	AudioVolumeMute = 117,
	AudioVolumeUp = 118,
	AudioVolumeDown = 119,
	BrowserSearch = 120,
	BrowserHome = 121,
	BrowserBack = 122,
	BrowserForward = 123,
	MediaTrackNext = 124,
	MediaTrackPrevious = 125,
	MediaStop = 126,
	MediaPlayPause = 127,
	LaunchMediaPlayer = 128,
	LaunchMail = 129,
	LaunchApp2 = 130,
	/**
	 * VK_CLEAR, 0x0C, CLEAR key
	 */
	Clear = 131,
	/**
	 * Placed last to cover the length of the enum.
	 * Please do not depend on this value!
	 */
	MAX_VALUE = 132
}

export enum MarkerSeverity {
	Hint = 1,
	Info = 2,
	Warning = 4,
	Error = 8
}

export enum MarkerTag {
	Unnecessary = 1,
	Deprecated = 2
}

/**
 * Position in the minimap to render the decoration.
 */
export enum MinimapPosition {
	Inline = 1,
	Gutter = 2
}

/**
 * Section header style.
 */
export enum MinimapSectionHeaderStyle {
	Normal = 1,
	Underlined = 2
}

/**
 * Type of hit element with the mouse in the editor.
 */
export enum MouseTargetType {
	/**
	 * Mouse is on top of an unknown element.
	 */
	UNKNOWN = 0,
	/**
	 * Mouse is on top of the textarea used for input.
	 */
	TEXTAREA = 1,
	/**
	 * Mouse is on top of the glyph margin
	 */
	GUTTER_GLYPH_MARGIN = 2,
	/**
	 * Mouse is on top of the line numbers
	 */
	GUTTER_LINE_NUMBERS = 3,
	/**
	 * Mouse is on top of the line decorations
	 */
	GUTTER_LINE_DECORATIONS = 4,
	/**
	 * Mouse is on top of the whitespace left in the gutter by a view zone.
	 */
	GUTTER_VIEW_ZONE = 5,
	/**
	 * Mouse is on top of text in the content.
	 */
	CONTENT_TEXT = 6,
	/**
	 * Mouse is on top of empty space in the content (e.g. after line text or below last line)
	 */
	CONTENT_EMPTY = 7,
	/**
	 * Mouse is on top of a view zone in the content.
	 */
	CONTENT_VIEW_ZONE = 8,
	/**
	 * Mouse is on top of a content widget.
	 */
	CONTENT_WIDGET = 9,
	/**
	 * Mouse is on top of the decorations overview ruler.
	 */
	OVERVIEW_RULER = 10,
	/**
	 * Mouse is on top of a scrollbar.
	 */
	SCROLLBAR = 11,
	/**
	 * Mouse is on top of an overlay widget.
	 */
	OVERLAY_WIDGET = 12,
	/**
	 * Mouse is outside of the editor.
	 */
	OUTSIDE_EDITOR = 13
}

export enum NewSymbolNameTag {
	AIGenerated = 1
}

export enum NewSymbolNameTriggerKind {
	Invoke = 0,
	Automatic = 1
}

/**
 * A positioning preference for rendering overlay widgets.
 */
export enum OverlayWidgetPositionPreference {
	/**
	 * Position the overlay widget in the top right corner
	 */
	TOP_RIGHT_CORNER = 0,
	/**
	 * Position the overlay widget in the bottom right corner
	 */
	BOTTOM_RIGHT_CORNER = 1,
	/**
	 * Position the overlay widget in the top center
	 */
	TOP_CENTER = 2
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
 * How a partial acceptance was triggered.
 */
export enum PartialAcceptTriggerKind {
	Word = 0,
	Line = 1,
	Suggest = 2
}

export enum PositionAffinity {
	/**
	 * Prefers the left most position.
	*/
	Left = 0,
	/**
	 * Prefers the right most position.
	*/
	Right = 1,
	/**
	 * No preference.
	*/
	None = 2,
	/**
	 * If the given position is on injected text, prefers the position left of it.
	*/
	LeftOfInjectedText = 3,
	/**
	 * If the given position is on injected text, prefers the position right of it.
	*/
	RightOfInjectedText = 4
}

export enum RenderLineNumbersType {
	Off = 0,
	On = 1,
	Relative = 2,
	Interval = 3,
	Custom = 4
}

export enum RenderMinimap {
	None = 0,
	Text = 1,
	Blocks = 2
}

export enum ScrollType {
	Smooth = 0,
	Immediate = 1
}

export enum ScrollbarVisibility {
	Auto = 1,
	Hidden = 2,
	Visible = 3
}

/**
 * The direction of a selection.
 */
export enum SelectionDirection {
	/**
	 * The selection starts above where it ends.
	 */
	LTR = 0,
	/**
	 * The selection starts below where it ends.
	 */
	RTL = 1
}

export enum ShowLightbulbIconMode {
	Off = 'off',
	OnCode = 'onCode',
	On = 'on'
}

export enum SignatureHelpTriggerKind {
	Invoke = 1,
	TriggerCharacter = 2,
	ContentChange = 3
}

/**
 * A symbol kind.
 */
export enum SymbolKind {
	File = 0,
	Module = 1,
	Namespace = 2,
	Package = 3,
	Class = 4,
	Method = 5,
	Property = 6,
	Field = 7,
	Constructor = 8,
	Enum = 9,
	Interface = 10,
	Function = 11,
	Variable = 12,
	Constant = 13,
	String = 14,
	Number = 15,
	Boolean = 16,
	Array = 17,
	Object = 18,
	Key = 19,
	Null = 20,
	EnumMember = 21,
	Struct = 22,
	Event = 23,
	Operator = 24,
	TypeParameter = 25
}

export enum SymbolTag {
	Deprecated = 1
}

/**
 * Text Direction for a decoration.
 */
export enum TextDirection {
	LTR = 0,
	RTL = 1
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
 * Describes the behavior of decorations when typing/editing near their edges.
 * Note: Please do not edit the values, as they very carefully match `DecorationRangeBehavior`
 */
export enum TrackedRangeStickiness {
	AlwaysGrowsWhenTypingAtEdges = 0,
	NeverGrowsWhenTypingAtEdges = 1,
	GrowsOnlyWhenTypingBefore = 2,
	GrowsOnlyWhenTypingAfter = 3
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
	 * Indent => wrapped lines get +1 indentation toward the parent.
	 */
	Indent = 2,
	/**
	 * DeepIndent => wrapped lines get +2 indentation toward the parent.
	 */
	DeepIndent = 3
}