/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogOutputChannel, SourceControlArtifactProvider, SourceControlArtifactGroup, SourceControlArtifact, Event, EventEmitter, ThemeIcon } from 'vscode';
import { IDisposable } from './util';
import { Repository } from './repository';

export class GitArtifactProvider implements SourceControlArtifactProvider, IDisposable {
	constructor(
		private readonly repository: Repository,
		private readonly logger: LogOutputChannel
	) {
		this.logger.info('GitArtifactProvider initialized: ', this.repository.root);
	}

	private readonly _onDidChangeArtifacts = new EventEmitter<string>();
	readonly onDidChangeArtifacts: Event<string> = this._onDidChangeArtifacts.event;

	provideArtifactGroups(): SourceControlArtifactGroup[] {
		return [
			{
				id: 'branches',
				name: 'Branches',
				icon: new ThemeIcon('git-branch')
			},
			{
				id: 'remotes',
				name: 'Remotes',
				icon: new ThemeIcon('remote')
			},
			{
				id: 'stashes',
				name: 'Stashes',
				icon: new ThemeIcon('git-stash')
			},
			{
				id: 'tags',
				name: 'Tags',
				icon: new ThemeIcon('tag')
			},
			{
				id: 'worktrees',
				name: 'Worktrees',
				icon: new ThemeIcon('list-tree')
			}
		];
	}

	async provideArtifacts(group: string): Promise<SourceControlArtifact[]> {
		if (group === 'branches') {
			const refs = await this.repository.getRefs({ pattern: 'refs/heads', includeCommitDetails: true });

			return refs.map(r => ({
				id: `refs/heads/${r.name}`,
				name: r.name ?? r.commit ?? '',
				description: r.commitDetails?.message
			}));
		} else if (group === 'tags') {
			const refs = await this.repository.getRefs({ pattern: 'refs/tags', includeCommitDetails: true });

			return refs.map(r => ({
				id: `refs/tags/${r.name}`,
				name: r.name ?? r.commit ?? '',
				description: r.commitDetails?.message
			}));
		}

		return [];
	}

	dispose(): void {
	}
}
