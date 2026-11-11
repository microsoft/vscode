/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { basename, dirname, extUriBiasedIgnorePathCase, isAbsolutePath, joinPath } from '../../../../../base/common/resources.js';
import Severity from '../../../../../base/common/severity.js';
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
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { getSessionPresentationWorkspace, ISession } from '../../../../services/sessions/common/session.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { readFolderGitRepository } from './workspaceFolderRepositories.js';

/** The id of the provider of the alternate locations that the Agents view knows: the linked checkouts of a folder. */
export const AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID = 'agentsView.linkedCheckouts';

/**
 * The alternate locations of a local folder that is a git repository: its linked worktrees. A location is one when its
 * `.git` file names the folder's repository (`gitdir: <folder>/.git/worktrees/<name>`).
 */
export class AgentsViewFolderLocationProvider implements IWorkspaceFolderLocationProvider {

	readonly id = AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	async provideLocations(primary: URI, _token: CancellationToken): Promise<IFolderLocation[]> {
		if (primary.scheme !== Schemas.file) {
			return [];
		}
		let entries: readonly URI[];
		try {
			const worktrees = await this._fileService.resolve(joinPath(primary, '.git', 'worktrees'));
			entries = worktrees.children?.filter(child => child.isDirectory).map(child => child.resource) ?? [];
		} catch {
			return [];
		}
		const locations: IFolderLocation[] = [];
		for (const entry of entries) {
			try {
				// `gitdir` names the worktree's `.git` file
				const gitFile = (await this._fileService.readFile(joinPath(entry, 'gitdir'))).value.toString().trim();
				if (gitFile && isAbsolutePath(URI.file(gitFile))) {
					locations.push(this._toLocation(dirname(URI.file(gitFile))));
				}
			} catch {
				// A worktree whose metadata cannot be read is not offered
			}
		}
		return locations;
	}

	async resolveLocation(primary: URI, location: URI, _token: CancellationToken): Promise<IFolderLocation | undefined> {
		if (primary.scheme !== Schemas.file || location.scheme !== Schemas.file || extUriBiasedIgnorePathCase.isEqual(primary, location)) {
			return undefined;
		}
		let repository: URI | undefined;
		try {
			repository = await readFolderGitRepository(this._fileService, location);
		} catch {
			return undefined;
		}
		return repository && !extUriBiasedIgnorePathCase.isEqual(repository, location) && extUriBiasedIgnorePathCase.isEqual(repository, primary)
			? this._toLocation(location)
			: undefined;
	}

	private _toLocation(uri: URI): IFolderLocation {
		return { uri, label: basename(uri), description: this._labelService.getUriLabel(uri, { noPrefix: true }), icon: Codicon.folder };
	}
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

	/**
	 * Moves the window's folder to the location `session` works in, when that is the folder's primary location or one
	 * of its alternate locations. Does nothing for a session working elsewhere, in a remote, web or multi-root window,
	 * or with AI features disabled. A later call supersedes an earlier one that has not switched yet.
	 */
	switchToSession(session: ISession): Promise<void>;
}

const FOLDER_LOCATION_TERMINAL_STATUS_ID = 'agentsView.folderLocation';

export class AgentsViewFolderLocationService extends Disposable implements IAgentsViewFolderLocationService {

	declare readonly _serviceBrand: undefined;

	private _request = 0;
	/** The locations the folder has been at in this window, whose terminals started there are marked once it moves. */
	private readonly _visitedLocations: URI[] = [];

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
		this._register(this._folderLocationService.registerProvider(instantiationService.createInstance(AgentsViewFolderLocationProvider), { builtIn: true }));

		// With AI features disabled, the folder returns from a location that a session moved it to
		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([ChatContextKeys.enabled.key]))) {
				this._returnIfChatDisabled();
			}
		}));
		this._returnIfChatDisabled();

		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._markTerminals()));
		this._register(this._terminalService.onDidCreateInstance(instance => this._markTerminal(instance)));
		this._markTerminals();
	}

	async switchToSession(session: ISession): Promise<void> {
		const request = ++this._request;
		const folder = this._supportedFolder();
		const workingDirectory = getSessionPresentationWorkspace(session, undefined)?.folders[0]?.workingDirectory;
		if (!folder || !workingDirectory || workingDirectory.scheme !== Schemas.file || extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, folder.uri)) {
			return;
		}
		const primary = folder.primaryUri ?? folder.uri;
		if (extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, primary)) {
			await this._switch(request, primary, undefined, 'toPrimary');
			return;
		}

		if (!await this._exists(workingDirectory)) {
			const repository = getSessionPresentationWorkspace(session, undefined)?.folders[0]?.gitRepository?.uri;
			if (repository && extUriBiasedIgnorePathCase.isEqual(repository, primary)) {
				this._notificationService.info(localize('agentsViewFolderLocation.missing', "The folder {0} of this session no longer exists.", this._labelService.getUriLabel(workingDirectory, { noPrefix: true })));
				this._log('toAlternate', 'missing');
			}
			return;
		}
		const location = await this._folderLocationService.resolveLocation(primary, workingDirectory, CancellationToken.None);
		if (!location) {
			return; // The session works elsewhere: its chat opens in place
		}
		await this._switch(request, primary, location.uri, 'toAlternate');
	}

	private async _switch(request: number, primary: URI, location: URI | undefined, direction: AgentsViewFolderLocationDirection): Promise<void> {
		if (request !== this._request) {
			this._log(direction, 'superseded');
			return;
		}
		try {
			await this._workspaceEditingService.setFolderLocation(primary, location);
			this._log(direction, request === this._request ? 'switched' : 'superseded');
		} catch (error) {
			this._logService.error('[agentsView] could not move the folder to the location of a session', error);
			this._log(direction, 'failed');
		}
	}

	/** The window's only folder, when the folder can move: a local, desktop, single-folder window with AI features enabled. */
	private _supportedFolder() {
		if (isWeb || this._environmentService.remoteAuthority || this._workspaceContextService.getWorkbenchState() !== WorkbenchState.FOLDER || !this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key)) {
			return undefined;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return folder?.uri.scheme === Schemas.file ? folder : undefined;
	}

	private _returnIfChatDisabled(): void {
		if (this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key) || this._folderLocationService.currentLocation?.providerId !== AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID) {
			return;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (folder?.primaryUri) {
			this._request++;
			this._workspaceEditingService.setFolderLocation(folder.primaryUri, undefined).then(
				() => this._log('toPrimary', 'switched'),
				error => { this._logService.error('[agentsView] could not return the folder to its primary location', error); this._log('toPrimary', 'failed'); });
		}
	}

	private async _exists(resource: URI): Promise<boolean> {
		try {
			await this._fileService.stat(resource);
			return true;
		} catch (error) {
			// Only a folder that is not there is missing; other failures leave it to the switch to report
			return !(error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND);
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
