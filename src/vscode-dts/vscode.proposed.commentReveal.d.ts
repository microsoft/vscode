/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @alexr00 https://github.com/microsoft/vscode/issues/167253

	/**
	 * Options to reveal a comment thread in an editor.
	 */
	export interface CommentThreadRevealOptions {
		/**
		 * By default, the comment thread will be focused. Set `preserveFocus` to `true` to maintain the original focus.
		 */
		preserveFocus?: boolean;

		/**
		 * Focus the comment thread reply editor, if the thread supports replying.
		 */
		focusReply?: boolean;
	}

	export interface CommentThread {
		/**
		 * Reveal the comment thread in an editor.
		 */
		reveal(options?: CommentThreadRevealOptions): Thenable<void>;
	}

}
