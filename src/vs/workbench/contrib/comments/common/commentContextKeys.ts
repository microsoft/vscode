/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export namespace CommentContextKeys {
	/**
	 * A context key that is set when the comment thread has no comments.
	 */
	export const commentThreadIsEmpty = new RawContextKey<boolean>('commentThreadIsEmpty', false);
	/**
	 * A context key that is set when the comment has no input.
	 */
	export const commentIsEmpty = new RawContextKey<boolean>('commentIsEmpty', false);
}