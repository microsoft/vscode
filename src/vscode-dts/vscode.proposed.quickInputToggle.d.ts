/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/144956

	export interface QuickInput {
		/**
		 * The toggle buttons to be added to the input box.
		 */
		toggles: ReadonlyArray<QuickInputToggle>;

		/**
		 * Gets or sets the currently checked toggles.
		 */
		checkedToggles: ReadonlyArray<QuickInputToggle>;

		/**
		 * An event that is fired when a toggle is triggered.
		 */
		readonly onDidTriggerToggle: Event<QuickInputToggleEvent>;
	}

	/**
	 * A toggle button for a QuickInput shown inside the input box.
	 */
	export interface QuickInputToggle {
		/**
		 * Icon for the toggle button.
		 */
		readonly iconPath: IconPath;

		/**
		 * An optional tooltip for the toggle button.
		 */
		readonly tooltip?: string;
	}

	/**
	 * An event that is fired when a toggle is triggered.
	 */
	export interface QuickInputToggleEvent {
		/**
		 * The toggle that was triggered.
		 */
		readonly toggle: QuickInputToggle;

		/**
		 * The state of the toggle.
		 */
		readonly checked: boolean;
	}
}
