/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/127473

	/**
	 * The state of a comment thread.
	 */
	export enum CommentThreadState {
		Unresolved = 0,
		Resolved = 1
	}

	export interface CommentThread {
		/**
		 * The optional state of a comment thread, which may affect how the comment is displayed.
		 */
		state?: CommentThreadState;
	}
}
