/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { asThenable } from 'vs/base/common/async';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import * as vscode from 'vscode';
import { ExtHostCommentsShape, IMainContext, MainContext, MainThreadCommentsShape } from './extHost.protocol';
import { CommandsConverter } from './extHostCommands';
import { IRange } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';

export class ExtHostComments implements ExtHostCommentsShape {
	private static handlePool = 0;

	private _proxy: MainThreadCommentsShape;

	private _documentProviders = new Map<number, vscode.DocumentCommentProvider>();
	private _workspaceProviders = new Map<number, vscode.WorkspaceCommentProvider>();

	constructor(
		mainContext: IMainContext,
		private readonly _commandsConverter: CommandsConverter,
		private readonly _documents: ExtHostDocuments,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadComments);
	}

	registerWorkspaceCommentProvider(
		provider: vscode.WorkspaceCommentProvider
	): vscode.Disposable {
		const handle = ExtHostComments.handlePool++;
		this._workspaceProviders.set(handle, provider);
		this._proxy.$registerWorkspaceCommentProvider(handle);
		this.registerListeners(handle, provider);

		return {
			dispose: () => {
				this._proxy.$unregisterWorkspaceCommentProvider(handle);
				this._workspaceProviders.delete(handle);
			}
		};
	}

	registerDocumentCommentProvider(
		provider: vscode.DocumentCommentProvider
	): vscode.Disposable {
		const handle = ExtHostComments.handlePool++;
		this._documentProviders.set(handle, provider);
		this._proxy.$registerDocumentCommentProvider(handle);
		this.registerListeners(handle, provider);

		return {
			dispose: () => {
				this._proxy.$unregisterDocumentCommentProvider(handle);
				this._documentProviders.delete(handle);
			}
		};
	}

	$createNewCommentThread(handle: number, uri: UriComponents, range: IRange, text: string): Thenable<modes.CommentThread> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		const ran = <vscode.Range>extHostTypeConverter.Range.to(range);

		if (!data || !data.document) {
			return TPromise.as(null);
		}

		const provider = this._documentProviders.get(handle);
		return asThenable(() => {
			return provider.createNewCommentThread(data.document, ran, text, CancellationToken.None);
		}).then(commentThread => commentThread ? convertToCommentThread(provider, commentThread, this._commandsConverter) : null);
	}

	$replyToCommentThread(handle: number, uri: UriComponents, range: IRange, thread: modes.CommentThread, text: string): Thenable<modes.CommentThread> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		const ran = <vscode.Range>extHostTypeConverter.Range.to(range);

		if (!data || !data.document) {
			return TPromise.as(null);
		}

		const provider = this._documentProviders.get(handle);
		return asThenable(() => {
			return provider.replyToCommentThread(data.document, ran, convertFromCommentThread(thread), text, CancellationToken.None);
		}).then(commentThread => commentThread ? convertToCommentThread(provider, commentThread, this._commandsConverter) : null);
	}

	$editComment(handle: number, uri: UriComponents, comment: modes.Comment, text: string): Thenable<modes.Comment> {
		const data = this._documents.getDocumentData(URI.revive(uri));

		if (!data || !data.document) {
			throw new Error('Unable to retrieve document from URI');
		}

		const provider = this._documentProviders.get(handle);
		return asThenable(() => {
			return provider.editComment(data.document, convertFromComment(comment), text, CancellationToken.None);
		}).then(comment => convertToComment(provider, comment, this._commandsConverter));
	}

	$deleteComment(handle: number, uri: UriComponents, comment: modes.Comment): Thenable<void> {
		const data = this._documents.getDocumentData(URI.revive(uri));

		if (!data || !data.document) {
			throw new Error('Unable to retrieve document from URI');
		}

		const provider = this._documentProviders.get(handle);
		return asThenable(() => {
			return provider.deleteComment(data.document, convertFromComment(comment), CancellationToken.None);
		});
	}

	$provideDocumentComments(handle: number, uri: UriComponents): Thenable<modes.CommentInfo> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		if (!data || !data.document) {
			return TPromise.as(null);
		}

		const provider = this._documentProviders.get(handle);
		return asThenable(() => {
			return provider.provideDocumentComments(data.document, CancellationToken.None);
		}).then(commentInfo => commentInfo ? convertCommentInfo(handle, provider, commentInfo, this._commandsConverter) : null);
	}

	$provideWorkspaceComments(handle: number): Thenable<modes.CommentThread[]> {
		const provider = this._workspaceProviders.get(handle);
		if (!provider) {
			return TPromise.as(null);
		}

		return asThenable(() => {
			return provider.provideWorkspaceComments(CancellationToken.None);
		}).then(comments =>
			comments.map(comment => convertToCommentThread(provider, comment, this._commandsConverter)
			));
	}

	private registerListeners(handle: number, provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider) {
		provider.onDidChangeCommentThreads(event => {

			this._proxy.$onDidCommentThreadsChange(handle, {
				owner: handle,
				changed: event.changed.map(thread => convertToCommentThread(provider, thread, this._commandsConverter)),
				added: event.added.map(thread => convertToCommentThread(provider, thread, this._commandsConverter)),
				removed: event.removed.map(thread => convertToCommentThread(provider, thread, this._commandsConverter))
			});
		});
	}
}

function convertCommentInfo(owner: number, provider: vscode.DocumentCommentProvider, vscodeCommentInfo: vscode.CommentInfo, commandsConverter: CommandsConverter): modes.CommentInfo {
	return {
		owner: owner,
		threads: vscodeCommentInfo.threads.map(x => convertToCommentThread(provider, x, commandsConverter)),
		commentingRanges: vscodeCommentInfo.commentingRanges ? vscodeCommentInfo.commentingRanges.map(range => extHostTypeConverter.Range.from(range)) : []
	};
}

function convertToCommentThread(provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider, vscodeCommentThread: vscode.CommentThread, commandsConverter: CommandsConverter): modes.CommentThread {
	return {
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
	return {
		commentId: comment.commentId,
		body: extHostTypeConverter.MarkdownString.to(comment.body),
		userName: comment.userName,
		gravatar: comment.gravatar,
		canEdit: comment.canEdit,
		canDelete: comment.canDelete
	};
}

function convertToComment(provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider, vscodeComment: vscode.Comment, commandsConverter: CommandsConverter): modes.Comment {
	const canEdit = !!(provider as vscode.DocumentCommentProvider).editComment && vscodeComment.canEdit;
	const canDelete = !!(provider as vscode.DocumentCommentProvider).deleteComment && vscodeComment.canDelete;
	return {
		commentId: vscodeComment.commentId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		gravatar: vscodeComment.gravatar,
		canEdit: canEdit,
		canDelete: canDelete,
		command: vscodeComment.command ? commandsConverter.toInternal(vscodeComment.command) : null
	};
}
