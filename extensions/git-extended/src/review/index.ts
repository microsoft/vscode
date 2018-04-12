/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Repository } from '../common/models/repository';
import { PullRequest, FileChange } from '../common/treeItems';
import { toGitUri } from '../common/uri';
import { GitChangeType } from '../common/models/file';
import { fetch, checkout } from '../common/operation';
import { CredentialStore } from '../credentials';

const REVIEW_STATE = 'git-extended.state';

export function parseCommitDiff(repository: Repository, head: string, base: string, fileChanges: FileChange[]): FileChange[] {
	let ret = fileChanges.map(fileChange => {
		let parentFilePath = toGitUri(vscode.Uri.parse(fileChange.fileName), null, fileChange.status === GitChangeType.ADD ? '' : base, {});
		let filePath = toGitUri(vscode.Uri.parse(fileChange.fileName), null, fileChange.status === GitChangeType.DELETE ? '' : head, {});
		return new FileChange(fileChange.prItem, fileChange.label, fileChange.status, fileChange.context, fileChange.fileName, filePath, parentFilePath, fileChange.workspaceRoot);
	});

	return ret;
}

export async function enterReviewMode(workspaceState: vscode.Memento, repository: Repository, crendentialStore: CredentialStore, pr: PullRequest, gitRepo: any) {
	try {
		await fetch(repository, pr.remote.remoteName, `pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}`);
		await checkout(repository, `pull-request-${pr.prItem.number}`);
	} catch (e) {
		vscode.window.showErrorMessage(e);
		return;
	}

	workspaceState.update(`${REVIEW_STATE}:pull-request-${pr.prItem.number}`, {
		remote: pr.remote.remoteName,
		prNumber: pr.prItem.number,
		branch: `pull-request-${pr.prItem.number}`,
		head: pr.prItem.head,
		base: pr.prItem.base,
		fileChanges: pr.fileChanges.map(filechange => (
			{
				fileName: filechange.fileName,
				parentFilePath: filechange.parentFilePath,
				filePath: filechange.filePath
			})),
		comments: pr.comments
	}).then(async e => {
		if (!pr.fileChanges || !pr.comments) {
			return;
		}

		await repository.status();
	});
}