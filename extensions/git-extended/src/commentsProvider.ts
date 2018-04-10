/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as _ from 'lodash';
import { Comment } from './common/models/comment';

class PostCommentCommand {
	public static readonly id = 'pr.postComment';

	public static run(id: string, text: string) {
		vscode.window.showInformationMessage(`posty! ${text}`);
	}
}

export interface ICommentsProvider {
	provideComments(uri: vscode.Uri): Promise<Comment[]>;
}

export class CommentsProvider implements vscode.CommentProvider {
	private providers: Map<number, ICommentsProvider>;
	private _id: number;
	constructor() {
		// vscode.workspace.registerTextDocumentContentProvider('review', this);
		this.providers = new Map<number, ICommentsProvider>();
		this._id = 0;
		vscode.workspace.registerCommentProvider(this);

		vscode.commands.registerCommand(PostCommentCommand.id, PostCommentCommand.run);
	}

	registerCommentProvider(provider: ICommentsProvider): number {
		this.providers.set(this._id, provider);
		this._id++;
		return this._id - 1;
	}

	unregisterCommentProvider(id: number) {
		this.providers.delete(id);
	}

	async provideComments(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CommentThread[]> {
		let promises = [];
		this.providers.forEach((value: ICommentsProvider) => {
			promises.push(value.provideComments(document.uri));
		});

		let matchingComments: Comment[] = [];
		let allComments = await Promise.all(promises);
		allComments.forEach(comments => {
			if (comments) {
				matchingComments.push(...comments);
			}
		});

		if (!matchingComments || !matchingComments.length) {
			return [];
		}

		let sections = _.groupBy(matchingComments, comment => comment.position);
		let ret: vscode.CommentThread[] = [];

		for (let i in sections) {
			let comments = sections[i];

			const comment = comments[0];
			const pos = new vscode.Position(comment.diff_hunk_range.start + comment.position - 1 - 1, 0);
			const range = new vscode.Range(pos, pos);
			const newCommentStartPos = new vscode.Position(comment.diff_hunk_range.start - 1, 0);
			const newCommentEndPos = new vscode.Position(comment.diff_hunk_range.start + comment.diff_hunk_range.length - 1 - 1, 0);

			ret.push({
				threadId: comment.id,
				range,
				newCommentRange: new vscode.Range(newCommentStartPos, newCommentEndPos),
				comments: comments.map(comment => {
					return {
						body: new vscode.MarkdownString(comment.body),
						userName: comment.user.login,
						gravatar: comment.user.avatar_url
					};
				}),
				actions: [
					{
						command: PostCommentCommand.id,
						title: 'Post'
					}
				]
			});
		}

		return ret;
	}

	// async provideComments(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<Comment[]> {
	//     let promises = [];
	//     this.providers.forEach((value: ICommentsProvider) => {
	//         promises.push(value.provideComments(uri));
	//     });

	//     let ret: Comment[] = [];
	//     (await Promise.all(promises)).forEach(comments => {
	//         ret.push(...comments);
	//     });

	//     return ret;
	// }
}
