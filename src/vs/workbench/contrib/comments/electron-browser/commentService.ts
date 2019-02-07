/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentThread, DocumentCommentProvider, CommentThreadChangedEvent, CommentInfo, Comment, CommentReaction } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { keys } from 'vs/base/common/map';
import { CancellationToken } from 'vs/base/common/cancellation';
import { assign } from 'vs/base/common/objects';
import { ICommentThreadChangedEvent } from 'vs/workbench/contrib/comments/common/commentModel';

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
	registerDataProvider(owner: string, commentProvider: DocumentCommentProvider): void;
	unregisterDataProvider(owner: string): void;
	updateComments(ownerId: string, event: CommentThreadChangedEvent): void;
	createNewCommentThread(owner: string, resource: URI, range: Range, text: string): Promise<CommentThread | null>;
	replyToCommentThread(owner: string, resource: URI, range: Range, thread: CommentThread, text: string): Promise<CommentThread | null>;
	editComment(owner: string, resource: URI, comment: Comment, text: string): Promise<void>;
	deleteComment(owner: string, resource: URI, comment: Comment): Promise<boolean>;
	getComments(resource: URI): Promise<(ICommentInfo | null)[]>;
	startDraft(owner: string, resource: URI): void;
	deleteDraft(owner: string, resource: URI): void;
	finishDraft(owner: string, resource: URI): void;
	getStartDraftLabel(owner: string): string | undefined;
	getDeleteDraftLabel(owner: string): string | undefined;
	getFinishDraftLabel(owner: string): string | undefined;
	addReaction(owner: string, resource: URI, comment: Comment, reaction: CommentReaction): Promise<void>;
	deleteReaction(owner: string, resource: URI, comment: Comment, reaction: CommentReaction): Promise<void>;
	getReactionGroup(owner: string): CommentReaction[] | undefined;
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

	registerDataProvider(owner: string, commentProvider: DocumentCommentProvider): void {
		this._commentProviders.set(owner, commentProvider);
		this._onDidSetDataProvider.fire();
	}

	unregisterDataProvider(owner: string): void {
		this._commentProviders.delete(owner);
		this._onDidDeleteDataProvider.fire(owner);
	}

	updateComments(ownerId: string, event: CommentThreadChangedEvent): void {
		const evt: ICommentThreadChangedEvent = assign({}, event, { owner: ownerId });
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

		return Promise.resolve(undefined);
	}

	deleteComment(owner: string, resource: URI, comment: Comment): Promise<boolean> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return commentProvider.deleteComment(resource, comment, CancellationToken.None).then(() => true);
		}

		return Promise.resolve(false);
	}

	async startDraft(owner: string, resource: URI): Promise<void> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider && commentProvider.startDraft) {
			return commentProvider.startDraft(resource, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	async deleteDraft(owner: string, resource: URI): Promise<void> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider && commentProvider.deleteDraft) {
			return commentProvider.deleteDraft(resource, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	async finishDraft(owner: string, resource: URI): Promise<void> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider && commentProvider.finishDraft) {
			return commentProvider.finishDraft(resource, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	async addReaction(owner: string, resource: URI, comment: Comment, reaction: CommentReaction): Promise<void> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider && commentProvider.addReaction) {
			return commentProvider.addReaction(resource, comment, reaction, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	async deleteReaction(owner: string, resource: URI, comment: Comment, reaction: CommentReaction): Promise<void> {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider && commentProvider.deleteReaction) {
			return commentProvider.deleteReaction(resource, comment, reaction, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	getReactionGroup(owner: string): CommentReaction[] | undefined {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return commentProvider.reactionGroup;
		}

		return undefined;
	}

	getStartDraftLabel(owner: string): string | undefined {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return commentProvider.startDraftLabel;
		}

		return undefined;
	}

	getDeleteDraftLabel(owner: string): string | undefined {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return commentProvider.deleteDraftLabel;
		}

		return undefined;
	}

	getFinishDraftLabel(owner: string): string | undefined {
		const commentProvider = this._commentProviders.get(owner);

		if (commentProvider) {
			return commentProvider.finishDraftLabel;
		}

		return undefined;
	}

	getComments(resource: URI): Promise<(ICommentInfo | null)[]> {
		const result: Promise<ICommentInfo | null>[] = [];
		for (const owner of keys(this._commentProviders)) {
			const provider = this._commentProviders.get(owner);
			if (provider && provider.provideDocumentComments) {
				result.push(provider.provideDocumentComments(resource, CancellationToken.None).then(commentInfo => {
					if (commentInfo) {
						return <ICommentInfo>{
							owner: owner,
							threads: commentInfo.threads,
							commentingRanges: commentInfo.commentingRanges,
							reply: commentInfo.reply,
							draftMode: commentInfo.draftMode
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
