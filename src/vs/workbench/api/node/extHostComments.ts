/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { asWinJsPromise } from 'vs/base/common/async';
import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import * as vscode from 'vscode';
import { ExtHostCommentsShape, IMainContext, MainContext, MainThreadCommentsShape } from './extHost.protocol';
import { CommandsConverter } from './extHostCommands';

export class ExtHostComments implements ExtHostCommentsShape {
	private static handlePool = 0;

	private _proxy: MainThreadCommentsShape;

	private _providers = new Map<number, vscode.CommentProvider>();

	constructor(
		mainContext: IMainContext,
		private readonly _commandsConverter: CommandsConverter,
		private readonly _documents: ExtHostDocuments,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadComments);
	}

	registerCommentProvider(
		provider: vscode.CommentProvider
	): vscode.Disposable {
		const handle = ExtHostComments.handlePool++;
		this._providers.set(handle, provider);

		this._proxy.$registerCommentProvider(handle);

		provider.onDidChangeCommentThreads(event => {

			this._proxy.$onDidCommentThreadsChange(handle, {
				changed: event.changed.map(x => convertCommentThread(x, this._commandsConverter)),
				added: event.added.map(x => convertCommentThread(x, this._commandsConverter)),
				removed: event.removed.map(x => convertCommentThread(x, this._commandsConverter))
			});
		});
		return {
			dispose: () => {
				this._proxy.$unregisterCommentProvider(handle);
				this._providers.delete(handle);
			}
		};
	}

	$onDidCommentThreadsChange(handle: number, commentThreadEvent: vscode.CommentThreadChangedEvent) {
		return TPromise.as(null);
	}

	$provideComments(handle: number, uri: UriComponents): TPromise<modes.CommentThread[]> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		if (!data || !data.document) {
			return TPromise.as([]);
		}

		return asWinJsPromise(token => {
			let provider = this._providers.get(handle);
			return provider.provideComments(data.document, token);
		})
			.then(comments => comments.map(x => convertCommentThread(x, this._commandsConverter)));
	}

	$provideAllComments(handle: number): TPromise<modes.CommentThread[]> {
		let provider = this._providers.get(handle);
		// provideAllComments is an optional method
		if (!provider.provideAllComments) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => {

			return provider.provideAllComments(token);
		}).then(comments =>
			comments.map(x => convertCommentThread(x, this._commandsConverter)
			));
	}


	$provideNewCommentRange(handle: number, uri: UriComponents): TPromise<modes.NewCommentAction[]> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		if (!data || !data.document) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => {
			let provider = this._providers.get(handle);
			return provider.provideNewCommentRange(data.document, token);
		})
			.then(newCommentActions => newCommentActions.map(newCommentAction => convertNewCommandAction(newCommentAction, this._commandsConverter)));
	}
}

function convertNewCommandAction(vscodeNewCommentAction: vscode.NewCommentAction, commandsConverter: CommandsConverter): modes.NewCommentAction {
	if (vscodeNewCommentAction) {
		return {
			ranges: vscodeNewCommentAction.ranges.map(range => extHostTypeConverter.fromRange(range)),
			actions: vscodeNewCommentAction.actions.map(commandsConverter.toInternal)
		};
	} else {
		return null;
	}
}

function convertCommentThread(vscodeCommentThread: vscode.CommentThread, commandsConverter: CommandsConverter): modes.CommentThread {
	return {
		threadId: vscodeCommentThread.threadId,
		resource: vscodeCommentThread.resource.toString(),
		range: extHostTypeConverter.fromRange(vscodeCommentThread.range),
		comments: vscodeCommentThread.comments.map(convertComment),
		actions: vscodeCommentThread.actions.map(commandsConverter.toInternal)
	};
}

function convertComment(vscodeComment: vscode.Comment): modes.Comment {
	return {
		commentId: vscodeComment.commentId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		gravatar: vscodeComment.gravatar
	};
}
