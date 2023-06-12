/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * Represents an item that can be selected from
	 * a list of items.
	 */
	export interface QuickPickItem {
		/**
		 * The icon path or {@link ThemeIcon} for the QuickPickItem.
		 */
		iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;
	}
}
