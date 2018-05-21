/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FileChangeTreeItem, PRDescriptionTreeItem } from '../common/treeItems';
import { Resource } from '../common/resources';
import { PullRequestModel } from '../common/models/pullRequestModel';

export class FileChangesProvider extends vscode.Disposable implements vscode.TreeDataProvider<FileChangeTreeItem | PRDescriptionTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<FileChangeTreeItem | PRDescriptionTreeItem>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private _localFileChanges: FileChangeTreeItem[] = [];
	private _pullrequest: PullRequestModel = null;
	constructor(private context: vscode.ExtensionContext) {
		super(() => this.dispose());
		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<FileChangeTreeItem | PRDescriptionTreeItem>('prStatus', this));
	}

	async showPullRequestFileChanges(pullrequest: PullRequestModel, fileChanges: FileChangeTreeItem[]) {
		this._pullrequest = pullrequest;
		await vscode.commands.executeCommand(
			'setContext',
			'git:ispr',
			true
		);
		this._localFileChanges = fileChanges;
		this._onDidChangeTreeData.fire();
	}

	async hide() {
		await vscode.commands.executeCommand(
			'setContext',
			'git:ispr',
			false
		);
	}

	getTreeItem(element: FileChangeTreeItem | PRDescriptionTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		if (element instanceof PRDescriptionTreeItem) {
			return element;
		}

		if (element.comments && element.comments.length) {
			element.iconPath = Resource.icons.light.Comment;
		} else {
			element.iconPath = Resource.getFileStatusUri(element);
		}
		element.resourceUri = element.filePath;
		return element;
	}

	getChildren(element?: FileChangeTreeItem): vscode.ProviderResult<(FileChangeTreeItem | PRDescriptionTreeItem)[]> {
		if (!element) {
			return [new PRDescriptionTreeItem('Description', {
				light: Resource.icons.light.Description,
				dark: Resource.icons.dark.Description
			}, this._pullrequest), ...this._localFileChanges];
		} else {
			return [];
		}
	}
}