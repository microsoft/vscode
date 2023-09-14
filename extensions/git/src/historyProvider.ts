/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, Event, EventEmitter, SourceControlActionButton, SourceControlHistoryChangeEvent, SourceControlHistoryItem, SourceControlHistoryItemChange, SourceControlHistoryItemGroup, SourceControlHistoryOptions, SourceControlHistoryProvider, ThemeIcon, l10n } from 'vscode';
import { Repository } from './repository';
import { IDisposable } from './util';
import { toGitUri } from './uri';

export class GitHistoryProvider implements SourceControlHistoryProvider, IDisposable {

	private readonly _onDidChange = new EventEmitter<SourceControlHistoryChangeEvent>();
	readonly onDidChange: Event<SourceControlHistoryChangeEvent> = this._onDidChange.event;

	private readonly _onDidChangeActionButton = new EventEmitter<void>();
	readonly onDidChangeActionButton: Event<void> = this._onDidChangeActionButton.event;

	private _actionButton: SourceControlActionButton | undefined;
	get actionButton(): SourceControlActionButton | undefined { return this._actionButton; }
	set actionButton(button: SourceControlActionButton | undefined) {
		this._actionButton = button;
		this._onDidChangeActionButton.fire();
	}

	private historyItemGroups = new Map<string, SourceControlHistoryItemGroup>();

	private disposables: Disposable[] = [];

	constructor(protected readonly repository: Repository) {
		this.disposables.push(repository.onDidRunGitStatus(this.onDidRunGitStatus, this));
	}

	private async onDidRunGitStatus(): Promise<void> {
		if (!this.repository.HEAD?.name || !this.repository.HEAD?.commit) { return; }

		const added: SourceControlHistoryItemGroup[] = [];
		const removed: SourceControlHistoryItemGroup[] = [];
		const modified: SourceControlHistoryItemGroup[] = [];

		const headName = this.repository.HEAD.name;
		const hasUpstream = !!this.repository.HEAD.upstream;
		const defaultBranch = !hasUpstream ? await this.repository.getDefaultBranch() : undefined;
		const upstreamName = hasUpstream ? `${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}` : undefined;
		const commonAncestor = hasUpstream ? await this.repository.getMergeBase(headName, upstreamName!) : defaultBranch!.commit;

		// Incoming
		if (upstreamName) {
			// Resolve commit
			const remoteCommit = await this.repository.revParse(upstreamName);
			const incomingHistoryItemGroup = this.historyItemGroups.get(upstreamName);

			if (remoteCommit) {
				if (!incomingHistoryItemGroup) {
					this.historyItemGroups.set(upstreamName, {
						id: upstreamName,
						label: l10n.t('{0} Incoming Commits', '$(cloud-download)'),
						description: upstreamName,
						range: { start: commonAncestor!, end: remoteCommit },
						count: this.repository.HEAD.behind ?? 0,
						priority: 1
					});
					added.push(this.historyItemGroups.get(upstreamName)!);
				} else {
					if (commonAncestor !== incomingHistoryItemGroup.range.start ||
						remoteCommit !== incomingHistoryItemGroup.range.end) {
						this.historyItemGroups.set(upstreamName, {
							...incomingHistoryItemGroup,
							range: { start: commonAncestor!, end: remoteCommit },
							count: this.repository.HEAD.behind ?? 0
						});
						modified.push(this.historyItemGroups.get(upstreamName)!);
					}
				}
			}
		}

		// Outgoing
		const outgoingHistoryItemGroup = this.historyItemGroups.get(headName);
		const ahead = hasUpstream ? this.repository.HEAD.ahead ?? 0 : (await this.repository.getCommitCount(`${headName}...${defaultBranch?.name}`)).ahead;

		if (!outgoingHistoryItemGroup) {
			this.historyItemGroups.set(headName, {
				id: headName,
				label: l10n.t('{0} Outgoing Commits', '$(cloud-upload)'),
				description: headName,
				range: { start: commonAncestor!, end: this.repository.HEAD.commit },
				count: ahead,
				priority: 2
			});
			added.push(this.historyItemGroups.get(headName)!);
		} else {
			if (commonAncestor !== outgoingHistoryItemGroup.range.start ||
				this.repository.HEAD.commit !== outgoingHistoryItemGroup.range.end) {
				this.historyItemGroups.set(headName, {
					...outgoingHistoryItemGroup,
					range: { start: commonAncestor!, end: this.repository.HEAD.commit },
					count: ahead
				});
				modified.push(this.historyItemGroups.get(headName)!);
			}
		}

		// Removed
		for (const name of this.historyItemGroups.keys()) {
			if (name !== headName && name !== upstreamName) {
				removed.push(this.historyItemGroups.get(name)!);
				this.historyItemGroups.delete(name);
			}
		}

		if (added.length !== 0 || removed.length !== 0 || modified.length !== 0) {
			this._onDidChange.fire({ added, removed, modified });
		}
	}

	async provideHistoryItems(historyItemGroupId: string, options: SourceControlHistoryOptions): Promise<SourceControlHistoryItem[]> {
		//TODO@lszomoru - support limit and cursor
		if (typeof options.limit === 'number') {
			throw new Error('Unsupported options.');
		}
		if (typeof options.limit?.id !== 'string') {
			throw new Error('Unsupported options.');
		}

		// Resolve the history item group id to a commit
		const historyItemGroupCommit = await this.repository.revParse(historyItemGroupId);

		const optionsRef = options.limit.id;
		const [commits, summary] = await Promise.all([
			this.repository.log({ range: `${optionsRef}..${historyItemGroupId}`, sortByAuthorDate: true }),
			this.getSummaryHistoryItem(optionsRef, historyItemGroupCommit!)
		]);

		const historyItems = commits.length === 0 ? [] : [summary];
		historyItems.push(...commits.map(commit => {
			return {
				id: commit.hash,
				parentIds: commit.parents,
				label: commit.message,
				description: commit.authorName,
				icon: new ThemeIcon('account'),
				timestamp: commit.authorDate?.getTime()
			};
		}));

		return historyItems;
	}

	async provideHistoryItemChanges(historyItemId: string): Promise<SourceControlHistoryItemChange[]> {
		const [ref1, ref2] = historyItemId.includes('..')
			? historyItemId.split('..')
			: [`${historyItemId}^`, historyItemId];

		const changes = await this.repository.diffBetween(ref1, ref2);

		return changes.map(change => ({
			uri: change.uri.with({ query: `ref=${historyItemId}` }),
			originalUri: toGitUri(change.originalUri, ref1),
			modifiedUri: toGitUri(change.originalUri, ref2),
			renameUri: change.renameUri,
		}));
	}

	// resolveHistoryItemGroup(historyItemGroupId: string): Promise<SourceControlHistoryItemGroup> {
	// 	throw new Error('Method not implemented.');
	// }

	async resolveHistoryItemGroupCommonAncestor(refId1: string, refId2: string): Promise<SourceControlHistoryItem> {
		const mergeBase = await this.repository.getMergeBase(refId1, refId2);
		const commit = await this.repository.getCommit(mergeBase);

		return { id: mergeBase, parentIds: commit.parents, label: commit.message, description: commit.authorName, icon: new ThemeIcon('account'), timestamp: commit.authorDate?.getTime() };
	}

	private async getSummaryHistoryItem(ref1: string, ref2: string): Promise<SourceControlHistoryItem> {
		const diffShortStat = await this.repository.diffBetweenShortStat(ref1, ref2);
		return { id: `${ref1}..${ref2}`, parentIds: [], icon: new ThemeIcon('files'), label: 'Changes', description: diffShortStat };
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
