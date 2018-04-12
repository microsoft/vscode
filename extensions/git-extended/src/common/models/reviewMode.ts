/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from './repository';
import { CredentialStore } from '../../credentials';
import { FileChange } from '../treeItems';
import { Comment } from './comment';
import { parseCommitDiff } from '../../review';
import { populatePRDiagnostics, clearPRDiagnostics } from '../../review/FileComments';
import { diff } from '../operation';
import { mapCommentsToHead } from '../diff';
import * as _ from 'lodash';

const REVIEW_STATE = 'git-extended.state';

export interface ReviewState {
	remote: string;
	prNumber: number;
	branch: string;
	head: any;
	base: any;
	fileChanges: any;
	comments: any;
}

export class ReviewMode {
	private _commentProvider: vscode.Disposable;
	private _command: vscode.Disposable;
	private _prNumber: number;
	private _resourceGroups: vscode.SourceControlResourceGroup[] = [];

	constructor(
		private _repository: Repository,
		private _credentialStore: CredentialStore,
		private _workspaceState: vscode.Memento,
		private _gitRepo: any
	) {
		this._commentProvider = null;
		this._command = null;
		_repository.onDidRunGitStatus(e => {
			this.validateState();
		});
		this.validateState();
	}

	async validateState() {
		let branch = this._repository.HEAD.name;
		if (!branch) {
			this.dispose();
			return;
		}

		let state = this._workspaceState.get(`${REVIEW_STATE}:${branch}`) as ReviewState;
		if (!state) { // not in review state
			this.dispose();
			return;
		}

		let remoteName = state.remote;
		let remote = this._repository.remotes.find(remote => remote.remoteName === remoteName);

		if (!remote) {
			this.dispose();
			return;
		}

		if (state.prNumber === this._prNumber) {
			return;
		}

		this._prNumber = state.prNumber;

		// we switch to another PR, let's clean up first.
		this.dispose();
		let fileChanges: FileChange[] = state.fileChanges;
		let comments: Comment[] = state.comments;
		let otcokit = await this._credentialStore.getOctokit(remote);
		this._command = vscode.commands.registerCommand(this._prNumber + '-post', async (id: string, text: string) => {
			try {
				let ret = await otcokit.pullRequests.createCommentReply({
					owner: remote.owner,
					repo: remote.name,
					number: this._prNumber,
					body: text,
					in_reply_to: id
				});
				return {
					body: new vscode.MarkdownString(ret.data.body),
					userName: ret.data.user.login,
					gravatar: ret.data.user.avatar_url
				};
			} catch (e) {
				return null;
			}
		});

		let actions = [
			{
				command: this._prNumber + '-post',
				title: 'Add single comment'
			}
		];

		let localFileChanges = parseCommitDiff(this._repository, state.head.sha, state.base.sha, fileChanges);
		populatePRDiagnostics(this._repository.path, localFileChanges, comments);

		const commentsCache = new Map<String, Comment[]>();
		localFileChanges.forEach(changedItem => {
			let matchingComments = comments.filter(comment => comment.path === changedItem.fileName);
			commentsCache.set(changedItem.filePath.toString(), matchingComments);
		});

		this._commentProvider = vscode.workspace.registerCommentProvider({
			provideComments: async (document: vscode.TextDocument, token: vscode.CancellationToken) => {
				let matchingComments: Comment[];
				if (document.uri.scheme === 'review') {
					// from scm viewlet
					matchingComments = commentsCache.get(document.uri.toString());
				} else if (document.uri.scheme === 'file') {
					// local file
					let fileName = document.uri.path;
					let matchedFiles = localFileChanges.filter(fileChange => path.resolve(this._repository.path, fileChange.fileName) === fileName);
					if (matchedFiles && matchedFiles.length) {
						let matchedFile = matchedFiles[0];
						// last commit sha of pr
						let prHead = state['head'].sha;
						// git diff sha -- fileName
						let contentDiff = await diff(this._repository, matchedFile.fileName, prHead);
						matchingComments = comments.filter(comment => path.resolve(this._repository.path, comment.path) === fileName);
						matchingComments = mapCommentsToHead(contentDiff, matchingComments);
					}
				}

				if (!matchingComments || !matchingComments.length) {
					return [];
				}

				let sections = _.groupBy(matchingComments, comment => comment.position);
				let ret: vscode.CommentThread[] = [];

				for (let i in sections) {
					let comments = sections[i];

					const comment = comments[0];
					const commentAbsolutePosition = comment.diff_hunk_range.start + (comment.position - 1);
					const pos = new vscode.Position(comment.currentPosition ? comment.currentPosition - 1 - 1 : commentAbsolutePosition - /* after line */ 1 - /* it's zero based*/ 1, 0);
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
						actions: actions
					});
				}

				return ret;
			}
		});

		let prChangeResources = localFileChanges.map(fileChange => ({
			resourceUri: vscode.Uri.file(path.resolve(this._repository.path, fileChange.fileName)),
			command: {
				title: 'show diff',
				command: 'vscode.diff',
				arguments: [
					fileChange.parentFilePath,
					fileChange.filePath,
					fileChange.fileName
				]
			}
		}));

		let prGroup: vscode.SourceControlResourceGroup = this._gitRepo.sourceControl.createResourceGroup('pr', 'Changes from PR');
		this._resourceGroups.push(prGroup);
		prGroup.resourceStates = prChangeResources;
	}

	dispose() {
		if (this._command) {
			this._command.dispose();
		}

		if (this._commentProvider) {
			this._commentProvider.dispose();
		}

		clearPRDiagnostics();

		this._resourceGroups.forEach(group => {
			group.dispose();
		});
	}
}