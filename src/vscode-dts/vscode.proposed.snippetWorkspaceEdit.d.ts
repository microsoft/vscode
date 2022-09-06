/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145374

	// TODO@API - WorkspaceEditEntryMetadata

	export class SnippetTextEdit {

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
		 * Set (and replace) edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		// TODO@API we support mixed edits of TextEdit and SnippetTextEdit
		set(uri: Uri, edits: TextEdit[] | SnippetTextEdit[] | NotebookEdit[]): void;
	}
}
