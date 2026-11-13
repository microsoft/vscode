/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ICommentsConfiguration {
	openView: 'never' | 'file' | 'firstFile' | 'firstFileUnresolved';
	useRelativeTime: boolean;
	visible: boolean;
	maxHeight: boolean;
	collapseOnResolve: boolean;
}

export const COMMENTS_SECTION = 'comments';

export const COMMENTS_THREAD_EXPERIMENTAL_STYLE_SETTING = 'comments.thread.experimental.style';

/**
 * How comment threads are shown in the editor: between the lines of code, or floating above them.
 */
export type CommentThreadStyle = 'inline' | 'floating';
