/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59826

	export interface QuickPickItem {
		/**
		 * A {@link Uri} representing the resource associated with this item.
		 *
		 * When set, this property is used to automatically derive several item properties if they are not explicitly provided:
		 * - **Label**: Derived from the resource's file name when {@link QuickPickItem.label label} is not provided or is empty.
		 * - **Description**: Derived from the resource's path when {@link QuickPickItem.description description} is not provided or is empty.
		 * - **Icon**: Derived from the current file icon theme when {@link QuickPickItem.iconPath iconPath} is set to
		 *   {@link ThemeIcon.File} or {@link ThemeIcon.Folder}.
		 */
		resourceUri?: Uri;
	}
}
