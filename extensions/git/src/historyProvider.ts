/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { CancellationToken, Disposable, Event, EventEmitter, FileDecoration, FileDecorationProvider, SourceControlHistoryItem, SourceControlHistoryItemChange, SourceControlHistoryOptions, SourceControlHistoryProvider, ThemeIcon, Uri, window, LogOutputChannel, SourceControlHistoryItemRef, l10n, SourceControlHistoryItemRefsChangeEvent, workspace, ConfigurationChangeEvent, Command, commands } from 'vscode';
import { Repository, Resource } from './repository';
import { IDisposable, deltaHistoryItemRefs, dispose, filterEvent, subject, truncate } from './util';
import { toMultiFileDiffEditorUris } from './uri';
import { AvatarQuery, AvatarQueryCommit, Branch, LogOptions, Ref, RefType } from './api/git';
import { emojify, ensureEmojis } from './emoji';
import { Commit } from './git';
import { OperationKind, OperationResult } from './operation';
import { ISourceControlHistoryItemDetailsProviderRegistry, provideSourceControlHistoryItemAvatar, provideSourceControlHistoryItemHoverCommands, provideSourceControlHistoryItemMessageLinks } from './historyItemDetailsProvider';
import { throttle } from './decorators';
import { getHistoryItemHover, getHoverCommitHashCommands, processHoverRemoteCommands } from './hover';

function compareSourceControlHistoryItemRef(ref1: SourceControlHistoryItemRef, ref2: SourceControlHistoryItemRef): number {
	const getOrder = (ref: SourceControlHistoryItemRef): number => {
		if (ref.id.startsWith('refs/heads/')) {
			return 1;
		} else if (ref.id.startsWith('refs/remotes/')) {
			return 2;
		} else if (ref.id.startsWith('refs/tags/')) {
			return 3;
		}

		return 99;
	};

	const ref1Order = getOrder(ref1);
	const ref2Order = getOrder(ref2);

	if (ref1Order !== ref2Order) {
		return ref1Order - ref2Order;
	}

	return ref1.name.localeCompare(ref2.name);
}

export class GitHistoryProvider implements SourceControlHistoryProvider, FileDecorationProvider, IDisposable {
	private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
	readonly onDidChangeFileDecorations: Event<Uri[]> = this._onDidChangeDecorations.event;

	private _currentHistoryItemRef: SourceControlHistoryItemRef | undefined;
	get currentHistoryItemRef(): SourceControlHistoryItemRef | undefined { return this._currentHistoryItemRef; }

	private _currentHistoryItemRemoteRef: SourceControlHistoryItemRef | undefined;
	get currentHistoryItemRemoteRef(): SourceControlHistoryItemRef | undefined { return this._currentHistoryItemRemoteRef; }

	private _currentHistoryItemBaseRef: SourceControlHistoryItemRef | undefined;
	get currentHistoryItemBaseRef(): SourceControlHistoryItemRef | undefined { return this._currentHistoryItemBaseRef; }

	private readonly _onDidChangeCurrentHistoryItemRefs = new EventEmitter<void>();
	readonly onDidChangeCurrentHistoryItemRefs: Event<void> = this._onDidChangeCurrentHistoryItemRefs.event;

	private readonly _onDidChangeHistoryItemRefs = new EventEmitter<SourceControlHistoryItemRefsChangeEvent>();
	readonly onDidChangeHistoryItemRefs: Event<SourceControlHistoryItemRefsChangeEvent> = this._onDidChangeHistoryItemRefs.event;

	private _HEAD: Branch | undefined;
	private _historyItemRefs: SourceControlHistoryItemRef[] = [];

	private commitShortHashLength = 7;
	private historyItemDecorations = new Map<string, FileDecoration>();

	private disposables: Disposable[] = [];

	constructor(
		private historyItemDetailProviderRegistry: ISourceControlHistoryItemDetailsProviderRegistry,
		private readonly repository: Repository,
		private readonly logger: LogOutputChannel
	) {
		this.disposables.push(workspace.onDidChangeConfiguration(this.onDidChangeConfiguration));
		this.onDidChangeConfiguration();

		const onDidRunWriteOperation = filterEvent(repository.onDidRunOperation, e => !e.operation.readOnly);
		this.disposables.push(onDidRunWriteOperation(this.onDidRunWriteOperation, this));

		this.disposables.push(window.registerFileDecorationProvider(this));
	}

	private onDidChangeConfiguration(e?: ConfigurationChangeEvent): void {
		if (e && !e.affectsConfiguration('git.commitShortHashLength')) {
			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		this.commitShortHashLength = config.get<number>('commitShortHashLength', 7);
	}

	@throttle
	private async onDidRunWriteOperation(result: OperationResult): Promise<void> {
		if (!this.repository.HEAD) {
			this.logger.trace('[GitHistoryProvider][onDidRunWriteOperation] repository.HEAD is undefined');
			this._currentHistoryItemRef = this._currentHistoryItemRemoteRef = this._currentHistoryItemBaseRef = undefined;
			this._onDidChangeCurrentHistoryItemRefs.fire();

			return;
		}

		// Refs (alphabetically)
		const historyItemRefs = this.repository.refs
			.map(ref => this.toSourceControlHistoryItemRef(ref))
			.sort((a, b) => a.id.localeCompare(b.id));

		const delta = deltaHistoryItemRefs(this._historyItemRefs, historyItemRefs);
		this._historyItemRefs = historyItemRefs;

		let historyItemRefId = '';
		let historyItemRefName = '';

		switch (this.repository.HEAD.type) {
			case RefType.Head: {
				if (this.repository.HEAD.name !== undefined) {
					// Branch
					historyItemRefId = `refs/heads/${this.repository.HEAD.name}`;
					historyItemRefName = this.repository.HEAD.name;

					// Remote
					if (this.repository.HEAD.upstream) {
						if (this.repository.HEAD.upstream.remote === '.') {
							// Local branch
							this._currentHistoryItemRemoteRef = {
								id: `refs/heads/${this.repository.HEAD.upstream.name}`,
								name: this.repository.HEAD.upstream.name,
								revision: this.repository.HEAD.upstream.commit,
								icon: new ThemeIcon('git-branch')
							};
						} else {
							// Remote branch
							this._currentHistoryItemRemoteRef = {
								id: `refs/remotes/${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}`,
								name: `${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}`,
								revision: this.repository.HEAD.upstream.commit,
								icon: new ThemeIcon('cloud')
							};
						}
					} else {
						this._currentHistoryItemRemoteRef = undefined;
					}

					// Base
					if (this._HEAD?.name !== this.repository.HEAD.name) {
						// Compute base if the branch has changed
						const mergeBase = await this.resolveHEADMergeBase();

						this._currentHistoryItemBaseRef = mergeBase && mergeBase.name && mergeBase.remote &&
							(mergeBase.remote !== this.repository.HEAD.upstream?.remote ||
								mergeBase.name !== this.repository.HEAD.upstream?.name) ? {
							id: `refs/remotes/${mergeBase.remote}/${mergeBase.name}`,
							name: `${mergeBase.remote}/${mergeBase.name}`,
							revision: mergeBase.commit,
							icon: new ThemeIcon('cloud')
						} : undefined;
					} else {
						// Update base revision if it has changed
						const mergeBaseModified = delta.modified
							.find(ref => ref.id === this._currentHistoryItemBaseRef?.id);

						if (this._currentHistoryItemBaseRef && mergeBaseModified) {
							this._currentHistoryItemBaseRef = {
								...this._currentHistoryItemBaseRef,
								revision: mergeBaseModified.revision
							};
						}
					}
				} else {
					// Detached commit
					historyItemRefId = this.repository.HEAD.commit ?? '';
					historyItemRefName = this.repository.HEAD.commit ?? '';

					this._currentHistoryItemRemoteRef = undefined;
					this._currentHistoryItemBaseRef = undefined;
				}
				break;
			}
			case RefType.Tag: {
				// Tag
				historyItemRefId = `refs/tags/${this.repository.HEAD.name}`;
				historyItemRefName = this.repository.HEAD.name ?? this.repository.HEAD.commit ?? '';

				this._currentHistoryItemRemoteRef = undefined;
				this._currentHistoryItemBaseRef = undefined;
				break;
			}
		}

		// Update context keys for HEAD
		if (this._HEAD?.ahead !== this.repository.HEAD?.ahead) {
			commands.executeCommand('setContext', 'git.currentHistoryItemIsAhead', (this.repository.HEAD?.ahead ?? 0) > 0);
		}
		if (this._HEAD?.behind !== this.repository.HEAD?.behind) {
			commands.executeCommand('setContext', 'git.currentHistoryItemIsBehind', (this.repository.HEAD?.behind ?? 0) > 0);
		}

		this._HEAD = this.repository.HEAD;

		this._currentHistoryItemRef = {
			id: historyItemRefId,
			name: historyItemRefName,
			revision: this.repository.HEAD.commit,
			icon: new ThemeIcon('target'),
		};

		this._onDidChangeCurrentHistoryItemRefs.fire();
		this.logger.trace(`[GitHistoryProvider][onDidRunWriteOperation] currentHistoryItemRef: ${JSON.stringify(this._currentHistoryItemRef)}`);
		this.logger.trace(`[GitHistoryProvider][onDidRunWriteOperation] currentHistoryItemRemoteRef: ${JSON.stringify(this._currentHistoryItemRemoteRef)}`);
		this.logger.trace(`[GitHistoryProvider][onDidRunWriteOperation] currentHistoryItemBaseRef: ${JSON.stringify(this._currentHistoryItemBaseRef)}`);

		// Auto-fetch
		const silent = result.operation.kind === OperationKind.Fetch && result.operation.showProgress === false;
		this._onDidChangeHistoryItemRefs.fire({ ...delta, silent });

		const deltaLog = {
			added: delta.added.map(ref => ref.id),
			modified: delta.modified.map(ref => ref.id),
			removed: delta.removed.map(ref => ref.id),
			silent
		};
		this.logger.trace(`[GitHistoryProvider][onDidRunWriteOperation] historyItemRefs: ${JSON.stringify(deltaLog)}`);
	}

	async provideHistoryItemRefs(historyItemRefs: string[] | undefined): Promise<SourceControlHistoryItemRef[]> {
		const refs = await this.repository.getRefs({ pattern: historyItemRefs });

		const branches: SourceControlHistoryItemRef[] = [];
		const remoteBranches: SourceControlHistoryItemRef[] = [];
		const tags: SourceControlHistoryItemRef[] = [];

		for (const ref of refs) {
			switch (ref.type) {
				case RefType.RemoteHead:
					remoteBranches.push(this.toSourceControlHistoryItemRef(ref));
					break;
				case RefType.Tag:
					tags.push(this.toSourceControlHistoryItemRef(ref));
					break;
				default:
					branches.push(this.toSourceControlHistoryItemRef(ref));
					break;
			}
		}

		return [...branches, ...remoteBranches, ...tags];
	}

	async provideHistoryItems(options: SourceControlHistoryOptions, token: CancellationToken): Promise<SourceControlHistoryItem[]> {
		if (!this.currentHistoryItemRef || !options.historyItemRefs) {
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

			const commits = typeof options.filterText === 'string' && options.filterText !== ''
				? await this._searchHistoryItems(options.filterText.trim(), logOptions, token)
				: await this.repository.log({ ...logOptions, silent: true }, token);

			if (token.isCancellationRequested) {
				return [];
			}

			// Avatars
			const avatarQuery = {
				commits: commits.map(c => ({
					hash: c.hash,
					authorName: c.authorName,
					authorEmail: c.authorEmail
				} satisfies AvatarQueryCommit)),
				size: 20
			} satisfies AvatarQuery;

			const commitAvatars = await provideSourceControlHistoryItemAvatar(
				this.historyItemDetailProviderRegistry, this.repository, avatarQuery);

			const remoteHoverCommands = await provideSourceControlHistoryItemHoverCommands(this.historyItemDetailProviderRegistry, this.repository) ?? [];

			await ensureEmojis();

			const historyItems: SourceControlHistoryItem[] = [];
			for (const commit of commits) {
				const message = emojify(commit.message);
				const messageWithLinks = await provideSourceControlHistoryItemMessageLinks(
					this.historyItemDetailProviderRegistry, this.repository, message) ?? message;

				const avatarUrl = commitAvatars?.get(commit.hash);
				const references = this._resolveHistoryItemRefs(commit);

				const commands: Command[][] = [
					getHoverCommitHashCommands(Uri.file(this.repository.root), commit.hash),
					processHoverRemoteCommands(remoteHoverCommands, commit.hash)
				];

				const tooltip = getHistoryItemHover(avatarUrl, commit.authorName, commit.authorEmail, commit.authorDate ?? commit.commitDate, messageWithLinks, commit.shortStat, commands);

				historyItems.push({
					id: commit.hash,
					parentIds: commit.parents,
					subject: subject(message),
					message: messageWithLinks,
					author: commit.authorName,
					authorEmail: commit.authorEmail,
					authorIcon: avatarUrl ? Uri.parse(avatarUrl) : new ThemeIcon('account'),
					displayId: truncate(commit.hash, this.commitShortHashLength, false),
					timestamp: commit.authorDate?.getTime(),
					statistics: commit.shortStat ?? { files: 0, insertions: 0, deletions: 0 },
					references: references.length !== 0 ? references : undefined,
					tooltip
				} satisfies SourceControlHistoryItem);
			}

			return historyItems;
		} catch (err) {
			this.logger.error(`[GitHistoryProvider][provideHistoryItems] Failed to get history items with options '${JSON.stringify(options)}': ${err}`);
			return [];
		}
	}

	async provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined): Promise<SourceControlHistoryItemChange[]> {
		historyItemParentId = historyItemParentId ?? await this.repository.getEmptyTree();

		const historyItemChangesUri: Uri[] = [];
		const historyItemChanges: SourceControlHistoryItemChange[] = [];
		const changes = await this.repository.diffBetweenWithStats(historyItemParentId, historyItemId);

		for (const change of changes) {
			const historyItemUri = change.uri.with({
				query: `ref=${historyItemId}`
			});

			// History item change
			historyItemChanges.push({
				uri: historyItemUri,
				...toMultiFileDiffEditorUris(change, historyItemParentId, historyItemId)
			} satisfies SourceControlHistoryItemChange);

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

	async resolveHistoryItem(historyItemId: string, token: CancellationToken): Promise<SourceControlHistoryItem | undefined> {
		try {
			const commit = await this.repository.getCommit(historyItemId);

			if (!commit || token.isCancellationRequested) {
				return undefined;
			}

			// Avatars
			const avatarQuery = {
				commits: [{
					hash: commit.hash,
					authorName: commit.authorName,
					authorEmail: commit.authorEmail
				} satisfies AvatarQueryCommit],
				size: 20
			} satisfies AvatarQuery;

			const commitAvatars = await provideSourceControlHistoryItemAvatar(
				this.historyItemDetailProviderRegistry, this.repository, avatarQuery);

			await ensureEmojis();

			const message = emojify(commit.message);
			const messageWithLinks = await provideSourceControlHistoryItemMessageLinks(
				this.historyItemDetailProviderRegistry, this.repository, message) ?? message;

			const newLineIndex = message.indexOf('\n');
			const subject = newLineIndex !== -1
				? `${truncate(message, newLineIndex, false)}`
				: message;

			const avatarUrl = commitAvatars?.get(commit.hash);
			const references = this._resolveHistoryItemRefs(commit);

			return {
				id: commit.hash,
				parentIds: commit.parents,
				subject,
				message: messageWithLinks,
				author: commit.authorName,
				authorEmail: commit.authorEmail,
				authorIcon: avatarUrl ? Uri.parse(avatarUrl) : new ThemeIcon('account'),
				displayId: truncate(commit.hash, this.commitShortHashLength, false),
				timestamp: commit.authorDate?.getTime(),
				statistics: commit.shortStat ?? { files: 0, insertions: 0, deletions: 0 },
				references: references.length !== 0 ? references : undefined
			} satisfies SourceControlHistoryItem;
		} catch (err) {
			this.logger.error(`[GitHistoryProvider][resolveHistoryItem] Failed to resolve history item '${historyItemId}': ${err}`);
			return undefined;
		}
	}

	async resolveHistoryItemChatContext(historyItemId: string): Promise<string | undefined> {
		try {
			const changes = await this.repository.showChanges(historyItemId);
			return changes;
		} catch (err) {
			this.logger.error(`[GitHistoryProvider][resolveHistoryItemChatContext] Failed to resolve history item '${historyItemId}': ${err}`);
		}

		return undefined;
	}

	async resolveHistoryItemChangeRangeChatContext(historyItemId: string, historyItemParentId: string, path: string, token: CancellationToken): Promise<string | undefined> {
		try {
			const changes = await this.repository.showChangesBetween(historyItemParentId, historyItemId, path);

			if (token.isCancellationRequested) {
				return undefined;
			}

			return `Output of git log -p ${historyItemParentId}..${historyItemId} -- ${path}:\n\n${changes}`;
		} catch (err) {
			this.logger.error(`[GitHistoryProvider][resolveHistoryItemChangeRangeChatContext] Failed to resolve history item change range '${historyItemId}' for '${path}': ${err}`);
		}

		return undefined;
	}

	async resolveHistoryItemRefsCommonAncestor(historyItemRefs: string[]): Promise<string | undefined> {
		try {
			if (historyItemRefs.length === 0) {
				// TODO@lszomoru - log
				return undefined;
			} else if (historyItemRefs.length === 1 && historyItemRefs[0] === this.currentHistoryItemRef?.id) {
				// Remote
				if (this.currentHistoryItemRemoteRef) {
					const ancestor = await this.repository.getMergeBase(historyItemRefs[0], this.currentHistoryItemRemoteRef.id);
					return ancestor;
				}

				// Base
				if (this.currentHistoryItemBaseRef) {
					const ancestor = await this.repository.getMergeBase(historyItemRefs[0], this.currentHistoryItemBaseRef.id);
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

	private _resolveHistoryItemRefs(commit: Commit): SourceControlHistoryItemRef[] {
		const references: SourceControlHistoryItemRef[] = [];

		for (const ref of commit.refNames) {
			if (ref === 'refs/remotes/origin/HEAD') {
				continue;
			}

			switch (true) {
				case ref.startsWith('HEAD -> refs/heads/'):
					references.push({
						id: ref.substring('HEAD -> '.length),
						name: ref.substring('HEAD -> refs/heads/'.length),
						revision: commit.hash,
						category: l10n.t('branches'),
						icon: new ThemeIcon('target')
					});
					break;
				case ref.startsWith('refs/heads/'):
					references.push({
						id: ref,
						name: ref.substring('refs/heads/'.length),
						revision: commit.hash,
						category: l10n.t('branches'),
						icon: new ThemeIcon('git-branch')
					});
					break;
				case ref.startsWith('refs/remotes/'):
					references.push({
						id: ref,
						name: ref.substring('refs/remotes/'.length),
						revision: commit.hash,
						category: l10n.t('remote branches'),
						icon: new ThemeIcon('cloud')
					});
					break;
				case ref.startsWith('tag: refs/tags/'):
					references.push({
						id: ref.substring('tag: '.length),
						name: ref.substring('tag: refs/tags/'.length),
						revision: commit.hash,
						category: l10n.t('tags'),
						icon: new ThemeIcon('tag')
					});
					break;
			}
		}

		return references.sort(compareSourceControlHistoryItemRef);
	}

	private async resolveHEADMergeBase(): Promise<Branch | undefined> {
		try {
			if (this.repository.HEAD?.type !== RefType.Head || !this.repository.HEAD?.name) {
				return undefined;
			}

			const mergeBase = await this.repository.getBranchBase(this.repository.HEAD.name);
			return mergeBase;
		} catch (err) {
			this.logger.error(`[GitHistoryProvider][resolveHEADMergeBase] Failed to resolve merge base for ${this.repository.HEAD?.name}: ${err}`);
			return undefined;
		}
	}

	private async _searchHistoryItems(filterText: string, options: LogOptions, token: CancellationToken): Promise<Commit[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		const commits = new Map<string, Commit>();

		// Search by author and commit message in parallel
		const [authorResults, grepResults] = await Promise.all([
			this.repository.log({ ...options, refNames: undefined, author: filterText, silent: true }, token),
			this.repository.log({ ...options, refNames: undefined, grep: filterText, silent: true }, token)
		]);

		for (const commit of [...authorResults, ...grepResults]) {
			if (!commits.has(commit.hash)) {
				commits.set(commit.hash, commit);
			}
		}

		return Array.from(commits.values()).slice(0, options.maxEntries ?? 50);
	}

	private toSourceControlHistoryItemRef(ref: Ref): SourceControlHistoryItemRef {
		switch (ref.type) {
			case RefType.RemoteHead:
				return {
					id: `refs/remotes/${ref.name}`,
					name: ref.name ?? '',
					description: ref.commit ? l10n.t('Remote branch at {0}', truncate(ref.commit, this.commitShortHashLength, false)) : undefined,
					revision: ref.commit,
					icon: new ThemeIcon('cloud'),
					category: l10n.t('remote branches')
				};
			case RefType.Tag:
				return {
					id: `refs/tags/${ref.name}`,
					name: ref.name ?? '',
					description: ref.commit ? l10n.t('Tag at {0}', truncate(ref.commit, this.commitShortHashLength, false)) : undefined,
					revision: ref.commit,
					icon: new ThemeIcon('tag'),
					category: l10n.t('tags')
				};
			default:
				return {
					id: `refs/heads/${ref.name}`,
					name: ref.name ?? '',
					description: ref.commit ? truncate(ref.commit, this.commitShortHashLength, false) : undefined,
					revision: ref.commit,
					icon: new ThemeIcon('git-branch'),
					category: l10n.t('branches')
				};
		}
	}

	dispose(): void {
		dispose(this.disposables);
	}
}
