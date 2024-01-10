/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CodeAction {
		/**
		 * A range of text that should be highlighted from the Code Action.
		 *
		 * Ex: A refactoring action will highlight the range of text that will be changed.
		 */
		editRanges?: Range[];
	}
}
