/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../nls.js';
import { RawContextKey } from '../../platform/contextkey/common/contextkey.js';

export namespace EditorContextKeys {

	export const editorSimpleInput = new RawContextKey<boolean>('editorSimpleInput', false, true);
	/**
	 * A context key that is set when the editor's text has focus (cursor is blinking).
	 * Is false when focus is in simple editor widgets (repl input, scm commit input).
	 */
	export const editorTextFocus = new RawContextKey<boolean>('editorTextFocus', false, nls.localize('editorTextFocus', "Whether the editor text has focus (cursor is blinking)"));
	/**
	 * A context key that is set when the editor's text or an editor's widget has focus.
	 */
	export const focus = new RawContextKey<boolean>('editorFocus', false, nls.localize('editorFocus', "Whether the editor or an editor widget has focus (e.g. focus is in the find widget)"));

	/**
	 * A context key that is set when any editor input has focus (regular editor, repl input...).
	 */
	export const textInputFocus = new RawContextKey<boolean>('textInputFocus', false, nls.localize('textInputFocus', "Whether an editor or a rich text input has focus (cursor is blinking)"));

	export const readOnly = new RawContextKey<boolean>('editorReadonly', false, nls.localize('editorReadonly', "Whether the editor is read-only"));
	export const inDiffEditor = new RawContextKey<boolean>('inDiffEditor', false, nls.localize('inDiffEditor', "Whether the context is a diff editor"));
	export const isEmbeddedDiffEditor = new RawContextKey<boolean>('isEmbeddedDiffEditor', false, nls.localize('isEmbeddedDiffEditor', "Whether the context is an embedded diff editor"));
	export const multiDiffEditorAllCollapsed = new RawContextKey<boolean>('multiDiffEditorAllCollapsed', undefined, nls.localize('multiDiffEditorAllCollapsed', "Whether all files in multi diff editor are collapsed"));
	export const hasChanges = new RawContextKey<boolean>('diffEditorHasChanges', false, nls.localize('diffEditorHasChanges', "Whether the diff editor has changes"));
	export const comparingMovedCode = new RawContextKey<boolean>('comparingMovedCode', false, nls.localize('comparingMovedCode', "Whether a moved code block is selected for comparison"));
	export const accessibleDiffViewerVisible = new RawContextKey<boolean>('accessibleDiffViewerVisible', false, nls.localize('accessibleDiffViewerVisible', "Whether the accessible diff viewer is visible"));
	export const diffEditorRenderSideBySideInlineBreakpointReached = new RawContextKey<boolean>('diffEditorRenderSideBySideInlineBreakpointReached', false, nls.localize('diffEditorRenderSideBySideInlineBreakpointReached', "Whether the diff editor render side by side inline breakpoint is reached"));
	export const diffEditorInlineMode = new RawContextKey<boolean>('diffEditorInlineMode', false, nls.localize('diffEditorInlineMode', "Whether inline mode is active"));

	export const diffEditorOriginalWritable = new RawContextKey<boolean>('diffEditorOriginalWritable', false, nls.localize('diffEditorOriginalWritable', "Whether modified is writable in the diff editor"));
	export const diffEditorModifiedWritable = new RawContextKey<boolean>('diffEditorModifiedWritable', false, nls.localize('diffEditorModifiedWritable', "Whether modified is writable in the diff editor"));
	export const diffEditorOriginalUri = new RawContextKey<string>('diffEditorOriginalUri', '', nls.localize('diffEditorOriginalUri', "The uri of the original document"));
	export const diffEditorModifiedUri = new RawContextKey<string>('diffEditorModifiedUri', '', nls.localize('diffEditorModifiedUri', "The uri of the modified document"));

	export const columnSelection = new RawContextKey<boolean>('editorColumnSelection', false, nls.localize('editorColumnSelection', "Whether `editor.columnSelection` is enabled"));
	export const writable = readOnly.toNegated();
	export const hasNonEmptySelection = new RawContextKey<boolean>('editorHasSelection', false, nls.localize('editorHasSelection', "Whether the editor has text selected"));
	export const hasOnlyEmptySelection = hasNonEmptySelection.toNegated();
	export const hasMultipleSelections = new RawContextKey<boolean>('editorHasMultipleSelections', false, nls.localize('editorHasMultipleSelections', "Whether the editor has multiple selections"));
	export const hasSingleSelection = hasMultipleSelections.toNegated();
	export const tabMovesFocus = new RawContextKey<boolean>('editorTabMovesFocus', false, nls.localize('editorTabMovesFocus', "Whether `Tab` will move focus out of the editor"));
	export const tabDoesNotMoveFocus = tabMovesFocus.toNegated();
	export const isInEmbeddedEditor = new RawContextKey<boolean>('isInEmbeddedEditor', false, true);
	export const canUndo = new RawContextKey<boolean>('canUndo', false, true);
	export const canRedo = new RawContextKey<boolean>('canRedo', false, true);

	export const hoverVisible = new RawContextKey<boolean>('editorHoverVisible', false, nls.localize('editorHoverVisible', "Whether the editor hover is visible"));
	export const hoverFocused = new RawContextKey<boolean>('editorHoverFocused', false, nls.localize('editorHoverFocused', "Whether the editor hover is focused"));

	export const stickyScrollFocused = new RawContextKey<boolean>('stickyScrollFocused', false, nls.localize('stickyScrollFocused', "Whether the sticky scroll is focused"));
	export const stickyScrollVisible = new RawContextKey<boolean>('stickyScrollVisible', false, nls.localize('stickyScrollVisible', "Whether the sticky scroll is visible"));

	export const standaloneColorPickerVisible = new RawContextKey<boolean>('standaloneColorPickerVisible', false, nls.localize('standaloneColorPickerVisible', "Whether the standalone color picker is visible"));
	export const standaloneColorPickerFocused = new RawContextKey<boolean>('standaloneColorPickerFocused', false, nls.localize('standaloneColorPickerFocused', "Whether the standalone color picker is focused"));
	/**
	 * A context key that is set when an editor is part of a larger editor, like notebooks or
	 * (future) a diff editor
	 */
	export const inCompositeEditor = new RawContextKey<boolean>('inCompositeEditor', undefined, nls.localize('inCompositeEditor', "Whether the editor is part of a larger editor (e.g. notebooks)"));
	export const notInCompositeEditor = inCompositeEditor.toNegated();

	// -- mode context keys
	export const languageId = new RawContextKey<string>('editorLangId', '', nls.localize('editorLangId', "The language identifier of the editor"));
	export const hasCompletionItemProvider = new RawContextKey<boolean>('editorHasCompletionItemProvider', false, nls.localize('editorHasCompletionItemProvider', "Whether the editor has a completion item provider"));
	export const hasCodeActionsProvider = new RawContextKey<boolean>('editorHasCodeActionsProvider', false, nls.localize('editorHasCodeActionsProvider', "Whether the editor has a code actions provider"));
	export const hasCodeLensProvider = new RawContextKey<boolean>('editorHasCodeLensProvider', false, nls.localize('editorHasCodeLensProvider', "Whether the editor has a code lens provider"));
	export const hasDefinitionProvider = new RawContextKey<boolean>('editorHasDefinitionProvider', false, nls.localize('editorHasDefinitionProvider', "Whether the editor has a definition provider"));
	export const hasDeclarationProvider = new RawContextKey<boolean>('editorHasDeclarationProvider', false, nls.localize('editorHasDeclarationProvider', "Whether the editor has a declaration provider"));
	export const hasImplementationProvider = new RawContextKey<boolean>('editorHasImplementationProvider', false, nls.localize('editorHasImplementationProvider', "Whether the editor has an implementation provider"));
	export const hasTypeDefinitionProvider = new RawContextKey<boolean>('editorHasTypeDefinitionProvider', false, nls.localize('editorHasTypeDefinitionProvider', "Whether the editor has a type definition provider"));
	export const hasHoverProvider = new RawContextKey<boolean>('editorHasHoverProvider', false, nls.localize('editorHasHoverProvider', "Whether the editor has a hover provider"));
	export const hasDocumentHighlightProvider = new RawContextKey<boolean>('editorHasDocumentHighlightProvider', false, nls.localize('editorHasDocumentHighlightProvider', "Whether the editor has a document highlight provider"));
	export const hasDocumentSymbolProvider = new RawContextKey<boolean>('editorHasDocumentSymbolProvider', false, nls.localize('editorHasDocumentSymbolProvider', "Whether the editor has a document symbol provider"));
	export const hasReferenceProvider = new RawContextKey<boolean>('editorHasReferenceProvider', false, nls.localize('editorHasReferenceProvider', "Whether the editor has a reference provider"));
	export const hasRenameProvider = new RawContextKey<boolean>('editorHasRenameProvider', false, nls.localize('editorHasRenameProvider', "Whether the editor has a rename provider"));
	export const hasSignatureHelpProvider = new RawContextKey<boolean>('editorHasSignatureHelpProvider', false, nls.localize('editorHasSignatureHelpProvider', "Whether the editor has a signature help provider"));
	export const hasInlayHintsProvider = new RawContextKey<boolean>('editorHasInlayHintsProvider', false, nls.localize('editorHasInlayHintsProvider', "Whether the editor has an inline hints provider"));

	// -- mode context keys: formatting
	export const hasDocumentFormattingProvider = new RawContextKey<boolean>('editorHasDocumentFormattingProvider', false, nls.localize('editorHasDocumentFormattingProvider', "Whether the editor has a document formatting provider"));
	export const hasDocumentSelectionFormattingProvider = new RawContextKey<boolean>('editorHasDocumentSelectionFormattingProvider', false, nls.localize('editorHasDocumentSelectionFormattingProvider', "Whether the editor has a document selection formatting provider"));
	export const hasMultipleDocumentFormattingProvider = new RawContextKey<boolean>('editorHasMultipleDocumentFormattingProvider', false, nls.localize('editorHasMultipleDocumentFormattingProvider', "Whether the editor has multiple document formatting providers"));
	export const hasMultipleDocumentSelectionFormattingProvider = new RawContextKey<boolean>('editorHasMultipleDocumentSelectionFormattingProvider', false, nls.localize('editorHasMultipleDocumentSelectionFormattingProvider', "Whether the editor has multiple document selection formatting providers"));

}
