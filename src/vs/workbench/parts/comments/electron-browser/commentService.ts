/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CommentThread, DocumentCommentProvider, CommentThreadChangedEvent, CommentInfo, WorkspaceCommentProvider } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { TPromise } from 'vs/base/common/winjs.base';
import { asWinJsPromise } from 'vs/base/common/async';
import { keys } from 'vs/base/common/map';

export const ICommentService = createDecorator<ICommentService>('commentService');

export interface IResourceCommentThreadEvent {
	resource: URI;
	commentInfos: CommentInfo[];
}

export interface IWorkspaceCommentThreadsEvent {
	ownerId: number;
	commentThreads: CommentThread[];
}

export interface ICommentService {
	_serviceBrand: any;
	readonly onDidSetResourceCommentInfos: Event<IResourceCommentThreadEvent>;
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent>;
	readonly onDidUpdateCommentThreads: Event<CommentThreadChangedEvent>;
	readonly onDidSetDataProvider: Event<void>;
	readonly onDidDeleteDataProvider: Event<number>;
	setDocumentComments(resource: URI, commentInfos: CommentInfo[]): void;
	setWorkspaceComments(owner: number, commentsByResource: CommentThread[]): void;
	removeWorkspaceComments(owner: number): void;
	registerDataProvider(owner: number, commentProvider: DocumentCommentProvider | WorkspaceCommentProvider): void;
	unregisterDataProvider(owner: number): void;
	updateComments(event: CommentThreadChangedEvent): void;
	createNewCommentThread(owner: number, resource: URI, range: Range, text: string): TPromise<CommentThread>;
	replyToCommentThread(owner: number, resource: URI, range: Range, thread: CommentThread, text: string): TPromise<CommentThread>;
	getComments(resource: URI): TPromise<CommentInfo[]>;
}

export class CommentService extends Disposable implements ICommentService {
	_serviceBrand: any;

	private readonly _onDidSetDataProvider: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidSetDataProvider: Event<void> = this._onDidSetDataProvider.event;

	private readonly _onDidDeletetDataProvider: Emitter<number> = this._register(new Emitter<number>());
	readonly onDidDeleteDataProvider: Event<number> = this._onDidDeletetDataProvider.event;

	private readonly _onDidSetResourceCommentInfos: Emitter<IResourceCommentThreadEvent> = this._register(new Emitter<IResourceCommentThreadEvent>());
	readonly onDidSetResourceCommentInfos: Event<IResourceCommentThreadEvent> = this._onDidSetResourceCommentInfos.event;

	private readonly _onDidSetAllCommentThreads: Emitter<IWorkspaceCommentThreadsEvent> = this._register(new Emitter<IWorkspaceCommentThreadsEvent>());
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent> = this._onDidSetAllCommentThreads.event;

	private readonly _onDidUpdateCommentThreads: Emitter<CommentThreadChangedEvent> = this._register(new Emitter<CommentThreadChangedEvent>());
	readonly onDidUpdateCommentThreads: Event<CommentThreadChangedEvent> = this._onDidUpdateCommentThreads.event;

	private _commentProviders = new Map<number, DocumentCommentProvider>();

	constructor() {
		super();
	}

	setDocumentComments(resource: URI, commentInfos: CommentInfo[]): void {
		this._onDidSetResourceCommentInfos.fire({ resource, commentInfos });
	}

	setWorkspaceComments(owner: number, commentsByResource: CommentThread[]): void {
		this._onDidSetAllCommentThreads.fire({ ownerId: owner, commentThreads: commentsByResource });
	}

	removeWorkspaceComments(owner: number): void {
		this._onDidSetAllCommentThreads.fire({ ownerId: owner, commentThreads: [] });
	}

	registerDataProvider(owner: number, commentProvider: DocumentCommentProvider) {
		this._commentProviders.set(owner, commentProvider);
		this._onDidSetDataProvider.fire();
	}

	unregisterDataProvider(owner: number): void {
		this._commentProviders.delete(owner);
		this._onDidDeletetDataProvider.fire(owner);
	}

	updateComments(event: CommentThreadChangedEvent): void {
		this._onDidUpdateCommentThreads.fire(event);
	}

	createNewCommentThread(owner: number, resource: URI, range: Range, text: string): TPromise<CommentThread> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return asWinJsPromise(token => commentProvider.createNewCommentThread(resource, range, text, token));
		}

		return null;
	}

	replyToCommentThread(owner: number, resource: URI, range: Range, thread: CommentThread, text: string): TPromise<CommentThread> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return asWinJsPromise(token => commentProvider.replyToCommentThread(resource, range, thread, text, token));
		}

		return null;
	}

	getComments(resource: URI): TPromise<CommentInfo[]> {
		const result = [];
		for (const handle of keys(this._commentProviders)) {
			const provider = this._commentProviders.get(handle);
			if ((<DocumentCommentProvider>provider).provideDocumentComments) {
				result.push(asWinJsPromise(token => (<DocumentCommentProvider>provider).provideDocumentComments(resource, token)));
			}
		}

		return TPromise.join(result);
	}
}
