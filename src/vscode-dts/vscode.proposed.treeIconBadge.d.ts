/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/252284

	/**
	 * A badge presenting a value for a view
	 */
	export interface ViewBadge2 {
		/**
		 * A label to present in tooltip for the badge.
		 */
		readonly tooltip: string;

		/**
		 * The value to present in the badge.
		 */
		readonly value: number | ThemeIcon;

	}
}
