/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, Event, EventEmitter, SourceControlHistoryChangeEvent, SourceControlHistoryItem, SourceControlHistoryItemChange, SourceControlHistoryItemGroup, SourceControlHistoryOptions, SourceControlHistoryProvider } from 'vscode';
import { Repository } from './repository';
import { IDisposable } from './util';

export class GitHistoryProvider implements SourceControlHistoryProvider, IDisposable {

	private readonly _onDidChange = new EventEmitter<SourceControlHistoryChangeEvent>();
	readonly onDidChange: Event<SourceControlHistoryChangeEvent> = this._onDidChange.event;

	private disposables: Disposable[] = [];

	constructor(protected readonly repository: Repository) {
		this.disposables.push(repository.onDidRunGitStatus(this.onDidRunGitStatus, this));
	}

	private onDidRunGitStatus(): void {
		this._onDidChange.fire({ added: [], deleted: [], modified: [] });
	}

	provideHistoryItems(historyItemGroupId: string, options: SourceControlHistoryOptions): Promise<SourceControlHistoryItem[]> {
		throw new Error('Method not implemented.');
	}
	resolveHistoryItem(historyItemId: string): Promise<SourceControlHistoryItemChange[]> {
		throw new Error('Method not implemented.');
	}
	resolveHistoryItemGroup(historyItemGroupId: string): Promise<SourceControlHistoryItemGroup> {
		throw new Error('Method not implemented.');
	}
	resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string): Promise<SourceControlHistoryItem> {
		throw new Error('Method not implemented.');
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

// abstract class GitCommitHistoryProvider implements SourceControlHistoryProvider {

// 	protected readonly _onDidChange = new EventEmitter<SourceControlHistoryChangeEvent>();
// 	readonly onDidChange: Event<SourceControlHistoryChangeEvent> = this._onDidChange.event;

// 	private disposables: Disposable[] = [];

// 	constructor(protected readonly repository: Repository) {
// 		this.disposables.push(repository.onDidRunGitStatus(this.onDidRunGitStatus, this));
// 	}

// 	async provideHistory(ref1: string, ref2: string): Promise<SourceControlHistoryItem[]> {
// 		const commits = await this.repository.log({ range: `${ref1}..${ref2}`, sortByAuthorDate: true });

// 		if (commits.length === 0) {
// 			return [];
// 		}

// 		const diff = await this.repository.diffBetween(ref1, ref2);
// 		const diffShortStat = await this.repository.diffBetweenShortStat(ref1, ref2);

// 		const historyItems: SourceControlHistoryItem[] = [{
// 			id: `${ref1}..${ref2}`,
// 			icon: new ThemeIcon('files'),
// 			label: 'Changes',
// 			description: diffShortStat,
// 			changes: diff.map(diff => {
// 				const basename = path.basename(diff.uri.fsPath);
// 				const shortRef1 = /^[0-9a-f]{40}$/i.test(ref1) ? ref1.substring(0, 8) : ref1;
// 				const shortRef2 = /^[0-9a-f]{40}$/i.test(ref2) ? ref2.substring(0, 8) : ref2;

// 				return {
// 					uri: diff.uri.with({ query: `ref=${ref1}..${ref2}` }),
// 					originalUri: diff.originalUri.with({ query: `ref=${ref1}..${ref2}` }),
// 					renameUri: diff.renameUri?.with({ query: `ref=${ref1}..${ref2}` }),
// 					command: {
// 						command: 'vscode.diff',
// 						title: l10n.t('Open'),
// 						arguments: [
// 							toGitUri(diff.uri, ref1),
// 							toGitUri(diff.uri, ref2),
// 							`${basename} (${shortRef1}) ↔ ${basename} (${shortRef2})`]
// 					}
// 				};
// 			})
// 		}];

// 		historyItems.push(...commits.map(commit => {
// 			return {
// 				id: commit.hash,
// 				icon: new ThemeIcon('account'),
// 				label: commit.message,
// 				description: commit.authorName,
// 				timestamp: commit.authorDate?.getTime(),
// 				changes: []
// 			};
// 		}));

// 		return historyItems;
// 	}

// 	resolveHistoryItem(): Promise<SourceControlHistoryItemChange[] | undefined> {
// 		throw new Error('Method not implemented.');
// 	}

// 	protected abstract onDidRunGitStatus(): void;
// }

// export class GitIncomingCommitsHistoryProvider extends GitCommitHistoryProvider {

// 	override onDidRunGitStatus(): void {
// 		if (!this.repository.HEAD?.commit) {
// 			return;
// 		}

// 		if (this.repository.HEAD.upstream?.remote && this.repository.HEAD.upstream?.name && this.repository.HEAD?.behind) {
// 			this._onDidChange.fire({ ref1: this.repository.HEAD?.commit, ref2: `${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}`, reset: true });
// 		}
// 	}
// }

// export class GitOutgoingCommitsHistoryProvider extends GitCommitHistoryProvider {

// 	override onDidRunGitStatus(): void {
// 		if (!this.repository.HEAD?.commit) {
// 			return;
// 		}

// 		if (!this.repository.HEAD.upstream) {
// 			this._onDidChange.fire({ ref1: 'origin', ref2: this.repository.HEAD?.commit, reset: true });
// 			return;
// 		}

// 		if (this.repository.HEAD.upstream?.remote && this.repository.HEAD.upstream?.name && this.repository.HEAD?.ahead) {
// 			this._onDidChange.fire({ ref1: `${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}`, ref2: this.repository.HEAD?.commit, reset: true });
// 			return;
// 		}
// 	}
// }
