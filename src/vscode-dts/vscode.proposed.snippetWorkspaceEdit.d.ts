/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145374

	// TODO@API - WorkspaceEditEntryMetadata

	export class SnippetTextEdit {

		/**
		 * Utility to create an replace snippet edit.
		 *
		 * @param range A range.
		 * @param snippet A snippet string.
		 * @return A new snippet edit object.
		 */
		static replace(range: Range, snippet: SnippetString): SnippetTextEdit;

		/**
		 * Utility to create an insert snippet edit.
		 *
		 * @param position A position, will become an empty range.
		 * @param snippet A snippet string.
		 * @return A new snippet edit object.
		 */
		static insert(position: Position, snippet: SnippetString): SnippetTextEdit;

		/**
		 * The range this edit applies to.
		 */
		range: Range;

		/**
		 * The {@link SnippetString snippet} this edit will perform.
		 */
		snippet: SnippetString;

		/**
		 * Create a new snippet edit.
		 *
		 * @param range A range.
		 * @param snippet A snippet string.
		 */
		constructor(range: Range, snippet: SnippetString);
	}

	interface WorkspaceEdit {

		/**
		 * Set (and replace) notebook edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: NotebookEdit[]): void;

		/**
		 * Set (and replace) notebook edits with metadata for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: [NotebookEdit, WorkspaceEditEntryMetadata][]): void;

		/**
		 * Set (and replace) text edits or snippet edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: (TextEdit | SnippetTextEdit)[]): void;

		/**
		 * Set (and replace) text edits or snippet edits with metadata for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: [TextEdit | SnippetTextEdit, WorkspaceEditEntryMetadata][]): void;
	}
}
