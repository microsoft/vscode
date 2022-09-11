/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/112109

	export namespace workspace {

		/**
		 *
		 * @param isRefactoring Signal to the editor that this edit is a refactoring.
		 */
		export function applyEdit(edit: WorkspaceEdit, isRefactoring?: boolean): Thenable<boolean>;
	}
}
