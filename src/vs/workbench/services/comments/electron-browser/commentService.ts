/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CommentThread } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';

export const ICommentService = createDecorator<ICommentService>('commentService');

export interface IResourceCommentThreadEvent {
	resource: URI;
	commentThreads: CommentThread[];
}

export interface ICommentService {
	_serviceBrand: any;
	readonly onDidSetResourceCommentThreads: Event<IResourceCommentThreadEvent>;
	readonly onDidSetAllCommentThreads: Event<CommentThread[]>;
	setComments(resource: URI, commentThreads: CommentThread[]): void;
	setAllComments(commentsByResource: CommentThread[]): void;
	removeAllComments(): void;
}

export class CommentService extends Disposable implements ICommentService {
	_serviceBrand: any;

	private readonly _onDidSetResourceCommentThreads: Emitter<IResourceCommentThreadEvent> = this._register(new Emitter<IResourceCommentThreadEvent>());
	readonly onDidSetResourceCommentThreads: Event<IResourceCommentThreadEvent> = this._onDidSetResourceCommentThreads.event;

	private readonly _onDidSetAllCommentThreads: Emitter<CommentThread[]> = this._register(new Emitter<CommentThread[]>());
	readonly onDidSetAllCommentThreads: Event<CommentThread[]> = this._onDidSetAllCommentThreads.event;

	constructor() {
		super();
	}


	setComments(resource: URI, commentThreads: CommentThread[]): void {
		this._onDidSetResourceCommentThreads.fire({ resource, commentThreads });
	}

	setAllComments(commentsByResource: CommentThread[]): void {
		this._onDidSetAllCommentThreads.fire(commentsByResource);
	}

	removeAllComments(): void {
		this._onDidSetAllCommentThreads.fire([]);
	}
}
