/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentThreadChangedEvent, CommentInfo, Comment, CommentReaction, CommentingRanges, CommentThread, CommentOptions, PendingCommentThread, CommentingRangeResourceHint } from 'vs/editor/common/languages';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ICommentThreadChangedEvent } from 'vs/workbench/contrib/comments/common/commentModel';
import { CommentMenus } from 'vs/workbench/contrib/comments/browser/commentMenus';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { COMMENTS_SECTION, ICommentsConfiguration } from 'vs/workbench/contrib/comments/common/commentsConfiguration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { ILogService } from 'vs/platform/log/common/log';
import { CommentsModel, ICommentsModel } from 'vs/workbench/contrib/comments/browser/commentsModel';
import { IModelService } from 'vs/editor/common/services/model';

export const ICommentService = createDecorator<ICommentService>('commentService');

interface IResourceCommentThreadEvent {
	resource: URI;
	commentInfos: ICommentInfo[];
}

export interface ICommentInfo extends CommentInfo {
	uniqueOwner: string;
	label?: string;
}

export interface INotebookCommentInfo {
	extensionId?: string;
	threads: CommentThread<ICellRange>[];
	uniqueOwner: string;
	label?: string;
}

export interface IWorkspaceCommentThreadsEvent {
	ownerId: string;
	ownerLabel: string;
	commentThreads: CommentThread[];
}

export interface INotebookCommentThreadChangedEvent extends CommentThreadChangedEvent<ICellRange> {
	uniqueOwner: string;
}

export interface ICommentController {
	id: string;
	label: string;
	features: {
		reactionGroup?: CommentReaction[];
		reactionHandler?: boolean;
		options?: CommentOptions;
	};
	options?: CommentOptions;
	contextValue?: string;
	owner: string;
	createCommentThreadTemplate(resource: UriComponents, range: IRange | undefined): Promise<void>;
	updateCommentThreadTemplate(threadHandle: number, range: IRange): Promise<void>;
	deleteCommentThreadMain(commentThreadId: string): void;
	toggleReaction(uri: URI, thread: CommentThread, comment: Comment, reaction: CommentReaction, token: CancellationToken): Promise<void>;
	getDocumentComments(resource: URI, token: CancellationToken): Promise<ICommentInfo>;
	getNotebookComments(resource: URI, token: CancellationToken): Promise<INotebookCommentInfo>;
	setActiveCommentAndThread(commentInfo: { thread: CommentThread; comment?: Comment } | undefined): Promise<void>;
}

export interface IContinueOnCommentProvider {
	provideContinueOnComments(): PendingCommentThread[];
}

export interface ICommentService {
	readonly _serviceBrand: undefined;
	readonly onDidSetResourceCommentInfos: Event<IResourceCommentThreadEvent>;
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent>;
	readonly onDidUpdateCommentThreads: Event<ICommentThreadChangedEvent>;
	readonly onDidUpdateNotebookCommentThreads: Event<INotebookCommentThreadChangedEvent>;
	readonly onDidChangeActiveEditingCommentThread: Event<CommentThread | null>;
	readonly onDidChangeCurrentCommentThread: Event<CommentThread | undefined>;
	readonly onDidUpdateCommentingRanges: Event<{ uniqueOwner: string }>;
	readonly onDidChangeActiveCommentingRange: Event<{ range: Range; commentingRangesInfo: CommentingRanges }>;
	readonly onDidSetDataProvider: Event<void>;
	readonly onDidDeleteDataProvider: Event<string | undefined>;
	readonly onDidChangeCommentingEnabled: Event<boolean>;
	readonly isCommentingEnabled: boolean;
	readonly commentsModel: ICommentsModel;
	setDocumentComments(resource: URI, commentInfos: ICommentInfo[]): void;
	setWorkspaceComments(uniqueOwner: string, commentsByResource: CommentThread<IRange | ICellRange>[]): void;
	removeWorkspaceComments(uniqueOwner: string): void;
	registerCommentController(uniqueOwner: string, commentControl: ICommentController): void;
	unregisterCommentController(uniqueOwner?: string): void;
	getCommentController(uniqueOwner: string): ICommentController | undefined;
	createCommentThreadTemplate(uniqueOwner: string, resource: URI, range: Range | undefined): Promise<void>;
	updateCommentThreadTemplate(uniqueOwner: string, threadHandle: number, range: Range): Promise<void>;
	getCommentMenus(uniqueOwner: string): CommentMenus;
	updateComments(ownerId: string, event: CommentThreadChangedEvent<IRange>): void;
	updateNotebookComments(ownerId: string, event: CommentThreadChangedEvent<ICellRange>): void;
	disposeCommentThread(ownerId: string, threadId: string): void;
	getDocumentComments(resource: URI): Promise<(ICommentInfo | null)[]>;
	getNotebookComments(resource: URI): Promise<(INotebookCommentInfo | null)[]>;
	updateCommentingRanges(ownerId: string, resourceHints?: CommentingRangeResourceHint): void;
	hasReactionHandler(uniqueOwner: string): boolean;
	toggleReaction(uniqueOwner: string, resource: URI, thread: CommentThread<IRange | ICellRange>, comment: Comment, reaction: CommentReaction): Promise<void>;
	setActiveEditingCommentThread(commentThread: CommentThread<IRange | ICellRange> | null): void;
	setCurrentCommentThread(commentThread: CommentThread<IRange | ICellRange> | undefined): void;
	setActiveCommentAndThread(uniqueOwner: string, commentInfo: { thread: CommentThread<IRange | ICellRange>; comment?: Comment } | undefined): Promise<void>;
	enableCommenting(enable: boolean): void;
	registerContinueOnCommentProvider(provider: IContinueOnCommentProvider): IDisposable;
	removeContinueOnComment(pendingComment: { range: IRange | undefined; uri: URI; uniqueOwner: string; isReply?: boolean }): PendingCommentThread | undefined;
	resourceHasCommentingRanges(resource: URI): boolean;
}

const CONTINUE_ON_COMMENTS = 'comments.continueOnComments';

export class CommentService extends Disposable implements ICommentService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidSetDataProvider: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidSetDataProvider: Event<void> = this._onDidSetDataProvider.event;

	private readonly _onDidDeleteDataProvider: Emitter<string | undefined> = this._register(new Emitter<string | undefined>());
	readonly onDidDeleteDataProvider: Event<string | undefined> = this._onDidDeleteDataProvider.event;

	private readonly _onDidSetResourceCommentInfos: Emitter<IResourceCommentThreadEvent> = this._register(new Emitter<IResourceCommentThreadEvent>());
	readonly onDidSetResourceCommentInfos: Event<IResourceCommentThreadEvent> = this._onDidSetResourceCommentInfos.event;

	private readonly _onDidSetAllCommentThreads: Emitter<IWorkspaceCommentThreadsEvent> = this._register(new Emitter<IWorkspaceCommentThreadsEvent>());
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent> = this._onDidSetAllCommentThreads.event;

	private readonly _onDidUpdateCommentThreads: Emitter<ICommentThreadChangedEvent> = this._register(new Emitter<ICommentThreadChangedEvent>());
	readonly onDidUpdateCommentThreads: Event<ICommentThreadChangedEvent> = this._onDidUpdateCommentThreads.event;

	private readonly _onDidUpdateNotebookCommentThreads: Emitter<INotebookCommentThreadChangedEvent> = this._register(new Emitter<INotebookCommentThreadChangedEvent>());
	readonly onDidUpdateNotebookCommentThreads: Event<INotebookCommentThreadChangedEvent> = this._onDidUpdateNotebookCommentThreads.event;

	private readonly _onDidUpdateCommentingRanges: Emitter<{ uniqueOwner: string }> = this._register(new Emitter<{ uniqueOwner: string }>());
	readonly onDidUpdateCommentingRanges: Event<{ uniqueOwner: string }> = this._onDidUpdateCommentingRanges.event;

	private readonly _onDidChangeActiveEditingCommentThread = this._register(new Emitter<CommentThread | null>());
	readonly onDidChangeActiveEditingCommentThread = this._onDidChangeActiveEditingCommentThread.event;

	private readonly _onDidChangeCurrentCommentThread = this._register(new Emitter<CommentThread | undefined>());
	readonly onDidChangeCurrentCommentThread = this._onDidChangeCurrentCommentThread.event;

	private readonly _onDidChangeCommentingEnabled = this._register(new Emitter<boolean>());
	readonly onDidChangeCommentingEnabled = this._onDidChangeCommentingEnabled.event;

	private readonly _onDidChangeActiveCommentingRange: Emitter<{
		range: Range; commentingRangesInfo:
		CommentingRanges;
	}> = this._register(new Emitter<{
		range: Range; commentingRangesInfo:
		CommentingRanges;
	}>());
	readonly onDidChangeActiveCommentingRange: Event<{ range: Range; commentingRangesInfo: CommentingRanges }> = this._onDidChangeActiveCommentingRange.event;

	private _commentControls = new Map<string, ICommentController>();
	private _commentMenus = new Map<string, CommentMenus>();
	private _isCommentingEnabled: boolean = true;
	private _workspaceHasCommenting: IContextKey<boolean>;

	private _continueOnComments = new Map<string, PendingCommentThread[]>(); // uniqueOwner -> PendingCommentThread[]
	private _continueOnCommentProviders = new Set<IContinueOnCommentProvider>();

	private readonly _commentsModel: CommentsModel = this._register(new CommentsModel());
	public readonly commentsModel: ICommentsModel = this._commentsModel;

	private _commentingRangeResources = new Set<string>(); // URIs
	private _commentingRangeResourceHintSchemes = new Set<string>(); // schemes

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IModelService private readonly modelService: IModelService
	) {
		super();
		this._handleConfiguration();
		this._handleZenMode();
		this._workspaceHasCommenting = CommentContextKeys.WorkspaceHasCommenting.bindTo(contextKeyService);
		const storageListener = this._register(new DisposableStore());

		const storageEvent = Event.debounce(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, CONTINUE_ON_COMMENTS, storageListener), (last, event) => last?.external ? last : event, 500);
		storageListener.add(storageEvent(v => {
			if (!v.external) {
				return;
			}
			const commentsToRestore: PendingCommentThread[] | undefined = this.storageService.getObject(CONTINUE_ON_COMMENTS, StorageScope.WORKSPACE);
			if (!commentsToRestore) {
				return;
			}
			this.logService.debug(`Comments: URIs of continue on comments from storage ${commentsToRestore.map(thread => thread.uri.toString()).join(', ')}.`);
			const changedOwners = this._addContinueOnComments(commentsToRestore, this._continueOnComments);
			for (const uniqueOwner of changedOwners) {
				const control = this._commentControls.get(uniqueOwner);
				if (!control) {
					continue;
				}
				const evt: ICommentThreadChangedEvent = {
					uniqueOwner: uniqueOwner,
					owner: control.owner,
					ownerLabel: control.label,
					pending: this._continueOnComments.get(uniqueOwner) || [],
					added: [],
					removed: [],
					changed: []
				};
				this.updateModelThreads(evt);
			}
		}));
		this._register(storageService.onWillSaveState(() => {
			const map: Map<string, PendingCommentThread[]> = new Map();
			for (const provider of this._continueOnCommentProviders) {
				const pendingComments = provider.provideContinueOnComments();
				this._addContinueOnComments(pendingComments, map);
			}
			this._saveContinueOnComments(map);
		}));

		this._register(this.modelService.onModelAdded(model => {
			// Allows comment providers to cause their commenting ranges to be prefetched by opening text documents in the background.
			if (!this._commentingRangeResources.has(model.uri.toString())) {
				this.getDocumentComments(model.uri);
			}
		}));
	}

	private _updateResourcesWithCommentingRanges(resource: URI, commentInfos: (ICommentInfo | null)[]) {
		for (const comments of commentInfos) {
			if (comments && (comments.commentingRanges.ranges.length > 0 || comments.threads.length > 0)) {
				this._commentingRangeResources.add(resource.toString());
			}
		}
	}

	private _handleConfiguration() {
		this._isCommentingEnabled = this._defaultCommentingEnablement;
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('comments.visible')) {
				this.enableCommenting(this._defaultCommentingEnablement);
			}
		}));
	}

	private _handleZenMode() {
		let preZenModeValue: boolean = this._isCommentingEnabled;
		this._register(this.layoutService.onDidChangeZenMode(e => {
			if (e) {
				preZenModeValue = this._isCommentingEnabled;
				this.enableCommenting(false);
			} else {
				this.enableCommenting(preZenModeValue);
			}
		}));
	}

	private get _defaultCommentingEnablement(): boolean {
		return !!this.configurationService.getValue<ICommentsConfiguration | undefined>(COMMENTS_SECTION)?.visible;
	}

	get isCommentingEnabled(): boolean {
		return this._isCommentingEnabled;
	}

	enableCommenting(enable: boolean): void {
		if (enable !== this._isCommentingEnabled) {
			this._isCommentingEnabled = enable;
			this._onDidChangeCommentingEnabled.fire(enable);
		}
	}

	/**
	 * The current comment thread is the thread that has focus or is being hovered.
	 * @param commentThread
	 */
	setCurrentCommentThread(commentThread: CommentThread | undefined) {
		this._onDidChangeCurrentCommentThread.fire(commentThread);
	}

	/**
	 * The active comment thread is the the thread that is currently being edited.
	 * @param commentThread
	 */
	setActiveEditingCommentThread(commentThread: CommentThread | null) {
		this._onDidChangeActiveEditingCommentThread.fire(commentThread);
	}

	private _lastActiveCommentController: ICommentController | undefined;
	async setActiveCommentAndThread(uniqueOwner: string, commentInfo: { thread: CommentThread<IRange>; comment?: Comment } | undefined) {
		const commentController = this._commentControls.get(uniqueOwner);

		if (!commentController) {
			return;
		}

		if (commentController !== this._lastActiveCommentController) {
			await this._lastActiveCommentController?.setActiveCommentAndThread(undefined);
		}
		this._lastActiveCommentController = commentController;
		return commentController.setActiveCommentAndThread(commentInfo);
	}

	setDocumentComments(resource: URI, commentInfos: ICommentInfo[]): void {
		this._onDidSetResourceCommentInfos.fire({ resource, commentInfos });
	}

	private setModelThreads(ownerId: string, owner: string, ownerLabel: string, commentThreads: CommentThread<IRange>[]) {
		this._commentsModel.setCommentThreads(ownerId, owner, ownerLabel, commentThreads);
		this._onDidSetAllCommentThreads.fire({ ownerId, ownerLabel, commentThreads });
	}

	private updateModelThreads(event: ICommentThreadChangedEvent) {
		this._commentsModel.updateCommentThreads(event);
		this._onDidUpdateCommentThreads.fire(event);
	}

	setWorkspaceComments(uniqueOwner: string, commentsByResource: CommentThread[]): void {

		if (commentsByResource.length) {
			this._workspaceHasCommenting.set(true);
		}
		const control = this._commentControls.get(uniqueOwner);
		if (control) {
			this.setModelThreads(uniqueOwner, control.owner, control.label, commentsByResource);
		}
	}

	removeWorkspaceComments(uniqueOwner: string): void {
		const control = this._commentControls.get(uniqueOwner);
		if (control) {
			this.setModelThreads(uniqueOwner, control.owner, control.label, []);
		}
	}

	registerCommentController(uniqueOwner: string, commentControl: ICommentController): void {
		this._commentControls.set(uniqueOwner, commentControl);
		this._onDidSetDataProvider.fire();
	}

	unregisterCommentController(uniqueOwner?: string): void {
		if (uniqueOwner) {
			this._commentControls.delete(uniqueOwner);
		} else {
			this._commentControls.clear();
		}
		this._commentsModel.deleteCommentsByOwner(uniqueOwner);
		this._onDidDeleteDataProvider.fire(uniqueOwner);
	}

	getCommentController(uniqueOwner: string): ICommentController | undefined {
		return this._commentControls.get(uniqueOwner);
	}

	async createCommentThreadTemplate(uniqueOwner: string, resource: URI, range: Range | undefined): Promise<void> {
		const commentController = this._commentControls.get(uniqueOwner);

		if (!commentController) {
			return;
		}

		return commentController.createCommentThreadTemplate(resource, range);
	}

	async updateCommentThreadTemplate(uniqueOwner: string, threadHandle: number, range: Range) {
		const commentController = this._commentControls.get(uniqueOwner);

		if (!commentController) {
			return;
		}

		await commentController.updateCommentThreadTemplate(threadHandle, range);
	}

	disposeCommentThread(uniqueOwner: string, threadId: string) {
		const controller = this.getCommentController(uniqueOwner);
		controller?.deleteCommentThreadMain(threadId);
	}

	getCommentMenus(uniqueOwner: string): CommentMenus {
		if (this._commentMenus.get(uniqueOwner)) {
			return this._commentMenus.get(uniqueOwner)!;
		}

		const menu = this.instantiationService.createInstance(CommentMenus);
		this._commentMenus.set(uniqueOwner, menu);
		return menu;
	}

	updateComments(ownerId: string, event: CommentThreadChangedEvent<IRange>): void {
		const control = this._commentControls.get(ownerId);
		if (control) {
			const evt: ICommentThreadChangedEvent = Object.assign({}, event, { uniqueOwner: ownerId, ownerLabel: control.label, owner: control.owner });
			this.updateModelThreads(evt);
		}
	}

	updateNotebookComments(ownerId: string, event: CommentThreadChangedEvent<ICellRange>): void {
		const evt: INotebookCommentThreadChangedEvent = Object.assign({}, event, { uniqueOwner: ownerId });
		this._onDidUpdateNotebookCommentThreads.fire(evt);
	}

	updateCommentingRanges(ownerId: string, resourceHints?: CommentingRangeResourceHint) {
		if (resourceHints?.schemes && resourceHints.schemes.length > 0) {
			for (const scheme of resourceHints.schemes) {
				this._commentingRangeResourceHintSchemes.add(scheme);
			}
		}
		this._workspaceHasCommenting.set(true);
		this._onDidUpdateCommentingRanges.fire({ uniqueOwner: ownerId });
	}

	async toggleReaction(uniqueOwner: string, resource: URI, thread: CommentThread, comment: Comment, reaction: CommentReaction): Promise<void> {
		const commentController = this._commentControls.get(uniqueOwner);

		if (commentController) {
			return commentController.toggleReaction(resource, thread, comment, reaction, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	hasReactionHandler(uniqueOwner: string): boolean {
		const commentProvider = this._commentControls.get(uniqueOwner);

		if (commentProvider) {
			return !!commentProvider.features.reactionHandler;
		}

		return false;
	}

	async getDocumentComments(resource: URI): Promise<(ICommentInfo | null)[]> {
		const commentControlResult: Promise<ICommentInfo | null>[] = [];

		for (const control of this._commentControls.values()) {
			commentControlResult.push(control.getDocumentComments(resource, CancellationToken.None)
				.then(documentComments => {
					// Check that there aren't any continue on comments in the provided comments
					// This can happen because continue on comments are stored separately from local un-submitted comments.
					for (const documentCommentThread of documentComments.threads) {
						if (documentCommentThread.comments?.length === 0 && documentCommentThread.range) {
							this.removeContinueOnComment({ range: documentCommentThread.range, uri: resource, uniqueOwner: documentComments.uniqueOwner });
						}
					}
					const pendingComments = this._continueOnComments.get(documentComments.uniqueOwner);
					documentComments.pendingCommentThreads = pendingComments?.filter(pendingComment => pendingComment.uri.toString() === resource.toString());
					return documentComments;
				})
				.catch(_ => {
					return null;
				}));
		}

		const commentInfos = await Promise.all(commentControlResult);
		this._updateResourcesWithCommentingRanges(resource, commentInfos);
		return commentInfos;
	}

	async getNotebookComments(resource: URI): Promise<(INotebookCommentInfo | null)[]> {
		const commentControlResult: Promise<INotebookCommentInfo | null>[] = [];

		this._commentControls.forEach(control => {
			commentControlResult.push(control.getNotebookComments(resource, CancellationToken.None)
				.catch(_ => {
					return null;
				}));
		});

		return Promise.all(commentControlResult);
	}

	registerContinueOnCommentProvider(provider: IContinueOnCommentProvider): IDisposable {
		this._continueOnCommentProviders.add(provider);
		return {
			dispose: () => {
				this._continueOnCommentProviders.delete(provider);
			}
		};
	}

	private _saveContinueOnComments(map: Map<string, PendingCommentThread[]>) {
		const commentsToSave: PendingCommentThread[] = [];
		for (const pendingComments of map.values()) {
			commentsToSave.push(...pendingComments);
		}
		this.logService.debug(`Comments: URIs of continue on comments to add to storage ${commentsToSave.map(thread => thread.uri.toString()).join(', ')}.`);
		this.storageService.store(CONTINUE_ON_COMMENTS, commentsToSave, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	removeContinueOnComment(pendingComment: { range: IRange; uri: URI; uniqueOwner: string; isReply?: boolean }): PendingCommentThread | undefined {
		const pendingComments = this._continueOnComments.get(pendingComment.uniqueOwner);
		if (pendingComments) {
			const commentIndex = pendingComments.findIndex(comment => comment.uri.toString() === pendingComment.uri.toString() && Range.equalsRange(comment.range, pendingComment.range) && (pendingComment.isReply === undefined || comment.isReply === pendingComment.isReply));
			if (commentIndex > -1) {
				return pendingComments.splice(commentIndex, 1)[0];
			}
		}
		return undefined;
	}

	private _addContinueOnComments(pendingComments: PendingCommentThread[], map: Map<string, PendingCommentThread[]>): Set<string> {
		const changedOwners = new Set<string>();
		for (const pendingComment of pendingComments) {
			if (!map.has(pendingComment.uniqueOwner)) {
				map.set(pendingComment.uniqueOwner, [pendingComment]);
				changedOwners.add(pendingComment.uniqueOwner);
			} else {
				const commentsForOwner = map.get(pendingComment.uniqueOwner)!;
				if (commentsForOwner.every(comment => (comment.uri.toString() !== pendingComment.uri.toString()) || !Range.equalsRange(comment.range, pendingComment.range))) {
					commentsForOwner.push(pendingComment);
					changedOwners.add(pendingComment.uniqueOwner);
				}
			}
		}
		return changedOwners;
	}

	resourceHasCommentingRanges(resource: URI): boolean {
		return this._commentingRangeResourceHintSchemes.has(resource.scheme) || this._commentingRangeResources.has(resource.toString());
	}
}
