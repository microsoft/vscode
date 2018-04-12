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

export const ICommentService = createDecorator<ICommentService>('commentService');

export class CommentNode {
	comment: Comment;
	reply: CommentNode;

	constructor(comment: Comment) {
		this.comment = comment;
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
		this.id = Math.random().toString();
		this.resource = resource;
		this.comments = commentThreads.map(thread => this.createCommentNode(thread.comments));
	}

	private createCommentNode(comments: Comment[]): CommentNode {
		const commentNodes: CommentNode[] = comments.map(comment => new CommentNode(comment));
		for (var i = 0; i < commentNodes.length - 1; i++) {
			const commentNode = commentNodes[i];
			commentNode.reply = commentNodes[i + 1];
		}

		commentNodes.push(new CommentNode(comments[comments.length - 1]));

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

	// TODO: Should have an additional level of nesting, mapping file to comment threads
	public setCommentThreadsForResource(resource: URI, commentThreads: CommentThread[]) {
		this.commentThreadsByResource.set(resource.toString(), new ResourceCommentThreads(resource, commentThreads));
		this.commentThreads = [];
		this.commentThreadsByResource.forEach((v, i, m) => {
			this.commentThreads.push(v);
		});
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
		this.commentsModel.setCommentThreadsForResource(resource, commentThreads);
		this._onDidChangeCommentThreads.fire();
		return TPromise.as(null);
	}
}
