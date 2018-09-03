/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { asWinJsPromise } from 'vs/base/common/async';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import * as vscode from 'vscode';
import { ExtHostCommentsShape, IMainContext, MainContext, MainThreadCommentsShape } from './extHost.protocol';
import { CommandsConverter } from './extHostCommands';
import { IRange } from 'vs/editor/common/core/range';

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

	$createNewCommentThread(handle: number, uri: UriComponents, range: IRange, text: string): TPromise<modes.CommentThread> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		const ran = <vscode.Range>extHostTypeConverter.Range.to(range);

		if (!data || !data.document) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => {
			let provider = this._documentProviders.get(handle);
			return provider.createNewCommentThread(data.document, ran, text, token);
		}).then(commentThread => commentThread ? convertToCommentThread(commentThread, this._commandsConverter) : null);
	}

	$replyToCommentThread(handle: number, uri: UriComponents, range: IRange, thread: modes.CommentThread, text: string): TPromise<modes.CommentThread> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		const ran = <vscode.Range>extHostTypeConverter.Range.to(range);

		if (!data || !data.document) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => {
			let provider = this._documentProviders.get(handle);
			return provider.replyToCommentThread(data.document, ran, convertFromCommentThread(thread), text, token);
		}).then(commentThread => commentThread ? convertToCommentThread(commentThread, this._commandsConverter) : null);
	}

	$provideDocumentComments(handle: number, uri: UriComponents): TPromise<modes.CommentInfo> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		if (!data || !data.document) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => {
			let provider = this._documentProviders.get(handle);
			return provider.provideDocumentComments(data.document, token);
		})
			.then(commentInfo => commentInfo ? convertCommentInfo(handle, commentInfo, this._commandsConverter) : null);
	}

	$provideWorkspaceComments(handle: number): TPromise<modes.CommentThread[]> {
		const provider = this._workspaceProviders.get(handle);
		if (!provider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => {
			return provider.provideWorkspaceComments(token);
		}).then(comments =>
			comments.map(x => convertToCommentThread(x, this._commandsConverter)
			));
	}

	private registerListeners(handle: number, provider: vscode.DocumentCommentProvider | vscode.WorkspaceCommentProvider) {
		provider.onDidChangeCommentThreads(event => {

			this._proxy.$onDidCommentThreadsChange(handle, {
				owner: handle,
				changed: event.changed.map(x => convertToCommentThread(x, this._commandsConverter)),
				added: event.added.map(x => convertToCommentThread(x, this._commandsConverter)),
				removed: event.removed.map(x => convertToCommentThread(x, this._commandsConverter))
			});
		});
	}
}

function convertCommentInfo(owner: number, vscodeCommentInfo: vscode.CommentInfo, commandsConverter: CommandsConverter): modes.CommentInfo {
	return {
		owner: owner,
		threads: vscodeCommentInfo.threads.map(x => convertToCommentThread(x, commandsConverter)),
		commentingRanges: vscodeCommentInfo.commentingRanges ? vscodeCommentInfo.commentingRanges.map(range => extHostTypeConverter.Range.from(range)) : []
	};
}

function convertToCommentThread(vscodeCommentThread: vscode.CommentThread, commandsConverter: CommandsConverter): modes.CommentThread {
	return {
		threadId: vscodeCommentThread.threadId,
		resource: vscodeCommentThread.resource.toString(),
		range: extHostTypeConverter.Range.from(vscodeCommentThread.range),
		comments: vscodeCommentThread.comments.map(comment => convertToComment(comment, commandsConverter)),
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
		gravatar: comment.gravatar
	};
}

function convertToComment(vscodeComment: vscode.Comment, commandsConverter: CommandsConverter): modes.Comment {
	return {
		commentId: vscodeComment.commentId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		gravatar: vscodeComment.gravatar,
		command: vscodeComment.command ? commandsConverter.toInternal(vscodeComment.command) : null
	};
}
