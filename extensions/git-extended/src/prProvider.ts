/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { parseDiff } from './common/diff';
import { Repository } from './common//models/repository';
import { Comment } from './common/models/comment';
import * as _ from 'lodash';
import { Configuration } from './configuration';
import { CredentialStore } from './credentials';
import { parseComments } from './common/comment';
import { enterReviewMode, restoreReviewState } from './review';
import { PRGroup, PullRequest, FileChange, PRGroupType } from './common/treeItems';
import { Resource } from './common/resources';
import { CommentsProvider } from './commentsProvider';

export class PRProvider implements vscode.TreeDataProvider<PRGroup | PullRequest | FileChange> {
	private context: vscode.ExtensionContext;
	private workspaceRoot: string;
	private repository: Repository;
	private gitRepo: any;
	private crendentialStore: CredentialStore;
	private configuration: Configuration;
	private commentsProvider: CommentsProvider;
	private _onDidChangeTreeData = new vscode.EventEmitter<PRGroup | PullRequest | FileChange | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(configuration: Configuration) {
		this.configuration = configuration;
		this.crendentialStore = new CredentialStore(configuration);
	}

	async activate(context: vscode.ExtensionContext, workspaceRoot: string, repository: Repository, commentsProvider: CommentsProvider, gitRepo: any) {
		this.context = context;
		this.workspaceRoot = workspaceRoot;
		this.repository = repository;
		this.commentsProvider = commentsProvider;
		this.gitRepo = gitRepo;

		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<PRGroup | PullRequest | FileChange>('pr', this));
		this.context.subscriptions.push(vscode.commands.registerCommand('pr.pick', async (pr: PullRequest) => {
			await enterReviewMode(context.workspaceState, this.repository, pr, this.gitRepo);
		}));
		this.context.subscriptions.push(this.configuration.onDidChange(e => {
			this._onDidChangeTreeData.fire();
		}));

		await restoreReviewState(this.repository, context.workspaceState, gitRepo, this.commentsProvider);
	}

	getTreeItem(element: PRGroup | PullRequest | FileChange): vscode.TreeItem {
		if (element instanceof PRGroup) {
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
			element.iconPath = Resource.getFileStatusUri(element);
			return element;
		}
	}

	async getChildren(element?: PRGroup | PullRequest | FileChange): Promise<(PRGroup | PullRequest | FileChange)[]> {
		if (!element) {
			return Promise.resolve([
				new PRGroup(PRGroupType.RequestReview),
				new PRGroup(PRGroupType.Mine),
				new PRGroup(PRGroupType.All)
			]);
		}

		if (!this.repository.remotes || !this.repository.remotes.length) {
			return Promise.resolve([]);
		}

		if (element instanceof PRGroup) {
			return this.getPRs(element);
		}

		if (element instanceof PullRequest) {
			const comments = await this.getComments(element);
			const { data } = await element.otcokit.pullRequests.getFiles({
				owner: element.remote.owner,
				repo: element.remote.name,
				number: element.prItem.number
			});
			if (!element.prItem.base) {
				// this one is from search results, which is not complete.
				const { data } = await element.otcokit.pullRequests.get({
					owner: element.remote.owner,
					repo: element.remote.name,
					number: element.prItem.number
				});
				element.prItem = data;
			}
			let richContentChanges = await parseDiff(data, this.repository, element.prItem.base.sha);
			const commentsCache = new Map<String, Comment[]>();
			let fileChanges = richContentChanges.map(change => {
				let changedItem = new FileChange(element.prItem, change.fileName, change.status, this.context, change.fileName, vscode.Uri.file(change.filePath), vscode.Uri.file(change.originalFilePath), this.workspaceRoot);
				changedItem.comments = comments.filter(comment => comment.path === changedItem.fileName);
				commentsCache.set(changedItem.filePath.toString(), changedItem.comments);
				return changedItem;
			});
			this.commentsProvider.registerCommentProvider({
				provideComments: async (uri: vscode.Uri) => {
					let matchingComments = commentsCache.get(uri.toString());
					return matchingComments;
				}
			});
			// fill in file changes and comments.
			element.comments = comments;
			element.fileChanges = fileChanges;
			return fileChanges;
		}
	}

	async getPRs(element: PRGroup): Promise<PullRequest[]> {
		if (element.groupType !== PRGroupType.All) {
			let promises = this.repository.remotes.map(async remote => {
				const octo = await this.crendentialStore.getOctokit(remote);
				if (octo) {
					const user = await octo.users.get();
					const { data } = await octo.search.issues({
						q: this.getPRFetchQuery(remote.owner, remote.name, user.data.login, element.groupType)
					});
					return data.items.map(item => new PullRequest(octo, remote, item));
				}
			});

			return Promise.all(promises).then(values => {
				return _.flatten(values);
			});
		} else {
			let promises = this.repository.remotes.map(async remote => {
				const octo = await this.crendentialStore.getOctokit(remote);
				if (octo) {
					let { data } = await octo.pullRequests.getAll({
						owner: remote.owner,
						repo: remote.name,
						// per_page: 100
					});
					let ret = data.map(item => new PullRequest(octo, remote, item));

					// if (ret.length >= 100) {
					// 	let secondPage = await octo.pullRequests.getAll({
					// 		owner: remote.owner,
					// 		repo: remote.name,
					// 		per_page: 100,
					// 		page: 2
					// 	});

					// 	ret.push(...secondPage.data.map(item => new PullRequest(octo, remote, item)));
					// }
					return ret;
				}
			});

			return Promise.all(promises).then(values => {
				return _.flatten(values);
			});
		}
	}

	async getComments(element: PullRequest): Promise<Comment[]> {
		const reviewData = await element.otcokit.pullRequests.getComments({
			owner: element.remote.owner,
			repo: element.remote.name,
			number: element.prItem.number
		});
		const rawComments = reviewData.data;
		return parseComments(rawComments);
	}

	getPRFetchQuery(owner: string, repo: string, user: string, type: PRGroupType) {
		let filter = '';
		switch (type) {
			case PRGroupType.RequestReview:
				filter = `review-requested:${user}`;
				break;
			case PRGroupType.Mine:
				filter = `author:${user}`;
				break;
			default:
				break;
		}

		return `is:open ${filter} type:pr repo:${owner}/${repo}`;
	}

	// async provideComments(document: vscode.TextDocument): Promise<vscode.CommentThread[]> {
	// 	let matchingComments = await this.commentsProvider.provideComments(document.uri)

	// 	if (!matchingComments || !matchingComments.length) {
	// 		return [];
	// 	}

	// 	let sections = _.groupBy(matchingComments, comment => comment.position);
	// 	let ret = [];

	// 	for (let i in sections) {
	// 		let comments = sections[i];

	// 		const comment = comments[0];
	// 		const pos = new vscode.Position(comment.diff_hunk_range.start + comment.position - 1 - 1, 0);
	// 		const range = new vscode.Range(pos, pos);

	// 		ret.push({
	// 			range,
	// 			comments: comments.map(comment => {
	// 				return {
	// 					body: new vscode.MarkdownString(comment.body),
	// 					userName: comment.user.login,
	// 					gravatar: comment.user.avatar_url
	// 				};
	// 			})
	// 		});
	// 	}

	// 	return ret;
	// }
}
