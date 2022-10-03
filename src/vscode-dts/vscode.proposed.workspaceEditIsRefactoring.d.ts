/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/112109

	/**
	 * Additional data about a workspace edit.
	 */
	export interface WorkspaceEditMetadata {
		/**
		 * Signal to the editor that this edit is a refactoring.
		 */
		isRefactoring?: boolean;
	}

	export namespace workspace {

		/**
		 * @param metadata Optional {@link WorkspaceEditMetadata metadata} for the edit.
		 */
		export function applyEdit(edit: WorkspaceEdit, metadata?: WorkspaceEditMetadata): Thenable<boolean>;
	}
}
