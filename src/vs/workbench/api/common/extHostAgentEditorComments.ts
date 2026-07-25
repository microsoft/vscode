/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter } from '../../../base/common/event.js';
import { ExtHostAgentEditorCommentsShape, IAgentEditorCommentDto, IAgentEditorReviewDto, IMainContext, MainContext, MainThreadAgentEditorCommentsShape } from './extHost.protocol.js';
import * as typeConvert from './extHostTypeConverters.js';

class ExtHostAgentEditorCommentsProvider implements vscode.AgentEditorCommentsProvider {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private _comments: readonly vscode.AgentEditorComment[] = [];
	get comments(): readonly vscode.AgentEditorComment[] { return this._comments; }

	private _acceptsComments = false;
	get acceptsComments(): boolean { return this._acceptsComments; }

	private _review: vscode.AgentEditorReview | undefined;
	get review(): vscode.AgentEditorReview | undefined { return this._review; }

	constructor(
		private readonly handle: number,
		private readonly proxy: MainThreadAgentEditorCommentsShape,
		private readonly onDispose: (handle: number) => void
	) { }

	$acceptComments(comments: IAgentEditorCommentDto[], acceptsComments: boolean, review: IAgentEditorReviewDto | undefined): void {
		this._comments = comments.map(comment => Object.freeze({
			id: comment.id,
			range: typeConvert.Range.to(comment.range),
			body: comment.body,
			author: comment.author,
		} satisfies vscode.AgentEditorComment));
		this._acceptsComments = acceptsComments;
		this._review = review;
		this._onDidChange.fire();
	}

	addComment(range: vscode.Range, body: string): void {
		this.proxy.$addComment(this.handle, typeConvert.Range.from(range), body);
	}

	updateCommentRange(id: string, range: vscode.Range): void {
		this.proxy.$updateCommentRange(this.handle, id, typeConvert.Range.from(range));
	}

	deleteComment(id: string): void {
		this.proxy.$deleteComment(this.handle, id);
	}

	updateOverallFeedback(overallFeedback: string): void {
		this.proxy.$updateAgentEditorOverallFeedback(this.handle, overallFeedback);
	}

	submitFeedback(overallFeedback?: string): Thenable<void> {
		return this.proxy.$submitAgentEditorFeedback(this.handle, overallFeedback);
	}

	submitAction(actionId: string): Thenable<void> {
		return this.proxy.$submitAgentEditorAction(this.handle, actionId);
	}

	reject(): Thenable<void> {
		return this.proxy.$rejectAgentEditorReview(this.handle);
	}

	dispose(): void {
		this.proxy.$disposeAgentEditorComments(this.handle);
		this._onDidChange.dispose();
		this.onDispose(this.handle);
	}
}

export class ExtHostAgentEditorComments implements ExtHostAgentEditorCommentsShape {
	private static handlePool = 0;

	private readonly proxy: MainThreadAgentEditorCommentsShape;
	private readonly providers = new Map<number, ExtHostAgentEditorCommentsProvider>();

	constructor(mainContext: IMainContext) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadAgentEditorComments);
	}

	createAgentEditorComments(uri: vscode.Uri): vscode.AgentEditorCommentsProvider {
		const handle = ExtHostAgentEditorComments.handlePool++;
		const provider = new ExtHostAgentEditorCommentsProvider(handle, this.proxy, h => this.providers.delete(h));
		this.providers.set(handle, provider);
		this.proxy.$createAgentEditorComments(handle, uri);
		return provider;
	}

	$acceptAgentEditorComments(handle: number, comments: IAgentEditorCommentDto[], acceptsComments: boolean, review: IAgentEditorReviewDto | undefined): void {
		this.providers.get(handle)?.$acceptComments(comments, acceptsComments, review);
	}
}
