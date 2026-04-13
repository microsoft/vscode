/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// @alexr00 https://github.com/microsoft/vscode/issues/204484

	export interface CommentController {
		/**
		 * The currently active comment or `undefined`. The active comment is the one
		 * that currently has focus or, when none has focus, undefined.
		 */
		// readonly activeComment: Comment | undefined;

		/**
		 * The currently active comment thread or `undefined`. The active comment thread is the one
		 * in the CommentController that most recently had focus or, when a different CommentController's
		 * thread has most recently had focus, undefined.
		 */
		readonly activeCommentThread: CommentThread | undefined;
	}
}
