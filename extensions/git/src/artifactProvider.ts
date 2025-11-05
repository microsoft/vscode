/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogOutputChannel, SourceControlArtifactProvider, SourceControlArtifactGroup, SourceControlArtifact, Event, EventEmitter, ThemeIcon, l10n, workspace, Uri, Disposable } from 'vscode';
import { dispose, fromNow, IDisposable } from './util';
import { Repository } from './repository';
import { Ref, RefType } from './api/git';

function getArtifactDescription(ref: Ref, shortCommitLength: number): string {
	const segments: string[] = [];
	if (ref.commitDetails?.commitDate) {
		segments.push(fromNow(ref.commitDetails.commitDate));
	}
	if (ref.commit) {
		segments.push(ref.commit.substring(0, shortCommitLength));
	}
	if (ref.commitDetails?.message) {
		segments.push(ref.commitDetails.message.split('\n')[0]);
	}

	return segments.join(' \u2022 ');
}

export class GitArtifactProvider implements SourceControlArtifactProvider, IDisposable {
	private readonly _onDidChangeArtifacts = new EventEmitter<string[]>();
	readonly onDidChangeArtifacts: Event<string[]> = this._onDidChangeArtifacts.event;

	private readonly _groups: SourceControlArtifactGroup[];
	private readonly _disposables: Disposable[] = [];

	constructor(
		private readonly repository: Repository,
		private readonly logger: LogOutputChannel
	) {
		this._groups = [
			{ id: 'branches', name: l10n.t('Branches'), icon: new ThemeIcon('git-branch') },
			{ id: 'tags', name: l10n.t('Tags'), icon: new ThemeIcon('tag') }
		];

		this._disposables.push(this._onDidChangeArtifacts);
		this._disposables.push(repository.historyProvider.onDidChangeHistoryItemRefs(e => {
			const groups = new Set<string>();
			for (const ref of e.added.concat(e.modified).concat(e.removed)) {
				if (ref.id.startsWith('refs/heads/')) {
					groups.add('branches');
				} else if (ref.id.startsWith('refs/tags/')) {
					groups.add('tags');
				}
			}

			this._onDidChangeArtifacts.fire(Array.from(groups));
		}));
	}

	provideArtifactGroups(): SourceControlArtifactGroup[] {
		return this._groups;
	}

	async provideArtifacts(group: string): Promise<SourceControlArtifact[]> {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const shortCommitLength = config.get<number>('commitShortHashLength', 7);

		try {
			if (group === 'branches') {
				const refs = await this.repository
					.getRefs({ pattern: 'refs/heads', includeCommitDetails: true });

				return refs.map(r => ({
					id: `refs/heads/${r.name}`,
					name: r.name ?? r.commit ?? '',
					description: getArtifactDescription(r, shortCommitLength),
					icon: this.repository.HEAD?.type === RefType.Head && r.name === this.repository.HEAD?.name
						? new ThemeIcon('target')
						: new ThemeIcon('git-branch')
				}));
			} else if (group === 'tags') {
				const refs = await this.repository
					.getRefs({ pattern: 'refs/tags', includeCommitDetails: true });

				return refs.map(r => ({
					id: `refs/tags/${r.name}`,
					name: r.name ?? r.commit ?? '',
					description: getArtifactDescription(r, shortCommitLength),
					icon: this.repository.HEAD?.type === RefType.Tag && r.name === this.repository.HEAD?.name
						? new ThemeIcon('target')
						: new ThemeIcon('tag')
				}));
			}
		} catch (err) {
			this.logger.error(`[GitArtifactProvider][provideArtifacts] Error while providing artifacts for group '${group}': `, err);
			return [];
		}

		return [];
	}

	dispose(): void {
		dispose(this._disposables);
	}
}
