/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, workspace, Uri, Disposable, Event, EventEmitter, FileDecoration, FileDecorationProvider, ThemeColor, l10n, SourceControlHistoryItemRef } from 'vscode';
import * as path from 'path';
import { Repository, GitResourceGroup } from './repository';
import { Model } from './model';
import { debounce } from './decorators';
import { filterEvent, dispose, anyEvent, fireEvent, PromiseSource, combinedDisposable, runAndSubscribeEvent } from './util';
import { Change, GitErrorCodes, Status } from './api/git';

function equalSourceControlHistoryItemRefs(ref1?: SourceControlHistoryItemRef, ref2?: SourceControlHistoryItemRef): boolean {
	if (ref1 === ref2) {
		return true;
	}

	return ref1?.id === ref2?.id &&
		ref1?.name === ref2?.name &&
		ref1?.revision === ref2?.revision;
}

class GitIgnoreDecorationProvider implements FileDecorationProvider {

	private static Decoration: FileDecoration = { color: new ThemeColor('gitDecoration.ignoredResourceForeground') };

	readonly onDidChangeFileDecorations: Event<Uri[]>;
	private queue = new Map<string, { repository: Repository; queue: Map<string, PromiseSource<FileDecoration | undefined>> }>();
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		this.onDidChangeFileDecorations = fireEvent(anyEvent<any>(
			filterEvent(workspace.onDidSaveTextDocument, e => /\.gitignore$|\.git\/info\/exclude$/.test(e.uri.path)),
			model.onDidOpenRepository,
			model.onDidCloseRepository
		));

		this.disposables.push(window.registerFileDecorationProvider(this));
	}

	async provideFileDecoration(uri: Uri): Promise<FileDecoration | undefined> {
		const repository = this.model.getRepository(uri);

		if (!repository) {
			return;
		}

		let queueItem = this.queue.get(repository.root);

		if (!queueItem) {
			queueItem = { repository, queue: new Map<string, PromiseSource<FileDecoration | undefined>>() };
			this.queue.set(repository.root, queueItem);
		}

		let promiseSource = queueItem.queue.get(uri.fsPath);

		if (!promiseSource) {
			promiseSource = new PromiseSource();
			queueItem!.queue.set(uri.fsPath, promiseSource);
			this.checkIgnoreSoon();
		}

		return await promiseSource.promise;
	}

	@debounce(500)
	private checkIgnoreSoon(): void {
		const queue = new Map(this.queue.entries());
		this.queue.clear();

		for (const [, item] of queue) {
			const paths = [...item.queue.keys()];

			item.repository.checkIgnore(paths).then(ignoreSet => {
				for (const [path, promiseSource] of item.queue.entries()) {
					promiseSource.resolve(ignoreSet.has(path) ? GitIgnoreDecorationProvider.Decoration : undefined);
				}
			}, err => {
				if (err.gitErrorCode !== GitErrorCodes.IsInSubmodule) {
					console.error(err);
				}

				for (const [, promiseSource] of item.queue.entries()) {
					promiseSource.reject(err);
				}
			});
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.queue.clear();
	}
}

class GitDecorationProvider implements FileDecorationProvider {

	private static SubmoduleDecorationData: FileDecoration = {
		tooltip: 'Submodule',
		badge: 'S',
		color: new ThemeColor('gitDecoration.submoduleResourceForeground')
	};

	private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
	readonly onDidChangeFileDecorations: Event<Uri[]> = this._onDidChangeDecorations.event;

	private disposables: Disposable[] = [];
	private decorations = new Map<string, FileDecoration>();

	constructor(private repository: Repository) {
		this.disposables.push(
			window.registerFileDecorationProvider(this),
			runAndSubscribeEvent(repository.onDidRunGitStatus, () => this.onDidRunGitStatus())
		);
	}

	private onDidRunGitStatus(): void {
		const newDecorations = new Map<string, FileDecoration>();

		this.collectSubmoduleDecorationData(newDecorations);
		this.collectDecorationData(this.repository.indexGroup, newDecorations);
		this.collectDecorationData(this.repository.untrackedGroup, newDecorations);
		this.collectDecorationData(this.repository.workingTreeGroup, newDecorations);
		this.collectDecorationData(this.repository.mergeGroup, newDecorations);

		const uris = new Set([...this.decorations.keys()].concat([...newDecorations.keys()]));
		this.decorations = newDecorations;
		this._onDidChangeDecorations.fire([...uris.values()].map(value => Uri.parse(value, true)));
	}

	private collectDecorationData(group: GitResourceGroup, bucket: Map<string, FileDecoration>): void {
		for (const r of group.resourceStates) {
			const decoration = r.resourceDecoration;

			if (decoration) {
				// not deleted and has a decoration
				bucket.set(r.original.toString(), decoration);

				if (r.type === Status.DELETED && r.rightUri) {
					bucket.set(r.rightUri.toString(), decoration);
				}

				if (r.type === Status.INDEX_RENAMED || r.type === Status.INTENT_TO_RENAME) {
					bucket.set(r.resourceUri.toString(), decoration);
				}
			}
		}
	}

	private collectSubmoduleDecorationData(bucket: Map<string, FileDecoration>): void {
		for (const submodule of this.repository.submodules) {
			bucket.set(Uri.file(path.join(this.repository.root, submodule.path)).toString(), GitDecorationProvider.SubmoduleDecorationData);
		}
	}

	provideFileDecoration(uri: Uri): FileDecoration | undefined {
		return this.decorations.get(uri.toString());
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

class GitIncomingChangesFileDecorationProvider implements FileDecorationProvider {

	private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
	readonly onDidChangeFileDecorations: Event<Uri[]> = this._onDidChangeDecorations.event;

	private _currentHistoryItemRef: SourceControlHistoryItemRef | undefined;
	private _currentHistoryItemRemoteRef: SourceControlHistoryItemRef | undefined;

	private _decorations = new Map<string, FileDecoration>();
	private readonly disposables: Disposable[] = [];

	constructor(private readonly repository: Repository) {
		this.disposables.push(
			window.registerFileDecorationProvider(this),
			runAndSubscribeEvent(repository.historyProvider.onDidChangeCurrentHistoryItemRefs, () => this.onDidChangeCurrentHistoryItemRefs())
		);
	}

	private async onDidChangeCurrentHistoryItemRefs(): Promise<void> {
		const historyProvider = this.repository.historyProvider;
		const currentHistoryItemRef = historyProvider.currentHistoryItemRef;
		const currentHistoryItemRemoteRef = historyProvider.currentHistoryItemRemoteRef;

		if (equalSourceControlHistoryItemRefs(this._currentHistoryItemRef, currentHistoryItemRef) &&
			equalSourceControlHistoryItemRefs(this._currentHistoryItemRemoteRef, currentHistoryItemRemoteRef)) {
			return;
		}

		const decorations = new Map<string, FileDecoration>();
		await this.collectIncomingChangesFileDecorations(decorations);
		const uris = new Set([...this._decorations.keys()].concat([...decorations.keys()]));

		this._decorations = decorations;
		this._currentHistoryItemRef = currentHistoryItemRef;
		this._currentHistoryItemRemoteRef = currentHistoryItemRemoteRef;

		this._onDidChangeDecorations.fire([...uris.values()].map(value => Uri.parse(value, true)));
	}

	private async collectIncomingChangesFileDecorations(bucket: Map<string, FileDecoration>): Promise<void> {
		for (const change of await this.getIncomingChanges()) {
			switch (change.status) {
				case Status.INDEX_ADDED:
					bucket.set(change.uri.toString(), {
						badge: '↓A',
						tooltip: l10n.t('Incoming Changes (added)'),
					});
					break;
				case Status.DELETED:
					bucket.set(change.uri.toString(), {
						badge: '↓D',
						tooltip: l10n.t('Incoming Changes (deleted)'),
					});
					break;
				case Status.INDEX_RENAMED:
					bucket.set(change.originalUri.toString(), {
						badge: '↓R',
						tooltip: l10n.t('Incoming Changes (renamed)'),
					});
					break;
				case Status.MODIFIED:
					bucket.set(change.uri.toString(), {
						badge: '↓M',
						tooltip: l10n.t('Incoming Changes (modified)'),
					});
					break;
				default: {
					bucket.set(change.uri.toString(), {
						badge: '↓~',
						tooltip: l10n.t('Incoming Changes'),
					});
					break;
				}
			}
		}
	}

	private async getIncomingChanges(): Promise<Change[]> {
		try {
			const historyProvider = this.repository.historyProvider;
			const currentHistoryItemRef = historyProvider.currentHistoryItemRef;
			const currentHistoryItemRemoteRef = historyProvider.currentHistoryItemRemoteRef;

			if (!currentHistoryItemRef || !currentHistoryItemRemoteRef) {
				return [];
			}

			const ancestor = await historyProvider.resolveHistoryItemRefsCommonAncestor([currentHistoryItemRef.id, currentHistoryItemRemoteRef.id]);
			if (!ancestor) {
				return [];
			}

			const changes = await this.repository.diffBetween(ancestor, currentHistoryItemRemoteRef.id);
			return changes;
		} catch (err) {
			return [];
		}
	}

	provideFileDecoration(uri: Uri): FileDecoration | undefined {
		return this._decorations.get(uri.toString());
	}

	dispose(): void {
		dispose(this.disposables);
	}
}

export class GitDecorations {

	private disposables: Disposable[] = [];
	private modelDisposables: Disposable[] = [];
	private providers = new Map<Repository, Disposable>();

	constructor(private model: Model) {
		this.disposables.push(new GitIgnoreDecorationProvider(model));

		const onEnablementChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.decorations.enabled'));
		onEnablementChange(this.update, this, this.disposables);
		this.update();
	}

	private update(): void {
		const enabled = workspace.getConfiguration('git').get('decorations.enabled');

		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	private enable(): void {
		this.model.onDidOpenRepository(this.onDidOpenRepository, this, this.modelDisposables);
		this.model.onDidCloseRepository(this.onDidCloseRepository, this, this.modelDisposables);
		this.model.repositories.forEach(this.onDidOpenRepository, this);
	}

	private disable(): void {
		this.modelDisposables = dispose(this.modelDisposables);
		this.providers.forEach(value => value.dispose());
		this.providers.clear();
	}

	private onDidOpenRepository(repository: Repository): void {
		const providers = combinedDisposable([
			new GitDecorationProvider(repository),
			new GitIncomingChangesFileDecorationProvider(repository)
		]);

		this.providers.set(repository, providers);
	}

	private onDidCloseRepository(repository: Repository): void {
		const provider = this.providers.get(repository);

		if (provider) {
			provider.dispose();
			this.providers.delete(repository);
		}
	}

	dispose(): void {
		this.disable();
		this.disposables = dispose(this.disposables);
	}
}
