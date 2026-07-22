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
import { ISessionWorkspace } from '../common/session.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';

const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';
const MAX_RECENT_WORKSPACES = 10;
const MAX_VSCODE_RECENT_WORKSPACES = 10;

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

	/** The recently used folders, resolved and most recent first: own history first, then VS Code's recents (deduplicated). */
	getRecentWorkspaces(): IRecentWorkspace[];

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

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._refreshVSCodeRecentWorkspaces();
		this._register(this.workspacesService.onDidChangeRecentlyOpened(() => this._refreshVSCodeRecentWorkspaces()));
	}

	getRecentWorkspaces(): IRecentWorkspace[] {
		const own = this._getStoredRecentWorkspaces();
		const ownUris = new Set(own.map(o => this.uriIdentityService.extUri.getComparisonKey(URI.revive(o.uri))));
		const vsCode = this._vsCodeRecentFolderUris
			.filter(uri => !ownUris.has(this.uriIdentityService.extUri.getComparisonKey(uri)))
			.map(uri => ({ uri: uri.toJSON(), providerId: undefined, checked: false }) satisfies IStoredRecentWorkspace);

		const recents: IRecentWorkspace[] = [];
		for (const stored of [...own, ...vsCode]) {
			const resolved = this._resolveWorkspace(URI.revive(stored.uri), stored.providerId);
			if (resolved) {
				recents.push({ workspace: resolved.workspace, providerId: resolved.providerId, checked: stored.checked });
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
			.slice(0, MAX_VSCODE_RECENT_WORKSPACES);
		this._onDidChangeRecentWorkspaces.fire();
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
