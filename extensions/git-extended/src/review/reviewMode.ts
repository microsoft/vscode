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
import { Comment } from '../common/models/comment';
import { PullRequest } from '../common/models/pullrequest';
import { toGitUri } from '../common/uri';
import { GitChangeType } from '../common/models/file';

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

	private _comments: Comment[] = [];
	private _commentsCache: Map<String, Comment[]>;
	private _localFileChanges: FileChangeTreeItem[] = [];
	private _reply: vscode.Command = null;
	private _lastCommitSha: string;

	private _onDidChangeCommentThreads = new vscode.EventEmitter<vscode.CommentThreadChangedEvent>();
	constructor(
		private _repository: Repository,
		private _workspaceState: vscode.Memento,
		private _gitRepo: any
	) {
		this._commentProvider = null;
		this._command = null;
		this._disposables = [];
		this._commentsCache = new Map<String, Comment[]>();
		this._disposables.push(vscode.workspace.registerTextDocumentContentProvider('review', new GitContentProvider(_repository)));
		this._disposables.push(vscode.commands.registerCommand('review.openFile', (uri: vscode.Uri) => {
			let params = JSON.parse(uri.query);
			vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.resolve(this._repository.path, params.path)), {});
		}));
		this._disposables.push(_repository.onDidRunGitStatus(e => {
			this.validateState();
		}));
		this.validateState();


		this.pollForStatusChange();
	}

	private pollForStatusChange() {
		setTimeout(async () => {
			await this.updateComments();
			this.pollForStatusChange();
		}, 1000 * 10);
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

		this._prNumber = state.prNumber;
		this._lastCommitSha = state['head'].sha;

		// we switch to another PR, let's clean up first.
		this.clear();
		let githubRepo = this._repository.githubRepositories.find(repo => repo.remote.equals(remote));

		if (!githubRepo) {
			return; // todo, should show warning
		}

		const pr = await githubRepo.getPullRequest(this._prNumber);
		await this.getPullRequestData(pr);

		let prChangeResources = this._localFileChanges.map(fileChange => ({
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

		this._command = vscode.commands.registerCommand(this._prNumber + '-post', async (uri: vscode.Uri, range: vscode.Range, thread: vscode.CommentThread, text: string) => {
			try {
				let ret = await pr.createCommentReply(text, thread.threadId);
				return {
					body: new vscode.MarkdownString(ret.data.body),
					userName: ret.data.user.login,
					gravatar: ret.data.user.avatar_url
				};
			} catch (e) {
				return null;
			}
		});

		this._reply = {
			command: this._prNumber + '-post',
			title: 'Add single comment'
		};

		this.registerCommentProvider();

		let prGroup: vscode.SourceControlResourceGroup = this._gitRepo.sourceControl.createResourceGroup('pr', 'Changes from PR');
		this._resourceGroups.push(prGroup);
		prGroup.resourceStates = prChangeResources;
	}

	private async updateComments(): Promise<void> {
		const branch = this._repository.HEAD.name;
		const state = this._workspaceState.get(`${REVIEW_STATE}:${branch}`) as ReviewState;
		if (!state) { return; }

		const remote = this._repository.remotes.find(remote => remote.remoteName === state.remote);
		if (!remote) { return; }

		const githubRepo = this._repository.githubRepositories.find(repo => repo.remote.equals(remote));
		if (!githubRepo) { return; }

		const pr = await githubRepo.getPullRequest(this._prNumber);
		if (pr.prItem.head.sha !== this._lastCommitSha) {
			await vscode.window.showInformationMessage('There are updates available for this branch.');
			// TODO: Have 'Pull' option that will fetch latest from ref branch and apply to read only branch
			// TODO: Prevent repeatedly popping this message up if user has already dismissed it
		}

		const comments = await pr.getComments();

		let added: vscode.CommentThread[] = [];
		let removed: vscode.CommentThread[] = [];
		let changed: vscode.CommentThread[] = [];

		const oldCommentThreads = this.commentsToCommentThreads(this._comments);
		const newCommentThreads = this.commentsToCommentThreads(comments);

		oldCommentThreads.forEach(thread => {
			// No current threads match old thread, it has been removed
			const matchingThreads = newCommentThreads.filter(newThread => newThread.threadId === thread.threadId);
			if (matchingThreads.length === 0) {
				removed.push(thread);
			}
		});

		function commentsEditedInThread(oldComments: vscode.Comment[], newComments: vscode.Comment[]): boolean {
			oldComments.forEach(oldComment => {
				const matchingComment = newComments.filter(newComment => newComment.commentId === oldComment.commentId);
				if (matchingComment.length !== 1) {
					return true;
				}

				if (matchingComment[0].body !== oldComment.body) {
					return true;
				}
			});
			return true;
		}

		newCommentThreads.forEach(thread => {
			const matchingCommentThread = oldCommentThreads.filter(oldComment => oldComment.threadId === thread.threadId);

			// No old threads match this thread, it is new
			if (matchingCommentThread.length === 0) {
				added.push(thread);
			}

			// Check if comment has been updated
			matchingCommentThread.forEach(match => {
				if (match.comments.length !== thread.comments.length || commentsEditedInThread(matchingCommentThread[0].comments, thread.comments)) {
					changed.push(thread);
				}
			});
		});

		if (added.length || removed.length || changed.length) {
			this._onDidChangeCommentThreads.fire({
				added: added,
				removed: removed,
				changed: changed
			});

			this._comments = comments;
		}

		return Promise.resolve(null);
	}

	private async getPullRequestData(pr: PullRequest): Promise<void> {
		this._comments = await pr.getComments();
		const data = await pr.getFiles();
		const baseSha = await pr.getBaseCommitSha();
		const richContentChanges = await parseDiff(data, this._repository, baseSha);
		this._localFileChanges = richContentChanges.map(change => {
			let changedItem = new FileChangeTreeItem(
				pr.prItem,
				change.fileName,
				change.status,
				change.fileName,
				toGitUri(vscode.Uri.parse(change.fileName), null, change.status === GitChangeType.DELETE ? '' : pr.prItem.head.sha, {}),
				toGitUri(vscode.Uri.parse(change.fileName), null, change.status === GitChangeType.ADD ? '' : pr.prItem.base.sha, {}),
				this._repository.path,
				change.patch
			);
			changedItem.comments = this._comments.filter(comment => comment.path === changedItem.fileName);
			return changedItem;
		});

		this._localFileChanges.forEach(changedItem => {
			let matchingComments = this._comments.filter(comment => comment.path === changedItem.fileName);
			this._commentsCache.set(changedItem.filePath.toString(), matchingComments);
		});

		return Promise.resolve(null);
	}

	private commentsToCommentThreads(comments: Comment[]): vscode.CommentThread[] {
		if (!comments || !comments.length) {
			return [];
		}

		let sections = _.groupBy(comments, comment => comment.position);
		let ret: vscode.CommentThread[] = [];

		for (let i in sections) {
			let comments = sections[i];

			const comment = comments[0];
			// If the position is null, the comment is on a line that has been changed. Fall back to using original position.
			const commentPosition = comment.position === null ? comment.original_position : comment.position - 1;
			const commentAbsolutePosition = comment.diff_hunk_range.start + commentPosition;
			const pos = new vscode.Position(comment.currentPosition ? comment.currentPosition - 1 - 1 : commentAbsolutePosition - /* after line */ 1 - /* it's zero based*/ 1, 0);
			const range = new vscode.Range(pos, pos);

			ret.push({
				threadId: comment.id,
				resource: vscode.Uri.file(path.resolve(this._repository.path, comment.path)),
				range,
				comments: comments.map(comment => {
					return {
						commentId: comment.id,
						body: new vscode.MarkdownString(comment.body),
						userName: comment.user.login,
						gravatar: comment.user.avatar_url
					};
				}),
				reply: this._reply
			});
		}

		return ret;
	}

	registerCommentProvider() {
		vscode.workspace.registerCommentProvider({
			onDidChangeCommentThreads: this._onDidChangeCommentThreads.event,
			provideComments: async (document: vscode.TextDocument, token: vscode.CancellationToken) => {
				let lastLine = document.lineCount;
				let lastColumn = document.lineAt(lastLine - 1).text.length;
				let ranges = [
					new vscode.Range(1, 1, lastLine, lastColumn)
				];

				let matchingComments: Comment[];
				if (document.uri.scheme === 'review') {
					// from scm viewlet
					matchingComments = this._commentsCache.get(document.uri.toString());
				} else if (document.uri.scheme === 'file') {
					// local file
					let fileName = document.uri.path;
					let matchedFiles = this._localFileChanges.filter(fileChange => path.resolve(this._repository.path, fileChange.fileName) === fileName);
					if (matchedFiles && matchedFiles.length) {
						let matchedFile = matchedFiles[0];
						// git diff sha -- fileName
						let contentDiff = await this._repository.diff(matchedFile.fileName, this._lastCommitSha);
						matchingComments = this._comments.filter(comment => path.resolve(this._repository.path, comment.path) === fileName);
						matchingComments = mapCommentsToHead(contentDiff, matchingComments);
					}
				}

				return {
					threads: this.commentsToCommentThreads(matchingComments),
					commentingRanges: ranges,
					reply: this._reply
				};
			},
			provideAllComments: async (token: vscode.CancellationToken) => {
				const comments = await Promise.all(this._localFileChanges.map(async fileChange => {
					return this.commentsToCommentThreads(fileChange.comments);
				}));
				return comments.reduce((prev, curr) => prev.concat(curr), []);
			}
		});
	}

	async switch(pr: PullRequest) {
		try {
			if (pr.prItem.maintainer_can_modify) {
				await this._repository.checkoutPR(pr);
			} else {
				await this._repository.fetch(pr.remote.remoteName, `pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}`);
				await this._repository.checkout(`pull-request-${pr.prItem.number}`);
			}
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