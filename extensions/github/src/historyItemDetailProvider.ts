/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SourceControlHistoryItem, Command, l10n } from 'vscode';
import { API as GitAPI, Repository, SourceControlHistoryItemDetailProvider } from './typings/git';
import { getRepositoryDefaultRemoteUrl } from './util';

export class GitHubSourceControlHistoryItemDetailProvider implements SourceControlHistoryItemDetailProvider {
	constructor(private _gitAPI: GitAPI) { }

	async provideHoverCommands(repository: Repository): Promise<Command[] | undefined> {
		const url = getRepositoryDefaultRemoteUrl(repository);
		if (!url) {
			return undefined;
		}

		return [{
			title: l10n.t('{0} Open on GitHub', '$(github)'),
			tooltip: l10n.t('Open on GitHub'),
			command: 'github.openOnGitHub',
			arguments: [url]
		}];
	}

	async provideMessageLinks(repository: Repository, historyItem: SourceControlHistoryItem): Promise<string | undefined> {
		return undefined;
	}
}
