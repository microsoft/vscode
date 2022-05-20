/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/142990

	export class SnippetTextEdit {
		snippet: SnippetString;
		range: Range;
		constructor(range: Range, snippet: SnippetString);
	}

	/**
	 * Provider which handles dropping of resources into a text editor.
	 *
	 * The user can drop into a text editor by holding down `shift` while dragging. Requires `workbench.experimental.editor.dropIntoEditor.enabled` to be on.
	 */
	export interface DocumentOnDropEditProvider {
		/**
		 * Provide edits which inserts the content being dragged and dropped into the document.
		 *
		 * @param document The document in which the drop occurred.
		 * @param position The position in the document where the drop occurred.
		 * @param dataTransfer A {@link DataTransfer} object that holds data about what is being dragged and dropped.
		 * @param token A cancellation token.
		 *
		 * @return A {@link SnippetTextEdit} or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideDocumentOnDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<SnippetTextEdit>;
	}

	export namespace languages {
		/**
		 * Registers a new {@link DocumentOnDropEditProvider}.
		 *
		 * @param selector A selector that defines the documents this provider applies to.
		 * @param provider A drop provider.
		 *
		 * @return A {@link Disposable} that unregisters this provider when disposed of.
		 */
		export function registerDocumentOnDropEditProvider(selector: DocumentSelector, provider: DocumentOnDropEditProvider): Disposable;
	}
}
