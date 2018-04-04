import * as vscode from 'vscode';
// import { Octokat } from 'octokat';
var Octokat = require('octokat');
// import * as https from 'https';
// import * as fs from 'fs';
// import * as tmp from 'tmp';
import * as path from 'path';
import * as request from 'request';

import { FileChangeItem } from './commitsProvider';
import { parseDiff, DIFF_HUNK_INFO } from './common/diff';
import { GitChangeType } from './common/models/file';
import { Repository } from './common//models/repository';
import { Comment } from './common/models/comment';
import * as _ from 'lodash';
export class PullRequest {
	constructor(public octoPRItem: any) { };
}

export class PRProvider implements vscode.TreeDataProvider<PullRequest | FileChangeItem>, vscode.CommentProvider {
	private _fileChanges: FileChangeItem[];
	private _comments?: Comment[];
	private context: vscode.ExtensionContext;
	private workspaceRoot: string;
	private repository: Repository;
	private octo: any;
	private icons: any;

	constructor() {
		this.octo = new Octokat();
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
	}

	getTreeItem(element: PullRequest | FileChangeItem): vscode.TreeItem {

		if (element instanceof PullRequest) {
			return {
				label: element.octoPRItem.title,
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
			return new Promise<FileChangeItem[]>((resolve, rxeject) => {
				request({
					followAllRedirects: true,
					url: element.octoPRItem.diffUrl
				}, async (error, response, body) => {
					// map comments to FileChangeItem
					// registerCommentProvider
					const rawComments = await element.octoPRItem.reviewComments.fetch();
					const comments: Comment[] = parseComments(rawComments.items);
					let richContentChanges = await parseDiff(body, this.repository, element.octoPRItem.base.sha);
					let fileChanges = richContentChanges.map(change => {
						let changedItem = new FileChangeItem(change.fileName ? change.fileName : change.filePath, change.status, this.context, change.fileName, this.workspaceRoot);
						changedItem.filePath = change.filePath;
						changedItem.parentFilePath = change.originalFilePath;
						changedItem.populateCommandArgs();
						return changedItem;
					});
					this._fileChanges = fileChanges;
					this._comments = comments;

					vscode.workspace.onDidOpenTextDocument(e => {
						let matchingComments = getMatchingCommentsForDiffViewEditor(e.fileName, fileChanges, comments);
						console.log('---diff editor---')
						for (let i = 0; i < matchingComments.length; i++) {
							let cm = matchingComments[i];
							console.log(`after line: ${cm.diff_hunk_range.start + cm.position - 1 - 1}, ${'@' + cm.user.login}: '${cm.body}'`);
						}

						matchingComments = getMatchingCommentsForNormalEditor(e.fileName, this.workspaceRoot, comments);
						console.log('---editor---')
						for (let i = 0; i < matchingComments.length; i++) {
							let cm = matchingComments[i];
							console.log(`after line: ${cm.diff_hunk_range.start + cm.position - 1 - 1}, ${'@' + cm.user.login}: '${cm.body}'`);
						}
					});

					resolve(fileChanges);
				});
			});
		} else {
			if (this.repository.remotes && this.repository.remotes.length > 0) {
				let promises = this.repository.remotes.map(remote => this.octo.repos(remote.owner, remote.name).pulls.fetch().then(prs => {
					return prs.items.map(item => new PullRequest(item));
				}));
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
		let diff_hunk = comments[i].diffHunk;
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

