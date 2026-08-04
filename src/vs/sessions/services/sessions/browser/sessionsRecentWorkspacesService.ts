/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../base/common/resources.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isRecentFolder, IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { ISessionWorkspace } from '../common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';

const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';
const STORAGE_KEY_HAS_SENT_REQUEST = 'sessions.hasSentRequest';
const STORAGE_KEY_LAST_REQUEST_WORKSPACE = 'sessions.lastRequestWorkspace';
const LEGACY_TOTAL_SESSIONS_KEY = 'agentSessions.telemetry.totalSessions';
const MAX_RECENT_WORKSPACES = 10;
const MAX_VSCODE_RECENT_WORKSPACES = 10;

function hasWorktreesPathSegment(uri: URI): boolean {
	return uri.path.split('/').some(segment => segment.toLowerCase().endsWith('.worktrees'));
}

/** A recently used folder, resolved to its workspace. `checked` marks the currently selected folder in the new-session workspace picker. */
export interface IRecentWorkspace {
	readonly workspace: ISessionWorkspace;
	readonly providerId: string;
	readonly checked: boolean;
}

interface IStoredRecentWorkspace {
	readonly uri: UriComponents;
	readonly providerId?: string;
	readonly checked: boolean;
}

export const ISessionsRecentWorkspacesService = createDecorator<ISessionsRecentWorkspacesService>('sessionsRecentWorkspacesService');

/** Single source of truth for the sessions' own "recently used" workspace folders, shared by every folder-selection surface. */
export interface ISessionsRecentWorkspacesService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeRecentWorkspaces: Event<void>;

	/**
	 * The recently used folders, resolved and most recent first: own history
	 * first, then (when `includeVSCodeRecents` is `true`, the default) VS
	 * Code's own recently opened folders (deduplicated against own history).
	 *
	 * Pass `false` to restrict the result to the sessions' own recently-picked
	 * history.
	 */
	getRecentWorkspaces(includeVSCodeRecents?: boolean): IRecentWorkspace[];

	/** Returns the highest-priority existing workspace to preselect in a new-session view. */
	getWorkspaceToRestore(): Promise<IRecentWorkspace | undefined>;

	/** Returns whether `folderUri` can be validated as an existing folder, pruning authoritative stale entries. */
	isExistingWorkspace(folderUri: URI): Promise<boolean>;

	/** Records `folderUri` as most-recently used; `checked` un-checks every other entry. */
	addRecentWorkspace(folderUri: URI, providerId: string | undefined, checked: boolean): void;

	/** Removes `folderUri` from the recent list, wherever it came from (own history or VS Code's recents). */
	removeRecentWorkspace(folderUri: URI): void;

	/** Clears the `checked` flag on every recent entry. */
	clearCheckedWorkspace(): void;
}

/** Exported for direct instantiation in tests; consumers should depend on {@link ISessionsRecentWorkspacesService}. */
export class SessionsRecentWorkspacesService extends Disposable implements ISessionsRecentWorkspacesService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeRecentWorkspaces = this._register(new Emitter<void>());
	readonly onDidChangeRecentWorkspaces: Event<void> = this._onDidChangeRecentWorkspaces.event;

	private _vsCodeRecentFolderUris: URI[] = [];
	private readonly _initialRecentWorkspacesRefresh: Promise<void>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IFileService private readonly fileService: IFileService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._initialRecentWorkspacesRefresh = this._refreshVSCodeRecentWorkspaces();
		this._register(this.workspacesService.onDidChangeRecentlyOpened(() => this._refreshVSCodeRecentWorkspaces()));
		this._register(sessionsManagementService.onDidSendRequest(({ session }) => {
			this.storageService.store(STORAGE_KEY_HAS_SENT_REQUEST, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			const folderUri = session.workspace.get()?.folders[0]?.root;
			if (!folderUri) {
				return;
			}
			const lastRequestWorkspace: IStoredRecentWorkspace = {
				uri: folderUri.toJSON(),
				providerId: session.providerId,
				checked: true,
			};
			this.storageService.store(STORAGE_KEY_LAST_REQUEST_WORKSPACE, JSON.stringify(lastRequestWorkspace), StorageScope.PROFILE, StorageTarget.MACHINE);
			this.addRecentWorkspace(folderUri, session.providerId, true);
		}));
	}

	getRecentWorkspaces(includeVSCodeRecents = true): IRecentWorkspace[] {
		const own = this._getStoredRecentWorkspaces();
		if (!includeVSCodeRecents) {
			return this._resolveStored(own);
		}

		const ownUris = new Set(own.map(o => this.uriIdentityService.extUri.getComparisonKey(URI.revive(o.uri))));
		const vsCode = this._vsCodeRecentFolderUris
			.filter(uri => !ownUris.has(this.uriIdentityService.extUri.getComparisonKey(uri)))
			.map(uri => ({ uri: uri.toJSON(), providerId: undefined, checked: false }) satisfies IStoredRecentWorkspace);

		return this._resolveStored([...own, ...vsCode]);
	}

	async getWorkspaceToRestore(): Promise<IRecentWorkspace | undefined> {
		await this._initialRecentWorkspacesRefresh;

		const lastRequestWorkspace = this._getLastRequestWorkspace();
		const hasSentRequest = this.storageService.getBoolean(STORAGE_KEY_HAS_SENT_REQUEST, StorageScope.PROFILE, false);
		const vsCodeCandidates = this._vsCodeRecentFolderUris.map(uri => ({ uri: uri.toJSON(), providerId: undefined, checked: false }));
		let candidates: IStoredRecentWorkspace[];
		if (lastRequestWorkspace) {
			candidates = [lastRequestWorkspace, ...this._excludeDuplicateCandidates(vsCodeCandidates, [lastRequestWorkspace])];
		} else if (!hasSentRequest && this.storageService.getNumber(LEGACY_TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0) > 0) {
			// Migrate existing profiles from the request counter used before semantic request-workspace storage.
			const own = this._getStoredRecentWorkspaces();
			const prioritizedOwn = [...own.filter(candidate => candidate.checked), ...own.filter(candidate => !candidate.checked)];
			candidates = [...prioritizedOwn, ...this._excludeDuplicateCandidates(vsCodeCandidates, prioritizedOwn)];
		} else {
			candidates = vsCodeCandidates;
		}

		for (const candidate of candidates) {
			const folderUri = URI.revive(candidate.uri);
			if (!await this.isExistingWorkspace(folderUri)) {
				continue;
			}
			const resolved = this._resolveWorkspace(folderUri, candidate.providerId);
			if (resolved) {
				return { workspace: resolved.workspace, providerId: resolved.providerId, checked: candidate.checked };
			}
		}
		return undefined;
	}

	private _excludeDuplicateCandidates(candidates: IStoredRecentWorkspace[], existing: IStoredRecentWorkspace[]): IStoredRecentWorkspace[] {
		const existingKeys = new Set(existing.map(candidate => this.uriIdentityService.extUri.getComparisonKey(URI.revive(candidate.uri))));
		return candidates.filter(candidate => !existingKeys.has(this.uriIdentityService.extUri.getComparisonKey(URI.revive(candidate.uri))));
	}

	private _resolveStored(stored: readonly IStoredRecentWorkspace[]): IRecentWorkspace[] {
		const recents: IRecentWorkspace[] = [];
		for (const entry of stored) {
			const resolved = this._resolveWorkspace(URI.revive(entry.uri), entry.providerId);
			if (resolved) {
				recents.push({ workspace: resolved.workspace, providerId: resolved.providerId, checked: entry.checked });
			}
		}
		return recents;
	}

	addRecentWorkspace(folderUri: URI, providerId: string | undefined, checked: boolean): void {
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
		this._persistRecentWorkspaces(updated);
	}

	removeRecentWorkspace(folderUri: URI): void {
		const recents = this._getStoredRecentWorkspaces();
		const updated = recents.filter(p => !this.uriIdentityService.extUri.isEqual(URI.revive(p.uri), folderUri));
		if (updated.length !== recents.length) {
			this._persistRecentWorkspaces(updated);
		}
		this.workspacesService.removeRecentlyOpened([folderUri]);
	}

	clearCheckedWorkspace(): void {
		const recents = this._getStoredRecentWorkspaces();
		const updated = recents.map(p => ({ ...p, checked: false }));
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
		const recentlyOpened = await this.workspacesService.getRecentlyOpened();
		this._vsCodeRecentFolderUris = recentlyOpened.workspaces
			.filter(isRecentFolder)
			.map(f => f.folderUri)
			.filter(uri => !basename(uri).startsWith('copilot-'))
			.filter(uri => !hasWorktreesPathSegment(uri))
			.slice(0, MAX_VSCODE_RECENT_WORKSPACES);
		this._onDidChangeRecentWorkspaces.fire();
	}

	async isExistingWorkspace(folderUri: URI): Promise<boolean> {
		try {
			const stat = await this.fileService.stat(folderUri);
			if (stat.isDirectory) {
				return true;
			}
			this.removeRecentWorkspace(folderUri);
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				this.removeRecentWorkspace(folderUri);
			}
		}
		return false;
	}

	private _getLastRequestWorkspace(): IStoredRecentWorkspace | undefined {
		const raw = this.storageService.get(STORAGE_KEY_LAST_REQUEST_WORKSPACE, StorageScope.PROFILE);
		if (!raw) {
			return undefined;
		}
		try {
			return JSON.parse(raw) as IStoredRecentWorkspace;
		} catch {
			return undefined;
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
