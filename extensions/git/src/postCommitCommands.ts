/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { Command, Disposable, Event } from 'vscode';
import { PostCommitCommandsProvider } from './api/git';

export interface IPostCommitCommandsProviderRegistry {
	readonly onDidChangePostCommitCommandsProviders: Event<void>;

	getPostCommitCommandsProviders(): PostCommitCommandsProvider[];
	registerPostCommitCommandsProvider(provider: PostCommitCommandsProvider): Disposable;
}

const localize = nls.loadMessageBundle();

export class GitPostCommitCommandsProvider implements PostCommitCommandsProvider {
	getCommands(): Command[] {
		return [
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
