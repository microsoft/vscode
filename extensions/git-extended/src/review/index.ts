/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { Repository } from '../common/models/repository';
import { populatePRDiagnostics } from './FileComments';
import { PullRequest, FileChange } from '../common/treeItems';
import { Comment } from '../common/models/comment';
import { toGitUri } from '../common/uri';
import { CommentsProvider } from '../commentsProvider';
import { GitChangeType } from '../common/models/file';
import { fetch, checkout, diff } from '../common/operation';
import { mapCommentsToHead } from '../common/diff';
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

export async function restoreReviewState(repository: Repository, crendentialStore: CredentialStore, workspaceState: vscode.Memento, gitRepo: any, commentsProvider: CommentsProvider) {
	let branch = repository.HEAD.name;

	if (!branch) {
		return;
	}

	let state = workspaceState.get(`${REVIEW_STATE}:${branch}`);

	if (!state) {
		return;
	}

	// we are in review mode
	let fileChanges: FileChange[] = state['fileChanges'];
	let comments: Comment[] = state['comments'];

	if (!fileChanges || !comments) {
		return;
	}

	let localFileChanges = parseCommitDiff(repository, state['head'].sha, state['base'].sha, fileChanges);

	populatePRDiagnostics(repository.path, localFileChanges, comments);
	const commentsCache = new Map<String, Comment[]>();
	localFileChanges.forEach(changedItem => {
		let matchingComments = comments.filter(comment => comment.path === changedItem.fileName);
		commentsCache.set(changedItem.filePath.toString(), matchingComments);
	});
	commentsProvider.registerCommentProvider({
		provideComments: async (uri: vscode.Uri) => {
			let matchingComments = commentsCache.get(uri.toString());
			return [matchingComments || [], []];
		}
	});
	commentsProvider.registerCommentProvider({
		provideComments: async (uri: vscode.Uri) => {
			let fileName = uri.path;
			let matchedFiles = localFileChanges.filter(fileChange => path.resolve(repository.path, fileChange.fileName) === fileName);
			if (matchedFiles && matchedFiles.length) {
				let matchedFile = matchedFiles[0];
				// last commit sha of pr
				let prHead = state['head'].sha;
				// git diff sha -- fileName
				let contentDiff = await diff(repository, matchedFile.fileName, prHead);
				let matchingComments = comments.filter(comment => path.resolve(repository.path, comment.path) === fileName);
				matchingComments = mapCommentsToHead(contentDiff, matchingComments);
				return [matchingComments || [], []];
			}
			return [[], []];
		}
	});

	let prChangeResources = localFileChanges.map(fileChange => ({
		resourceUri: fileChange.filePath,
		command: {
			title: 'show diff',
			command: 'vscode.diff',
			arguments: [
				fileChange.parentFilePath,
				fileChange.filePath,
				fileChange.fileName
			]
		}
	}));

	let prGroup: vscode.SourceControlResourceGroup = gitRepo.sourceControl.createResourceGroup('pr', 'Changes from PR');
	prGroup.resourceStates = prChangeResources;
}

export async function enterReviewMode(workspaceState: vscode.Memento, repository: Repository, pr: PullRequest, gitRepo: any) {
	await fetch(repository, pr.remote.remoteName, `pull/${pr.prItem.number}/head:pull-request-${pr.prItem.number}`);
	await checkout(repository, `pull-request-${pr.prItem.number}`);

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
	}).then(e => {
		if (!pr.fileChanges || !pr.comments) {
			return;
		}

		populatePRDiagnostics(repository.path, pr.fileChanges, pr.comments);

		let prChangeResources = pr.fileChanges.map(fileChange => ({
			resourceUri: vscode.Uri.file(path.resolve(repository.path, fileChange.fileName)),
			command: {
				title: 'show diff',
				command: 'vscode.diff',
				arguments: [
					fileChange.parentFilePath,
					fileChange.filePath,
					fileChange.fileName
				]
			}
		}));

		let prGroup: vscode.SourceControlResourceGroup = gitRepo.sourceControl.createResourceGroup('pr', 'Changes from PR');
		prGroup.resourceStates = prChangeResources;
	});
}