/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISession, ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { isWorktreeWorkspaceUri } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';

const MAX_RECENT_SESSIONS = 15;

/** A workspace resolved by the provider that can create a session for it. */
export interface IResolvedFolderWorkspace {
	readonly providerId: string;
	readonly workspace: ISessionWorkspace;
}

/** Callbacks that keep provider-specific picker policy outside the fallback. */
export interface ISessionWorkspaceFallbackOptions {
	readonly canUseProvider: (providerId: string) => boolean;
	readonly isProviderUnavailable: (providerId: string) => boolean;
	readonly resolveWorkspace: (folderUri: URI, preferredProviderId: string) => IResolvedFolderWorkspace | undefined;
}

interface ISessionWorkspaceCandidate {
	readonly folderUri: URI;
	readonly providerId: string;
	readonly count: number;
	readonly firstIndex: number;
}

/** Finds an existing workspace from the most recently updated provider sessions. */
export class SessionWorkspaceFallback extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _providerListeners = this._register(new DisposableStore());

	constructor(
		private readonly options: ISessionWorkspaceFallbackOptions,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();
		this.refreshProviders();
	}

	refreshProviders(): void {
		this._providerListeners.clear();
		for (const provider of this.sessionsProvidersService.getProviders()) {
			if (this.options.canUseProvider(provider.id)) {
				this._providerListeners.add(provider.onDidChangeSessions(() => this._onDidChange.fire()));
			}
		}
	}

	/** Returns the highest-ranked existing workspace among recent sessions. */
	async findWorkspace(): Promise<IResolvedFolderWorkspace | undefined> {
		const sessions = this.sessionsProvidersService.getProviders()
			.filter(provider => this.options.canUseProvider(provider.id))
			.flatMap(provider => provider.getSessions())
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime())
			.slice(0, MAX_RECENT_SESSIONS);
		const candidates = this._rankCandidates(sessions);

		for (const candidate of candidates) {
			const resolved = this.options.resolveWorkspace(candidate.folderUri, candidate.providerId);
			if (!resolved
				|| !this.options.canUseProvider(resolved.providerId)
				|| this.options.isProviderUnavailable(resolved.providerId)
				|| !this.fileService.hasProvider(candidate.folderUri)) {
				continue;
			}
			if (await this.fileService.exists(candidate.folderUri)) {
				return resolved;
			}
		}
		return undefined;
	}

	private _rankCandidates(sessions: readonly ISession[]): ISessionWorkspaceCandidate[] {
		const candidates = new Map<string, ISessionWorkspaceCandidate>();
		for (let index = 0; index < sessions.length; index++) {
			const session = sessions[index];
			const folderUri = this._getWorkspaceFolder(session);
			if (!folderUri) {
				continue;
			}
			const key = this.uriIdentityService.extUri.getComparisonKey(folderUri);
			const candidate = candidates.get(key);
			candidates.set(key, candidate
				? { ...candidate, count: candidate.count + 1 }
				: { folderUri, providerId: session.providerId, count: 1, firstIndex: index });
		}
		return [...candidates.values()].sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex);
	}

	private _getWorkspaceFolder(session: ISession): URI | undefined {
		if (session.isQuickChat?.get() || session.worktreePending?.get()) {
			return undefined;
		}
		const folder = session.workspace.get()?.folders[0];
		if (folder?.gitRepository?.workTreeUri) {
			return undefined;
		}
		const folderUri = folder?.root;
		return folderUri && !isWorktreeWorkspaceUri(folderUri) ? folderUri : undefined;
	}
}
