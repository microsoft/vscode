/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';


import { TPromise } from 'vs/base/common/winjs.base';
import { CommentThread, Comment } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';

export const ICommentService = createDecorator<ICommentService>('commentService');

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
	commentThreadsByResource: Map<string, ResourceCommentThreads>;

	constructor() {
		this.commentThreads = [];
		this.commentThreadsByResource = new Map<string, ResourceCommentThreads>();
	}


	public setCommentThreadsForResource(resource: URI, commentThreads: CommentThread[]): boolean {
		if (!commentThreads.length || this.commentThreadsByResource.get(resource.toString())) {
			return false;
		}

		this.commentThreadsByResource.set(resource.toString(), new ResourceCommentThreads(resource, commentThreads));
		this.commentThreads = [];
		this.commentThreadsByResource.forEach((v, i, m) => {
			this.commentThreads.push(v);
		});

		return true;
	}
}

export interface ICommentService {
	_serviceBrand: any;
	readonly commentsModel;
	readonly onDidChangeCommentThreads: Event<null>;
	setCommentsForResource(resource: URI, commentThreads: CommentThread[]);
}

export class CommentService extends Disposable implements ICommentService {
	_serviceBrand: any;

	commentsModel: CommentsModel;

	private readonly _onDidChangeCommentThreads: Emitter<null> = this._register(new Emitter<null>());
	readonly onDidChangeCommentThreads: Event<null> = this._onDidChangeCommentThreads.event;

	constructor() {
		super();
		this.commentsModel = new CommentsModel();
	}

	setCommentsForResource(resource: URI, commentThreads: CommentThread[]): TPromise<void> {
		if (this.commentsModel.setCommentThreadsForResource(resource, commentThreads)) {
			this._onDidChangeCommentThreads.fire();
		}

		return TPromise.as(null);
	}
}
