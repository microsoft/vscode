/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Comment } from './models/comment';
import { DIFF_HUNK_INFO } from './diff';
import { FileChange } from '../prProvider';

export function parseComments(comments: any[]): Comment[] {
	for (let i = 0; i < comments.length; i++) {
		let diff_hunk = comments[i].diff_hunk;
		let hunk_info = DIFF_HUNK_INFO.exec(diff_hunk);
		let oriStartLine = Number(hunk_info[1]);
		let oriLen = Number(hunk_info[3]) | 0;
		let startLine = Number(hunk_info[5]);
		let len = Number(hunk_info[7]) | 0;
		comments[i].diff_hunk_range = {
			originalStart: oriStartLine,
			originalLength: oriLen,
			start: startLine,
			length: len
		};
	}

	return comments;
}

export function getMatchingCommentsForDiffViewEditor(filePath: string, items: FileChange[], comments: Comment[]): Comment[] {
	let fileChangeItem = items.filter(item => filePath === path.resolve(item.workspaceRoot, item.filePath));

	if (fileChangeItem.length === 0) {
		return [];
	} else {
		let fileName = fileChangeItem[0].fileName;
		let matchingComments = comments.filter(comment => comment.path === fileName);

		return matchingComments;
	}
}

export function getMatchingCommentsForNormalEditor(filePath: string, workspaceRoot: string, comments: Comment[]): Comment[] {
	// @todo, we should check commit id
	let matchingComments = comments.filter(comment => path.resolve(workspaceRoot, comment.path) === filePath);
	return matchingComments;
}
