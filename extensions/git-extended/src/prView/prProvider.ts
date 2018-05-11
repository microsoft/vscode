/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { parseDiff, parseDiffHunk, getDiffLineByPosition, mapHeadLineToDiffHunkPosition } from '../common/diff';
import { Repository } from '../common//models/repository';
import { Comment } from '../common/models/comment';
import * as _ from 'lodash';
import { Configuration } from '../configuration';
import { parseComments } from '../common/comment';
import { PRGroupTreeItem, FileChangeTreeItem, PRGroupActionTreeItem, PRGroupActionType } from '../common/treeItems';
import { Resource } from '../common/resources';
import { toPRUri } from '../common/uri';
import * as fs from 'fs';
import { PullRequestModel, PRType } from '../common/models/pullRequestModel';
import { PullRequestGitHelper } from '../common/pullRequestGitHelper';
import { ReviewManager } from '../review/reviewManager';

export class PRProvider implements vscode.TreeDataProvider<PRGroupTreeItem | PullRequestModel | PRGroupActionTreeItem | FileChangeTreeItem>, vscode.TextDocumentContentProvider, vscode.DecorationProvider {
	private static _instance: PRProvider;
	private _onDidChangeTreeData = new vscode.EventEmitter<PRGroupTreeItem | PullRequestModel | PRGroupActionTreeItem | FileChangeTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	get onDidChange(): vscode.Event<vscode.Uri> { return this._onDidChange.event; }

	private constructor(
		private context: vscode.ExtensionContext,
		private configuration: Configuration,
		private repository: Repository
	) {
		context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('pr', this));
		context.subscriptions.push(vscode.window.registerDecorationProvider(this));
		context.subscriptions.push(vscode.commands.registerCommand('pr.refreshList', _ => {
			this._onDidChangeTreeData.fire();
		}));
		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<PRGroupTreeItem | PullRequestModel | PRGroupActionTreeItem | FileChangeTreeItem>('pr', this));
		this.context.subscriptions.push(this.configuration.onDidChange(e => {
			this._onDidChangeTreeData.fire();
		}));
	}

	static initialize(
		context: vscode.ExtensionContext,
		configuration: Configuration,
		repository: Repository) {
		PRProvider._instance = new PRProvider(context, configuration, repository);
	}

	static get instance() {
		return PRProvider._instance;
	}

	getTreeItem(element: PRGroupTreeItem | PullRequestModel | PRGroupActionTreeItem | FileChangeTreeItem): vscode.TreeItem {
		if (element instanceof PRGroupTreeItem || element instanceof PRGroupActionTreeItem) {
			return element;
		}

		if (element instanceof PullRequestModel) {
			let currentBranchIsForThisPR = element.equals(ReviewManager.instance.currentPullRequest);
			return {
				label: (currentBranchIsForThisPR ? ' * ' : '') + element.title,
				tooltip: (currentBranchIsForThisPR ? 'Current Branch * ' : '') + element.title,
				collapsibleState: 1,
				contextValue: 'pullrequest',
				iconPath: Resource.getGravatarUri(element)
			};
		} else {
			if (element.comments && element.comments.length) {
				element.iconPath = Resource.icons.light.Comment;
			} else {
				element.iconPath = Resource.getFileStatusUri(element);
			}
			element.resourceUri = element.filePath;
			return element;
		}
	}

	async getChildren(element?: PRGroupTreeItem | PullRequestModel | PRGroupActionTreeItem | FileChangeTreeItem): Promise<(PRGroupTreeItem | PullRequestModel | PRGroupActionTreeItem | FileChangeTreeItem)[]> {
		if (!element) {
			return Promise.resolve([
				new PRGroupTreeItem(PRType.LocalPullRequest),
				new PRGroupTreeItem(PRType.RequestReview),
				new PRGroupTreeItem(PRType.ReviewedByMe),
				new PRGroupTreeItem(PRType.Mine),
				new PRGroupTreeItem(PRType.All)
			]);
		}

		if (!this.repository.remotes || !this.repository.remotes.length) {
			return Promise.resolve([new PRGroupActionTreeItem(PRGroupActionType.Empty)]);
		}

		if (element instanceof PRGroupTreeItem) {
			let prItems = await this.getPRs(element);
			if (prItems && prItems.length) {
				return prItems;
			} else {
				return [new PRGroupActionTreeItem(PRGroupActionType.Empty)];
			}
		}

		if (element instanceof PullRequestModel) {
			const comments = await element.getComments();
			const data = await element.getFiles();
			const baseSha = await element.getBaseCommitSha();
			const richContentChanges = await parseDiff(data, this.repository, baseSha);
			const commentsCache = new Map<String, Comment[]>();
			let fileChanges = richContentChanges.map(change => {
				let fileInRepo = path.resolve(this.repository.path, change.fileName);
				let changedItem = new FileChangeTreeItem(
					element,
					change.fileName,
					change.status,
					change.fileName,
					change.blobUrl,
					toPRUri(vscode.Uri.file(change.filePath), fileInRepo, change.fileName, true),
					toPRUri(vscode.Uri.file(change.originalFilePath), fileInRepo, change.fileName, false),
					this.repository.path,
					change.patch
				);
				changedItem.comments = comments.filter(comment => comment.path === changedItem.fileName);
				commentsCache.set(changedItem.filePath.toString(), changedItem.comments);
				return changedItem;
			});

			vscode.commands.registerCommand('diff-' + element.prItem.number + '-post', async (uri: vscode.Uri, range: vscode.Range, thread: vscode.CommentThread, text: string) => {
				if (thread && thread.threadId) {
					try {
						let ret = await element.createCommentReply(text, thread.threadId);
						return {
							body: new vscode.MarkdownString(ret.data.body),
							userName: ret.data.user.login,
							gravatar: ret.data.user.avatar_url
						};
					} catch (e) {
						return null;
					}
				} else {
					let params = JSON.parse(uri.query);

					let fileChange = richContentChanges.find(change => change.fileName === params.fileName);

					if (!fileChange) {
						return null;
					}

					let position = mapHeadLineToDiffHunkPosition(fileChange.patch, '', range.start.line);

					if (position < 0) {
						return;
					}

					// there is no thread Id, which means it's a new thread
					let ret = await element.createComment(text, params.fileName, position);
					return {
						commentId: ret.data.id,
						body: new vscode.MarkdownString(ret.data.body),
						userName: ret.data.user.login,
						gravatar: ret.data.user.avatar_url
					};
				}
			});
			let reply = {
				command: 'diff-' + element.prItem.number + '-post',
				title: 'Add comment'
			};

			const _onDidChangeCommentThreads = new vscode.EventEmitter<vscode.CommentThreadChangedEvent>();
			vscode.workspace.registerDocumentCommentProvider({
				onDidChangeCommentThreads: _onDidChangeCommentThreads.event,
				provideDocumentComments: async (document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CommentInfo> => {
					if (document.uri.scheme === 'pr') {
						let params = JSON.parse(document.uri.query);
						let fileChange = richContentChanges.find(change => change.fileName === params.fileName);
						if (!fileChange) {
							return null;
						}

						let commentingRanges: vscode.Range[] = [];

						let diffHunkReader = parseDiffHunk(fileChange.patch);
						let diffHunkIter = diffHunkReader.next();

						while (!diffHunkIter.done) {
							let diffHunk = diffHunkIter.value;
							commentingRanges.push(new vscode.Range(diffHunk.newLineNumber - 1, 0, diffHunk.newLineNumber + diffHunk.newLength - 1 - 1, 0));
							diffHunkIter = diffHunkReader.next();
						}

						let matchingComments = commentsCache.get(document.uri.toString());

						if (!matchingComments || !matchingComments.length) {
							return {
								threads: [],
								commentingRanges,
								postReviewComment: reply
							};
						}

						let sections = _.groupBy(matchingComments, comment => comment.position);
						let threads: vscode.CommentThread[] = [];

						for (let i in sections) {
							let comments = sections[i];

							const comment = comments[0];
							let diffLine = getDiffLineByPosition(fileChange.patch, comment.position === null ? comment.original_position : comment.position);
							let commentAbsolutePosition = 1;
							if (diffLine) {
								commentAbsolutePosition = diffLine.newLineNumber;
							}
							// If the position is null, the comment is on a line that has been changed. Fall back to using original position.
							const pos = new vscode.Position(commentAbsolutePosition - 1, 0);
							const range = new vscode.Range(pos, pos);

							threads.push({
								threadId: comment.id,
								resource: document.uri,
								range,
								comments: comments.map(comment => {
									return {
										commentId: comment.id,
										body: new vscode.MarkdownString(comment.body),
										userName: comment.user.login,
										gravatar: comment.user.avatar_url
									};
								}),
								collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
								postReviewComment: reply
							});
						}

						return {
							threads,
							commentingRanges,
							postReviewComment: reply
						};

					}

					return null;
				}
			});
			return fileChanges;
		}
	}

	async getPRs(element: PRGroupTreeItem): Promise<PullRequestModel[]> {
		if (element.type === PRType.LocalPullRequest) {
			let infos = await PullRequestGitHelper.getLocalBranchesMarkedAsPullRequest(this.repository);
			let promises = infos.map(async info => {
				let owner = info.owner;
				let prNumber = info.prNumber;
				let githubRepo = this.repository.githubRepositories.find(repo => repo.remote.owner.toLocaleLowerCase() === owner.toLocaleLowerCase());

				if (!githubRepo) {
					return Promise.resolve([]);
				}

				return await githubRepo.getPullRequest(prNumber);
			});

			return Promise.all(promises).then(values => {
				return _.flatten(values);
			});
		}

		let promises = this.repository.githubRepositories.map(async githubRepository => {
			let remote = githubRepository.remote.remoteName;
			let isRemoteForPR = await PullRequestGitHelper.isRemoteCreatedForPullRequest(this.repository, remote);
			if (isRemoteForPR) {
				return Promise.resolve([]);
			}
			return await githubRepository.getPullRequests(element.type);
		});

		return Promise.all(promises).then(values => {
			return _.flatten(values);
		});
	}

	async getComments(element: PullRequestModel): Promise<Comment[]> {
		const reviewData = await element.otcokit.pullRequests.getComments({
			owner: element.remote.owner,
			repo: element.remote.name,
			number: element.prItem.number,
			per_page: 100,
		});
		const rawComments = reviewData.data;
		return parseComments(rawComments);
	}

	_onDidChangeDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
	onDidChangeDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeDecorations.event;
	provideDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DecorationData> {
		if (uri.scheme === 'pr') {
			return {
				bubble: true,
				abbreviation: '♪♪',
				title: '♪♪'
			};
		} else {
			return {};
		}
	}

	async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
		let { path } = JSON.parse(uri.query);
		try {
			let content = fs.readFileSync(path);
			return content.toString();
		} catch (e) {
			return '';
		}
	}

}
