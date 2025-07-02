/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogOutputChannel, SourceControlArtifactProvider, SourceControlArtifactGroup, SourceControlArtifact, Event, EventEmitter } from 'vscode';
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
			},
			{
				id: 'stashes',
				name: 'Stashes',
			},
			{
				id: 'tags',
				name: 'Tags',
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
