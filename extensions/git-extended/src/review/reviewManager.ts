/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from '../common/models/repository';
import { FileChangeTreeItem } from '../common/treeItems';
import { mapCommentsToHead, parseDiff, mapHeadLineToDiffHunkPosition, getDiffLineByPosition, parseDiffHunk, mapOldPositionToNew, getLastDiffLine } from '../common/diff';
import { GitContentProvider } from './gitContentProvider';
import { Comment } from '../common/models/comment';
import { PullRequestModel } from '../common/models/pullRequestModel';
import { toGitUri } from '../common/uri';
import { GitChangeType } from '../common/models/file';
import { FileChangesProvider } from './fileChangesProvider';
import { PullRequestGitHelper } from '../common/pullRequestGitHelper';
import { GitErrorCodes } from '../common/models/gitError';
import { groupBy } from '../common/util';

const REVIEW_STATE = 'git-extended.state';

export interface ReviewState {
	remote: string;
	prNumber: number;
	branch: string;
	head: any;
	base: any;
}

export class ReviewManager implements vscode.DecorationProvider {
	private static _instance: ReviewManager;
	private _documentCommentProvider: vscode.Disposable;
	private _workspaceCommentProvider: vscode.Disposable;
	private _command: vscode.Disposable;
	private _disposables: vscode.Disposable[];

	private _comments: Comment[] = [];
	private _localFileChanges: FileChangeTreeItem[] = [];
	private _obsoleteFileChanges: FileChangeTreeItem[] = [];
	private _lastCommitSha: string;

	private _onDidChangeCommentThreads = new vscode.EventEmitter<vscode.CommentThreadChangedEvent>();

	private _prFileChangesProvider: FileChangesProvider;
	get prFileChangesProvider() {
		if (!this._prFileChangesProvider) {
			this._prFileChangesProvider = new FileChangesProvider(this._context);
			this._disposables.push(this._prFileChangesProvider);
		}

		return this._prFileChangesProvider;
	}

	private _statusBarItem: vscode.StatusBarItem;
	get statusBarItem() {
		if (!this._statusBarItem) {
			this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		}

		return this._statusBarItem;
	}

	private _prNumber: number;
	private _pr: PullRequestModel;

	get currentPullRequest(): PullRequestModel {
		return this._pr;
	}

	private constructor(
		private _context: vscode.ExtensionContext,
		private _repository: Repository,
		private _workspaceState: vscode.Memento
	) {
		this._documentCommentProvider = null;
		this._workspaceCommentProvider = null;
		this._command = null;
		this._disposables = [];
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

	static initialize(
		_context: vscode.ExtensionContext,
		_repository: Repository
	) {
		ReviewManager._instance = new ReviewManager(_context, _repository, _context.workspaceState);
	}

	static get instance() {
		return ReviewManager._instance;
	}

	private pollForStatusChange() {
		setTimeout(async () => {
			await this.updateComments();
			this.pollForStatusChange();
		}, 1000 * 10);
	}

	private async validateState() {
		let matchingPullRequestMetadata = await PullRequestGitHelper.getMatchingPullRequestMetadataForBranch(this._repository, this._repository.HEAD.name);

		if (!matchingPullRequestMetadata) {
			this.clear(true);
			return;
		}

		if (this._prNumber === matchingPullRequestMetadata.prNumber) {
			return;
		}

		let branch = this._repository.HEAD;
		if (!branch) {
			this.clear(true);
			return;
		}

		let remote = branch.upstream ? branch.upstream.remote : null;
		if (!remote) {
			this.clear(true);
			return;
		}

		// we switch to another PR, let's clean up first.
		this.clear(false);
		this._prNumber = matchingPullRequestMetadata.prNumber;
		this._lastCommitSha = null;
		let githubRepo = this._repository.githubRepositories.find(repo =>
			repo.remote.owner.toLocaleLowerCase() === matchingPullRequestMetadata.owner.toLocaleLowerCase()
		);

		if (!githubRepo) {
			return; // todo, should show warning
		}

		const pr = await githubRepo.getPullRequest(this._prNumber);
		if (!pr) {
			console.log('This PR is no longer valid');
			return;
		}
		this._pr = pr;
		if (!this._lastCommitSha) {
			this._lastCommitSha = pr.head.sha;
		}

		await this.getPullRequestData(pr);
		await this.prFileChangesProvider.showPullRequestFileChanges(pr, this._localFileChanges);

		this._onDidChangeDecorations.fire();
		this.registerCommentProvider();

		this.statusBarItem.text = '$(git-branch) Pull Request #' + this._prNumber;
		this.statusBarItem.command = 'pr.openInGitHub';
		this.statusBarItem.show();
		vscode.commands.executeCommand('pr.refreshList');
	}

	private async replyToCommentThread(document: vscode.TextDocument, range: vscode.Range, thread: vscode.CommentThread, text: string) {
		try {
			let ret = await this._pr.createCommentReply(text, thread.threadId);
			thread.comments.push({
				commentId: ret.data.id,
				body: new vscode.MarkdownString(ret.data.body),
				userName: ret.data.user.login,
				gravatar: ret.data.user.avatar_url
			});
			return thread;
		} catch (e) {
			return null;
		}
	}
	private async createNewCommentThread(document: vscode.TextDocument, range: vscode.Range, text: string) {
		try {
			let uri = document.uri;
			let fileName = uri.path;
			let matchedFiles = this._localFileChanges.filter(fileChange => path.resolve(this._repository.path, fileChange.fileName) === fileName);
			if (matchedFiles && matchedFiles.length) {
				let matchedFile = matchedFiles[0];
				// git diff sha -- fileName
				let contentDiff = await this._repository.diff(matchedFile.fileName, this._lastCommitSha);
				let position = mapHeadLineToDiffHunkPosition(matchedFile.patch, contentDiff, range.start.line);

				if (position < 0) {
					return;
				}

				// there is no thread Id, which means it's a new thread
				let ret = await this._pr.createComment(text, matchedFile.fileName, position);

				let comment = {
					commentId: ret.data.id,
					body: new vscode.MarkdownString(ret.data.body),
					userName: ret.data.user.login,
					gravatar: ret.data.user.avatar_url
				};

				let commentThread: vscode.CommentThread = {
					threadId: comment.commentId,
					resource: uri,
					range: range,
					comments: [comment]
				};

				return commentThread;
			}
		} catch (e) {
			return null;
		}
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
		if (!pr) {
			console.log('This PR is no longer valid');
			return;
		}

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

	private async getPullRequestData(pr: PullRequestModel): Promise<void> {
		let comments = await pr.getComments();
		let activeComments = comments.filter(comment => comment.position);
		this._comments = activeComments;
		let outdatedComments = comments.filter(comment => !comment.position);

		const data = await pr.getFiles();
		const baseSha = await pr.getBaseCommitSha();
		const richContentChanges = await parseDiff(data, this._repository, baseSha);
		this._localFileChanges = richContentChanges.map(change => {
			let changedItem = new FileChangeTreeItem(
				pr,
				change.fileName,
				change.status,
				change.fileName,
				change.blobUrl,
				toGitUri(vscode.Uri.parse(change.fileName), null, change.status === GitChangeType.DELETE ? '' : pr.prItem.head.sha, {}),
				toGitUri(vscode.Uri.parse(change.fileName), null, change.status === GitChangeType.ADD ? '' : pr.prItem.base.sha, {}),
				this._repository.path,
				change.patch
			);
			changedItem.comments = this._comments.filter(comment => comment.path === changedItem.fileName);
			return changedItem;
		});

		let commitsGroup = groupBy(outdatedComments, comment => comment.commit_id);
		this._obsoleteFileChanges = [];
		for (let commit in commitsGroup) {
			let commentsForCommit = commitsGroup[commit];
			let commentsForFile = groupBy(commentsForCommit, comment => comment.path);
			for (let fileName in commentsForFile) {
				let oldComments = commentsForFile[fileName];
				let obsoleteFileChange = new FileChangeTreeItem(
					pr,
					fileName,
					GitChangeType.MODIFY,
					fileName,
					null,
					toGitUri(vscode.Uri.parse(fileName), null, oldComments[0].original_commit_id, {}),
					toGitUri(vscode.Uri.parse(fileName), null, oldComments[0].original_commit_id, {}),
					this._repository.path,
					oldComments[0].diff_hunk
				);

				obsoleteFileChange.comments = oldComments;
				this._obsoleteFileChanges.push(obsoleteFileChange);
			}
		}

		return Promise.resolve(null);
	}

	private outdatedCommentsToCommentThreads(fileChange: FileChangeTreeItem, comments: Comment[], collapsibleState: vscode.CommentThreadCollapsibleState = vscode.CommentThreadCollapsibleState.Expanded): vscode.CommentThread[] {
		if (!comments || !comments.length) {
			return [];
		}

		let fileCommentGroups = groupBy(comments, comment => comment.path);
		let ret: vscode.CommentThread[] = [];

		for (let file in fileCommentGroups) {
			let fileComments = fileCommentGroups[file];
			let sections = groupBy(fileComments, comment => String(comment.position));

			for (let i in sections) {
				let comments = sections[i];

				const comment = comments[0];
				let diffLine = getDiffLineByPosition(comment.diff_hunk, comment.position === null ? comment.original_position : comment.position);

				if (diffLine) {
					comment.absolutePosition = diffLine.newLineNumber;
				}

				const pos = new vscode.Position(comment.absolutePosition ? comment.absolutePosition - 1 : 0, 0);
				const range = new vscode.Range(pos, pos);

				ret.push({
					threadId: comment.id,
					resource: fileChange.filePath,
					range,
					comments: comments.map(comment => {
						return {
							commentId: comment.id,
							body: new vscode.MarkdownString(comment.body),
							userName: comment.user.login,
							gravatar: comment.user.avatar_url,
							command: {
								title: 'View Changes',
								command: 'pr.viewChanges',
								arguments: [
									fileChange
								]
							}
						};
					}),
					collapsibleState: collapsibleState
				});
			}

		}
		return ret;
	}

	private commentsToCommentThreads(comments: Comment[], collapsibleState: vscode.CommentThreadCollapsibleState = vscode.CommentThreadCollapsibleState.Expanded): vscode.CommentThread[] {
		if (!comments || !comments.length) {
			return [];
		}

		let fileCommentGroups = groupBy(comments, comment => comment.path);
		let ret: vscode.CommentThread[] = [];

		for (let file in fileCommentGroups) {
			let fileComments = fileCommentGroups[file];
			let sections = groupBy(fileComments, comment => String(comment.position));

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
					collapsibleState: collapsibleState
				});
			}

		}
		return ret;
	}

	_onDidChangeDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
	onDidChangeDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeDecorations.event;
	provideDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DecorationData> {
		if (uri.scheme === 'review') {
			let query = JSON.parse(uri.query);
			let matchingComments = this._comments.filter(comment => comment.path === query.path);
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

	private registerCommentProvider() {
		this._documentCommentProvider = vscode.workspace.registerDocumentCommentProvider({
			onDidChangeCommentThreads: this._onDidChangeCommentThreads.event,
			provideDocumentComments: async (document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CommentInfo> => {
				let ranges: vscode.Range[] = [];
				let matchingComments: Comment[];

				if (document.uri.scheme === 'file') {
					// local file, we only provide active comments.
					const fileName = document.uri.path;
					const matchedFiles = this._localFileChanges.filter(fileChange => path.resolve(this._repository.path, fileChange.fileName) === fileName);
					if (matchedFiles && matchedFiles.length) {
						const matchedFile = matchedFiles[0];

						let contentDiff: string;
						if (document.isDirty) {
							const documentText = document.getText();
							const idAtLastCommit = await this._repository.getFileObjectId(this._lastCommitSha, matchedFile.fileName);
							const idOfCurrentText = await this._repository.hashObject(documentText);

							// git diff <blobid> <blobid>
							contentDiff = await this._repository.diffHashed(idAtLastCommit, idOfCurrentText);
						} else {
							// git diff sha -- fileName
							contentDiff = await this._repository.diff(matchedFile.fileName, this._lastCommitSha);
						}

						matchingComments = this._comments.filter(comment => path.resolve(this._repository.path, comment.path) === fileName);
						matchingComments = mapCommentsToHead(matchedFile.patch, contentDiff, matchingComments);

						let diffHunkReader = parseDiffHunk(matchedFile.patch);
						let diffHunkIter = diffHunkReader.next();

						while (!diffHunkIter.done) {
							let diffHunk = diffHunkIter.value;
							let start = mapOldPositionToNew(contentDiff, diffHunk.newLineNumber);
							let end = mapOldPositionToNew(contentDiff, diffHunk.newLineNumber + diffHunk.newLength - 1);
							if (start > 0 && end > 0) {
								ranges.push(new vscode.Range(start - 1, 0, end - 1, 0));
							}
							diffHunkIter = diffHunkReader.next();
						}
					}

					return {
						threads: this.commentsToCommentThreads(matchingComments, vscode.CommentThreadCollapsibleState.Collapsed),
						commentingRanges: ranges,
					};
				}

				if (document.uri.scheme === 'review') {
					let matchedFile = this.findMatchedFileChange(this._localFileChanges, document.uri);

					if (matchedFile) {
						let matchingComments = matchedFile.comments;
						matchingComments.forEach(comment => {
							let diffLine = getDiffLineByPosition(matchedFile.patch, comment.position === null ? comment.original_position : comment.position);

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

						return {
							threads: this.commentsToCommentThreads(matchingComments, vscode.CommentThreadCollapsibleState.Expanded),
							commentingRanges: ranges,
						};
					}

					// comments are outdated
					matchedFile = this.findMatchedFileChange(this._obsoleteFileChanges, document.uri);
					if (!matchedFile) {
						return null;
					}


					let sections = groupBy(matchedFile.comments, comment => comment.original_position); // comment.position is null in this case.
					let ret: vscode.CommentThread[] = [];
					for (let i in sections) {
						let comments = sections[i];
						const comment = comments[0];
						let diffLine = getLastDiffLine(comment.diff_hunk);
						const pos = new vscode.Position(diffLine.newLineNumber - 1, 0);
						const range = new vscode.Range(pos, pos);

						ret.push({
							threadId: comment.id,
							resource: matchedFile.filePath,
							range,
							comments: comments.map(comment => {
								return {
									commentId: comment.id,
									body: new vscode.MarkdownString(comment.body),
									userName: comment.user.login,
									gravatar: comment.user.avatar_url
								};
							}),
							collapsibleState: vscode.CommentThreadCollapsibleState.Expanded
						});


						return {
							threads: ret
						};
					}
				}
			},
			createNewCommentThread: this.createNewCommentThread.bind(this),
			replyToCommentThread: this.replyToCommentThread.bind(this)
		});

		this._workspaceCommentProvider = vscode.workspace.registerWorkspaceCommentProvider({
			onDidChangeCommentThreads: this._onDidChangeCommentThreads.event,
			provideWorkspaceComments: async (token: vscode.CancellationToken) => {
				const comments = await Promise.all(this._localFileChanges.map(async fileChange => {
					return this.commentsToCommentThreads(fileChange.comments);
				}));
				const outdatedComments = this._obsoleteFileChanges.map(fileChange => {
					return this.outdatedCommentsToCommentThreads(fileChange, fileChange.comments);
				});
				return [...comments, ...outdatedComments].reduce((prev, curr) => prev.concat(curr), []);
			},
			createNewCommentThread: this.createNewCommentThread.bind(this),
			replyToCommentThread: this.replyToCommentThread.bind(this)
		});
	}

	private findMatchedFileChange(fileChanges: FileChangeTreeItem[], uri: vscode.Uri) {
		let query = JSON.parse(uri.query);
		let matchedFiles = fileChanges.filter(fileChange => {
			if (fileChange.fileName !== query.path) {
				return false;
			}

			let q = JSON.parse(fileChange.filePath.query);

			if (q.commit !== query.commit) {
				return false;
			}
			return true;
		});

		if (matchedFiles && matchedFiles.length) {
			return matchedFiles[0];
		}

		return null;
	}

	public async switch(pr: PullRequestModel): Promise<void> {
		let isDirty = await this._repository.isDirty();
		if (isDirty) {
			vscode.window.showErrorMessage('Your local changes would be overwritten by checkout, please commit your changes or stash them before you switch branches');
			return;
		}

		this.statusBarItem.text = '$(sync~spin) Switching to Review Mode';
		this.statusBarItem.command = null;
		this.statusBarItem.show();

		try {
			let localBranchInfo = await PullRequestGitHelper.getBranchForPullRequestFromExistingRemotes(this._repository, pr);

			if (localBranchInfo) {
				await PullRequestGitHelper.checkout(this._repository, localBranchInfo.remote, localBranchInfo.branch, pr);
			} else {
				await PullRequestGitHelper.createAndCheckout(this._repository, pr);
			}
		} catch (e) {
			if (e.gitErrorCode) {
				// for known git errors, we should provide actions for users to continue.
				if (e.gitErrorCode === GitErrorCodes.LocalChangesOverwritten) {
					vscode.window.showErrorMessage('Your local changes would be overwritten by checkout, please commit your changes or stash them before you switch branches');
					return;
				}
			}

			vscode.window.showErrorMessage(e);
			// todo, we should try to recover, for example, git checkout succeeds but set config fails.
			return;
		}

		await this._repository.status();
		await this.validateState();
	}

	private clear(quitReviewMode: boolean) {
		this._prNumber = null;
		this._pr = null;

		if (this._command) {
			this._command.dispose();
		}

		if (this._documentCommentProvider) {
			this._documentCommentProvider.dispose();
		}

		if (this._workspaceCommentProvider) {
			this._workspaceCommentProvider.dispose();
		}

		if (quitReviewMode) {
			if (this._statusBarItem) {
				this._statusBarItem.hide();
			}

			if (this._prFileChangesProvider) {
				this.prFileChangesProvider.hide();
			}
		}

		vscode.commands.executeCommand('pr.refreshList');
	}

	dispose() {
		this.clear(true);
		this._disposables.forEach(dispose => {
			dispose.dispose();
		});
	}
}