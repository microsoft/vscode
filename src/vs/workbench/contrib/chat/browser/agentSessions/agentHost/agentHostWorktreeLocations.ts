/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { basename, extUriBiasedIgnorePathCase, normalizePath, removeTrailingPathSeparator } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatSessionsService, isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { IAgentSession } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';

/** The id of the provider of the worktrees that the local agent host's sessions work in. */
export const AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID = 'agentHost.sessionWorktrees';

/**
 * The worktrees of the local folder `folder` that the local agent host's `sessions` work in, without duplicates: the working
 * directories of the sessions whose project, as the agent host resolves it with git (the primary worktree's root), is
 * `folder`, other than `folder` itself and the folders inside it. Archived sessions, those of other providers and those
 * without a project are left out. Each is described by the branch the session reports, as far as it does.
 *
 * `folder` is any of the forms of the one folder, such as the path the window opened and its real path: git, and so the
 * project, names a folder by its real path, such as `/private/tmp/x` of `/tmp/x` on macOS.
 *
 * `localSessionTypes`, where given, are the session types of the window's local agent host, which alone count: an
 * extension can register a session type of the same form (`agent-host-…`) with sessions of its own.
 */
export function getAgentHostSessionWorktrees(sessions: readonly IAgentSession[], folder: URI | readonly URI[], localSessionTypes?: ReadonlySet<string>): IFolderLocation[] {
	const forms = (URI.isUri(folder) ? [folder] : folder).filter(form => form.scheme === Schemas.file).map(form => removeTrailingPathSeparator(normalizePath(form)));
	if (!forms.length) {
		return [];
	}
	const result: IFolderLocation[] = [];
	for (const session of sessions) {
		const workingDirectory = toFolder(session.metadata?.workingDirectoryPath);
		const project = toFolder(session.metadata?.projectPath);
		if (!(localSessionTypes ? localSessionTypes.has(session.providerType) : isLocalAgentHostTarget(session.providerType)) || session.isArchived() || !workingDirectory || !project
			|| !forms.some(form => extUriBiasedIgnorePathCase.isEqual(project, form))
			// The folder itself, or a folder inside it, is no location of it
			|| forms.some(form => extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, form))
			|| result.some(location => extUriBiasedIgnorePathCase.isEqual(location.uri, workingDirectory))) {
			continue;
		}
		const branch = session.metadata?.branchName;
		result.push({ uri: workingDirectory, label: basename(workingDirectory), description: typeof branch === 'string' && branch ? branch : undefined, icon: Codicon.gitBranchCheckout });
	}
	return result;
}

function toFolder(path: unknown): URI | undefined {
	return typeof path === 'string' && path ? removeTrailingPathSeparator(normalizePath(URI.file(path))) : undefined;
}

/**
 * The alternate locations of a local folder that its agent host sessions know: the worktrees that sessions work in whose
 * agent host project is the folder ({@link getAgentHostSessionWorktrees}). It reads no git data: the agent host decides with
 * git what a session's project is, so a location inherits the folder's trust on its word. It reads only the folder's real
 * path, once for each folder, as git names the project by it. There is no discovery of the repository's worktrees.
 */
export class AgentHostWorktreeLocationProvider extends Disposable implements IWorkspaceFolderLocationProvider {

	readonly id = AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID;

	/** The local agent host providers whose sessions the sessions list has resolved. */
	private readonly _resolvedProviders = new Set<string>();

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
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
	) {
		super();
		this._register(toDisposable(() => this._lifetime.dispose(true)));
		this._register(_agentSessionsService.model.onDidResolve(provider => {
			if (this._localSessionTypes().has(provider)) {
				this._resolvedProviders.add(provider);
				// Its sessions are known: a location unknown before them can be resolved now
				this._onDidChangeLocations.fire();
			}
		}));
		this._register(_chatSessionsService.onDidChangeItemsProviders(({ chatSessionType }) => {
			if (this._localSessionTypes().has(chatSessionType)) {
				this._onDidChangeLocations.fire();
			}
		}));
		// The local agent host's agents, whose sessions alone count, as it lists them
		this._register(_agentHostService.rootState.onDidChange(() => {
			this._checkOffered();
			this._onDidChangeLocations.fire();
		}));
		this._register(_agentSessionsService.model.onDidChangeSessions(() => this._checkOffered()));
		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => this._retireFolders()));
		this._register(_workspaceContextService.onDidChangeWorkbenchState(() => this._retireFolders()));
	}

	/**
	 * The worktrees of `primary` among the sessions the sessions list has now: cheap, as it is asked at every start. It does
	 * not wait for the sessions or the folder's real path: what they make known follows with {@link onDidChangeLocations}.
	 */
	async provideLocations(primary: URI, _token: CancellationToken): Promise<IFolderLocation[]> {
		const locations = getAgentHostSessionWorktrees(this._agentSessionsService.model.sessions, this.getFolderForms(primary), this._localSessionTypes());
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
	 * `location` as a worktree of `primary`, once the sessions of a local agent host that the window has are known: also
	 * before the sessions list first resolves them. Unknown where the window has no local agent host's sessions, where
	 * `token` is cancelled, and once the provider is disposed: it never waits on what may not come.
	 */
	async resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IFolderLocation | undefined> {
		const cts = new CancellationTokenSource(token);
		const lifetime = this._lifetime.token.onCancellationRequested(() => cts.cancel());
		try {
			const forms = await raceCancellation(this._formsOf(primary), cts.token);
			if (!forms) {
				return undefined;
			}
			const target = removeTrailingPathSeparator(normalizePath(location));
			const find = () => getAgentHostSessionWorktrees(this._agentSessionsService.model.sessions, forms, this._localSessionTypes()).find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate.uri, target));
			const found = find();
			if (found) {
				return found;
			}
			// Only the local agent host providers the window has, which list their sessions as they resolve
			const localSessionTypes = this._localSessionTypes();
			const unresolved = this._chatSessionsService.getRegisteredChatSessionItemProviders().filter(provider => localSessionTypes.has(provider) && !this._resolvedProviders.has(provider));
			if (!unresolved.length) {
				return undefined;
			}
			await raceCancellation(this._agentSessionsService.model.resolve(unresolved, undefined, 'automatic'), cts.token);
			return cts.token.isCancellationRequested ? undefined : find();
		} finally {
			lifetime.dispose();
			cts.dispose();
		}
	}

	/**
	 * Fires once where the worktrees of any folder asked about are not those last offered. By the forms of each folder known
	 * now, without reading any: a real path that could not be read is read again only as the folder is asked about again.
	 */
	private _checkOffered(): void {
		if (this._store.isDisposed) {
			return;
		}
		let changed = false;
		for (const [folder, offered] of this._offered) {
			const now = offeredKey(getAgentHostSessionWorktrees(this._agentSessionsService.model.sessions, this._knownForms.get(folder) ?? [folder], this._localSessionTypes()));
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

	/**
	 * The session types of the window's local agent host: one for each of its agents (`agent-host-<provider>`, as its session
	 * list registers them), none until it reports them. Not a session type of the same form that an extension registers.
	 */
	private _localSessionTypes(): ReadonlySet<string> {
		const rootState = this._agentHostService.rootState.value;
		return new Set(rootState && !(rootState instanceof Error) ? rootState.agents.map(agent => `agent-host-${agent.provider}`) : []);
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
