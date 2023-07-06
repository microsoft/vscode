/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, Event, EventEmitter, SourceControlHistoryChangeEvent, SourceControlHistoryItem, SourceControlHistoryItemChange, SourceControlHistoryOptions, SourceControlHistoryProvider, ThemeIcon } from 'vscode';
import { Repository } from './repository';
import { IDisposable } from './util';
import { toGitUri } from './uri';

export class GitHistoryProvider implements SourceControlHistoryProvider, IDisposable {

	private readonly _onDidChange = new EventEmitter<SourceControlHistoryChangeEvent>();
	readonly onDidChange: Event<SourceControlHistoryChangeEvent> = this._onDidChange.event;

	private disposables: Disposable[] = [];

	constructor(protected readonly repository: Repository) {
		this.disposables.push(repository.onDidRunGitStatus(this.onDidRunGitStatus, this));
	}

	private onDidRunGitStatus(): void {
		//TODO@lszomoru - handle added, and deleted history item groups
		const historyItemGroup = this.repository.sourceControl.historyItemGroup;
		this._onDidChange.fire({ added: [], deleted: [], modified: historyItemGroup ? [historyItemGroup] : [] });
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

		const historyItems = [summary];
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
