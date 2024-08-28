/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { Comment, CommentThread, CommentThreadChangedEvent, CommentThreadApplicability, CommentThreadState } from 'vs/editor/common/languages';

export interface ICommentThreadChangedEvent extends CommentThreadChangedEvent<IRange> {
	uniqueOwner: string;
	owner: string;
	ownerLabel: string;
}

export class CommentNode {
	isRoot: boolean = false;
	replies: CommentNode[] = [];
	public readonly threadId: string;
	public readonly range: IRange | undefined;
	public readonly threadState: CommentThreadState | undefined;
	public readonly threadRelevance: CommentThreadApplicability | undefined;
	public readonly contextValue: string | undefined;
	public readonly controllerHandle: number;
	public readonly threadHandle: number;

	constructor(
		public readonly uniqueOwner: string,
		public readonly owner: string,
		public readonly resource: URI,
		public readonly comment: Comment,
		public readonly thread: CommentThread) {
		this.threadId = thread.threadId;
		this.range = thread.range;
		this.threadState = thread.state;
		this.threadRelevance = thread.applicability;
		this.contextValue = thread.contextValue;
		this.controllerHandle = thread.controllerHandle;
		this.threadHandle = thread.commentThreadHandle;
	}

	hasReply(): boolean {
		return this.replies && this.replies.length !== 0;
	}

	private _lastUpdatedAt: string | undefined;

	get lastUpdatedAt(): string {
		if (this._lastUpdatedAt === undefined) {
			let updatedAt = this.comment.timestamp || '';
			if (this.replies.length) {
				const reply = this.replies[this.replies.length - 1];
				const replyUpdatedAt = reply.lastUpdatedAt;
				if (replyUpdatedAt > updatedAt) {
					updatedAt = replyUpdatedAt;
				}
			}
			this._lastUpdatedAt = updatedAt;
		}
		return this._lastUpdatedAt;
	}
}

export class ResourceWithCommentThreads {
	id: string;
	uniqueOwner: string;
	owner: string;
	ownerLabel: string | undefined;
	commentThreads: CommentNode[]; // The top level comments on the file. Replys are nested under each node.
	resource: URI;

	constructor(uniqueOwner: string, owner: string, resource: URI, commentThreads: CommentThread[]) {
		this.uniqueOwner = uniqueOwner;
		this.owner = owner;
		this.id = resource.toString();
		this.resource = resource;
		this.commentThreads = commentThreads.filter(thread => thread.comments && thread.comments.length).map(thread => ResourceWithCommentThreads.createCommentNode(uniqueOwner, owner, resource, thread));
	}

	public static createCommentNode(uniqueOwner: string, owner: string, resource: URI, commentThread: CommentThread): CommentNode {
		const { comments } = commentThread;
		const commentNodes: CommentNode[] = comments!.map(comment => new CommentNode(uniqueOwner, owner, resource, comment, commentThread));
		if (commentNodes.length > 1) {
			commentNodes[0].replies = commentNodes.slice(1, commentNodes.length);
		}

		commentNodes[0].isRoot = true;

		return commentNodes[0];
	}

	private _lastUpdatedAt: string | undefined;

	get lastUpdatedAt() {
		if (this._lastUpdatedAt === undefined) {
			let updatedAt = '';
			// Return result without cahcing as we expect data to arrive later
			if (!this.commentThreads.length) {
				return updatedAt;
			}
			for (const thread of this.commentThreads) {
				const threadUpdatedAt = thread.lastUpdatedAt;
				if (threadUpdatedAt && threadUpdatedAt > updatedAt) {
					updatedAt = threadUpdatedAt;
				}
			}
			this._lastUpdatedAt = updatedAt;
		}
		return this._lastUpdatedAt;
	}
}

