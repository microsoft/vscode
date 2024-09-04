/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';


export namespace CommentContextKeys {

	/**
	 * A context key that is set when the active cursor is in a commenting range.
	 */
	export const activeCursorHasCommentingRange = new RawContextKey<boolean>('activeCursorHasCommentingRange', false, {
		description: nls.localize('hasCommentingRange', "Whether the position at the active cursor has a commenting range"),
		type: 'boolean'
	});

	/**
	 * A context key that is set when the active editor has commenting ranges.
	 */
	export const activeEditorHasCommentingRange = new RawContextKey<boolean>('activeEditorHasCommentingRange', false, {
		description: nls.localize('editorHasCommentingRange', "Whether the active editor has a commenting range"),
		type: 'boolean'
	});

	/**
	 * A context key that is set when the workspace has either comments or commenting ranges.
	 */
	export const WorkspaceHasCommenting = new RawContextKey<boolean>('workspaceHasCommenting', false, {
		description: nls.localize('hasCommentingProvider', "Whether the open workspace has either comments or commenting ranges."),
		type: 'boolean'
	});

	/**
	 * A context key that is set when the comment thread has no comments.
	 */
	export const commentThreadIsEmpty = new RawContextKey<boolean>('commentThreadIsEmpty', false, { type: 'boolean', description: nls.localize('commentThreadIsEmpty', "Set when the comment thread has no comments") });
	/**
	 * A context key that is set when the comment has no input.
	 */
	export const commentIsEmpty = new RawContextKey<boolean>('commentIsEmpty', false, { type: 'boolean', description: nls.localize('commentIsEmpty', "Set when the comment has no input") });
	/**
	 * The context value of the comment.
	 */
	export const commentContext = new RawContextKey<string>('comment', undefined, { type: 'string', description: nls.localize('comment', "The context value of the comment") });
	/**
	 * The context value of the comment thread.
	 */
	export const commentThreadContext = new RawContextKey<string>('commentThread', undefined, { type: 'string', description: nls.localize('commentThread', "The context value of the comment thread") });
	/**
	 * The comment controller id associated with a comment thread.
	 */
	export const commentControllerContext = new RawContextKey<string>('commentController', undefined, { type: 'string', description: nls.localize('commentController', "The comment controller id associated with a comment thread") });

	/**
	 * The comment widget is focused.
	 */
	export const commentFocused = new RawContextKey<boolean>('commentFocused', false, { type: 'boolean', description: nls.localize('commentFocused', "Set when the comment is focused") });
}
