/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { keys } from 'vs/base/common/map';
import { ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThreadCommentsShape, CommentProviderFeatures } from '../common/extHost.protocol';
import { ICommentService, ICommentInfo } from 'vs/workbench/contrib/comments/browser/commentService';
import { COMMENTS_PANEL_ID, CommentsPanel, COMMENTS_PANEL_TITLE } from 'vs/workbench/contrib/comments/browser/commentsPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { Registry } from 'vs/platform/registry/common/platform';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { IRange } from 'vs/editor/common/core/range';
import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';

export class MainThreadCommentThread implements modes.CommentThread {
	private _input?: modes.CommentInput;
	get input(): modes.CommentInput | undefined {
		return this._input;
	}

	set input(value: modes.CommentInput | undefined) {
		this._input = value;
		this._onDidChangeInput.fire(value);
	}

	private _onDidChangeInput = new Emitter<modes.CommentInput | undefined>();
	get onDidChangeInput(): Event<modes.CommentInput | undefined> { return this._onDidChangeInput.event; }

	public label: string;

	public comments: modes.Comment[];

	public acceptInputCommand: modes.Command | undefined;

	public additionalCommands: modes.Command[] | undefined;

	public deleteCommand: modes.Command | undefined;


	private _collapsibleState: modes.CommentThreadCollapsibleState | undefined;
	get collapsibleState() {
		return this._collapsibleState;
	}

	set collapsibleState(newState: modes.CommentThreadCollapsibleState | undefined) {
		this._collapsibleState = newState;
		this._onDidChangeCollasibleState.fire(this._collapsibleState);
	}

	private _onDidChangeCollasibleState = new Emitter<modes.CommentThreadCollapsibleState | undefined>();
	public onDidChangeCollasibleState = this._onDidChangeCollasibleState.event;

	constructor(
		public commentThreadHandle: number,
		public controller: MainThreadCommentController,
		public extensionId: string,
		public threadId: string,
		public resource: string,
		public range: IRange
	) { }

	batchUpdate(
		range: IRange,
		label: string,
		comments: modes.Comment[],
		acceptInputCommand: modes.Command | undefined,
		additionalCommands: modes.Command[],
		deleteCommand: modes.Command | undefined,
		collapsibleState: modes.CommentThreadCollapsibleState) {
		this.range = range;
		this.label = label;
		this.comments = comments;
		this.acceptInputCommand = acceptInputCommand;
		this.additionalCommands = additionalCommands;
		this.deleteCommand = deleteCommand;
		this._collapsibleState = collapsibleState;
	}

	dispose() { }

	toJSON(): any {
		return {
			$mid: 7,
			commentControlHandle: this.controller.handle,
			commentThreadHandle: this.commentThreadHandle,
		};
	}
}

export class MainThreadCommentController {
	get handle(): number {
		return this._handle;
	}

	get id(): string {
		return this._id;
	}

	get proxy(): ExtHostCommentsShape {
		return this._proxy;
	}

	get label(): string {
		return this._label;
	}

	private _reactions: modes.CommentReaction[] | undefined;

	get reactions() {
		return this._reactions;
	}

	set reactions(reactions: modes.CommentReaction[] | undefined) {
		this._reactions = reactions;
	}

	private readonly _threads: Map<number, MainThreadCommentThread> = new Map<number, MainThreadCommentThread>();
	public activeCommentThread?: MainThreadCommentThread;


	constructor(
		private readonly _proxy: ExtHostCommentsShape,
		private readonly _commentService: ICommentService,
		private readonly _handle: number,
		private readonly _uniqueId: string,
		private readonly _id: string,
		private readonly _label: string,
		private _features: CommentProviderFeatures
	) { }

	updateFeatures(features: CommentProviderFeatures) {
		this._features = features;
	}

	createCommentThread(commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		range: IRange,
	): modes.CommentThread {
		let thread = new MainThreadCommentThread(
			commentThreadHandle,
			this,
			'',
			threadId,
			URI.revive(resource).toString(),
			range
		);

		this._threads.set(commentThreadHandle, thread);
		this._commentService.updateComments(this._uniqueId, {
			added: [thread],
			removed: [],
			changed: []
		});

		return thread;
	}

	updateCommentThread(commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		range: IRange,
		label: string,
		comments: modes.Comment[],
		acceptInputCommand: modes.Command | undefined,
		additionalCommands: modes.Command[],
		deleteCommand: modes.Command | undefined,
		collapsibleState: modes.CommentThreadCollapsibleState): void {
		let thread = this.getKnownThread(commentThreadHandle);
		thread.batchUpdate(range, label, comments, acceptInputCommand, additionalCommands, deleteCommand, collapsibleState);

		this._commentService.updateComments(this._uniqueId, {
			added: [],
			removed: [],
			changed: [thread]
		});
	}

	deleteCommentThread(commentThreadHandle: number) {
		let thread = this.getKnownThread(commentThreadHandle);
		this._threads.delete(commentThreadHandle);

		this._commentService.updateComments(this._uniqueId, {
			added: [],
			removed: [thread],
			changed: []
		});

		thread.dispose();
	}

	updateInput(input: string) {
		let thread = this.activeCommentThread;

		if (thread && thread.input) {
			let commentInput = thread.input;
			commentInput.value = input;
			thread.input = commentInput;
		}
	}

	private getKnownThread(commentThreadHandle: number): MainThreadCommentThread {
		const thread = this._threads.get(commentThreadHandle);
		if (!thread) {
			throw new Error('unknown thread');
		}
		return thread;
	}

	async getDocumentComments(resource: URI, token: CancellationToken) {
		let ret: modes.CommentThread[] = [];
		for (let thread of keys(this._threads)) {
			const commentThread = this._threads.get(thread)!;
			if (commentThread.resource === resource.toString()) {
				ret.push(commentThread);
			}
		}

		let commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);

		return <ICommentInfo>{
			owner: this._uniqueId,
			label: this.label,
			threads: ret,
			commentingRanges: commentingRanges ?
				{
					resource: resource, ranges: commentingRanges, newCommentThreadCallback: async (uri: UriComponents, range: IRange) => {
						await this._proxy.$createNewCommentWidgetCallback(this.handle, uri, range, token);
					}
				} : [],
			draftMode: modes.DraftMode.NotSupported
		};
	}

	async getCommentingRanges(resource: URI, token: CancellationToken): Promise<IRange[]> {
		let commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);
		return commentingRanges || [];
	}

	getReactionGroup(): modes.CommentReaction[] | undefined {
		return this._features.reactionGroup;
	}

	async toggleReaction(uri: URI, thread: modes.CommentThread, comment: modes.Comment, reaction: modes.CommentReaction, token: CancellationToken): Promise<void> {
		return this._proxy.$toggleReaction(this._handle, thread.commentThreadHandle, uri, comment, reaction);
	}

	getAllComments(): MainThreadCommentThread[] {
		let ret: MainThreadCommentThread[] = [];
		for (let thread of keys(this._threads)) {
			ret.push(this._threads.get(thread)!);
		}

		return ret;
	}

	toJSON(): any {
		return {
			$mid: 6,
			handle: this.handle
		};
	}
}

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadComments extends Disposable implements MainThreadCommentsShape {
	private _disposables: IDisposable[];
	private _activeCommentThreadDisposables: IDisposable[];
	private readonly _proxy: ExtHostCommentsShape;
	private _handlers = new Map<number, string>();
	private _commentControllers = new Map<number, MainThreadCommentController>();

	private _activeCommentThread?: MainThreadCommentThread;
	private _input?: modes.CommentInput;
	private _openPanelListener: IDisposable | null;

	constructor(
		extHostContext: IExtHostContext,
		@ICommentService private readonly _commentService: ICommentService,
		@IPanelService private readonly _panelService: IPanelService
	) {
		super();
		this._disposables = [];
		this._activeCommentThreadDisposables = [];
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
		this._disposables.push(this._commentService.onDidChangeActiveCommentThread(async thread => {
			let controller = (thread as MainThreadCommentThread).controller;

			if (!controller) {
				return;
			}

			this._activeCommentThreadDisposables = dispose(this._activeCommentThreadDisposables);
			this._activeCommentThread = thread as MainThreadCommentThread;
			controller.activeCommentThread = this._activeCommentThread;

			this._activeCommentThreadDisposables.push(this._activeCommentThread.onDidChangeInput(input => { // todo, dispose
				this._input = input;
				this._proxy.$onCommentWidgetInputChange(controller.handle, this._input ? this._input.value : undefined);
			}));

			await this._proxy.$onCommentWidgetInputChange(controller.handle, this._input ? this._input.value : undefined);
		}));
	}

	$registerCommentController(handle: number, id: string, label: string): void {
		const providerId = generateUuid();
		this._handlers.set(handle, providerId);

		const provider = new MainThreadCommentController(this._proxy, this._commentService, handle, providerId, id, label, {});
		this._commentService.registerCommentController(providerId, provider);
		this._commentControllers.set(handle, provider);

		const commentsPanelAlreadyConstructed = this._panelService.getPanels().some(panel => panel.id === COMMENTS_PANEL_ID);
		if (!commentsPanelAlreadyConstructed) {
			this.registerPanel(commentsPanelAlreadyConstructed);
			this.registerOpenPanelListener(commentsPanelAlreadyConstructed);
		}
	}

	$unregisterCommentController(handle: number): void {
		const providerId = this._handlers.get(handle);
		if (typeof providerId !== 'string') {
			throw new Error('unknown handler');
		}
		this._commentService.unregisterCommentController(providerId);
		this._handlers.delete(handle);
		this._commentControllers.delete(handle);
	}

	$updateCommentControllerFeatures(handle: number, features: CommentProviderFeatures): void {
		let provider = this._commentControllers.get(handle);

		if (!provider) {
			return undefined;
		}

		provider.updateFeatures(features);
	}

	$createCommentThread(handle: number,
		commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		range: IRange
	): modes.CommentThread | undefined {
		let provider = this._commentControllers.get(handle);

		if (!provider) {
			return undefined;
		}

		return provider.createCommentThread(commentThreadHandle, threadId, resource, range);
	}

	$updateCommentThread(handle: number,
		commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		range: IRange,
		label: string,
		comments: modes.Comment[],
		acceptInputCommand: modes.Command | undefined,
		additionalCommands: modes.Command[],
		deleteCommand: modes.Command,
		collapsibleState: modes.CommentThreadCollapsibleState): void {
		let provider = this._commentControllers.get(handle);

		if (!provider) {
			return undefined;
		}

		return provider.updateCommentThread(commentThreadHandle, threadId, resource, range, label, comments, acceptInputCommand, additionalCommands, deleteCommand, collapsibleState);
	}

	$deleteCommentThread(handle: number, commentThreadHandle: number) {
		let provider = this._commentControllers.get(handle);

		if (!provider) {
			return;
		}

		return provider.deleteCommentThread(commentThreadHandle);
	}

	$setInputValue(handle: number, input: string) {
		let provider = this._commentControllers.get(handle);

		if (!provider) {
			return;
		}

		provider.updateInput(input);
	}

	private registerPanel(commentsPanelAlreadyConstructed: boolean) {
		if (!commentsPanelAlreadyConstructed) {
			Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
				CommentsPanel,
				COMMENTS_PANEL_ID,
				COMMENTS_PANEL_TITLE,
				'commentsPanel',
				10
			));
		}
	}

	/**
	 * If the comments panel has never been opened, the constructor for it has not yet run so it has
	 * no listeners for comment threads being set or updated. Listen for the panel opening for the
	 * first time and send it comments then.
	 */
	private registerOpenPanelListener(commentsPanelAlreadyConstructed: boolean) {
		if (!commentsPanelAlreadyConstructed && !this._openPanelListener) {
			this._openPanelListener = this._panelService.onDidPanelOpen(e => {
				if (e.panel.getId() === COMMENTS_PANEL_ID) {
					keys(this._commentControllers).forEach(handle => {
						let threads = this._commentControllers.get(handle)!.getAllComments();

						if (threads.length) {
							const providerId = this.getHandler(handle);
							this._commentService.setWorkspaceComments(providerId, threads);
						}
					});

					if (this._openPanelListener) {
						this._openPanelListener.dispose();
						this._openPanelListener = null;
					}
				}
			});
		}
	}

	private getHandler(handle: number) {
		if (!this._handlers.has(handle)) {
			throw new Error('Unknown handler');
		}
		return this._handlers.get(handle)!;
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._activeCommentThreadDisposables = dispose(this._activeCommentThreadDisposables);
	}
}
