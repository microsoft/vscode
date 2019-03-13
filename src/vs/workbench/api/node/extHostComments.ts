/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asPromise } from 'vs/base/common/async';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import * as types from 'vs/workbench/api/node/extHostTypes';
import * as vscode from 'vscode';
import { ExtHostCommentsShape, IMainContext, MainContext, MainThreadCommentsShape } from './extHost.protocol';
import { CommandsConverter, ExtHostCommands } from './extHostCommands';
import { IRange } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';

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

	$onCommentWidgetInputChange(commentControllerHandle: number, input: string): Promise<number | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return Promise.resolve(undefined);
		}

		commentController.$onCommentWidgetInputChange(input);
		return Promise.resolve(commentControllerHandle);
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

	$createNewCommentWidgetCallback(commentControllerHandle: number, uriComponents: UriComponents, range: IRange, token: CancellationToken): void {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.emptyCommentThreadFactory) {
			return;
		}

		const document = this._documents.getDocument(URI.revive(uriComponents));
		commentController.emptyCommentThreadFactory.createEmptyCommentThread(document, extHostTypeConverter.Range.to(range));
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
	get threadId(): string {
		return this._threadId;
	}

	get resource(): vscode.Uri {
		return this._resource;
	}

	set range(range: vscode.Range) {
		this._range = range;
		this._proxy.$updateCommentThreadRange(this._commentControlHandle, this.handle, extHostTypeConverter.Range.from(this._range));
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
		this._proxy.$updateCommentThreadLabel(this._commentControlHandle, this.handle, this._label);
	}

	private _comments: vscode.Comment[] = [];

	get comments(): vscode.Comment[] {
		return this._comments;
	}

	set comments(newComments: vscode.Comment[]) {
		this._proxy.$updateComments(this._commentControlHandle, this.handle, newComments.map(cmt => { return convertToModeComment(cmt, this._commandsConverter); }));
		this._comments = newComments;
	}

	private _acceptInputCommand: vscode.Command;
	get acceptInputCommand(): vscode.Command {
		return this._acceptInputCommand;
	}

	set acceptInputCommand(acceptInputCommand: vscode.Command) {
		this._acceptInputCommand = acceptInputCommand;

		const internal = this._commandsConverter.toInternal(acceptInputCommand);
		this._proxy.$updateCommentThreadAcceptInputCommand(this._commentControlHandle, this.handle, internal);
	}

	private _additionalCommands: vscode.Command[] = [];
	get additionalCommands(): vscode.Command[] {
		return this._additionalCommands;
	}

	set additionalCommands(additionalCommands: vscode.Command[]) {
		this._additionalCommands = additionalCommands;

		const internals = additionalCommands.map(x => this._commandsConverter.toInternal(x));
		this._proxy.$updateCommentThreadAdditionalCommands(this._commentControlHandle, this.handle, internals);
	}

	private _collapseState?: vscode.CommentThreadCollapsibleState;

	get collapsibleState(): vscode.CommentThreadCollapsibleState {
		return this._collapseState;
	}

	set collapsibleState(newState: vscode.CommentThreadCollapsibleState) {
		this._collapseState = newState;
		this._proxy.$updateCommentThreadCollapsibleState(this._commentControlHandle, this.handle, convertToCollapsibleState(newState));
	}

	constructor(
		private _proxy: MainThreadCommentsShape,
		private readonly _commandsConverter: CommandsConverter,
		private _commentControlHandle: number,
		private _threadId: string,
		private _resource: vscode.Uri,
		private _range: vscode.Range
	) {
		this._proxy.$createCommentThread(
			this._commentControlHandle,
			this.handle,
			this._threadId,
			this._resource,
			extHostTypeConverter.Range.from(this._range),
			this._comments.map(comment => { return convertToModeComment(comment, this._commandsConverter); }),
			this._acceptInputCommand ? this._commandsConverter.toInternal(this._acceptInputCommand) : undefined,
			this._additionalCommands ? this._additionalCommands.map(x => this._commandsConverter.toInternal(x)) : [],
			this._collapseState
		);
	}

	getComment(commentId: string): vscode.Comment | undefined {
		const comments = this._comments.filter(comment => comment.commentId === commentId);

		if (comments && comments.length) {
			return comments[0];
		}

		return undefined;
	}

	dispose() {
		this._proxy.$deleteCommentThread(
			this._commentControlHandle,
			this.handle
		);
	}

}

export class ExtHostCommentInputBox implements vscode.CommentInputBox {
	private _onDidChangeValue = new Emitter<string>();

	get onDidChangeValue(): Event<string> {
		return this._onDidChangeValue.event;
	}
	private _value: string = '';
	get value(): string {
		return this._value;
	}

	set value(newInput: string) {
		this._value = newInput;
		this._onDidChangeValue.fire(this._value);
		this._proxy.$setInputValue(this.commentControllerHandle, newInput);
	}

	constructor(
		private _proxy: MainThreadCommentsShape,

		public commentControllerHandle: number,
		input: string
	) {
		this._value = input;
	}

	setInput(input: string) {
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

	public inputBox?: ExtHostCommentInputBox;
	public activeCommentingRange?: vscode.Range;

	public get handle(): number {
		return this._handle;
	}

	private _threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();
	commentingRangeProvider?: vscode.CommentingRangeProvider;
	emptyCommentThreadFactory: vscode.EmptyCommentThreadFactory;

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

	createCommentThread(id: string, resource: vscode.Uri, range: vscode.Range): vscode.CommentThread {
		const commentThread = new ExtHostCommentThread(this._proxy, this._commandsConverter, this.handle, id, resource, range);
		this._threads.set(commentThread.handle, commentThread);
		return commentThread;
	}

	$onCommentWidgetInputChange(input: string) {
		if (!this.inputBox) {
			this.inputBox = new ExtHostCommentInputBox(this._proxy, this.handle, input);
		} else {
			this.inputBox.setInput(input);
		}
	}

	getCommentThread(handle: number) {
		return this._threads.get(handle);
	}

	dispose(): void {
		this._threads.forEach(value => {
			value.dispose();
		});
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
		threadId: vscodeCommentThread.threadId,
		resource: vscodeCommentThread.resource.toString(),
		range: extHostTypeConverter.Range.from(vscodeCommentThread.range),
		comments: vscodeCommentThread.comments.map(comment => convertToComment(provider, comment, commandsConverter)),
		collapsibleState: vscodeCommentThread.collapsibleState
	};
}

function convertFromCommentThread(commentThread: modes.CommentThread): vscode.CommentThread {
	return {
		threadId: commentThread.threadId,
		resource: URI.parse(commentThread.resource),
		range: extHostTypeConverter.Range.to(commentThread.range),
		comments: commentThread.comments.map(convertFromComment),
		collapsibleState: commentThread.collapsibleState
	};
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
		commentId: comment.commentId,
		body: extHostTypeConverter.MarkdownString.to(comment.body),
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
		}) : undefined
	};
}

function convertToModeComment(vscodeComment: vscode.Comment, commandsConverter: CommandsConverter): modes.Comment {
	const iconPath = vscodeComment.userIconPath ? vscodeComment.userIconPath.toString() : vscodeComment.gravatar;

	return {
		commentId: vscodeComment.commentId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		userIconPath: iconPath,
		isDraft: vscodeComment.isDraft,
		editCommand: vscodeComment.editCommand ? commandsConverter.toInternal(vscodeComment.editCommand) : undefined,
		deleteCommand: vscodeComment.editCommand ? commandsConverter.toInternal(vscodeComment.deleteCommand) : undefined,
		label: vscodeComment.label
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
		command: vscodeComment.command ? commandsConverter.toInternal(vscodeComment.command) : undefined,
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