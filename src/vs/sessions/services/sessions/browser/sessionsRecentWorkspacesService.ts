/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../base/common/resources.js';
import { disposableTimeout, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { parse, ParseError } from '../../../../base/common/json.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { hasKey, isObject } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isRecentFolder, IRecentWorkspace as IRecentWorkspaceFile, isStoredWorkspaceFolder, IWorkspacesService, toWorkspaceFolders } from '../../../../platform/workspaces/common/workspaces.js';
import { ISessionWorkspace } from '../common/session.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { WorkspaceHistoryLoadState } from '../../../common/workspaceSelection.js';

const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';
const STORAGE_KEY_NO_WORKSPACE_CHECKED = 'sessions.noWorkspaceChecked';
const STORAGE_KEY_EXCLUDED_VSCODE_FOLDERS = 'sessions.excludedVSCodeRecentFolders';
const MAX_RECENT_WORKSPACES = 10;
const MAX_VSCODE_RECENT_WORKSPACES = 10;
const MAX_RECENT_WORKSPACE_FILES = 10;
const MAX_WORKSPACE_FILE_SIZE = 1024 * 1024;
const HISTORY_LOAD_TIMEOUT_MS = 5_000;

export function isWorktreeWorkspaceUri(uri: URI): boolean {
	return uri.path.split('/').some(segment => {
		const normalizedSegment = segment.toLowerCase();
		return normalizedSegment.endsWith('.worktrees') || normalizedSegment === 'copilot-worktrees';
	});
}

function getRepositoryUriForWorktree(uri: URI): URI | undefined {
	const segments = uri.path.split('/');
	const worktreesIndex = segments.findIndex(segment => segment.toLowerCase().endsWith('.worktrees'));
	if (worktreesIndex < 0) {
		return undefined;
	}
	const worktreesSegment = segments[worktreesIndex];
	segments[worktreesIndex] = worktreesSegment.slice(0, -'.worktrees'.length);
	return uri.with({ path: segments.slice(0, worktreesIndex + 1).join('/') || '/' });
}

/** A recently used folder, resolved to its workspace. `checked` marks the currently selected folder in the new-session workspace picker. */
export interface IRecentWorkspace {
	readonly workspace: ISessionWorkspace;
	readonly providerId: string;
	readonly checked: boolean;
	readonly source: 'agents' | 'vscode' | 'vscodeWorkspace';
}

interface IStoredRecentWorkspace {
	readonly uri: UriComponents;
	readonly providerId?: string;
	readonly checked: boolean;
}

interface IVSCodeRecentFolder {
	readonly folderUri: URI;
	readonly source: 'vscode' | 'vscodeWorkspace';
}

export const ISessionsRecentWorkspacesService = createDecorator<ISessionsRecentWorkspacesService>('sessionsRecentWorkspacesService');

/** Single source of truth for the sessions' own "recently used" workspace folders, shared by every folder-selection surface. */
export interface ISessionsRecentWorkspacesService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeRecentWorkspaces: Event<void>;
	/** Whether VS Code's recent-folder and workspace-file history has loaded; Agents-owned history is synchronous. */
	readonly historyLoadState: IObservable<WorkspaceHistoryLoadState>;

	/**
	 * The recently used folders, resolved and most recent first: own history
	 * first, then (when `includeVSCodeRecents` is `true`, the default) VS
	 * Code's recently opened folders and workspace-file folders (deduplicated against own history).
	 *
	 * Pass `false` to restrict to the sessions' own recently-picked history
	 * only. The new-session workspace picker checks this history before
	 * considering VS Code's recently opened folders.
	 */
	getRecentWorkspaces(includeVSCodeRecents?: boolean, collapseWorktrees?: boolean): IRecentWorkspace[];

	/** Records `folderUri` as most-recently used; `checked` un-checks every other entry. */
	addRecentWorkspace(folderUri: URI, providerId: string | undefined, checked: boolean): void;

	/** Removes `folderUri` from the recent list, wherever it came from (own history or VS Code's recents). */
	removeRecentWorkspace(folderUri: URI, removeCollapsedWorktrees?: boolean): void;

	/** Clears the `checked` flag on every recent entry. */
	clearCheckedWorkspace(): void;

	/** Whether "No workspace" is the checked new-session target. */
	isNoWorkspaceChecked(): boolean;

	/** Marks "No workspace" as checked and un-checks every recent workspace. */
	checkNoWorkspace(): void;
}

/** Exported for direct instantiation in tests; consumers should depend on {@link ISessionsRecentWorkspacesService}. */
export class SessionsRecentWorkspacesService extends Disposable implements ISessionsRecentWorkspacesService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeRecentWorkspaces = this._register(new Emitter<void>());
	readonly onDidChangeRecentWorkspaces: Event<void> = this._onDidChangeRecentWorkspaces.event;

	private _vsCodeRecentFolders: IVSCodeRecentFolder[] = [];
	private readonly _historyRefresh = this._register(new MutableDisposable<DisposableStore>());
	private readonly _historyLoadState = observableValue<WorkspaceHistoryLoadState>(this, 'loading');
	readonly historyLoadState: IObservable<WorkspaceHistoryLoadState> = this._historyLoadState;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._refreshVSCodeRecentWorkspaces();
		this._register(this.workspacesService.onDidChangeRecentlyOpened(() => this._refreshVSCodeRecentWorkspaces()));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(() => this._refreshVSCodeRecentWorkspaces()));
	}

	getRecentWorkspaces(includeVSCodeRecents = true, collapseWorktrees = false): IRecentWorkspace[] {
		const storedOwn = this._getStoredRecentWorkspaces();
		if (!includeVSCodeRecents) {
			return this._resolveStored(storedOwn, 'agents');
		}

		const availableUris = new Set([
			...storedOwn.map(entry => URI.revive(entry.uri)),
			...this._vsCodeRecentFolders.map(entry => entry.folderUri),
		].map(uri => this.uriIdentityService.extUri.getComparisonKey(uri)));
		const seenOwnUris = new Set<string>();
		const own = storedOwn.flatMap(entry => {
			const uri = URI.revive(entry.uri);
			const repositoryUri = collapseWorktrees ? getRepositoryUriForWorktree(uri) : undefined;
			const displayUri = repositoryUri && availableUris.has(this.uriIdentityService.extUri.getComparisonKey(repositoryUri))
				? repositoryUri
				: uri;
			const key = this.uriIdentityService.extUri.getComparisonKey(displayUri);
			if (seenOwnUris.has(key)) {
				return [];
			}
			seenOwnUris.add(key);
			return [{ ...entry, uri: displayUri.toJSON() }];
		});
		const ownUris = new Set(own.map(o => this.uriIdentityService.extUri.getComparisonKey(URI.revive(o.uri))));
		const vsCode = this._vsCodeRecentFolders
			.filter(entry => !ownUris.has(this.uriIdentityService.extUri.getComparisonKey(entry.folderUri)))
			.flatMap(entry => this._resolveStored([{ uri: entry.folderUri.toJSON(), checked: false }], entry.source));

		return [...this._resolveStored(own, 'agents'), ...vsCode];
	}

	private _resolveStored(stored: readonly IStoredRecentWorkspace[], source: IRecentWorkspace['source']): IRecentWorkspace[] {
		const recents: IRecentWorkspace[] = [];
		for (const entry of stored) {
			const folderUri = URI.revive(entry.uri);
			const resolved = this._resolveWorkspace(folderUri, entry.providerId);
			if (resolved) {
				recents.push({ workspace: resolved.workspace, providerId: resolved.providerId, checked: entry.checked, source });
			}
		}
		return recents;
	}

	addRecentWorkspace(folderUri: URI, providerId: string | undefined, checked: boolean): void {
		this._updateExcludedVSCodeFolders([folderUri], false);
		const recents = this._getStoredRecentWorkspaces();
		const filtered = recents.map(p => {
			// Remove the entry being re-added (it will go to the front)
			if (this.uriIdentityService.extUri.isEqual(URI.revive(p.uri), folderUri)) {
				return undefined;
			}
			// Clear checked from all other entries when marking checked
			if (checked && p.checked) {
				return { ...p, checked: false };
			}
			return p;
		}).filter((p): p is IStoredRecentWorkspace => p !== undefined);

		const entry: IStoredRecentWorkspace = { uri: folderUri.toJSON(), providerId, checked };
		const updated = [entry, ...filtered].slice(0, MAX_RECENT_WORKSPACES);
		if (checked) {
			this.storageService.remove(STORAGE_KEY_NO_WORKSPACE_CHECKED, StorageScope.PROFILE);
		}
		this._persistRecentWorkspaces(updated);
	}

	removeRecentWorkspace(folderUri: URI, removeCollapsedWorktrees = false): void {
		const recents = this._getStoredRecentWorkspaces();
		const matchesRemovedWorkspace = (candidate: URI): boolean => {
			if (this.uriIdentityService.extUri.isEqual(candidate, folderUri)) {
				return true;
			}
			const repositoryUri = removeCollapsedWorktrees ? getRepositoryUriForWorktree(candidate) : undefined;
			return !!repositoryUri && this.uriIdentityService.extUri.isEqual(repositoryUri, folderUri);
		};
		const updated = recents.filter(p => !matchesRemovedWorkspace(URI.revive(p.uri)));
		const vsCodeUris = this._vsCodeRecentFolders.map(entry => entry.folderUri).filter(matchesRemovedWorkspace);
		this._updateExcludedVSCodeFolders([folderUri, ...vsCodeUris], true);
		this._vsCodeRecentFolders = this._vsCodeRecentFolders.filter(entry => !matchesRemovedWorkspace(entry.folderUri));
		if (updated.length !== recents.length) {
			this._persistRecentWorkspaces(updated);
		} else {
			this._onDidChangeRecentWorkspaces.fire();
		}
		this.workspacesService.removeRecentlyOpened([folderUri, ...vsCodeUris]);
	}

	clearCheckedWorkspace(): void {
		const recents = this._getStoredRecentWorkspaces();
		const updated = recents.map(p => ({ ...p, checked: false }));
		this.storageService.remove(STORAGE_KEY_NO_WORKSPACE_CHECKED, StorageScope.PROFILE);
		this._persistRecentWorkspaces(updated);
	}

	isNoWorkspaceChecked(): boolean {
		return this.storageService.getBoolean(STORAGE_KEY_NO_WORKSPACE_CHECKED, StorageScope.PROFILE, false);
	}

	checkNoWorkspace(): void {
		const recents = this._getStoredRecentWorkspaces();
		const updated = recents.map(p => ({ ...p, checked: false }));
		this.storageService.store(STORAGE_KEY_NO_WORKSPACE_CHECKED, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._persistRecentWorkspaces(updated);
	}

	/** Resolves `folderUri` to its workspace, trying `preferredProviderId` first if given. */
	private _resolveWorkspace(folderUri: URI, preferredProviderId?: string): { providerId: string; workspace: ISessionWorkspace } | undefined {
		if (preferredProviderId) {
			const preferred = this.sessionsProvidersService.getProvider(preferredProviderId);
			const workspace = preferred?.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: preferredProviderId, workspace };
			}
		}
		for (const provider of this.sessionsProvidersService.getProviders()) {
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: provider.id, workspace };
			}
		}
		return undefined;
	}

	private async _refreshVSCodeRecentWorkspaces(): Promise<void> {
		const refresh = new DisposableStore();
		this._historyRefresh.value = refresh;
		const cancellation = new CancellationTokenSource();
		refresh.add(toDisposable(() => cancellation.dispose(true)));
		let timedOut = false;
		refresh.add(disposableTimeout(() => {
			timedOut = true;
			cancellation.cancel();
		}, HISTORY_LOAD_TIMEOUT_MS));
		this._historyLoadState.set('loading', undefined);
		try {
			const recentlyOpened = await raceCancellationError(this.workspacesService.getRecentlyOpened(), cancellation.token);
			if (refresh.isDisposed) {
				return;
			}
			const results: Promise<{ folders: IVSCodeRecentFolder[]; hasErrors: boolean }>[] = [];
			const directFolders = new Set<string>();
			let workspaceFiles = 0;
			for (const entry of recentlyOpened.workspaces) {
				if (isRecentFolder(entry)) {
					results.push(Promise.resolve({ folders: [{ folderUri: entry.folderUri, source: 'vscode' }], hasErrors: false }));
					if (this._includeVSCodeFolder(entry.folderUri)) {
						directFolders.add(this.uriIdentityService.extUri.getComparisonKey(entry.folderUri));
					}
					if (directFolders.size >= MAX_VSCODE_RECENT_WORKSPACES) {
						break;
					}
				} else if (workspaceFiles++ < MAX_RECENT_WORKSPACE_FILES) {
					results.push((async () => {
						try {
							const result = await this._readWorkspaceFolders(entry, cancellation.token);
							return { folders: result.folders.map(folderUri => ({ folderUri, source: 'vscodeWorkspace' as const })), hasErrors: result.hasErrors };
						} catch (error) {
							if (!cancellation.token.isCancellationRequested) {
								this.logService.warn('[SessionsRecentWorkspaces] Could not read recent workspace folders', error);
							}
							return { folders: [], hasErrors: true };
						}
					})());
				}
			}
			const loaded = await Promise.all(results);
			if (refresh.isDisposed) {
				return;
			}
			const excluded = new Set(this.storageService.getObject<string[]>(STORAGE_KEY_EXCLUDED_VSCODE_FOLDERS, StorageScope.PROFILE, []));
			const seen = new Set<string>();
			this._vsCodeRecentFolders = loaded.flatMap(result => result.folders).filter(entry => {
				const key = this.uriIdentityService.extUri.getComparisonKey(entry.folderUri);
				if (seen.has(key) || (entry.source === 'vscodeWorkspace' && excluded.has(key)) || !this._includeVSCodeFolder(entry.folderUri)) {
					return false;
				}
				seen.add(key);
				return true;
			}).slice(0, MAX_VSCODE_RECENT_WORKSPACES);
			if (timedOut) {
				this.logService.warn('[SessionsRecentWorkspaces] Timed out reading recent workspace folders');
			}
			this._historyLoadState.set(timedOut || loaded.some(result => result.hasErrors) ? 'error' : 'loaded', undefined);
			this._onDidChangeRecentWorkspaces.fire();
		} catch (error) {
			if (!refresh.isDisposed) {
				this._historyLoadState.set('error', undefined);
				if (timedOut) {
					this.logService.warn('[SessionsRecentWorkspaces] Timed out loading workspace history');
				} else {
					onUnexpectedError(error);
				}
			}
		} finally {
			if (this._historyRefresh.value === refresh) {
				this._historyRefresh.clear();
			}
		}
	}

	private _includeVSCodeFolder(uri: URI): boolean {
		return !basename(uri).startsWith('copilot-') && !isWorktreeWorkspaceUri(uri);
	}

	private async _readWorkspaceFolders(recent: IRecentWorkspaceFile, token: CancellationToken): Promise<{ folders: URI[]; hasErrors: boolean }> {
		const configPath = recent.workspace.configPath;
		if (!this.fileService.hasProvider(configPath)) {
			throw new Error('No file system provider for the recent workspace file');
		}
		const content = await raceCancellationError(this.fileService.readFile(configPath, { limits: { size: MAX_WORKSPACE_FILE_SIZE } }, token), token);
		const errors: ParseError[] = [];
		const stored: { folders?: unknown; remoteAuthority?: unknown } | undefined = parse(content.value.toString(), errors);
		if (errors.length || !isObject(stored) || !Array.isArray(stored.folders)) {
			throw new Error('Invalid recent workspace file');
		}
		const configuredFolders = stored.folders.filter(isStoredWorkspaceFolder);
		let hasErrors = configuredFolders.length !== stored.folders.length;
		const remoteAuthority = recent.remoteAuthority || (typeof stored.remoteAuthority === 'string' ? stored.remoteAuthority : undefined);
		const folders = configuredFolders.filter(folder => {
			if (configPath.scheme === Schemas.file && remoteAuthority && hasKey(folder, { path: true })) {
				hasErrors = true;
				return false;
			}
			if (hasKey(folder, { uri: true })) {
				URI.parse(folder.uri, true);
			}
			return true;
		});
		if (hasErrors) {
			this.logService.warn('[SessionsRecentWorkspaces] Skipped invalid folders or ambiguous remote paths in a recent workspace file');
		}
		return { folders: toWorkspaceFolders(folders, configPath, this.uriIdentityService.extUri).map(folder => folder.uri), hasErrors };
	}

	private _updateExcludedVSCodeFolders(folders: readonly URI[], excluded: boolean): void {
		const keys = new Set(this.storageService.getObject<string[]>(STORAGE_KEY_EXCLUDED_VSCODE_FOLDERS, StorageScope.PROFILE, []));
		let changed = false;
		for (const folder of folders) {
			const key = this.uriIdentityService.extUri.getComparisonKey(folder);
			if (excluded && !keys.has(key)) {
				keys.add(key);
				changed = true;
			} else if (!excluded && keys.delete(key)) {
				changed = true;
			}
		}
		if (changed) {
			if (keys.size) {
				this.storageService.store(STORAGE_KEY_EXCLUDED_VSCODE_FOLDERS, JSON.stringify([...keys]), StorageScope.PROFILE, StorageTarget.MACHINE);
			} else {
				this.storageService.remove(STORAGE_KEY_EXCLUDED_VSCODE_FOLDERS, StorageScope.PROFILE);
			}
		}
	}

	private _getStoredRecentWorkspaces(): IStoredRecentWorkspace[] {
		const raw = this.storageService.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			return JSON.parse(raw) as IStoredRecentWorkspace[];
		} catch {
			return [];
		}
	}

	private _persistRecentWorkspaces(entries: IStoredRecentWorkspace[]): void {
		this.storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(entries), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._onDidChangeRecentWorkspaces.fire();
	}
}

registerSingleton(ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService, InstantiationType.Delayed);
