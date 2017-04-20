/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export namespace EditorContextKeys {
	/**
	 * A context key that is set when the editor's text has focus (cursor is blinking).
	 */
	export const TextFocus = new RawContextKey<boolean>('editorTextFocus', false);
	/**
	 * A context key that is set when the editor's text or an editor's widget has focus.
	 */
	export const Focus = new RawContextKey<boolean>('editorFocus', false);
	/**
	 * A context key that is set when the editor's text is readonly.
	 */
	export const ReadOnly = new RawContextKey<boolean>('editorReadonly', false);
	export const Writable: ContextKeyExpr = ReadOnly.toNegated();
	/**
	 * A context key that is set when the editor has a non-collapsed selection.
	 */
	export const HasNonEmptySelection = new RawContextKey<boolean>('editorHasSelection', false);
	export const HasOnlyEmptySelection: ContextKeyExpr = HasNonEmptySelection.toNegated();
	/**
	 * A context key that is set when the editor has multiple selections (multiple cursors).
	 */
	export const HasMultipleSelections = new RawContextKey<boolean>('editorHasMultipleSelections', false);
	export const HasSingleSelection: ContextKeyExpr = HasMultipleSelections.toNegated();
	export const TabMovesFocus = new RawContextKey<boolean>('editorTabMovesFocus', false);
	export const TabDoesNotMoveFocus: ContextKeyExpr = TabMovesFocus.toNegated();
	/**
	 * A context key that is set to the language associated with the model associated with the editor.
	 */
	export const LanguageId = new RawContextKey<string>('editorLangId', undefined);
};

export namespace ModeContextKeys {
	export const hasCompletionItemProvider = new RawContextKey<boolean>('editorHasCompletionItemProvider', undefined);
	export const hasCodeActionsProvider = new RawContextKey<boolean>('editorHasCodeActionsProvider', undefined);
	export const hasCodeLensProvider = new RawContextKey<boolean>('editorHasCodeLensProvider', undefined);
	export const hasDefinitionProvider = new RawContextKey<boolean>('editorHasDefinitionProvider', undefined);
	export const hasImplementationProvider = new RawContextKey<boolean>('editorHasImplementationProvider', undefined);
	export const hasTypeDefinitionProvider = new RawContextKey<boolean>('editorHasTypeDefinitionProvider', undefined);
	export const hasHoverProvider = new RawContextKey<boolean>('editorHasHoverProvider', undefined);
	export const hasDocumentHighlightProvider = new RawContextKey<boolean>('editorHasDocumentHighlightProvider', undefined);
	export const hasDocumentSymbolProvider = new RawContextKey<boolean>('editorHasDocumentSymbolProvider', undefined);
	export const hasReferenceProvider = new RawContextKey<boolean>('editorHasReferenceProvider', undefined);
	export const hasRenameProvider = new RawContextKey<boolean>('editorHasRenameProvider', undefined);
	export const hasDocumentFormattingProvider = new RawContextKey<boolean>('editorHasDocumentFormattingProvider', undefined);
	export const hasDocumentSelectionFormattingProvider = new RawContextKey<boolean>('editorHasDocumentSelectionFormattingProvider', undefined);
	export const hasSignatureHelpProvider = new RawContextKey<boolean>('editorHasSignatureHelpProvider', undefined);
	export const isInEmbeddedEditor = new RawContextKey<boolean>('isInEmbeddedEditor', undefined);
}
