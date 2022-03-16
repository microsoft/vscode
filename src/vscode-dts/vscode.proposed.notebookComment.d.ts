/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface CommentThread<T = NotebookCell> {
		position: T;
	}

	export interface CommentController {
		createCommentThread(uri: Uri, cell: NotebookCell, comments: readonly Comment[]): CommentThread<NotebookCell>;
	}
}
