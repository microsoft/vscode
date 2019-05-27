/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor, isDiffEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import * as modes from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { keys } from 'vs/base/common/map';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThreadCommentsShape, CommentProviderFeatures } from '../common/extHost.protocol';

import { ICommentService, ICommentInfo } from 'vs/workbench/contrib/comments/browser/commentService';
import { COMMENTS_PANEL_ID, CommentsPanel, COMMENTS_PANEL_TITLE } from 'vs/workbench/contrib/comments/browser/commentsPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { generateUuid } from 'vs/base/common/uuid';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommentsConfiguration } from 'vs/workbench/contrib/comments/browser/comments.contribution';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';

export class MainThreadDocumentCommentProvider implements modes.DocumentCommentProvider {
	private readonly _proxy: ExtHostCommentsShape;
	private readonly _handle: number;
	private readonly _features: CommentProviderFeatures;
	get startDraftLabel(): string | undefined { return this._features.startDraftLabel; }
	get deleteDraftLabel(): string | undefined { return this._features.deleteDraftLabel; }
	get finishDraftLabel(): string | undefined { return this._features.finishDraftLabel; }
	get reactionGroup(): modes.CommentReaction[] | undefined { return this._features.reactionGroup; }

	constructor(proxy: ExtHostCommentsShape, handle: number, features: CommentProviderFeatures) {
		this._proxy = proxy;
		this._handle = handle;
		this._features = features;
	}

	async provideDocumentComments(uri: URI, token: CancellationToken) {
		return this._proxy.$provideDocumentComments(this._handle, uri);
	}

	async createNewCommentThread(uri: URI, range: Range, text: string, token: CancellationToken) {
		return this._proxy.$createNewCommentThread(this._handle, uri, range, text);
	}

	async replyToCommentThread(uri: URI, range: Range, thread: modes.CommentThread, text: string, token: CancellationToken) {
		return this._proxy.$replyToCommentThread(this._handle, uri, range, thread, text);
	}

	async editComment(uri: URI, comment: modes.Comment, text: string, token: CancellationToken) {
		return this._proxy.$editComment(this._handle, uri, comment, text);
	}

	async deleteComment(uri: URI, comment: modes.Comment, token: CancellationToken) {
		return this._proxy.$deleteComment(this._handle, uri, comment);
	}

	async startDraft(uri: URI, token: CancellationToken): Promise<void> {
		return this._proxy.$startDraft(this._handle, uri);
	}
	async deleteDraft(uri: URI, token: CancellationToken): Promise<void> {
		return this._proxy.$deleteDraft(this._handle, uri);
	}
	async finishDraft(uri: URI, token: CancellationToken): Promise<void> {
		return this._proxy.$finishDraft(this._handle, uri);
	}
	async addReaction(uri: URI, comment: modes.Comment, reaction: modes.CommentReaction, token: CancellationToken): Promise<void> {
		return this._proxy.$addReaction(this._handle, uri, comment, reaction);
	}
	async deleteReaction(uri: URI, comment: modes.Comment, reaction: modes.CommentReaction, token: CancellationToken): Promise<void> {
		return this._proxy.$deleteReaction(this._handle, uri, comment, reaction);
	}


	// onDidChangeCommentThreads = null;
}

export class MainThreadCommentThread implements modes.CommentThread2 {
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

	private _label: string;

	get label(): string {
		return this._label;
	}

	set label(label: string) {
		this._label = label;
		this._onDidChangeLabel.fire(this._label);
	}

	private _contextValue: string | undefined;

	get contextValue(): string | undefined {
		return this._contextValue;
	}

	set contextValue(context: string | undefined) {
		this._contextValue = context;
	}

	private _onDidChangeLabel = new Emitter<string>();
	get onDidChangeLabel(): Event<string> { return this._onDidChangeLabel.event; }

	private _comments: modes.Comment[] | undefined;

	public get comments(): modes.Comment[] | undefined {
		return this._comments;
	}

	public set comments(newComments: modes.Comment[] | undefined) {
		this._comments = newComments;
		this._onDidChangeComments.fire(this._comments);
	}

	private _onDidChangeComments = new Emitter<modes.Comment[] | undefined>();
	get onDidChangeComments(): Event<modes.Comment[] | undefined> { return this._onDidChangeComments.event; }

	private _acceptInputCommand: modes.Command | undefined;
	set acceptInputCommand(newCommand: modes.Command | undefined) {
		this._acceptInputCommand = newCommand;
		this._onDidChangeAcceptInputCommand.fire(this._acceptInputCommand);
	}

	get acceptInputCommand(): modes.Command | undefined {
		return this._acceptInputCommand!;
	}

	private _onDidChangeAcceptInputCommand = new Emitter<modes.Command | undefined>();
	get onDidChangeAcceptInputCommand(): Event<modes.Command | undefined> { return this._onDidChangeAcceptInputCommand.event; }

	private _additionalCommands: modes.Command[] | undefined;
	set additionalCommands(newCommands: modes.Command[] | undefined) {
		this._additionalCommands = newCommands;
		this._onDidChangeAdditionalCommands.fire(this._additionalCommands);
	}

	get additionalCommands(): modes.Command[] | undefined {
		return this._additionalCommands;
	}

	private _onDidChangeAdditionalCommands = new Emitter<modes.Command[] | undefined>();
	get onDidChangeAdditionalCommands(): Event<modes.Command[] | undefined> { return this._onDidChangeAdditionalCommands.event; }

	private _deleteCommand: modes.Command | undefined;

	set deleteCommand(newCommand: modes.Command | undefined) {
		this._deleteCommand = newCommand;
	}

	get deleteCommand(): modes.Command | undefined {
		return this._deleteCommand;
	}

	set range(range: IRange) {
		this._range = range;
		this._onDidChangeRange.fire(this._range);
	}

	get range(): IRange {
		return this._range;
	}

	private _onDidChangeRange = new Emitter<IRange>();
	public onDidChangeRange = this._onDidChangeRange.event;

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

	private _isDisposed: boolean;

	get isDisposed(): boolean {
		return this._isDisposed;
	}

	constructor(
		public commentThreadHandle: number,
		public controllerHandle: number,
		public extensionId: string,
		public threadId: string,
		public resource: string,
		private _range: IRange
	) {
		this._isDisposed = false;
	}

	batchUpdate(
		range: IRange,
		label: string,
		contextValue: string | undefined,
		comments: modes.Comment[],
		acceptInputCommand: modes.Command | undefined,
		additionalCommands: modes.Command[],
		deleteCommand: modes.Command | undefined,
		collapsibleState: modes.CommentThreadCollapsibleState) {
		this._range = range;
		this._label = label;
		this._contextValue = contextValue;
		this._comments = comments;
		this._acceptInputCommand = acceptInputCommand;
		this._additionalCommands = additionalCommands;
		this._deleteCommand = deleteCommand;
		this._collapsibleState = collapsibleState;
	}

	dispose() {
		this._isDisposed = true;
		this._onDidChangeAcceptInputCommand.dispose();
		this._onDidChangeAdditionalCommands.dispose();
		this._onDidChangeCollasibleState.dispose();
		this._onDidChangeComments.dispose();
		this._onDidChangeInput.dispose();
		this._onDidChangeLabel.dispose();
		this._onDidChangeRange.dispose();
	}

	toJSON(): any {
		return {
			$mid: 7,
			commentControlHandle: this.controllerHandle,
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

	get contextValue(): string {
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
	): modes.CommentThread2 {
		let thread = new MainThreadCommentThread(
			commentThreadHandle,
			this.handle,
			'',
			threadId,
			URI.revive(resource).toString(),
			range
		);

		this._threads.set(commentThreadHandle, thread);

		// As we create comment thread from template and then restore from the newly created maint thread comment thread,
		// we postpone the update event to avoid duplication.
		// This can be actually removed once we are on the new API.
		setTimeout(() => {
			this._commentService.updateComments(this._uniqueId, {
				added: [thread],
				removed: [],
				changed: [],
				draftMode: modes.DraftMode.NotSupported
			});
		}, 0);

		return thread;
	}

	updateCommentThread(commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		range: IRange,
		label: string,
		contextValue: string | undefined,
		comments: modes.Comment[],
		acceptInputCommand: modes.Command | undefined,
		additionalCommands: modes.Command[],
		deleteCommand: modes.Command | undefined,
		collapsibleState: modes.CommentThreadCollapsibleState): void {
		let thread = this.getKnownThread(commentThreadHandle);
		thread.batchUpdate(range, label, contextValue, comments, acceptInputCommand, additionalCommands, deleteCommand, collapsibleState);

		this._commentService.updateComments(this._uniqueId, {
			added: [],
			removed: [],
			changed: [thread],
			draftMode: modes.DraftMode.NotSupported
		});
	}

	deleteCommentThread(commentThreadHandle: number) {
		let thread = this.getKnownThread(commentThreadHandle);
		this._threads.delete(commentThreadHandle);

		this._commentService.updateComments(this._uniqueId, {
			added: [],
			removed: [thread],
			changed: [],
			draftMode: modes.DraftMode.NotSupported
		});

		thread.dispose();
	}

	deleteCommentThreadMain(commentThreadId: string) {
		this._threads.forEach(thread => {
			if (thread.threadId === commentThreadId) {
				this._proxy.$deleteCommentThread(this._handle, thread.commentThreadHandle);
			}
		});
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
		let ret: modes.CommentThread2[] = [];
		for (let thread of keys(this._threads)) {
			const commentThread = this._threads.get(thread)!;
			if (commentThread.resource === resource.toString()) {
				ret.push(commentThread);
			}
		}

		let commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);
		let staticContribution = await this._proxy.$checkStaticContribution(this.handle);

		return <ICommentInfo>{
			owner: this._uniqueId,
			label: this.label,
			threads: ret,
			commentingRanges: commentingRanges ? {
				resource: resource,
				ranges: commentingRanges,
				newCommentThreadCallback: staticContribution ? undefined : async (uri: UriComponents, range: IRange) => {
					let threadHandle = await this._proxy.$createNewCommentWidgetCallback(this.handle, uri, range, token);

					if (threadHandle !== undefined) {
						return this.getKnownThread(threadHandle);
					}

					return;
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

	async toggleReaction(uri: URI, thread: modes.CommentThread2, comment: modes.Comment, reaction: modes.CommentReaction, token: CancellationToken): Promise<void> {
		return this._proxy.$toggleReaction(this._handle, thread.commentThreadHandle, uri, comment, reaction);
	}

	getAllComments(): MainThreadCommentThread[] {
		let ret: MainThreadCommentThread[] = [];
		for (let thread of keys(this._threads)) {
			ret.push(this._threads.get(thread)!);
		}

		return ret;
	}

	createCommentThreadTemplate(resource: UriComponents, range: IRange): void {
		this._proxy.$createCommentThreadTemplate(this.handle, resource, range);
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
	private _documentProviders = new Map<number, IDisposable>();
	private _workspaceProviders = new Map<number, IDisposable>();
	private _handlers = new Map<number, string>();
	private _commentControllers = new Map<number, MainThreadCommentController>();

	private _openPanelListener: IDisposable | null;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private readonly _editorService: IEditorService,
		@ICommentService private readonly _commentService: ICommentService,
		@IPanelService private readonly _panelService: IPanelService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._disposables = [];
		this._activeCommentThreadDisposables = [];
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
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
		this._commentService.setWorkspaceComments(String(handle), []);
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
	): modes.CommentThread2 | undefined {
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
		contextValue: string | undefined,
		comments: modes.Comment[],
		acceptInputCommand: modes.Command | undefined,
		additionalCommands: modes.Command[],
		deleteCommand: modes.Command,
		collapsibleState: modes.CommentThreadCollapsibleState): void {
		let provider = this._commentControllers.get(handle);

		if (!provider) {
			return undefined;
		}

		return provider.updateCommentThread(commentThreadHandle, threadId, resource, range, label, contextValue, comments, acceptInputCommand, additionalCommands, deleteCommand, collapsibleState);
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

	$registerDocumentCommentProvider(handle: number, features: CommentProviderFeatures): void {
		this._documentProviders.set(handle, undefined);
		const handler = new MainThreadDocumentCommentProvider(this._proxy, handle, features);

		const providerId = generateUuid();
		this._handlers.set(handle, providerId);

		this._commentService.registerDataProvider(providerId, handler);
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
					keys(this._workspaceProviders).forEach(handle => {
						this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
							if (commentThreads) {
								const providerId = this.getHandler(handle);
								this._commentService.setWorkspaceComments(providerId, commentThreads);
							}
						});
					});

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

	$registerWorkspaceCommentProvider(handle: number, extensionId: ExtensionIdentifier): void {
		this._workspaceProviders.set(handle, undefined);

		const providerId = generateUuid();
		this._handlers.set(handle, providerId);

		const commentsPanelAlreadyConstructed = this._panelService.getPanels().some(panel => panel.id === COMMENTS_PANEL_ID);
		if (!commentsPanelAlreadyConstructed) {
			this.registerPanel(commentsPanelAlreadyConstructed);
		}

		const openPanel = this._configurationService.getValue<ICommentsConfiguration>('comments').openPanel;

		if (openPanel === 'neverOpen') {
			this.registerOpenPanelListener(commentsPanelAlreadyConstructed);
		}

		if (openPanel === 'openOnSessionStart') {
			this._panelService.openPanel(COMMENTS_PANEL_ID);
		}

		this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
			if (commentThreads) {
				if (openPanel === 'openOnSessionStartWithComments' && commentThreads.length) {
					if (commentThreads.length) {
						this._panelService.openPanel(COMMENTS_PANEL_ID);
					} else {
						this.registerOpenPanelListener(commentsPanelAlreadyConstructed);
					}
				}

				this._commentService.setWorkspaceComments(providerId, commentThreads);
			}
		});

		/* __GDPR__
			"comments:registerWorkspaceCommentProvider" : {
				"extensionId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this._telemetryService.publicLog('comments:registerWorkspaceCommentProvider', {
			extensionId: extensionId.value
		});
	}

	$unregisterDocumentCommentProvider(handle: number): void {
		this._documentProviders.delete(handle);
		const handlerId = this.getHandler(handle);
		this._commentService.unregisterDataProvider(handlerId);
		this._handlers.delete(handle);
	}

	$unregisterWorkspaceCommentProvider(handle: number): void {
		this._workspaceProviders.delete(handle);
		if (this._workspaceProviders.size === 0) {
			Registry.as<PanelRegistry>(PanelExtensions.Panels).deregisterPanel(COMMENTS_PANEL_ID);

			if (this._openPanelListener) {
				this._openPanelListener.dispose();
				this._openPanelListener = null;
			}
		}

		const handlerId = this.getHandler(handle);
		this._commentService.removeWorkspaceComments(handlerId);
		this._handlers.delete(handle);
	}

	$onDidCommentThreadsChange(handle: number, event: modes.CommentThreadChangedEvent) {
		// notify comment service
		const providerId = this.getHandler(handle);
		this._commentService.updateComments(providerId, event);
	}

	getVisibleEditors(): ICodeEditor[] {
		let ret: ICodeEditor[] = [];

		this._editorService.visibleControls.forEach(control => {
			if (isCodeEditor(control.getControl())) {
				ret.push(control.getControl() as ICodeEditor);
			}

			if (isDiffEditor(control.getControl())) {
				let diffEditor = control.getControl() as IDiffEditor;
				ret.push(diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor());
			}
		});

		return ret;
	}

	async provideWorkspaceComments(): Promise<modes.CommentThread[]> {
		const result: modes.CommentThread[] = [];
		for (const handle of keys(this._workspaceProviders)) {
			const result = await this._proxy.$provideWorkspaceComments(handle);
			if (Array.isArray(result)) {
				result.push(...result);
			}
		}
		return result;
	}

	async provideDocumentComments(resource: URI): Promise<Array<modes.CommentInfo | null>> {
		const result: Array<modes.CommentInfo | null> = [];
		for (const handle of keys(this._documentProviders)) {
			result.push(await this._proxy.$provideDocumentComments(handle, resource));
		}
		return result;
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._activeCommentThreadDisposables = dispose(this._activeCommentThreadDisposables);
		this._workspaceProviders.forEach(value => dispose(value));
		this._workspaceProviders.clear();
		this._documentProviders.forEach(value => dispose(value));
		this._documentProviders.clear();
	}
}
