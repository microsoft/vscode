/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/127473

	export interface CommentThreadDecorations {

		/**
		 * Icon that will show in association with a comment thread.
		 */
		readonly iconPath: string | Uri | ThemeIcon;

		/**
		 * Color that will show in association with the comment thread.
		 */
		readonly color?: ThemeColor;
	}

	export interface CommentThread {
		/**
		 * Optional current state of the {@link Comment}
		 */
		state?: { label: string, tooltip: string, includeInCount: boolean };

		decoration?: CommentThreadDecorations
	}
}
