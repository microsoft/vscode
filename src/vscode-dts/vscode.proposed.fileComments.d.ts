/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CommentThread2 {
		/**
		 * The range the comment thread is located within the document. The thread icon will be shown
		 * at the last line of the range. When set to undefined, the comment will be associated with the
		 * file, and not a specific range.
		 */
		range: Range | undefined;
	}

	/**
	 * The ranges a CommentingRangeProvider enables commenting on.
	 */
	export interface CommentingRanges {
		/**
		 * Enables comments to be added to a file without a specific range.
		 */
		enableFileComments: boolean;

		/**
		 * The ranges which allow new comment threads creation.
		 */
		ranges?: Range[]
	}

	export interface CommentController {
		createCommentThread(uri: Uri, range: Range | undefined, comments: readonly Comment[]): CommentThread | CommentThread2;
	}

	export interface CommentingRangeProvider2 {
		/**
		 * Provide a list of ranges which allow new comment threads creation or null for a given document
		 */
		provideCommentingRanges(document: TextDocument, token: CancellationToken): ProviderResult<Range[] | CommentingRanges>;
	}
}
