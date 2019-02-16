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
import { CommandsConverter } from './extHostCommands';
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

	private _commentControls: Map<ProviderHandle, ExtHostCommentControl> = new Map<ProviderHandle, ExtHostCommentControl>();

	private _commentControlsByExtension: Map<string, ExtHostCommentControl[]> = new Map<string, ExtHostCommentControl[]>();

	private _documentProviders = new Map<number, HandlerData<vscode.DocumentCommentProvider>>();
	private _workspaceProviders = new Map<number, HandlerData<vscode.WorkspaceCommentProvider>>();

	constructor(
		mainContext: IMainContext,
		private readonly _commandsConverter: CommandsConverter,
		private readonly _documents: ExtHostDocuments,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadComments);
	}

	createCommentControl(extension: IExtensionDescription, id: string, label: string): vscode.CommentControl {
		const handle = ExtHostComments.handlePool++;

		const commentControl = new ExtHostCommentControl(extension, this._proxy, id, label);
		this._commentControls.set(handle, commentControl);

		const commentControls = this._commentControlsByExtension.get(ExtensionIdentifier.toKey(extension.identifier)) || [];
		commentControls.push(commentControl);
		this._commentControlsByExtension.set(ExtensionIdentifier.toKey(extension.identifier), commentControls);

		return commentControl;
	}

	$onActiveCommentWidgetChange(commentControlhandle: number, commentThread: modes.CommentThread, comment: modes.Comment | undefined, input: string): Promise<void> {
		const commentControl = this._commentControls.get(commentControlhandle);

		if (!commentControl) {
			return Promise.resolve(undefined);
		}

		commentControl.$onActiveCommentWidgetChange(commentThread, comment, input);
		return Promise.resolve(undefined);
	}

	$onCommentWidgetInputChange(commentControlhandle: number, value: string): Promise<void> {
		const commentControl = this._commentControls.get(commentControlhandle);

		if (!commentControl || !commentControl.widget) {
			return Promise.resolve(undefined);
		}

		commentControl.widget.$onCommentWidgetInputChange(value);
		return Promise.resolve(undefined);
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
		}).then(commentThread => commentThread ? convertToCommentThread(handlerData.extensionId, handlerData.provider, commentThread, this._commandsConverter) : null);
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
		}).then(commentThread => commentThread ? convertToCommentThread(handlerData.extensionId, handlerData.provider, commentThread, this._commandsConverter) : null);
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
		}).then(commentInfo => commentInfo ? convertCommentInfo(handle, handlerData.extensionId, handlerData.provider, commentInfo, this._commandsConverter) : null);
	}

	$provideWorkspaceComments(handle: number): Promise<modes.CommentThread[] | null> {
		const handlerData = this._workspaceProviders.get(handle);
		if (!handlerData) {
			return Promise.resolve(null);
		}

		return asPromise(() => {
			return handlerData.provider.provideWorkspaceComments(CancellationToken.None);
		}).then(comments =>
			comments.map(comment => convertToCommentThread(handlerData.extensionId, handlerData.provider, comment, this._commandsConverter)
			));
	}

	private registerListeners(handle: number, extensionId: ExtensionIdentifier, provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider) {
		provider.onDidChangeCommentThreads(event => {

			this._proxy.$onDidCommentThreadsChange(handle, {
				changed: event.changed.map(thread => convertToCommentThread(extensionId, provider, thread, this._commandsConverter)),
				added: event.added.map(thread => convertToCommentThread(extensionId, provider, thread, this._commandsConverter)),
				removed: event.removed.map(thread => convertToCommentThread(extensionId, provider, thread, this._commandsConverter)),
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
	get range(): vscode.Range {
		return this._range;
	}
	get comments(): vscode.Comment[] {
		return this._comments;
	}

	collapsibleState?: vscode.CommentThreadCollapsibleState;
	constructor(
		private _proxy: MainThreadCommentsShape,
		private _commentControlHandle: number,
		private _threadId: string,
		private _resource: vscode.Uri,
		private _range: vscode.Range,
		private _comments: vscode.Comment[],
		private _collapseState?: vscode.CommentThreadCollapsibleState
	) {
		this._proxy.$createCommentThread(
			this._commentControlHandle,
			this.handle,
			this._threadId,
			this._resource,
			extHostTypeConverter.Range.from(this._range),
			this._comments.map(convertToModeComment),
			this._collapseState
		);
	}

	getComment(commentId: string): vscode.Comment | undefined {
		let comments = this._comments.filter(comment => comment.commentId === commentId);

		if (comments && comments.length) {
			return comments[0];
		}

		return;
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

	constructor(
		public commentThread: vscode.CommentThread,
		public comment: vscode.Comment | undefined,
		input: string
		) {
		this._input = input;
	}

	$onCommentWidgetInputChange(value: string) {
		this.updateValue(value);
	}

	private updateValue(value: string): void {
		this._input = value;
		this._onDidChangeInput.fire(value);
	}
}

class ExtHostCommentControl implements vscode.CommentControl {
	private static _handlePool: number = 0;

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	public widget?: ExtHostCommentWidget;

	private handle: number = ExtHostCommentControl._handlePool++;
	private _threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();

	constructor(
		_extension: IExtensionDescription,
		private _proxy: MainThreadCommentsShape,
		private _id: string,
		private _label: string
	) {
		this._proxy.$registerCommentControl(this.handle, _id, _label);
	}

	createCommentThread(id: string, resource: vscode.Uri, range: vscode.Range, comments: vscode.Comment[], collapsibleState?: vscode.CommentThreadCollapsibleState): vscode.CommentThread {
		const commentThread = new ExtHostCommentThread(this._proxy, this.handle, id, resource, range, comments, collapsibleState);
		this._threads.set(commentThread.handle, commentThread);

		return commentThread;
	}

	$onActiveCommentWidgetChange(commentThread: modes.CommentThread, comment: modes.Comment | undefined, input: string) {
		let extHostCommentThread = this._threads.get(commentThread.commentThreadHandle);

		const extHostCommentWidget = new ExtHostCommentWidget(
			extHostCommentThread,
			comment ? extHostCommentThread.getComment(comment.commentId) : undefined,
			input
		);

		this.widget = extHostCommentWidget;
	}

	dispose(): void {
		throw new Error('Method not implemented.');
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
	let userIconPath: URI;
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

function convertToModeComment(vscodeComment: vscode.Comment): modes.Comment {
	const iconPath = vscodeComment.userIconPath ? vscodeComment.userIconPath.toString() : vscodeComment.gravatar;

	return {
		commentId: vscodeComment.commentId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		userIconPath: iconPath,
		isDraft: vscodeComment.isDraft
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