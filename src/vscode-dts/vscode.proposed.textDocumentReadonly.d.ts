/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface TextDocument {
		/**
		 * `true` if the document is read-only.
		 */
		readonly isReadonly: boolean;
	}

	export namespace workspace {
		/**
		 * An event that is emitted when the {@link TextDocument.isReadonly read-only state} of a
		 * {@link TextDocument text document} changes.
		 */
		export const onDidChangeTextDocumentReadonly: Event<TextDocument>;
	}
}
