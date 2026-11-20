/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { basename, extUriBiasedIgnorePathCase, normalizePath, removeTrailingPathSeparator } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { localize } from '../../../../../../nls.js';
import { readSessionSummaryBranchName } from './agentHostSessionListController.js';
import { AgentHostSessionListStore } from './agentHostSessionListStore.js';

/** The id of the provider of the worktrees that the local agent host's sessions work in. */
export const AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID = 'agentHost.sessionWorktrees';

/**
 * The worktrees of the local folder `folder` that the local agent host's `sessions` work in, without duplicates: the working
 * directories of the sessions whose project, as the agent host resolves it with git (the primary worktree's root), is
 * `folder`, other than `folder` itself and the folders inside it. Archived sessions and those without a project are left
 * out. Each is described by the branch the session reports, as far as it does.
 *
 * `sessions` are the agent host's own session summaries, as it lists them: never of the shared sessions model, which
 * extensions also feed, as a location inherits the folder's trust.
 *
 * `folder` is any of the forms of the one folder, such as the path the window opened and its real path: git, and so the
 * project, names a folder by its real path, such as `/private/tmp/x` of `/tmp/x` on macOS.
 */
export function getAgentHostSessionWorktrees(sessions: readonly SessionSummary[], folder: URI | readonly URI[]): IFolderLocation[] {
	const forms = (URI.isUri(folder) ? [folder] : folder).filter(form => form.scheme === Schemas.file).map(form => removeTrailingPathSeparator(normalizePath(form)));
	if (!forms.length) {
		return [];
	}
	const result: IFolderLocation[] = [];
	for (const session of sessions) {
		const workingDirectory = toFolder(session.workingDirectories?.[0]);
		const project = toFolder(session.project?.uri);
		if ((session.status & SessionStatus.IsArchived) === SessionStatus.IsArchived || !workingDirectory || !project
			|| !forms.some(form => extUriBiasedIgnorePathCase.isEqual(project, form))
			// The folder itself, or a folder inside it, is no location of it
			|| forms.some(form => extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, form))
			|| result.some(location => extUriBiasedIgnorePathCase.isEqual(location.uri, workingDirectory))) {
			continue;
		}
		const branch = readSessionSummaryBranchName(session);
		result.push({ uri: workingDirectory, label: basename(workingDirectory), description: branch || undefined, icon: Codicon.gitBranchCheckout });
	}
	return result;
}

function toFolder(uri: string | undefined): URI | undefined {
	const folder = uri ? URI.parse(uri) : undefined;
	return folder?.scheme === Schemas.file ? removeTrailingPathSeparator(normalizePath(folder)) : undefined;
}

/**
 * The alternate locations of a local folder that its agent host sessions know: the worktrees that sessions work in whose
 * agent host project is the folder ({@link getAgentHostSessionWorktrees}). It reads no git data: the agent host decides with
 * git what a session's project is, so a location inherits the folder's trust on its word. It reads only the folder's real
 * path, once for each folder, as git names the project by it. There is no discovery of the repository's worktrees.
 */
export class AgentHostWorktreeLocationProvider extends Disposable implements IWorkspaceFolderLocationProvider {

	readonly id = AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID;
	/** Its locations are worktrees of the folder, which pickers group under this name. */
	readonly label = localize('agentHost.worktreeLocations.label', "Worktrees");

	/**
	 * The local agent host's own sessions, as it lists them and tells of their changes: all of them, not only those of the
	 * workspace's folders as the sessions list has, as a worktree is outside its folder. Started as a folder is first asked
	 * about while the agent host is enabled.
	 */
	private readonly _sessions = this._register(new MutableDisposable<AgentHostSessionListStore>());
	/** Whether {@link _sessions} has listed the agent host's sessions. */
	private _listed = false;

	/**
	 * The forms of each folder asked about: as given, and its real path, read once. Like {@link _knownForms} and
	 * {@link _offered}, only for the folders of the current workspace ({@link _isWorkspaceFolder}): another folder is answered
	 * without keeping anything of it.
	 */
	private readonly _forms = new ResourceMap<Promise<readonly URI[]>>(folderKey);
	/** The forms of the folders whose real path is read. */
	private readonly _knownForms = new ResourceMap<readonly URI[]>(folderKey);
	/** The worktrees last offered for each folder asked about, as compared to tell whether they changed. */
	private readonly _offered = new ResourceMap<string>(folderKey);

	/** Cancelled as the provider is disposed: what it still waits for, it no longer does. */
	private readonly _lifetime = new CancellationTokenSource();

	private readonly _onDidChangeLocations = this._register(new Emitter<void>());
	/**
	 * Fires as the worktrees of a folder asked about change: as sessions load, start, are archived or deleted, or work, or
	 * report a branch, elsewhere; as the folder's real path is known to differ, which can make more of them known; and as a
	 * local agent host's sessions become available, so that a location that was unknown can be resolved again.
	 */
	readonly onDidChangeLocations = this._onDidChangeLocations.event;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._register(toDisposable(() => this._lifetime.dispose(true)));
		this._register(autorun(reader => {
			if (!this._agentHostEnablementService.enabled.read(reader) && this._sessions.value) {
				this._sessions.clear();
				this._listed = false;
				this._checkOffered();
			}
		}));
		// The agents the local agent host has, whose sessions alone count, change; as it starts, any can have changed
		// As the agents it has change, such as as it starts or stops, not as the rest of its state does, such as its terminals
		let agents = this._advertisedAgents();
		this._register(_agentHostService.rootState.onDidChange(() => {
			const previous = agents;
			agents = this._advertisedAgents();
			// Only as its agents change, such as as it becomes available: then the folders asked about can have worktrees among
			// the sessions of the agents it has now, which it lists where it has not, such as after a listing that failed
			if (agents !== previous) {
				this._checkOffered(this._offered.size > 0);
				this._onDidChangeLocations.fire();
			}
		}));
		this._register(_agentHostService.onAgentHostStart(() => {
			if (this._sessions.value) {
				this._listed = false;
				this._sessions.value.resetCache();
				this._list(this._sessions.value);
			}
		}));
		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => this._retireFolders()));
		this._register(_workspaceContextService.onDidChangeWorkbenchState(() => this._retireFolders()));
	}

	/**
	 * The worktrees of `primary` among the local agent host's sessions known now: cheap, as it is asked at every start. It
	 * does not wait for the sessions or the folder's real path: what they make known follows with {@link onDidChangeLocations}.
	 */
	async provideLocations(primary: URI, _token: CancellationToken): Promise<IFolderLocation[]> {
		// The local agent host's worktrees are local folders: a folder of a remote window has none, nor asks it for any
		if (primary.scheme !== Schemas.file) {
			return [];
		}
		const locations = getAgentHostSessionWorktrees(this._localSessions(), this.getFolderForms(primary));
		if (this._isWorkspaceFolder(primary)) {
			this._offered.set(primary, offeredKey(locations));
		}
		return locations;
	}

	/**
	 * The forms of `folder` known now: itself, and its real path where it differs, once read. For a folder of the workspace,
	 * the first ask starts reading it, and {@link onDidChangeLocations} fires once it is known to differ, such as for a folder
	 * reached through a symbolic link; another folder is itself only.
	 */
	getFolderForms(folder: URI): readonly URI[] {
		const forms = this._knownForms.get(folder);
		if (!forms && this._isWorkspaceFolder(folder)) {
			void this._formsOf(folder);
		}
		return forms ?? [folder];
	}

	/**
	 * `location` as a worktree of `primary`, once the local agent host's sessions are listed: also before anything else asks
	 * for them, such as to restore the folder's location. Unknown where the window has no local agent host, or it has not
	 * started, where `token` is cancelled, and once the provider is disposed: it never waits on what may not come.
	 */
	async resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IFolderLocation | undefined> {
		if (primary.scheme !== Schemas.file) {
			return undefined;
		}
		const cts = new CancellationTokenSource(token);
		const lifetime = this._lifetime.token.onCancellationRequested(() => cts.cancel());
		try {
			const forms = await raceCancellation(this._formsOf(primary), cts.token);
			if (!forms) {
				return undefined;
			}
			const target = removeTrailingPathSeparator(normalizePath(location));
			const find = () => getAgentHostSessionWorktrees(this._localSessions(), forms).find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate.uri, target));
			const found = find();
			if (found) {
				return found;
			}
			const sessions = this._sessions.value;
			if (!sessions) {
				return undefined;
			}
			await raceCancellation(sessions.refresh(cts.token), cts.token);
			return cts.token.isCancellationRequested ? undefined : find();
		} finally {
			lifetime.dispose();
			cts.dispose();
		}
	}

	/**
	 * The sessions of the agents the local agent host has, as it lists them: none where it is disabled or has not reported
	 * its agents. Where `list`, as a folder is asked about, starts listing them where they are not listed yet, such as after a
	 * listing that failed, which {@link onDidChangeLocations} follows.
	 */
	private _localSessions(list = true): SessionSummary[] {
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error || !this._agentHostEnablementService.enabled.get() || this._store.isDisposed) {
			return [];
		}
		let sessions = this._sessions.value;
		if (!sessions) {
			const created = this._instantiationService.createInstance(AgentHostSessionListStore, this._agentHostService, { filterToWorkspace: false });
			this._sessions.value = sessions = created;
			created.onDidChangeSessions(() => this._checkOffered(), undefined, this._store);
		}
		// Lists them where it has not yet, such as after a listing that failed: once listed, the store keeps them
		if (list && !sessions.isListed) {
			this._list(sessions);
		}
		return rootState.agents.flatMap(agent => sessions.getSessions(agent.provider).map(entry => entry.summary));
	}

	/**
	 * Lists the agent host's sessions, at most once at a time: once listed, a location unknown before them can be resolved.
	 * A listing that fails leaves them unlisted, to be listed as the next ask does.
	 */
	private _list(sessions: AgentHostSessionListStore): void {
		void sessions.refresh(CancellationToken.None).then(() => {
			if (this._sessions.value === sessions && sessions.isListed && !this._listed) {
				this._listed = true;
				this._onDidChangeLocations.fire();
			}
		});
	}

	/**
	 * Fires once where the worktrees of any folder asked about are not those last offered. By the forms of each folder known
	 * now, without reading any: a real path that could not be read is read again only as the folder is asked about again.
	 * Where `list`, it lists the agent host's sessions where they are not listed yet.
	 */
	private _checkOffered(list = false): void {
		if (this._store.isDisposed) {
			return;
		}
		let changed = false;
		for (const [folder, offered] of this._offered) {
			const now = offeredKey(getAgentHostSessionWorktrees(this._localSessions(list), this._knownForms.get(folder) ?? [folder]));
			if (now !== offered) {
				this._offered.set(folder, now);
				changed = true;
			}
		}
		if (changed) {
			this._onDidChangeLocations.fire();
		}
	}

	/**
	 * `folder`, and its real path where it differs, such as of a folder reached through a symbolic link: read once for each
	 * folder of the workspace, and each time for another folder, of which nothing is kept.
	 */
	private _formsOf(folder: URI): Promise<readonly URI[]> {
		let forms = this._forms.get(folder);
		if (!forms) {
			const keep = this._isWorkspaceFolder(folder);
			forms = folder.scheme !== Schemas.file ? Promise.resolve([folder]) : this._fileService.realpath(folder).then(
				real => {
					const known = real && !extUriBiasedIgnorePathCase.isEqual(real, folder) ? [folder, real] : [folder];
					// Not for a folder retired meanwhile, nor once disposed
					if (keep && this._forms.get(folder) === forms && !this._store.isDisposed) {
						this._knownForms.set(folder, known);
						if (known.length > 1) {
							this._checkOffered();
						}
					}
					return known;
				},
				() => {
					// Read again as the folder is asked about again, such as once the folder is there
					if (this._forms.get(folder) === forms) {
						this._forms.delete(folder);
					}
					return [folder];
				});
			if (keep) {
				this._forms.set(folder, forms);
			}
		}
		return forms;
	}

	/** The agents the local agent host reports, as a key that changes only as they do: none (`''`) before it reports them, or where it failed to. */
	private _advertisedAgents(): string {
		const rootState = this._agentHostService.rootState.value;
		return rootState && !(rootState instanceof Error) ? JSON.stringify(rootState.agents.map(agent => agent.provider).sort()) : '';
	}

	/** Whether `folder` is of the current workspace: its own location, or one of its folders. */
	private _isWorkspaceFolder(folder: URI): boolean {
		const workspace = this._workspaceContextService.getWorkspace();
		const key = folderKey(folder);
		return [workspace.uri, ...workspace.folders.map(candidate => candidate.uri)].some(uri => !!uri && folderKey(uri) === key);
	}

	/** Forgets the folders that are no longer the workspace's, as its folders change. */
	private _retireFolders(): void {
		for (const map of [this._forms, this._knownForms, this._offered] as ResourceMap<unknown>[]) {
			for (const [folder] of [...map]) {
				if (!this._isWorkspaceFolder(folder)) {
					map.delete(folder);
				}
			}
		}
	}
}

/** One folder however it is written: without `.` segments or a trailing separator, ignoring path case where the platform does. */
function folderKey(folder: URI): string {
	return extUriBiasedIgnorePathCase.getComparisonKey(removeTrailingPathSeparator(normalizePath(folder)));
}

function offeredKey(locations: readonly IFolderLocation[]): string {
	return JSON.stringify(locations.map(location => [location.uri.toString(), location.description]));
}
