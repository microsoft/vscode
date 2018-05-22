/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Comment } from '../models/comment';
import { parseDiffHunk } from './diff';

export function parseComments(comments: any[]): Comment[] {
	for (let i = 0; i < comments.length; i++) {
		let diffHunks = [];
		let diffHunkReader = parseDiffHunk(comments[i].diff_hunk);
		let diffHunkIter = diffHunkReader.next();

		while (!diffHunkIter.done) {
			let diffHunk = diffHunkIter.value;
			diffHunks.push(diffHunk);
			diffHunkIter = diffHunkReader.next();
		}

		comments[i].diff_hunks = diffHunks;
	}

	return comments;
}