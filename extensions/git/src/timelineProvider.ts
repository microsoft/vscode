/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dayjs from 'dayjs';
import * as advancedFormat from 'dayjs/plugin/advancedFormat';
import { CancellationToken, Disposable, Event, EventEmitter, ThemeIcon, Timeline, TimelineChangeEvent, TimelineCursor, TimelineItem, TimelineProvider, Uri, workspace } from 'vscode';
import { Model } from './model';
import { Repository } from './repository';
import { debounce } from './decorators';
import { Status } from './api/git';

dayjs.extend(advancedFormat);

// TODO[ECA]: Localize all the strings
// TODO[ECA]: Localize or use a setting for date format

export class GitTimelineItem extends TimelineItem {
	static is(item: TimelineItem): item is GitTimelineItem {
		return item instanceof GitTimelineItem;
	}

	readonly ref: string;
	readonly previousRef: string;
	readonly message: string;

	constructor(
		ref: string,
		previousRef: string,
		message: string,
		timestamp: number,
		id: string,
		contextValue: string
	) {
		const index = message.indexOf('\n');
		const label = index !== -1 ? `${message.substring(0, index)} \u2026` : message;

		super(label, timestamp);

		this.ref = ref;
		this.previousRef = previousRef;
		this.message = message;
		this.id = id;
		this.contextValue = contextValue;
	}

	get shortRef() {
		return this.shortenRef(this.ref);
	}

	get shortPreviousRef() {
		return this.shortenRef(this.previousRef);
	}

	private shortenRef(ref: string): string {
		if (ref === '' || ref === '~' || ref === 'HEAD') {
			return ref;
		}
		return ref.endsWith('^') ? `${ref.substr(0, 8)}^` : ref.substr(0, 8);
	}
}

export class GitTimelineProvider implements TimelineProvider {
	private _onDidChange = new EventEmitter<TimelineChangeEvent>();
	get onDidChange(): Event<TimelineChangeEvent> {
		return this._onDidChange.event;
	}

	readonly id = 'git-history';
	readonly label = 'Git History';

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

	async provideTimeline(uri: Uri, _cursor: TimelineCursor, _token: CancellationToken): Promise<Timeline> {
		// console.log(`GitTimelineProvider.provideTimeline: uri=${uri} state=${this._model.state}`);

		const repo = this._model.getRepository(uri);
		if (!repo) {
			this._repoDisposable?.dispose();
			this._repoStatusDate = undefined;
			this._repo = undefined;

			return { items: [] };
		}

		if (this._repo?.root !== repo.root) {
			this._repoDisposable?.dispose();

			this._repo = repo;
			this._repoStatusDate = new Date();
			this._repoDisposable = Disposable.from(
				repo.onDidChangeRepository(uri => this.onRepositoryChanged(repo, uri)),
				repo.onDidRunGitStatus(() => this.onRepositoryStatusChanged(repo))
			);
		}

		// TODO[ECA]: Ensure that the uri is a file -- if not we could get the history of the repo?

		const commits = await repo.logFile(uri);

		let dateFormatter: dayjs.Dayjs;
		const items = commits.map<GitTimelineItem>(c => {
			dateFormatter = dayjs(c.authorDate);

			const item = new GitTimelineItem(c.hash, `${c.hash}^`, c.message, c.authorDate?.getTime() ?? 0, c.hash, 'git:file:commit');
			item.iconPath = new (ThemeIcon as any)('git-commit');
			item.description = c.authorName;
			item.detail = `${c.authorName} (${c.authorEmail}) \u2014 ${c.hash.substr(0, 8)}\n${dateFormatter.format('MMMM Do, YYYY h:mma')}\n\n${c.message}`;
			item.command = {
				title: 'Open Comparison',
				command: 'git.timeline.openDiff',
				arguments: [uri, this.id, item]
			};

			return item;
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

			const item = new GitTimelineItem('~', 'HEAD', 'Staged Changes', date.getTime(), 'index', 'git:file:index');
			// TODO[ECA]: Replace with a better icon -- reflecting its status maybe?
			item.iconPath = new (ThemeIcon as any)('git-commit');
			item.description = 'You';
			item.detail = `You  \u2014 Index\n${dateFormatter.format('MMMM Do, YYYY h:mma')}\n${status}`;
			item.command = {
				title: 'Open Comparison',
				command: 'git.timeline.openDiff',
				arguments: [uri, this.id, item]
			};

			items.push(item);
		}


		const working = repo.workingTreeGroup.resourceStates.find(r => r.resourceUri.fsPath === uri.fsPath);
		if (working) {
			const date = new Date();
			dateFormatter = dayjs(date);

			let status;
			switch (working.type) {
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

			const item = new GitTimelineItem('', index ? '~' : 'HEAD', 'Uncommited Changes', date.getTime(), 'working', 'git:file:working');
			// TODO[ECA]: Replace with a better icon -- reflecting its status maybe?
			item.iconPath = new (ThemeIcon as any)('git-commit');
			item.description = 'You';
			item.detail = `You  \u2014 Working Tree\n${dateFormatter.format('MMMM Do, YYYY h:mma')}\n${status}`;
			item.command = {
				title: 'Open Comparison',
				command: 'git.timeline.openDiff',
				arguments: [uri, this.id, item]
			};

			items.push(item);
		}

		return { items: items };
	}

	private onRepositoriesChanged(_repo: Repository) {
		// console.log(`GitTimelineProvider.onRepositoriesChanged`);

		// TODO[ECA]: Being naive for now and just always refreshing each time there is a new repository
		this.fireChanged();
	}

	private onRepositoryChanged(_repo: Repository, _uri: Uri) {
		// console.log(`GitTimelineProvider.onRepositoryChanged: uri=${uri.toString(true)}`);

		this.fireChanged();
	}

	private onRepositoryStatusChanged(_repo: Repository) {
		// console.log(`GitTimelineProvider.onRepositoryStatusChanged`);

		// This is crappy, but for now just save the last time a status was run and use that as the timestamp for staged items
		this._repoStatusDate = new Date();

		this.fireChanged();
	}

	@debounce(500)
	private fireChanged() {
		this._onDidChange.fire({});
	}
}
