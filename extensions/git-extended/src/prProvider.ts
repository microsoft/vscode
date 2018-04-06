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
import { parseComments, getMatchingCommentsForDiffViewEditor, getMatchingCommentsForNormalEditor } from './common/comment';
import { enterReviewMode } from './review';
import { PRGroup, PullRequest, FileChange, PRGroupType } from './common/treeItems';
import { Resource } from './common/resources';

export class PRProvider implements vscode.TreeDataProvider<PRGroup | PullRequest | FileChange>, vscode.CommentProvider {
	private _fileChanges: FileChange[];
	private _comments?: Comment[];
	private context: vscode.ExtensionContext;
	private workspaceRoot: string;
	private repository: Repository;
	private gitRepo: any;
	private crendentialStore: CredentialStore;
	private configuration: Configuration;
	private _onDidChangeTreeData = new vscode.EventEmitter<PRGroup | PullRequest | FileChange | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(configuration: Configuration) {
		this.configuration = configuration;
		this.crendentialStore = new CredentialStore(configuration);
	}

	activate(context: vscode.ExtensionContext, workspaceRoot: string, repository: Repository, gitRepo: any) {
		this.context = context;
		this.workspaceRoot = workspaceRoot;
		this.repository = repository;
		this.gitRepo = gitRepo;

		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<PRGroup | PullRequest | FileChange>('pr', this));

		this.context.subscriptions.push(vscode.commands.registerCommand('pr.pick', async (pr: PullRequest) => {
			await enterReviewMode(this.workspaceRoot, this.repository, pr, this.gitRepo);
		}));
		this.context.subscriptions.push(vscode.workspace.registerCommentProvider(this));
		this.context.subscriptions.push(this.configuration.onDidChange(e => {
			this._onDidChangeTreeData.fire();
		}));
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
			let fileChanges = richContentChanges.map(change => {
				let changedItem = new FileChange(element.prItem, change.fileName, change.status, this.context, change.fileName, change.filePath, change.originalFilePath, this.workspaceRoot);
				changedItem.comments = comments.filter(comment => comment.path === changedItem.fileName);
				return changedItem;
			});
			// fill in file changes and comments.
			element.comments = comments;
			element.fileChanges = fileChanges;
			this._fileChanges = fileChanges;
			this._comments = comments;
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
		} else if (element.groupType === PRGroupType.All) {
			let promises = this.repository.remotes.map(async remote => {
				const octo = await this.crendentialStore.getOctokit(remote);
				if (octo) {
					const { data } = await octo.pullRequests.getAll({
						owner: remote.owner,
						repo: remote.name
					});
					return data.map(item => new PullRequest(octo, remote, item));
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
			case PRGroupType.RequestReview:
				filter = `author:${user}`;
				break;
			default:
				break;
		}

		return `is:open ${filter} type:pr repo:${owner}/${repo}`;
	}

	async provideComments(document: vscode.TextDocument): Promise<vscode.CommentThread[]> {
		if (!this._comments) {
			return [];
		}

		let matchingComments = getMatchingCommentsForDiffViewEditor(document.fileName, this._fileChanges, this._comments);
		if (!matchingComments || !matchingComments.length) {
			matchingComments = getMatchingCommentsForNormalEditor(document.fileName, this.workspaceRoot, this._comments);
		}

		if (!matchingComments || !matchingComments.length) {
			return [];
		}

		let sections = _.groupBy(matchingComments, comment => comment.position);
		let ret = [];

		for (let i in sections) {
			let comments = sections[i];

			const comment = comments[0];
			const pos = new vscode.Position(comment.diff_hunk_range.start + comment.position - 1 - 1, 0);
			const range = new vscode.Range(pos, pos);

			ret.push({
				range,
				comments: comments.map(comment => {
					return {
						body: new vscode.MarkdownString(comment.body),
						userName: comment.user.login
					};
				})
			});
		}

		return ret;
	}
}
