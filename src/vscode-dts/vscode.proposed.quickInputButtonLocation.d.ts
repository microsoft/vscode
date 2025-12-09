/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/175662

	/**
	 * Specifies the location where a {@link QuickInputButton} should be rendered.
	 */
	export enum QuickInputButtonLocation {
		/**
		 * The button is rendered in the title bar.
		 */
		Title = 1,

		/**
		 * The button is rendered inline to the right of the input box.
		 */
		Inline = 2,

		/**
		 * The button is rendered at the far end inside the input box.
		 */
		Input = 3
	}

	export interface QuickInputButton {
		/**
		 * The location where the button should be rendered.
		 *
		 * Defaults to {@link QuickInputButtonLocation.Title}.
		 *
		 * **Note:** This property is ignored if the button was added to a {@link QuickPickItem}.
		 */
		location?: QuickInputButtonLocation;

		/**
		 * When present, indicates that the button is a toggle button that can be checked or unchecked.
		 *
		 * **Note:** This property is currently only applicable to buttons with {@link QuickInputButtonLocation.Input} location.
		 * It must be set for such buttons, and the state will be updated when the button is toggled.
		 * It cannot be set for buttons with other location values.
		 */
		readonly toggle?: { checked: boolean };
	}
}
