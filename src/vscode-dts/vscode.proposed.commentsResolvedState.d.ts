/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/127473

	export interface CommentState {
		/**
		 * The human-readable label for the comment state. This may be shown in the UI (ex. "Mark comment as <label>").
		 */
		readonly label: string;

		/**
		 * Icon for the state. This may be shown in the UI.
		 */
		readonly iconPath: string | Uri | ThemeIcon;

		/**
		 * An optional color that may be used to indicate the comment's state.
		 */
		readonly color?: ThemeColor;

		// todo@alexr00 Do we also need a priority so we can count how many high priority comments there are in the UI?
	}

	export interface CommentThread {
		/**
		 * Optional current state of the {@link Comment}
		 */
		state?: CommentState;
	}
}
