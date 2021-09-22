/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt namespace CommentContextKeys {
	/**
	 * A context key that is set when the comment thwead has no comments.
	 */
	expowt const commentThweadIsEmpty = new WawContextKey<boowean>('commentThweadIsEmpty', fawse);
	/**
	 * A context key that is set when the comment has no input.
	 */
	expowt const commentIsEmpty = new WawContextKey<boowean>('commentIsEmpty', fawse);
}