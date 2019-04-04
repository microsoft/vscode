/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentThreadChangedEvent, CommentInfo, Comment, CommentReaction, CommentingRanges, CommentThread } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';
import { assign } from 'vs/base/common/objects';
import { ICommentThreadChangedEvent } from 'vs/workbench/contrib/comments/common/commentModel';
import { MainThreadCommentController } from 'vs/workbench/api/browser/mainThreadComments';

export const ICommentService = createDecorator<ICommentService>('commentService');

export interface IResourceCommentThreadEvent {
	resource: URI;
	commentInfos: ICommentInfo[];
}

export interface ICommentInfo extends CommentInfo {
	owner: string;
	label?: string;
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
	readonly onDidChangeActiveCommentThread: Event<CommentThread | null>;
	readonly onDidChangeActiveCommentingRange: Event<{ range: Range, commentingRangesInfo: CommentingRanges }>;
	readonly onDidChangeInput: Event<string>;
	registerCommentController(owner: string, commentControl: MainThreadCommentController): void;
	unregisterCommentController(owner: string): void;
	setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void;
	updateComments(ownerId: string, event: CommentThreadChangedEvent): void;
	getComments(resource: URI): Promise<(ICommentInfo | null)[]>;
	getCommentingRanges(resource: URI): Promise<IRange[]>;
	getReactionGroup(owner: string): CommentReaction[] | undefined;
	toggleReaction(owner: string, resource: URI, thread: CommentThread, comment: Comment, reaction: CommentReaction): Promise<void>;
	setActiveCommentThread(commentThread: CommentThread | null): void;
	setInput(input: string): void;
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

	private readonly _onDidChangeActiveCommentThread = this._register(new Emitter<CommentThread | null>());
	readonly onDidChangeActiveCommentThread: Event<CommentThread | null> = this._onDidChangeActiveCommentThread.event;

	private readonly _onDidChangeInput: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidChangeInput: Event<string> = this._onDidChangeInput.event;
	private readonly _onDidChangeActiveCommentingRange: Emitter<{
		range: Range, commentingRangesInfo:
		CommentingRanges
	}> = this._register(new Emitter<{
		range: Range, commentingRangesInfo:
		CommentingRanges
	}>());
	readonly onDidChangeActiveCommentingRange: Event<{ range: Range, commentingRangesInfo: CommentingRanges }> = this._onDidChangeActiveCommentingRange.event;

	private _commentControls = new Map<string, MainThreadCommentController>();

	constructor() {
		super();
	}

	setActiveCommentThread(commentThread: CommentThread | null) {
		this._onDidChangeActiveCommentThread.fire(commentThread);
	}

	setInput(input: string) {
		this._onDidChangeInput.fire(input);
	}

	registerCommentController(owner: string, commentControl: MainThreadCommentController): void {
		this._commentControls.set(owner, commentControl);
		this._onDidSetDataProvider.fire();
	}

	unregisterCommentController(owner: string): void {
		this._commentControls.delete(owner);
		this._onDidDeleteDataProvider.fire(owner);
	}

	updateComments(ownerId: string, event: CommentThreadChangedEvent): void {
		const evt: ICommentThreadChangedEvent = assign({}, event, { owner: ownerId });
		this._onDidUpdateCommentThreads.fire(evt);
	}

	setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void {
		this._onDidSetAllCommentThreads.fire({ ownerId: owner, commentThreads: commentsByResource });
	}

	async toggleReaction(owner: string, resource: URI, thread: CommentThread, comment: Comment, reaction: CommentReaction): Promise<void> {
		const commentController = this._commentControls.get(owner);

		if (commentController) {
			return commentController.toggleReaction(resource, thread, comment, reaction, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	getReactionGroup(owner: string): CommentReaction[] | undefined {
		const commentProvider = this._commentControls.get(owner);

		if (commentProvider) {
			return commentProvider.getReactionGroup();
		}

		const commentController = this._commentControls.get(owner);

		if (commentController) {
			return commentController.getReactionGroup();
		}

		return undefined;
	}

	async getComments(resource: URI): Promise<(ICommentInfo | null)[]> {
		let commentControlResult: Promise<ICommentInfo>[] = [];

		this._commentControls.forEach(control => {
			commentControlResult.push(control.getDocumentComments(resource, CancellationToken.None));
		});

		let ret = await Promise.all(commentControlResult);

		return ret;
	}

	async getCommentingRanges(resource: URI): Promise<IRange[]> {
		let commentControlResult: Promise<IRange[]>[] = [];

		this._commentControls.forEach(control => {
			commentControlResult.push(control.getCommentingRanges(resource, CancellationToken.None));
		});

		let ret = await Promise.all(commentControlResult);
		return ret.reduce((prev, curr) => { prev.push(...curr); return prev; }, []);
	}
}
