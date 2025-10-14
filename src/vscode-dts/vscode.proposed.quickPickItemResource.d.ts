/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59826

	export interface QuickPickItem {
		/**
		 * The {@link Uri} of the resource representing this item.
		 *
		 * Will be used to derive the {@link label}, when it is not provided (falsy or empty).
		 * Will be used to derive the {@link description}, when it is not provided (falsy or empty).
		 * Will be used to derive the icon from current file icon theme, when {@link iconPath} has either
		 * {@link ThemeIcon.File} or {@link ThemeIcon.Folder} value.
		 */
		resourceUri?: Uri;
	}
}
