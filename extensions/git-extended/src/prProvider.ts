/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { parseDiff } from './common/diff';
import { GitChangeType } from './common/models/file';
import { Repository } from './common//models/repository';
import { Comment } from './common/models/comment';
import * as _ from 'lodash';
import { Configuration } from './configuration';
import { CredentialStore } from './credentials';
import { parseComments, getMatchingCommentsForDiffViewEditor, getMatchingCommentsForNormalEditor } from './common/comment';
import { Remote } from './common/models/remote';
import { fetch, checkout } from './common/operation';

export enum PRGroupType {
	RequestReview = 0,
	Mine = 1,
	Mention = 2,
	All = 3
}

export class PRGroup implements vscode.TreeItem {
	public readonly label: string;
	public collapsibleState: vscode.TreeItemCollapsibleState;
	public prs: PullRequest[];
	public groupType: PRGroupType;
	constructor(type: PRGroupType) {
		this.prs = [];
		this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		this.groupType = type;
		switch (type) {
			case PRGroupType.All:
				this.label = 'All';
				break;
			case PRGroupType.RequestReview:
				this.label = 'Request Review';
				break;
			case PRGroupType.Mine:
				this.label = 'Mine';
				break;
			default:
				break;
		}
	}
}

export class PullRequest {
	public comments?: Comment[];
	public fileChanges?: FileChangeItem[];
	constructor(public readonly otcokit: any, public readonly remote: Remote, public prItem: any) { }
}

export class FileChangeItem implements vscode.TreeItem {
	public iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri };
	public filePath: string;
	public sha: string;
	public parentFilePath: string;
	public parentSha: string;
	public command?: vscode.Command;
	public comments?: any[];

	constructor(
		public readonly rItem: any,
		public readonly label: string,
		public readonly status: GitChangeType,
		public readonly context: vscode.ExtensionContext,
		public readonly fileName: string,
		public readonly workspaceRoot?: string
	) {
	}

	public populateCommandArgs() {
		this.command = {
			title: 'show diff',
			command: 'vscode.diff',
			arguments: [
				vscode.Uri.file(path.resolve(this.workspaceRoot, this.parentFilePath)),
				vscode.Uri.file(path.resolve(this.workspaceRoot, this.filePath)),
				this.fileName
			]
		};
	}
}

export class PRProvider implements vscode.TreeDataProvider<PRGroup | PullRequest | FileChangeItem>, vscode.CommentProvider {
	private _fileChanges: FileChangeItem[];
	private _comments?: Comment[];
	private context: vscode.ExtensionContext;
	private workspaceRoot: string;
	private repository: Repository;
	private gitRepo: any;
	private icons: any;
	private crendentialStore: CredentialStore;
	private configuration: Configuration;
	private _onDidChangeTreeData = new vscode.EventEmitter<PRGroup | PullRequest | FileChangeItem | undefined>();
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

		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<PRGroup | PullRequest | FileChangeItem>('pr', this));
		this.icons = {
			light: {
				Modified: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-modified.svg')),
				Added: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-added.svg')),
				Deleted: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-deleted.svg')),
				Renamed: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-renamed.svg')),
				Copied: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-copied.svg')),
				Untracked: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-untrackedt.svg')),
				Ignored: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-ignored.svg')),
				Conflict: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-conflict.svg')),
			},
			dark: {
				Modified: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-modified.svg')),
				Added: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-added.svg')),
				Deleted: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-deleted.svg')),
				Renamed: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-renamed.svg')),
				Copied: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-copied.svg')),
				Untracked: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-untracked.svg')),
				Ignored: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-ignored.svg')),
				Conflict: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-conflict.svg'))
			}
		};

		const collection = vscode.languages.createDiagnosticCollection('reviews');
		this.context.subscriptions.push(vscode.commands.registerCommand('pr.pick', async (pr: PullRequest) => {
			// git fetch ${pr.remote.remoteName} pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}
			await fetch(this.repository, pr.remote.remoteName, `pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}`);
			await checkout(this.repository, `pull-request-${pr.prItem.number}`);

			// or maybe simply git fetch ${pr.remote.remoteName} ${pr.prItem.head.ref} && git checkout {pr.prItem.head.ref}
			if (!pr.fileChanges || !pr.comments) {
				return;
			}

			// todo, if we already have fileChanges locally, then we reuse it, otherwise, compare between
			// pr.prItem.base.sha and pr.prItem.head.sha
			pr.fileChanges.forEach(filechange => {
				let comments = pr.comments.filter(comment => comment.path === filechange.fileName);
				let diags = comments.map(comment => ({
					code: '',
					message: `@${comment.user.login}: ${comment.body}`,
					range: new vscode.Range(new vscode.Position(comment.diff_hunk_range.start + comment.position - 1 - 1, 0), new vscode.Position(comment.diff_hunk_range.start + comment.position - 1 - 1, 0)),
					severity: vscode.DiagnosticSeverity.Error,
					source: '',
					relatedInformation: []
				}));
				collection.set(vscode.Uri.file(path.resolve(this.workspaceRoot, filechange.fileName)), diags);
			});

			let prChangeResources = pr.fileChanges.map(fileChange => ({
				resourceUri: vscode.Uri.file(path.resolve(this.workspaceRoot, fileChange.fileName)),
				command: {
					title: 'show diff',
					command: 'vscode.diff',
					arguments: [
						vscode.Uri.file(path.resolve(this.workspaceRoot, fileChange.parentFilePath)),
						vscode.Uri.file(path.resolve(this.workspaceRoot, fileChange.filePath)),
						fileChange.fileName
					]
				}
			}));

			let prGroup: vscode.SourceControlResourceGroup = this.gitRepo._sourceControl.createResourceGroup('pr', 'Changes from PR');
			prGroup.resourceStates = prChangeResources;
		}));
		this.context.subscriptions.push(vscode.workspace.registerCommentProvider(this));
		this.context.subscriptions.push(this.configuration.onDidChange(e => {
			this._onDidChangeTreeData.fire();
		}));
	}

	getTreeItem(element: PRGroup | PullRequest | FileChangeItem): vscode.TreeItem {
		if (element instanceof PRGroup) {
			return element;
		}

		if (element instanceof PullRequest) {
			return {
				label: element.prItem.title,
				collapsibleState: 1,
				contextValue: 'pullrequest'
			};
		} else {
			let iconUri: string;
			let iconDarkUri: string;

			switch (element.status) {
				case GitChangeType.ADD:
					iconUri = this.icons.light.Added;
					iconDarkUri = this.icons.dark.Added;
					break;
				case GitChangeType.COPY:
					iconUri = this.icons.light.Copied;
					iconDarkUri = this.icons.dark.Copied;
					break;
				case GitChangeType.DELETE:
					iconUri = this.icons.light.Deleted;
					iconDarkUri = this.icons.dark.Deleted;
					break;
				case GitChangeType.MODIFY:
					iconUri = this.icons.light.Modified;
					iconDarkUri = this.icons.dark.Modified;
					break;
				case GitChangeType.RENAME:
					iconUri = this.icons.light.Renamed;
					iconDarkUri = this.icons.dark.Renamed;
					break;
			}
			element.iconPath = {
				light: iconUri,
				dark: iconDarkUri
			};
			return element;
		}
	}

	getChildren(element?: PRGroup | PullRequest | FileChangeItem): Thenable<(PRGroup | PullRequest | FileChangeItem)[]> {
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
			// fetch PRs
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
		} else if (element instanceof PullRequest) {
			return element.otcokit.pullRequests.getFiles({
				owner: element.remote.owner,
				repo: element.remote.name,
				number: element.prItem.number
			}).then(async ({ data }) => {
				const reviewData = await element.otcokit.pullRequests.getComments({
					owner: element.remote.owner,
					repo: element.remote.name,
					number: element.prItem.number
				});
				const rawComments = reviewData.data;
				const comments: Comment[] = parseComments(rawComments);
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
					let changedItem = new FileChangeItem(element.prItem, change.fileName, change.status, this.context, change.fileName, this.workspaceRoot);
					changedItem.filePath = change.filePath;
					changedItem.parentFilePath = change.originalFilePath;
					changedItem.comments = comments.filter(comment => comment.path === changedItem.fileName);
					changedItem.populateCommandArgs();
					return changedItem;
				});
				element.comments = comments;
				element.fileChanges = fileChanges;
				this._fileChanges = fileChanges;
				this._comments = comments;
				return fileChanges;
			});
		}
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
