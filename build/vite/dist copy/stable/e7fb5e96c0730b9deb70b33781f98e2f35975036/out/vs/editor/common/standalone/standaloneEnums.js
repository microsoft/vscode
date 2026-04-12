/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.
export var AccessibilitySupport;
(function (AccessibilitySupport) {
    /**
     * This should be the browser case where it is not known if a screen reader is attached or no.
     */
    AccessibilitySupport[AccessibilitySupport["Unknown"] = 0] = "Unknown";
    AccessibilitySupport[AccessibilitySupport["Disabled"] = 1] = "Disabled";
    AccessibilitySupport[AccessibilitySupport["Enabled"] = 2] = "Enabled";
})(AccessibilitySupport || (AccessibilitySupport = {}));
export var CodeActionTriggerType;
(function (CodeActionTriggerType) {
    CodeActionTriggerType[CodeActionTriggerType["Invoke"] = 1] = "Invoke";
    CodeActionTriggerType[CodeActionTriggerType["Auto"] = 2] = "Auto";
})(CodeActionTriggerType || (CodeActionTriggerType = {}));
export var CompletionItemInsertTextRule;
(function (CompletionItemInsertTextRule) {
    CompletionItemInsertTextRule[CompletionItemInsertTextRule["None"] = 0] = "None";
    /**
     * Adjust whitespace/indentation of multiline insert texts to
     * match the current line indentation.
     */
    CompletionItemInsertTextRule[CompletionItemInsertTextRule["KeepWhitespace"] = 1] = "KeepWhitespace";
    /**
     * `insertText` is a snippet.
     */
    CompletionItemInsertTextRule[CompletionItemInsertTextRule["InsertAsSnippet"] = 4] = "InsertAsSnippet";
})(CompletionItemInsertTextRule || (CompletionItemInsertTextRule = {}));
export var CompletionItemKind;
(function (CompletionItemKind) {
    CompletionItemKind[CompletionItemKind["Method"] = 0] = "Method";
    CompletionItemKind[CompletionItemKind["Function"] = 1] = "Function";
    CompletionItemKind[CompletionItemKind["Constructor"] = 2] = "Constructor";
    CompletionItemKind[CompletionItemKind["Field"] = 3] = "Field";
    CompletionItemKind[CompletionItemKind["Variable"] = 4] = "Variable";
    CompletionItemKind[CompletionItemKind["Class"] = 5] = "Class";
    CompletionItemKind[CompletionItemKind["Struct"] = 6] = "Struct";
    CompletionItemKind[CompletionItemKind["Interface"] = 7] = "Interface";
    CompletionItemKind[CompletionItemKind["Module"] = 8] = "Module";
    CompletionItemKind[CompletionItemKind["Property"] = 9] = "Property";
    CompletionItemKind[CompletionItemKind["Event"] = 10] = "Event";
    CompletionItemKind[CompletionItemKind["Operator"] = 11] = "Operator";
    CompletionItemKind[CompletionItemKind["Unit"] = 12] = "Unit";
    CompletionItemKind[CompletionItemKind["Value"] = 13] = "Value";
    CompletionItemKind[CompletionItemKind["Constant"] = 14] = "Constant";
    CompletionItemKind[CompletionItemKind["Enum"] = 15] = "Enum";
    CompletionItemKind[CompletionItemKind["EnumMember"] = 16] = "EnumMember";
    CompletionItemKind[CompletionItemKind["Keyword"] = 17] = "Keyword";
    CompletionItemKind[CompletionItemKind["Text"] = 18] = "Text";
    CompletionItemKind[CompletionItemKind["Color"] = 19] = "Color";
    CompletionItemKind[CompletionItemKind["File"] = 20] = "File";
    CompletionItemKind[CompletionItemKind["Reference"] = 21] = "Reference";
    CompletionItemKind[CompletionItemKind["Customcolor"] = 22] = "Customcolor";
    CompletionItemKind[CompletionItemKind["Folder"] = 23] = "Folder";
    CompletionItemKind[CompletionItemKind["TypeParameter"] = 24] = "TypeParameter";
    CompletionItemKind[CompletionItemKind["User"] = 25] = "User";
    CompletionItemKind[CompletionItemKind["Issue"] = 26] = "Issue";
    CompletionItemKind[CompletionItemKind["Tool"] = 27] = "Tool";
    CompletionItemKind[CompletionItemKind["Snippet"] = 28] = "Snippet";
})(CompletionItemKind || (CompletionItemKind = {}));
export var CompletionItemTag;
(function (CompletionItemTag) {
    CompletionItemTag[CompletionItemTag["Deprecated"] = 1] = "Deprecated";
})(CompletionItemTag || (CompletionItemTag = {}));
/**
 * How a suggest provider was triggered.
 */
export var CompletionTriggerKind;
(function (CompletionTriggerKind) {
    CompletionTriggerKind[CompletionTriggerKind["Invoke"] = 0] = "Invoke";
    CompletionTriggerKind[CompletionTriggerKind["TriggerCharacter"] = 1] = "TriggerCharacter";
    CompletionTriggerKind[CompletionTriggerKind["TriggerForIncompleteCompletions"] = 2] = "TriggerForIncompleteCompletions";
})(CompletionTriggerKind || (CompletionTriggerKind = {}));
/**
 * A positioning preference for rendering content widgets.
 */
export var ContentWidgetPositionPreference;
(function (ContentWidgetPositionPreference) {
    /**
     * Place the content widget exactly at a position
     */
    ContentWidgetPositionPreference[ContentWidgetPositionPreference["EXACT"] = 0] = "EXACT";
    /**
     * Place the content widget above a position
     */
    ContentWidgetPositionPreference[ContentWidgetPositionPreference["ABOVE"] = 1] = "ABOVE";
    /**
     * Place the content widget below a position
     */
    ContentWidgetPositionPreference[ContentWidgetPositionPreference["BELOW"] = 2] = "BELOW";
})(ContentWidgetPositionPreference || (ContentWidgetPositionPreference = {}));
/**
 * Describes the reason the cursor has changed its position.
 */
export var CursorChangeReason;
(function (CursorChangeReason) {
    /**
     * Unknown or not set.
     */
    CursorChangeReason[CursorChangeReason["NotSet"] = 0] = "NotSet";
    /**
     * A `model.setValue()` was called.
     */
    CursorChangeReason[CursorChangeReason["ContentFlush"] = 1] = "ContentFlush";
    /**
     * The `model` has been changed outside of this cursor and the cursor recovers its position from associated markers.
     */
    CursorChangeReason[CursorChangeReason["RecoverFromMarkers"] = 2] = "RecoverFromMarkers";
    /**
     * There was an explicit user gesture.
     */
    CursorChangeReason[CursorChangeReason["Explicit"] = 3] = "Explicit";
    /**
     * There was a Paste.
     */
    CursorChangeReason[CursorChangeReason["Paste"] = 4] = "Paste";
    /**
     * There was an Undo.
     */
    CursorChangeReason[CursorChangeReason["Undo"] = 5] = "Undo";
    /**
     * There was a Redo.
     */
    CursorChangeReason[CursorChangeReason["Redo"] = 6] = "Redo";
})(CursorChangeReason || (CursorChangeReason = {}));
/**
 * The default end of line to use when instantiating models.
 */
export var DefaultEndOfLine;
(function (DefaultEndOfLine) {
    /**
     * Use line feed (\n) as the end of line character.
     */
    DefaultEndOfLine[DefaultEndOfLine["LF"] = 1] = "LF";
    /**
     * Use carriage return and line feed (\r\n) as the end of line character.
     */
    DefaultEndOfLine[DefaultEndOfLine["CRLF"] = 2] = "CRLF";
})(DefaultEndOfLine || (DefaultEndOfLine = {}));
/**
 * A document highlight kind.
 */
export var DocumentHighlightKind;
(function (DocumentHighlightKind) {
    /**
     * A textual occurrence.
     */
    DocumentHighlightKind[DocumentHighlightKind["Text"] = 0] = "Text";
    /**
     * Read-access of a symbol, like reading a variable.
     */
    DocumentHighlightKind[DocumentHighlightKind["Read"] = 1] = "Read";
    /**
     * Write-access of a symbol, like writing to a variable.
     */
    DocumentHighlightKind[DocumentHighlightKind["Write"] = 2] = "Write";
})(DocumentHighlightKind || (DocumentHighlightKind = {}));
/**
 * Configuration options for auto indentation in the editor
 */
export var EditorAutoIndentStrategy;
(function (EditorAutoIndentStrategy) {
    EditorAutoIndentStrategy[EditorAutoIndentStrategy["None"] = 0] = "None";
    EditorAutoIndentStrategy[EditorAutoIndentStrategy["Keep"] = 1] = "Keep";
    EditorAutoIndentStrategy[EditorAutoIndentStrategy["Brackets"] = 2] = "Brackets";
    EditorAutoIndentStrategy[EditorAutoIndentStrategy["Advanced"] = 3] = "Advanced";
    EditorAutoIndentStrategy[EditorAutoIndentStrategy["Full"] = 4] = "Full";
})(EditorAutoIndentStrategy || (EditorAutoIndentStrategy = {}));
export var EditorOption;
(function (EditorOption) {
    EditorOption[EditorOption["acceptSuggestionOnCommitCharacter"] = 0] = "acceptSuggestionOnCommitCharacter";
    EditorOption[EditorOption["acceptSuggestionOnEnter"] = 1] = "acceptSuggestionOnEnter";
    EditorOption[EditorOption["accessibilitySupport"] = 2] = "accessibilitySupport";
    EditorOption[EditorOption["accessibilityPageSize"] = 3] = "accessibilityPageSize";
    EditorOption[EditorOption["allowOverflow"] = 4] = "allowOverflow";
    EditorOption[EditorOption["allowVariableLineHeights"] = 5] = "allowVariableLineHeights";
    EditorOption[EditorOption["allowVariableFonts"] = 6] = "allowVariableFonts";
    EditorOption[EditorOption["allowVariableFontsInAccessibilityMode"] = 7] = "allowVariableFontsInAccessibilityMode";
    EditorOption[EditorOption["ariaLabel"] = 8] = "ariaLabel";
    EditorOption[EditorOption["ariaRequired"] = 9] = "ariaRequired";
    EditorOption[EditorOption["autoClosingBrackets"] = 10] = "autoClosingBrackets";
    EditorOption[EditorOption["autoClosingComments"] = 11] = "autoClosingComments";
    EditorOption[EditorOption["screenReaderAnnounceInlineSuggestion"] = 12] = "screenReaderAnnounceInlineSuggestion";
    EditorOption[EditorOption["autoClosingDelete"] = 13] = "autoClosingDelete";
    EditorOption[EditorOption["autoClosingOvertype"] = 14] = "autoClosingOvertype";
    EditorOption[EditorOption["autoClosingQuotes"] = 15] = "autoClosingQuotes";
    EditorOption[EditorOption["autoIndent"] = 16] = "autoIndent";
    EditorOption[EditorOption["autoIndentOnPaste"] = 17] = "autoIndentOnPaste";
    EditorOption[EditorOption["autoIndentOnPasteWithinString"] = 18] = "autoIndentOnPasteWithinString";
    EditorOption[EditorOption["automaticLayout"] = 19] = "automaticLayout";
    EditorOption[EditorOption["autoSurround"] = 20] = "autoSurround";
    EditorOption[EditorOption["bracketPairColorization"] = 21] = "bracketPairColorization";
    EditorOption[EditorOption["guides"] = 22] = "guides";
    EditorOption[EditorOption["codeLens"] = 23] = "codeLens";
    EditorOption[EditorOption["codeLensFontFamily"] = 24] = "codeLensFontFamily";
    EditorOption[EditorOption["codeLensFontSize"] = 25] = "codeLensFontSize";
    EditorOption[EditorOption["colorDecorators"] = 26] = "colorDecorators";
    EditorOption[EditorOption["colorDecoratorsLimit"] = 27] = "colorDecoratorsLimit";
    EditorOption[EditorOption["columnSelection"] = 28] = "columnSelection";
    EditorOption[EditorOption["comments"] = 29] = "comments";
    EditorOption[EditorOption["contextmenu"] = 30] = "contextmenu";
    EditorOption[EditorOption["copyWithSyntaxHighlighting"] = 31] = "copyWithSyntaxHighlighting";
    EditorOption[EditorOption["cursorBlinking"] = 32] = "cursorBlinking";
    EditorOption[EditorOption["cursorSmoothCaretAnimation"] = 33] = "cursorSmoothCaretAnimation";
    EditorOption[EditorOption["cursorStyle"] = 34] = "cursorStyle";
    EditorOption[EditorOption["cursorSurroundingLines"] = 35] = "cursorSurroundingLines";
    EditorOption[EditorOption["cursorSurroundingLinesStyle"] = 36] = "cursorSurroundingLinesStyle";
    EditorOption[EditorOption["cursorWidth"] = 37] = "cursorWidth";
    EditorOption[EditorOption["cursorHeight"] = 38] = "cursorHeight";
    EditorOption[EditorOption["disableLayerHinting"] = 39] = "disableLayerHinting";
    EditorOption[EditorOption["disableMonospaceOptimizations"] = 40] = "disableMonospaceOptimizations";
    EditorOption[EditorOption["domReadOnly"] = 41] = "domReadOnly";
    EditorOption[EditorOption["dragAndDrop"] = 42] = "dragAndDrop";
    EditorOption[EditorOption["dropIntoEditor"] = 43] = "dropIntoEditor";
    EditorOption[EditorOption["editContext"] = 44] = "editContext";
    EditorOption[EditorOption["emptySelectionClipboard"] = 45] = "emptySelectionClipboard";
    EditorOption[EditorOption["experimentalGpuAcceleration"] = 46] = "experimentalGpuAcceleration";
    EditorOption[EditorOption["experimentalWhitespaceRendering"] = 47] = "experimentalWhitespaceRendering";
    EditorOption[EditorOption["extraEditorClassName"] = 48] = "extraEditorClassName";
    EditorOption[EditorOption["fastScrollSensitivity"] = 49] = "fastScrollSensitivity";
    EditorOption[EditorOption["find"] = 50] = "find";
    EditorOption[EditorOption["fixedOverflowWidgets"] = 51] = "fixedOverflowWidgets";
    EditorOption[EditorOption["folding"] = 52] = "folding";
    EditorOption[EditorOption["foldingStrategy"] = 53] = "foldingStrategy";
    EditorOption[EditorOption["foldingHighlight"] = 54] = "foldingHighlight";
    EditorOption[EditorOption["foldingImportsByDefault"] = 55] = "foldingImportsByDefault";
    EditorOption[EditorOption["foldingMaximumRegions"] = 56] = "foldingMaximumRegions";
    EditorOption[EditorOption["unfoldOnClickAfterEndOfLine"] = 57] = "unfoldOnClickAfterEndOfLine";
    EditorOption[EditorOption["fontFamily"] = 58] = "fontFamily";
    EditorOption[EditorOption["fontInfo"] = 59] = "fontInfo";
    EditorOption[EditorOption["fontLigatures"] = 60] = "fontLigatures";
    EditorOption[EditorOption["fontSize"] = 61] = "fontSize";
    EditorOption[EditorOption["fontWeight"] = 62] = "fontWeight";
    EditorOption[EditorOption["fontVariations"] = 63] = "fontVariations";
    EditorOption[EditorOption["formatOnPaste"] = 64] = "formatOnPaste";
    EditorOption[EditorOption["formatOnType"] = 65] = "formatOnType";
    EditorOption[EditorOption["glyphMargin"] = 66] = "glyphMargin";
    EditorOption[EditorOption["gotoLocation"] = 67] = "gotoLocation";
    EditorOption[EditorOption["hideCursorInOverviewRuler"] = 68] = "hideCursorInOverviewRuler";
    EditorOption[EditorOption["hover"] = 69] = "hover";
    EditorOption[EditorOption["inDiffEditor"] = 70] = "inDiffEditor";
    EditorOption[EditorOption["inlineSuggest"] = 71] = "inlineSuggest";
    EditorOption[EditorOption["letterSpacing"] = 72] = "letterSpacing";
    EditorOption[EditorOption["lightbulb"] = 73] = "lightbulb";
    EditorOption[EditorOption["lineDecorationsWidth"] = 74] = "lineDecorationsWidth";
    EditorOption[EditorOption["lineHeight"] = 75] = "lineHeight";
    EditorOption[EditorOption["lineNumbers"] = 76] = "lineNumbers";
    EditorOption[EditorOption["lineNumbersMinChars"] = 77] = "lineNumbersMinChars";
    EditorOption[EditorOption["linkedEditing"] = 78] = "linkedEditing";
    EditorOption[EditorOption["links"] = 79] = "links";
    EditorOption[EditorOption["matchBrackets"] = 80] = "matchBrackets";
    EditorOption[EditorOption["minimap"] = 81] = "minimap";
    EditorOption[EditorOption["mouseStyle"] = 82] = "mouseStyle";
    EditorOption[EditorOption["mouseWheelScrollSensitivity"] = 83] = "mouseWheelScrollSensitivity";
    EditorOption[EditorOption["mouseWheelZoom"] = 84] = "mouseWheelZoom";
    EditorOption[EditorOption["multiCursorMergeOverlapping"] = 85] = "multiCursorMergeOverlapping";
    EditorOption[EditorOption["multiCursorModifier"] = 86] = "multiCursorModifier";
    EditorOption[EditorOption["mouseMiddleClickAction"] = 87] = "mouseMiddleClickAction";
    EditorOption[EditorOption["multiCursorPaste"] = 88] = "multiCursorPaste";
    EditorOption[EditorOption["multiCursorLimit"] = 89] = "multiCursorLimit";
    EditorOption[EditorOption["occurrencesHighlight"] = 90] = "occurrencesHighlight";
    EditorOption[EditorOption["occurrencesHighlightDelay"] = 91] = "occurrencesHighlightDelay";
    EditorOption[EditorOption["overtypeCursorStyle"] = 92] = "overtypeCursorStyle";
    EditorOption[EditorOption["overtypeOnPaste"] = 93] = "overtypeOnPaste";
    EditorOption[EditorOption["overviewRulerBorder"] = 94] = "overviewRulerBorder";
    EditorOption[EditorOption["overviewRulerLanes"] = 95] = "overviewRulerLanes";
    EditorOption[EditorOption["padding"] = 96] = "padding";
    EditorOption[EditorOption["pasteAs"] = 97] = "pasteAs";
    EditorOption[EditorOption["parameterHints"] = 98] = "parameterHints";
    EditorOption[EditorOption["peekWidgetDefaultFocus"] = 99] = "peekWidgetDefaultFocus";
    EditorOption[EditorOption["placeholder"] = 100] = "placeholder";
    EditorOption[EditorOption["definitionLinkOpensInPeek"] = 101] = "definitionLinkOpensInPeek";
    EditorOption[EditorOption["quickSuggestions"] = 102] = "quickSuggestions";
    EditorOption[EditorOption["quickSuggestionsDelay"] = 103] = "quickSuggestionsDelay";
    EditorOption[EditorOption["readOnly"] = 104] = "readOnly";
    EditorOption[EditorOption["readOnlyMessage"] = 105] = "readOnlyMessage";
    EditorOption[EditorOption["renameOnType"] = 106] = "renameOnType";
    EditorOption[EditorOption["renderRichScreenReaderContent"] = 107] = "renderRichScreenReaderContent";
    EditorOption[EditorOption["renderControlCharacters"] = 108] = "renderControlCharacters";
    EditorOption[EditorOption["renderFinalNewline"] = 109] = "renderFinalNewline";
    EditorOption[EditorOption["renderLineHighlight"] = 110] = "renderLineHighlight";
    EditorOption[EditorOption["renderLineHighlightOnlyWhenFocus"] = 111] = "renderLineHighlightOnlyWhenFocus";
    EditorOption[EditorOption["renderValidationDecorations"] = 112] = "renderValidationDecorations";
    EditorOption[EditorOption["renderWhitespace"] = 113] = "renderWhitespace";
    EditorOption[EditorOption["revealHorizontalRightPadding"] = 114] = "revealHorizontalRightPadding";
    EditorOption[EditorOption["roundedSelection"] = 115] = "roundedSelection";
    EditorOption[EditorOption["rulers"] = 116] = "rulers";
    EditorOption[EditorOption["scrollbar"] = 117] = "scrollbar";
    EditorOption[EditorOption["scrollBeyondLastColumn"] = 118] = "scrollBeyondLastColumn";
    EditorOption[EditorOption["scrollBeyondLastLine"] = 119] = "scrollBeyondLastLine";
    EditorOption[EditorOption["scrollPredominantAxis"] = 120] = "scrollPredominantAxis";
    EditorOption[EditorOption["selectionClipboard"] = 121] = "selectionClipboard";
    EditorOption[EditorOption["selectionHighlight"] = 122] = "selectionHighlight";
    EditorOption[EditorOption["selectionHighlightMaxLength"] = 123] = "selectionHighlightMaxLength";
    EditorOption[EditorOption["selectionHighlightMultiline"] = 124] = "selectionHighlightMultiline";
    EditorOption[EditorOption["selectOnLineNumbers"] = 125] = "selectOnLineNumbers";
    EditorOption[EditorOption["showFoldingControls"] = 126] = "showFoldingControls";
    EditorOption[EditorOption["showUnused"] = 127] = "showUnused";
    EditorOption[EditorOption["snippetSuggestions"] = 128] = "snippetSuggestions";
    EditorOption[EditorOption["smartSelect"] = 129] = "smartSelect";
    EditorOption[EditorOption["smoothScrolling"] = 130] = "smoothScrolling";
    EditorOption[EditorOption["stickyScroll"] = 131] = "stickyScroll";
    EditorOption[EditorOption["stickyTabStops"] = 132] = "stickyTabStops";
    EditorOption[EditorOption["stopRenderingLineAfter"] = 133] = "stopRenderingLineAfter";
    EditorOption[EditorOption["suggest"] = 134] = "suggest";
    EditorOption[EditorOption["suggestFontSize"] = 135] = "suggestFontSize";
    EditorOption[EditorOption["suggestLineHeight"] = 136] = "suggestLineHeight";
    EditorOption[EditorOption["suggestOnTriggerCharacters"] = 137] = "suggestOnTriggerCharacters";
    EditorOption[EditorOption["suggestSelection"] = 138] = "suggestSelection";
    EditorOption[EditorOption["tabCompletion"] = 139] = "tabCompletion";
    EditorOption[EditorOption["tabIndex"] = 140] = "tabIndex";
    EditorOption[EditorOption["trimWhitespaceOnDelete"] = 141] = "trimWhitespaceOnDelete";
    EditorOption[EditorOption["unicodeHighlighting"] = 142] = "unicodeHighlighting";
    EditorOption[EditorOption["unusualLineTerminators"] = 143] = "unusualLineTerminators";
    EditorOption[EditorOption["useShadowDOM"] = 144] = "useShadowDOM";
    EditorOption[EditorOption["useTabStops"] = 145] = "useTabStops";
    EditorOption[EditorOption["wordBreak"] = 146] = "wordBreak";
    EditorOption[EditorOption["wordSegmenterLocales"] = 147] = "wordSegmenterLocales";
    EditorOption[EditorOption["wordSeparators"] = 148] = "wordSeparators";
    EditorOption[EditorOption["wordWrap"] = 149] = "wordWrap";
    EditorOption[EditorOption["wordWrapBreakAfterCharacters"] = 150] = "wordWrapBreakAfterCharacters";
    EditorOption[EditorOption["wordWrapBreakBeforeCharacters"] = 151] = "wordWrapBreakBeforeCharacters";
    EditorOption[EditorOption["wordWrapColumn"] = 152] = "wordWrapColumn";
    EditorOption[EditorOption["wordWrapOverride1"] = 153] = "wordWrapOverride1";
    EditorOption[EditorOption["wordWrapOverride2"] = 154] = "wordWrapOverride2";
    EditorOption[EditorOption["wrappingIndent"] = 155] = "wrappingIndent";
    EditorOption[EditorOption["wrappingStrategy"] = 156] = "wrappingStrategy";
    EditorOption[EditorOption["showDeprecated"] = 157] = "showDeprecated";
    EditorOption[EditorOption["inertialScroll"] = 158] = "inertialScroll";
    EditorOption[EditorOption["inlayHints"] = 159] = "inlayHints";
    EditorOption[EditorOption["wrapOnEscapedLineFeeds"] = 160] = "wrapOnEscapedLineFeeds";
    EditorOption[EditorOption["effectiveCursorStyle"] = 161] = "effectiveCursorStyle";
    EditorOption[EditorOption["editorClassName"] = 162] = "editorClassName";
    EditorOption[EditorOption["pixelRatio"] = 163] = "pixelRatio";
    EditorOption[EditorOption["tabFocusMode"] = 164] = "tabFocusMode";
    EditorOption[EditorOption["layoutInfo"] = 165] = "layoutInfo";
    EditorOption[EditorOption["wrappingInfo"] = 166] = "wrappingInfo";
    EditorOption[EditorOption["defaultColorDecorators"] = 167] = "defaultColorDecorators";
    EditorOption[EditorOption["colorDecoratorsActivatedOn"] = 168] = "colorDecoratorsActivatedOn";
    EditorOption[EditorOption["inlineCompletionsAccessibilityVerbose"] = 169] = "inlineCompletionsAccessibilityVerbose";
    EditorOption[EditorOption["effectiveEditContext"] = 170] = "effectiveEditContext";
    EditorOption[EditorOption["scrollOnMiddleClick"] = 171] = "scrollOnMiddleClick";
    EditorOption[EditorOption["effectiveAllowVariableFonts"] = 172] = "effectiveAllowVariableFonts";
    EditorOption[EditorOption["doubleClickSelectsBlock"] = 173] = "doubleClickSelectsBlock";
})(EditorOption || (EditorOption = {}));
/**
 * End of line character preference.
 */
export var EndOfLinePreference;
(function (EndOfLinePreference) {
    /**
     * Use the end of line character identified in the text buffer.
     */
    EndOfLinePreference[EndOfLinePreference["TextDefined"] = 0] = "TextDefined";
    /**
     * Use line feed (\n) as the end of line character.
     */
    EndOfLinePreference[EndOfLinePreference["LF"] = 1] = "LF";
    /**
     * Use carriage return and line feed (\r\n) as the end of line character.
     */
    EndOfLinePreference[EndOfLinePreference["CRLF"] = 2] = "CRLF";
})(EndOfLinePreference || (EndOfLinePreference = {}));
/**
 * End of line character preference.
 */
export var EndOfLineSequence;
(function (EndOfLineSequence) {
    /**
     * Use line feed (\n) as the end of line character.
     */
    EndOfLineSequence[EndOfLineSequence["LF"] = 0] = "LF";
    /**
     * Use carriage return and line feed (\r\n) as the end of line character.
     */
    EndOfLineSequence[EndOfLineSequence["CRLF"] = 1] = "CRLF";
})(EndOfLineSequence || (EndOfLineSequence = {}));
/**
 * Vertical Lane in the glyph margin of the editor.
 */
export var GlyphMarginLane;
(function (GlyphMarginLane) {
    GlyphMarginLane[GlyphMarginLane["Left"] = 1] = "Left";
    GlyphMarginLane[GlyphMarginLane["Center"] = 2] = "Center";
    GlyphMarginLane[GlyphMarginLane["Right"] = 3] = "Right";
})(GlyphMarginLane || (GlyphMarginLane = {}));
export var HoverVerbosityAction;
(function (HoverVerbosityAction) {
    /**
     * Increase the verbosity of the hover
     */
    HoverVerbosityAction[HoverVerbosityAction["Increase"] = 0] = "Increase";
    /**
     * Decrease the verbosity of the hover
     */
    HoverVerbosityAction[HoverVerbosityAction["Decrease"] = 1] = "Decrease";
})(HoverVerbosityAction || (HoverVerbosityAction = {}));
/**
 * Describes what to do with the indentation when pressing Enter.
 */
export var IndentAction;
(function (IndentAction) {
    /**
     * Insert new line and copy the previous line's indentation.
     */
    IndentAction[IndentAction["None"] = 0] = "None";
    /**
     * Insert new line and indent once (relative to the previous line's indentation).
     */
    IndentAction[IndentAction["Indent"] = 1] = "Indent";
    /**
     * Insert two new lines:
     *  - the first one indented which will hold the cursor
     *  - the second one at the same indentation level
     */
    IndentAction[IndentAction["IndentOutdent"] = 2] = "IndentOutdent";
    /**
     * Insert new line and outdent once (relative to the previous line's indentation).
     */
    IndentAction[IndentAction["Outdent"] = 3] = "Outdent";
})(IndentAction || (IndentAction = {}));
export var InjectedTextCursorStops;
(function (InjectedTextCursorStops) {
    InjectedTextCursorStops[InjectedTextCursorStops["Both"] = 0] = "Both";
    InjectedTextCursorStops[InjectedTextCursorStops["Right"] = 1] = "Right";
    InjectedTextCursorStops[InjectedTextCursorStops["Left"] = 2] = "Left";
    InjectedTextCursorStops[InjectedTextCursorStops["None"] = 3] = "None";
})(InjectedTextCursorStops || (InjectedTextCursorStops = {}));
export var InlayHintKind;
(function (InlayHintKind) {
    InlayHintKind[InlayHintKind["Type"] = 1] = "Type";
    InlayHintKind[InlayHintKind["Parameter"] = 2] = "Parameter";
})(InlayHintKind || (InlayHintKind = {}));
export var InlineCompletionEndOfLifeReasonKind;
(function (InlineCompletionEndOfLifeReasonKind) {
    InlineCompletionEndOfLifeReasonKind[InlineCompletionEndOfLifeReasonKind["Accepted"] = 0] = "Accepted";
    InlineCompletionEndOfLifeReasonKind[InlineCompletionEndOfLifeReasonKind["Rejected"] = 1] = "Rejected";
    InlineCompletionEndOfLifeReasonKind[InlineCompletionEndOfLifeReasonKind["Ignored"] = 2] = "Ignored";
})(InlineCompletionEndOfLifeReasonKind || (InlineCompletionEndOfLifeReasonKind = {}));
export var InlineCompletionHintStyle;
(function (InlineCompletionHintStyle) {
    InlineCompletionHintStyle[InlineCompletionHintStyle["Code"] = 1] = "Code";
    InlineCompletionHintStyle[InlineCompletionHintStyle["Label"] = 2] = "Label";
})(InlineCompletionHintStyle || (InlineCompletionHintStyle = {}));
/**
 * How an {@link InlineCompletionsProvider inline completion provider} was triggered.
 */
export var InlineCompletionTriggerKind;
(function (InlineCompletionTriggerKind) {
    /**
     * Completion was triggered automatically while editing.
     * It is sufficient to return a single completion item in this case.
     */
    InlineCompletionTriggerKind[InlineCompletionTriggerKind["Automatic"] = 0] = "Automatic";
    /**
     * Completion was triggered explicitly by a user gesture.
     * Return multiple completion items to enable cycling through them.
     */
    InlineCompletionTriggerKind[InlineCompletionTriggerKind["Explicit"] = 1] = "Explicit";
})(InlineCompletionTriggerKind || (InlineCompletionTriggerKind = {}));
/**
 * Virtual Key Codes, the value does not hold any inherent meaning.
 * Inspired somewhat from https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
 * But these are "more general", as they should work across browsers & OS`s.
 */
export var KeyCode;
(function (KeyCode) {
    KeyCode[KeyCode["DependsOnKbLayout"] = -1] = "DependsOnKbLayout";
    /**
     * Placed first to cover the 0 value of the enum.
     */
    KeyCode[KeyCode["Unknown"] = 0] = "Unknown";
    KeyCode[KeyCode["Backspace"] = 1] = "Backspace";
    KeyCode[KeyCode["Tab"] = 2] = "Tab";
    KeyCode[KeyCode["Enter"] = 3] = "Enter";
    KeyCode[KeyCode["Shift"] = 4] = "Shift";
    KeyCode[KeyCode["Ctrl"] = 5] = "Ctrl";
    KeyCode[KeyCode["Alt"] = 6] = "Alt";
    KeyCode[KeyCode["PauseBreak"] = 7] = "PauseBreak";
    KeyCode[KeyCode["CapsLock"] = 8] = "CapsLock";
    KeyCode[KeyCode["Escape"] = 9] = "Escape";
    KeyCode[KeyCode["Space"] = 10] = "Space";
    KeyCode[KeyCode["PageUp"] = 11] = "PageUp";
    KeyCode[KeyCode["PageDown"] = 12] = "PageDown";
    KeyCode[KeyCode["End"] = 13] = "End";
    KeyCode[KeyCode["Home"] = 14] = "Home";
    KeyCode[KeyCode["LeftArrow"] = 15] = "LeftArrow";
    KeyCode[KeyCode["UpArrow"] = 16] = "UpArrow";
    KeyCode[KeyCode["RightArrow"] = 17] = "RightArrow";
    KeyCode[KeyCode["DownArrow"] = 18] = "DownArrow";
    KeyCode[KeyCode["Insert"] = 19] = "Insert";
    KeyCode[KeyCode["Delete"] = 20] = "Delete";
    KeyCode[KeyCode["Digit0"] = 21] = "Digit0";
    KeyCode[KeyCode["Digit1"] = 22] = "Digit1";
    KeyCode[KeyCode["Digit2"] = 23] = "Digit2";
    KeyCode[KeyCode["Digit3"] = 24] = "Digit3";
    KeyCode[KeyCode["Digit4"] = 25] = "Digit4";
    KeyCode[KeyCode["Digit5"] = 26] = "Digit5";
    KeyCode[KeyCode["Digit6"] = 27] = "Digit6";
    KeyCode[KeyCode["Digit7"] = 28] = "Digit7";
    KeyCode[KeyCode["Digit8"] = 29] = "Digit8";
    KeyCode[KeyCode["Digit9"] = 30] = "Digit9";
    KeyCode[KeyCode["KeyA"] = 31] = "KeyA";
    KeyCode[KeyCode["KeyB"] = 32] = "KeyB";
    KeyCode[KeyCode["KeyC"] = 33] = "KeyC";
    KeyCode[KeyCode["KeyD"] = 34] = "KeyD";
    KeyCode[KeyCode["KeyE"] = 35] = "KeyE";
    KeyCode[KeyCode["KeyF"] = 36] = "KeyF";
    KeyCode[KeyCode["KeyG"] = 37] = "KeyG";
    KeyCode[KeyCode["KeyH"] = 38] = "KeyH";
    KeyCode[KeyCode["KeyI"] = 39] = "KeyI";
    KeyCode[KeyCode["KeyJ"] = 40] = "KeyJ";
    KeyCode[KeyCode["KeyK"] = 41] = "KeyK";
    KeyCode[KeyCode["KeyL"] = 42] = "KeyL";
    KeyCode[KeyCode["KeyM"] = 43] = "KeyM";
    KeyCode[KeyCode["KeyN"] = 44] = "KeyN";
    KeyCode[KeyCode["KeyO"] = 45] = "KeyO";
    KeyCode[KeyCode["KeyP"] = 46] = "KeyP";
    KeyCode[KeyCode["KeyQ"] = 47] = "KeyQ";
    KeyCode[KeyCode["KeyR"] = 48] = "KeyR";
    KeyCode[KeyCode["KeyS"] = 49] = "KeyS";
    KeyCode[KeyCode["KeyT"] = 50] = "KeyT";
    KeyCode[KeyCode["KeyU"] = 51] = "KeyU";
    KeyCode[KeyCode["KeyV"] = 52] = "KeyV";
    KeyCode[KeyCode["KeyW"] = 53] = "KeyW";
    KeyCode[KeyCode["KeyX"] = 54] = "KeyX";
    KeyCode[KeyCode["KeyY"] = 55] = "KeyY";
    KeyCode[KeyCode["KeyZ"] = 56] = "KeyZ";
    KeyCode[KeyCode["Meta"] = 57] = "Meta";
    KeyCode[KeyCode["ContextMenu"] = 58] = "ContextMenu";
    KeyCode[KeyCode["F1"] = 59] = "F1";
    KeyCode[KeyCode["F2"] = 60] = "F2";
    KeyCode[KeyCode["F3"] = 61] = "F3";
    KeyCode[KeyCode["F4"] = 62] = "F4";
    KeyCode[KeyCode["F5"] = 63] = "F5";
    KeyCode[KeyCode["F6"] = 64] = "F6";
    KeyCode[KeyCode["F7"] = 65] = "F7";
    KeyCode[KeyCode["F8"] = 66] = "F8";
    KeyCode[KeyCode["F9"] = 67] = "F9";
    KeyCode[KeyCode["F10"] = 68] = "F10";
    KeyCode[KeyCode["F11"] = 69] = "F11";
    KeyCode[KeyCode["F12"] = 70] = "F12";
    KeyCode[KeyCode["F13"] = 71] = "F13";
    KeyCode[KeyCode["F14"] = 72] = "F14";
    KeyCode[KeyCode["F15"] = 73] = "F15";
    KeyCode[KeyCode["F16"] = 74] = "F16";
    KeyCode[KeyCode["F17"] = 75] = "F17";
    KeyCode[KeyCode["F18"] = 76] = "F18";
    KeyCode[KeyCode["F19"] = 77] = "F19";
    KeyCode[KeyCode["F20"] = 78] = "F20";
    KeyCode[KeyCode["F21"] = 79] = "F21";
    KeyCode[KeyCode["F22"] = 80] = "F22";
    KeyCode[KeyCode["F23"] = 81] = "F23";
    KeyCode[KeyCode["F24"] = 82] = "F24";
    KeyCode[KeyCode["NumLock"] = 83] = "NumLock";
    KeyCode[KeyCode["ScrollLock"] = 84] = "ScrollLock";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     * For the US standard keyboard, the ';:' key
     */
    KeyCode[KeyCode["Semicolon"] = 85] = "Semicolon";
    /**
     * For any country/region, the '+' key
     * For the US standard keyboard, the '=+' key
     */
    KeyCode[KeyCode["Equal"] = 86] = "Equal";
    /**
     * For any country/region, the ',' key
     * For the US standard keyboard, the ',<' key
     */
    KeyCode[KeyCode["Comma"] = 87] = "Comma";
    /**
     * For any country/region, the '-' key
     * For the US standard keyboard, the '-_' key
     */
    KeyCode[KeyCode["Minus"] = 88] = "Minus";
    /**
     * For any country/region, the '.' key
     * For the US standard keyboard, the '.>' key
     */
    KeyCode[KeyCode["Period"] = 89] = "Period";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     * For the US standard keyboard, the '/?' key
     */
    KeyCode[KeyCode["Slash"] = 90] = "Slash";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     * For the US standard keyboard, the '`~' key
     */
    KeyCode[KeyCode["Backquote"] = 91] = "Backquote";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     * For the US standard keyboard, the '[{' key
     */
    KeyCode[KeyCode["BracketLeft"] = 92] = "BracketLeft";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     * For the US standard keyboard, the '\|' key
     */
    KeyCode[KeyCode["Backslash"] = 93] = "Backslash";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     * For the US standard keyboard, the ']}' key
     */
    KeyCode[KeyCode["BracketRight"] = 94] = "BracketRight";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     * For the US standard keyboard, the ''"' key
     */
    KeyCode[KeyCode["Quote"] = 95] = "Quote";
    /**
     * Used for miscellaneous characters; it can vary by keyboard.
     */
    KeyCode[KeyCode["OEM_8"] = 96] = "OEM_8";
    /**
     * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
     */
    KeyCode[KeyCode["IntlBackslash"] = 97] = "IntlBackslash";
    KeyCode[KeyCode["Numpad0"] = 98] = "Numpad0";
    KeyCode[KeyCode["Numpad1"] = 99] = "Numpad1";
    KeyCode[KeyCode["Numpad2"] = 100] = "Numpad2";
    KeyCode[KeyCode["Numpad3"] = 101] = "Numpad3";
    KeyCode[KeyCode["Numpad4"] = 102] = "Numpad4";
    KeyCode[KeyCode["Numpad5"] = 103] = "Numpad5";
    KeyCode[KeyCode["Numpad6"] = 104] = "Numpad6";
    KeyCode[KeyCode["Numpad7"] = 105] = "Numpad7";
    KeyCode[KeyCode["Numpad8"] = 106] = "Numpad8";
    KeyCode[KeyCode["Numpad9"] = 107] = "Numpad9";
    KeyCode[KeyCode["NumpadMultiply"] = 108] = "NumpadMultiply";
    KeyCode[KeyCode["NumpadAdd"] = 109] = "NumpadAdd";
    KeyCode[KeyCode["NUMPAD_SEPARATOR"] = 110] = "NUMPAD_SEPARATOR";
    KeyCode[KeyCode["NumpadSubtract"] = 111] = "NumpadSubtract";
    KeyCode[KeyCode["NumpadDecimal"] = 112] = "NumpadDecimal";
    KeyCode[KeyCode["NumpadDivide"] = 113] = "NumpadDivide";
    /**
     * Cover all key codes when IME is processing input.
     */
    KeyCode[KeyCode["KEY_IN_COMPOSITION"] = 114] = "KEY_IN_COMPOSITION";
    KeyCode[KeyCode["ABNT_C1"] = 115] = "ABNT_C1";
    KeyCode[KeyCode["ABNT_C2"] = 116] = "ABNT_C2";
    KeyCode[KeyCode["AudioVolumeMute"] = 117] = "AudioVolumeMute";
    KeyCode[KeyCode["AudioVolumeUp"] = 118] = "AudioVolumeUp";
    KeyCode[KeyCode["AudioVolumeDown"] = 119] = "AudioVolumeDown";
    KeyCode[KeyCode["BrowserSearch"] = 120] = "BrowserSearch";
    KeyCode[KeyCode["BrowserHome"] = 121] = "BrowserHome";
    KeyCode[KeyCode["BrowserBack"] = 122] = "BrowserBack";
    KeyCode[KeyCode["BrowserForward"] = 123] = "BrowserForward";
    KeyCode[KeyCode["MediaTrackNext"] = 124] = "MediaTrackNext";
    KeyCode[KeyCode["MediaTrackPrevious"] = 125] = "MediaTrackPrevious";
    KeyCode[KeyCode["MediaStop"] = 126] = "MediaStop";
    KeyCode[KeyCode["MediaPlayPause"] = 127] = "MediaPlayPause";
    KeyCode[KeyCode["LaunchMediaPlayer"] = 128] = "LaunchMediaPlayer";
    KeyCode[KeyCode["LaunchMail"] = 129] = "LaunchMail";
    KeyCode[KeyCode["LaunchApp2"] = 130] = "LaunchApp2";
    /**
     * VK_CLEAR, 0x0C, CLEAR key
     */
    KeyCode[KeyCode["Clear"] = 131] = "Clear";
    /**
     * Placed last to cover the length of the enum.
     * Please do not depend on this value!
     */
    KeyCode[KeyCode["MAX_VALUE"] = 132] = "MAX_VALUE";
})(KeyCode || (KeyCode = {}));
export var MarkerSeverity;
(function (MarkerSeverity) {
    MarkerSeverity[MarkerSeverity["Hint"] = 1] = "Hint";
    MarkerSeverity[MarkerSeverity["Info"] = 2] = "Info";
    MarkerSeverity[MarkerSeverity["Warning"] = 4] = "Warning";
    MarkerSeverity[MarkerSeverity["Error"] = 8] = "Error";
})(MarkerSeverity || (MarkerSeverity = {}));
export var MarkerTag;
(function (MarkerTag) {
    MarkerTag[MarkerTag["Unnecessary"] = 1] = "Unnecessary";
    MarkerTag[MarkerTag["Deprecated"] = 2] = "Deprecated";
})(MarkerTag || (MarkerTag = {}));
/**
 * Position in the minimap to render the decoration.
 */
export var MinimapPosition;
(function (MinimapPosition) {
    MinimapPosition[MinimapPosition["Inline"] = 1] = "Inline";
    MinimapPosition[MinimapPosition["Gutter"] = 2] = "Gutter";
})(MinimapPosition || (MinimapPosition = {}));
/**
 * Section header style.
 */
export var MinimapSectionHeaderStyle;
(function (MinimapSectionHeaderStyle) {
    MinimapSectionHeaderStyle[MinimapSectionHeaderStyle["Normal"] = 1] = "Normal";
    MinimapSectionHeaderStyle[MinimapSectionHeaderStyle["Underlined"] = 2] = "Underlined";
})(MinimapSectionHeaderStyle || (MinimapSectionHeaderStyle = {}));
/**
 * Type of hit element with the mouse in the editor.
 */
export var MouseTargetType;
(function (MouseTargetType) {
    /**
     * Mouse is on top of an unknown element.
     */
    MouseTargetType[MouseTargetType["UNKNOWN"] = 0] = "UNKNOWN";
    /**
     * Mouse is on top of the textarea used for input.
     */
    MouseTargetType[MouseTargetType["TEXTAREA"] = 1] = "TEXTAREA";
    /**
     * Mouse is on top of the glyph margin
     */
    MouseTargetType[MouseTargetType["GUTTER_GLYPH_MARGIN"] = 2] = "GUTTER_GLYPH_MARGIN";
    /**
     * Mouse is on top of the line numbers
     */
    MouseTargetType[MouseTargetType["GUTTER_LINE_NUMBERS"] = 3] = "GUTTER_LINE_NUMBERS";
    /**
     * Mouse is on top of the line decorations
     */
    MouseTargetType[MouseTargetType["GUTTER_LINE_DECORATIONS"] = 4] = "GUTTER_LINE_DECORATIONS";
    /**
     * Mouse is on top of the whitespace left in the gutter by a view zone.
     */
    MouseTargetType[MouseTargetType["GUTTER_VIEW_ZONE"] = 5] = "GUTTER_VIEW_ZONE";
    /**
     * Mouse is on top of text in the content.
     */
    MouseTargetType[MouseTargetType["CONTENT_TEXT"] = 6] = "CONTENT_TEXT";
    /**
     * Mouse is on top of empty space in the content (e.g. after line text or below last line)
     */
    MouseTargetType[MouseTargetType["CONTENT_EMPTY"] = 7] = "CONTENT_EMPTY";
    /**
     * Mouse is on top of a view zone in the content.
     */
    MouseTargetType[MouseTargetType["CONTENT_VIEW_ZONE"] = 8] = "CONTENT_VIEW_ZONE";
    /**
     * Mouse is on top of a content widget.
     */
    MouseTargetType[MouseTargetType["CONTENT_WIDGET"] = 9] = "CONTENT_WIDGET";
    /**
     * Mouse is on top of the decorations overview ruler.
     */
    MouseTargetType[MouseTargetType["OVERVIEW_RULER"] = 10] = "OVERVIEW_RULER";
    /**
     * Mouse is on top of a scrollbar.
     */
    MouseTargetType[MouseTargetType["SCROLLBAR"] = 11] = "SCROLLBAR";
    /**
     * Mouse is on top of an overlay widget.
     */
    MouseTargetType[MouseTargetType["OVERLAY_WIDGET"] = 12] = "OVERLAY_WIDGET";
    /**
     * Mouse is outside of the editor.
     */
    MouseTargetType[MouseTargetType["OUTSIDE_EDITOR"] = 13] = "OUTSIDE_EDITOR";
})(MouseTargetType || (MouseTargetType = {}));
export var NewSymbolNameTag;
(function (NewSymbolNameTag) {
    NewSymbolNameTag[NewSymbolNameTag["AIGenerated"] = 1] = "AIGenerated";
})(NewSymbolNameTag || (NewSymbolNameTag = {}));
export var NewSymbolNameTriggerKind;
(function (NewSymbolNameTriggerKind) {
    NewSymbolNameTriggerKind[NewSymbolNameTriggerKind["Invoke"] = 0] = "Invoke";
    NewSymbolNameTriggerKind[NewSymbolNameTriggerKind["Automatic"] = 1] = "Automatic";
})(NewSymbolNameTriggerKind || (NewSymbolNameTriggerKind = {}));
/**
 * A positioning preference for rendering overlay widgets.
 */
export var OverlayWidgetPositionPreference;
(function (OverlayWidgetPositionPreference) {
    /**
     * Position the overlay widget in the top right corner
     */
    OverlayWidgetPositionPreference[OverlayWidgetPositionPreference["TOP_RIGHT_CORNER"] = 0] = "TOP_RIGHT_CORNER";
    /**
     * Position the overlay widget in the bottom right corner
     */
    OverlayWidgetPositionPreference[OverlayWidgetPositionPreference["BOTTOM_RIGHT_CORNER"] = 1] = "BOTTOM_RIGHT_CORNER";
    /**
     * Position the overlay widget in the top center
     */
    OverlayWidgetPositionPreference[OverlayWidgetPositionPreference["TOP_CENTER"] = 2] = "TOP_CENTER";
})(OverlayWidgetPositionPreference || (OverlayWidgetPositionPreference = {}));
/**
 * Vertical Lane in the overview ruler of the editor.
 */
export var OverviewRulerLane;
(function (OverviewRulerLane) {
    OverviewRulerLane[OverviewRulerLane["Left"] = 1] = "Left";
    OverviewRulerLane[OverviewRulerLane["Center"] = 2] = "Center";
    OverviewRulerLane[OverviewRulerLane["Right"] = 4] = "Right";
    OverviewRulerLane[OverviewRulerLane["Full"] = 7] = "Full";
})(OverviewRulerLane || (OverviewRulerLane = {}));
/**
 * How a partial acceptance was triggered.
 */
export var PartialAcceptTriggerKind;
(function (PartialAcceptTriggerKind) {
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Word"] = 0] = "Word";
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Line"] = 1] = "Line";
    PartialAcceptTriggerKind[PartialAcceptTriggerKind["Suggest"] = 2] = "Suggest";
})(PartialAcceptTriggerKind || (PartialAcceptTriggerKind = {}));
export var PositionAffinity;
(function (PositionAffinity) {
    /**
     * Prefers the left most position.
    */
    PositionAffinity[PositionAffinity["Left"] = 0] = "Left";
    /**
     * Prefers the right most position.
    */
    PositionAffinity[PositionAffinity["Right"] = 1] = "Right";
    /**
     * No preference.
    */
    PositionAffinity[PositionAffinity["None"] = 2] = "None";
    /**
     * If the given position is on injected text, prefers the position left of it.
    */
    PositionAffinity[PositionAffinity["LeftOfInjectedText"] = 3] = "LeftOfInjectedText";
    /**
     * If the given position is on injected text, prefers the position right of it.
    */
    PositionAffinity[PositionAffinity["RightOfInjectedText"] = 4] = "RightOfInjectedText";
})(PositionAffinity || (PositionAffinity = {}));
export var RenderLineNumbersType;
(function (RenderLineNumbersType) {
    RenderLineNumbersType[RenderLineNumbersType["Off"] = 0] = "Off";
    RenderLineNumbersType[RenderLineNumbersType["On"] = 1] = "On";
    RenderLineNumbersType[RenderLineNumbersType["Relative"] = 2] = "Relative";
    RenderLineNumbersType[RenderLineNumbersType["Interval"] = 3] = "Interval";
    RenderLineNumbersType[RenderLineNumbersType["Custom"] = 4] = "Custom";
})(RenderLineNumbersType || (RenderLineNumbersType = {}));
export var RenderMinimap;
(function (RenderMinimap) {
    RenderMinimap[RenderMinimap["None"] = 0] = "None";
    RenderMinimap[RenderMinimap["Text"] = 1] = "Text";
    RenderMinimap[RenderMinimap["Blocks"] = 2] = "Blocks";
})(RenderMinimap || (RenderMinimap = {}));
export var ScrollType;
(function (ScrollType) {
    ScrollType[ScrollType["Smooth"] = 0] = "Smooth";
    ScrollType[ScrollType["Immediate"] = 1] = "Immediate";
})(ScrollType || (ScrollType = {}));
export var ScrollbarVisibility;
(function (ScrollbarVisibility) {
    ScrollbarVisibility[ScrollbarVisibility["Auto"] = 1] = "Auto";
    ScrollbarVisibility[ScrollbarVisibility["Hidden"] = 2] = "Hidden";
    ScrollbarVisibility[ScrollbarVisibility["Visible"] = 3] = "Visible";
})(ScrollbarVisibility || (ScrollbarVisibility = {}));
/**
 * The direction of a selection.
 */
export var SelectionDirection;
(function (SelectionDirection) {
    /**
     * The selection starts above where it ends.
     */
    SelectionDirection[SelectionDirection["LTR"] = 0] = "LTR";
    /**
     * The selection starts below where it ends.
     */
    SelectionDirection[SelectionDirection["RTL"] = 1] = "RTL";
})(SelectionDirection || (SelectionDirection = {}));
export var ShowLightbulbIconMode;
(function (ShowLightbulbIconMode) {
    ShowLightbulbIconMode["Off"] = "off";
    ShowLightbulbIconMode["OnCode"] = "onCode";
    ShowLightbulbIconMode["On"] = "on";
})(ShowLightbulbIconMode || (ShowLightbulbIconMode = {}));
export var SignatureHelpTriggerKind;
(function (SignatureHelpTriggerKind) {
    SignatureHelpTriggerKind[SignatureHelpTriggerKind["Invoke"] = 1] = "Invoke";
    SignatureHelpTriggerKind[SignatureHelpTriggerKind["TriggerCharacter"] = 2] = "TriggerCharacter";
    SignatureHelpTriggerKind[SignatureHelpTriggerKind["ContentChange"] = 3] = "ContentChange";
})(SignatureHelpTriggerKind || (SignatureHelpTriggerKind = {}));
/**
 * A symbol kind.
 */
export var SymbolKind;
(function (SymbolKind) {
    SymbolKind[SymbolKind["File"] = 0] = "File";
    SymbolKind[SymbolKind["Module"] = 1] = "Module";
    SymbolKind[SymbolKind["Namespace"] = 2] = "Namespace";
    SymbolKind[SymbolKind["Package"] = 3] = "Package";
    SymbolKind[SymbolKind["Class"] = 4] = "Class";
    SymbolKind[SymbolKind["Method"] = 5] = "Method";
    SymbolKind[SymbolKind["Property"] = 6] = "Property";
    SymbolKind[SymbolKind["Field"] = 7] = "Field";
    SymbolKind[SymbolKind["Constructor"] = 8] = "Constructor";
    SymbolKind[SymbolKind["Enum"] = 9] = "Enum";
    SymbolKind[SymbolKind["Interface"] = 10] = "Interface";
    SymbolKind[SymbolKind["Function"] = 11] = "Function";
    SymbolKind[SymbolKind["Variable"] = 12] = "Variable";
    SymbolKind[SymbolKind["Constant"] = 13] = "Constant";
    SymbolKind[SymbolKind["String"] = 14] = "String";
    SymbolKind[SymbolKind["Number"] = 15] = "Number";
    SymbolKind[SymbolKind["Boolean"] = 16] = "Boolean";
    SymbolKind[SymbolKind["Array"] = 17] = "Array";
    SymbolKind[SymbolKind["Object"] = 18] = "Object";
    SymbolKind[SymbolKind["Key"] = 19] = "Key";
    SymbolKind[SymbolKind["Null"] = 20] = "Null";
    SymbolKind[SymbolKind["EnumMember"] = 21] = "EnumMember";
    SymbolKind[SymbolKind["Struct"] = 22] = "Struct";
    SymbolKind[SymbolKind["Event"] = 23] = "Event";
    SymbolKind[SymbolKind["Operator"] = 24] = "Operator";
    SymbolKind[SymbolKind["TypeParameter"] = 25] = "TypeParameter";
})(SymbolKind || (SymbolKind = {}));
export var SymbolTag;
(function (SymbolTag) {
    SymbolTag[SymbolTag["Deprecated"] = 1] = "Deprecated";
})(SymbolTag || (SymbolTag = {}));
/**
 * Text Direction for a decoration.
 */
export var TextDirection;
(function (TextDirection) {
    TextDirection[TextDirection["LTR"] = 0] = "LTR";
    TextDirection[TextDirection["RTL"] = 1] = "RTL";
})(TextDirection || (TextDirection = {}));
/**
 * The kind of animation in which the editor's cursor should be rendered.
 */
export var TextEditorCursorBlinkingStyle;
(function (TextEditorCursorBlinkingStyle) {
    /**
     * Hidden
     */
    TextEditorCursorBlinkingStyle[TextEditorCursorBlinkingStyle["Hidden"] = 0] = "Hidden";
    /**
     * Blinking
     */
    TextEditorCursorBlinkingStyle[TextEditorCursorBlinkingStyle["Blink"] = 1] = "Blink";
    /**
     * Blinking with smooth fading
     */
    TextEditorCursorBlinkingStyle[TextEditorCursorBlinkingStyle["Smooth"] = 2] = "Smooth";
    /**
     * Blinking with prolonged filled state and smooth fading
     */
    TextEditorCursorBlinkingStyle[TextEditorCursorBlinkingStyle["Phase"] = 3] = "Phase";
    /**
     * Expand collapse animation on the y axis
     */
    TextEditorCursorBlinkingStyle[TextEditorCursorBlinkingStyle["Expand"] = 4] = "Expand";
    /**
     * No-Blinking
     */
    TextEditorCursorBlinkingStyle[TextEditorCursorBlinkingStyle["Solid"] = 5] = "Solid";
})(TextEditorCursorBlinkingStyle || (TextEditorCursorBlinkingStyle = {}));
/**
 * The style in which the editor's cursor should be rendered.
 */
export var TextEditorCursorStyle;
(function (TextEditorCursorStyle) {
    /**
     * As a vertical line (sitting between two characters).
     */
    TextEditorCursorStyle[TextEditorCursorStyle["Line"] = 1] = "Line";
    /**
     * As a block (sitting on top of a character).
     */
    TextEditorCursorStyle[TextEditorCursorStyle["Block"] = 2] = "Block";
    /**
     * As a horizontal line (sitting under a character).
     */
    TextEditorCursorStyle[TextEditorCursorStyle["Underline"] = 3] = "Underline";
    /**
     * As a thin vertical line (sitting between two characters).
     */
    TextEditorCursorStyle[TextEditorCursorStyle["LineThin"] = 4] = "LineThin";
    /**
     * As an outlined block (sitting on top of a character).
     */
    TextEditorCursorStyle[TextEditorCursorStyle["BlockOutline"] = 5] = "BlockOutline";
    /**
     * As a thin horizontal line (sitting under a character).
     */
    TextEditorCursorStyle[TextEditorCursorStyle["UnderlineThin"] = 6] = "UnderlineThin";
})(TextEditorCursorStyle || (TextEditorCursorStyle = {}));
/**
 * Describes the behavior of decorations when typing/editing near their edges.
 * Note: Please do not edit the values, as they very carefully match `DecorationRangeBehavior`
 */
export var TrackedRangeStickiness;
(function (TrackedRangeStickiness) {
    TrackedRangeStickiness[TrackedRangeStickiness["AlwaysGrowsWhenTypingAtEdges"] = 0] = "AlwaysGrowsWhenTypingAtEdges";
    TrackedRangeStickiness[TrackedRangeStickiness["NeverGrowsWhenTypingAtEdges"] = 1] = "NeverGrowsWhenTypingAtEdges";
    TrackedRangeStickiness[TrackedRangeStickiness["GrowsOnlyWhenTypingBefore"] = 2] = "GrowsOnlyWhenTypingBefore";
    TrackedRangeStickiness[TrackedRangeStickiness["GrowsOnlyWhenTypingAfter"] = 3] = "GrowsOnlyWhenTypingAfter";
})(TrackedRangeStickiness || (TrackedRangeStickiness = {}));
/**
 * Describes how to indent wrapped lines.
 */
export var WrappingIndent;
(function (WrappingIndent) {
    /**
     * No indentation => wrapped lines begin at column 1.
     */
    WrappingIndent[WrappingIndent["None"] = 0] = "None";
    /**
     * Same => wrapped lines get the same indentation as the parent.
     */
    WrappingIndent[WrappingIndent["Same"] = 1] = "Same";
    /**
     * Indent => wrapped lines get +1 indentation toward the parent.
     */
    WrappingIndent[WrappingIndent["Indent"] = 2] = "Indent";
    /**
     * DeepIndent => wrapped lines get +2 indentation toward the parent.
     */
    WrappingIndent[WrappingIndent["DeepIndent"] = 3] = "DeepIndent";
})(WrappingIndent || (WrappingIndent = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUVudW1zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9zdGFuZGFsb25lL3N0YW5kYWxvbmVFbnVtcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxrREFBa0Q7QUFHbEQsTUFBTSxDQUFOLElBQVksb0JBT1g7QUFQRCxXQUFZLG9CQUFvQjtJQUMvQjs7T0FFRztJQUNILHFFQUFXLENBQUE7SUFDWCx1RUFBWSxDQUFBO0lBQ1oscUVBQVcsQ0FBQTtBQUNaLENBQUMsRUFQVyxvQkFBb0IsS0FBcEIsb0JBQW9CLFFBTy9CO0FBRUQsTUFBTSxDQUFOLElBQVkscUJBR1g7QUFIRCxXQUFZLHFCQUFxQjtJQUNoQyxxRUFBVSxDQUFBO0lBQ1YsaUVBQVEsQ0FBQTtBQUNULENBQUMsRUFIVyxxQkFBcUIsS0FBckIscUJBQXFCLFFBR2hDO0FBRUQsTUFBTSxDQUFOLElBQVksNEJBV1g7QUFYRCxXQUFZLDRCQUE0QjtJQUN2QywrRUFBUSxDQUFBO0lBQ1I7OztPQUdHO0lBQ0gsbUdBQWtCLENBQUE7SUFDbEI7O09BRUc7SUFDSCxxR0FBbUIsQ0FBQTtBQUNwQixDQUFDLEVBWFcsNEJBQTRCLEtBQTVCLDRCQUE0QixRQVd2QztBQUVELE1BQU0sQ0FBTixJQUFZLGtCQThCWDtBQTlCRCxXQUFZLGtCQUFrQjtJQUM3QiwrREFBVSxDQUFBO0lBQ1YsbUVBQVksQ0FBQTtJQUNaLHlFQUFlLENBQUE7SUFDZiw2REFBUyxDQUFBO0lBQ1QsbUVBQVksQ0FBQTtJQUNaLDZEQUFTLENBQUE7SUFDVCwrREFBVSxDQUFBO0lBQ1YscUVBQWEsQ0FBQTtJQUNiLCtEQUFVLENBQUE7SUFDVixtRUFBWSxDQUFBO0lBQ1osOERBQVUsQ0FBQTtJQUNWLG9FQUFhLENBQUE7SUFDYiw0REFBUyxDQUFBO0lBQ1QsOERBQVUsQ0FBQTtJQUNWLG9FQUFhLENBQUE7SUFDYiw0REFBUyxDQUFBO0lBQ1Qsd0VBQWUsQ0FBQTtJQUNmLGtFQUFZLENBQUE7SUFDWiw0REFBUyxDQUFBO0lBQ1QsOERBQVUsQ0FBQTtJQUNWLDREQUFTLENBQUE7SUFDVCxzRUFBYyxDQUFBO0lBQ2QsMEVBQWdCLENBQUE7SUFDaEIsZ0VBQVcsQ0FBQTtJQUNYLDhFQUFrQixDQUFBO0lBQ2xCLDREQUFTLENBQUE7SUFDVCw4REFBVSxDQUFBO0lBQ1YsNERBQVMsQ0FBQTtJQUNULGtFQUFZLENBQUE7QUFDYixDQUFDLEVBOUJXLGtCQUFrQixLQUFsQixrQkFBa0IsUUE4QjdCO0FBRUQsTUFBTSxDQUFOLElBQVksaUJBRVg7QUFGRCxXQUFZLGlCQUFpQjtJQUM1QixxRUFBYyxDQUFBO0FBQ2YsQ0FBQyxFQUZXLGlCQUFpQixLQUFqQixpQkFBaUIsUUFFNUI7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLHFCQUlYO0FBSkQsV0FBWSxxQkFBcUI7SUFDaEMscUVBQVUsQ0FBQTtJQUNWLHlGQUFvQixDQUFBO0lBQ3BCLHVIQUFtQyxDQUFBO0FBQ3BDLENBQUMsRUFKVyxxQkFBcUIsS0FBckIscUJBQXFCLFFBSWhDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSwrQkFhWDtBQWJELFdBQVksK0JBQStCO0lBQzFDOztPQUVHO0lBQ0gsdUZBQVMsQ0FBQTtJQUNUOztPQUVHO0lBQ0gsdUZBQVMsQ0FBQTtJQUNUOztPQUVHO0lBQ0gsdUZBQVMsQ0FBQTtBQUNWLENBQUMsRUFiVywrQkFBK0IsS0FBL0IsK0JBQStCLFFBYTFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxrQkE2Qlg7QUE3QkQsV0FBWSxrQkFBa0I7SUFDN0I7O09BRUc7SUFDSCwrREFBVSxDQUFBO0lBQ1Y7O09BRUc7SUFDSCwyRUFBZ0IsQ0FBQTtJQUNoQjs7T0FFRztJQUNILHVGQUFzQixDQUFBO0lBQ3RCOztPQUVHO0lBQ0gsbUVBQVksQ0FBQTtJQUNaOztPQUVHO0lBQ0gsNkRBQVMsQ0FBQTtJQUNUOztPQUVHO0lBQ0gsMkRBQVEsQ0FBQTtJQUNSOztPQUVHO0lBQ0gsMkRBQVEsQ0FBQTtBQUNULENBQUMsRUE3Qlcsa0JBQWtCLEtBQWxCLGtCQUFrQixRQTZCN0I7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLGdCQVNYO0FBVEQsV0FBWSxnQkFBZ0I7SUFDM0I7O09BRUc7SUFDSCxtREFBTSxDQUFBO0lBQ047O09BRUc7SUFDSCx1REFBUSxDQUFBO0FBQ1QsQ0FBQyxFQVRXLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFTM0I7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLHFCQWFYO0FBYkQsV0FBWSxxQkFBcUI7SUFDaEM7O09BRUc7SUFDSCxpRUFBUSxDQUFBO0lBQ1I7O09BRUc7SUFDSCxpRUFBUSxDQUFBO0lBQ1I7O09BRUc7SUFDSCxtRUFBUyxDQUFBO0FBQ1YsQ0FBQyxFQWJXLHFCQUFxQixLQUFyQixxQkFBcUIsUUFhaEM7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLHdCQU1YO0FBTkQsV0FBWSx3QkFBd0I7SUFDbkMsdUVBQVEsQ0FBQTtJQUNSLHVFQUFRLENBQUE7SUFDUiwrRUFBWSxDQUFBO0lBQ1osK0VBQVksQ0FBQTtJQUNaLHVFQUFRLENBQUE7QUFDVCxDQUFDLEVBTlcsd0JBQXdCLEtBQXhCLHdCQUF3QixRQU1uQztBQUVELE1BQU0sQ0FBTixJQUFZLFlBK0tYO0FBL0tELFdBQVksWUFBWTtJQUN2Qix5R0FBcUMsQ0FBQTtJQUNyQyxxRkFBMkIsQ0FBQTtJQUMzQiwrRUFBd0IsQ0FBQTtJQUN4QixpRkFBeUIsQ0FBQTtJQUN6QixpRUFBaUIsQ0FBQTtJQUNqQix1RkFBNEIsQ0FBQTtJQUM1QiwyRUFBc0IsQ0FBQTtJQUN0QixpSEFBeUMsQ0FBQTtJQUN6Qyx5REFBYSxDQUFBO0lBQ2IsK0RBQWdCLENBQUE7SUFDaEIsOEVBQXdCLENBQUE7SUFDeEIsOEVBQXdCLENBQUE7SUFDeEIsZ0hBQXlDLENBQUE7SUFDekMsMEVBQXNCLENBQUE7SUFDdEIsOEVBQXdCLENBQUE7SUFDeEIsMEVBQXNCLENBQUE7SUFDdEIsNERBQWUsQ0FBQTtJQUNmLDBFQUFzQixDQUFBO0lBQ3RCLGtHQUFrQyxDQUFBO0lBQ2xDLHNFQUFvQixDQUFBO0lBQ3BCLGdFQUFpQixDQUFBO0lBQ2pCLHNGQUE0QixDQUFBO0lBQzVCLG9EQUFXLENBQUE7SUFDWCx3REFBYSxDQUFBO0lBQ2IsNEVBQXVCLENBQUE7SUFDdkIsd0VBQXFCLENBQUE7SUFDckIsc0VBQW9CLENBQUE7SUFDcEIsZ0ZBQXlCLENBQUE7SUFDekIsc0VBQW9CLENBQUE7SUFDcEIsd0RBQWEsQ0FBQTtJQUNiLDhEQUFnQixDQUFBO0lBQ2hCLDRGQUErQixDQUFBO0lBQy9CLG9FQUFtQixDQUFBO0lBQ25CLDRGQUErQixDQUFBO0lBQy9CLDhEQUFnQixDQUFBO0lBQ2hCLG9GQUEyQixDQUFBO0lBQzNCLDhGQUFnQyxDQUFBO0lBQ2hDLDhEQUFnQixDQUFBO0lBQ2hCLGdFQUFpQixDQUFBO0lBQ2pCLDhFQUF3QixDQUFBO0lBQ3hCLGtHQUFrQyxDQUFBO0lBQ2xDLDhEQUFnQixDQUFBO0lBQ2hCLDhEQUFnQixDQUFBO0lBQ2hCLG9FQUFtQixDQUFBO0lBQ25CLDhEQUFnQixDQUFBO0lBQ2hCLHNGQUE0QixDQUFBO0lBQzVCLDhGQUFnQyxDQUFBO0lBQ2hDLHNHQUFvQyxDQUFBO0lBQ3BDLGdGQUF5QixDQUFBO0lBQ3pCLGtGQUEwQixDQUFBO0lBQzFCLGdEQUFTLENBQUE7SUFDVCxnRkFBeUIsQ0FBQTtJQUN6QixzREFBWSxDQUFBO0lBQ1osc0VBQW9CLENBQUE7SUFDcEIsd0VBQXFCLENBQUE7SUFDckIsc0ZBQTRCLENBQUE7SUFDNUIsa0ZBQTBCLENBQUE7SUFDMUIsOEZBQWdDLENBQUE7SUFDaEMsNERBQWUsQ0FBQTtJQUNmLHdEQUFhLENBQUE7SUFDYixrRUFBa0IsQ0FBQTtJQUNsQix3REFBYSxDQUFBO0lBQ2IsNERBQWUsQ0FBQTtJQUNmLG9FQUFtQixDQUFBO0lBQ25CLGtFQUFrQixDQUFBO0lBQ2xCLGdFQUFpQixDQUFBO0lBQ2pCLDhEQUFnQixDQUFBO0lBQ2hCLGdFQUFpQixDQUFBO0lBQ2pCLDBGQUE4QixDQUFBO0lBQzlCLGtEQUFVLENBQUE7SUFDVixnRUFBaUIsQ0FBQTtJQUNqQixrRUFBa0IsQ0FBQTtJQUNsQixrRUFBa0IsQ0FBQTtJQUNsQiwwREFBYyxDQUFBO0lBQ2QsZ0ZBQXlCLENBQUE7SUFDekIsNERBQWUsQ0FBQTtJQUNmLDhEQUFnQixDQUFBO0lBQ2hCLDhFQUF3QixDQUFBO0lBQ3hCLGtFQUFrQixDQUFBO0lBQ2xCLGtEQUFVLENBQUE7SUFDVixrRUFBa0IsQ0FBQTtJQUNsQixzREFBWSxDQUFBO0lBQ1osNERBQWUsQ0FBQTtJQUNmLDhGQUFnQyxDQUFBO0lBQ2hDLG9FQUFtQixDQUFBO0lBQ25CLDhGQUFnQyxDQUFBO0lBQ2hDLDhFQUF3QixDQUFBO0lBQ3hCLG9GQUEyQixDQUFBO0lBQzNCLHdFQUFxQixDQUFBO0lBQ3JCLHdFQUFxQixDQUFBO0lBQ3JCLGdGQUF5QixDQUFBO0lBQ3pCLDBGQUE4QixDQUFBO0lBQzlCLDhFQUF3QixDQUFBO0lBQ3hCLHNFQUFvQixDQUFBO0lBQ3BCLDhFQUF3QixDQUFBO0lBQ3hCLDRFQUF1QixDQUFBO0lBQ3ZCLHNEQUFZLENBQUE7SUFDWixzREFBWSxDQUFBO0lBQ1osb0VBQW1CLENBQUE7SUFDbkIsb0ZBQTJCLENBQUE7SUFDM0IsK0RBQWlCLENBQUE7SUFDakIsMkZBQStCLENBQUE7SUFDL0IseUVBQXNCLENBQUE7SUFDdEIsbUZBQTJCLENBQUE7SUFDM0IseURBQWMsQ0FBQTtJQUNkLHVFQUFxQixDQUFBO0lBQ3JCLGlFQUFrQixDQUFBO0lBQ2xCLG1HQUFtQyxDQUFBO0lBQ25DLHVGQUE2QixDQUFBO0lBQzdCLDZFQUF3QixDQUFBO0lBQ3hCLCtFQUF5QixDQUFBO0lBQ3pCLHlHQUFzQyxDQUFBO0lBQ3RDLCtGQUFpQyxDQUFBO0lBQ2pDLHlFQUFzQixDQUFBO0lBQ3RCLGlHQUFrQyxDQUFBO0lBQ2xDLHlFQUFzQixDQUFBO0lBQ3RCLHFEQUFZLENBQUE7SUFDWiwyREFBZSxDQUFBO0lBQ2YscUZBQTRCLENBQUE7SUFDNUIsaUZBQTBCLENBQUE7SUFDMUIsbUZBQTJCLENBQUE7SUFDM0IsNkVBQXdCLENBQUE7SUFDeEIsNkVBQXdCLENBQUE7SUFDeEIsK0ZBQWlDLENBQUE7SUFDakMsK0ZBQWlDLENBQUE7SUFDakMsK0VBQXlCLENBQUE7SUFDekIsK0VBQXlCLENBQUE7SUFDekIsNkRBQWdCLENBQUE7SUFDaEIsNkVBQXdCLENBQUE7SUFDeEIsK0RBQWlCLENBQUE7SUFDakIsdUVBQXFCLENBQUE7SUFDckIsaUVBQWtCLENBQUE7SUFDbEIscUVBQW9CLENBQUE7SUFDcEIscUZBQTRCLENBQUE7SUFDNUIsdURBQWEsQ0FBQTtJQUNiLHVFQUFxQixDQUFBO0lBQ3JCLDJFQUF1QixDQUFBO0lBQ3ZCLDZGQUFnQyxDQUFBO0lBQ2hDLHlFQUFzQixDQUFBO0lBQ3RCLG1FQUFtQixDQUFBO0lBQ25CLHlEQUFjLENBQUE7SUFDZCxxRkFBNEIsQ0FBQTtJQUM1QiwrRUFBeUIsQ0FBQTtJQUN6QixxRkFBNEIsQ0FBQTtJQUM1QixpRUFBa0IsQ0FBQTtJQUNsQiwrREFBaUIsQ0FBQTtJQUNqQiwyREFBZSxDQUFBO0lBQ2YsaUZBQTBCLENBQUE7SUFDMUIscUVBQW9CLENBQUE7SUFDcEIseURBQWMsQ0FBQTtJQUNkLGlHQUFrQyxDQUFBO0lBQ2xDLG1HQUFtQyxDQUFBO0lBQ25DLHFFQUFvQixDQUFBO0lBQ3BCLDJFQUF1QixDQUFBO0lBQ3ZCLDJFQUF1QixDQUFBO0lBQ3ZCLHFFQUFvQixDQUFBO0lBQ3BCLHlFQUFzQixDQUFBO0lBQ3RCLHFFQUFvQixDQUFBO0lBQ3BCLHFFQUFvQixDQUFBO0lBQ3BCLDZEQUFnQixDQUFBO0lBQ2hCLHFGQUE0QixDQUFBO0lBQzVCLGlGQUEwQixDQUFBO0lBQzFCLHVFQUFxQixDQUFBO0lBQ3JCLDZEQUFnQixDQUFBO0lBQ2hCLGlFQUFrQixDQUFBO0lBQ2xCLDZEQUFnQixDQUFBO0lBQ2hCLGlFQUFrQixDQUFBO0lBQ2xCLHFGQUE0QixDQUFBO0lBQzVCLDZGQUFnQyxDQUFBO0lBQ2hDLG1IQUEyQyxDQUFBO0lBQzNDLGlGQUEwQixDQUFBO0lBQzFCLCtFQUF5QixDQUFBO0lBQ3pCLCtGQUFpQyxDQUFBO0lBQ2pDLHVGQUE2QixDQUFBO0FBQzlCLENBQUMsRUEvS1csWUFBWSxLQUFaLFlBQVksUUErS3ZCO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxtQkFhWDtBQWJELFdBQVksbUJBQW1CO0lBQzlCOztPQUVHO0lBQ0gsMkVBQWUsQ0FBQTtJQUNmOztPQUVHO0lBQ0gseURBQU0sQ0FBQTtJQUNOOztPQUVHO0lBQ0gsNkRBQVEsQ0FBQTtBQUNULENBQUMsRUFiVyxtQkFBbUIsS0FBbkIsbUJBQW1CLFFBYTlCO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxpQkFTWDtBQVRELFdBQVksaUJBQWlCO0lBQzVCOztPQUVHO0lBQ0gscURBQU0sQ0FBQTtJQUNOOztPQUVHO0lBQ0gseURBQVEsQ0FBQTtBQUNULENBQUMsRUFUVyxpQkFBaUIsS0FBakIsaUJBQWlCLFFBUzVCO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxlQUlYO0FBSkQsV0FBWSxlQUFlO0lBQzFCLHFEQUFRLENBQUE7SUFDUix5REFBVSxDQUFBO0lBQ1YsdURBQVMsQ0FBQTtBQUNWLENBQUMsRUFKVyxlQUFlLEtBQWYsZUFBZSxRQUkxQjtBQUVELE1BQU0sQ0FBTixJQUFZLG9CQVNYO0FBVEQsV0FBWSxvQkFBb0I7SUFDL0I7O09BRUc7SUFDSCx1RUFBWSxDQUFBO0lBQ1o7O09BRUc7SUFDSCx1RUFBWSxDQUFBO0FBQ2IsQ0FBQyxFQVRXLG9CQUFvQixLQUFwQixvQkFBb0IsUUFTL0I7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLFlBbUJYO0FBbkJELFdBQVksWUFBWTtJQUN2Qjs7T0FFRztJQUNILCtDQUFRLENBQUE7SUFDUjs7T0FFRztJQUNILG1EQUFVLENBQUE7SUFDVjs7OztPQUlHO0lBQ0gsaUVBQWlCLENBQUE7SUFDakI7O09BRUc7SUFDSCxxREFBVyxDQUFBO0FBQ1osQ0FBQyxFQW5CVyxZQUFZLEtBQVosWUFBWSxRQW1CdkI7QUFFRCxNQUFNLENBQU4sSUFBWSx1QkFLWDtBQUxELFdBQVksdUJBQXVCO0lBQ2xDLHFFQUFRLENBQUE7SUFDUix1RUFBUyxDQUFBO0lBQ1QscUVBQVEsQ0FBQTtJQUNSLHFFQUFRLENBQUE7QUFDVCxDQUFDLEVBTFcsdUJBQXVCLEtBQXZCLHVCQUF1QixRQUtsQztBQUVELE1BQU0sQ0FBTixJQUFZLGFBR1g7QUFIRCxXQUFZLGFBQWE7SUFDeEIsaURBQVEsQ0FBQTtJQUNSLDJEQUFhLENBQUE7QUFDZCxDQUFDLEVBSFcsYUFBYSxLQUFiLGFBQWEsUUFHeEI7QUFFRCxNQUFNLENBQU4sSUFBWSxtQ0FJWDtBQUpELFdBQVksbUNBQW1DO0lBQzlDLHFHQUFZLENBQUE7SUFDWixxR0FBWSxDQUFBO0lBQ1osbUdBQVcsQ0FBQTtBQUNaLENBQUMsRUFKVyxtQ0FBbUMsS0FBbkMsbUNBQW1DLFFBSTlDO0FBRUQsTUFBTSxDQUFOLElBQVkseUJBR1g7QUFIRCxXQUFZLHlCQUF5QjtJQUNwQyx5RUFBUSxDQUFBO0lBQ1IsMkVBQVMsQ0FBQTtBQUNWLENBQUMsRUFIVyx5QkFBeUIsS0FBekIseUJBQXlCLFFBR3BDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSwyQkFXWDtBQVhELFdBQVksMkJBQTJCO0lBQ3RDOzs7T0FHRztJQUNILHVGQUFhLENBQUE7SUFDYjs7O09BR0c7SUFDSCxxRkFBWSxDQUFBO0FBQ2IsQ0FBQyxFQVhXLDJCQUEyQixLQUEzQiwyQkFBMkIsUUFXdEM7QUFDRDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQVksT0FzTVg7QUF0TUQsV0FBWSxPQUFPO0lBQ2xCLGdFQUFzQixDQUFBO0lBQ3RCOztPQUVHO0lBQ0gsMkNBQVcsQ0FBQTtJQUNYLCtDQUFhLENBQUE7SUFDYixtQ0FBTyxDQUFBO0lBQ1AsdUNBQVMsQ0FBQTtJQUNULHVDQUFTLENBQUE7SUFDVCxxQ0FBUSxDQUFBO0lBQ1IsbUNBQU8sQ0FBQTtJQUNQLGlEQUFjLENBQUE7SUFDZCw2Q0FBWSxDQUFBO0lBQ1oseUNBQVUsQ0FBQTtJQUNWLHdDQUFVLENBQUE7SUFDViwwQ0FBVyxDQUFBO0lBQ1gsOENBQWEsQ0FBQTtJQUNiLG9DQUFRLENBQUE7SUFDUixzQ0FBUyxDQUFBO0lBQ1QsZ0RBQWMsQ0FBQTtJQUNkLDRDQUFZLENBQUE7SUFDWixrREFBZSxDQUFBO0lBQ2YsZ0RBQWMsQ0FBQTtJQUNkLDBDQUFXLENBQUE7SUFDWCwwQ0FBVyxDQUFBO0lBQ1gsMENBQVcsQ0FBQTtJQUNYLDBDQUFXLENBQUE7SUFDWCwwQ0FBVyxDQUFBO0lBQ1gsMENBQVcsQ0FBQTtJQUNYLDBDQUFXLENBQUE7SUFDWCwwQ0FBVyxDQUFBO0lBQ1gsMENBQVcsQ0FBQTtJQUNYLDBDQUFXLENBQUE7SUFDWCwwQ0FBVyxDQUFBO0lBQ1gsMENBQVcsQ0FBQTtJQUNYLHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULHNDQUFTLENBQUE7SUFDVCxzQ0FBUyxDQUFBO0lBQ1Qsc0NBQVMsQ0FBQTtJQUNULG9EQUFnQixDQUFBO0lBQ2hCLGtDQUFPLENBQUE7SUFDUCxrQ0FBTyxDQUFBO0lBQ1Asa0NBQU8sQ0FBQTtJQUNQLGtDQUFPLENBQUE7SUFDUCxrQ0FBTyxDQUFBO0lBQ1Asa0NBQU8sQ0FBQTtJQUNQLGtDQUFPLENBQUE7SUFDUCxrQ0FBTyxDQUFBO0lBQ1Asa0NBQU8sQ0FBQTtJQUNQLG9DQUFRLENBQUE7SUFDUixvQ0FBUSxDQUFBO0lBQ1Isb0NBQVEsQ0FBQTtJQUNSLG9DQUFRLENBQUE7SUFDUixvQ0FBUSxDQUFBO0lBQ1Isb0NBQVEsQ0FBQTtJQUNSLG9DQUFRLENBQUE7SUFDUixvQ0FBUSxDQUFBO0lBQ1Isb0NBQVEsQ0FBQTtJQUNSLG9DQUFRLENBQUE7SUFDUixvQ0FBUSxDQUFBO0lBQ1Isb0NBQVEsQ0FBQTtJQUNSLG9DQUFRLENBQUE7SUFDUixvQ0FBUSxDQUFBO0lBQ1Isb0NBQVEsQ0FBQTtJQUNSLDRDQUFZLENBQUE7SUFDWixrREFBZSxDQUFBO0lBQ2Y7OztPQUdHO0lBQ0gsZ0RBQWMsQ0FBQTtJQUNkOzs7T0FHRztJQUNILHdDQUFVLENBQUE7SUFDVjs7O09BR0c7SUFDSCx3Q0FBVSxDQUFBO0lBQ1Y7OztPQUdHO0lBQ0gsd0NBQVUsQ0FBQTtJQUNWOzs7T0FHRztJQUNILDBDQUFXLENBQUE7SUFDWDs7O09BR0c7SUFDSCx3Q0FBVSxDQUFBO0lBQ1Y7OztPQUdHO0lBQ0gsZ0RBQWMsQ0FBQTtJQUNkOzs7T0FHRztJQUNILG9EQUFnQixDQUFBO0lBQ2hCOzs7T0FHRztJQUNILGdEQUFjLENBQUE7SUFDZDs7O09BR0c7SUFDSCxzREFBaUIsQ0FBQTtJQUNqQjs7O09BR0c7SUFDSCx3Q0FBVSxDQUFBO0lBQ1Y7O09BRUc7SUFDSCx3Q0FBVSxDQUFBO0lBQ1Y7O09BRUc7SUFDSCx3REFBa0IsQ0FBQTtJQUNsQiw0Q0FBWSxDQUFBO0lBQ1osNENBQVksQ0FBQTtJQUNaLDZDQUFhLENBQUE7SUFDYiw2Q0FBYSxDQUFBO0lBQ2IsNkNBQWEsQ0FBQTtJQUNiLDZDQUFhLENBQUE7SUFDYiw2Q0FBYSxDQUFBO0lBQ2IsNkNBQWEsQ0FBQTtJQUNiLDZDQUFhLENBQUE7SUFDYiw2Q0FBYSxDQUFBO0lBQ2IsMkRBQW9CLENBQUE7SUFDcEIsaURBQWUsQ0FBQTtJQUNmLCtEQUFzQixDQUFBO0lBQ3RCLDJEQUFvQixDQUFBO0lBQ3BCLHlEQUFtQixDQUFBO0lBQ25CLHVEQUFrQixDQUFBO0lBQ2xCOztPQUVHO0lBQ0gsbUVBQXdCLENBQUE7SUFDeEIsNkNBQWEsQ0FBQTtJQUNiLDZDQUFhLENBQUE7SUFDYiw2REFBcUIsQ0FBQTtJQUNyQix5REFBbUIsQ0FBQTtJQUNuQiw2REFBcUIsQ0FBQTtJQUNyQix5REFBbUIsQ0FBQTtJQUNuQixxREFBaUIsQ0FBQTtJQUNqQixxREFBaUIsQ0FBQTtJQUNqQiwyREFBb0IsQ0FBQTtJQUNwQiwyREFBb0IsQ0FBQTtJQUNwQixtRUFBd0IsQ0FBQTtJQUN4QixpREFBZSxDQUFBO0lBQ2YsMkRBQW9CLENBQUE7SUFDcEIsaUVBQXVCLENBQUE7SUFDdkIsbURBQWdCLENBQUE7SUFDaEIsbURBQWdCLENBQUE7SUFDaEI7O09BRUc7SUFDSCx5Q0FBVyxDQUFBO0lBQ1g7OztPQUdHO0lBQ0gsaURBQWUsQ0FBQTtBQUNoQixDQUFDLEVBdE1XLE9BQU8sS0FBUCxPQUFPLFFBc01sQjtBQUVELE1BQU0sQ0FBTixJQUFZLGNBS1g7QUFMRCxXQUFZLGNBQWM7SUFDekIsbURBQVEsQ0FBQTtJQUNSLG1EQUFRLENBQUE7SUFDUix5REFBVyxDQUFBO0lBQ1gscURBQVMsQ0FBQTtBQUNWLENBQUMsRUFMVyxjQUFjLEtBQWQsY0FBYyxRQUt6QjtBQUVELE1BQU0sQ0FBTixJQUFZLFNBR1g7QUFIRCxXQUFZLFNBQVM7SUFDcEIsdURBQWUsQ0FBQTtJQUNmLHFEQUFjLENBQUE7QUFDZixDQUFDLEVBSFcsU0FBUyxLQUFULFNBQVMsUUFHcEI7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLGVBR1g7QUFIRCxXQUFZLGVBQWU7SUFDMUIseURBQVUsQ0FBQTtJQUNWLHlEQUFVLENBQUE7QUFDWCxDQUFDLEVBSFcsZUFBZSxLQUFmLGVBQWUsUUFHMUI7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLHlCQUdYO0FBSEQsV0FBWSx5QkFBeUI7SUFDcEMsNkVBQVUsQ0FBQTtJQUNWLHFGQUFjLENBQUE7QUFDZixDQUFDLEVBSFcseUJBQXlCLEtBQXpCLHlCQUF5QixRQUdwQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksZUF5RFg7QUF6REQsV0FBWSxlQUFlO0lBQzFCOztPQUVHO0lBQ0gsMkRBQVcsQ0FBQTtJQUNYOztPQUVHO0lBQ0gsNkRBQVksQ0FBQTtJQUNaOztPQUVHO0lBQ0gsbUZBQXVCLENBQUE7SUFDdkI7O09BRUc7SUFDSCxtRkFBdUIsQ0FBQTtJQUN2Qjs7T0FFRztJQUNILDJGQUEyQixDQUFBO0lBQzNCOztPQUVHO0lBQ0gsNkVBQW9CLENBQUE7SUFDcEI7O09BRUc7SUFDSCxxRUFBZ0IsQ0FBQTtJQUNoQjs7T0FFRztJQUNILHVFQUFpQixDQUFBO0lBQ2pCOztPQUVHO0lBQ0gsK0VBQXFCLENBQUE7SUFDckI7O09BRUc7SUFDSCx5RUFBa0IsQ0FBQTtJQUNsQjs7T0FFRztJQUNILDBFQUFtQixDQUFBO0lBQ25COztPQUVHO0lBQ0gsZ0VBQWMsQ0FBQTtJQUNkOztPQUVHO0lBQ0gsMEVBQW1CLENBQUE7SUFDbkI7O09BRUc7SUFDSCwwRUFBbUIsQ0FBQTtBQUNwQixDQUFDLEVBekRXLGVBQWUsS0FBZixlQUFlLFFBeUQxQjtBQUVELE1BQU0sQ0FBTixJQUFZLGdCQUVYO0FBRkQsV0FBWSxnQkFBZ0I7SUFDM0IscUVBQWUsQ0FBQTtBQUNoQixDQUFDLEVBRlcsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQUUzQjtBQUVELE1BQU0sQ0FBTixJQUFZLHdCQUdYO0FBSEQsV0FBWSx3QkFBd0I7SUFDbkMsMkVBQVUsQ0FBQTtJQUNWLGlGQUFhLENBQUE7QUFDZCxDQUFDLEVBSFcsd0JBQXdCLEtBQXhCLHdCQUF3QixRQUduQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksK0JBYVg7QUFiRCxXQUFZLCtCQUErQjtJQUMxQzs7T0FFRztJQUNILDZHQUFvQixDQUFBO0lBQ3BCOztPQUVHO0lBQ0gsbUhBQXVCLENBQUE7SUFDdkI7O09BRUc7SUFDSCxpR0FBYyxDQUFBO0FBQ2YsQ0FBQyxFQWJXLCtCQUErQixLQUEvQiwrQkFBK0IsUUFhMUM7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLGlCQUtYO0FBTEQsV0FBWSxpQkFBaUI7SUFDNUIseURBQVEsQ0FBQTtJQUNSLDZEQUFVLENBQUE7SUFDViwyREFBUyxDQUFBO0lBQ1QseURBQVEsQ0FBQTtBQUNULENBQUMsRUFMVyxpQkFBaUIsS0FBakIsaUJBQWlCLFFBSzVCO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSx3QkFJWDtBQUpELFdBQVksd0JBQXdCO0lBQ25DLHVFQUFRLENBQUE7SUFDUix1RUFBUSxDQUFBO0lBQ1IsNkVBQVcsQ0FBQTtBQUNaLENBQUMsRUFKVyx3QkFBd0IsS0FBeEIsd0JBQXdCLFFBSW5DO0FBRUQsTUFBTSxDQUFOLElBQVksZ0JBcUJYO0FBckJELFdBQVksZ0JBQWdCO0lBQzNCOztNQUVFO0lBQ0YsdURBQVEsQ0FBQTtJQUNSOztNQUVFO0lBQ0YseURBQVMsQ0FBQTtJQUNUOztNQUVFO0lBQ0YsdURBQVEsQ0FBQTtJQUNSOztNQUVFO0lBQ0YsbUZBQXNCLENBQUE7SUFDdEI7O01BRUU7SUFDRixxRkFBdUIsQ0FBQTtBQUN4QixDQUFDLEVBckJXLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFxQjNCO0FBRUQsTUFBTSxDQUFOLElBQVkscUJBTVg7QUFORCxXQUFZLHFCQUFxQjtJQUNoQywrREFBTyxDQUFBO0lBQ1AsNkRBQU0sQ0FBQTtJQUNOLHlFQUFZLENBQUE7SUFDWix5RUFBWSxDQUFBO0lBQ1oscUVBQVUsQ0FBQTtBQUNYLENBQUMsRUFOVyxxQkFBcUIsS0FBckIscUJBQXFCLFFBTWhDO0FBRUQsTUFBTSxDQUFOLElBQVksYUFJWDtBQUpELFdBQVksYUFBYTtJQUN4QixpREFBUSxDQUFBO0lBQ1IsaURBQVEsQ0FBQTtJQUNSLHFEQUFVLENBQUE7QUFDWCxDQUFDLEVBSlcsYUFBYSxLQUFiLGFBQWEsUUFJeEI7QUFFRCxNQUFNLENBQU4sSUFBWSxVQUdYO0FBSEQsV0FBWSxVQUFVO0lBQ3JCLCtDQUFVLENBQUE7SUFDVixxREFBYSxDQUFBO0FBQ2QsQ0FBQyxFQUhXLFVBQVUsS0FBVixVQUFVLFFBR3JCO0FBRUQsTUFBTSxDQUFOLElBQVksbUJBSVg7QUFKRCxXQUFZLG1CQUFtQjtJQUM5Qiw2REFBUSxDQUFBO0lBQ1IsaUVBQVUsQ0FBQTtJQUNWLG1FQUFXLENBQUE7QUFDWixDQUFDLEVBSlcsbUJBQW1CLEtBQW5CLG1CQUFtQixRQUk5QjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksa0JBU1g7QUFURCxXQUFZLGtCQUFrQjtJQUM3Qjs7T0FFRztJQUNILHlEQUFPLENBQUE7SUFDUDs7T0FFRztJQUNILHlEQUFPLENBQUE7QUFDUixDQUFDLEVBVFcsa0JBQWtCLEtBQWxCLGtCQUFrQixRQVM3QjtBQUVELE1BQU0sQ0FBTixJQUFZLHFCQUlYO0FBSkQsV0FBWSxxQkFBcUI7SUFDaEMsb0NBQVcsQ0FBQTtJQUNYLDBDQUFpQixDQUFBO0lBQ2pCLGtDQUFTLENBQUE7QUFDVixDQUFDLEVBSlcscUJBQXFCLEtBQXJCLHFCQUFxQixRQUloQztBQUVELE1BQU0sQ0FBTixJQUFZLHdCQUlYO0FBSkQsV0FBWSx3QkFBd0I7SUFDbkMsMkVBQVUsQ0FBQTtJQUNWLCtGQUFvQixDQUFBO0lBQ3BCLHlGQUFpQixDQUFBO0FBQ2xCLENBQUMsRUFKVyx3QkFBd0IsS0FBeEIsd0JBQXdCLFFBSW5DO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxVQTJCWDtBQTNCRCxXQUFZLFVBQVU7SUFDckIsMkNBQVEsQ0FBQTtJQUNSLCtDQUFVLENBQUE7SUFDVixxREFBYSxDQUFBO0lBQ2IsaURBQVcsQ0FBQTtJQUNYLDZDQUFTLENBQUE7SUFDVCwrQ0FBVSxDQUFBO0lBQ1YsbURBQVksQ0FBQTtJQUNaLDZDQUFTLENBQUE7SUFDVCx5REFBZSxDQUFBO0lBQ2YsMkNBQVEsQ0FBQTtJQUNSLHNEQUFjLENBQUE7SUFDZCxvREFBYSxDQUFBO0lBQ2Isb0RBQWEsQ0FBQTtJQUNiLG9EQUFhLENBQUE7SUFDYixnREFBVyxDQUFBO0lBQ1gsZ0RBQVcsQ0FBQTtJQUNYLGtEQUFZLENBQUE7SUFDWiw4Q0FBVSxDQUFBO0lBQ1YsZ0RBQVcsQ0FBQTtJQUNYLDBDQUFRLENBQUE7SUFDUiw0Q0FBUyxDQUFBO0lBQ1Qsd0RBQWUsQ0FBQTtJQUNmLGdEQUFXLENBQUE7SUFDWCw4Q0FBVSxDQUFBO0lBQ1Ysb0RBQWEsQ0FBQTtJQUNiLDhEQUFrQixDQUFBO0FBQ25CLENBQUMsRUEzQlcsVUFBVSxLQUFWLFVBQVUsUUEyQnJCO0FBRUQsTUFBTSxDQUFOLElBQVksU0FFWDtBQUZELFdBQVksU0FBUztJQUNwQixxREFBYyxDQUFBO0FBQ2YsQ0FBQyxFQUZXLFNBQVMsS0FBVCxTQUFTLFFBRXBCO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxhQUdYO0FBSEQsV0FBWSxhQUFhO0lBQ3hCLCtDQUFPLENBQUE7SUFDUCwrQ0FBTyxDQUFBO0FBQ1IsQ0FBQyxFQUhXLGFBQWEsS0FBYixhQUFhLFFBR3hCO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSw2QkF5Qlg7QUF6QkQsV0FBWSw2QkFBNkI7SUFDeEM7O09BRUc7SUFDSCxxRkFBVSxDQUFBO0lBQ1Y7O09BRUc7SUFDSCxtRkFBUyxDQUFBO0lBQ1Q7O09BRUc7SUFDSCxxRkFBVSxDQUFBO0lBQ1Y7O09BRUc7SUFDSCxtRkFBUyxDQUFBO0lBQ1Q7O09BRUc7SUFDSCxxRkFBVSxDQUFBO0lBQ1Y7O09BRUc7SUFDSCxtRkFBUyxDQUFBO0FBQ1YsQ0FBQyxFQXpCVyw2QkFBNkIsS0FBN0IsNkJBQTZCLFFBeUJ4QztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVkscUJBeUJYO0FBekJELFdBQVkscUJBQXFCO0lBQ2hDOztPQUVHO0lBQ0gsaUVBQVEsQ0FBQTtJQUNSOztPQUVHO0lBQ0gsbUVBQVMsQ0FBQTtJQUNUOztPQUVHO0lBQ0gsMkVBQWEsQ0FBQTtJQUNiOztPQUVHO0lBQ0gseUVBQVksQ0FBQTtJQUNaOztPQUVHO0lBQ0gsaUZBQWdCLENBQUE7SUFDaEI7O09BRUc7SUFDSCxtRkFBaUIsQ0FBQTtBQUNsQixDQUFDLEVBekJXLHFCQUFxQixLQUFyQixxQkFBcUIsUUF5QmhDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxDQUFOLElBQVksc0JBS1g7QUFMRCxXQUFZLHNCQUFzQjtJQUNqQyxtSEFBZ0MsQ0FBQTtJQUNoQyxpSEFBK0IsQ0FBQTtJQUMvQiw2R0FBNkIsQ0FBQTtJQUM3QiwyR0FBNEIsQ0FBQTtBQUM3QixDQUFDLEVBTFcsc0JBQXNCLEtBQXRCLHNCQUFzQixRQUtqQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksY0FpQlg7QUFqQkQsV0FBWSxjQUFjO0lBQ3pCOztPQUVHO0lBQ0gsbURBQVEsQ0FBQTtJQUNSOztPQUVHO0lBQ0gsbURBQVEsQ0FBQTtJQUNSOztPQUVHO0lBQ0gsdURBQVUsQ0FBQTtJQUNWOztPQUVHO0lBQ0gsK0RBQWMsQ0FBQTtBQUNmLENBQUMsRUFqQlcsY0FBYyxLQUFkLGNBQWMsUUFpQnpCIn0=