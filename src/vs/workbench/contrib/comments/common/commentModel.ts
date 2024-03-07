/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { Comment, CommentThread, CommentThreadChangedEvent, CommentThreadState } from 'vs/editor/common/languages';

export interface ICommentThreadChangedEvent extends CommentThreadChangedEvent<IRange> {
	uniqueOwner: string;
	owner: string;
	ownerLabel: string;
}

export class CommentNode {
	isRoot: boolean = false;
	replies: CommentNode[] = [];

	constructor(
		public readonly uniqueOwner: string,
		public readonly threadId: string,
		public readonly resource: URI,
		public readonly comment: Comment,
		public readonly range: IRange | undefined,
		public readonly threadState: CommentThreadState | undefined,
		public readonly contextValue: string | undefined,
		public readonly owner: string,
		public readonly controllerHandle: number,
		public readonly threadHandle: number) { }

	hasReply(): boolean {
		return this.replies && this.replies.length !== 0;
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
		const { threadId, comments, range } = commentThread;
		const commentNodes: CommentNode[] = comments!.map(comment => new CommentNode(uniqueOwner, threadId, resource, comment, range, commentThread.state, commentThread.contextValue, owner, commentThread.controllerHandle, commentThread.commentThreadHandle));
		if (commentNodes.length > 1) {
			commentNodes[0].replies = commentNodes.slice(1, commentNodes.length);
		}

		commentNodes[0].isRoot = true;

		return commentNodes[0];
	}
}

