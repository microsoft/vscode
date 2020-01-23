/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, Event, EventEmitter, ThemeIcon, TimelineItem, TimelineProvider, Uri, workspace } from 'vscode';
import { Model } from './model';
import { Repository } from './repository';
import { debounce } from './decorators';

export class GitTimelineProvider implements TimelineProvider {
	private _onDidChange = new EventEmitter<Uri | undefined>();
	get onDidChange(): Event<Uri | undefined> {
		return this._onDidChange.event;
	}

	readonly source = 'git-history';
	readonly sourceDescription = 'Git History';

	private _disposable: Disposable;

	private _repo: Repository | undefined;
	private _repoDisposable: Disposable | undefined;

	constructor(private readonly _model: Model) {
		this._disposable = workspace.registerTimelineProvider('*', this);
	}

	dispose() {
		this._disposable.dispose();
	}

	async provideTimeline(uri: Uri, _since: number, _token: CancellationToken): Promise<TimelineItem[]> {
		console.log(`GitTimelineProvider.provideTimeline: uri=${uri} state=${this._model.state}`);

		const repo = this._model.getRepository(uri);
		if (!repo) {
			console.log(`GitTimelineProvider.provideTimeline: repo NOT found`);

			this._repoDisposable?.dispose();
			this._repo = undefined;

			return [];
		}

		console.log(`GitTimelineProvider.provideTimeline: repo found`);

		if (this._repo?.root !== repo.root) {
			this._repoDisposable?.dispose();

			this._repo = repo;
			this._repoDisposable = Disposable.from(
				repo.onDidChangeRepository(() => this.onRepositoryChanged(), this)
			);
		}

		// TODO: Ensure that the uri is a file -- if not we could get the history of the repo?

		const commits = await repo.logFile(uri, { maxEntries: 10 });

		console.log(`GitTimelineProvider.provideTimeline: commits=${commits.length}`);

		const items = commits.map<TimelineItem>(c => {
			let message = c.message;

			const index = message.indexOf('\n');
			if (index !== -1) {
				message = `${message.substring(0, index)} \u2026`;
			}

			return {
				id: c.hash,
				date: c.authorDate?.getTime() ?? 0,
				iconPath: new ThemeIcon('git-commit'),
				label: message,
				description: `${c.authorName} (${c.authorEmail}) \u2022 ${c.hash.substr(0, 8)}`,
				detail: `${c.authorName} (${c.authorEmail})\n${c.authorDate}\n\n${c.message}`,
				command: {
					title: 'Open Diff',
					command: 'git.openDiff',
					arguments: [uri, c.hash]
				}
			};
		});

		const index = repo.indexGroup.resourceStates.find(r => r.resourceUri.fsPath === uri.fsPath);
		if (index) {
			items.push({
				id: '~',
				// TODO: Fix the date
				date: Date.now(),
				iconPath: new ThemeIcon('git-commit'),
				label: 'Staged Changes',
				description: '',
				detail: '',
				command: {
					title: 'Open Diff',
					command: 'git.openDiff',
					arguments: [uri, '~']
				}
			});
		}

		return items;
	}

	@debounce(500)
	private onRepositoryChanged() {
		console.log(`GitTimelineProvider.onRepositoryChanged`);

		this._onDidChange.fire();
	}
}
