/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { Comment, CommentThread, CommentThreadChangedEvent, CommentThreadState } from 'vs/editor/common/languages';

export interface ICommentThreadChangedEvent extends CommentThreadChangedEvent<IRange> {
	owner: string;
	ownerLabel: string;
}

export class CommentNode {
	owner: string;
	threadId: string;
	range: IRange | undefined;
	comment: Comment;
	replies: CommentNode[] = [];
	resource: URI;
	isRoot: boolean;
	threadState?: CommentThreadState;

	constructor(owner: string, threadId: string, resource: URI, comment: Comment, range: IRange | undefined, threadState: CommentThreadState | undefined) {
		this.owner = owner;
		this.threadId = threadId;
		this.comment = comment;
		this.resource = resource;
		this.range = range;
		this.isRoot = false;
		this.threadState = threadState;
	}

	hasReply(): boolean {
		return this.replies && this.replies.length !== 0;
	}
}

export class ResourceWithCommentThreads {
	id: string;
	owner: string;
	ownerLabel: string | undefined;
	commentThreads: CommentNode[]; // The top level comments on the file. Replys are nested under each node.
	resource: URI;

	constructor(owner: string, resource: URI, commentThreads: CommentThread[]) {
		this.owner = owner;
		this.id = resource.toString();
		this.resource = resource;
		this.commentThreads = commentThreads.filter(thread => thread.comments && thread.comments.length).map(thread => ResourceWithCommentThreads.createCommentNode(owner, resource, thread));
	}

	public static createCommentNode(owner: string, resource: URI, commentThread: CommentThread): CommentNode {
		const { threadId, comments, range } = commentThread;
		const commentNodes: CommentNode[] = comments!.map(comment => new CommentNode(owner, threadId!, resource, comment, range, commentThread.state));
		if (commentNodes.length > 1) {
			commentNodes[0].replies = commentNodes.slice(1, commentNodes.length);
		}

		commentNodes[0].isRoot = true;

		return commentNodes[0];
	}
}

