/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asPromise } from 'vs/base/common/async';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/common/extHostTypeConverters';
import * as types from 'vs/workbench/api/common/extHostTypes';
import * as vscode from 'vscode';
import { ExtHostCommentsShape, IMainContext, MainContext, MainThreadCommentsShape } from './extHost.protocol';
import { CommandsConverter, ExtHostCommands } from './extHostCommands';
import { IRange } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { debounce } from 'vs/base/common/decorators';

interface HandlerData<T> {

	extensionId: ExtensionIdentifier;
	provider: T;
}

type ProviderHandle = number;

export class ExtHostComments implements ExtHostCommentsShape {
	private static handlePool = 0;

	private _proxy: MainThreadCommentsShape;

	private _commentControllers: Map<ProviderHandle, ExtHostCommentController> = new Map<ProviderHandle, ExtHostCommentController>();

	private _commentControllersByExtension: Map<string, ExtHostCommentController[]> = new Map<string, ExtHostCommentController[]>();

	private _documentProviders = new Map<number, HandlerData<vscode.DocumentCommentProvider>>();
	private _workspaceProviders = new Map<number, HandlerData<vscode.WorkspaceCommentProvider>>();

	constructor(
		mainContext: IMainContext,
		private _commands: ExtHostCommands,
		private readonly _documents: ExtHostDocuments,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadComments);

		_commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === 6) {
					const commentController = this._commentControllers.get(arg.handle);

					if (!commentController) {
						return arg;
					}

					return commentController;
				} else if (arg && arg.$mid === 7) {
					const commentController = this._commentControllers.get(arg.commentControlHandle);

					if (!commentController) {
						return arg;
					}

					const commentThread = commentController.getCommentThread(arg.commentThreadHandle);

					if (!commentThread) {
						return arg;
					}

					return commentThread;
				} else if (arg && arg.$mid === 8) {
					const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

					if (!commentController) {
						return arg;
					}

					const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

					if (!commentThread) {
						return arg;
					}

					return {
						thread: commentThread,
						text: arg.text
					};
				} else if (arg && arg.$mid === 9) {
					const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

					if (!commentController) {
						return arg;
					}

					const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

					if (!commentThread) {
						return arg;
					}

					let commentUniqueId = arg.commentUniqueId;

					let comment = commentThread.getCommentByUniqueId(commentUniqueId);

					if (!comment) {
						return arg;
					}

					return comment;

				} else if (arg && arg.$mid === 10) {
					const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

					if (!commentController) {
						return arg;
					}

					const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

					if (!commentThread) {
						return arg;
					}

					let body = arg.text;
					let commentUniqueId = arg.commentUniqueId;

					let comment = commentThread.getCommentByUniqueId(commentUniqueId);

					if (!comment) {
						return arg;
					}

					comment.body = body;
					return comment;
				}

				return arg;
			}
		});
	}

	createCommentController(extension: IExtensionDescription, id: string, label: string): vscode.CommentController {
		const handle = ExtHostComments.handlePool++;
		const commentController = new ExtHostCommentController(extension, handle, this._commands.converter, this._proxy, id, label);
		this._commentControllers.set(commentController.handle, commentController);

		const commentControllers = this._commentControllersByExtension.get(ExtensionIdentifier.toKey(extension.identifier)) || [];
		commentControllers.push(commentController);
		this._commentControllersByExtension.set(ExtensionIdentifier.toKey(extension.identifier), commentControllers);

		return commentController;
	}

	$createCommentThreadTemplate(commentControllerHandle: number, uriComponents: UriComponents, range: IRange): void {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return;
		}

		commentController.$createCommentThreadTemplate(uriComponents, range);
	}

	$onCommentWidgetInputChange(commentControllerHandle: number, uriComponents: UriComponents, range: IRange, input: string): Promise<number | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return Promise.resolve(undefined);
		}

		commentController.$onCommentWidgetInputChange(uriComponents, range, input);
		return Promise.resolve(commentControllerHandle);
	}

	$deleteCommentThread(commentControllerHandle: number, commentThreadHandle: number) {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (commentController) {
			commentController.$deleteCommentThread(commentThreadHandle);
		}
	}

	$provideCommentingRanges(commentControllerHandle: number, uriComponents: UriComponents, token: CancellationToken): Promise<IRange[] | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.commentingRangeProvider) {
			return Promise.resolve(undefined);
		}

		const document = this._documents.getDocument(URI.revive(uriComponents));
		return asPromise(() => {
			return commentController.commentingRangeProvider!.provideCommentingRanges(document, token);
		}).then(ranges => ranges ? ranges.map(x => extHostTypeConverter.Range.from(x)) : undefined);
	}

	$provideReactionGroup(commentControllerHandle: number): Promise<modes.CommentReaction[] | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.reactionProvider) {
			return Promise.resolve(undefined);
		}

		return asPromise(() => {
			return commentController!.reactionProvider!.availableReactions;
		}).then(reactions => reactions.map(reaction => convertToReaction2(commentController.reactionProvider, reaction)));
	}

	$toggleReaction(commentControllerHandle: number, threadHandle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.reactionProvider || !commentController.reactionProvider.toggleReaction) {
			return Promise.resolve(undefined);
		}

		return asPromise(() => {
			const commentThread = commentController.getCommentThread(threadHandle);
			if (commentThread) {
				const vscodeComment = commentThread.getComment(comment.commentId);

				if (commentController !== undefined && commentController.reactionProvider && commentController.reactionProvider.toggleReaction && vscodeComment) {
					return commentController.reactionProvider.toggleReaction(document, vscodeComment, convertFromReaction(reaction));
				}
			}

			return Promise.resolve(undefined);
		});
	}

	$createNewCommentWidgetCallback(commentControllerHandle: number, uriComponents: UriComponents, range: IRange, token: CancellationToken): Promise<void> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return Promise.resolve();
		}

		if (!(commentController as any).emptyCommentThreadFactory) {
			return Promise.resolve();
		}

		const document = this._documents.getDocument(URI.revive(uriComponents));
		return asPromise(() => {
			if ((commentController as any).emptyCommentThreadFactory) {
				return (commentController as any).emptyCommentThreadFactory!.createEmptyCommentThread(document, extHostTypeConverter.Range.to(range));
			}
		}).then(() => Promise.resolve());
	}

	$checkStaticContribution(commentControllerHandle: number): Promise<boolean> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return Promise.resolve(false);
		}

		if (!(commentController as any).emptyCommentThreadFactory) {
			return Promise.resolve(true);
		}

		return Promise.resolve(false);
	}

	registerWorkspaceCommentProvider(
		extensionId: ExtensionIdentifier,
		provider: vscode.WorkspaceCommentProvider
	): vscode.Disposable {
		const handle = ExtHostComments.handlePool++;
		this._workspaceProviders.set(handle, {
			extensionId,
			provider
		});
		this._proxy.$registerWorkspaceCommentProvider(handle, extensionId);
		this.registerListeners(handle, extensionId, provider);

		return {
			dispose: () => {
				this._proxy.$unregisterWorkspaceCommentProvider(handle);
				this._workspaceProviders.delete(handle);
			}
		};
	}

	registerDocumentCommentProvider(
		extensionId: ExtensionIdentifier,
		provider: vscode.DocumentCommentProvider
	): vscode.Disposable {
		const handle = ExtHostComments.handlePool++;
		this._documentProviders.set(handle, {
			extensionId,
			provider
		});
		this._proxy.$registerDocumentCommentProvider(handle, {
			startDraftLabel: provider.startDraftLabel,
			deleteDraftLabel: provider.deleteDraftLabel,
			finishDraftLabel: provider.finishDraftLabel,
			reactionGroup: provider.reactionGroup ? provider.reactionGroup.map(reaction => convertToReaction(provider, reaction)) : undefined
		});
		this.registerListeners(handle, extensionId, provider);

		return {
			dispose: () => {
				this._proxy.$unregisterDocumentCommentProvider(handle);
				this._documentProviders.delete(handle);
			}
		};
	}

	$createNewCommentThread(handle: number, uri: UriComponents, range: IRange, text: string): Promise<modes.CommentThread | null> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		const ran = <vscode.Range>extHostTypeConverter.Range.to(range);

		if (!data || !data.document) {
			return Promise.resolve(null);
		}

		const handlerData = this.getDocumentProvider(handle);
		return asPromise(() => {
			return handlerData.provider.createNewCommentThread(data.document, ran, text, CancellationToken.None);
		}).then(commentThread => commentThread ? convertToCommentThread(handlerData.extensionId, handlerData.provider, commentThread, this._commands.converter) : null);
	}

	$replyToCommentThread(handle: number, uri: UriComponents, range: IRange, thread: modes.CommentThread, text: string): Promise<modes.CommentThread | null> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		const ran = <vscode.Range>extHostTypeConverter.Range.to(range);

		if (!data || !data.document) {
			return Promise.resolve(null);
		}

		const handlerData = this.getDocumentProvider(handle);
		return asPromise(() => {
			return handlerData.provider.replyToCommentThread(data.document, ran, convertFromCommentThread(thread), text, CancellationToken.None);
		}).then(commentThread => commentThread ? convertToCommentThread(handlerData.extensionId, handlerData.provider, commentThread, this._commands.converter) : null);
	}

	$editComment(handle: number, uri: UriComponents, comment: modes.Comment, text: string): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this.getDocumentProvider(handle);
		if (!handlerData.provider.editComment) {
			return Promise.reject(new Error('not implemented'));
		}
		return asPromise(() => {
			return handlerData.provider.editComment!(document, convertFromComment(comment), text, CancellationToken.None);
		});
	}

	$deleteComment(handle: number, uri: UriComponents, comment: modes.Comment): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this.getDocumentProvider(handle);
		if (!handlerData.provider.deleteComment) {
			return Promise.reject(new Error('not implemented'));
		}
		return asPromise(() => {
			return handlerData.provider.deleteComment!(document, convertFromComment(comment), CancellationToken.None);
		});
	}

	$startDraft(handle: number, uri: UriComponents): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));

		const handlerData = this.getDocumentProvider(handle);
		if (!handlerData.provider.startDraft) {
			return Promise.reject(new Error('not implemented'));
		}
		return asPromise(() => {
			return handlerData.provider.startDraft!(document, CancellationToken.None);
		});
	}

	$deleteDraft(handle: number, uri: UriComponents): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this.getDocumentProvider(handle);
		if (!handlerData.provider.deleteDraft) {
			return Promise.reject(new Error('not implemented'));
		}
		return asPromise(() => {
			return handlerData.provider.deleteDraft!(document, CancellationToken.None);
		});
	}

	$finishDraft(handle: number, uri: UriComponents): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this.getDocumentProvider(handle);
		if (!handlerData.provider.finishDraft) {
			return Promise.reject(new Error('not implemented'));
		}
		return asPromise(() => {
			return handlerData.provider.finishDraft!(document, CancellationToken.None);
		});
	}

	$addReaction(handle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this.getDocumentProvider(handle);
		if (!handlerData.provider.addReaction) {
			return Promise.reject(new Error('not implemented'));
		}
		return asPromise(() => {
			return handlerData.provider.addReaction!(document, convertFromComment(comment), convertFromReaction(reaction));
		});
	}

	$deleteReaction(handle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this.getDocumentProvider(handle);
		if (!handlerData.provider.deleteReaction) {
			return Promise.reject(new Error('not implemented'));
		}
		return asPromise(() => {
			return handlerData.provider.deleteReaction!(document, convertFromComment(comment), convertFromReaction(reaction));
		});
	}

	$provideDocumentComments(handle: number, uri: UriComponents): Promise<modes.CommentInfo | null> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this.getDocumentProvider(handle);
		return asPromise(() => {
			return handlerData.provider.provideDocumentComments(document, CancellationToken.None);
		}).then(commentInfo => commentInfo ? convertCommentInfo(handle, handlerData.extensionId, handlerData.provider, commentInfo, this._commands.converter) : null);
	}

	$provideWorkspaceComments(handle: number): Promise<modes.CommentThread[] | null> {
		const handlerData = this._workspaceProviders.get(handle);
		if (!handlerData) {
			return Promise.resolve(null);
		}

		return asPromise(() => {
			return handlerData.provider.provideWorkspaceComments(CancellationToken.None);
		}).then(comments =>
			comments.map(comment => convertToCommentThread(handlerData.extensionId, handlerData.provider, comment, this._commands.converter)
			));
	}

	private registerListeners(handle: number, extensionId: ExtensionIdentifier, provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider) {
		provider.onDidChangeCommentThreads(event => {

			this._proxy.$onDidCommentThreadsChange(handle, {
				changed: event.changed.map(thread => convertToCommentThread(extensionId, provider, thread, this._commands.converter)),
				added: event.added.map(thread => convertToCommentThread(extensionId, provider, thread, this._commands.converter)),
				removed: event.removed.map(thread => convertToCommentThread(extensionId, provider, thread, this._commands.converter)),
				draftMode: !!(provider as vscode.DocumentCommentProvider).startDraft && !!(provider as vscode.DocumentCommentProvider).finishDraft ? (event.inDraftMode ? modes.DraftMode.InDraft : modes.DraftMode.NotInDraft) : modes.DraftMode.NotSupported
			});
		});
	}

	private getDocumentProvider(handle: number): HandlerData<vscode.DocumentCommentProvider> {
		const provider = this._documentProviders.get(handle);
		if (!provider) {
			throw new Error('unknown provider');
		}
		return provider;
	}
}

export class ExtHostCommentThread implements vscode.CommentThread {
	private static _handlePool: number = 0;
	readonly handle = ExtHostCommentThread._handlePool++;
	public commentHandle: number = 0;

	set threadId(id: string) {
		this._id = id;
	}

	get threadId(): string {
		return this._id!;
	}

	get id(): string {
		return this._id!;
	}

	get resource(): vscode.Uri {
		return this._uri;
	}

	get uri(): vscode.Uri {
		return this._uri;
	}

	private _onDidUpdateCommentThread = new Emitter<void>();
	readonly onDidUpdateCommentThread = this._onDidUpdateCommentThread.event;

	set range(range: vscode.Range) {
		if (!range.isEqual(this._range)) {
			this._range = range;
			this._onDidUpdateCommentThread.fire();
		}
	}

	get range(): vscode.Range {
		return this._range;
	}

	private _label: string;

	get label(): string {
		return this._label;
	}

	set label(label: string) {
		this._label = label;
		this._onDidUpdateCommentThread.fire();
	}

	private _contextValue: string | undefined;

	get contextValue(): string | undefined {
		return this._contextValue;
	}

	set contextValue(context: string | undefined) {
		this._contextValue = context;
		this._onDidUpdateCommentThread.fire();
	}

	get comments(): vscode.Comment[] {
		return this._comments;
	}

	set comments(newComments: vscode.Comment[]) {
		this._comments = newComments;
		this._onDidUpdateCommentThread.fire();
	}

	private _acceptInputCommand: vscode.Command;
	get acceptInputCommand(): vscode.Command {
		return this._acceptInputCommand;
	}

	set acceptInputCommand(acceptInputCommand: vscode.Command) {
		this._acceptInputCommand = acceptInputCommand;
		this._onDidUpdateCommentThread.fire();
	}

	private _additionalCommands: vscode.Command[] = [];
	get additionalCommands(): vscode.Command[] {
		return this._additionalCommands;
	}

	set additionalCommands(additionalCommands: vscode.Command[]) {
		this._additionalCommands = additionalCommands;
		this._onDidUpdateCommentThread.fire();
	}

	private _deleteCommand?: vscode.Command;
	get deleteComand(): vscode.Command | undefined {
		return this._deleteCommand;
	}

	set deleteCommand(deleteCommand: vscode.Command) {
		this._deleteCommand = deleteCommand;
		this._onDidUpdateCommentThread.fire();
	}

	private _collapseState?: vscode.CommentThreadCollapsibleState;

	get collapsibleState(): vscode.CommentThreadCollapsibleState {
		return this._collapseState!;
	}

	set collapsibleState(newState: vscode.CommentThreadCollapsibleState) {
		this._collapseState = newState;
		this._onDidUpdateCommentThread.fire();
	}

	private _localDisposables: types.Disposable[];

	private _isDiposed: boolean;

	public get isDisposed(): boolean {
		return this._isDiposed;
	}

	private _commentsMap: Map<vscode.Comment, number> = new Map<vscode.Comment, number>();

	constructor(
		private _proxy: MainThreadCommentsShape,
		private readonly _commandsConverter: CommandsConverter,
		private _commentController: ExtHostCommentController,
		private _id: string | undefined,
		private _uri: vscode.Uri,
		private _range: vscode.Range,
		private _comments: vscode.Comment[]
	) {
		if (this._id === undefined) {
			this._id = `${_commentController.id}.${this.handle}`;
		}

		this._proxy.$createCommentThread(
			this._commentController.handle,
			this.handle,
			this._id,
			this._uri,
			extHostTypeConverter.Range.from(this._range)
		);

		this._localDisposables = [];
		this._isDiposed = false;

		this._localDisposables.push(this.onDidUpdateCommentThread(() => {
			this.eventuallyUpdateCommentThread();
		}));

		// set up comments after ctor to batch update events.
		this.comments = _comments;
	}

	@debounce(100)
	eventuallyUpdateCommentThread(): void {
		const commentThreadRange = extHostTypeConverter.Range.from(this._range);
		const label = this.label;
		const contextValue = this.contextValue;
		const comments = this._comments.map(cmt => { return convertToModeComment2(this, this._commentController, cmt, this._commandsConverter, this._commentsMap); });
		const acceptInputCommand = this._acceptInputCommand ? this._commandsConverter.toInternal(this._acceptInputCommand) : undefined;
		const additionalCommands = this._additionalCommands ? this._additionalCommands.map(x => this._commandsConverter.toInternal(x)) : [];
		const deleteCommand = this._deleteCommand ? this._commandsConverter.toInternal(this._deleteCommand) : undefined;
		const collapsibleState = convertToCollapsibleState(this._collapseState);

		this._proxy.$updateCommentThread(
			this._commentController.handle,
			this.handle,
			this._id!,
			this._uri,
			commentThreadRange,
			label,
			contextValue,
			comments,
			acceptInputCommand,
			additionalCommands,
			deleteCommand,
			collapsibleState
		);
	}

	getComment(commentId: string): vscode.Comment | undefined {
		const comments = this._comments.filter(comment => comment.commentId === commentId);

		if (comments && comments.length) {
			return comments[0];
		}

		return undefined;
	}

	getCommentByUniqueId(uniqueId: number): vscode.Comment | undefined {
		for (let key of this._commentsMap) {
			let comment = key[0];
			let id = key[1];
			if (uniqueId === id) {
				return comment;
			}
		}

		return;
	}

	dispose() {
		this._localDisposables.forEach(disposable => disposable.dispose());
		this._proxy.$deleteCommentThread(
			this._commentController.handle,
			this.handle
		);
		this._isDiposed = true;
	}

}

export class ExtHostCommentInputBox implements vscode.CommentInputBox {
	get resource(): vscode.Uri {
		return this._resource;
	}

	get range(): vscode.Range {
		return this._range;
	}

	get value(): string {
		return this._value;
	}

	set value(newInput: string) {
		this._value = newInput;
		this._onDidChangeValue.fire(this._value);
		this._proxy.$setInputValue(this.commentControllerHandle, newInput);
	}

	private _onDidChangeValue = new Emitter<string>();

	get onDidChangeValue(): Event<string> {
		return this._onDidChangeValue.event;
	}

	constructor(
		private _proxy: MainThreadCommentsShape,
		public commentControllerHandle: number,
		private _resource: vscode.Uri,
		private _range: vscode.Range,
		private _value: string
	) {
	}

	setInput(resource: vscode.Uri, range: vscode.Range, input: string) {
		this._resource = resource;
		this._range = range;
		this._value = input;
	}
}
class ExtHostCommentController implements vscode.CommentController {
	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	public inputBox: ExtHostCommentInputBox | undefined;

	public activeCommentingRange?: vscode.Range;

	public get handle(): number {
		return this._handle;
	}

	private _threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();
	commentingRangeProvider?: vscode.CommentingRangeProvider & { createEmptyCommentThread: (document: vscode.TextDocument, range: types.Range) => Promise<vscode.CommentThread>; };

	private _commentReactionProvider?: vscode.CommentReactionProvider;

	get reactionProvider(): vscode.CommentReactionProvider | undefined {
		return this._commentReactionProvider;
	}

	set reactionProvider(provider: vscode.CommentReactionProvider | undefined) {
		this._commentReactionProvider = provider;
		if (provider) {
			this._proxy.$updateCommentControllerFeatures(this.handle, { reactionGroup: provider.availableReactions.map(reaction => convertToReaction2(provider, reaction)) });
		}
	}

	constructor(
		_extension: IExtensionDescription,
		private _handle: number,
		private readonly _commandsConverter: CommandsConverter,
		private _proxy: MainThreadCommentsShape,
		private _id: string,
		private _label: string
	) {
		this._proxy.$registerCommentController(this.handle, _id, _label);
	}

	createCommentThread(resource: vscode.Uri, range: vscode.Range, comments: vscode.Comment[]): vscode.CommentThread;
	createCommentThread(id: string, resource: vscode.Uri, range: vscode.Range, comments: vscode.Comment[]): vscode.CommentThread;
	createCommentThread(arg0: vscode.Uri | string, arg1: vscode.Uri | vscode.Range, arg2: vscode.Range | vscode.Comment[], arg3?: vscode.Comment[]): vscode.CommentThread {
		if (typeof arg0 === 'string') {
			const commentThread = new ExtHostCommentThread(this._proxy, this._commandsConverter, this, arg0, arg1 as vscode.Uri, arg2 as vscode.Range, arg3 as vscode.Comment[]);
			this._threads.set(commentThread.handle, commentThread);
			return commentThread;
		} else {
			const commentThread = new ExtHostCommentThread(this._proxy, this._commandsConverter, this, undefined, arg0 as vscode.Uri, arg1 as vscode.Range, arg2 as vscode.Comment[]);
			this._threads.set(commentThread.handle, commentThread);
			return commentThread;
		}
	}

	$createCommentThreadTemplate(uriComponents: UriComponents, range: IRange) {
		const commentThread = new ExtHostCommentThread(this._proxy, this._commandsConverter, this, undefined, URI.revive(uriComponents), extHostTypeConverter.Range.to(range), []);
		commentThread.collapsibleState = modes.CommentThreadCollapsibleState.Expanded;
		this._threads.set(commentThread.handle, commentThread);
		return commentThread;
	}

	$deleteCommentThread(threadHandle: number) {
		let thread = this._threads.get(threadHandle);

		if (thread) {
			thread.dispose();
		}

		this._threads.delete(threadHandle);
	}

	$onCommentWidgetInputChange(uriComponents: UriComponents, range: IRange, input: string) {
		if (!this.inputBox) {
			this.inputBox = new ExtHostCommentInputBox(this._proxy, this.handle, URI.revive(uriComponents), extHostTypeConverter.Range.to(range), input);
		} else {
			this.inputBox.setInput(URI.revive(uriComponents), extHostTypeConverter.Range.to(range), input);
		}
	}

	getCommentThread(handle: number) {
		return this._threads.get(handle);
	}

	dispose(): void {
		this._threads.forEach(value => {
			value.dispose();
		});

		this._proxy.$unregisterCommentController(this.handle);
	}
}

function convertCommentInfo(owner: number, extensionId: ExtensionIdentifier, provider: vscode.DocumentCommentProvider, vscodeCommentInfo: vscode.CommentInfo, commandsConverter: CommandsConverter): modes.CommentInfo {
	return {
		extensionId: extensionId.value,
		threads: vscodeCommentInfo.threads.map(x => convertToCommentThread(extensionId, provider, x, commandsConverter)),
		commentingRanges: vscodeCommentInfo.commentingRanges ? vscodeCommentInfo.commentingRanges.map(range => extHostTypeConverter.Range.from(range)) : [],
		draftMode: provider.startDraft && provider.finishDraft ? (vscodeCommentInfo.inDraftMode ? modes.DraftMode.InDraft : modes.DraftMode.NotInDraft) : modes.DraftMode.NotSupported
	};
}

function convertToCommentThread(extensionId: ExtensionIdentifier, provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider, vscodeCommentThread: vscode.CommentThread, commandsConverter: CommandsConverter): modes.CommentThread {
	return {
		extensionId: extensionId.value,
		threadId: vscodeCommentThread.id,
		resource: vscodeCommentThread.resource.toString(),
		range: extHostTypeConverter.Range.from(vscodeCommentThread.range),
		comments: vscodeCommentThread.comments.map(comment => convertToComment(provider, comment as vscode.Comment, commandsConverter)),
		collapsibleState: vscodeCommentThread.collapsibleState
	};
}

function convertFromCommentThread(commentThread: modes.CommentThread): vscode.CommentThread {
	return {
		id: commentThread.threadId!,
		threadId: commentThread.threadId!,
		uri: URI.parse(commentThread.resource!),
		resource: URI.parse(commentThread.resource!),
		range: extHostTypeConverter.Range.to(commentThread.range),
		comments: commentThread.comments ? commentThread.comments.map(convertFromComment) : [],
		collapsibleState: commentThread.collapsibleState,
		dispose: () => { }
	} as vscode.CommentThread;
}

function convertFromComment(comment: modes.Comment): vscode.Comment {
	let userIconPath: URI | undefined;
	if (comment.userIconPath) {
		try {
			userIconPath = URI.parse(comment.userIconPath);
		} catch (e) {
			// Ignore
		}
	}

	return {
		id: comment.commentId,
		commentId: comment.commentId,
		body: extHostTypeConverter.MarkdownString.to(comment.body),
		author: {
			name: comment.userName,
			iconPath: userIconPath
		},
		userName: comment.userName,
		userIconPath: userIconPath,
		canEdit: comment.canEdit,
		canDelete: comment.canDelete,
		isDraft: comment.isDraft,
		commentReactions: comment.commentReactions ? comment.commentReactions.map(reaction => {
			return {
				label: reaction.label,
				count: reaction.count,
				hasReacted: reaction.hasReacted
			};
		}) : undefined,
		mode: comment.mode ? comment.mode : modes.CommentMode.Preview
	};
}

function convertToModeComment2(thread: ExtHostCommentThread, commentController: ExtHostCommentController, vscodeComment: vscode.Comment, commandsConverter: CommandsConverter, commentsMap: Map<vscode.Comment, number>): modes.Comment {
	let commentUniqueId = commentsMap.get(vscodeComment)!;
	if (!commentUniqueId) {
		commentUniqueId = ++thread.commentHandle;
		commentsMap.set(vscodeComment, commentUniqueId);
	}

	const iconPath = vscodeComment.author && vscodeComment.author.iconPath ? vscodeComment.author.iconPath.toString() : undefined;

	return {
		commentId: vscodeComment.id || vscodeComment.commentId,
		mode: vscodeComment.mode,
		contextValue: vscodeComment.contextValue,
		uniqueIdInThread: commentUniqueId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.author ? vscodeComment.author.name : vscodeComment.userName,
		userIconPath: iconPath,
		isDraft: vscodeComment.isDraft,
		selectCommand: vscodeComment.selectCommand ? commandsConverter.toInternal(vscodeComment.selectCommand) : undefined,
		editCommand: vscodeComment.editCommand ? commandsConverter.toInternal(vscodeComment.editCommand) : undefined,
		deleteCommand: vscodeComment.deleteCommand ? commandsConverter.toInternal(vscodeComment.deleteCommand) : undefined,
		label: vscodeComment.label,
		commentReactions: vscodeComment.commentReactions ? vscodeComment.commentReactions.map(reaction => convertToReaction2(commentController.reactionProvider, reaction)) : undefined
	};
}

function convertToComment(provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider, vscodeComment: vscode.Comment, commandsConverter: CommandsConverter): modes.Comment {
	const canEdit = !!(provider as vscode.DocumentCommentProvider).editComment && vscodeComment.canEdit;
	const canDelete = !!(provider as vscode.DocumentCommentProvider).deleteComment && vscodeComment.canDelete;
	const iconPath = vscodeComment.userIconPath ? vscodeComment.userIconPath.toString() : vscodeComment.gravatar;

	return {
		commentId: vscodeComment.commentId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		userIconPath: iconPath,
		canEdit: canEdit,
		canDelete: canDelete,
		selectCommand: vscodeComment.command ? commandsConverter.toInternal(vscodeComment.command) : undefined,
		isDraft: vscodeComment.isDraft,
		commentReactions: vscodeComment.commentReactions ? vscodeComment.commentReactions.map(reaction => convertToReaction(provider, reaction)) : undefined
	};
}

function convertToReaction(provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider, reaction: vscode.CommentReaction): modes.CommentReaction {
	const providerCanDeleteReaction = !!(provider as vscode.DocumentCommentProvider).deleteReaction;
	const providerCanAddReaction = !!(provider as vscode.DocumentCommentProvider).addReaction;

	return {
		label: reaction.label,
		iconPath: reaction.iconPath ? extHostTypeConverter.pathOrURIToURI(reaction.iconPath) : undefined,
		count: reaction.count,
		hasReacted: reaction.hasReacted,
		canEdit: (reaction.hasReacted && providerCanDeleteReaction) || (!reaction.hasReacted && providerCanAddReaction)
	};
}

function convertToReaction2(provider: vscode.CommentReactionProvider | undefined, reaction: vscode.CommentReaction): modes.CommentReaction {
	return {
		label: reaction.label,
		iconPath: reaction.iconPath ? extHostTypeConverter.pathOrURIToURI(reaction.iconPath) : undefined,
		count: reaction.count,
		hasReacted: reaction.hasReacted,
		canEdit: provider !== undefined ? !!provider.toggleReaction : false
	};
}

function convertFromReaction(reaction: modes.CommentReaction): vscode.CommentReaction {
	return {
		label: reaction.label,
		count: reaction.count,
		hasReacted: reaction.hasReacted
	};
}

function convertToCollapsibleState(kind: vscode.CommentThreadCollapsibleState | undefined): modes.CommentThreadCollapsibleState {
	if (kind !== undefined) {
		switch (kind) {
			case types.CommentThreadCollapsibleState.Expanded:
				return modes.CommentThreadCollapsibleState.Expanded;
			case types.CommentThreadCollapsibleState.Collapsed:
				return modes.CommentThreadCollapsibleState.Collapsed;
		}
	}
	return modes.CommentThreadCollapsibleState.Collapsed;
}
