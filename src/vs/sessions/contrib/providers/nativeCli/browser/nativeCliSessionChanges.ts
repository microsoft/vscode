/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { listenStream } from '../../../../../base/common/stream.js';
import { localize } from '../../../../../nls.js';
import { EMPTY_TREE_OBJECT } from '../../../../../platform/agentHost/common/agentHostGitService.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { GitChange, GitDiffChange, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionChangeset, ISessionFileChange, ISessionWorkspace, SESSION_CHANGES_CHANGESET_ID, sessionFileChangesEqual, sessionWorkspaceEqual, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { toIChatSessionFileChange2 } from '../../copilotChatSessions/browser/copilotChatSessionsChangesets.js';

/** Files above this are listed without a line count instead of streamed through the renderer. */
const MAX_MEASURED_FILE_SIZE = 4 * 1024 * 1024;
const BINARY_SNIFF_LENGTH = 8000;
/** Beyond this the repository state signal alone drives refreshes. */
const MAX_FILE_WATCHERS = 256;

export class NativeCliSessionChanges extends Disposable {
	readonly workspace;
	readonly changes = observableValueOpts<readonly ISessionFileChange[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);
	private readonly _uncommittedChanges = observableValueOpts<readonly ISessionFileChange[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);
	readonly hasGitRepository = observableValue(this, false);
	readonly baseRef;
	readonly isLoading = observableValue(this, false);
	readonly hasResolved = observableValue(this, false);
	readonly error = observableValue<string | undefined>(this, undefined);
	readonly changesets;

	private _repository: IGitRepository | undefined;
	private readonly _repositoryObserver = this._register(new MutableDisposable());
	private _initialization: Promise<void> | undefined;
	private readonly _refreshQueue = new Sequencer();
	private readonly _readCancellation = this._register(new CancellationTokenSource());
	private readonly _watchers = this._register(new DisposableMap<string>());
	private readonly _refreshScheduler = this._register(new RunOnceScheduler(() => {
		void this.refresh().catch(error => this._logService.error('[NativeCliSessionChanges] Refresh failed', error));
	}, 500));

	constructor(
		workspace: ISessionWorkspace,
		baseRef: string | undefined,
		@IGitService private readonly _gitService: IGitService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.workspace = observableValueOpts({ owner: this, equalsFn: sessionWorkspaceEqual }, workspace);
		this.baseRef = observableValue(this, baseRef);
		const changeset = (id: string, label: string, description: string, changes: typeof this.changes, isDefault: boolean): ISessionChangeset => ({
			id, label, description,
			changes,
			isEnabled: this.hasGitRepository,
			isDefault: constObservable(isDefault),
			isLoadingChanges: this.isLoading,
			operations: constObservable([]),
			originalCheckpointRef: id === SESSION_CHANGES_CHANGESET_ID ? this.baseRef : constObservable(undefined),
			modifiedCheckpointRef: constObservable(undefined),
			invokeOperation: async operation => { throw new Error(`Unsupported terminal changeset operation '${operation}'`); },
		});
		this.changesets = constObservable<readonly ISessionChangeset[]>([
			changeset(SESSION_CHANGES_CHANGESET_ID, localize('nativeCliSessionChanges', "Repository Changes"),
				localize('nativeCliSessionChangesDescription', "Repository changes since this session started, including edits made outside the terminal."), this.changes, true),
			changeset(UNCOMMITTED_CHANGES_CHANGESET_ID, localize('nativeCliUncommittedChanges', "Uncommitted Changes"),
				localize('nativeCliUncommittedChangesDescription', "Changes in the working tree that have not been committed yet."), this._uncommittedChanges, false),
		]);
		this._register(_gitService.onDidOpenRepository(repository => {
			// Also handles the `undefined -> repository` transition: a cold start can miss
			// the git extension's registration window and would otherwise stay unresolved.
			if (this._repository
				? isEqual(this._repository.rootUri, repository.rootUri)
				: isEqual(repository.rootUri, this.workspace.get().folders[0].workingDirectory)) {
				this._setRepository(repository);
				this.hasGitRepository.set(true, undefined);
				this._refreshScheduler.schedule();
			}
		}));
	}

	initialize(): Promise<void> {
		return this._initialization ??= this._initialize().catch(error => {
			if (!this._store.isDisposed) {
				this.error.set(localize('nativeCliChangesInitializeFailed', "Could not initialize repository changes. See the window log for details."), undefined);
			}
			throw error;
		}).finally(() => this._initialization = undefined);
	}

	private async _initialize(): Promise<void> {
		const repository = await this._gitService.openRepository(this.workspace.get().folders[0].workingDirectory);
		if (this._store.isDisposed) {
			return;
		}
		if (!repository) {
			this._repositoryObserver.clear();
			this._repository = undefined;
			this.hasGitRepository.set(false, undefined);
			if (this.baseRef.get()) {
				throw new Error(localize('nativeCliRepositoryUnavailable', "The session's Git repository is not available."));
			}
			this.hasResolved.set(true, undefined);
			return;
		}
		if (!this.baseRef.get()) {
			this.baseRef.set(repository.state.get().HEAD?.commit ?? EMPTY_TREE_OBJECT, undefined);
		}
		this._setRepository(repository);
		await this.refresh();
	}

	private _setRepository(repository: IGitRepository): void {
		if (repository === this._repository) {
			return;
		}
		this._repository = repository;
		this.hasGitRepository.set(true, undefined);
		this._repositoryObserver.value = autorun(reader => {
			const state = repository.state.read(reader);
			const workspace = this.workspace.read(undefined);
			const folder = workspace.folders[0];
			this.workspace.set({
				...workspace,
				folders: [{
					...folder,
					gitRepository: {
						uri: repository.rootUri,
						workTreeUri: undefined,
						isRepository: this.hasGitRepository,
						branchName: state.HEAD?.name,
						baseBranchName: undefined,
						uncommittedChanges: new Set([...state.indexChanges, ...state.workingTreeChanges, ...state.untrackedChanges, ...state.mergeChanges].map(change => getComparisonKey(change.uri))).size,
						gitHubInfo: constObservable(undefined),
					},
				}, ...workspace.folders.slice(1)],
			}, undefined);
			this._refreshScheduler.schedule();
		});
	}

	refresh(): Promise<void> {
		this._refreshScheduler.cancel();
		return this._refreshQueue.queue(async () => {
			const repository = this._repository;
			if (!repository || this._store.isDisposed) {
				return;
			}
			this.isLoading.set(true, undefined);
			try {
				const state = repository.state.get();
				const head = state.HEAD?.commit;
				const base = this.baseRef.get() ?? head;
				const [changes, uncommitted] = await Promise.all([
					base ? repository.diffBetweenWithStats2(base, undefined, { throwOnError: true }) : this._readAddedFiles([...state.indexChanges, ...state.workingTreeChanges]),
					head && head !== base ? repository.diffBetweenWithStats2(head, undefined, { throwOnError: true }) : Promise.resolve(undefined),
				]);
				const untracked = await this._readAddedFiles([
					...state.untrackedChanges,
					...state.workingTreeChanges.filter(change => !change.originalUri && change.modifiedUri),
				]);
				if (this._store.isDisposed || repository !== this._repository) {
					return;
				}
				const combine = (tracked: readonly IChatSessionFileChange2[]): readonly IChatSessionFileChange2[] =>
					[...new Map([...untracked, ...tracked].map(change => [getComparisonKey(change.uri), change])).values()];
				const sessionChanges = combine(toIChatSessionFileChange2(changes, base, undefined));
				const uncommittedChanges = combine(toIChatSessionFileChange2(uncommitted ?? changes, head ?? base, undefined));
				this._watchChangedFiles([...sessionChanges, ...uncommittedChanges].flatMap(change => change.modifiedUri ? [change.modifiedUri] : []));
				transaction(tx => {
					this.changes.set(sessionChanges, tx);
					this._uncommittedChanges.set(uncommittedChanges, tx);
					this.error.set(undefined, tx);
					this.hasResolved.set(true, tx);
				});
			} catch (error) {
				// A torn-down extension host surfaces as cancellation; latching a sticky
				// error there would leave the session permanently unrefreshable.
				if (!this._store.isDisposed && !isCancellationError(error)) {
					this.error.set(localize('nativeCliChangesFailed', "Could not refresh repository changes. See the window log for details."), undefined);
				}
				throw error;
			} finally {
				if (!this._store.isDisposed) {
					this.isLoading.set(false, undefined);
				}
			}
		});
	}

	private async _readAddedFiles(changes: readonly GitChange[]): Promise<GitDiffChange[]> {
		// Untracked entries are repo-wide and include directories (a nested repository is
		// reported as a single `sub/` entry), so each one is isolated and bounded.
		const results = await Promise.all(changes.map(change => this._readAddedFile(change)));
		return results.filter((change): change is GitDiffChange => !!change);
	}

	private async _readAddedFile(change: GitChange): Promise<GitDiffChange | undefined> {
		try {
			const insertions = await this._countFileLines(change.uri);
			return { uri: change.uri, originalUri: undefined, modifiedUri: change.uri, insertions, deletions: 0 };
		} catch (error) {
			// Directories (a nested repository arrives as a single entry) and oversized
			// artifacts stay listed, just without a line count.
			if (error instanceof FileOperationError
				&& (error.fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY || error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE)) {
				return { uri: change.uri, originalUri: undefined, modifiedUri: change.uri, insertions: 0, deletions: 0 };
			}
			// A transient delete or an unreadable file must not fail the whole refresh and
			// leave the session with no change information at all.
			if (!isCancellationError(error)) {
				this._logService.trace('[NativeCliSessionChanges] Could not measure an untracked entry', change.uri.toString(), error);
			}
			return undefined;
		}
	}

	private async _countFileLines(resource: URI): Promise<number> {
		const { value } = await this._fileService.readFileStream(resource, { limits: { size: MAX_MEASURED_FILE_SIZE } }, this._readCancellation.token);
		return new Promise<number>((resolve, reject) => {
			let offset = 0;
			let lines = 0;
			let lastByte: number | undefined;
			let binary = false;
			listenStream(value, {
				onData: chunk => {
					if (binary) {
						return;
					}
					const buffer = chunk.buffer;
					if (offset < BINARY_SNIFF_LENGTH) {
						const zero = buffer.indexOf(0);
						if (zero !== -1 && offset + zero < BINARY_SNIFF_LENGTH) {
							binary = true;
							return;
						}
					}
					for (let index = buffer.indexOf(10); index !== -1; index = buffer.indexOf(10, index + 1)) {
						lines++;
					}
					if (buffer.length) {
						lastByte = buffer[buffer.length - 1];
					}
					offset += buffer.length;
				},
				onError: reject,
				onEnd: () => resolve(binary ? 0 : lines + (lastByte !== undefined && lastByte !== 10 ? 1 : 0)),
			});
		});
	}

	private _watchChangedFiles(resources: readonly URI[]): void {
		// A rebase or dependency install can touch thousands of files; beyond the cap the
		// repository state signal already drives a refresh.
		const capped = resources.slice(0, MAX_FILE_WATCHERS);
		const wanted = new Set(capped.map(resource => getComparisonKey(resource)));
		for (const key of this._watchers.keys()) {
			if (!wanted.has(key)) {
				this._watchers.deleteAndDispose(key);
			}
		}
		for (const resource of capped) {
			const key = getComparisonKey(resource);
			if (this._watchers.has(key)) {
				continue;
			}
			const store = new DisposableStore();
			this._watchers.set(key, store);
			const watcher = store.add(this._fileService.createWatcher(resource, { recursive: false, excludes: [] }));
			store.add(watcher.onDidChange(() => this._refreshScheduler.schedule()));
		}
	}

	override dispose(): void {
		this._readCancellation.cancel();
		super.dispose();
	}
}
