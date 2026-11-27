/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, observableSignal } from '../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, IExtUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { GITHUB_REMOTE_FILE_SCHEME, IChat, ISession, ISessionFolder } from '../../../services/sessions/common/session.js';
import { ISessionChangeEvent, ISessionsListingScope } from '../common/sessionsProvider.js';

/** Whether `uri` is on GitHub (`github-remote-file://github/<owner>/<repo>/<branch>/...`) in one of `repositories`. */
function isGitHubRepositoryOf(uri: URI, repositories: ReadonlySet<string>): boolean {
	if (!repositories.size || uri.scheme !== GITHUB_REMOTE_FILE_SCHEME || uri.authority !== 'github') {
		return false;
	}
	const [owner, repo] = uri.path.split('/').filter(segment => segment.length > 0);
	return !!owner && !!repo && repositories.has(`${owner}/${repo}`.toLowerCase());
}

/**
 * Matches sessions to the scope of `scopeFolders`, such as the folders of an editor window: a session is in it when its main
 * chat's folder works in a scope folder, or when its root or git repository, its project, is a scope folder, such as a session
 * in a worktree of a scope folder's repository; not when its project is only inside a scope folder. A session belongs where
 * its main chat works: the folders its other chats add count only while the main chat has none. `scopeGitHubRepositories`,
 * as `owner/repo`, are the GitHub repositories of the scope folders' `origin`: a session working in one of them on GitHub, on
 * any branch, such as a Copilot Cloud session, is in the scope too. Only the metadata the providers report is read, comparing
 * whole URIs, so a session of another host never matches a local folder. A session without a workspace, such as a quick chat,
 * is in no scope. A session whose workspace is not known yet joins the scope once it hydrates into a scope folder; the results
 * follow the sessions' workspaces through the `reader` they are given.
 */
export class SessionScopeMatcher {

	private readonly gitHubRepositories: ReadonlySet<string>;

	constructor(
		private readonly scopeFolders: readonly URI[],
		scopeGitHubRepositories: readonly string[],
		private readonly extUri: IExtUri = extUriBiasedIgnorePathCase,
	) {
		this.gitHubRepositories = new Set(scopeGitHubRepositories.map(repository => repository.toLowerCase()));
	}

	/** The `sessions` in the scope. */
	getSessionsInScope(sessions: readonly ISession[], reader: IReader | undefined): ReadonlySet<ISession> {
		return new Set(sessions.filter(session => this.getScopingFolders(session, reader).some(folder => this.isFolderInScope(folder))));
	}

	/**
	 * The working directories by which {@link getSessionsInScope} places `sessions` in the scope, such as worktrees of its folders:
	 * those of the folders that match it, not the other folders of a session it places.
	 */
	getWorkingDirectoriesInScope(sessions: readonly ISession[], reader: IReader | undefined): URI[] {
		return sessions.flatMap(session => this.getScopingFolders(session, reader).filter(folder => this.isFolderInScope(folder)).map(folder => folder.workingDirectory));
	}

	private isFolderInScope(folder: ISessionFolder): boolean {
		return this.worksInScope(folder.workingDirectory) || this.isScopeFolder(folder.root) || this.isScopeFolder(folder.gitRepository?.uri);
	}

	private worksInScope(uri: URI): boolean {
		return this.scopeFolders.some(folder => this.extUri.isEqualOrParent(uri, folder)) || isGitHubRepositoryOf(uri, this.gitHubRepositories);
	}

	private isScopeFolder(uri: URI | undefined): boolean {
		return !!uri && (this.scopeFolders.some(folder => this.extUri.isEqual(uri, folder)) || isGitHubRepositoryOf(uri, this.gitHubRepositories));
	}

	/**
	 * The folders by which `session` is in a scope: every folder of its main chat's workspace while the main chat sets
	 * folders of its own (see {@link IChat.ownWorkingDirectories}). Otherwise the first folder of the main chat's workspace,
	 * the session's primary: the main chat then has the session's folders, in their order, with those its other chats added
	 * after it, which do not place the session. Every folder of the session counts while the main chat has none.
	 */
	private getScopingFolders(session: ISession, reader: IReader | undefined): readonly ISessionFolder[] {
		const mainChat = session.mainChat.read(reader);
		const mainChatWorkspace = mainChat.workspace.read(reader);
		if (mainChatWorkspace && mainChat.ownWorkingDirectories?.read(reader)?.length) {
			return mainChatWorkspace.folders;
		}
		const mainFolder = mainChatWorkspace?.folders[0];
		return mainFolder ? [mainFolder] : session.workspace.read(reader)?.folders ?? [];
	}
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
			const gitHubRepositories = scope.gitHubRepositories?.read(reader) ?? [];
			const sessions = getAllSessions();
			this._known = new Map(sessions.map(session => [session.sessionId, session]));
			const inScope = folders.length ? new SessionScopeMatcher(folders, gitHubRepositories).getSessionsInScope(sessions, reader) : undefined;
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
