/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CodeAction {
		/**
		 * The ranges to which this Code Action applies to, which will be highlighted.
		 * For example: A refactoring action will highlight the range of text that will be affected.
		 */
		ranges?: Range[];
	}
}
