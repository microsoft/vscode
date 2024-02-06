/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CommentController {
		/**
		 * The currently active comment or `undefined`. The active comment is the one
		 * that currently has focus or, when none has focus, undefined.
		 */
		// readonly activeComment: Comment | undefined;

		/**
		 * The currently active comment thread or `undefined`. The active comment thread is the one
		 * that currently has focus or, when none has focus, undefined.
		 */
		readonly activeThread: CommentThread | undefined;
	}
}
