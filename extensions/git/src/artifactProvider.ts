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
				id: 'stashes',
				name: 'Stashes',
				icon: new ThemeIcon('git-stash')
			},
			{
				id: 'tags',
				name: 'Tags',
				icon: new ThemeIcon('tag')
			}
		];
	}

	provideArtifacts(group: string): Promise<SourceControlArtifact[]> {
		console.log(group);
		throw new Error('Method not implemented.');
	}

	dispose(): void {
	}
}
