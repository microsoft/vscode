/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, Event, EventEmitter, FileDecoration, FileDecorationProvider, SourceControlHistoryItem, SourceControlHistoryItemChange, SourceControlHistoryItemGroup, SourceControlHistoryOptions, SourceControlHistoryProvider, ThemeIcon, Uri, window, LogOutputChannel } from 'vscode';
import { Repository, Resource } from './repository';
import { IDisposable, filterEvent } from './util';
import { toGitUri } from './uri';
import { Branch, RefType, UpstreamRef } from './api/git';
import { emojify, ensureEmojis } from './emoji';
import { Operation } from './operation';

function isBranchRefEqual(brach1: Branch | undefined, branch2: Branch | undefined): boolean {
	return brach1?.name === branch2?.name && brach1?.commit === branch2?.commit;
}

function isUpstreamRefEqual(upstream1: UpstreamRef | undefined, upstream2: UpstreamRef | undefined): boolean {
	return upstream1?.name === upstream2?.name && upstream1?.remote === upstream2?.remote && upstream1?.commit === upstream2?.commit;
}

export class GitHistoryProvider implements SourceControlHistoryProvider, FileDecorationProvider, IDisposable {

	private readonly _onDidChangeCurrentHistoryItemGroup = new EventEmitter<void>();
	readonly onDidChangeCurrentHistoryItemGroup: Event<void> = this._onDidChangeCurrentHistoryItemGroup.event;

	private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
	readonly onDidChangeFileDecorations: Event<Uri[]> = this._onDidChangeDecorations.event;

	private _HEAD: Branch | undefined;
	private _HEADBase: UpstreamRef | undefined;
	private _currentHistoryItemGroup: SourceControlHistoryItemGroup | undefined;

	get currentHistoryItemGroup(): SourceControlHistoryItemGroup | undefined { return this._currentHistoryItemGroup; }
	set currentHistoryItemGroup(value: SourceControlHistoryItemGroup | undefined) {
		if (this._currentHistoryItemGroup === undefined && value === undefined) {
			return;
		}

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
		// Check if HEAD does not support incoming/outgoing (detached commit, tag)
		if (!this.repository.HEAD?.name || !this.repository.HEAD?.commit || this.repository.HEAD.type === RefType.Tag) {
			this._HEAD = this._HEADBase = undefined;
			this.currentHistoryItemGroup = undefined;
			return;
		}

		// Resolve HEAD base
		const HEADBase = await this.resolveHEADBase(this.repository.HEAD);

		// Check if HEAD or HEADBase has changed
		if (isBranchRefEqual(this._HEAD, this.repository.HEAD) && isUpstreamRefEqual(this._HEADBase, HEADBase)) {
			return;
		}

		this._HEAD = this.repository.HEAD;
		this._HEADBase = HEADBase;

		this.currentHistoryItemGroup = {
			id: `refs/heads/${this._HEAD.name ?? ''}`,
			label: this._HEAD.name ?? '',
			base: this._HEADBase ?
				{
					id: `refs/remotes/${this._HEADBase.remote}/${this._HEADBase.name}`,
					label: `${this._HEADBase.remote}/${this._HEADBase.name}`,
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

		const refParentId = options.limit.id;
		const refId = await this.repository.revParse(historyItemGroupId) ?? '';

		const historyItems: SourceControlHistoryItem[] = [];
		const commits = await this.repository.log({ range: `${refParentId}..${refId}`, shortStats: true, sortByAuthorDate: true });

		await ensureEmojis();

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

	async provideHistoryItemSummary(historyItemId: string, historyItemParentId: string | undefined): Promise<SourceControlHistoryItem> {
		if (!historyItemParentId) {
			const commit = await this.repository.getCommit(historyItemId);
			historyItemParentId = commit.parents.length > 0 ? commit.parents[0] : `${historyItemId}^`;
		}

		const allChanges = await this.repository.diffBetweenShortStat(historyItemParentId, historyItemId);
		return { id: historyItemId, parentIds: [historyItemParentId], label: '', statistics: allChanges };
	}

	async provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined): Promise<SourceControlHistoryItemChange[]> {
		if (!historyItemParentId) {
			const commit = await this.repository.getCommit(historyItemId);
			historyItemParentId = commit.parents.length > 0 ? commit.parents[0] : `${historyItemId}^`;
		}

		const historyItemChangesUri: Uri[] = [];
		const historyItemChanges: SourceControlHistoryItemChange[] = [];
		const changes = await this.repository.diffBetween(historyItemParentId, historyItemId);

		for (const change of changes) {
			const historyItemUri = change.uri.with({
				query: `ref=${historyItemId}`
			});

			// History item change
			historyItemChanges.push({
				uri: historyItemUri,
				originalUri: toGitUri(change.originalUri, historyItemParentId),
				modifiedUri: toGitUri(change.originalUri, historyItemId),
				renameUri: change.renameUri,
			});

			// History item change decoration
			const letter = Resource.getStatusLetter(change.status);
			const tooltip = Resource.getStatusText(change.status);
			const color = Resource.getStatusColor(change.status);
			const fileDecoration = new FileDecoration(letter, tooltip, color);
			this.historyItemDecorations.set(historyItemUri.toString(), fileDecoration);

			historyItemChangesUri.push(historyItemUri);
		}

		this._onDidChangeDecorations.fire(historyItemChangesUri);
		return historyItemChanges;
	}

	async resolveHistoryItemGroupCommonAncestor(refId1: string, refId2: string): Promise<{ id: string; ahead: number; behind: number } | undefined> {
		const ancestor = await this.repository.getMergeBase(refId1, refId2);
		if (!ancestor) {
			return undefined;
		}

		try {
			const commitCount = await this.repository.getCommitCount(`${refId1}...${refId2}`);
			return { id: ancestor, ahead: commitCount.ahead, behind: commitCount.behind };
		} catch (err) {
			this.logger.error(`Failed to get ahead/behind for '${refId1}...${refId2}': ${err.message}`);
		}

		return undefined;
	}

	provideFileDecoration(uri: Uri): FileDecoration | undefined {
		return this.historyItemDecorations.get(uri.toString());
	}

	private async resolveHEADBase(HEAD: Branch): Promise<UpstreamRef | undefined> {
		// Upstream
		if (HEAD.upstream) {
			return HEAD.upstream;
		}

		try {
			const remoteBranch = await this.repository.getBranchBase(HEAD.name ?? '');
			if (!remoteBranch?.remote || !remoteBranch?.name || !remoteBranch?.commit || remoteBranch?.type !== RefType.RemoteHead) {
				return undefined;
			}

			return {
				name: remoteBranch.name,
				remote: remoteBranch.remote,
				commit: remoteBranch.commit
			};
		}
		catch (err) {
			this.logger.error(`Failed to get branch base for '${HEAD.name}': ${err.message}`);
		}

		return undefined;
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
