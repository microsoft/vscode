/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, Event, EventEmitter, FileDecoration, FileDecorationProvider, SourceControlHistoryItem, SourceControlHistoryItemChange, SourceControlHistoryItemGroup, SourceControlHistoryOptions, SourceControlHistoryProvider, ThemeIcon, Uri, window, LogOutputChannel, SourceControlHistoryChangeEvent, SourceControlHistoryItemRef, l10n } from 'vscode';
import { Repository, Resource } from './repository';
import { IDisposable, dispose } from './util';
import { toGitUri } from './uri';
import { Branch, LogOptions, RefType } from './api/git';
import { emojify, ensureEmojis } from './emoji';
import { Commit } from './git';

export class GitHistoryProvider implements SourceControlHistoryProvider, FileDecorationProvider, IDisposable {

	private readonly _onDidChangeCurrentHistoryItemGroup = new EventEmitter<void>();
	readonly onDidChangeCurrentHistoryItemGroup: Event<void> = this._onDidChangeCurrentHistoryItemGroup.event;

	private readonly _onDidChangeHistory = new EventEmitter<SourceControlHistoryChangeEvent>();
	readonly onDidChangeHistory: Event<SourceControlHistoryChangeEvent> = this._onDidChangeHistory.event;

	private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
	readonly onDidChangeFileDecorations: Event<Uri[]> = this._onDidChangeDecorations.event;

	private _currentHistoryItemGroup: SourceControlHistoryItemGroup | undefined;
	get currentHistoryItemGroup(): SourceControlHistoryItemGroup | undefined { return this._currentHistoryItemGroup; }
	set currentHistoryItemGroup(value: SourceControlHistoryItemGroup | undefined) {
		this._currentHistoryItemGroup = value;
		this._onDidChangeCurrentHistoryItemGroup.fire();
	}

	private historyItemDecorations = new Map<string, FileDecoration>();

	private disposables: Disposable[] = [];

	constructor(protected readonly repository: Repository, private readonly logger: LogOutputChannel) {
		this.disposables.push(repository.onDidRunGitStatus(() => this.onDidRunGitStatus(), this));
		this.disposables.push(window.registerFileDecorationProvider(this));
	}

	private async onDidRunGitStatus(): Promise<void> {
		if (!this.repository.HEAD) {
			this.logger.trace('[GitHistoryProvider][onDidRunGitStatus] repository.HEAD is undefined');
			this.currentHistoryItemGroup = undefined;
			return;
		}

		// Get the merge base of the current history item group
		const mergeBase = await this.resolveHEADMergeBase();

		// Handle tag, and detached commit
		const currentHistoryItemGroupId =
			this.repository.HEAD.name === undefined ?
				this.repository.HEAD.commit :
				this.repository.HEAD.type === RefType.Tag ?
					`refs/tags/${this.repository.HEAD.name}` :
					`refs/heads/${this.repository.HEAD.name}`;

		// Detached commit
		const currentHistoryItemGroupName =
			this.repository.HEAD.name ?? this.repository.HEAD.commit;

		this.currentHistoryItemGroup = {
			id: currentHistoryItemGroupId ?? '',
			name: currentHistoryItemGroupName ?? '',
			revision: this.repository.HEAD.commit,
			remote: this.repository.HEAD.upstream ? {
				id: `refs/remotes/${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}`,
				name: `${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}`,
				revision: this.repository.HEAD.upstream.commit
			} : undefined,
			base: mergeBase &&
				(mergeBase.remote !== this.repository.HEAD.upstream?.remote ||
					mergeBase.name !== this.repository.HEAD.upstream?.name) ? {
				id: `refs/remotes/${mergeBase.remote}/${mergeBase.name}`,
				name: `${mergeBase.remote}/${mergeBase.name}`,
				revision: mergeBase.commit
			} : undefined
		};

		this.logger.trace(`[GitHistoryProvider][onDidRunGitStatus] currentHistoryItemGroup: ${JSON.stringify(this.currentHistoryItemGroup)}`);
	}

	async provideHistoryItemRefs(): Promise<SourceControlHistoryItemRef[]> {
		const refs = await this.repository.getRefs();

		const branches: SourceControlHistoryItemRef[] = [];
		const remoteBranches: SourceControlHistoryItemRef[] = [];
		const tags: SourceControlHistoryItemRef[] = [];

		for (const ref of refs) {
			switch (ref.type) {
				case RefType.RemoteHead:
					remoteBranches.push({
						id: `refs/remotes/${ref.remote}/${ref.name}`,
						name: ref.name ?? '',
						description: ref.commit ? l10n.t('Remote branch at {0}', ref.commit.substring(0, 8)) : undefined,
						revision: ref.commit,
						icon: new ThemeIcon('cloud'),
						category: l10n.t('remote branches')
					});
					break;
				case RefType.Tag:
					tags.push({
						id: `refs/tags/${ref.name}`,
						name: ref.name ?? '',
						description: ref.commit ? l10n.t('Tag at {0}', ref.commit.substring(0, 8)) : undefined,
						revision: ref.commit,
						icon: new ThemeIcon('tag'),
						category: l10n.t('tags')
					});
					break;
				default:
					branches.push({
						id: `refs/heads/${ref.name}`,
						name: ref.name ?? '',
						description: ref.commit ? ref.commit.substring(0, 8) : undefined,
						revision: ref.commit,
						icon: new ThemeIcon('git-branch'),
						category: l10n.t('branches')
					});
					break;
			}
		}

		return [...branches, ...remoteBranches, ...tags];
	}

	async provideHistoryItems(options: SourceControlHistoryOptions): Promise<SourceControlHistoryItem[]> {
		if (!this.currentHistoryItemGroup || !options.historyItemRefs) {
			return [];
		}

		// Deduplicate refNames
		const refNames = Array.from(new Set<string>(options.historyItemRefs));

		let logOptions: LogOptions = { refNames, shortStats: true };

		try {
			if (options.limit === undefined || typeof options.limit === 'number') {
				logOptions = { ...logOptions, maxEntries: options.limit ?? 50 };
			} else if (typeof options.limit.id === 'string') {
				// Get the common ancestor commit, and commits
				const commit = await this.repository.getCommit(options.limit.id);
				const commitParentId = commit.parents.length > 0 ? commit.parents[0] : await this.repository.getEmptyTree();

				logOptions = { ...logOptions, range: `${commitParentId}..` };
			}

			if (typeof options.skip === 'number') {
				logOptions = { ...logOptions, skip: options.skip };
			}

			const commits = await this.repository.log({ ...logOptions, silent: true });

			await ensureEmojis();

			return commits.map(commit => {
				const references = this.resolveHistoryItemRefs(commit);

				return {
					id: commit.hash,
					parentIds: commit.parents,
					message: emojify(commit.message),
					author: commit.authorName,
					icon: new ThemeIcon('git-commit'),
					displayId: commit.hash.substring(0, 8),
					timestamp: commit.authorDate?.getTime(),
					statistics: commit.shortStat ?? { files: 0, insertions: 0, deletions: 0 },
					references: references.length !== 0 ? references : undefined
				};
			});
		} catch (err) {
			this.logger.error(`[GitHistoryProvider][provideHistoryItems] Failed to get history items with options '${JSON.stringify(options)}': ${err}`);
			return [];
		}
	}

	async provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined): Promise<SourceControlHistoryItemChange[]> {
		historyItemParentId = historyItemParentId ?? await this.repository.getEmptyTree();

		const historyItemChangesUri: Uri[] = [];
		const historyItemChanges: SourceControlHistoryItemChange[] = [];
		const changes = await this.repository.diffTrees(historyItemParentId, historyItemId);

		for (const change of changes) {
			const historyItemUri = change.uri.with({
				query: `ref=${historyItemId}`
			});

			// History item change
			historyItemChanges.push({
				uri: historyItemUri,
				originalUri: toGitUri(change.originalUri, historyItemParentId),
				modifiedUri: toGitUri(change.uri, historyItemId),
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

	async resolveHistoryItemRefsCommonAncestor(historyItemRefs: string[]): Promise<string | undefined> {
		try {
			if (historyItemRefs.length === 0) {
				// TODO@lszomoru - log
				return undefined;
			} else if (historyItemRefs.length === 1 && historyItemRefs[0] === this.currentHistoryItemGroup?.id) {
				// Remote
				if (this.currentHistoryItemGroup.remote) {
					const ancestor = await this.repository.getMergeBase(historyItemRefs[0], this.currentHistoryItemGroup.remote.id);
					return ancestor;
				}

				// Base
				if (this.currentHistoryItemGroup.base) {
					const ancestor = await this.repository.getMergeBase(historyItemRefs[0], this.currentHistoryItemGroup.base.id);
					return ancestor;
				}

				// First commit
				const commits = await this.repository.log({ maxParents: 0, refNames: ['HEAD'] });
				if (commits.length > 0) {
					return commits[0].hash;
				}
			} else if (historyItemRefs.length > 1) {
				const ancestor = await this.repository.getMergeBase(historyItemRefs[0], historyItemRefs[1], ...historyItemRefs.slice(2));
				return ancestor;
			}
		}
		catch (err) {
			this.logger.error(`[GitHistoryProvider][resolveHistoryItemRefsCommonAncestor] Failed to resolve common ancestor for ${historyItemRefs.join(',')}: ${err}`);
		}

		return undefined;
	}

	provideFileDecoration(uri: Uri): FileDecoration | undefined {
		return this.historyItemDecorations.get(uri.toString());
	}

	private resolveHistoryItemRefs(commit: Commit): SourceControlHistoryItemRef[] {
		const references: SourceControlHistoryItemRef[] = [];

		for (const ref of commit.refNames) {
			switch (true) {
				case ref.startsWith('HEAD -> refs/heads/'):
					references.push({
						id: ref.substring('HEAD -> '.length),
						name: ref.substring('HEAD -> refs/heads/'.length),
						revision: commit.hash,
						icon: new ThemeIcon('target')
					});
					break;
				case ref.startsWith('tag: refs/tags/'):
					references.push({
						id: ref.substring('tag: '.length),
						name: ref.substring('tag: refs/tags/'.length),
						revision: commit.hash,
						icon: new ThemeIcon('tag')
					});
					break;
				case ref.startsWith('refs/heads/'):
					references.push({
						id: ref,
						name: ref.substring('refs/heads/'.length),
						revision: commit.hash,
						icon: new ThemeIcon('git-branch')
					});
					break;
				case ref.startsWith('refs/remotes/'):
					references.push({
						id: ref,
						name: ref.substring('refs/remotes/'.length),
						revision: commit.hash,
						icon: new ThemeIcon('cloud')
					});
					break;
			}
		}

		return references;
	}

	private async resolveHEADMergeBase(): Promise<Branch | undefined> {
		if (this.repository.HEAD?.type !== RefType.Head || !this.repository.HEAD?.name) {
			return undefined;
		}

		const mergeBase = await this.repository.getBranchBase(this.repository.HEAD.name);
		return mergeBase;
	}

	dispose(): void {
		dispose(this.disposables);
	}
}
