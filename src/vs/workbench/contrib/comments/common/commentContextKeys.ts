/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';


export namespace CommentContextKeys {
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
}
