/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitChangeType } from './file';

export class FileChange {
	public sha: string;
	public parentSha: string;
	public comments?: any[];

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
	}
}
