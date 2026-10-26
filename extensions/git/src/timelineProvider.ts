/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CancellationToken, ConfigurationChangeEvent, Disposable, EventEmitter, FileType, ThemeIcon, Timeline, TimelineItem, TimelineOptions, TimelineProvider, Uri, workspace, l10n, Command, WorkspaceTimelineProvider } from 'vscode';
import { Model } from './model';
import { Repository, Resource } from './repository';
import { debounce } from './decorators';
import { emojify, ensureEmojis } from './emoji';
import { CommandCenter } from './commands';
import { OperationKind, OperationResult } from './operation';
import { truncate } from './util';
import { provideSourceControlHistoryItemAvatar, provideSourceControlHistoryItemHoverCommands, provideSourceControlHistoryItemMessageLinks } from './historyItemDetailsProvider';
import type { AvatarQuery, AvatarQueryCommit } from './api/git';
import { getCommitHover, getHoverCommitHashCommands, processHoverRemoteCommands } from './hover';
import { toGitUri } from './uri';
import { GitError, type Commit } from './git';

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
		contextValue: string,
		readonly rootUri: Uri
	) {
		const index = message.indexOf('\n');
		const label = index !== -1 ? `${truncate(message, index, false)}` : message;

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

/**
 * The number of commits to return from each repository when the workspace timeline asks for all items.
 */
const WORKSPACE_TIMELINE_PAGE_SIZE = 50;

function getCommitDate(commit: Commit, dateType: 'committed' | 'authored' | undefined): Date | undefined {
	return dateType === 'authored' ? commit.authorDate : commit.commitDate;
}

function getCommitTimestamp(commit: Commit, dateType: 'committed' | 'authored' | undefined): number {
	return getCommitDate(commit, dateType)?.getTime() ?? 0;
}

/**
 * Selects a page of the workspace timeline from the logs of the repositories, newest first. Each log starts after the
 * commits that earlier pages took from that repository, and has at least 1 more commit than the limit if there are more.
 *
 * Commits are only taken from the start of each log, so the number taken is where its next page starts, even when a
 * log is not ordered by timestamp, e.g. when using the authored date.
 *
 * @returns The commits of the page, and for each repository with more commits, how many commits its next page skips.
 */
export function getWorkspaceTimelinePage<T>(logs: readonly { readonly root: string; readonly commits: readonly T[]; readonly skip: number }[], limit: number, getTimestamp: (commit: T, log: number) => number): { page: { log: number; commit: T }[]; nextSkip: Record<string, number> | undefined } {
	const page: { log: number; commit: T }[] = [];
	const positions = logs.map(() => 0);
	while (page.length < limit) {
		let next: number | undefined;
		for (let log = 0; log < logs.length; log++) {
			if (positions[log] < logs[log].commits.length && (next === undefined || getTimestamp(logs[log].commits[positions[log]], log) > getTimestamp(logs[next].commits[positions[next]], next))) {
				next = log;
			}
		}

		if (next === undefined) {
			break;
		}

		page.push({ log: next, commit: logs[next].commits[positions[next]++] });
	}

	const nextSkip: Record<string, number> = {};
	logs.forEach(({ root, commits, skip }, log) => {
		if (commits.length > positions[log]) {
			nextSkip[root] = skip + positions[log];
		}
	});

	return { page, nextSkip: Object.keys(nextSkip).length > 0 ? nextSkip : undefined };
}

export class GitTimelineProvider implements TimelineProvider, WorkspaceTimelineProvider {
	private readonly _onDidChangeTimeline = new EventEmitter<undefined>();
	readonly onDidChangeTimeline = this._onDidChangeTimeline.event;

	private readonly _onDidChangeWorkspaceTimeline = new EventEmitter<void>();
	readonly onDidChangeWorkspaceTimeline = this._onDidChangeWorkspaceTimeline.event;

	readonly id = 'git-history';
	readonly label = l10n.t('Git History');

	private readonly disposable: Disposable;
	private providerDisposable: Disposable | undefined;

	private repo: Repository | undefined;
	private repoDisposable: Disposable | undefined;
	private repoOperationDate: Date | undefined;

	constructor(private readonly model: Model, private commands: CommandCenter) {
		this.disposable = Disposable.from(
			model.onDidOpenRepository(this.onRepositoriesChanged, this),
			model.onDidCloseRepository(() => this.fireWorkspaceChanged()),
			model.onDidChangeRepository(() => this.fireWorkspaceChanged()),
			workspace.onDidChangeConfiguration(this.onConfigurationChanged, this)
		);

		if (model.repositories.length) {
			this.ensureProviderRegistration();
		}
	}

	dispose() {
		this.providerDisposable?.dispose();
		this.disposable.dispose();
	}

	async provideTimeline(uri: Uri, options: TimelineOptions, token: CancellationToken): Promise<Timeline> {
		// console.log(`GitTimelineProvider.provideTimeline: uri=${uri}`);

		const repo = this.model.getRepository(uri);
		if (!repo) {
			this.repoDisposable?.dispose();
			this.repoOperationDate = undefined;
			this.repo = undefined;

			return { items: [] };
		}

		if (this.repo?.root !== repo.root) {
			this.repoDisposable?.dispose();

			this.repo = repo;
			this.repoOperationDate = new Date();
			this.repoDisposable = Disposable.from(
				repo.onDidChangeRepository(uri => this.onRepositoryChanged(repo, uri)),
				repo.onDidRunGitStatus(() => this.onRepositoryStatusChanged(repo)),
				repo.onDidRunOperation(result => this.onRepositoryOperationRun(repo, result))
			);
		}

		const isFolder = await this.isFolder(uri);

		// If we are not getting everything, ask for 1 more than so we can determine if there are more commits
		const limit = options.limit === undefined ? undefined : options.limit + 1;

		await ensureEmojis();

		const commits = await repo.logFile(
			uri,
			{
				maxEntries: limit,
				hash: options.cursor,
				// Following renames only works for files
				follow: !isFolder,
				filePaths: !isFolder,
				shortStats: true,
				// sortByAuthorDate: true
			},
			token
		);

		const cursor = limit !== undefined && commits.length >= limit ? commits[commits.length - 1]?.hash : undefined;

		// If we asked for an extra commit, strip it off
		if (cursor !== undefined) {
			commits.splice(commits.length - 1, 1);
		}

		const config = workspace.getConfiguration('git', Uri.file(repo.root));
		const showUncommitted = config.get<boolean>('timeline.showUncommitted');

		const openComparison = l10n.t('Open Comparison');

		const emptyTree = await repo.getEmptyTree();
		const getDetails = await this.getCommitDetails(repo, commits, uri);

		const items: GitTimelineItem[] = [];
		for (let index = 0; index < commits.length; index++) {
			const c = commits[index];
			const { message, timestamp, description, tooltip } = await getDetails(c);

			if (isFolder) {
				// A commit in a folder timeline is not a single version of a resource, so it opens the whole commit
				const item = new GitTimelineItem(c.hash, c.parents[0] ?? emptyTree, message, timestamp, c.hash, 'git:folder:commit', Uri.file(repo.root));
				item.iconPath = new ThemeIcon('git-commit');
				item.description = description;
				item.tooltip = tooltip;
				item.command = this.getOpenCommitCommand(item, uri);
				items.push(item);
				continue;
			}

			const previousRef = commits[index + 1]?.hash ?? emptyTree;
			const item = new GitTimelineItem(c.hash, previousRef, message, timestamp, c.hash, 'git:file:commit', Uri.file(repo.root));
			item.iconPath = new ThemeIcon('git-commit');
			item.description = description;
			item.tooltip = tooltip;
			// The file can have had another name at this commit when following renames
			item.resourceUri = c.filePath ? toGitUri(Uri.file(path.join(repo.root, c.filePath)), c.hash) : undefined;

			const cmd = this.commands.resolveTimelineOpenDiffCommand(item, uri);
			if (cmd) {
				item.command = {
					title: openComparison,
					command: cmd.command,
					arguments: cmd.arguments,
				};
			}

			items.push(item);
		}

		if (options.cursor === undefined && !isFolder) {
			const you = l10n.t('You');

			const index = repo.indexGroup.resourceStates.find(r => r.resourceUri.fsPath === uri.fsPath);
			if (index) {
				const date = this.repoOperationDate ?? new Date();

				const item = new GitTimelineItem('~', 'HEAD', l10n.t('Staged Changes'), date.getTime(), 'index', 'git:file:index', Uri.file(repo.root));
				// TODO@eamodio: Replace with a better icon -- reflecting its status maybe?
				item.iconPath = new ThemeIcon('git-commit');
				item.description = '';
				item.tooltip = getCommitHover(undefined, you, undefined, date, Resource.getStatusText(index.type), undefined, undefined);
				item.resourceUri = toGitUri(uri, '~');

				const cmd = this.commands.resolveTimelineOpenDiffCommand(item, uri);
				if (cmd) {
					item.command = {
						title: openComparison,
						command: cmd.command,
						arguments: cmd.arguments,
					};
				}

				items.splice(0, 0, item);
			}

			if (showUncommitted) {
				const working = repo.workingTreeGroup.resourceStates.find(r => r.resourceUri.fsPath === uri.fsPath);
				if (working) {
					const date = new Date();

					const item = new GitTimelineItem('', index ? '~' : 'HEAD', l10n.t('Uncommitted Changes'), date.getTime(), 'working', 'git:file:working', Uri.file(repo.root));
					item.iconPath = new ThemeIcon('circle-outline');
					item.description = '';
					item.tooltip = getCommitHover(undefined, you, undefined, date, Resource.getStatusText(working.type), undefined, undefined);
					item.resourceUri = uri;

					const cmd = this.commands.resolveTimelineOpenDiffCommand(item, uri);
					if (cmd) {
						item.command = {
							title: openComparison,
							command: cmd.command,
							arguments: cmd.arguments,
						};
					}

					items.splice(0, 0, item);
				}
			}
		}

		return { items, cursor };
	}

	async provideWorkspaceTimeline(options: TimelineOptions, token: CancellationToken): Promise<Timeline> {
		// The cursor holds the number of commits already returned from each repository that has more
		const skipByRoot: Record<string, number> | undefined = options.cursor ? JSON.parse(options.cursor) : undefined;
		const repositories = this.model.repositories.filter(repo => skipByRoot === undefined || skipByRoot[repo.root] !== undefined);
		const limit = options.limit ?? WORKSPACE_TIMELINE_PAGE_SIZE;

		await ensureEmojis();

		// Ask each repository for 1 more than the limit so we can determine if there are more commits
		const logs = await Promise.all(repositories.map(async repo => ({
			repo,
			root: repo.root,
			skip: skipByRoot?.[repo.root] ?? 0,
			commits: await this.logRepository(repo, limit + 1, skipByRoot?.[repo.root], token),
			dateType: workspace.getConfiguration('git', Uri.file(repo.root)).get<'committed' | 'authored'>('timeline.date')
		})));

		const { page, nextSkip } = getWorkspaceTimelinePage(logs, limit, (commit, log) => getCommitTimestamp(commit, logs[log].dateType));

		// Only resolve the details of repositories with commits in this page
		const showRepository = this.model.repositories.length > 1;
		const detailsByLog = new Map(await Promise.all([...new Set(page.map(entry => entry.log))].map(async log => {
			const { repo } = logs[log];
			const commits = page.filter(entry => entry.log === log).map(entry => entry.commit);
			return [log, {
				getDetails: await this.getCommitDetails(repo, commits, Uri.file(repo.root), showRepository),
				emptyTree: await repo.getEmptyTree()
			}] as const;
		})));

		const items: GitTimelineItem[] = [];
		const hashes = new Set<string>();
		for (const { log, commit } of page) {
			// The same commit can be in multiple repositories, e.g. worktrees
			if (hashes.has(commit.hash)) {
				continue;
			}
			hashes.add(commit.hash);

			const { repo } = logs[log];
			const { getDetails, emptyTree } = detailsByLog.get(log)!;
			const details = await getDetails(commit);
			const item = new GitTimelineItem(commit.hash, commit.parents[0] ?? emptyTree, details.message, details.timestamp, commit.hash, 'git:workspace:commit', Uri.file(repo.root));
			item.iconPath = new ThemeIcon('git-commit');
			item.description = details.description;
			item.tooltip = details.tooltip;
			item.command = this.getOpenCommitCommand(item, undefined);
			items.push(item);
		}

		return {
			items,
			cursor: nextSkip ? JSON.stringify(nextSkip) : undefined
		};
	}

	private async logRepository(repo: Repository, maxEntries: number, skip: number | undefined, token: CancellationToken): Promise<Commit[]> {
		try {
			return await repo.log({ maxEntries, skip, shortStats: true, silent: true }, token);
		} catch (err) {
			// A repository without commits has no history
			if (err instanceof GitError && /does not have any commits yet/.test(err.stderr ?? '')) {
				return [];
			}

			throw err;
		}
	}

	/**
	 * Resolves what is needed to show commits of a repository as timeline items.
	 */
	private async getCommitDetails(repo: Repository, commits: Commit[], hoverUri: Uri, showRepository = false) {
		const config = workspace.getConfiguration('git', Uri.file(repo.root));
		const dateType = config.get<'committed' | 'authored'>('timeline.date');
		const showAuthor = config.get<boolean>('timeline.showAuthor');

		const unpublishedCommits = await repo.getUnpublishedCommits();
		const remoteHoverCommands = await provideSourceControlHistoryItemHoverCommands(this.model, repo);

		const avatarQuery = {
			commits: commits.map(c => ({
				hash: c.hash,
				authorName: c.authorName,
				authorEmail: c.authorEmail
			}) satisfies AvatarQueryCommit),
			size: 20
		} satisfies AvatarQuery;
		const avatars = await provideSourceControlHistoryItemAvatar(this.model, repo, avatarQuery);

		const repositoryName = path.basename(repo.root);

		return async (c: Commit) => {
			const date = getCommitDate(c, dateType);
			const message = emojify(c.message);

			const commitRemoteSourceCommands = !unpublishedCommits.has(c.hash) ? remoteHoverCommands ?? [] : [];
			const messageWithLinks = await provideSourceControlHistoryItemMessageLinks(this.model, repo, message) ?? message;

			const commands: Command[][] = [
				getHoverCommitHashCommands(hoverUri, c.hash),
				processHoverRemoteCommands(commitRemoteSourceCommands, c.hash)
			];

			const descriptions = [showRepository ? repositoryName : undefined, showAuthor ? c.authorName : undefined].filter(d => !!d);

			return {
				message,
				timestamp: getCommitTimestamp(c, dateType),
				description: descriptions.length > 0 ? descriptions.join(' \u2022 ') : undefined,
				tooltip: getCommitHover(avatars?.get(c.hash), c.authorName, c.authorEmail, date, messageWithLinks, c.shortStat, commands)
			};
		};
	}

	private getOpenCommitCommand(item: GitTimelineItem, uri: Uri | undefined): Command {
		return {
			title: l10n.t('Open Commit'),
			command: 'git.timeline.viewCommit',
			arguments: [item, uri, this.id]
		};
	}

	private async isFolder(uri: Uri): Promise<boolean> {
		try {
			return ((await workspace.fs.stat(uri)).type & FileType.Directory) !== 0;
		} catch {
			return false;
		}
	}

	private ensureProviderRegistration() {
		if (this.providerDisposable === undefined) {
			this.providerDisposable = Disposable.from(
				workspace.registerTimelineProvider(['file', 'git', 'vscode-remote', 'vscode-local-history'], this),
				workspace.registerWorkspaceTimelineProvider(this)
			);
		}
	}

	private onConfigurationChanged(e: ConfigurationChangeEvent) {
		if (e.affectsConfiguration('git.timeline.date') || e.affectsConfiguration('git.timeline.showAuthor') || e.affectsConfiguration('git.timeline.showUncommitted')) {
			this.fireChanged();
			this.fireWorkspaceChanged();
		}
	}

	private onRepositoriesChanged(_repo: Repository) {
		// console.log(`GitTimelineProvider.onRepositoriesChanged`);

		this.ensureProviderRegistration();

		// TODO@eamodio: Being naive for now and just always refreshing each time there is a new repository
		this.fireChanged();
		this.fireWorkspaceChanged();
	}

	private onRepositoryChanged(_repo: Repository, _uri: Uri) {
		// console.log(`GitTimelineProvider.onRepositoryChanged: uri=${uri.toString(true)}`);

		this.fireChanged();
	}

	private onRepositoryStatusChanged(_repo: Repository) {
		// console.log(`GitTimelineProvider.onRepositoryStatusChanged`);

		const config = workspace.getConfiguration('git.timeline');
		const showUncommitted = config.get<boolean>('showUncommitted') === true;

		if (showUncommitted) {
			this.fireChanged();
		}
	}

	private onRepositoryOperationRun(_repo: Repository, _result: OperationResult) {
		// console.log(`GitTimelineProvider.onRepositoryOperationRun`);

		// Successful operations that are not read-only and not status operations
		if (!_result.error && !_result.operation.readOnly && _result.operation.kind !== OperationKind.Status) {
			// This is less than ideal, but for now just save the last time an
			// operation was run and use that as the timestamp for staged items
			this.repoOperationDate = new Date();

			this.fireChanged();
		}
	}

	@debounce(500)
	private fireChanged() {
		this._onDidChangeTimeline.fire(undefined);
	}

	@debounce(500)
	private fireWorkspaceChanged() {
		this._onDidChangeWorkspaceTimeline.fire();
	}
}
