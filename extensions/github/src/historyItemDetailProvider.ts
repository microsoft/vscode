/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, l10n } from 'vscode';
import { Repository, SourceControlHistoryItemDetailProvider } from './typings/git';
import { getRepositoryDefaultRemote, getRepositoryDefaultRemoteUrl } from './util';

const ISSUE_EXPRESSION = /(([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+))?(#|GH-)([1-9][0-9]*)($|\b)/g;

export class GitHubSourceControlHistoryItemDetailProvider implements SourceControlHistoryItemDetailProvider {
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

	async provideMessageLinks(repository: Repository, message: string): Promise<string | undefined> {
		const descriptor = getRepositoryDefaultRemote(repository);
		if (!descriptor) {
			return undefined;
		}

		return message.replace(
			ISSUE_EXPRESSION,
			(match, _group1, owner: string | undefined, repo: string | undefined, _group2, number: string | undefined) => {
				if (!number || Number.isNaN(parseInt(number))) {
					return match;
				}

				const label = owner && repo
					? `${owner}/${repo}#${number}`
					: `#${number}`;

				owner = owner ?? descriptor.owner;
				repo = repo ?? descriptor.repo;

				return `[${label}](https://github.com/${owner}/${repo}/issues/${number})`;
			});
	}
}
