/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { Repository } from '../models/repository';
import { fromGitUri } from '../common/uri';
import { PullRequestModel } from '../models/pullRequestModel';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	get onDidChange(): vscode.Event<vscode.Uri> { return this._onDidChange.event; }

	constructor(private repository: Repository) { }

	async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
		let { path, commit } = fromGitUri(uri);

		if (!path || !commit) {
			return '';
		}

		let ret = await this.repository.show(`${commit}:${path}`);
		return ret;
	}
}
