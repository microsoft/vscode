/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Resource } from '../common/resources';
import { PullRequestModel } from '../models/pullRequestModel';
import { PRFileChangeNode } from '../tree/prFileChangeNode';
import { PRDescriptionNode } from '../tree/prDescNode';

export class FileChangesProvider extends vscode.Disposable implements vscode.TreeDataProvider<PRFileChangeNode | PRDescriptionNode> {
	private _onDidChangeTreeData = new vscode.EventEmitter<PRFileChangeNode | PRDescriptionNode>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private _localFileChanges: PRFileChangeNode[] = [];
	private _pullrequest: PullRequestModel = null;
	constructor(private context: vscode.ExtensionContext) {
		super(() => this.dispose());
		this.context.subscriptions.push(vscode.window.registerTreeDataProvider<PRFileChangeNode | PRDescriptionNode>('prStatus', this));
	}

	async showPullRequestFileChanges(pullrequest: PullRequestModel, fileChanges: PRFileChangeNode[]) {
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

	getTreeItem(element: PRFileChangeNode | PRDescriptionNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
		if (element instanceof PRDescriptionNode) {
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

	getChildren(element?: PRFileChangeNode): vscode.ProviderResult<(PRFileChangeNode | PRDescriptionNode)[]> {
		if (!element) {
			return [new PRDescriptionNode('Description', {
				light: Resource.icons.light.Description,
				dark: Resource.icons.dark.Description
			}, this._pullrequest), ...this._localFileChanges];
		} else {
			return [];
		}
	}
}