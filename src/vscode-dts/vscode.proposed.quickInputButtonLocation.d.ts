/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/175662

	export enum QuickInputButtonLocation {
		/**
		 * In the title bar.
		 */
		Title = 1,

		/**
		 * To the right of the input box.
		 */
		Inline = 2
	}

	export interface QuickInputButton {
		/**
		 * Where the button should be rendered. The default is {@link QuickInputButtonLocation.Title}.
		 * @note This property is ignored if the button was added to a QuickPickItem.
		 */
		location?: QuickInputButtonLocation;
	}
}
