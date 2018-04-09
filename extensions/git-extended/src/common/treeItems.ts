/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitChangeType } from './models/file';
import { Comment } from './models/comment';
import { Remote } from './models/remote';

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
	public fileChanges?: FileChange[];
	constructor(public readonly otcokit: any, public readonly remote: Remote, public prItem: any) { }
}

export class FileChange implements vscode.TreeItem {
	public iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri };
	public sha: string;
	public parentSha: string;
	public command?: vscode.Command;
	public comments?: any[];

	constructor(
		public readonly prItem: any,
		public readonly label: string,
		public readonly status: GitChangeType,
		public readonly context: vscode.ExtensionContext,
		public readonly fileName: string,
		public readonly filePath: vscode.Uri,
		public readonly parentFilePath: vscode.Uri,
		public readonly workspaceRoot: string
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
