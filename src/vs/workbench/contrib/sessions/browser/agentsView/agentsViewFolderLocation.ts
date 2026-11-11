/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { basename, dirname, extUriBiasedIgnorePathCase, joinPath, normalizePath } from '../../../../../base/common/resources.js';
import Severity from '../../../../../base/common/severity.js';
import { ResourceSet } from '../../../../../base/common/map.js';
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
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
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
 * into the primary's worktrees is not one. A folder or link that is not there resolves to nothing; failing to read one
 * throws.
 */
export class AgentsViewFolderLocationProvider implements IWorkspaceFolderLocationProvider {

	readonly id = AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	async provideLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]> {
		if (primary.scheme !== Schemas.file) {
			return [];
		}
		const entries = await this._readOrUndefined(() => this._fileService.resolve(joinPath(primary, '.git', 'worktrees')));
		const locations: IFolderLocation[] = [];
		for (const entry of entries?.children ?? []) {
			const gitFile = entry.isDirectory ? await this._readLink(joinPath(entry.resource, 'gitdir'), entry.resource) : undefined;
			const location = gitFile && basename(gitFile) === '.git' ? await this.resolveLocation(primary, dirname(gitFile), token) : undefined;
			if (location) {
				locations.push(location);
			}
		}
		return locations;
	}

	async resolveLocation(primary: URI, location: URI, _token: CancellationToken): Promise<IFolderLocation | undefined> {
		if (primary.scheme !== Schemas.file || location.scheme !== Schemas.file || extUriBiasedIgnorePathCase.isEqual(primary, location)) {
			return undefined;
		}
		const worktreesDir = joinPath(await this._real(primary), '.git', 'worktrees');
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
		return { uri: location, label: basename(location), description: this._labelService.getUriLabel(location, { noPrefix: true }), icon: Codicon.folder };
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

	/** The result of `read`, or `undefined` where what it reads is not there; any other failure throws. */
	private async _readOrUndefined<T>(read: () => Promise<T>): Promise<T | undefined> {
		try {
			return await read();
		} catch (error) {
			if (isFileNotFound(error)) {
				return undefined;
			}
			throw error;
		}
	}
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND;
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
	 */
	switchToSession(session: ISession): Promise<void>;
}

const FOLDER_LOCATION_TERMINAL_STATUS_ID = 'agentsView.folderLocation';
const CHAT_ENABLED_KEYS = new Set([ChatContextKeys.enabled.key]);

export class AgentsViewFolderLocationService extends Disposable implements IAgentsViewFolderLocationService {

	declare readonly _serviceBrand: undefined;

	private _started = false;
	private _request = 0;
	/** How many moves it asked the workspace for that have not completed yet. */
	private _pendingMoves = 0;
	private readonly _provider: AgentsViewFolderLocationProvider;
	/** Its provider, registered while AI features are enabled. */
	private readonly _providerRegistration = this._register(new MutableDisposable());
	/** The locations the folder has been at in this window, whose terminals started there are marked once it moves. */
	private readonly _visitedLocations: URI[] = [];
	/** The working directories that are no alternate location of the folder, until its folders change: opening their sessions reads nothing. */
	private readonly _notLocations = new ResourceSet(uri => extUriBiasedIgnorePathCase.getComparisonKey(uri));

	constructor(
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceEditingService private readonly _workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
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

		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._notLocations.clear();
			this._markTerminals();
		}));
		this._register(this._terminalService.onDidCreateInstance(instance => this._markTerminal(instance)));
		this._markTerminals();
	}

	async switchToSession(session: ISession): Promise<void> {
		const request = ++this._request;
		const folder = this._supportedFolder();
		if (!folder) {
			return;
		}
		const primary = folder.primaryUri ?? folder.uri;
		const current = folder.primaryUri ? folder.uri : undefined;
		const sessionFolder = getSessionPresentationWorkspace(session, undefined)?.folders[0];
		const workingDirectory = sessionFolder?.workingDirectory;

		// Every decision goes to the workspace, also one that keeps the folder where it is: its latest request is the one
		// that applies, so an earlier move still under way does not apply after it
		if (!workingDirectory || workingDirectory.scheme !== Schemas.file || extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, folder.uri)) {
			return this._move(request, primary, current, undefined);
		}
		if (extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, primary)) {
			return this._move(request, primary, undefined, 'toPrimary');
		}

		if (this._notLocations.has(workingDirectory)) {
			return this._move(request, primary, current, undefined);
		}
		let location: IFolderLocation | undefined;
		try {
			if (!await this._exists(workingDirectory)) {
				if (request === this._request && sessionFolder?.gitRepository && extUriBiasedIgnorePathCase.isEqual(sessionFolder.gitRepository.uri, primary)) {
					this._notificationService.info(localize('agentsViewFolderLocation.missing', "The folder {0} of this session no longer exists.", this._labelService.getUriLabel(workingDirectory, { noPrefix: true })));
					this._log('toAlternate', 'missing');
				}
				return this._move(request, primary, current, undefined);
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
			return this._move(request, primary, current, undefined);
		}
		// A session that works elsewhere opens in place
		return this._move(request, primary, location?.uri ?? current, location ? 'toAlternate' : undefined);
	}

	/**
	 * Asks the workspace to move its folder to `location` of `primary`, or to keep it at `location` when that is where it
	 * is (`direction` undefined), unless a later request of its own came meanwhile.
	 */
	private async _move(request: number, primary: URI, location: URI | undefined, direction: AgentsViewFolderLocationDirection | undefined): Promise<void> {
		if (request !== this._request) {
			if (direction) {
				this._log(direction, 'superseded');
			}
			return;
		}
		this._pendingMoves++;
		try {
			await this._workspaceEditingService.setFolderLocation(primary, location);
			if (direction) {
				this._log(direction, request === this._request ? 'switched' : 'superseded');
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

	/** The window's only folder, when the folder can move: a local, desktop, single-folder window with AI features enabled. */
	private _supportedFolder(): IWorkspaceFolder | undefined {
		if (!this._started || isWeb || this._environmentService.remoteAuthority || this._workspaceContextService.getWorkbenchState() !== WorkbenchState.FOLDER || !this._isChatEnabled()) {
			return undefined;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return folder?.uri.scheme === Schemas.file ? folder : undefined;
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
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		const atOwnLocation = this._folderLocationService.currentLocation?.providerId === AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID;
		if (!folder || this._workspaceContextService.getWorkbenchState() !== WorkbenchState.FOLDER || (!atOwnLocation && this._pendingMoves === 0)) {
			return;
		}
		const primary = folder.primaryUri ?? folder.uri;
		// Back to the primary from its own location; else where the folder is, which supersedes its move under way
		const target = atOwnLocation || !folder.primaryUri ? undefined : folder.uri;
		this._workspaceEditingService.setFolderLocation(primary, target).then(
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

	private _log(direction: AgentsViewFolderLocationDirection, outcome: AgentsViewFolderLocationOutcome): void {
		this._telemetryService.publicLog2<AgentsViewFolderLocationSwitchEvent, AgentsViewFolderLocationSwitchClassification>('agentsView.folderLocationSwitch', { direction, outcome });
	}
}
