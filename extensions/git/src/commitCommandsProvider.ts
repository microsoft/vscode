/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { Command } from 'vscode';
import { CommitSecondaryCommandsProvider, ProviderResult } from './api/git';

const localize = nls.loadMessageBundle();

export class GitCommitSecondaryCommandsProvider implements CommitSecondaryCommandsProvider {
	getCommands(): ProviderResult<Command[]> {
		return [
			{
				command: 'git.commit',
				title: localize('scm secondary button commit', "Commit")
			},
			{
				command: 'git.push',
				title: localize('scm secondary button commit and push', "Commit & Push")
			},
			{
				command: 'git.sync',
				title: localize('scm secondary button commit and sync', "Commit & Sync")
			},
		];
	}
}
