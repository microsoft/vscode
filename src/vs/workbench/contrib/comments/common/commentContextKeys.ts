/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export namespace CommentContextKeys {
	/**
	 * A context key that is set when the editor's text has focus (cursor is blinking).
	 */
	export const commentThreadIsEmpty = new RawContextKey<boolean>('commentThreadIsEmpty', false);
	/**
	 * A context key that is set when the editor's text or an editor's widget has focus.
	 */
	export const commentIsEmpty = new RawContextKey<boolean>('commentIsEmpty', false);
}