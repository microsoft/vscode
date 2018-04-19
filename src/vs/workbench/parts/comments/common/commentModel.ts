/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { Comment, CommentThread, CommentThreadChangedEvent } from 'vs/editor/common/modes';
import { groupBy, firstIndex } from 'vs/base/common/arrays';
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

export class ResourceWithCommentThreads {
	id: string;
	comments: CommentNode[]; // The top level comments on the file. Replys are nested under each node.
	resource: URI;

	constructor(resource: URI, commentThreads: CommentThread[]) {
		this.id = resource.toString();
		this.resource = resource;
		this.comments = commentThreads.map(thread => ResourceWithCommentThreads.createCommentNode(resource, thread));
	}

	public static createCommentNode(resource: URI, commentThread: CommentThread): CommentNode {
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
	resourceCommentThreads: ResourceWithCommentThreads[];

	constructor() {
		this.resourceCommentThreads = [];
	}

	public setCommentThreads(commentThreads: CommentThread[]): void {
		this.resourceCommentThreads = [];
		this.addCommentThreads(commentThreads);
	}

	public updateCommentThreads(event: CommentThreadChangedEvent): void {
		event.removed.forEach(thread => {
			// Find resource that has the comment thread
			const matchingResourceIndex = firstIndex(this.resourceCommentThreads, (resourceData) => resourceData.id === thread.resource);
			const matchingResourceData = this.resourceCommentThreads[matchingResourceIndex];

			// Find comment node on resource that is that thread and remove it
			const index = firstIndex(matchingResourceData.comments, (commentNode) => commentNode.threadId === thread.threadId);
			matchingResourceData.comments.splice(index, 1);

			// If the comment thread was the last thread for a resource, remove that resource from the list
			if (matchingResourceData.comments.length === 0) {
				this.resourceCommentThreads.splice(matchingResourceIndex, 1);
			}
		});

		event.changed.forEach(thread => {
			// Find resource that has the comment thread
			const matchingResourceIndex = firstIndex(this.resourceCommentThreads, (resourceData) => resourceData.id === thread.resource);
			const matchingResourceData = this.resourceCommentThreads[matchingResourceIndex];

			// Find comment node on resource that is that thread and replace it
			const index = firstIndex(matchingResourceData.comments, (commentNode) => commentNode.threadId === thread.threadId);
			matchingResourceData.comments[index] = ResourceWithCommentThreads.createCommentNode(matchingResourceData.resource, thread);
		});

		this.addCommentThreads(event.added);
	}

	public hasCommentThreads(): boolean {
		return !!this.resourceCommentThreads.length;
	}

	public getMessage(): string {
		if (!this.resourceCommentThreads.length) {
			return localize('noComments', "There are no comments on this review.");
		} else {
			return '';
		}
	}

	private addCommentThreads(commentThreads: CommentThread[]): void {
		const commentThreadsByResource = new Map<string, ResourceWithCommentThreads>();
		for (const group of groupBy(commentThreads, CommentsModel._compareURIs)) {
			commentThreadsByResource.set(group[0].resource, new ResourceWithCommentThreads(URI.parse(group[0].resource), group));
		}

		commentThreadsByResource.forEach((v, i, m) => {
			this.resourceCommentThreads.push(v);
		});
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