/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CommentThread2 {
		/**
		 * The uri of the document the thread has been created on.
		 */
		readonly uri: Uri;

		/**
		 * The range the comment thread is located within the document. The thread icon will be shown
		 * at the last line of the range.
		 */
		range: Range | undefined;

		/**
		 * The ordered comments of the thread.
		 */
		comments: readonly Comment[];

		/**
		 * Whether the thread should be collapsed or expanded when opening the document.
		 * Defaults to Collapsed.
		 */
		collapsibleState: CommentThreadCollapsibleState;

		/**
		 * Whether the thread supports reply.
		 * Defaults to true.
		 */
		canReply: boolean;

		/**
		 * Context value of the comment thread. This can be used to contribute thread specific actions.
		 * For example, a comment thread is given a context value as `editable`. When contributing actions to `comments/commentThread/title`
		 * using `menus` extension point, you can specify context value for key `commentThread` in `when` expression like `commentThread == editable`.
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "comments/commentThread/title": [
		 *       {
		 *         "command": "extension.deleteCommentThread",
		 *         "when": "commentThread == editable"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 * This will show action `extension.deleteCommentThread` only for comment threads with `contextValue` is `editable`.
		 */
		contextValue?: string;

		/**
		 * The optional human-readable label describing the {@link CommentThread Comment Thread}
		 */
		label?: string;

		// from the commentThreadRelevance proposal
		state?: CommentThreadState | { resolved?: CommentThreadState; applicability?: CommentThreadApplicability };

		/**
		 * Dispose this comment thread.
		 *
		 * Once disposed, this comment thread will be removed from visible editors and Comment Panel when appropriate.
		 */
		dispose(): void;
	}

	export interface CommentController {
		createCommentThread(uri: Uri, range: Range | undefined, comments: readonly Comment[]): CommentThread | CommentThread2;
	}

	export interface CommentingRangeProvider2 {
		/**
		 * Provide a list of ranges which allow new comment threads creation or null for a given document
		 */
		provideCommentingRanges(document: TextDocument, token: CancellationToken): ProviderResult<Range[] | { fileComments: boolean; ranges?: Range[] }>;
	}
}
