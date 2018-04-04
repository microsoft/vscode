import * as path from 'path';
import * as vscode from 'vscode';
import { Repository } from './common//models/repository';
import { getChangedFiles, getFile } from './common/file';
import { getCommits } from './common/log';
import { Commit } from './common/models/commit';
import { GitChangeType } from './common/models/file';

export class CommitTreeItem implements vscode.TreeItem {
	readonly iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri };

	constructor(
		public readonly context: vscode.ExtensionContext,
		public readonly label: string,
		public readonly sha: string,
		public readonly parentSHAs: ReadonlyArray<string>,
		public readonly command?: vscode.Command,
		public readonly collapsibleState?: vscode.TreeItemCollapsibleState
	) {
		this.collapsibleState = 1;
	}
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
		public readonly label: string,
		public readonly status: GitChangeType,
		public readonly context: vscode.ExtensionContext,
		public readonly fileName: string,
		public readonly workspaceRoot?: string
	) {
	}

	public populateCommandArgs() {
		if (this.status === GitChangeType.MODIFY) {
			this.command = {
				title: 'show diff',
				command: ShowDiffCommand.id,
				arguments: [this]
			};
		} else if (this.status === GitChangeType.DELETE) {
			this.command = {
				title: 'show diff',
				command: 'vscode.open',
				arguments: [
					vscode.Uri.file(path.resolve(this.workspaceRoot, this.parentFilePath))
				]
			};
		} else {
			this.command = {
				title: 'show diff',
				command: 'vscode.open',
				arguments: [
					vscode.Uri.file(path.resolve(this.workspaceRoot, this.filePath))
				]
			};
		}
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

export class CommitsProvider implements vscode.TreeDataProvider<CommitTreeItem> {
	private context: vscode.ExtensionContext;
	private workspaceRoot: string;
	private repository: Repository;
	private icons: any;
	private _onDidChangeTreeData: vscode.EventEmitter<CommitTreeItem | undefined> = new vscode.EventEmitter<CommitTreeItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<CommitTreeItem | undefined> = this._onDidChangeTreeData.event;

	activate(context: vscode.ExtensionContext, workspaceRoot: string, repository: Repository) {
		this.context = context;
		this.workspaceRoot = workspaceRoot;
		this.repository = repository;

		vscode.window.registerTreeDataProvider<CommitTreeItem>('commits', this);
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

		vscode.commands.registerCommand('commits.refresh', async (args) => {
			this._onDidChangeTreeData.fire();
		});
		vscode.commands.registerCommand('commits.revertCommit', async (element) => {
			// TODO
			// We can want to allow users to revert several commits
		});
		vscode.commands.registerCommand(ShowDiffCommand.id, ShowDiffCommand.run);
	}

	getTreeItem(element: CommitTreeItem | FileChangeItem): vscode.TreeItem {
		if (element instanceof FileChangeItem) {
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
		} else {
			return element;
		}
	}

	getChildren(element?: CommitTreeItem): Thenable<CommitTreeItem[]> {
		if (!this.workspaceRoot) {
			return Promise.resolve([]);
		}

		return new Promise(resolve => {
			if (element) {
				getChangedFiles(this.repository, element.sha).then(fileChanges => {
					let promises = [];
					let results = fileChanges.map(fileChange => {
						let changedItem = new FileChangeItem(`${fileChange.filePath}`, fileChange.status, this.context, this.workspaceRoot);

						if (fileChange.status === GitChangeType.MODIFY) {
							promises.push(Promise.all([getFile(element.sha, fileChange.filePath).then(targetFile => {
								changedItem.filePath = targetFile;
								changedItem.sha = element.sha;
							}), getFile(element.parentSHAs[0], fileChange.filePath).then(targetFile => {
								changedItem.parentFilePath = targetFile;
								changedItem.parentSha = element.parentSHAs[0];
							})]).then(() => {
								changedItem.populateCommandArgs();
							}));
						} else if (fileChange.status === GitChangeType.DELETE) {
							promises.push(getFile(element.parentSHAs[0], fileChange.filePath).then(targetFile => {
								changedItem.parentFilePath = targetFile;
								changedItem.sha = element.parentSHAs[0];
								changedItem.populateCommandArgs();
							}));
						} else {
							promises.push(getFile(element.sha, fileChange.filePath).then(targetFile => {
								changedItem.filePath = targetFile;
								changedItem.sha = element.sha;
								changedItem.populateCommandArgs();
							}));
						}

						return changedItem;
					});

					Promise.all(promises).then(() => {
						resolve(results as any); // TODO
					});
				});
			} else {
				getCommits(this.repository, 'HEAD', 100).then((commits: Commit[]) => {
					let result = commits.map(commit => {
						return new CommitTreeItem(this.context, `${commit.summary}`, commit.sha, commit.parentSHAs);
					});
					resolve(result);
				}, (reason: any) => {
					Promise.reject(reason);
				});
			}
		});
	}
}
