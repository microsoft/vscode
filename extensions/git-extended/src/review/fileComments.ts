/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { PullRequest } from '../common/treeItems';

const collection = vscode.languages.createDiagnosticCollection('reviews');
export function populatePRDiagnostics(workspaceRoot: string, pr: PullRequest) {
	// todo, if we already have fileChanges locally, then we reuse it, otherwise, compare between
	// pr.prItem.base.sha and pr.prItem.head.sha
	collection.clear();
	pr.fileChanges.forEach(filechange => {
		let comments = pr.comments.filter(comment => comment.path === filechange.fileName);
		let diags = comments.map(comment => ({
			code: '',
			message: `@${comment.user.login}: ${comment.body}`,
			range: new vscode.Range(new vscode.Position(comment.diff_hunk_range.start + comment.position - 1 - 1, 0), new vscode.Position(comment.diff_hunk_range.start + comment.position - 1 - 1, 0)),
			severity: vscode.DiagnosticSeverity.Error,
			source: '',
			relatedInformation: []
		}));
		collection.set(vscode.Uri.file(path.resolve(workspaceRoot, filechange.fileName)), diags);
	});
}

export function clearPRDiagnostics() {
	collection.clear();
}