/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/175662

	export interface QuickPickItem {
		/**
		 * An optional tooltip that is displayed when hovering over this item.
		 *
		 * When specified, this tooltip takes precedence over the default hover behavior which shows
		 * the {@link QuickPickItem.description description}.
		 */
		tooltip?: string | MarkdownString;
	}
}
