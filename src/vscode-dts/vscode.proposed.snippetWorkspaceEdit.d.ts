/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145374

	export interface TextEdit {

		// will be merged with newText
		// will NOT be supported everywhere, only: `workspace.applyEdit`
		newText2?: string | SnippetString;
	}
}
