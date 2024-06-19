/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/162446
// https://github.com/microsoft/vscode/issues/148085

declare module 'vscode' {

	export interface TabGroups {

		/**
		 * Reveals the tab in its current location.
		 *
		 * @param tab The tab to reveal.
		 * @param preserveFocus When `true` focus will remain in its current position.
		 * @returns A promise that resolves when the tab has been revealed.
		 */
		reveal(tab: Tab, preserveFocus?: boolean): Thenable<void>;

		/**
		 * Moves the tab to a new location.
		 *
		 * @param tab The tab to move.
		 * @param viewColumn The view column to move the tab into.
		 * @param tab Position within the view column where the tab should be placed, if omitted the tab will placed to the right of the last tab.
		 * @param preserveFocus When `true` focus will remain in its current position.
		 * @returns A promise that resolves when the tab has been moved.
		 */
		move(tab: Tab, viewColumn: ViewColumn, index?: number, preserveFocus?: boolean): Thenable<void>;

	}
}
