/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @alexr00 https://github.com/microsoft/vscode/issues/167253

	export enum CommentThreadFocus {
		/**
		 * Focus the comment editor if the thread supports replying.
		 */
		Reply = 1,
		/**
		 * Focus the revealed comment.
		 */
		Comment = 2
	}

	/**
	 * Options to reveal a comment thread in an editor.
	 */
	export interface CommentThreadRevealOptions {

		/**
		 * Where to move the focus to when revealing the comment thread.
		 * If undefined, the focus will not be changed.
		 */
		focus?: CommentThreadFocus;
	}

	export interface CommentThread2 {
		/**
		 * Reveal the comment thread in an editor. If no comment is provided, the first comment in the thread will be revealed.
		 */
		reveal(comment?: Comment, options?: CommentThreadRevealOptions): Thenable<void>;

		/**
		 * Collapse the comment thread in an editor.
		 */
		hide(): Thenable<void>;
	}

}
