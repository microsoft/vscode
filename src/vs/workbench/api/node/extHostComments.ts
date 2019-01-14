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

interface HandlerData<T> {

	extensionId: ExtensionIdentifier;
	provider: T;
}

export class ExtHostComments implements ExtHostCommentsShape {
	private static handlePool = 0;

	private _proxy: MainThreadCommentsShape;

	private _documentProviders = new Map<number, HandlerData<vscode.DocumentCommentProvider>>();
	private _workspaceProviders = new Map<number, HandlerData<vscode.WorkspaceCommentProvider>>();

	constructor(
		mainContext: IMainContext,
		private readonly _commandsConverter: CommandsConverter,
		private readonly _documents: ExtHostDocuments,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadComments);
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
			finishDraftLabel: provider.finishDraftLabel
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
		const data = this._documents.getDocumentData(URI.revive(uri));

		if (!data || !data.document) {
			throw new Error('Unable to retrieve document from URI');
		}

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.editComment(data.document, convertFromComment(comment), text, CancellationToken.None);
		});
	}

	$deleteComment(handle: number, uri: UriComponents, comment: modes.Comment): Promise<void> {
		const data = this._documents.getDocumentData(URI.revive(uri));

		if (!data || !data.document) {
			throw new Error('Unable to retrieve document from URI');
		}

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.deleteComment(data.document, convertFromComment(comment), CancellationToken.None);
		});
	}

	$startDraft(handle: number, uri: UriComponents): Promise<void> {
		const data = this._documents.getDocumentData(URI.revive(uri));

		if (!data || !data.document) {
			throw new Error('Unable to retrieve document from URI');
		}

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.startDraft(data.document, CancellationToken.None);
		});
	}

	$deleteDraft(handle: number, uri: UriComponents): Promise<void> {
		const data = this._documents.getDocumentData(URI.revive(uri));

		if (!data || !data.document) {
			throw new Error('Unable to retrieve document from URI');
		}

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.deleteDraft(data.document, CancellationToken.None);
		});
	}

	$finishDraft(handle: number, uri: UriComponents): Promise<void> {
		const data = this._documents.getDocumentData(URI.revive(uri));

		if (!data || !data.document) {
			throw new Error('Unable to retrieve document from URI');
		}

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.finishDraft(data.document, CancellationToken.None);
		});
	}

	$provideDocumentComments(handle: number, uri: UriComponents): Promise<modes.CommentInfo> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		if (!data || !data.document) {
			return Promise.resolve(null);
		}

		const handlerData = this._documentProviders.get(handle);
		return asPromise(() => {
			return handlerData.provider.provideDocumentComments(data.document, CancellationToken.None);
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
		isDraft: comment.isDraft
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
		isDraft: vscodeComment.isDraft
	};
}
