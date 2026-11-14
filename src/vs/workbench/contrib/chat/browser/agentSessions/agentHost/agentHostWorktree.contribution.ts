/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { dirname, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import Severity from '../../../../../../base/common/severity.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatSessionsService, isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { isUntitledChatSession, LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewHostService } from '../../chatViewHost.js';
import { IAgentHostWorktreeSessionSources } from './agentHostWorktreeSessionSources.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID, AgentHostWorktreeLocationProvider } from './agentHostWorktreeLocations.js';

type WorktreeFolderSwitchDirection = 'toAlternate' | 'toPrimary';

/** The chat shown, the working directory it was last known to work in, and whether it follows once that is first known. */
interface IShownChat {
	readonly resource: URI;
	workingDirectory: URI | undefined;
	/** A chat that the user opened follows as its working directory first becomes known; one that the view restored does not. */
	readonly followOnceKnown: boolean;
}
type WorktreeFolderSwitchOutcome = 'switched' | 'missing' | 'failed' | 'superseded';

type WorktreeFolderSwitchEvent = {
	direction: WorktreeFolderSwitchDirection;
	outcome: WorktreeFolderSwitchOutcome;
	automatic: boolean;
};

type WorktreeFolderSwitchClassification = {
	direction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the folder moved to a worktree of the window\'s folder or back to its own location.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the switch happened, its folder no longer exists, it failed, or a later switch replaced it.' };
	automatic: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the switch followed a chat on its own, such as into the worktree its agent created, rather than a chat the user opened.' };
	owner: 'sandy081';
	comment: 'Tracks how the folder of an editor window follows the chats that work in its worktrees.';
};

const FOLDER_LOCATION_TERMINAL_STATUS_ID = 'editorWindow.worktree.folderLocation';
const CHAT_ENABLED_KEYS = new Set([ChatContextKeys.enabled.key]);
/** The last chat the user opened at each location of the window's folder, in the storage of its workspace, which is the primary's. */
const LAST_SESSIONS_STORAGE_KEY = 'editorWindow.worktree.lastSessions';
const LAST_SESSIONS_LIMIT = 20;

/**
 * Worktree support in an editor window with a single local folder, while `chat.editorWindow.enableWorktree` and AI features
 * are on: the worktrees that the local agent host's sessions work in are locations of the folder, and the folder follows
 * the chat that the host in use shows ({@link IChatViewHostService.shownSession}), whichever surface that is.
 *
 * - A chat the user opens moves the folder to where it works: the working directory of a local agent host session, or the
 *   folder's own location for a local chat. It supersedes any switch under way.
 * - A shown session that comes to work elsewhere, such as in the worktree its agent created, or whose working directory
 *   becomes known only after its first request, moves the folder on its own: such an automatic switch gives way to any
 *   other switch, and applies only while the user asked for none since it started.
 * - It remembers the last chat opened at each location, and opens it as the user moves the folder there themselves.
 * - Terminals that started where the folder no longer is are marked.
 * - As the setting or AI features are turned off, the folder returns from a worktree to its own location.
 */
export class AgentHostWorktreeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostWorktree';

	private readonly _provider: AgentHostWorktreeLocationProvider;
	private readonly _providerRegistration = this._register(new MutableDisposable());
	private _enabled = false;

	private _request = 0;
	/** Changes as the folder moves or the window's folders change, and as the user opens a chat: an automatic switch that started before does not apply. */
	private _foreground = 0;
	/** The switches of its own under way, from their request to the workspace's answer. */
	private _switching = 0;
	/** An automatic follow that gave way to a switch under way: it follows once that settles, unless a later choice came. */
	private _followWhenIdle: { readonly shown: IShownChat; readonly request: number } | undefined;
	/** The moves it asked the workspace for that have not completed yet. */
	private _pendingMoves = 0;
	/** Cancels what switches read, such as whether a folder exists, as it is disposed. */
	private readonly _cts = new CancellationTokenSource();
	/** Where it last moved the folder: that move is its own, not the user's. */
	private _ownMove: URI | undefined;
	/** Where it asked the workspace to keep the folder, to supersede a move under way: that is no move of someone else either. */
	private _keepInPlace: URI | undefined;

	private _shown: IShownChat | undefined;
	/** Waits for the shown session's working directory to become known or to change. */
	private readonly _sessionsListener = this._register(new MutableDisposable());

	private readonly _lastSessions: ResourceMap<URI>;
	/** The remembered sessions the sessions list has listed: one that it no longer lists was deleted. */
	private readonly _listedSessions = new ResourceSet();
	/** The locations the folder has been at in this window, whose terminals started there are marked once it moves. */
	private readonly _visitedLocations: URI[] = [];

	constructor(
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IAgentHostWorktreeSessionSources private readonly _sessionSources: IAgentHostWorktreeSessionSources,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceEditingService private readonly _workspaceEditingService: IWorkspaceEditingService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._provider = this._register(instantiationService.createInstance(AgentHostWorktreeLocationProvider));
		this._lastSessions = this._readLastSessions();
		if (environmentService.isSessionsWindow) {
			return;
		}
		// Disposed, no switch under way applies, what it reads is cancelled, and the terminals it marked are not marked
		this._register(toDisposable(() => {
			this._request++;
			this._foreground++;
			this._cts.dispose(true);
			this._supersedePendingMoves();
			this._clearTerminalMarks();
		}));

		this._updateEnablement();
		this._logTrigger();
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EditorWindowEnableWorktree)) {
				this._updateEnablement();
			}
		}));
		this._register(_contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(CHAT_ENABLED_KEYS)) {
				this._updateEnablement();
				this._logTrigger();
			}
		}));

		this._register(autorun(reader => {
			const shown = _chatViewHostService.shownSession.read(reader);
			this._sessionsListener.clear();
			// A chat the user opens follows; so does one that a first request made, on its own, as the user did not pick it
			const follows = shown?.reason === 'open' || shown?.reason === 'commit';
			this._trace(shown ? `shown ${shown.resource.toString()} (${shown.reason})` : 'shown: none');
			this._shown = shown && !isUntitledChatSession(shown.resource) ? { resource: shown.resource, workingDirectory: undefined, followOnceKnown: follows } : undefined;
			if (!shown || shown.reason === 'open') {
				// The user's latest choice: no switch asked for before applies, also where this chat moves nothing
				this._request++;
				this._foreground++;
				this._supersedePendingMoves();
			} else if (shown.reason === 'commit') {
				// No automatic switch of a chat shown before applies, but one that the user asked for does
				this._foreground++;
			}
			if (this._shown?.followOnceKnown) {
				this._follow(this._shown, shown?.reason === 'commit');
			} else if (this._shown) {
				// A restored chat moves nothing, but the folder follows it as it comes to work elsewhere
				this._shown.workingDirectory = this._workingDirectory(this._shown.resource);
				this._watchWorkingDirectory(this._shown);
			}
		}));

		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._foreground++;
			this._markTerminals();
			this._logTrigger();
		}));
		this._register(_workspaceContextService.onDidChangeWorkbenchState(() => {
			this._foreground++;
			this._logTrigger();
		}));
		this._register(_folderLocationService.onDidChangeLocation(e => {
			this._foreground++;
			// Keeping the folder in place supersedes only the earlier move, not a later switch still under way
			const keptInPlace = !!this._keepInPlace && extUriBiasedIgnorePathCase.isEqual(this._keepInPlace, e.folder.uri);
			const own = keptInPlace || (!!this._ownMove && extUriBiasedIgnorePathCase.isEqual(this._ownMove, e.folder.uri));
			if (keptInPlace) {
				this._keepInPlace = undefined;
			} else {
				this._ownMove = undefined;
			}
			if (!own) {
				// Moved by someone else, such as the user in the window's title: no switch asked for before applies
				this._request++;
			}
			// The user moved the folder themselves, such as in the window's title: the last chat opened there shows
			if (!own && e.reason === 'user' && this._enabled) {
				this._openLastSession(e.folder);
			}
		}));
		this._register(_terminalService.onDidCreateInstance(instance => {
			if (this._enabled) {
				this._markTerminal(instance);
			}
		}));
		this._markTerminals();

		// A session that a first request made in place of a new chat stays the last one of its location; a deleted one does not
		this._register(chatSessionsService.onDidCommitSession(({ original, committed }) => this._replaceLastSession(original, committed)));
		this._register(_agentSessionsService.model.onDidChangeSessions(() => this._forgetDeletedSessions()));
	}

	/** The session the user last opened while the folder was at `location`, its own location or a worktree. */
	getLastSession(location: URI): URI | undefined {
		return this._lastSessions.get(location);
	}

	private _isEnabledBySettings(): boolean {
		return !!this._configurationService.getValue<boolean>(ChatConfiguration.EditorWindowEnableWorktree)
			&& !!this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key);
	}

	/**
	 * Offers the worktrees while enabled. As it turns off, a move it asked for that is still under way does not apply, and the
	 * folder returns from a worktree to its own location.
	 */
	private _updateEnablement(): void {
		const enabled = this._isEnabledBySettings();
		if (enabled === this._enabled) {
			return;
		}
		this._enabled = enabled;
		if (enabled) {
			this._providerRegistration.value = this._folderLocationService.registerProvider(this._provider, { builtIn: true });
			this._markTerminals();
			return;
		}
		this._providerRegistration.clear();
		this._request++;
		this._clearTerminalMarks();
		const workspace = this._workspaceContextService.getWorkspace();
		const folder = workspace.folders[0];
		const atWorktree = !!folder && this._folderLocationService.getLocation(folder)?.providerId === AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID;
		if (!folder || !workspace.uri || !this._folderLocationService.canSetLocation(folder) || (!atWorktree && this._pendingMoves === 0)) {
			return;
		}
		// Back to its own location from a worktree; else where the folder is, which supersedes a move under way
		const target = atWorktree ? workspace.uri : folder.uri;
		this._workspaceEditingService.setFolderLocation(target).then(
			() => { if (atWorktree) { this._log('toPrimary', 'switched', true); } },
			error => { this._logService.error('[worktree] could not return the folder to its own location', error); if (atWorktree) { this._log('toPrimary', 'failed', true); } });
	}

	/** The working directory of the local agent host session of `resource`, as the sessions list has it. */
	private _workingDirectory(resource: URI): URI | undefined {
		// A chat of another session layer, such as the editor window's, as a source has it
		const fromSource = this._sessionSources.getWorkingDirectory(resource);
		if (fromSource) {
			return fromSource;
		}
		if (!isLocalAgentHostTarget(resource.scheme)) {
			return undefined;
		}
		const path = this._agentSessionsService.getSession(resource)?.metadata?.workingDirectoryPath;
		return typeof path === 'string' && path ? URI.file(path) : undefined;
	}

	/** Where {@link _workingDirectory} found the working directory of `resource`, for the trace. */
	private _workingDirectorySource(resource: URI): string {
		if (this._sessionSources.getWorkingDirectory(resource)) {
			return 'session layer';
		}
		return isLocalAgentHostTarget(resource.scheme) && this._agentSessionsService.getSession(resource) ? 'Chat view sessions list' : 'none';
	}

	/**
	 * Whether the chat of `resource` may work in a folder that the folder follows: any but a local chat, such as an agent
	 * host session of any session layer, whose working directory may only become known once its first request ran.
	 */
	private _isFollowable(resource: URI): boolean {
		return !LocalChatSessionUri.isLocalSession(resource);
	}

	/** Follows the shown agent host session on its own as its working directory becomes known or changes. */
	private _watchWorkingDirectory(shown: IShownChat): void {
		if (!this._isFollowable(shown.resource)) {
			return;
		}
		this._sessionsListener.value = Event.any(this._agentSessionsService.model.onDidChangeSessions, this._sessionSources.onDidChange)(() => {
			const workingDirectory = this._workingDirectory(shown.resource);
			if (this._shown !== shown || !workingDirectory || extUriBiasedIgnorePathCase.isEqual(workingDirectory, shown.workingDirectory)) {
				return;
			}
			// A restored chat's working directory, first known only as the sessions list loads, is where it works, not a change
			const change = !!shown.workingDirectory || shown.followOnceKnown;
			shown.workingDirectory = workingDirectory;
			if (change) {
				this._follow(shown, true);
			}
		});
	}

	/** Moves the folder to where the shown chat works: on the user's behalf, or on its own (`automatic`). */
	private _follow(shown: IShownChat, automatic: boolean): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!folder || !primary || !this._folderLocationService.canSetLocation(folder)) {
			this._trace(`not followed: no folder that can move (folder ${folder?.uri.toString()}, primary ${primary?.toString()})`);
			return;
		}
		let target: URI | undefined;
		if (LocalChatSessionUri.isLocalSession(shown.resource)) {
			target = primary;
		} else if (this._isFollowable(shown.resource)) {
			shown.workingDirectory = this._workingDirectory(shown.resource);
			this._trace(`working directory of ${shown.resource.toString()}: ${shown.workingDirectory?.toString() ?? 'unknown'} (from ${this._workingDirectorySource(shown.resource)})`);
			// Not listed with its working directory yet, such as a session its first request just started: it follows as it is
			this._watchWorkingDirectory(shown);
			target = shown.workingDirectory;
		}
		if (!target || target.scheme !== Schemas.file || !this._enabled) {
			this._trace(`not followed: ${shown.resource.toString()} ${!this._isFollowable(shown.resource) ? 'is not followable' : !target ? 'has no working directory yet' : target.scheme !== Schemas.file ? `works in ${target.toString()}, not a local folder` : 'worktree support is off'}`);
			return;
		}
		if (automatic && this._switching > 0) {
			this._trace(`follows ${shown.resource.toString()} to ${target.toString()} once the switch under way settles`);
			// Gives way to the switch under way, and follows where the chat works by then once that settles: also where that
			// is where the folder is now, which the switch under way would leave
			this._followWhenIdle = { shown, request: this._request };
			return;
		}
		if (extUriBiasedIgnorePathCase.isEqual(target, folder.uri)) {
			// Where the folder is: the chat is the last one of its location also without a move
			this._trace(`not followed: the folder is at ${target.toString()} already`);
			this._rememberSession(folder.uri, shown.resource);
			return;
		}
		this._trace(`switches for ${shown.resource.toString()} from ${folder.uri.toString()} to ${target.toString()} (primary ${primary.toString()}${automatic ? ', automatic' : ''})`);
		void this._switch(shown.resource, primary, target, automatic ? this._foreground : undefined);
	}

	/**
	 * Logs the setting's experiment trigger, with the setting on and off, once a window with AI features has a folder that can
	 * move: before any surface can differ, such as the chats it follows, the chat's folder chip and the window's Folder
	 * Location picker, which offer the worktrees.
	 */
	private _logTrigger(): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (folder && this._folderLocationService.canSetLocation(folder) && this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key)) {
			logSettingExperimentTrigger(this._telemetryService, ChatConfiguration.EditorWindowEnableWorktree);
		}
	}

	/** @param foreground of an automatic switch, the {@link _foreground} it started at. */
	private async _switch(session: URI, primary: URI, target: URI, foreground: number | undefined): Promise<void> {
		const automatic = foreground !== undefined;
		const request = ++this._request;
		let direction: WorktreeFolderSwitchDirection = 'toPrimary';
		this._switching++;
		try {
			if (!extUriBiasedIgnorePathCase.isEqual(target, primary)) {
				// A worktree, also one inside the folder; else a folder inside the folder's own location works there
				const exists = await this._exists(target);
				const location = exists ? await this._resolveEnclosingLocation(primary, target) : undefined;
				if (this._store.isDisposed) {
					return;
				}
				if (location) {
					this._trace(`${target.toString()} is in the location ${location.uri.toString()} of ${primary.toString()}`);
					direction = 'toAlternate';
					target = location.uri;
				} else if (extUriBiasedIgnorePathCase.isEqualOrParent(target, primary) || (exists && extUriBiasedIgnorePathCase.isEqualOrParent(await this._real(target), await this._real(primary)))) {
					// Also by its real path, such as /private/tmp/repo of the folder /tmp/repo
					target = primary;
				} else {
					this._trace(`not switched: ${target.toString()} ${exists ? `is no location of ${primary.toString()}` : 'does not exist'}`);
					if (!exists) {
						if (request === this._request && !automatic) {
							this._notificationService.info(localize('worktree.missing', "The folder {0} of this chat no longer exists.", this._labelService.getUriLabel(target, { noPrefix: true })));
						}
						this._log('toAlternate', 'missing', automatic);
					}
					// Elsewhere, such as a folder that is no worktree of the folder: the chat opens in place
					return;
				}
			}
			if (this._isAt(target)) {
				// Where the folder is already, such as a chat in a folder inside the worktree it is at
				this._trace(`not switched: the folder is at ${target.toString()} already`);
				if (request === this._request && this._enabled) {
					this._rememberSession(target, session);
				}
				return;
			}
			// Read again right before the move: it may have been turned off, disposed, or a later choice came, meanwhile
			if (request !== this._request || !this._enabled || (automatic && foreground !== this._foreground)) {
				this._log(direction, 'superseded', automatic);
				return;
			}
			if (!automatic) {
				this._rememberSession(target, session);
			}
			this._pendingMoves++;
			this._ownMove = target;
			try {
				// An automatic move gives way to a switch already under way in the workspace, such as one in the window's title
				await this._workspaceEditingService.setFolderLocation(target, automatic ? { ifIdle: true, reason: 'programmatic' } : { reason: 'user' });
			} finally {
				this._pendingMoves--;
			}
			if (this._store.isDisposed) {
				return;
			}
			const applied = request === this._request && this._isAt(target);
			if (!this._isAt(target) && this._ownMove && extUriBiasedIgnorePathCase.isEqual(this._ownMove, target)) {
				// Superseded in the workspace: the next move there is not its own
				this._ownMove = undefined;
			}
			if (automatic && applied) {
				this._rememberSession(target, session);
			}
			this._log(direction, applied ? 'switched' : 'superseded', automatic);
		} catch (error) {
			this._logService.error('[worktree] could not move the folder to where a chat works', error);
			this._log(direction, 'failed', automatic);
			if (!automatic && request === this._request) {
				this._notificationService.error(localize('worktree.error', "Could not move the folder to where the chat works: {0}", toErrorMessage(error)));
			}
		} finally {
			this._switching--;
			const followWhenIdle = this._switching === 0 ? this._followWhenIdle : undefined;
			if (followWhenIdle) {
				this._followWhenIdle = undefined;
				if (followWhenIdle.shown === this._shown && followWhenIdle.request === this._request && !this._store.isDisposed) {
					this._follow(followWhenIdle.shown, true);
				}
			}
		}
	}

	/**
	 * The location of `primary` that `target` is in: `target` itself, or the closest folder it is in, such as the worktree
	 * of a chat that works in a folder inside it. None for a folder in the folder's own location.
	 */
	private async _resolveEnclosingLocation(primary: URI, target: URI): Promise<IResolvedFolderLocation | undefined> {
		for (let candidate = target; !this._cts.token.isCancellationRequested && !extUriBiasedIgnorePathCase.isEqual(candidate, primary); candidate = dirname(candidate)) {
			const location = await this._folderLocationService.resolveLocation(primary, candidate, this._cts.token);
			if (location) {
				return location;
			}
			if (extUriBiasedIgnorePathCase.isEqual(dirname(candidate), candidate)) {
				break;
			}
		}
		return undefined;
	}

	/**
	 * A later choice keeps the folder where it is, or it is disposed: a move it asked for that the workspace still makes
	 * does not apply, as asking for where the folder is supersedes it.
	 */
	private _supersedePendingMoves(): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (this._pendingMoves === 0 || !folder || !this._folderLocationService.canSetLocation(folder)) {
			return;
		}
		const keepInPlace = this._keepInPlace = folder.uri;
		this._workspaceEditingService.setFolderLocation(folder.uri)
			.catch(error => this._logService.error('[worktree] could not keep the folder where it is', error))
			.finally(() => {
				if (this._keepInPlace === keepInPlace) {
					this._keepInPlace = undefined;
				}
			});
	}

	/** `resource` with its symbolic links resolved, or itself where that fails. */
	private async _real(resource: URI): Promise<URI> {
		try {
			return await this._fileService.realpath(resource) ?? resource;
		} catch {
			return resource;
		}
	}

	private _trace(message: string): void {
		this._logService.trace(`[worktree] ${message}`);
	}

	private _isAt(location: URI): boolean {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return !!folder && extUriBiasedIgnorePathCase.isEqual(folder.uri, location);
	}

	private async _exists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.stat(resource);
			return true;
		} catch (error) {
			if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return false;
			}
			throw error;
		}
	}

	private _openLastSession(folder: IWorkspaceFolder): void {
		const last = this.getLastSession(folder.uri);
		if (!last) {
			return;
		}
		// The location the user picked again, and its chat, stay the most recent
		this._rememberSession(folder.uri, last);
		// Shown as restored, so that it keeps the folder where the user moved it, also where it works elsewhere now; the chat
		// shown already is reported as restored without loading it again
		const options = { preserveFocus: true, restore: true };
		const showing = extUriBiasedIgnorePathCase.isEqual(last, this._shown?.resource)
			? this._chatViewHostService.revealIfShowing(last, options)
			: this._chatViewHostService.openSession(last, options);
		showing.catch(error => this._logService.trace('[worktree] could not open the last chat of the folder\'s location', error));
	}

	private _markTerminals(): void {
		if (!this._enabled) {
			return;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (folder && !this._visitedLocations.some(location => extUriBiasedIgnorePathCase.isEqual(location, folder.uri))) {
			this._visitedLocations.push(folder.uri);
		}
		for (const instance of this._terminalService.instances) {
			this._markTerminal(instance);
		}
	}

	/**
	 * Marks a running terminal that started in a location the folder has been at in this window but is no longer at: it
	 * keeps working there, while new terminals start where the folder is now.
	 */
	private _markTerminal(instance: ITerminalInstance): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		const cwd = instance.initialCwd ? URI.file(instance.initialCwd) : undefined;
		// The checkout it started in: the most specific location the folder has been at, or is at, that holds its cwd, such
		// as a worktree inside the folder's own location
		const startedAt = cwd && folder && [...this._visitedLocations, folder.uri]
			.filter(location => extUriBiasedIgnorePathCase.isEqualOrParent(cwd, location))
			.sort((a, b) => b.path.length - a.path.length)[0];
		if (folder && startedAt && !extUriBiasedIgnorePathCase.isEqual(startedAt, folder.uri)) {
			instance.statusList.add({
				id: FOLDER_LOCATION_TERMINAL_STATUS_ID,
				severity: Severity.Info,
				icon: Codicon.folder,
				tooltip: localize('worktree.terminal', "Started in {0}, not where the folder is now.", this._labelService.getUriLabel(startedAt, { noPrefix: true })),
			});
		} else {
			instance.statusList.remove(FOLDER_LOCATION_TERMINAL_STATUS_ID);
		}
	}

	private _clearTerminalMarks(): void {
		this._visitedLocations.length = 0;
		for (const instance of this._terminalService.instances) {
			instance.statusList.remove(FOLDER_LOCATION_TERMINAL_STATUS_ID);
		}
	}

	private _rememberSession(location: URI, session: URI): void {
		const latest = [...this._lastSessions].at(-1);
		if (latest && extUriBiasedIgnorePathCase.isEqual(latest[0], location) && extUriBiasedIgnorePathCase.isEqual(latest[1], session)) {
			return;
		}
		// A chat is the last one of the location it works at only, and the most recent is last, so the oldest goes first
		for (const [known, resource] of [...this._lastSessions]) {
			if (extUriBiasedIgnorePathCase.isEqual(resource, session)) {
				this._lastSessions.delete(known);
			}
		}
		this._lastSessions.delete(location);
		this._lastSessions.set(location, session);
		for (const [oldest] of this._lastSessions) {
			if (this._lastSessions.size <= LAST_SESSIONS_LIMIT) {
				break;
			}
			this._lastSessions.delete(oldest);
		}
		if (this._agentSessionsService.getSession(session)) {
			this._listedSessions.add(session);
		}
		this._storeLastSessions();
	}

	private _replaceLastSession(from: URI, to: URI): void {
		let changed = false;
		for (const [location, resource] of this._lastSessions) {
			if (extUriBiasedIgnorePathCase.isEqual(resource, from)) {
				this._lastSessions.set(location, to);
				changed = true;
			}
		}
		if (changed) {
			this._storeLastSessions();
		}
	}

	/** Forgets a remembered session that the sessions list listed but no longer does. */
	private _forgetDeletedSessions(): void {
		let changed = false;
		for (const [location, resource] of this._lastSessions) {
			if (this._agentSessionsService.getSession(resource)) {
				this._listedSessions.add(resource);
			} else if (this._listedSessions.has(resource)) {
				this._listedSessions.delete(resource);
				this._lastSessions.delete(location);
				changed = true;
			}
		}
		if (changed) {
			this._storeLastSessions();
		}
	}

	private _storeLastSessions(): void {
		// Only the remembered sessions are known to have been listed
		const remembered = [...this._lastSessions.values()];
		for (const resource of [...this._listedSessions]) {
			if (!remembered.some(candidate => extUriBiasedIgnorePathCase.isEqual(candidate, resource))) {
				this._listedSessions.delete(resource);
			}
		}
		const entries = [...this._lastSessions].map(([known, resource]) => [known.toString(), resource.toString()]);
		this._storageService.store(LAST_SESSIONS_STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
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

	private _log(direction: WorktreeFolderSwitchDirection, outcome: WorktreeFolderSwitchOutcome, automatic: boolean): void {
		this._telemetryService.publicLog2<WorktreeFolderSwitchEvent, WorktreeFolderSwitchClassification>('editorWindow.worktreeFolderSwitch', { direction, outcome, automatic });
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatSidebar',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.EditorWindowEnableWorktree]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownDescription: localize('chat.editorWindow.enableWorktree', "Controls whether a window with a single local folder moves that folder to the worktree that the chat you open works in, such as a worktree its agent created, and back to the folder's own location for a local chat."),
		},
	},
});

registerWorkbenchContribution2(AgentHostWorktreeContribution.ID, AgentHostWorktreeContribution, WorkbenchPhase.AfterRestored);
