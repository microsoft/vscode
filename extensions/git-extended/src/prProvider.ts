/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { parseDiff, DIFF_HUNK_INFO } from './common/diff';
import { GitChangeType } from './common/models/file';
import { Repository } from './common//models/repository';
import { Comment } from './common/models/comment';
import * as _ from 'lodash';
import { fill } from 'git-credential-node';
const Octokit = require('@octokit/rest');

export class PullRequest {
	public comments?: Comment[];
	public fileChanges?: FileChangeItem[];
	constructor(public readonly otcokit: any, public readonly owner: string, public readonly repo: string, public prItem: any) { }
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
			command: ShowDiffCommand.id,
			arguments: [this]
		};
	}
}

class ShowDiffCommand {
	static readonly id = 'msgit.showDiff';

	static run(item: FileChangeItem) {
		vscode.commands.executeCommand('vscode.diff',
			vscode.Uri.file(path.resolve(item.workspaceRoot, item.parentFilePath)),
			vscode.Uri.file(path.resolve(item.workspaceRoot, item.filePath)),
			item.fileName);
	}
}

class CredentialStore {
	private octokits: { [key: string]: any };
	constructor() {
		this.octokits = [];
	}

	async getOctokit(url: string) {
		if (this.octokits[url]) {
			return this.octokits[url];
		}
		const data = await fill(url);
		this.octokits[url] = Octokit({
			debug: true
		});

		this.octokits[url].authenticate({
			type: 'basic',
			username: data.username,
			password: data.password
		});

		return this.octokits[url];
	}
}

export class PRProvider implements vscode.TreeDataProvider<PullRequest | FileChangeItem>, vscode.CommentProvider {
	private _fileChanges: FileChangeItem[];
	private _comments?: Comment[];
	private context: vscode.ExtensionContext;
	private workspaceRoot: string;
	private repository: Repository;
	private icons: any;
	private crendentialStore: CredentialStore;

	constructor() {
		this.crendentialStore = new CredentialStore();
	}

	activate(context: vscode.ExtensionContext, workspaceRoot: string, repository: Repository) {
		this.context = context;
		this.workspaceRoot = workspaceRoot;
		this.repository = repository;

		vscode.window.registerTreeDataProvider<PullRequest | FileChangeItem>('pr', this);
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

		vscode.workspace.registerCommentProvider(this);
		vscode.commands.registerCommand(ShowDiffCommand.id, ShowDiffCommand.run);
	}

	getTreeItem(element: PullRequest | FileChangeItem): vscode.TreeItem {

		if (element instanceof PullRequest) {
			return {
				label: element.prItem.title,
				collapsibleState: 1
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

	getChildren(element?: PullRequest): PullRequest[] | Thenable<PullRequest[]> | FileChangeItem[] | Thenable<FileChangeItem[]> {
		if (element) {
			return element.otcokit.pullRequests.getFiles({
				owner: element.owner,
				repo: element.repo,
				number: element.prItem.number
			}).then(async ({ data }) => {
				const reviewData = await element.otcokit.pullRequests.getComments({
					owner: element.owner,
					repo: element.repo,
					number: element.prItem.number
				});
				const rawComments = reviewData.data;
				const comments: Comment[] = parseComments(rawComments);
				let richContentChanges = await parseDiff(data, this.repository, element.prItem.base.sha);
				let fileChanges = richContentChanges.map(change => {
					let changedItem = new FileChangeItem(element.prItem, change.fileName, change.status, this.context, change.fileName, this.workspaceRoot);
					changedItem.filePath = change.filePath;
					changedItem.parentFilePath = change.originalFilePath;
					changedItem.comments = comments.filter(comment => comment.path === changedItem.fileName);
					changedItem.populateCommandArgs();
					return changedItem;
				});
				this._fileChanges = fileChanges;
				this._comments = comments;
				return fileChanges;
			});
		} else {
			if (this.repository.remotes && this.repository.remotes.length > 0) {
				let promises = this.repository.remotes.map(remote => {
					return this.crendentialStore.getOctokit(remote.url).then(octo => {
						return octo.pullRequests.getAll({
							owner: remote.owner,
							repo: remote.name
						}).then(({ data }) => {
							return data.map(item => new PullRequest(octo, remote.owner, remote.name, item));
						});
					});
				});

				return Promise.all(promises).then(values => {
					let prs = [];
					values.forEach(value => {
						prs.push(...value);
					});

					return prs;
				});
			}

			return [];
		}
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

function parseComments(comments: any[]): Comment[] {
	for (let i = 0; i < comments.length; i++) {
		let diff_hunk = comments[i].diff_hunk;
		let hunk_info = DIFF_HUNK_INFO.exec(diff_hunk);
		let oriStartLine = Number(hunk_info[1]);
		let oriLen = Number(hunk_info[3]) | 0;
		let startLine = Number(hunk_info[5]);
		let len = Number(hunk_info[7]) | 0;
		comments[i].diff_hunk_range = {
			originalStart: oriStartLine,
			originalLength: oriLen,
			start: startLine,
			length: len
		};
	}

	return comments;
}

function getMatchingCommentsForDiffViewEditor(filePath: string, items: FileChangeItem[], comments: Comment[]): Comment[] {
	let fileChangeItem = items.filter(item => filePath === path.resolve(item.workspaceRoot, item.filePath));

	if (fileChangeItem.length === 0) {
		return [];
	} else {
		let fileName = fileChangeItem[0].fileName;
		let matchingComments = comments.filter(comment => comment.path === fileName);

		return matchingComments;
	}
}

function getMatchingCommentsForNormalEditor(filePath: string, workspaceRoot: string, comments: Comment[]): Comment[] {
	// @todo, we should check commit id
	let matchingComments = comments.filter(comment => path.resolve(workspaceRoot, comment.path) === filePath);
	return matchingComments;
}

