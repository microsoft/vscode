/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TreeNode } from './TreeNode';
import { GitChangeType } from '../models/file';
import { PullRequestModel } from '../models/pullRequestModel';
import { DiffHunk } from '../models/diffHunk';
import { Resource } from '../common/resources';

export class PRFileChangeNode extends TreeNode implements vscode.TreeItem {
	public iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri };
	public resourceUri: vscode.Uri;
	public sha: string;
	public parentSha: string;
	public command?: vscode.Command;
	public comments?: any[];
	public contextValue: string;

	get letter(): string {
		switch (this.status) {
			case GitChangeType.MODIFY:
				return 'M';
			case GitChangeType.ADD:
				return 'A';
			case GitChangeType.DELETE:
				return 'D';
			case GitChangeType.RENAME:
				return 'R';
			case GitChangeType.UNKNOWN:
				return 'U';
			default:
				return 'C';
		}
	}

	constructor(
		public readonly pullRequest: PullRequestModel,
		public readonly label: string,
		public readonly status: GitChangeType,
		public readonly fileName: string,
		public blobUrl: string,
		public readonly filePath: vscode.Uri,
		public readonly parentFilePath: vscode.Uri,
		public readonly workspaceRoot: string,
		public readonly diffHunks: DiffHunk[]
	) {
		super();
		this.contextValue = 'filechange';
		this.command = {
			title: 'show diff',
			command: 'vscode.diff',
			arguments: [
				this.parentFilePath,
				this.filePath,
				this.fileName
			]
		};
	}

	getTreeItem(): vscode.TreeItem {
		if (this.comments && this.comments.length) {
			this.iconPath = Resource.icons.light.Comment;
		} else {
			this.iconPath = Resource.getFileStatusUri(this);
		}
		this.resourceUri = this.filePath;
		return this;
	}

}