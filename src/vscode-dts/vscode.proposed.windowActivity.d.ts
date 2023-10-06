/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/181569 @connor4312

	export interface WindowState {
		/**
		 * Indicates whether the window has been interacted with recently. This will
		 * change immediately on activity, or after a short time of user inactivity.
		 */
		readonly active: boolean;
	}
}
