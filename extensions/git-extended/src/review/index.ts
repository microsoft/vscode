/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { Repository } from '../common/models/repository';
import { fetch, checkout } from '../common/operation';
import { populatePRDiagnostics } from './FileComments';
import { PullRequest } from '../common/treeItems';

export async function enterReviewMode(workspaceRoot: string, repository: Repository, pr: PullRequest, gitRepo: any) {
	// git fetch ${pr.remote.remoteName} pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}
	await fetch(repository, pr.remote.remoteName, `pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}`);
	await checkout(repository, `pull-request-${pr.prItem.number}`);

	if (!pr.fileChanges || !pr.comments) {
		return;
	}

	populatePRDiagnostics(workspaceRoot, pr);

	let prChangeResources = pr.fileChanges.map(fileChange => ({
		resourceUri: vscode.Uri.file(path.resolve(workspaceRoot, fileChange.fileName)),
		command: {
			title: 'show diff',
			command: 'vscode.diff',
			arguments: [
				vscode.Uri.file(path.resolve(workspaceRoot, fileChange.parentFilePath)),
				vscode.Uri.file(path.resolve(workspaceRoot, fileChange.filePath)),
				fileChange.fileName
			]
		}
	}));

	let prGroup: vscode.SourceControlResourceGroup = gitRepo._sourceControl.createResourceGroup('pr', 'Changes from PR');
	prGroup.resourceStates = prChangeResources;
}