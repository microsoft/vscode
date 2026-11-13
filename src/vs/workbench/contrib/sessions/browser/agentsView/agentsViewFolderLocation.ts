/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SESSION_WORKTREE_ICON } from '../../common/sessionWorktreeIcon.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { basename, dirname, extUriBiasedIgnorePathCase, joinPath, normalizePath } from '../../../../../base/common/resources.js';
import Severity from '../../../../../base/common/severity.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { getSessionPresentationWorkspace, ISession } from '../../../../services/sessions/common/session.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';

/** The id of the provider of the alternate locations that the Agents view knows: the linked checkouts of a folder. */
export const AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID = 'agentsView.linkedCheckouts';

/**
 * The alternate locations of a local folder that is a git repository: its linked checkouts (worktrees). A folder is one
 * only with both links of git's own bookkeeping: its `.git` file names `<primary>/.git/worktrees/<name>`, and that entry's
 * `gitdir` file names the folder's `.git` back. Its locations inherit the primary's trust, so a folder that only points
 * into the primary's worktrees is not one. A folder or link that is not there, or a `.git` folder of an ordinary checkout,
 * resolves to nothing; failing to read one throws.
 */
export class AgentsViewFolderLocationProvider implements IWorkspaceFolderLocationProvider {

	readonly id = AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async provideLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]> {
		if (primary.scheme !== Schemas.file) {
			return [];
		}
		const entries = await this._readOrUndefined(() => this._fileService.resolve(joinPath(primary, '.git', 'worktrees')));
		if (!entries?.children?.length) {
			return [];
		}
		const locations: IFolderLocation[] = [];
		// The primary's worktrees, resolved once for all of its entries
		const worktreesDir = await this._worktreesDir(primary);
		for (const entry of entries.children) {
			if (token.isCancellationRequested) {
				return [];
			}
			try {
				const gitFile = entry.isDirectory ? await this._readLink(joinPath(entry.resource, 'gitdir'), entry.resource) : undefined;
				const location = gitFile && basename(gitFile) === '.git' ? await this._resolveLocation(primary, worktreesDir, dirname(gitFile)) : undefined;
				if (location) {
					locations.push(location);
				}
			} catch (error) {
				// One worktree that fails to read, such as a pruned one, does not hide the others
				this._logService.warn(`[agentsView] could not read the worktree ${entry.resource.toString()}`, error);
			}
		}
		return token.isCancellationRequested ? [] : locations;
	}

	async resolveLocation(primary: URI, location: URI, _token: CancellationToken): Promise<IFolderLocation | undefined> {
		if (primary.scheme !== Schemas.file) {
			return undefined;
		}
		return this._resolveLocation(primary, await this._worktreesDir(primary), location);
	}

	/** Where the worktrees of `primary` are kept: `.git/worktrees` of its real path. */
	private async _worktreesDir(primary: URI): Promise<URI> {
		return joinPath(await this._real(primary), '.git', 'worktrees');
	}

	private async _resolveLocation(primary: URI, worktreesDir: URI, location: URI): Promise<IFolderLocation | undefined> {
		if (location.scheme !== Schemas.file || extUriBiasedIgnorePathCase.isEqual(primary, location)) {
			return undefined;
		}
		const locationGitFile = joinPath(await this._real(location), '.git');

		// The folder's `.git` file names an entry of the primary's worktrees
		const entry = await this._readLink(locationGitFile, dirname(locationGitFile), /^gitdir:\s*(?<path>.+?)\s*$/m);
		if (!entry || !extUriBiasedIgnorePathCase.isEqual(dirname(await this._real(entry)), worktreesDir)) {
			return undefined;
		}
		// ...whose `gitdir` file names the folder's `.git` back
		const backlink = await this._readLink(joinPath(entry, 'gitdir'), entry);
		if (!backlink || !extUriBiasedIgnorePathCase.isEqual(await this._real(backlink), locationGitFile)) {
			return undefined;
		}
		// Its branch, from the entry's HEAD: read again each time the location is resolved, such as on each switch to it
		const head = await this._readOrUndefined(async () => (await this._fileService.readFile(joinPath(entry, 'HEAD'))).value.toString());
		return { uri: location, label: basename(location), description: head !== undefined ? parseGitHead(head) : undefined, icon: SESSION_WORKTREE_ICON };
	}

	/** The path a link file names, absolute and normalized: its content, or the `pattern`'s `path` group of it, relative to `base`. */
	private async _readLink(file: URI, base: URI, pattern?: RegExp): Promise<URI | undefined> {
		const content = await this._readOrUndefined(async () => (await this._fileService.readFile(file)).value.toString());
		const path = content && (pattern ? pattern.exec(content)?.groups?.path : content.trim());
		if (!path) {
			return undefined;
		}
		return normalizePath(isAbsolute(path) ? URI.file(path) : joinPath(base, path));
	}

	/** `resource` with its symbolic links resolved, or itself where it is not there. */
	private async _real(resource: URI): Promise<URI> {
		return normalizePath(await this._readOrUndefined(() => this._fileService.realpath(resource)) ?? resource);
	}

	/**
	 * The result of `read`, or `undefined` where what it reads is not there or is a folder, such as the `.git` folder of
	 * an ordinary checkout, which links nowhere; any other failure throws.
	 */
	private async _readOrUndefined<T>(read: () => Promise<T>): Promise<T | undefined> {
		try {
			return await read();
		} catch (error) {
			if (isFileNotFound(error) || isFileIsDirectory(error)) {
				return undefined;
			}
			throw error;
		}
	}
}

/** The branch a git HEAD names (`ref: refs/heads/<branch>`), the short commit of a detached one, or `undefined`. */
export function parseGitHead(head: string): string | undefined {
	const content = head.trim();
	const branch = /^ref:\s*refs\/heads\/(?<branch>.+)$/.exec(content)?.groups?.branch;
	if (branch) {
		return branch;
	}
	return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(content) ? content.slice(0, 7) : undefined;
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND;
}

function isFileIsDirectory(error: unknown): boolean {
	return error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_IS_DIRECTORY;
}

export type AgentsViewFolderLocationDirection = 'toAlternate' | 'toPrimary';
export type AgentsViewFolderLocationOutcome = 'switched' | 'missing' | 'failed' | 'superseded';

type AgentsViewFolderLocationSwitchEvent = {
	direction: AgentsViewFolderLocationDirection;
	outcome: AgentsViewFolderLocationOutcome;
};

type AgentsViewFolderLocationSwitchClassification = {
	direction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the folder moved to an alternate location of the window\'s folder or back to its primary location.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the switch happened, its folder no longer exists, it failed, or a later switch replaced it.' };
	owner: 'sandy081';
	comment: 'Tracks how opening a session in an editor window with the Sessions view moves the window\'s folder to where the session works.';
};

export const IAgentsViewFolderLocationService = createDecorator<IAgentsViewFolderLocationService>('agentsViewFolderLocationService');

/**
 * Moves the folder of an editor window with the Sessions view to where an opened session works: an alternate location
 * of the folder, such as a linked checkout, or back to its primary location.
 */
export interface IAgentsViewFolderLocationService {
	readonly _serviceBrand: undefined;

	/** Starts offering the folder's locations while AI features are enabled, and marking terminals the folder moved away from. */
	start(): void;

	/**
	 * Moves the window's folder to the location `session` works in, when that is the folder's primary location or one
	 * of its alternate locations. Does nothing for a session working elsewhere, in a remote, web or multi-root window,
	 * or with AI features disabled. A later call supersedes an earlier one that has not switched yet, also one that keeps the folder where it is.
	 *
	 * An `automatic` call, one the user did not ask for now (such as following a session into the worktree its agent
	 * created), supersedes nothing: it does nothing while another switch, of this service or of the workspace, is under
	 * way, and it never asks the workspace only to keep the folder where it is.
	 */
	switchToSession(session: ISession, options?: { readonly automatic?: boolean }): Promise<void>;

	/** The session the user last picked while the folder was at `location`, its primary location or an alternate one. */
	getLastSession(location: URI): URI | undefined;

	/** Marks `location` as just used, so its last session is the last to be forgotten among too many locations. */
	touchLocation(location: URI): void;
}

const FOLDER_LOCATION_TERMINAL_STATUS_ID = 'agentsView.folderLocation';
const CHAT_ENABLED_KEYS = new Set([ChatContextKeys.enabled.key]);
/** The last session the user picked at each location of the window's folder, in the storage of its workspace, which is the primary's. */
const LAST_SESSIONS_STORAGE_KEY = 'agentsView.folderLocation.lastSessions';
const LAST_SESSIONS_LIMIT = 20;

export class AgentsViewFolderLocationService extends Disposable implements IAgentsViewFolderLocationService {

	declare readonly _serviceBrand: undefined;

	private _started = false;
	private _request = 0;
	/** How many moves it asked the workspace for that have not completed yet. */
	private _pendingMoves = 0;
	/** The switches of this service under way, from their request to the workspace's answer. */
	private _switching = 0;
	/**
	 * Changes as the folder moves or the window's folders change, and as the user asks this service for a switch: an
	 * automatic switch that started before does not apply, also when that switch already completed.
	 */
	private _foreground = 0;
	private readonly _provider: AgentsViewFolderLocationProvider;
	/** Its provider, registered while AI features are enabled. */
	private readonly _providerRegistration = this._register(new MutableDisposable());
	/** The session the user last picked at each location of the folder, most recent last; see {@link getLastSession}. */
	private readonly _lastSessions: ResourceMap<URI>;
	/** The locations the folder has been at in this window, whose terminals started there are marked once it moves. */
	private readonly _visitedLocations: URI[] = [];
	/** The working directories that are no alternate location of the folder, until its folders change: opening their sessions reads nothing. */
	private readonly _notLocations = new ResourceSet(uri => extUriBiasedIgnorePathCase.getComparisonKey(uri));

	constructor(
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceEditingService private readonly _workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._lastSessions = this._readLastSessions();
		this._provider = instantiationService.createInstance(AgentsViewFolderLocationProvider);
	}

	start(): void {
		if (this._started) {
			return;
		}
		this._started = true;
		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(CHAT_ENABLED_KEYS)) {
				this._updateForChatEnablement();
			}
		}));
		this._updateForChatEnablement();

		// A deleted session is no location's last one. One that a provider replaces is removed only after it was replaced, below
		this._register(this._sessionsManagementService.onDidChangeSession(changes => {
			let changed = false;
			for (const { session: removed } of changes.filter(change => change.kind === 'removed')) {
				for (const [location, resource] of this._lastSessions) {
					if (extUriBiasedIgnorePathCase.isEqual(resource, removed.resource)) {
						this._lastSessions.delete(location);
						changed = true;
					}
				}
			}
			if (changed) {
				this._storeLastSessions();
			}
		}));
		// A session that a provider replaced, such as a draft that graduated or one bound to a new resource, stays the last one
		this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			let changed = false;
			for (const [location, resource] of this._lastSessions) {
				if (extUriBiasedIgnorePathCase.isEqual(resource, from.resource)) {
					this._lastSessions.set(location, to.resource);
					changed = true;
				}
			}
			if (changed) {
				this._storeLastSessions();
			}
		}));

		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._foreground++;
			this._notLocations.clear();
			this._markTerminals();
		}));
		this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._foreground++));
		this._register(this._folderLocationService.onDidChangeLocation(() => this._foreground++));
		this._register(this._terminalService.onDidCreateInstance(instance => this._markTerminal(instance)));
		this._markTerminals();
	}

	async switchToSession(session: ISession, options?: { readonly automatic?: boolean }): Promise<void> {
		const automatic = !!options?.automatic;
		if (automatic && this._switching > 0) {
			return;
		}
		if (!automatic) {
			this._foreground++;
		}
		this._switching++;
		// Its callers do not wait for it: what fails here is reported here
		try {
			await this._switchToSession(session, automatic ? this._foreground : undefined);
		} catch (error) {
			this._logService.error('[agentsView] could not move the folder to the location of a session', error);
			this._notificationService.error(localize('agentsViewFolderLocation.error', "Could not move the folder to the location of the session: {0}", toErrorMessage(error)));
		} finally {
			this._switching--;
		}
	}

	/** @param foreground of an automatic switch, the {@link _foreground} it started at. */
	private async _switchToSession(session: ISession, foreground: number | undefined): Promise<void> {
		const request = ++this._request;
		const folder = this._supportedFolder();
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!folder || !primary) {
			return;
		}
		const current = this._folderLocationService.isAtAlternateLocation(folder) ? folder.uri : undefined;
		const sessionFolder = getSessionPresentationWorkspace(session, undefined)?.folders[0];
		const workingDirectory = sessionFolder?.workingDirectory;

		// Every decision goes to the workspace, also one that keeps the folder where it is: its latest request is the one
		// that applies, so an earlier move still under way does not apply after it
		if (!workingDirectory || workingDirectory.scheme !== Schemas.file || extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, folder.uri)) {
			return this._move(request, foreground, session, primary, current, undefined);
		}
		if (extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, primary)) {
			return this._move(request, foreground, session, primary, undefined, 'toPrimary');
		}

		if (this._notLocations.has(workingDirectory)) {
			return this._move(request, foreground, session, primary, current, undefined);
		}
		let location: IFolderLocation | undefined;
		try {
			if (!await this._exists(workingDirectory)) {
				if (request === this._request && sessionFolder?.gitRepository && extUriBiasedIgnorePathCase.isEqual(sessionFolder.gitRepository.uri, primary)) {
					this._notificationService.info(localize('agentsViewFolderLocation.missing', "The folder {0} of this session no longer exists.", this._labelService.getUriLabel(workingDirectory, { noPrefix: true })));
					this._log('toAlternate', 'missing');
				}
				return this._move(request, foreground, session, primary, current, undefined);
			}
			location = await this._provider.resolveLocation(primary, workingDirectory, CancellationToken.None);
			if (!location) {
				// Only what reads as no location is remembered: a failed read is tried again next time
				this._notLocations.add(workingDirectory);
			}
		} catch (error) {
			// Not knowing where the session works is not the same as it working elsewhere
			this._logService.error('[agentsView] could not read where a session works', error);
			if (request === this._request) {
				this._notificationService.error(localize('agentsViewFolderLocation.readError', "Could not move the folder to {0}: {1}", this._labelService.getUriLabel(workingDirectory, { noPrefix: true }), toErrorMessage(error)));
				this._log('toAlternate', 'failed');
			}
			return this._move(request, foreground, session, primary, current, undefined);
		}
		// A session that works elsewhere opens in place
		return this._move(request, foreground, session, primary, location?.uri ?? current, location ? 'toAlternate' : undefined);
	}

	/**
	 * Asks the workspace to move its folder to `location` of `primary`, or to keep it at `location` when that is where it
	 * is (`direction` undefined), unless a later request of its own came meanwhile.
	 */
	private async _move(request: number, foreground: number | undefined, session: ISession, primary: URI, location: URI | undefined, direction: AgentsViewFolderLocationDirection | undefined): Promise<void> {
		const automatic = foreground !== undefined;
		// Read again right before the move: AI features may have been disabled meanwhile, which also supersedes the request
		if (request !== this._request || !this._isChatEnabled()) {
			if (direction) {
				this._log(direction, 'superseded');
			}
			return;
		}
		const target = location ?? primary;
		if (automatic && !direction) {
			// Keeping the folder where it is needs the workspace only to supersede a switch of the user's under way, which an automatic one must not
			this._rememberSession(target, session.resource);
			return;
		}
		if (automatic && foreground !== this._foreground) {
			// The folder moved, or the user asked for a switch, while it read where the session works: that one stays
			if (direction) {
				this._log(direction, 'superseded');
			}
			return;
		}
		if (!automatic) {
			// The session the user picked is the last one of the location the folder is to be at
			this._rememberSession(target, session.resource);
		}
		this._pendingMoves++;
		try {
			// An automatic move gives way to a switch already under way in the workspace, such as one the user picked in the window's title
			await this._workspaceEditingService.setFolderLocation(target, automatic ? { ifIdle: true } : undefined);
			const applied = request === this._request && (!automatic || this._isAt(primary, target));
			if (automatic && applied) {
				this._rememberSession(target, session.resource);
			}
			if (direction) {
				this._log(direction, applied ? 'switched' : 'superseded');
			}
		} catch (error) {
			this._logService.error('[agentsView] could not move the folder to the location of a session', error);
			if (direction) {
				this._log(direction, 'failed');
			}
		} finally {
			this._pendingMoves--;
		}
	}

	/** Whether the window's folder, still the one of `primary` and still movable, is at `location`. */
	private _isAt(primary: URI, location: URI): boolean {
		const workspace = this._workspaceContextService.getWorkspace();
		const folder = workspace.folders.length === 1 ? workspace.folders[0] : undefined;
		return !!folder && !!workspace.uri && extUriBiasedIgnorePathCase.isEqual(workspace.uri, primary)
			&& this._folderLocationService.canSetLocation(folder) && extUriBiasedIgnorePathCase.isEqual(folder.uri, location);
	}

	/** The window's folder, when its location can be set (see `IWorkspaceFolderLocationService.canSetLocation`) and AI features are enabled. */
	private _supportedFolder(): IWorkspaceFolder | undefined {
		if (!this._started || !this._isChatEnabled()) {
			return undefined;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return folder && this._folderLocationService.canSetLocation(folder) ? folder : undefined;
	}

	private _isChatEnabled(): boolean {
		return !!this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key);
	}

	/**
	 * Offers its locations only while AI features are enabled. As they are disabled, a move it asked for and that is still
	 * under way does not apply, and the folder returns from a location that a session moved it to.
	 */
	private _updateForChatEnablement(): void {
		if (this._isChatEnabled()) {
			if (!this._providerRegistration.value) {
				this._providerRegistration.value = this._folderLocationService.registerProvider(this._provider, { builtIn: true });
			}
			return;
		}
		this._providerRegistration.clear();
		this._request++;
		const workspace = this._workspaceContextService.getWorkspace();
		const folder = workspace.folders[0];
		const atOwnLocation = !!folder && this._folderLocationService.getLocation(folder)?.providerId === AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID;
		if (!folder || !workspace.uri || !this._folderLocationService.canSetLocation(folder) || (!atOwnLocation && this._pendingMoves === 0)) {
			return;
		}
		// Back to the primary from its own location; else where the folder is, which supersedes its move under way
		const target = atOwnLocation ? workspace.uri : folder.uri;
		this._workspaceEditingService.setFolderLocation(target).then(
			() => { if (atOwnLocation) { this._log('toPrimary', 'switched'); } },
			error => { this._logService.error('[agentsView] could not return the folder to its primary location', error); if (atOwnLocation) { this._log('toPrimary', 'failed'); } });
	}

	private async _exists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.stat(resource);
			return true;
		} catch (error) {
			if (isFileNotFound(error)) {
				return false;
			}
			throw error;
		}
	}

	private _markTerminals(): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (folder && !this._visitedLocations.some(location => extUriBiasedIgnorePathCase.isEqual(location, folder.uri))) {
			this._visitedLocations.push(folder.uri);
		}
		for (const instance of this._terminalService.instances) {
			this._markTerminal(instance);
		}
	}

	/**
	 * Marks a running terminal that started in a location the folder has been at in this window but is no longer at:
	 * it keeps working there, while new terminals start where the folder is now.
	 */
	private _markTerminal(instance: ITerminalInstance): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		const cwd = instance.initialCwd ? URI.file(instance.initialCwd) : undefined;
		const startedAt = cwd && this._visitedLocations.find(location => extUriBiasedIgnorePathCase.isEqualOrParent(cwd, location));
		if (folder && cwd && startedAt && !extUriBiasedIgnorePathCase.isEqualOrParent(cwd, folder.uri)) {
			instance.statusList.add({
				id: FOLDER_LOCATION_TERMINAL_STATUS_ID,
				severity: Severity.Info,
				icon: Codicon.folder,
				tooltip: localize('agentsViewFolderLocation.terminal', "Started in {0}, not where the folder is now.", this._labelService.getUriLabel(startedAt, { noPrefix: true })),
			});
		} else {
			instance.statusList.remove(FOLDER_LOCATION_TERMINAL_STATUS_ID);
		}
	}

	getLastSession(location: URI): URI | undefined {
		return this._lastSessions.get(location);
	}

	touchLocation(location: URI): void {
		const session = this._lastSessions.get(location);
		if (session) {
			this._rememberSession(location, session);
		}
	}

	private _rememberSession(location: URI, session: URI): void {
		const entries = [...this._lastSessions];
		const latest = entries.at(-1);
		if (latest && extUriBiasedIgnorePathCase.isEqual(latest[0], location) && extUriBiasedIgnorePathCase.isEqual(latest[1], session)) {
			return;
		}
		// A session is the last one of the location it works at only: one that came to work elsewhere is not that of where
		// it worked before
		for (const [known, resource] of entries) {
			if (extUriBiasedIgnorePathCase.isEqual(resource, session)) {
				this._lastSessions.delete(known);
			}
		}
		// Most recent last, also when it was the last one there already, so the oldest goes first beyond the bound
		this._lastSessions.delete(location);
		this._lastSessions.set(location, session);
		for (const [oldest] of this._lastSessions) {
			if (this._lastSessions.size <= LAST_SESSIONS_LIMIT) {
				break;
			}
			this._lastSessions.delete(oldest);
		}
		this._storeLastSessions();
	}

	private _readLastSessions(): ResourceMap<URI> {
		const sessions = new ResourceMap<URI>(uri => extUriBiasedIgnorePathCase.getComparisonKey(uri));
		try {
			const stored: unknown = JSON.parse(this._storageService.get(LAST_SESSIONS_STORAGE_KEY, StorageScope.WORKSPACE, '[]'));
			if (Array.isArray(stored)) {
				for (const entry of stored.slice(-LAST_SESSIONS_LIMIT)) {
					if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
						sessions.set(URI.parse(entry[0]), URI.parse(entry[1]));
					}
				}
			}
		} catch {
			// What it stored cannot be read: it starts without
		}
		return sessions;
	}

	private _storeLastSessions(): void {
		const entries = [...this._lastSessions].map(([location, session]) => [location.toString(), session.toString()]);
		if (entries.length) {
			this._storageService.store(LAST_SESSIONS_STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(LAST_SESSIONS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _log(direction: AgentsViewFolderLocationDirection, outcome: AgentsViewFolderLocationOutcome): void {
		this._telemetryService.publicLog2<AgentsViewFolderLocationSwitchEvent, AgentsViewFolderLocationSwitchClassification>('agentsView.folderLocationSwitch', { direction, outcome });
	}
}
