/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentThread, DocumentCommentProvider, CommentThreadChangedEvent, CommentInfo, Comment } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { keys } from 'vs/base/common/map';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionCommentProviderHandler } from 'vs/workbench/api/electron-browser/mainThreadComments';
import { assign } from 'vs/base/common/objects';
import { ICommentThreadChangedEvent } from 'vs/workbench/parts/comments/common/commentModel';

export const ICommentService = createDecorator<ICommentService>('commentService');

export interface IResourceCommentThreadEvent {
	resource: URI;
	commentInfos: ICommentInfo[];
}

export interface ICommentInfo extends CommentInfo {
	owner: string;
}

export interface IWorkspaceCommentThreadsEvent {
	ownerId: string;
	commentThreads: CommentThread[];
}

export interface ICommentService {
	_serviceBrand: any;
	readonly onDidSetResourceCommentInfos: Event<IResourceCommentThreadEvent>;
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent>;
	readonly onDidUpdateCommentThreads: Event<ICommentThreadChangedEvent>;
	readonly onDidSetDataProvider: Event<void>;
	readonly onDidDeleteDataProvider: Event<string>;
	setDocumentComments(resource: URI, commentInfos: ICommentInfo[]): void;
	setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void;
	removeWorkspaceComments(owner: string): void;
	registerDataProvider(owner: string, commentProvider: ExtensionCommentProviderHandler): void;
	unregisterDataProvider(owner: string): void;
	updateComments(ownerId: string, event: CommentThreadChangedEvent): void;
	createNewCommentThread(owner: string, resource: URI, range: Range, text: string): Promise<CommentThread | null>;
	replyToCommentThread(owner: string, resource: URI, range: Range, thread: CommentThread, text: string): Promise<CommentThread | null>;
	editComment(owner: string, resource: URI, comment: Comment, text: string): Promise<void>;
	deleteComment(owner: string, resource: URI, comment: Comment): Promise<boolean>;
	getComments(resource: URI): Promise<ICommentInfo[]>;
}

export class CommentService extends Disposable implements ICommentService {
	_serviceBrand: any;

	private readonly _onDidSetDataProvider: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidSetDataProvider: Event<void> = this._onDidSetDataProvider.event;

	private readonly _onDidDeleteDataProvider: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidDeleteDataProvider: Event<string> = this._onDidDeleteDataProvider.event;

	private readonly _onDidSetResourceCommentInfos: Emitter<IResourceCommentThreadEvent> = this._register(new Emitter<IResourceCommentThreadEvent>());
	readonly onDidSetResourceCommentInfos: Event<IResourceCommentThreadEvent> = this._onDidSetResourceCommentInfos.event;

	private readonly _onDidSetAllCommentThreads: Emitter<IWorkspaceCommentThreadsEvent> = this._register(new Emitter<IWorkspaceCommentThreadsEvent>());
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent> = this._onDidSetAllCommentThreads.event;

	private readonly _onDidUpdateCommentThreads: Emitter<ICommentThreadChangedEvent> = this._register(new Emitter<ICommentThreadChangedEvent>());
	readonly onDidUpdateCommentThreads: Event<ICommentThreadChangedEvent> = this._onDidUpdateCommentThreads.event;

	private _commentProviders = new Map<string, DocumentCommentProvider>();

	constructor() {
		super();
	}

	setDocumentComments(resource: URI, commentInfos: ICommentInfo[]): void {
		this._onDidSetResourceCommentInfos.fire({ resource, commentInfos });
	}

	setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void {
		this._onDidSetAllCommentThreads.fire({ ownerId: owner, commentThreads: commentsByResource });
	}

	removeWorkspaceComments(owner: string): void {
		this._onDidSetAllCommentThreads.fire({ ownerId: owner, commentThreads: [] });
	}

	registerDataProvider(owner: string, commentProvider: DocumentCommentProvider) {
		this._commentProviders.set(owner, commentProvider);
		this._onDidSetDataProvider.fire();
	}

	unregisterDataProvider(owner: string): void {
		this._commentProviders.delete(owner);
		this._onDidDeleteDataProvider.fire(owner);
	}

	updateComments(ownerId: string, event: CommentThreadChangedEvent): void {
		const evt = assign({}, event, { ownerId });
		this._onDidUpdateCommentThreads.fire(evt);
	}

	async createNewCommentThread(owner: string, resource: URI, range: Range, text: string): Promise<CommentThread | null> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return await commentProvider.createNewCommentThread(resource, range, text, CancellationToken.None);
		}

		return null;
	}

	async replyToCommentThread(owner: string, resource: URI, range: Range, thread: CommentThread, text: string): Promise<CommentThread | null> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return await commentProvider.replyToCommentThread(resource, range, thread, text, CancellationToken.None);
		}

		return null;
	}

	editComment(owner: string, resource: URI, comment: Comment, text: string): Promise<void> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return commentProvider.editComment(resource, comment, text, CancellationToken.None);
		}

		return Promise.resolve(void 0);
	}

	deleteComment(owner: string, resource: URI, comment: Comment): Promise<boolean> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return commentProvider.deleteComment(resource, comment, CancellationToken.None).then(() => true);
		}

		return Promise.resolve(false);
	}

	getComments(resource: URI): Promise<ICommentInfo[]> {
		const result: Promise<ICommentInfo>[] = [];
		for (const owner of keys(this._commentProviders)) {
			const provider = this._commentProviders.get(owner);
			if (provider.provideDocumentComments) {
				result.push(provider.provideDocumentComments(resource, CancellationToken.None).then(commentInfo => {
					if (commentInfo) {
						return <ICommentInfo>{
							owner: owner,
							threads: commentInfo.threads,
							commentingRanges: commentInfo.commentingRanges,
							reply: commentInfo.reply
						};
					} else {
						return null;
					}
				}));
			}
		}

		return Promise.all(result);
	}
}
