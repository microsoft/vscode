/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145374

	interface WorkspaceEdit {

		// todo@API have a SnippetTextEdit and allow to set that?
		replace(uri: Uri, range: Range, newText: string | SnippetString, metadata?: WorkspaceEditEntryMetadata): void;
	}
}
