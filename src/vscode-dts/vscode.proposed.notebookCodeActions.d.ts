/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/179213

	export class NotebookCodeActionKind {
		// can only return MULTI CELL workspaceEdits
		// ex: notebook.organizeImprots
		static readonly Notebook: CodeActionKind;

		constructor(value: string);
	}
}
