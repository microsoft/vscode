/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitChangeType } from './models/file';
import { PullRequestModel, PRType } from './models/pullRequestModel';

export class PRGroupTreeItem implements vscode.TreeItem {
	public readonly label: string;
	public collapsibleState: vscode.TreeItemCollapsibleState;
	public prs: PullRequestModel[];
	public type: PRType;
	constructor(type: PRType) {
		this.prs = [];
		this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		this.type = type;
		switch (type) {
			case PRType.All:
				this.label = 'All';
				break;
			case PRType.RequestReview:
				this.label = 'Request Review';
				break;
			case PRType.ReviewedByMe:
				this.label = 'Reviewed By Me';
				break;
			case PRType.Mine:
				this.label = 'Mine';
				break;
			default:
				break;
		}
	}
}

export class FileChangeTreeItem implements vscode.TreeItem {
	public iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri };
	public resourceUri: vscode.Uri;
	public sha: string;
	public parentSha: string;
	public command?: vscode.Command;
	public comments?: any[];

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
		public readonly prItem: any,
		public readonly label: string,
		public readonly status: GitChangeType,
		public readonly fileName: string,
		public readonly filePath: vscode.Uri,
		public readonly parentFilePath: vscode.Uri,
		public readonly workspaceRoot: string,
		public readonly patch: string
	) {
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

}
