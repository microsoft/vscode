/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, Event, EventEmitter, FileDecoration, FileDecorationProvider, SourceControlHistoryItem, SourceControlHistoryItemChange, SourceControlHistoryItemGroup, SourceControlHistoryOptions, SourceControlHistoryProvider, ThemeIcon, Uri, window, l10n, LogOutputChannel } from 'vscode';
import { Repository, Resource } from './repository';
import { IDisposable, filterEvent } from './util';
import { toGitUri } from './uri';
import { Branch, RefType, Status } from './api/git';
import { emojify, ensureEmojis } from './emoji';
import { Operation } from './operation';

export class GitHistoryProvider implements SourceControlHistoryProvider, FileDecorationProvider, IDisposable {

	private readonly _onDidChangeCurrentHistoryItemGroup = new EventEmitter<void>();
	readonly onDidChangeCurrentHistoryItemGroup: Event<void> = this._onDidChangeCurrentHistoryItemGroup.event;

	private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
	readonly onDidChangeFileDecorations: Event<Uri[]> = this._onDidChangeDecorations.event;

	private _HEAD: Branch | undefined;
	private _currentHistoryItemGroup: SourceControlHistoryItemGroup | undefined;

	get currentHistoryItemGroup(): SourceControlHistoryItemGroup | undefined { return this._currentHistoryItemGroup; }
	set currentHistoryItemGroup(value: SourceControlHistoryItemGroup | undefined) {
		this._currentHistoryItemGroup = value;
		this._onDidChangeCurrentHistoryItemGroup.fire();
	}

	private historyItemDecorations = new Map<string, FileDecoration>();

	private disposables: Disposable[] = [];

	constructor(protected readonly repository: Repository, private readonly logger: LogOutputChannel) {
		this.disposables.push(repository.onDidRunGitStatus(this.onDidRunGitStatus, this));
		this.disposables.push(filterEvent(repository.onDidRunOperation, e => e.operation === Operation.Refresh)(() => this._onDidChangeCurrentHistoryItemGroup.fire()));

		this.disposables.push(window.registerFileDecorationProvider(this));
	}

	private async onDidRunGitStatus(): Promise<void> {
		// Check if HEAD has changed
		if (this._HEAD?.name === this.repository.HEAD?.name &&
			this._HEAD?.commit === this.repository.HEAD?.commit &&
			this._HEAD?.upstream?.name === this.repository.HEAD?.upstream?.name &&
			this._HEAD?.upstream?.remote === this.repository.HEAD?.upstream?.remote &&
			this._HEAD?.upstream?.commit === this.repository.HEAD?.upstream?.commit) {
			return;
		}

		this._HEAD = this.repository.HEAD;

		// Check if HEAD supports incoming/outgoing (not a tag, not detached)
		if (!this._HEAD?.name || !this._HEAD?.commit || this._HEAD.type === RefType.Tag) {
			this.currentHistoryItemGroup = undefined;
			return;
		}

		this.currentHistoryItemGroup = {
			id: `refs/heads/${this._HEAD.name}`,
			label: this._HEAD.name,
			upstream: this._HEAD.upstream ?
				{
					id: `refs/remotes/${this._HEAD.upstream.remote}/${this._HEAD.upstream.name}`,
					label: `${this._HEAD.upstream.remote}/${this._HEAD.upstream.name}`,
				} : undefined
		};
	}

	async provideHistoryItems(historyItemGroupId: string, options: SourceControlHistoryOptions): Promise<SourceControlHistoryItem[]> {
		//TODO@lszomoru - support limit and cursor
		if (typeof options.limit === 'number') {
			throw new Error('Unsupported options.');
		}
		if (typeof options.limit?.id !== 'string') {
			throw new Error('Unsupported options.');
		}

		const optionsRef = options.limit.id;
		const historyItemGroupIdRef = await this.repository.revParse(historyItemGroupId) ?? '';

		const [commits, summary] = await Promise.all([
			this.repository.log({ range: `${optionsRef}..${historyItemGroupIdRef}`, shortStats: true, sortByAuthorDate: true }),
			this.getSummaryHistoryItem(optionsRef, historyItemGroupIdRef)
		]);

		await ensureEmojis();

		const historyItems = commits.length === 0 ? [] : [summary];
		historyItems.push(...commits.map(commit => {
			const newLineIndex = commit.message.indexOf('\n');
			const subject = newLineIndex !== -1 ? commit.message.substring(0, newLineIndex) : commit.message;

			return {
				id: commit.hash,
				parentIds: commit.parents,
				label: emojify(subject),
				description: commit.authorName,
				icon: new ThemeIcon('git-commit'),
				timestamp: commit.authorDate?.getTime(),
				statistics: commit.shortStat ?? { files: 0, insertions: 0, deletions: 0 },
			};
		}));

		return historyItems;
	}

	async provideHistoryItemChanges(historyItemId: string): Promise<SourceControlHistoryItemChange[]> {
		// The "All Changes" history item uses a special id
		// which is a commit range instead of a single commit id
		let [originalRef, modifiedRef] = historyItemId.includes('..')
			? historyItemId.split('..') : [undefined, historyItemId];

		if (!originalRef) {
			const commit = await this.repository.getCommit(modifiedRef);
			originalRef = commit.parents.length > 0 ? commit.parents[0] : `${modifiedRef}^`;
		}

		const historyItemChangesUri: Uri[] = [];
		const historyItemChanges: SourceControlHistoryItemChange[] = [];
		const changes = await this.repository.diffBetween(originalRef, modifiedRef);

		for (const change of changes) {
			const historyItemUri = change.uri.with({
				query: `ref=${historyItemId}`
			});

			// History item change
			historyItemChanges.push({
				uri: historyItemUri,
				originalUri: toGitUri(change.originalUri, originalRef),
				modifiedUri: toGitUri(change.originalUri, modifiedRef),
				renameUri: change.renameUri,
			});

			// History item change decoration
			const fileDecoration = this.getHistoryItemChangeFileDecoration(change.status);
			this.historyItemDecorations.set(historyItemUri.toString(), fileDecoration);

			historyItemChangesUri.push(historyItemUri);
		}

		this._onDidChangeDecorations.fire(historyItemChangesUri);
		return historyItemChanges;
	}

	async resolveHistoryItemGroupBase(historyItemGroupId: string): Promise<SourceControlHistoryItemGroup | undefined> {
		// TODO - support for all history item groups
		if (historyItemGroupId !== this.currentHistoryItemGroup?.id) {
			return undefined;
		}

		if (this.currentHistoryItemGroup?.upstream) {
			return this.currentHistoryItemGroup.upstream;
		}

		// Branch base
		try {
			const branchBase = await this.repository.getBranchBase(historyItemGroupId);

			if (branchBase?.name && branchBase?.type === RefType.Head) {
				return {
					id: `refs/heads/${branchBase.name}`,
					label: branchBase.name
				};
			}
			if (branchBase?.name && branchBase.remote && branchBase?.type === RefType.RemoteHead) {
				return {
					id: `refs/remotes/${branchBase.remote}/${branchBase.name}`,
					label: `${branchBase.remote}/${branchBase.name}`
				};
			}
		}
		catch (err) {
			this.logger.error(`Failed to get branch base for '${historyItemGroupId}': ${err.message}`);
		}

		return undefined;
	}

	async resolveHistoryItemGroupCommonAncestor(refId1: string, refId2: string): Promise<{ id: string; ahead: number; behind: number } | undefined> {
		const ancestor = await this.repository.getMergeBase(refId1, refId2);
		if (!ancestor) {
			return undefined;
		}

		const commitCount = await this.repository.getCommitCount(`${refId1}...${refId2}`);
		return { id: ancestor, ahead: commitCount.ahead, behind: commitCount.behind };
	}

	provideFileDecoration(uri: Uri): FileDecoration | undefined {
		return this.historyItemDecorations.get(uri.toString());
	}

	private getHistoryItemChangeFileDecoration(status: Status): FileDecoration {
		const letter = Resource.getStatusLetter(status);
		const tooltip = Resource.getStatusText(status);
		const color = Resource.getStatusColor(status);

		return new FileDecoration(letter, tooltip, color);
	}

	private async getSummaryHistoryItem(ref1: string, ref2: string): Promise<SourceControlHistoryItem> {
		const statistics = await this.repository.diffBetweenShortStat(ref1, ref2);
		return { id: `${ref1}..${ref2}`, parentIds: [], icon: new ThemeIcon('files'), label: l10n.t('All Changes'), statistics };
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
