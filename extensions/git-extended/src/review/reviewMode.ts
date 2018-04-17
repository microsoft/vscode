/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from '../common/models/repository';
import { FileChangeTreeItem } from '../common/treeItems';
import { mapCommentsToHead, parseDiff } from '../common/diff';
import * as _ from 'lodash';
import { GitContentProvider } from './gitContentProvider';
import { parseCommitDiff } from './fileComments';
import { Comment } from '../common/models/comment';
import { PullRequest } from '../common/models/pullrequest';
import { toPRUri } from '../common/uri';

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
	private _disposables: vscode.Disposable[];

	constructor(
		private _repository: Repository,
		private _workspaceState: vscode.Memento,
		private _gitRepo: any
	) {
		this._commentProvider = null;
		this._command = null;
		this._disposables = [];
		this._disposables.push(vscode.workspace.registerTextDocumentContentProvider('review', new GitContentProvider(_repository)));
		this._disposables.push(vscode.commands.registerCommand('review.openFile', (uri: vscode.Uri) => {
			let params = JSON.parse(uri.query);
			vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.resolve(this._repository.path, params.path)), {});
		}));
		this._disposables.push(_repository.onDidRunGitStatus(e => {
			this.validateState();
		}));
		this.validateState();
	}

	async validateState() {
		let branch = this._repository.HEAD.name;
		if (!branch) {
			this.clear();
			return;
		}

		let state = this._workspaceState.get(`${REVIEW_STATE}:${branch}`) as ReviewState;
		if (!state) { // not in review state
			this.clear();
			return;
		}

		let remoteName = state.remote;
		let remote = this._repository.remotes.find(remote => remote.remoteName === remoteName);

		if (!remote) {
			this.clear();
			return;
		}

		if (state.prNumber === this._prNumber) {
			return;
		}

		this._prNumber = state.prNumber;

		// we switch to another PR, let's clean up first.
		this.clear();
		let githubRepo = this._repository.githubRepositories.find(repo => repo.remote.equals(remote));

		if (!githubRepo) {
			return; // todo, should show warning
		}

		let pr = await githubRepo.getPullRequest(this._prNumber);
		const comments = await pr.getComments();
		const data = await pr.getFiles();
		const baseSha = await pr.getBaseCommitSha();
		const richContentChanges = await parseDiff(data, this._repository, baseSha);
		let fileChanges = richContentChanges.map(change => {
			let fileInRepo = path.resolve(this._repository.path, change.fileName);
			let changedItem = new FileChangeTreeItem(
				pr.prItem,
				change.fileName,
				change.status,
				change.fileName,
				toPRUri(vscode.Uri.file(change.filePath), fileInRepo, change.fileName, true),
				toPRUri(vscode.Uri.file(change.originalFilePath), fileInRepo, change.fileName, false),
				this._repository.path,
				change.patch
			);
			changedItem.comments = comments.filter(comment => comment.path === changedItem.fileName);
			return changedItem;
		});

		this._command = vscode.commands.registerCommand(this._prNumber + '-post', async (id: string, uri: vscode.Uri, lineNumber: number, text: string) => {
			try {
				let ret = await pr.createCommentReply(text, id);
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

		const commentsCache = new Map<String, Comment[]>();
		localFileChanges.forEach(changedItem => {
			let matchingComments = comments.filter(comment => comment.path === changedItem.fileName);
			commentsCache.set(changedItem.filePath.toString(), matchingComments);
		});

		this._commentProvider = vscode.workspace.registerCommentProvider({
			provideNewCommentRange: async (document: vscode.TextDocument, token: vscode.CancellationToken) => {
				if (document.uri.scheme === 'review' || document.uri.scheme === 'file') {
					let lastLine = document.lineCount;
					let lastColumn = document.lineAt(lastLine - 1).text.length;
					return {
						ranges: [
							new vscode.Range(1, 1, lastLine, lastColumn)
						],
						actions: actions
					};
				} else {
					return {
						ranges: [],
						actions: []
					};
				}
			},
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
						let contentDiff = await this._repository.diff(matchedFile.fileName, prHead);
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

					ret.push({
						threadId: comment.id,
						range,
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

	async switch(pr: PullRequest) {
		try {
			await this._repository.fetch(pr.remote.remoteName, `pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}`);
			await this._repository.checkout(`pull-request-${pr.prItem.number}`);
		} catch (e) {
			vscode.window.showErrorMessage(e);
			return;
		}

		this._workspaceState.update(`${REVIEW_STATE}:pull-request-${pr.prItem.number}`, {
			remote: pr.remote.remoteName,
			prNumber: pr.prItem.number,
			branch: `pull-request-${pr.prItem.number}`,
			head: pr.prItem.head,
			base: pr.prItem.base
		}).then(async e => {
			await this._repository.status();
		});
	}

	clear() {
		if (this._command) {
			this._command.dispose();
		}

		if (this._commentProvider) {
			this._commentProvider.dispose();
		}

		this._resourceGroups.forEach(group => {
			group.dispose();
		});
	}

	dispose() {
		this.clear();
		this._disposables.forEach(dispose => {
			dispose.dispose();
		});
	}
}