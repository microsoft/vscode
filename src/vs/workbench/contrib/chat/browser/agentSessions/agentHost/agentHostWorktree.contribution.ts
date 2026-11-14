/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
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
import { IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { isUntitledChatSession, LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewHostService } from '../../chatViewHost.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID, AgentHostWorktreeLocationProvider } from './agentHostWorktreeLocations.js';

type WorktreeFolderSwitchDirection = 'toAlternate' | 'toPrimary';
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
	/** The moves it asked the workspace for that have not completed yet. */
	private _pendingMoves = 0;
	/** Where it last moved the folder: that move is its own, not the user's. */
	private _ownMove: URI | undefined;

	/** The chat shown, and the working directory it was last known to work in. */
	private _shown: { readonly resource: URI; workingDirectory: URI | undefined } | undefined;
	/** Waits for the shown session's working directory to become known or to change. */
	private readonly _sessionsListener = this._register(new MutableDisposable());

	private readonly _lastSessions: ResourceMap<URI>;
	/** The locations the folder has been at in this window, whose terminals started there are marked once it moves. */
	private readonly _visitedLocations: URI[] = [];

	constructor(
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
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
		this._provider = instantiationService.createInstance(AgentHostWorktreeLocationProvider);
		this._lastSessions = this._readLastSessions();
		if (environmentService.isSessionsWindow) {
			return;
		}

		this._updateEnablement();
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EditorWindowEnableWorktree)) {
				this._updateEnablement();
			}
		}));
		this._register(_contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(CHAT_ENABLED_KEYS)) {
				this._updateEnablement();
			}
		}));

		this._register(autorun(reader => {
			const shown = _chatViewHostService.shownSession.read(reader);
			this._sessionsListener.clear();
			this._shown = shown && !isUntitledChatSession(shown.resource) ? { resource: shown.resource, workingDirectory: undefined } : undefined;
			if (this._shown && shown?.reason === 'open') {
				this._foreground++;
				this._follow(this._shown, false);
			} else if (this._shown) {
				// A restored chat moves nothing, but the folder follows it as it comes to work elsewhere
				this._shown.workingDirectory = this._workingDirectory(this._shown.resource);
				this._watchWorkingDirectory(this._shown);
			}
		}));

		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._foreground++;
			this._markTerminals();
		}));
		this._register(_workspaceContextService.onDidChangeWorkbenchState(() => this._foreground++));
		this._register(_folderLocationService.onDidChangeLocation(e => {
			this._foreground++;
			const own = this._ownMove && extUriBiasedIgnorePathCase.isEqual(this._ownMove, e.folder.uri);
			this._ownMove = undefined;
			// The user moved the folder themselves, such as in the window's title: the last chat opened there shows
			if (!own && e.reason === 'user' && this._enabled) {
				this._openLastSession(e.folder);
			}
		}));
		this._register(_terminalService.onDidCreateInstance(instance => this._markTerminal(instance)));
		this._markTerminals();
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
			return;
		}
		this._providerRegistration.clear();
		this._request++;
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
		if (!isLocalAgentHostTarget(resource.scheme)) {
			return undefined;
		}
		const path = this._agentSessionsService.getSession(resource)?.metadata?.workingDirectoryPath;
		return typeof path === 'string' && path ? URI.file(path) : undefined;
	}

	/** Follows the shown agent host session on its own as its working directory becomes known or changes. */
	private _watchWorkingDirectory(shown: { readonly resource: URI; workingDirectory: URI | undefined }): void {
		if (!isLocalAgentHostTarget(shown.resource.scheme)) {
			return;
		}
		this._sessionsListener.value = this._agentSessionsService.model.onDidChangeSessions(() => {
			const workingDirectory = this._workingDirectory(shown.resource);
			if (this._shown === shown && workingDirectory && !extUriBiasedIgnorePathCase.isEqual(workingDirectory, shown.workingDirectory)) {
				shown.workingDirectory = workingDirectory;
				this._follow(shown, true);
			}
		});
	}

	/** Moves the folder to where the shown chat works: on the user's behalf, or on its own (`automatic`). */
	private _follow(shown: { readonly resource: URI; workingDirectory: URI | undefined }, automatic: boolean): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!folder || !primary || !this._folderLocationService.canSetLocation(folder)) {
			return;
		}
		let target: URI | undefined;
		if (LocalChatSessionUri.isLocalSession(shown.resource)) {
			target = primary;
		} else if (isLocalAgentHostTarget(shown.resource.scheme)) {
			shown.workingDirectory = this._workingDirectory(shown.resource);
			// Not listed with its working directory yet, such as a session its first request just started: it follows as it is
			this._watchWorkingDirectory(shown);
			target = shown.workingDirectory;
		}
		if (!target || target.scheme !== Schemas.file || extUriBiasedIgnorePathCase.isEqualOrParent(target, folder.uri)) {
			return;
		}
		// The folder would move here: the same moment with the setting on and off
		logSettingExperimentTrigger(this._telemetryService, ChatConfiguration.EditorWindowEnableWorktree);
		if (!this._enabled || (automatic && this._switching > 0)) {
			return;
		}
		void this._switch(shown.resource, primary, target, automatic ? this._foreground : undefined);
	}

	/** @param foreground of an automatic switch, the {@link _foreground} it started at. */
	private async _switch(session: URI, primary: URI, target: URI, foreground: number | undefined): Promise<void> {
		const automatic = foreground !== undefined;
		const request = ++this._request;
		const direction: WorktreeFolderSwitchDirection = extUriBiasedIgnorePathCase.isEqual(target, primary) ? 'toPrimary' : 'toAlternate';
		this._switching++;
		try {
			if (direction === 'toAlternate') {
				if (!await this._exists(target)) {
					if (request === this._request && !automatic) {
						this._notificationService.info(localize('worktree.missing', "The folder {0} of this chat no longer exists.", this._labelService.getUriLabel(target, { noPrefix: true })));
					}
					this._log(direction, 'missing', automatic);
					return;
				}
				if (!await this._folderLocationService.resolveLocation(primary, target, CancellationToken.None)) {
					// A working directory that is no worktree of the folder: the chat opens in place
					return;
				}
			}
			// Read again right before the move: it may have been turned off, or a later request came, meanwhile
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
			const applied = request === this._request && this._isAt(target);
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
		}
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
		if (last && !extUriBiasedIgnorePathCase.isEqual(last, this._shown?.resource)) {
			this._chatViewHostService.openSession(last, { preserveFocus: true }).catch(error => this._logService.trace('[worktree] could not open the last chat of the folder\'s location', error));
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
	 * Marks a running terminal that started in a location the folder has been at in this window but is no longer at: it
	 * keeps working there, while new terminals start where the folder is now.
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
				tooltip: localize('worktree.terminal', "Started in {0}, not where the folder is now.", this._labelService.getUriLabel(startedAt, { noPrefix: true })),
			});
		} else {
			instance.statusList.remove(FOLDER_LOCATION_TERMINAL_STATUS_ID);
		}
	}

	private _rememberSession(location: URI, session: URI): void {
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
