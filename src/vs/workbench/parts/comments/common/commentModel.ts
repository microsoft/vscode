/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { Comment, CommentThread } from 'vs/editor/common/modes';
import { groupBy } from 'vs/base/common/arrays';
import { localize } from 'vs/nls';

export class CommentNode {
	threadId: string;
	range: IRange;
	comment: Comment;
	reply: CommentNode;
	resource: URI;

	constructor(threadId: string, resource: URI, comment: Comment, range: IRange) {
		this.threadId = threadId;
		this.comment = comment;
		this.resource = resource;
		this.range = range;
	}

	hasReply(): boolean {
		return !!this.reply;
	}
}

export class ResourceCommentThreads {
	id: string;
	comments: CommentNode[]; // The top level comments on the file. Replys are nested under each node.
	resource: URI;

	constructor(resource: URI, commentThreads: CommentThread[]) {
		this.id = resource.toString();
		this.resource = resource;
		this.comments = commentThreads.map(thread => this.createCommentNode(resource, thread));
	}

	private createCommentNode(resource: URI, commentThread: CommentThread): CommentNode {
		const { threadId, comments, range } = commentThread;
		const commentNodes: CommentNode[] = comments.map(comment => new CommentNode(threadId, resource, comment, range));
		for (var i = 0; i < commentNodes.length - 1; i++) {
			const commentNode = commentNodes[i];
			commentNode.reply = commentNodes[i + 1];
		}

		commentNodes.push(new CommentNode(threadId, resource, comments[comments.length - 1], range));

		return commentNodes[0];
	}
}

export class CommentsModel {
	commentThreads: ResourceCommentThreads[];

	constructor() {
		this.commentThreads = [];
	}

	public setCommentThreads(commentThreads: CommentThread[]): void {
		const commentThreadsByResource = new Map<string, ResourceCommentThreads>();
		for (const group of groupBy(commentThreads, CommentsModel._compareURIs)) {
			commentThreadsByResource.set(group[0].resource, new ResourceCommentThreads(URI.parse(group[0].resource), group));
		}

		this.commentThreads = [];
		commentThreadsByResource.forEach((v, i, m) => {
			this.commentThreads.push(v);
		});
	}

	public hasCommentThreads(): boolean {
		return !!this.commentThreads.length;
	}

	public getMessage(): string {
		if (!this.commentThreads.length) {
			return localize('noComments', "There are no comments on this review.");
		} else {
			return '';
		}
	}

	private static _compareURIs(a: CommentThread, b: CommentThread) {
		const resourceA = a.resource.toString();
		const resourceB = b.resource.toString();
		if (resourceA < resourceB) {
			return -1;
		} else if (resourceA > resourceB) {
			return 1;
		} else {
			return 0;
		}
	}
}