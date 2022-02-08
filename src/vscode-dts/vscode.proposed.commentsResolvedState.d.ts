/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/127473

	export class CommentThreadDecorations {
		static HighEmphasis: CommentThreadDecorations;
		static LowEmphasis: CommentThreadDecorations;

		/**
		 * Icon that will show in association with a comment thread.
		 */
		readonly iconPath?: string | Uri | ThemeIcon;

		/**
		 * Color that will show in association with the comment thread.
		 */
		readonly color?: ThemeColor;

		constructor(iconPath?: string | Uri | ThemeIcon, color?: ThemeColor);
	}

	export interface CommentThread {
		/**
		 * The decorations for a {@link CommentThread}.
		 */
		decoration?: CommentThreadDecorations;

		/**
		 * The accessibility information associated with the label of the {@link CommentThread}.
		 */
		labelAccessibilityInformation?: AccessibilityInformation;

		/**
		 * The tooltip associated with the label of hte {@link CommentThread}.
		 */
		labelTooltip?: string;
	}
}
