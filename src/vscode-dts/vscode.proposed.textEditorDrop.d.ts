/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/142990

	/**
	 * Provider which handles dropping of resources into a text editor.
	 *
	 * The user can drop into a text editor by holding down `shift` while dragging. Requires `workbench.experimental.editor.dropIntoEditor.enabled` to be on.
	 */
	export interface DocumentDropEditProvider {
		/**
		 * Provide edits which inserts the content being dragged and dropped into the document.
		 *
		 * @param document The document in which the drop occurred.
		 * @param position The position in the document where the drop occurred.
		 * @param dataTransfer A {@link DataTransfer} object that holds data about what is being dragged and dropped.
		 * @param token A cancellation token.
		 *
		 * @return A {@link DocumentDropEdit} or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideDocumentDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<DocumentDropEdit>;
	}

	/**
	 * An edit operation applied on drop.
	 */
	export class DocumentDropEdit {
		/**
		 * The text or snippet to insert at the drop location.
		 */
		insertText: string | SnippetString;

		/**
		 * An optional additional edit to apply on drop.
		 */
		additionalEdit?: WorkspaceEdit;

		/**
		 * @param insertText The text or snippet to insert at the drop location.
		 */
		constructor(insertText: string | SnippetString);
	}

	export namespace languages {
		/**
		 * Registers a new {@link DocumentDropEditProvider}.
		 *
		 * @param selector A selector that defines the documents this provider applies to.
		 * @param provider A drop provider.
		 *
		 * @return A {@link Disposable} that unregisters this provider when disposed of.
		 */
		export function registerDocumentDropEditProvider(selector: DocumentSelector, provider: DocumentDropEditProvider): Disposable;
	}
}
