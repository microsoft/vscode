/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from '../common/models/repository';
import { FileChangeTreeItem } from '../common/treeItems';
import { mapCommentsToHead, parseDiff, mapPositionHeadToDiffHunk, getDiffLine, parseDiffHunk, mapDiffHunkToHeadRange } from '../common/diff';
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
}

export class ReviewMode implements vscode.DecorationProvider {
	private _documentCommentProvider: vscode.Disposable;
	private _workspaceCommentProvider: vscode.Disposable;
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
		this._documentCommentProvider = null;
		this._workspaceCommentProvider = null;
		this._command = null;
		this._disposables = [];
		this._commentsCache = new Map<String, Comment[]>();
		this._disposables.push(vscode.workspace.registerTextDocumentContentProvider('review', new GitContentProvider(_repository)));
		this._disposables.push(vscode.commands.registerCommand('review.openFile', (uri: vscode.Uri) => {
			let params = JSON.parse(uri.query);
			vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.resolve(this._repository.path, params.path)), {});
		}));
		this._disposables.push(_repository.onDidRunGitStatus(e => {
			// todo, validate state only when state changes.
			this.validateState();
		}));
		this._disposables.push(vscode.window.registerDecorationProvider(this));
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

		if (this._prNumber === state.prNumber) {
			return;
		}

		this._prNumber = state.prNumber;
		if (!state.head || !state.base) {
			// load pr
			this._lastCommitSha = null;
		} else {
			this._lastCommitSha = state['head'].sha;
		}

		// we switch to another PR, let's clean up first.
		this.clear();
		let githubRepo = this._repository.githubRepositories.find(repo => repo.remote.equals(remote));

		if (!githubRepo) {
			return; // todo, should show warning
		}

		const pr = await githubRepo.getPullRequest(this._prNumber);
		state.base = pr.prItem.base;
		state.head = pr.prItem.head;
		this._workspaceState.update(`${REVIEW_STATE}:${branch}`, state);
		if (!this._lastCommitSha) {
			this._lastCommitSha = state.head.sha;
		}

		await this.getPullRequestData(pr);

		let prChangeResources: vscode.SourceControlResourceState[] = this._localFileChanges.map(fileChange => ({
			resourceUri: fileChange.filePath,
			command: {
				title: 'show diff',
				command: 'vscode.diff',
				arguments: [
					fileChange.parentFilePath,
					fileChange.filePath,
					fileChange.fileName
				]
			},
			decorations: {
				letter: fileChange.letter
			}
		}));

		this._command = vscode.commands.registerCommand(this._prNumber + '-post', async (uri: vscode.Uri, range: vscode.Range, thread: vscode.CommentThread, text: string) => {
			try {
				if (thread && thread.threadId) {
					let ret = await pr.createCommentReply(text, thread.threadId);
					return {
						commentId: ret.data.id,
						body: new vscode.MarkdownString(ret.data.body),
						userName: ret.data.user.login,
						gravatar: ret.data.user.avatar_url
					};
				} else {
					let fileName = uri.path;
					let matchedFiles = this._localFileChanges.filter(fileChange => path.resolve(this._repository.path, fileChange.fileName) === fileName);
					if (matchedFiles && matchedFiles.length) {
						let matchedFile = matchedFiles[0];
						// git diff sha -- fileName
						let contentDiff = await this._repository.diff(matchedFile.fileName, this._lastCommitSha);
						let position = mapPositionHeadToDiffHunk(matchedFile.patch, contentDiff, range.start.line);

						if (position < 0) {
							return;
						}

						// there is no thread Id, which means it's a new thread
						let ret = await pr.createComment(text, matchedFile.fileName, position);

						return {
							commentId: ret.data.id,
							body: new vscode.MarkdownString(ret.data.body),
							userName: ret.data.user.login,
							gravatar: ret.data.user.avatar_url
						};
					}
				}
			} catch (e) {
				return null;
			}
		});

		this._reply = {
			command: this._prNumber + '-post',
			title: 'Add single comment'
		};

		this._onDidChangeDecorations.fire();
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

				if (matchingComment[0].body.value !== oldComment.body.value) {
					return true;
				}
			});

			return false;
		}

		newCommentThreads.forEach(thread => {
			const matchingCommentThread = oldCommentThreads.filter(oldComment => oldComment.threadId === thread.threadId);

			// No old threads match this thread, it is new
			if (matchingCommentThread.length === 0) {
				added.push(thread);
				if (thread.resource.scheme === 'file') {
					thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
				}
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
			this._onDidChangeDecorations.fire();
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

	private commentsToCommentThreads(comments: Comment[], collapsibleState: vscode.CommentThreadCollapsibleState = vscode.CommentThreadCollapsibleState.Expanded): vscode.CommentThread[] {
		if (!comments || !comments.length) {
			return [];
		}

		let fileCommentGroups = _.groupBy(comments, comment => comment.path);
		let ret: vscode.CommentThread[] = [];

		for (let file in fileCommentGroups) {
			let fileComments = fileCommentGroups[file];
			let sections = _.groupBy(fileComments, comment => comment.position);

			for (let i in sections) {
				let comments = sections[i];

				const comment = comments[0];
				const pos = new vscode.Position(comment.absolutePosition ? comment.absolutePosition - 1 : 0, 0);
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
					collapsibleState: collapsibleState,
					reply: this._reply
				});
			}

		}
		return ret;
	}

	_onDidChangeDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
	onDidChangeDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeDecorations.event;
	provideDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DecorationData> {
		if (uri.scheme === 'review') {
			let matchingComments = this._commentsCache.get(uri.toString());
			if (matchingComments && matchingComments.length) {
				return {
					bubble: true,
					abbreviation: '♪♪',
					title: '♪♪'
				};
			}
		} else if (uri.scheme === 'file') {
			// local file
			let fileName = uri.path;
			let matchingComments = this._comments.filter(comment => path.resolve(this._repository.path, comment.path) === fileName);
			if (matchingComments && matchingComments.length) {
				return {
					bubble: true,
					abbreviation: '♪♪',
					title: '♪♪'
				};
			}
		}


		return {};
	}

	registerCommentProvider() {
		this._documentCommentProvider = vscode.workspace.registerDocumentCommentProvider({
			onDidChangeCommentThreads: this._onDidChangeCommentThreads.event,
			provideDocumentComments: async (document: vscode.TextDocument, token: vscode.CancellationToken) => {
				let ranges: vscode.Range[] = [];

				let matchingComments: Comment[];
				if (document.uri.scheme === 'review') {
					// from scm viewlet
					matchingComments = this._commentsCache.get(document.uri.toString());
					let matchedFiles = this._localFileChanges.filter(fileChange => path.resolve(this._repository.path, fileChange.fileName) === document.uri.toString());
					if (matchedFiles && matchedFiles.length) {
						let matchedFile = matchedFiles[0];

						matchingComments.forEach(comment => {
							let diffLine = getDiffLine(matchedFiles[0].patch, comment.position === null ? comment.original_position : comment.position);

							if (diffLine) {
								comment.absolutePosition = diffLine.newLineNumber;
							}
						});

						let diffHunkReader = parseDiffHunk(matchedFile.patch);
						let diffHunkIter = diffHunkReader.next();

						while (!diffHunkIter.done) {
							let diffHunk = diffHunkIter.value;
							ranges.push(new vscode.Range(diffHunk.newLineNumber, 1, diffHunk.newLineNumber + diffHunk.newLength - 1, 1));
							diffHunkIter = diffHunkReader.next();
						}
					}
				} else if (document.uri.scheme === 'file') {
					// local file
					let fileName = document.uri.path;
					let matchedFiles = this._localFileChanges.filter(fileChange => path.resolve(this._repository.path, fileChange.fileName) === fileName);
					if (matchedFiles && matchedFiles.length) {
						let matchedFile = matchedFiles[0];
						// git diff sha -- fileName
						let contentDiff = await this._repository.diff(matchedFile.fileName, this._lastCommitSha);
						matchingComments = this._comments.filter(comment => path.resolve(this._repository.path, comment.path) === fileName);
						matchingComments = mapCommentsToHead(matchedFile.patch, contentDiff, matchingComments);

						let diffHunkReader = parseDiffHunk(matchedFile.patch);
						let diffHunkIter = diffHunkReader.next();

						while (!diffHunkIter.done) {
							let diffHunk = diffHunkIter.value;
							let mappedDiffHunk = mapDiffHunkToHeadRange(diffHunk, contentDiff);
							if (mappedDiffHunk[0] >= 0 && mappedDiffHunk[1] >= 0) {
								ranges.push(new vscode.Range(mappedDiffHunk[0], 1, mappedDiffHunk[1], 1));
							}
							diffHunkIter = diffHunkReader.next();
						}
					}
				}

				return {
					threads: this.commentsToCommentThreads(matchingComments, document.uri.scheme === 'file' ? vscode.CommentThreadCollapsibleState.Collapsed : vscode.CommentThreadCollapsibleState.Expanded),
					commentingRanges: ranges,
					reply: this._reply
				};
			}
		});

		this._workspaceCommentProvider = vscode.workspace.registerWorkspaceCommentProvider({
			onDidChangeCommentThreads: this._onDidChangeCommentThreads.event,
			provideWorkspaceComments: async (token: vscode.CancellationToken) => {
				const comments = await Promise.all(this._localFileChanges.map(async fileChange => {
					return this.commentsToCommentThreads(fileChange.comments);
				}));
				return comments.reduce((prev, curr) => prev.concat(curr), []);
			}
		});
	}

	async switch(pr: PullRequest) {
		try {
			// if (pr.prItem.maintainer_can_modify) {
			// 	await this._repository.checkoutPR(pr);
			// } else {
			await this._repository.fetch(pr.remote.remoteName, `pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}`);
			await this._repository.checkout(`pull-request-${pr.prItem.number}`);
			// }
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

		if (this._documentCommentProvider) {
			this._documentCommentProvider.dispose();
		}

		if (this._workspaceCommentProvider) {
			this._workspaceCommentProvider.dispose();
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