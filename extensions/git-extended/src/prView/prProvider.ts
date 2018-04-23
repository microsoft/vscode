/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { parseDiff, parseDiffHunk, getDiffLine, mapPositionHeadToDiffHunk } from '../common/diff';
import { Repository } from '../common//models/repository';
import { Comment } from '../common/models/comment';
import * as _ from 'lodash';
import { Configuration } from '../configuration';
import { parseComments } from '../common/comment';
import { PRGroupTreeItem, FileChangeTreeItem } from '../common/treeItems';
import { Resource } from '../common/resources';
import { ReviewMode } from '../review/reviewMode';
import { toPRUri } from '../common/uri';
import * as fs from 'fs';
import { PullRequest, PRType } from '../common/models/pullrequest';

export class PRProvider implements vscode.TreeDataProvider<PRGroupTreeItem | PullRequest | FileChangeTreeItem>, vscode.TextDocumentContentProvider, vscode.DecorationProvider {
	private context: vscode.ExtensionContext;
	private repository: Repository;
	private configuration: Configuration;
	private reviewMode: ReviewMode;
	private _onDidChangeTreeData = new vscode.EventEmitter<PRGroupTreeItem | PullRequest | FileChangeTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	get onDidChange(): vscode.Event<vscode.Uri> { return this._onDidChange.event; }

	constructor(context: vscode.ExtensionContext, configuration: Configuration, reviewMode: ReviewMode) {
		this.context = context;
		this.configuration = configuration;
		this.reviewMode = reviewMode;
		vscode.workspace.registerTextDocumentContentProvider('pr', this);
		vscode.window.registerDecorationProvider(this);
	}

	async activate(repository: Repository) {
		this.repository = repository;
		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<PRGroupTreeItem | PullRequest | FileChangeTreeItem>('pr', this));
		this.context.subscriptions.push(vscode.commands.registerCommand('pr.pick', async (pr: PullRequest) => {
			await this.reviewMode.switch(pr);
		}));
		this.context.subscriptions.push(this.configuration.onDidChange(e => {
			this._onDidChangeTreeData.fire();
		}));
	}

	getTreeItem(element: PRGroupTreeItem | PullRequest | FileChangeTreeItem): vscode.TreeItem {
		if (element instanceof PRGroupTreeItem) {
			return element;
		}

		if (element instanceof PullRequest) {
			return {
				label: element.prItem.title,
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

	async getChildren(element?: PRGroupTreeItem | PullRequest | FileChangeTreeItem): Promise<(PRGroupTreeItem | PullRequest | FileChangeTreeItem)[]> {
		if (!element) {
			return Promise.resolve([
				new PRGroupTreeItem(PRType.RequestReview),
				new PRGroupTreeItem(PRType.ReviewedByMe),
				new PRGroupTreeItem(PRType.Mine),
				new PRGroupTreeItem(PRType.All)
			]);
		}

		if (!this.repository.remotes || !this.repository.remotes.length) {
			return Promise.resolve([]);
		}

		if (element instanceof PRGroupTreeItem) {
			return this.getPRs(element);
		}

		if (element instanceof PullRequest) {
			const comments = await element.getComments();
			const data = await element.getFiles();
			const baseSha = await element.getBaseCommitSha();
			const richContentChanges = await parseDiff(data, this.repository, baseSha);
			const commentsCache = new Map<String, Comment[]>();
			let fileChanges = richContentChanges.map(change => {
				let fileInRepo = path.resolve(this.repository.path, change.fileName);
				let changedItem = new FileChangeTreeItem(
					element.prItem,
					change.fileName,
					change.status,
					change.fileName,
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

					let position = mapPositionHeadToDiffHunk(fileChange.patch, '', range.start.line);

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
				title: 'Add single comment'
			};

			const _onDidChangeCommentThreads = new vscode.EventEmitter<vscode.CommentThreadChangedEvent>();
			vscode.workspace.registerDocumentCommentProvider({
				onDidChangeCommentThreads: _onDidChangeCommentThreads.event,
				provideDocumentComments: async (document: vscode.TextDocument, token: vscode.CancellationToken) => {
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
								reply: reply
							};
						}

						let sections = _.groupBy(matchingComments, comment => comment.position);
						let threads: vscode.CommentThread[] = [];

						for (let i in sections) {
							let comments = sections[i];

							const comment = comments[0];
							let diffLine = getDiffLine(fileChange.patch, comment.position === null ? comment.original_position : comment.position);
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
								reply: reply
							});
						}

						return {
							threads,
							commentingRanges,
							reply: reply
						};

					}

					return null;
				}
			});
			return fileChanges;
		}
	}

	async getPRs(element: PRGroupTreeItem): Promise<PullRequest[]> {
		let promises = this.repository.githubRepositories.map(async githubRepository => {
			return await githubRepository.getPullRequests(element.type);
		});

		return Promise.all(promises).then(values => {
			return _.flatten(values);
		});
	}

	async getComments(element: PullRequest): Promise<Comment[]> {
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
