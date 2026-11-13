/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, IReader, observableSignal } from '../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { getRepositoryRootFromWorktree } from '../../../../platform/agentHost/common/worktreePaths.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession } from '../../../services/sessions/common/session.js';
import { ISessionChangeEvent, ISessionsListingScope } from '../common/sessionsProvider.js';

/** Whether `uri` is on GitHub (`github-remote-file://github/<owner>/<repo>/<branch>/...`) in one of `repositories`. */
function isGitHubRepositoryOf(uri: URI, repositories: ReadonlySet<string>): boolean {
	if (!repositories.size || uri.scheme !== GITHUB_REMOTE_FILE_SCHEME || uri.authority !== 'github') {
		return false;
	}
	const [owner, repo] = uri.path.split('/').filter(segment => segment.length > 0);
	return !!owner && !!repo && repositories.has(`${owner}/${repo}`.toLowerCase());
}

/** Whether `workingDirectory` is a worktree that VS Code created for one of `repositories`, by its path. */
function isWorktreeOf(workingDirectory: URI, repositories: ResourceSet): boolean {
	const repository = workingDirectory.scheme === Schemas.file ? getRepositoryRootFromWorktree(workingDirectory) : undefined;
	return !!repository && repositories.has(repository);
}

/**
 * The sessions a provider lists in a {@link ISessionsListingScope}, out of all of its sessions, and their changes. It follows
 * the scope, the provider's changes and the sessions' workspaces, such as one that hydrates into the scope.
 *
 * A session that leaves the scope is reported as changed, not removed, as when its provider goes away: a removal means a
 * deletion to consumers, which clean up after it. Removals of the provider's sessions are always reported, also of those
 * the scope hides, as consumers can show them by their resource.
 */
export class SessionsListingScopeFilter extends Disposable {

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	private _listed = new Map<string, ISession>();
	/** Every session as of the last match to the scope, which the scope follows: a different object of an ID, such as a replacement, is matched again. */
	private _known = new Map<string, ISession>();
	private _initialized = false;
	private readonly _pendingChanges: ISessionChangeEvent[] = [];
	private readonly _allSessionsChanged = observableSignal(this);

	constructor(
		scope: ISessionsListingScope,
		getAllSessions: () => ISession[],
		onDidChangeAllSessions: Event<ISessionChangeEvent>,
	) {
		super();

		this._register(onDidChangeAllSessions(e => {
			if (this._initialized && !this._pendingChanges.length && !e.added.length && !e.removed.length && e.changed.length && e.changed.every(session => this._known.get(session.sessionId) === session)) {
				// Changes of sessions only, such as of their status as they stream: what they are listed by, their workspaces,
				// the scope follows itself, so the sessions it lists stay as they are
				const changed = e.changed.flatMap(session => this._listed.get(session.sessionId) ?? []);
				if (changed.length) {
					this._onDidChangeSessions.fire({ added: [], removed: [], changed });
				}
				return;
			}
			this._pendingChanges.push(e);
			this._allSessionsChanged.trigger(undefined);
		}));
		this._register(autorun(reader => {
			this._allSessionsChanged.read(reader);
			const folders = scope.folders.read(reader);
			const repositories = scope.repositories.read(reader);
			const gitHubRepositories = scope.gitHubRepositories?.read(reader) ?? [];
			const sessions = getAllSessions();
			this._known = new Map(sessions.map(session => [session.sessionId, session]));
			const inScope = folders.length ? this._getSessionsInScope(sessions, folders, reader, repositories, gitHubRepositories) : undefined;
			const listed = new Map<string, ISession>();
			for (const session of sessions) {
				if (!inScope || inScope.has(session)) {
					listed.set(session.sessionId, session);
				}
			}
			this._update(listed, this._pendingChanges.splice(0));
		}));
	}

	/**
	 * Matches every session to the scope again, at once. A provider that replaces a session, such as a draft that graduates
	 * into the session it committed, can drop the one it replaced without a change: it calls this before it reports the
	 * replacement, so that who learns of the replacement finds the sessions the scope lists as they are now.
	 */
	rematch(): void {
		this._pendingChanges.push({ added: [], removed: [], changed: [] });
		this._allSessionsChanged.trigger(undefined);
	}

	/**
	 * The `sessions` in the scope of `scopeFolders`, such as the folders of an editor window's workspace: the sessions with
	 * a folder that is, or is inside, a scope folder, and the sessions of the same git repositories, such as its worktrees.
	 * Only the metadata the providers already report is read, comparing whole URIs, so a session of another host never
	 * matches a local folder. A repository is known from a scope folder itself, from a session working in the scope, from
	 * `scopeRepositories`, and from the path of a worktree that VS Code created (`<repository>.worktrees/<name>`), as the
	 * Agent Host names it: for an opened worktree, also before any session works in it, and for sessions whose provider
	 * has not reported their repository yet. `scopeRepositories` are the repositories the scope folders are
	 * known to be checkouts of, such as the main checkout of an open worktree. `scopeGitHubRepositories`, as lowercase
	 * `owner/repo`, are the GitHub repositories of their `origin`: a session working in one of them on GitHub, on any branch,
	 * such as a Copilot Cloud session, is in the scope too. A workspace-less quick chat, by its own `isQuickChat` flag, is in
	 * every scope: a session whose workspace is not known yet is not, as it may still hydrate into another folder. The
	 * result follows the sessions' workspaces and quick-chat flags through `reader`.
	 */
	private _getSessionsInScope(sessions: readonly ISession[], scopeFolders: readonly URI[], reader: IReader, scopeRepositories: readonly URI[], scopeGitHubRepositories: readonly string[]): ReadonlySet<ISession> {
		const extUri = extUriBiasedIgnorePathCase;
		const gitHubRepositories = new Set(scopeGitHubRepositories.map(repository => repository.toLowerCase()));
		const isInScope = (uri: URI | undefined) => !!uri && (scopeFolders.some(folder => extUri.isEqualOrParent(uri, folder)) || isGitHubRepositoryOf(uri, gitHubRepositories));
		const repositories = new ResourceSet([...scopeFolders, ...scopeRepositories], uri => extUri.getComparisonKey(uri));
		for (const scopeFolder of scopeFolders) {
			const repository = scopeFolder.scheme === Schemas.file ? getRepositoryRootFromWorktree(scopeFolder) : undefined;
			if (repository) {
				repositories.add(repository);
			}
		}
		const included = new Set<ISession>();
		for (const session of sessions) {
			if (session.isQuickChat?.read(reader)) {
				included.add(session);
				continue;
			}
			for (const folder of session.workspace.read(reader)?.folders ?? []) {
				if (isInScope(folder.workingDirectory) || isInScope(folder.root) || isInScope(folder.gitRepository?.workTreeUri)) {
					included.add(session);
					if (folder.gitRepository) {
						repositories.add(folder.gitRepository.uri);
					}
				}
			}
		}
		for (const session of sessions) {
			if (!included.has(session) && session.workspace.read(reader)?.folders.some(folder => repositories.has(folder.root) || (!!folder.gitRepository && repositories.has(folder.gitRepository.uri)) || isWorktreeOf(folder.workingDirectory, repositories))) {
				included.add(session);
			}
		}
		return included;
	}

	/** The sessions the scope lists. */
	getSessions(): ISession[] {
		return [...this._listed.values()];
	}

	/**
	 * Reports how the sessions it lists differ from `previous`, those listed before it, such as without a scope or in an
	 * earlier one: a session it lists that was not listed as added, and one no longer listed as changed, as when it leaves
	 * the scope.
	 */
	announceFrom(previous: readonly ISession[]): void {
		const previousIds = new Set(previous.map(session => session.sessionId));
		const added = [...this._listed.values()].filter(session => !previousIds.has(session.sessionId));
		const changed = previous.filter(session => !this._listed.has(session.sessionId));
		if (added.length || changed.length) {
			this._onDidChangeSessions.fire({ added, removed: [], changed });
		}
	}

	private _update(listed: Map<string, ISession>, changes: readonly ISessionChangeEvent[]): void {
		const previous = this._listed;
		this._listed = listed;
		if (!this._initialized) {
			this._initialized = true;
			return;
		}

		const added = new Map<string, ISession>();
		const removed = new Map<string, ISession>();
		const changed = new Map<string, ISession>();
		for (const change of changes) {
			for (const session of change.removed) {
				if (!listed.has(session.sessionId)) {
					removed.set(session.sessionId, session);
				}
			}
			for (const session of change.added) {
				const listedSession = listed.get(session.sessionId);
				if (listedSession) {
					added.set(session.sessionId, listedSession);
				}
			}
		}
		for (const [sessionId, session] of listed) {
			if (!previous.has(sessionId)) {
				added.set(sessionId, session);
			}
		}
		for (const [sessionId, session] of previous) {
			if (!listed.has(sessionId) && !removed.has(sessionId)) {
				changed.set(sessionId, session);
			}
		}
		for (const change of changes) {
			for (const session of change.changed) {
				const listedSession = listed.get(session.sessionId);
				if (listedSession && !added.has(session.sessionId)) {
					changed.set(session.sessionId, listedSession);
				}
			}
		}
		if (added.size || removed.size || changed.size) {
			this._onDidChangeSessions.fire({ added: [...added.values()], removed: [...removed.values()], changed: [...changed.values()] });
		}
	}
}
