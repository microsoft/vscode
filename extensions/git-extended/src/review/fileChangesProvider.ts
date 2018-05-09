/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FileChangeTreeItem } from '../common/treeItems';
import { Resource } from '../common/resources';

export class FileChangesProvider extends vscode.Disposable implements vscode.TreeDataProvider<FileChangeTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<FileChangeTreeItem>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private _localFileChanges: FileChangeTreeItem[] = [];
	constructor(private context: vscode.ExtensionContext) {
		super(() => this.dispose());
		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<FileChangeTreeItem>('prStatus', this));
	}

	async showPullRequestFileChanges(fileChanges: FileChangeTreeItem[]) {
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

	getTreeItem(element: FileChangeTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		if (element.comments && element.comments.length) {
			element.iconPath = Resource.icons.light.Comment;
		} else {
			element.iconPath = Resource.getFileStatusUri(element);
		}
		element.resourceUri = element.filePath;
		return element;
	}

	getChildren(element?: FileChangeTreeItem): vscode.ProviderResult<FileChangeTreeItem[]> {
		if (!element) {
			return this._localFileChanges;
		} else {
			return [];
		}
	}
}