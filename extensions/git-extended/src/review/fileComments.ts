/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FileChange } from '../common/treeItems';
import { Repository } from '../common/models/repository';
import { toGitUri } from '../common/uri';
import { GitChangeType } from '../common/models/file';

export function parseCommitDiff(repository: Repository, head: string, base: string, fileChanges: FileChange[]): FileChange[] {
	let ret = fileChanges.map(fileChange => {
		let parentFilePath = toGitUri(vscode.Uri.parse(fileChange.fileName), null, fileChange.status === GitChangeType.ADD ? '' : base, {});
		let filePath = toGitUri(vscode.Uri.parse(fileChange.fileName), null, fileChange.status === GitChangeType.DELETE ? '' : head, {});
		return new FileChange(fileChange.prItem, fileChange.label, fileChange.status, fileChange.context, fileChange.fileName, filePath, parentFilePath, fileChange.workspaceRoot);
	});

	return ret;
}
