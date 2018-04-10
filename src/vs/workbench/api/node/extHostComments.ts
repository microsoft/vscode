/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { asWinJsPromise } from 'vs/base/common/async';
import { values } from 'vs/base/common/map';
import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import * as vscode from 'vscode';
import { flatten } from '../../../base/common/arrays';
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
		return {
			dispose: () => {
				this._proxy.$unregisterCommentProvider(handle);
				this._providers.delete(handle);
			}
		};
	}

	$providerComments(handle: number, uri: UriComponents): TPromise<modes.CommentThread[]> {
		const data = this._documents.getDocumentData(URI.revive(uri));
		if (!data || !data.document) {
			return TPromise.as([]);
		}

		return asWinJsPromise(token => {
			const allProviderResults = values(this._providers).map(provider => provider.provideComments(data.document, token));
			return TPromise.join(allProviderResults);
		})
			.then(flatten)
			.then(comments => comments.map(x => convertCommentThread(x, this._commandsConverter)));
	}
}

function convertCommentThread(vscodeCommentThread: vscode.CommentThread, commandsConverter: CommandsConverter): modes.CommentThread {
	return {
		threadId: vscodeCommentThread.threadId,
		range: extHostTypeConverter.fromRange(vscodeCommentThread.range),
		newCommentRange: extHostTypeConverter.fromRange(vscodeCommentThread.newCommentRange),
		comments: vscodeCommentThread.comments.map(convertComment),
		actions: vscodeCommentThread.actions.map(commandsConverter.toInternal)
	};
}

function convertComment(vscodeComment: vscode.Comment): modes.Comment {
	return {
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		gravatar: vscodeComment.gravatar
	};
}
