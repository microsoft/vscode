/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asPromise } from 'vs/base/common/async';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
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

	$onActiveCommentWidgetChange(commentControllerHandle: number, commentThread: modes.CommentThread2, comment: modes.Comment | undefined, input: string): Promise<number | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return Promise.resolve(undefined);
		}

		commentController.$onActiveCommentWidgetChange(commentThread, comment, input);
		return Promise.resolve(commentControllerHandle);
	}

	$onCommentWidgetInputChange(commentControllerHandle: number, value: string): Promise<void> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.widget) {
			return Promise.resolve(undefined);
		}

		commentController.widget.input = value;
		return Promise.resolve(undefined);
	}

	$onActiveCommentingRangeChange(commentControllerHandle: number, range: IRange) {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return;
		}

		commentController.setActiveCommentingRange(extHostTypeConverter.Range.to(range));
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

		const handlerData = this._documentProviders.get(handle);
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

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.replyToCommentThread(data.document, ran, convertFromCommentThread(thread), text, CancellationToken.None);
		}).then(commentThread => commentThread ? convertToCommentThread(handlerData.extensionId, handlerData.provider, commentThread, this._commands.converter) : null);
	}

	$editComment(handle: number, uri: UriComponents, comment: modes.Comment, text: string): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.editComment(document, convertFromComment(comment), text, CancellationToken.None);
		});
	}

	$deleteComment(handle: number, uri: UriComponents, comment: modes.Comment): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.deleteComment(document, convertFromComment(comment), CancellationToken.None);
		});
	}

	$startDraft(handle: number, uri: UriComponents): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.startDraft(document, CancellationToken.None);
		});
	}

	$deleteDraft(handle: number, uri: UriComponents): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.deleteDraft(document, CancellationToken.None);
		});
	}

	$finishDraft(handle: number, uri: UriComponents): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.finishDraft(document, CancellationToken.None);
		});
	}

	$addReaction(handle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this._documentProviders.get(handle);

		return asPromise(() => {
			return handlerData.provider.addReaction(document, convertFromComment(comment), convertFromReaction(reaction));
		});
	}

	$deleteReaction(handle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.deleteReaction(document, convertFromComment(comment), convertFromReaction(reaction));
		});
	}

	$provideDocumentComments(handle: number, uri: UriComponents): Promise<modes.CommentInfo> {
		const document = this._documents.getDocument(URI.revive(uri));
		const handlerData = this._documentProviders.get(handle);
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

	get comments(): vscode.Comment[] {
		return this._comments;
	}

	set comments(newComments: vscode.Comment[]) {
		this._proxy.$updateComments(this._commentControlHandle, this.handle, newComments.map(cmt => { return convertToModeComment(cmt, this._commandsConverter); }));
		this._comments = newComments;
	}

	get acceptInputCommands(): vscode.Command[] {
		return this._acceptInputCommands;
	}

	set acceptInputCommands(replyCommands: vscode.Command[]) {
		this._acceptInputCommands = replyCommands;

		const internals = replyCommands.map(this._commandsConverter.toInternal.bind(this._commandsConverter));
		this._proxy.$updateCommentThreadCommands(this._commentControlHandle, this.handle, internals);
	}

	collapsibleState?: vscode.CommentThreadCollapsibleState;
	constructor(
		private _proxy: MainThreadCommentsShape,
		private readonly _commandsConverter: CommandsConverter,
		private _commentControlHandle: number,
		private _threadId: string,
		private _resource: vscode.Uri,
		private _range: vscode.Range,
		private _comments: vscode.Comment[],
		private _acceptInputCommands: vscode.Command[],
		private _collapseState?: vscode.CommentThreadCollapsibleState
	) {
		this._proxy.$createCommentThread(
			this._commentControlHandle,
			this.handle,
			this._threadId,
			this._resource,
			extHostTypeConverter.Range.from(this._range),
			this._comments.map(comment => { return convertToModeComment(comment, this._commandsConverter); }),
			this._acceptInputCommands ? this._acceptInputCommands.map(this._commandsConverter.toInternal.bind(this._commandsConverter)) : [],
			this._collapseState
		);
	}

	getComment(commentId: string): vscode.Comment | undefined {
		let comments = this._comments.filter(comment => comment.commentId === commentId);

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
export class ExtHostCommentWidget implements vscode.CommentWidget {

	private _onDidChangeInput = new Emitter<string>();

	get onDidChangeInput(): Event<string> {
		return this._onDidChangeInput.event;
	}

	private _input: string = '';
	get input(): string {
		return this._input;
	}

	set input(newInput: string) {
		this._input = newInput;
		this._onDidChangeInput.fire(this._input);
		this._proxy.$setInputValue(this.commentControlHandle, this.commentThread.handle, newInput);
	}

	constructor(
		private _proxy: MainThreadCommentsShape,

		public commentControlHandle: number,

		public commentThread: ExtHostCommentThread,
		public comment: vscode.Comment | undefined,
		input: string
	) {
		this._input = input;
	}
}

export class ExtHostCommentingRanges implements vscode.CommentingRanges {
	private static _handlePool: number = 0;
	readonly handle = ExtHostCommentingRanges._handlePool++;

	get resource(): vscode.Uri {
		return this._resource;
	}

	get ranges(): vscode.Range[] {
		return this._ranges;
	}

	set ranges(newRanges: vscode.Range[]) {
		this._ranges = newRanges;
		this._proxy.$updateCommentingRanges(this._commentControllerHandle, this.handle, this._ranges.map(extHostTypeConverter.Range.from));
	}

	get newCommentThreadCommand(): vscode.Command {
		return this._command;
	}

	set newCommentThreadCommand(command: vscode.Command) {
		this._command = command;

		const internal = this._commandsConverter.toInternal(command);
		this._proxy.$updateCommentingRangesCommands(this._commentControllerHandle, this.handle, internal);
	}

	constructor(
		private _proxy: MainThreadCommentsShape,
		private readonly _commandsConverter: CommandsConverter,
		private _commentControllerHandle: number,
		private _resource: vscode.Uri,
		private _ranges: vscode.Range[],
		private _command: vscode.Command,
	) {
		this._proxy.$createCommentingRanges(
			this._commentControllerHandle,
			this.handle,
			this._resource,
			this._ranges.map(extHostTypeConverter.Range.from),
			this._commandsConverter.toInternal(this._command)
		);
	}

	dispose() {
		this._proxy.$deleteCommentingRanges(this._commentControllerHandle, this.handle);
	}
}

class ExtHostCommentController implements vscode.CommentController {
	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	public widget?: ExtHostCommentWidget;
	public activeCommentingRange?: vscode.Range;

	public get handle(): number {
		return this._handle;
	}

	private _threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();
	private _commentingRanges: Map<number, ExtHostCommentingRanges> = new Map<number, ExtHostCommentingRanges>();

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

	createCommentThread(id: string, resource: vscode.Uri, range: vscode.Range, comments: vscode.Comment[], acceptInputCommands: vscode.Command[], collapsibleState?: vscode.CommentThreadCollapsibleState): vscode.CommentThread {
		const commentThread = new ExtHostCommentThread(this._proxy, this._commandsConverter, this.handle, id, resource, range, comments, acceptInputCommands, collapsibleState);
		this._threads.set(commentThread.handle, commentThread);
		return commentThread;
	}

	$onActiveCommentWidgetChange(commentThread: modes.CommentThread2, comment: modes.Comment | undefined, input: string) {
		let extHostCommentThread = this._threads.get(commentThread.commentThreadHandle);

		const extHostCommentWidget = new ExtHostCommentWidget(
			this._proxy,
			this.handle,
			extHostCommentThread,
			comment ? extHostCommentThread.getComment(comment.commentId) : undefined,
			input || ''
		);

		this.widget = extHostCommentWidget;
	}

	createCommentingRanges(resource: vscode.Uri, ranges: vscode.Range[], newCommentThreadCommand: vscode.Command): vscode.CommentingRanges {
		const commentingRange = new ExtHostCommentingRanges(this._proxy, this._commandsConverter, this.handle, resource, ranges, newCommentThreadCommand);
		this._commentingRanges.set(commentingRange.handle, commentingRange);
		return commentingRange;
	}

	setActiveCommentingRange(range: vscode.Range) {
		this.activeCommentingRange = range;
	}

	getCommentThread(handle: number) {
		return this._threads.get(handle);
	}

	dispose(): void {
		this._threads.forEach(value => {
			value.dispose();
		});
		this._commentingRanges.forEach(value => {
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
		deleteCommand: vscodeComment.editCommand ? commandsConverter.toInternal(vscodeComment.deleteCommand) : undefined
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
		command: vscodeComment.command ? commandsConverter.toInternal(vscodeComment.command) : null,
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