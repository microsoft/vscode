/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dayjs from 'dayjs';
import * as advancedFormat from 'dayjs/plugin/advancedFormat';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import { CancellationToken, Disposable, Event, EventEmitter, ThemeIcon, TimelineItem, TimelineProvider, Uri, workspace } from 'vscode';
import { Model } from './model';
import { Repository } from './repository';
import { debounce } from './decorators';
import { Status } from './api/git';

dayjs.extend(advancedFormat);
dayjs.extend(relativeTime);

// TODO[ECA]: Localize all the strings
// TODO[ECA]: Localize or use a setting for date format

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
	private _repoStatusDate: Date | undefined;

	constructor(private readonly _model: Model) {
		this._disposable = Disposable.from(
			_model.onDidOpenRepository(this.onRepositoriesChanged, this),
			workspace.registerTimelineProvider('*', this),
		);
	}

	dispose() {
		this._disposable.dispose();
	}

	async provideTimeline(uri: Uri, _token: CancellationToken): Promise<TimelineItem[]> {
		// console.log(`GitTimelineProvider.provideTimeline: uri=${uri} state=${this._model.state}`);

		const repo = this._model.getRepository(uri);
		if (!repo) {
			this._repoDisposable?.dispose();
			this._repoStatusDate = undefined;
			this._repo = undefined;

			return [];
		}

		if (this._repo?.root !== repo.root) {
			this._repoDisposable?.dispose();

			this._repo = repo;
			this._repoStatusDate = new Date();
			this._repoDisposable = Disposable.from(
				repo.onDidChangeRepository(this.onRepositoryChanged, this),
				repo.onDidRunGitStatus(this.onRepositoryStatusChanged, this)
			);
		}

		// TODO[ECA]: Ensure that the uri is a file -- if not we could get the history of the repo?

		const commits = await repo.logFile(uri);

		let dateFormatter: dayjs.Dayjs;
		const items = commits.map<TimelineItem>(c => {
			let message = c.message;

			const index = message.indexOf('\n');
			if (index !== -1) {
				message = `${message.substring(0, index)} \u2026`;
			}

			dateFormatter = dayjs(c.authorDate);

			return {
				id: c.hash,
				timestamp: c.authorDate?.getTime() ?? 0,
				iconPath: new ThemeIcon('git-commit'),
				label: message,
				description: `${dateFormatter.fromNow()}  \u2022  ${c.authorName}`,
				detail: `${c.authorName} (${c.authorEmail}) \u2014 ${c.hash.substr(0, 8)}\n${dateFormatter.fromNow()} (${dateFormatter.format('MMMM Do, YYYY h:mma')})\n\n${c.message}`,
				command: {
					title: 'Open Diff',
					command: 'git.openDiff',
					arguments: [uri, c.hash]
				}
			};
		});

		const index = repo.indexGroup.resourceStates.find(r => r.resourceUri.fsPath === uri.fsPath);
		if (index) {
			const date = this._repoStatusDate ?? new Date();
			dateFormatter = dayjs(date);

			let status;
			switch (index.type) {
				case Status.INDEX_MODIFIED:
					status = 'Modified';
					break;
				case Status.INDEX_ADDED:
					status = 'Added';
					break;
				case Status.INDEX_DELETED:
					status = 'Deleted';
					break;
				case Status.INDEX_RENAMED:
					status = 'Renamed';
					break;
				case Status.INDEX_COPIED:
					status = 'Copied';
					break;
				default:
					status = '';
					break;
			}


			items.push({
				id: '~',
				timestamp: date.getTime(),
				// TODO[ECA]: Replace with a better icon -- reflecting its status maybe?
				iconPath: new ThemeIcon('git-commit'),
				label: 'Staged Changes',
				description: `${dateFormatter.fromNow()}  \u2022  You`,
				detail: `You  \u2014 Index\n${dateFormatter.fromNow()} (${dateFormatter.format('MMMM Do, YYYY h:mma')})\n${status}`,
				command: {
					title: 'Open Comparison',
					command: 'git.openDiff',
					arguments: [uri, '~']
				}
			});
		}

		return items;
	}

	@debounce(500)
	private onRepositoriesChanged(_repo: Repository) {
		// console.log(`GitTimelineProvider.onRepositoriesChanged`);

		// TODO[ECA]: Being naive for now and just always refreshing each time there is a new repository
		this._onDidChange.fire();
	}

	@debounce(500)
	private onRepositoryChanged() {
		// console.log(`GitTimelineProvider.onRepositoryChanged`);

		this._onDidChange.fire();
	}

	private onRepositoryStatusChanged() {
		// This is crappy, but for now just save the last time a status was run and use that as the timestamp for staged items
		this._repoStatusDate = new Date();
	}
}
