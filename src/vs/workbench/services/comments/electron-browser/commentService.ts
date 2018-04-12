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

export class ResourceCommentThread {
	id: string;
	comments: CommentNode[];

	constructor(commentThread: CommentThread) {
		this.id = commentThread.threadId;
		this.comments = this.createCommentNodes(commentThread.comments);
	}

	private createCommentNodes(comments: Comment[]): CommentNode[] {
		const commentNodes: CommentNode[] = comments.map(comment => new CommentNode(comment));
		for (var i = 0; i < commentNodes.length - 1; i++) {
			const commentNode = commentNodes[i];
			commentNode.reply = commentNodes[i + 1];
		}

		commentNodes.push(new CommentNode(comments[comments.length - 1]));

		return commentNodes;
	}
}

export class CommentsModel {
	commentThreads: ResourceCommentThread[];

	constructor() {
		this.commentThreads = [];
	}

	// TODO: Should have an additional level of nesting, mapping file to comment threads
	public setCommentThreads(commentThreads: CommentThread[]) {
		this.commentThreads = commentThreads.map(commentThread => new ResourceCommentThread(commentThread));
	}
}

export interface ICommentService {
	_serviceBrand: any;
	readonly commentsModel;
	readonly onDidChangeCommentThreads: Event<null>;
	updateComments(commentThreads: CommentThread[]);
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

	updateComments(commentThreads: CommentThread[]): TPromise<void> {
		this.commentsModel.setCommentThreads(commentThreads);
		this._onDidChangeCommentThreads.fire();
		return TPromise.as(null);
	}
}
