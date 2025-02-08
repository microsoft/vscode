/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/175662

	export interface QuickPickItem {
		/**
		 * A tooltip that is rendered when hovering over the item.
		 */
		tooltip?: string | MarkdownString;
	}
}
