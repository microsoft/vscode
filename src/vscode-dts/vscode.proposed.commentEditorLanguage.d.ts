/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145384

	/**
	 * Represents a {@link CommentController comment controller}'s {@link CommentController.options options}.
	 */
	export interface CommentOptions {
		/**
		 * The language that will be used for the editor when creating a new comment and for editing comments unless further
		 * specified in the {@link Comment comment}.
		 */
		languageId?: string;
	}

	/**
	 * A comment is displayed within the editor or the Comments Panel, depending on how it is provided.
	 */
	export interface Comment {
		/**
		 * The language that will be used for the editor when editing the comment.
		 */
		languageId?: string;
	}
}
